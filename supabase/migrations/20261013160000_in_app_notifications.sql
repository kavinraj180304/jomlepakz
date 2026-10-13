-- In-app only. Existing host update/cancellation event producers remain intact.
BEGIN;
ALTER TABLE public.notifications ADD COLUMN source_user_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE FUNCTION private.notification_profile_eligible(p_profile uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.auth_user_id
    JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
    WHERE p.id = p_profile AND p.account_status = 'active' AND p.verified_at IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false) AND d.is_active
      AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id));
$function$;
CREATE FUNCTION private.notification_can_read(p_activity uuid, p_source uuid, p_kind text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor();
BEGIN
  IF actor IS NULL OR p_kind NOT IN ('join_requested', 'participant_joined', 'join_approved',
    'join_declined', 'activity_updated', 'activity_cancelled') THEN RETURN false; END IF;
  IF p_source IS NOT NULL AND EXISTS (SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = actor AND blocked_id = p_source) OR (blocker_id = p_source AND blocked_id = actor)) THEN RETURN false; END IF;
  IF p_activity IS NULL THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.activities a WHERE a.id = p_activity AND a.visibility_status = 'visible'
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = actor AND b.blocked_id = a.host_id) OR (b.blocker_id = a.host_id AND b.blocked_id = actor)));
END;
$function$;

-- No public notification-creation RPC. Only actual authorized status transitions emit.
-- These hooks do not implement join/approval APIs or grant participant writes.
CREATE FUNCTION private.notify_participant_transition() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; activity public.activities%ROWTYPE; previous_status text;
  event_id uuid := gen_random_uuid(); decision_authorized boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    previous_status := OLD.status;
  END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  SELECT * INTO activity FROM public.activities WHERE id = NEW.activity_id;
  IF actor IS NULL OR NOT FOUND OR NEW.user_id = activity.host_id OR activity.status <> 'scheduled'
    OR activity.visibility_status <> 'visible' OR activity.starts_at <= clock_timestamp()
    OR NOT private.notification_profile_eligible(NEW.user_id)
    OR NOT private.notification_profile_eligible(activity.host_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users WHERE
    (blocker_id = NEW.user_id AND blocked_id = activity.host_id)
    OR (blocker_id = activity.host_id AND blocked_id = NEW.user_id)) THEN RETURN NEW; END IF;
  decision_authorized := actor = activity.host_id OR EXISTS (
    SELECT 1 FROM public.admin_memberships WHERE user_id = actor AND status = 'active');
  IF NEW.status = 'pending' AND activity.join_mode = 'approval' AND actor = NEW.user_id
    AND (previous_status IS NULL OR previous_status = 'left') THEN
    INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key, source_user_id)
      VALUES (activity.host_id, NEW.activity_id, 'join_requested', 'Someone requested to join your activity',
        'participant-event:' || event_id || ':requested', NEW.user_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.status = 'joined' AND (
    (activity.join_mode = 'instant' AND actor = NEW.user_id AND (previous_status IS NULL OR previous_status = 'left'))
    OR (activity.join_mode = 'approval' AND previous_status = 'pending' AND decision_authorized
      AND NEW.decided_by = actor AND NEW.decided_at IS NOT NULL)) THEN
    INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key, source_user_id)
      VALUES (activity.host_id, NEW.activity_id, 'participant_joined', 'Someone joined your activity',
        'participant-event:' || event_id || ':joined', NEW.user_id) ON CONFLICT DO NOTHING;
    IF previous_status = 'pending' THEN
      INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key, source_user_id)
        VALUES (NEW.user_id, NEW.activity_id, 'join_approved', 'Your request to join was approved',
          'participant-event:' || event_id || ':approved', actor) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.status = 'declined' AND previous_status = 'pending' AND decision_authorized
    AND NEW.decided_by = actor AND NEW.decided_at IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key, source_user_id)
      VALUES (NEW.user_id, NEW.activity_id, 'join_declined', 'Your request to join was declined',
        'participant-event:' || event_id || ':declined', actor) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.notification_profile_eligible(uuid) OWNER TO postgres;
