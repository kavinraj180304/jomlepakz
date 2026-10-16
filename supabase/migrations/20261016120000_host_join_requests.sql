-- Host-only request review. No client table grants or managed Auth access.
BEGIN;

CREATE FUNCTION private.host_requests_owned(p_activity_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.activities
    WHERE id = p_activity_id AND host_id = private.discovery_actor());
$function$;
CREATE FUNCTION private.host_request_approvable(p_activity_id uuid, p_applicant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT private.host_requests_owned(p_activity_id)
    AND private.notification_profile_eligible(p_applicant_id)
    AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = p_activity_id
      AND a.host_id <> p_applicant_id
      AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE
        (b.blocker_id = p_applicant_id AND (b.blocked_id = a.host_id OR EXISTS (
          SELECT 1 FROM public.activity_participants m WHERE m.activity_id = a.id
            AND m.status = 'joined' AND m.user_id = b.blocked_id)))
        OR (b.blocked_id = p_applicant_id AND (b.blocker_id = a.host_id OR EXISTS (
          SELECT 1 FROM public.activity_participants m WHERE m.activity_id = a.id
            AND m.status = 'joined' AND m.user_id = b.blocker_id)))));
$function$;
ALTER FUNCTION private.host_requests_owned(uuid) OWNER TO postgres;
ALTER FUNCTION private.host_request_approvable(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.host_requests_owned(uuid), private.host_request_approvable(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE ROLE jomlepakz_host_requests_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_host_requests_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.host_requests_owned(uuid),
  private.host_request_approvable(uuid, uuid) TO jomlepakz_host_requests_api;
GRANT SELECT (id, host_id, status, visibility_status, starts_at, join_mode, capacity, revision)
  ON public.activities TO jomlepakz_host_requests_api;
-- Row-lock privilege only; actual activity updates remain forbidden.
GRANT UPDATE (id) ON public.activities TO jomlepakz_host_requests_api;
GRANT SELECT (activity_id, user_id, status, requested_at) ON public.activity_participants TO jomlepakz_host_requests_api;
GRANT UPDATE (status, joined_at, status_changed_at, decided_at, decided_by)
  ON public.activity_participants TO jomlepakz_host_requests_api;
GRANT SELECT (id, full_name, profile_visibility) ON public.profiles TO jomlepakz_host_requests_api;
CREATE POLICY host_requests_activity_read ON public.activities FOR SELECT TO jomlepakz_host_requests_api
  USING (host_id = private.discovery_actor());
CREATE POLICY host_requests_activity_lock ON public.activities FOR UPDATE TO jomlepakz_host_requests_api
  USING (host_id = private.discovery_actor()) WITH CHECK (false);
CREATE POLICY host_requests_roster_read ON public.activity_participants FOR SELECT TO jomlepakz_host_requests_api
  USING (private.host_requests_owned(activity_id));
CREATE POLICY host_requests_decide ON public.activity_participants FOR UPDATE TO jomlepakz_host_requests_api
  USING (status = 'pending' AND private.host_requests_owned(activity_id))
  WITH CHECK (private.host_requests_owned(activity_id) AND status IN ('joined', 'declined')
    AND decided_by = private.discovery_actor() AND decided_at IS NOT NULL
    AND (status = 'declined' OR private.host_request_approvable(activity_id, user_id)));
CREATE POLICY host_requests_applicant_read ON public.profiles FOR SELECT TO jomlepakz_host_requests_api
  USING (EXISTS (SELECT 1 FROM public.activity_participants p
    WHERE p.user_id = profiles.id AND p.status = 'pending' AND private.host_requests_owned(p.activity_id)));

CREATE FUNCTION public.jomlepakz_pending_join_requests(p_activity_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT private.host_requests_owned(p_activity_id) THEN
    RAISE EXCEPTION 'Host access denied' USING ERRCODE = '42501'; END IF;
  -- Only names already visible to students; no academic details, email or Auth ID.
  SELECT coalesce(jsonb_agg(jsonb_build_object('applicantId', p.user_id,
    'requestedAt', p.requested_at, 'name', CASE WHEN u.profile_visibility = 'students'
      AND private.host_request_approvable(p_activity_id, p.user_id)
      THEN coalesce(u.full_name, 'UM applicant') ELSE 'UM applicant' END)
    ORDER BY p.requested_at, p.user_id), '[]'::jsonb) INTO result
    FROM public.activity_participants p JOIN public.profiles u ON u.id = p.user_id
    WHERE p.activity_id = p_activity_id AND p.status = 'pending';
  RETURN result;
END;
$function$;

CREATE FUNCTION public.jomlepakz_decide_join_request(p_activity_id uuid, p_applicant_id uuid,
  p_requested_at timestamptz, p_revision bigint, p_decision text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; request record; decision_time timestamptz; outcome text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL THEN RAISE EXCEPTION 'Host access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, visibility_status, starts_at, join_mode, capacity, revision
    INTO target FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND OR target.host_id <> actor THEN
    RAISE EXCEPTION 'Host access denied' USING ERRCODE = '42501'; END IF;
  SELECT status, requested_at INTO request FROM public.activity_participants
    WHERE activity_id = p_activity_id AND user_id = p_applicant_id;
  IF NOT FOUND OR request.status <> 'pending' OR request.requested_at IS DISTINCT FROM p_requested_at
    OR target.revision IS DISTINCT FROM p_revision THEN outcome := 'stale';
  ELSIF target.status <> 'scheduled' OR target.visibility_status <> 'visible'
    OR target.join_mode <> 'approval' OR target.starts_at <= clock_timestamp() THEN outcome := 'closed';
  ELSIF p_decision = 'approve' AND NOT private.host_request_approvable(p_activity_id, p_applicant_id) THEN outcome := 'unavailable';
  ELSIF p_decision = 'approve' AND target.capacity <= 1 + (SELECT count(*)
    FROM public.activity_participants WHERE activity_id = p_activity_id AND status = 'joined') THEN outcome := 'full';
  ELSE
    decision_time := clock_timestamp();
    outcome := CASE WHEN p_decision = 'approve' THEN 'joined' ELSE 'declined' END;
    UPDATE public.activity_participants SET status = outcome,
      joined_at = CASE WHEN outcome = 'joined' THEN decision_time ELSE NULL END,
      status_changed_at = decision_time, decided_at = decision_time, decided_by = actor
      WHERE activity_id = p_activity_id AND user_id = p_applicant_id AND status = 'pending'
        AND requested_at = p_requested_at;
    IF NOT FOUND THEN outcome := 'stale'; END IF;
  END IF;
  RETURN jsonb_build_object('activityId', p_activity_id, 'outcome', outcome);
END;
$function$;
GRANT jomlepakz_host_requests_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_host_requests_api;
ALTER FUNCTION public.jomlepakz_pending_join_requests(uuid) OWNER TO jomlepakz_host_requests_api;
ALTER FUNCTION public.jomlepakz_decide_join_request(uuid, uuid, timestamptz, bigint, text) OWNER TO jomlepakz_host_requests_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_host_requests_api;
REVOKE ALL ON FUNCTION public.jomlepakz_pending_join_requests(uuid),
  public.jomlepakz_decide_join_request(uuid, uuid, timestamptz, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_pending_join_requests(uuid),
  public.jomlepakz_decide_join_request(uuid, uuid, timestamptz, bigint, text) TO authenticated;
REVOKE jomlepakz_host_requests_api FROM postgres;
COMMIT;
