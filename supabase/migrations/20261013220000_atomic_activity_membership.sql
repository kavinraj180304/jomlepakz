-- Atomic self-service admission/withdrawal. No client participant-table grants.
BEGIN;
CREATE FUNCTION private.membership_current(p_activity_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.activity_participants
    WHERE activity_id = p_activity_id AND user_id = private.discovery_actor() AND status IN ('joined', 'pending'));
$function$;
CREATE FUNCTION private.membership_admissible(p_activity_id uuid, p_user_id uuid, p_status text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT p_user_id = private.discovery_actor() AND EXISTS (SELECT 1 FROM public.activities a
    WHERE a.id = p_activity_id AND a.host_id <> p_user_id AND a.status = 'scheduled'
      AND a.visibility_status = 'visible' AND a.starts_at > clock_timestamp()
      AND private.notification_profile_eligible(a.host_id)
      AND private.discovery_can_read(a.id, a.host_id, a.status, a.visibility_status, a.starts_at)
      AND ((p_status = 'pending' AND a.join_mode = 'approval') OR (p_status = 'joined' AND a.join_mode = 'instant'
        AND a.capacity > 1 + (SELECT count(*) FROM public.activity_participants p WHERE p.activity_id = a.id AND p.status = 'joined'))));
$function$;
ALTER FUNCTION private.membership_current(uuid) OWNER TO postgres;
ALTER FUNCTION private.membership_admissible(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.membership_current(uuid), private.membership_admissible(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE ROLE jomlepakz_membership_api NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_membership_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.discovery_can_read(uuid, uuid, text, text, timestamptz),
  private.notification_profile_eligible(uuid), private.membership_current(uuid), private.membership_admissible(uuid, uuid, text) TO jomlepakz_membership_api;
GRANT SELECT (id, host_id, status, visibility_status, starts_at, ends_at, capacity, join_mode) ON public.activities TO jomlepakz_membership_api;
-- Lock privilege only; the false WITH CHECK below forbids actual activity changes.
GRANT UPDATE (id) ON public.activities TO jomlepakz_membership_api;
GRANT SELECT (activity_id, user_id, status) ON public.activity_participants TO jomlepakz_membership_api;
GRANT INSERT (activity_id, user_id, status, requested_at, joined_at, status_changed_at, last_read_at),
  UPDATE (status, requested_at, joined_at, status_changed_at, decided_at, decided_by, last_read_at) ON public.activity_participants TO jomlepakz_membership_api;
CREATE POLICY membership_activity_read ON public.activities FOR SELECT TO jomlepakz_membership_api USING
  (private.discovery_can_read(id, host_id, status, visibility_status, starts_at) OR private.membership_current(id));
-- SELECT FOR UPDATE also needs an applicable UPDATE policy. Own membership RPCs alone can invoke it.
CREATE POLICY membership_activity_lock ON public.activities FOR UPDATE TO jomlepakz_membership_api USING
  (private.discovery_can_read(id, host_id, status, visibility_status, starts_at) OR private.membership_current(id)) WITH CHECK (false);
CREATE POLICY membership_roster_read ON public.activity_participants FOR SELECT TO jomlepakz_membership_api USING
  (user_id = private.discovery_actor() OR EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY membership_self_insert ON public.activity_participants FOR INSERT TO jomlepakz_membership_api
  WITH CHECK (private.membership_admissible(activity_id, user_id, status));
CREATE POLICY membership_self_update ON public.activity_participants FOR UPDATE TO jomlepakz_membership_api
  USING (user_id = private.discovery_actor() AND status IN ('left', 'joined', 'pending'))
  WITH CHECK (user_id = private.discovery_actor() AND (status = 'left' OR private.membership_admissible(activity_id, user_id, status)));

CREATE FUNCTION public.jomlepakz_activity_membership(p_activity_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor(); target record; own_status text := 'none'; available text; admission boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, visibility_status, starts_at, ends_at, capacity, join_mode INTO target FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('activityId', p_activity_id, 'status', 'none', 'availability', 'unavailable', 'requiresApproval', false, 'canJoin', false, 'canLeave', false); END IF;
  SELECT status INTO own_status FROM public.activity_participants WHERE activity_id = p_activity_id AND user_id = actor;
  own_status := coalesce(own_status, 'none');
  admission := private.membership_admissible(p_activity_id, actor, CASE WHEN target.join_mode = 'approval' THEN 'pending' ELSE 'joined' END);
  available := CASE WHEN target.host_id = actor THEN 'host'
    WHEN target.status <> 'scheduled' OR target.starts_at <= statement_timestamp() THEN 'closed'
    WHEN target.visibility_status <> 'visible' OR NOT private.notification_profile_eligible(target.host_id)
      OR NOT private.discovery_can_read(target.id, target.host_id, target.status, target.visibility_status, target.starts_at) THEN 'unavailable'
    WHEN NOT admission THEN 'full' ELSE 'open' END;
  RETURN jsonb_build_object('activityId', p_activity_id, 'status', own_status, 'availability', available,
    'requiresApproval', target.join_mode = 'approval', 'canJoin', admission AND own_status IN ('none', 'left'),
    'canLeave', own_status IN ('joined', 'pending') AND target.status = 'scheduled' AND target.ends_at > statement_timestamp());
END;
$function$;

CREATE FUNCTION public.jomlepakz_join_activity(p_activity_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; own_status text; new_status text; admitted_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL OR p_activity_id IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, visibility_status, starts_at, join_mode INTO target FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND OR target.host_id = actor OR NOT private.notification_profile_eligible(target.host_id)
    OR NOT private.discovery_can_read(target.id, target.host_id, target.status, target.visibility_status, target.starts_at) THEN
    RAISE EXCEPTION 'Joining denied' USING ERRCODE = '42501'; END IF;
  IF target.status <> 'scheduled' OR target.visibility_status <> 'visible' OR target.starts_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Joining closed' USING ERRCODE = 'P0001'; END IF;
  SELECT status INTO own_status FROM public.activity_participants WHERE activity_id = p_activity_id AND user_id = actor;
  IF own_status IN ('joined', 'pending') THEN RETURN jsonb_build_object('activityId', p_activity_id, 'status', own_status); END IF;
  IF own_status IN ('declined', 'removed') THEN RAISE EXCEPTION 'Rejoining denied' USING ERRCODE = '42501'; END IF;
  new_status := CASE WHEN target.join_mode = 'approval' THEN 'pending' ELSE 'joined' END;
  IF NOT private.membership_admissible(p_activity_id, actor, new_status) THEN RAISE EXCEPTION 'Activity is full' USING ERRCODE = 'P0001'; END IF;
  admitted_at := clock_timestamp();
  IF own_status = 'left' THEN
    UPDATE public.activity_participants SET status = new_status, requested_at = admitted_at,
      joined_at = CASE WHEN new_status = 'joined' THEN admitted_at ELSE NULL END, status_changed_at = admitted_at,
      decided_at = NULL, decided_by = NULL, last_read_at = admitted_at WHERE activity_id = p_activity_id AND user_id = actor;
  ELSE
    INSERT INTO public.activity_participants (activity_id, user_id, status, requested_at, joined_at, status_changed_at, last_read_at)
      VALUES (p_activity_id, actor, new_status, admitted_at, CASE WHEN new_status = 'joined' THEN admitted_at ELSE NULL END, admitted_at, admitted_at);
  END IF;
  RETURN jsonb_build_object('activityId', p_activity_id, 'status', new_status);
END;
$function$;

CREATE FUNCTION public.jomlepakz_leave_activity(p_activity_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; own_status text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL OR p_activity_id IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, ends_at INTO target FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND OR target.host_id = actor THEN RAISE EXCEPTION 'Leaving denied' USING ERRCODE = '42501'; END IF;
  SELECT status INTO own_status FROM public.activity_participants WHERE activity_id = p_activity_id AND user_id = actor;
  IF own_status IS NULL OR own_status = 'left' THEN RETURN jsonb_build_object('activityId', p_activity_id, 'status', coalesce(own_status, 'none')); END IF;
  IF own_status NOT IN ('pending', 'joined') OR target.status <> 'scheduled' OR target.ends_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Leaving closed' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.activity_participants SET status = 'left', status_changed_at = clock_timestamp(), decided_at = NULL, decided_by = NULL
    WHERE activity_id = p_activity_id AND user_id = actor;
  RETURN jsonb_build_object('activityId', p_activity_id, 'status', 'left');
END;
$function$;
GRANT jomlepakz_membership_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_membership_api;
ALTER FUNCTION public.jomlepakz_activity_membership(uuid) OWNER TO jomlepakz_membership_api;
ALTER FUNCTION public.jomlepakz_join_activity(uuid) OWNER TO jomlepakz_membership_api;
ALTER FUNCTION public.jomlepakz_leave_activity(uuid) OWNER TO jomlepakz_membership_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_membership_api;
REVOKE jomlepakz_membership_api FROM postgres;
REVOKE ALL ON FUNCTION public.jomlepakz_activity_membership(uuid), public.jomlepakz_join_activity(uuid), public.jomlepakz_leave_activity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_activity_membership(uuid), public.jomlepakz_join_activity(uuid), public.jomlepakz_leave_activity(uuid) TO authenticated;
COMMIT;