ALTER FUNCTION private.notification_can_read(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION private.notify_participant_transition() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.notification_profile_eligible(uuid),
  private.notification_can_read(uuid, uuid, text), private.notify_participant_transition() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER participant_notification_events AFTER INSERT OR UPDATE OF status ON public.activity_participants
  FOR EACH ROW EXECUTE FUNCTION private.notify_participant_transition();

CREATE ROLE jomlepakz_notification_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_notification_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.notification_can_read(uuid, uuid, text),
  public.jomlepakz_activity_details(uuid) TO jomlepakz_notification_api;
GRANT SELECT (id, recipient_id, activity_id, source_user_id, kind, created_at, read_at)
  ON public.notifications TO jomlepakz_notification_api;
GRANT UPDATE (read_at) ON public.notifications TO jomlepakz_notification_api;
CREATE POLICY notifications_recipient_gate ON public.notifications AS RESTRICTIVE FOR ALL TO jomlepakz_notification_api
  USING (recipient_id = (SELECT private.discovery_actor()) AND private.notification_can_read(activity_id, source_user_id, kind))
  WITH CHECK (recipient_id = (SELECT private.discovery_actor()) AND private.notification_can_read(activity_id, source_user_id, kind));
CREATE POLICY notifications_recipient_read ON public.notifications FOR SELECT TO jomlepakz_notification_api
  USING (recipient_id = (SELECT private.discovery_actor()));
CREATE POLICY notifications_recipient_update ON public.notifications FOR UPDATE TO jomlepakz_notification_api
  USING (recipient_id = (SELECT private.discovery_actor())) WITH CHECK (recipient_id = (SELECT private.discovery_actor()));

CREATE FUNCTION public.jomlepakz_notifications(p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid notification page' USING ERRCODE = '22023'; END IF;
  WITH matching AS (
    SELECT id, activity_id, kind, created_at, read_at FROM public.notifications WHERE recipient_id = actor
      ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET (p_page - 1) * 20
  ), page_rows AS (SELECT * FROM matching ORDER BY created_at DESC, id DESC LIMIT 20)
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'summary', CASE WHEN activity_id IS NULL THEN 'Activity no longer available'
        WHEN kind = 'join_requested' THEN 'Someone requested to join your activity'
        WHEN kind = 'participant_joined' THEN 'Someone joined your activity'
        WHEN kind = 'join_approved' THEN 'Your request to join was approved'
        WHEN kind = 'join_declined' THEN 'Your request to join was declined'
        WHEN kind = 'activity_updated' THEN 'Activity details were updated'
        ELSE 'Activity was cancelled' END,
      'createdAt', created_at, 'readAt', read_at,
      'activityId', CASE WHEN activity_id IS NOT NULL AND public.jomlepakz_activity_details(activity_id) IS NOT NULL
        THEN activity_id ELSE NULL END) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
    'hasNext', (SELECT count(*) > 20 FROM matching),
    'unreadCount', (SELECT count(*) FROM public.notifications WHERE recipient_id = actor AND read_at IS NULL)) INTO result;
  RETURN result;
END;
$function$;
CREATE FUNCTION public.jomlepakz_mark_all_notifications_read() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; affected integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Unsupported notification isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.notifications SET read_at = greatest(clock_timestamp(), created_at)
    WHERE recipient_id = actor AND read_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;
GRANT jomlepakz_notification_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_notification_api;
ALTER FUNCTION public.jomlepakz_notifications(integer) OWNER TO jomlepakz_notification_api;
ALTER FUNCTION public.jomlepakz_mark_all_notifications_read() OWNER TO jomlepakz_notification_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_notification_api;
REVOKE jomlepakz_notification_api FROM postgres;
REVOKE ALL ON FUNCTION public.jomlepakz_notifications(integer), public.jomlepakz_mark_all_notifications_read()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_notifications(integer), public.jomlepakz_mark_all_notifications_read() TO authenticated;
COMMIT;
