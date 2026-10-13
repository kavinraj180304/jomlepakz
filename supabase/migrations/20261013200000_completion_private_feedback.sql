BEGIN;
-- Immutable completion-time admission evidence, never a second participant roster.
CREATE TABLE private.activity_feedback_eligibility (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (activity_id, user_id)
);
ALTER TABLE private.activity_feedback_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.activity_feedback_eligibility FROM PUBLIC, anon, authenticated;
-- Conservative legacy backfill: only preserved joined rows admitted before completion.
INSERT INTO private.activity_feedback_eligibility (activity_id, user_id, completed_at)
  SELECT a.id, p.user_id, a.completed_at FROM public.activities a JOIN public.activity_participants p ON p.activity_id = a.id
  WHERE a.status = 'completed' AND a.completed_at >= a.ends_at AND p.status = 'joined'
    AND p.user_id <> a.host_id AND p.joined_at <= a.completed_at;

ALTER TABLE public.moderation_actions DROP CONSTRAINT moderation_actions_target_valid;
ALTER TABLE public.moderation_actions ADD CONSTRAINT moderation_actions_target_valid CHECK (
  (action_type IN ('suspend_user', 'ban_user', 'restore_user', 'grant_admin', 'revoke_admin') AND target_user_id IS NOT NULL AND target_activity_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('hide_activity', 'restore_activity', 'cancel_activity', 'complete_activity') AND target_activity_id IS NOT NULL AND target_user_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('remove_message', 'restore_message') AND target_message_id IS NOT NULL AND target_user_id IS NULL AND target_activity_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('enable_category', 'disable_category') AND target_category_id IS NOT NULL AND target_user_id IS NULL AND target_activity_id IS NULL AND target_message_id IS NULL)
  OR (action_type = 'set_report_status' AND report_id IS NOT NULL AND target_user_id IS NULL AND target_activity_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL));
CREATE ROLE jomlepakz_completion_api NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_completion_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.current_user_is_admin(),
  private.discovery_can_read(uuid, uuid, text, text, timestamptz) TO jomlepakz_completion_api;
GRANT SELECT (id, host_id, status, visibility_status, starts_at, ends_at, completed_at, revision) ON public.activities TO jomlepakz_completion_api;
GRANT UPDATE (status, completed_at, revision) ON public.activities TO jomlepakz_completion_api;
GRANT SELECT (activity_id, user_id, status, joined_at) ON public.activity_participants TO jomlepakz_completion_api;
GRANT UPDATE (status, status_changed_at, decided_at, decided_by) ON public.activity_participants TO jomlepakz_completion_api;
GRANT SELECT, INSERT ON private.activity_feedback_eligibility TO jomlepakz_completion_api;
GRANT SELECT (activity_id, author_id, body, created_at), INSERT (activity_id, author_id, body, created_at) ON public.activity_feedback TO jomlepakz_completion_api;
GRANT INSERT (id, actor_id, actor_kind, action_type, target_activity_id, reason, before_state, after_state) ON public.moderation_actions TO jomlepakz_completion_api;
CREATE POLICY completion_activity_read ON public.activities FOR SELECT TO jomlepakz_completion_api USING
  (private.current_user_is_admin() OR private.discovery_can_read(id, host_id, status, visibility_status, starts_at));
CREATE POLICY completion_activity_update ON public.activities FOR UPDATE TO jomlepakz_completion_api
  USING (host_id = private.discovery_actor() OR private.current_user_is_admin())
  WITH CHECK (status = 'completed' AND (host_id = private.discovery_actor() OR private.current_user_is_admin()));
CREATE POLICY completion_roster_read ON public.activity_participants FOR SELECT TO jomlepakz_completion_api
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));
CREATE POLICY completion_close_pending ON public.activity_participants FOR UPDATE TO jomlepakz_completion_api
  USING (status = 'pending' AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND (a.host_id = private.discovery_actor() OR private.current_user_is_admin())))
  WITH CHECK (status = 'declined' AND decided_by IS NULL AND decided_at IS NULL);
CREATE POLICY completion_snapshot_read ON private.activity_feedback_eligibility FOR SELECT TO jomlepakz_completion_api
  USING (user_id = private.discovery_actor() OR EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND (a.host_id = private.discovery_actor() OR private.current_user_is_admin())));
CREATE POLICY completion_snapshot_insert ON private.activity_feedback_eligibility FOR INSERT TO jomlepakz_completion_api
  WITH CHECK (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND a.status = 'completed'
    AND a.completed_at = activity_feedback_eligibility.completed_at AND a.ends_at <= a.completed_at
    AND a.host_id <> user_id AND (a.host_id = private.discovery_actor() OR private.current_user_is_admin())));
CREATE POLICY feedback_author_read ON public.activity_feedback FOR SELECT TO jomlepakz_completion_api USING (author_id = private.discovery_actor());
CREATE POLICY feedback_author_insert ON public.activity_feedback FOR INSERT TO jomlepakz_completion_api WITH CHECK
  (author_id = private.discovery_actor() AND EXISTS (SELECT 1 FROM private.activity_feedback_eligibility e
    JOIN public.activities a ON a.id = e.activity_id WHERE e.activity_id = activity_feedback.activity_id AND e.user_id = author_id
      AND a.status = 'completed' AND a.ends_at <= clock_timestamp() AND a.host_id <> author_id AND a.visibility_status = 'visible'
      AND private.discovery_can_read(a.id, a.host_id, a.status, a.visibility_status, a.starts_at)));
CREATE POLICY completion_admin_audit ON public.moderation_actions FOR INSERT TO jomlepakz_completion_api
  WITH CHECK (private.current_user_is_admin() AND actor_id = private.discovery_actor() AND actor_kind = 'admin' AND action_type = 'complete_activity');

CREATE FUNCTION public.jomlepakz_complete_activity(p_activity_id uuid, p_revision bigint, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; administrator boolean; finished_at timestamptz; audit_id uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor(); administrator := private.current_user_is_admin();
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, visibility_status, ends_at, revision INTO target FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND OR (target.host_id <> actor AND NOT administrator) THEN RAISE EXCEPTION 'Completion denied' USING ERRCODE = '42501'; END IF;
  IF p_revision IS NULL OR p_revision <> target.revision THEN RAISE EXCEPTION 'Activity changed' USING ERRCODE = '40001'; END IF;
  IF target.status <> 'scheduled' OR (target.visibility_status <> 'visible' AND NOT administrator) THEN RAISE EXCEPTION 'Completion closed' USING ERRCODE = 'P0001'; END IF;
  finished_at := clock_timestamp();
  IF target.ends_at > finished_at THEN RAISE EXCEPTION 'Activity has not ended' USING ERRCODE = '22023'; END IF;
  IF (administrator AND (p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500))
    OR (p_reason IS NOT NULL AND (char_length(btrim(p_reason)) > 500 OR p_reason ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION 'Completion reason required' USING ERRCODE = '22023'; END IF;
  UPDATE public.activities SET status = 'completed', completed_at = finished_at, revision = revision + 1 WHERE id = p_activity_id;
  INSERT INTO private.activity_feedback_eligibility (activity_id, user_id, completed_at)
    SELECT p_activity_id, user_id, finished_at FROM public.activity_participants
    WHERE activity_id = p_activity_id AND status = 'joined' AND user_id <> target.host_id AND joined_at <= finished_at;
  UPDATE public.activity_participants SET status = 'declined', status_changed_at = finished_at, decided_at = NULL, decided_by = NULL
    WHERE activity_id = p_activity_id AND status = 'pending';
  IF administrator THEN
    audit_id := gen_random_uuid();
    INSERT INTO public.moderation_actions (id, actor_id, actor_kind, action_type, target_activity_id, reason, before_state, after_state)
      VALUES (audit_id, actor, 'admin', 'complete_activity', p_activity_id, btrim(p_reason), jsonb_build_object('status', 'scheduled'), jsonb_build_object('status', 'completed'));
  END IF;
  RETURN jsonb_build_object('activityId', p_activity_id, 'revision', (target.revision + 1)::text, 'auditId', audit_id);
END;
$function$;
CREATE FUNCTION public.jomlepakz_activity_feedback_state(p_activity_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor(); target record; own_body text; feedback_state text; administrator boolean := private.current_user_is_admin();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT id, host_id, status, visibility_status, starts_at, ends_at, revision INTO target FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'unavailable', 'body', NULL, 'canComplete', false, 'revision', NULL, 'requiresReason', false); END IF;
  IF NOT private.discovery_can_read(target.id, target.host_id, target.status, target.visibility_status, target.starts_at) THEN feedback_state := 'unavailable';
  ELSIF target.host_id = actor THEN feedback_state := 'host';
  ELSIF target.status = 'completed' AND EXISTS (SELECT 1 FROM private.activity_feedback_eligibility WHERE activity_id = p_activity_id AND user_id = actor) THEN
    SELECT body INTO own_body FROM public.activity_feedback WHERE activity_id = p_activity_id AND author_id = actor;
    feedback_state := CASE WHEN own_body IS NULL THEN 'ready' ELSE 'submitted' END;
  ELSIF target.status = 'scheduled' AND EXISTS (SELECT 1 FROM public.activity_participants WHERE activity_id = p_activity_id AND user_id = actor AND status = 'joined') THEN feedback_state := 'awaiting_completion';
  ELSE feedback_state := 'not_participant'; END IF;
  RETURN jsonb_build_object('state', feedback_state, 'body', own_body,
    'canComplete', target.status = 'scheduled' AND target.ends_at <= statement_timestamp() AND (target.host_id = actor OR administrator),
    'revision', CASE WHEN target.host_id = actor OR administrator THEN target.revision::text ELSE NULL END, 'requiresReason', administrator);
END;
$function$;
CREATE FUNCTION public.jomlepakz_submit_activity_feedback(p_activity_id uuid, p_body text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; normalized text; previous text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- The shared transaction gate serializes feedback with visibility/block changes.
  -- Participant SELECT must not require the host-only activity UPDATE policy.
  SELECT id, host_id, status, visibility_status, starts_at, ends_at INTO target FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND OR target.host_id = actor OR NOT EXISTS (SELECT 1 FROM private.activity_feedback_eligibility WHERE activity_id = p_activity_id AND user_id = actor) THEN
    RAISE EXCEPTION 'Feedback denied' USING ERRCODE = '42501'; END IF;
  IF target.status <> 'completed' OR target.ends_at > clock_timestamp() OR target.visibility_status <> 'visible'
    OR NOT private.discovery_can_read(target.id, target.host_id, target.status, target.visibility_status, target.starts_at) THEN
    RAISE EXCEPTION 'Feedback not open' USING ERRCODE = 'P0001'; END IF;
  normalized := btrim(replace(replace(p_body, E'\r\n', E'\n'), E'\r', E'\n'));
  IF normalized IS NULL OR char_length(normalized) NOT BETWEEN 1 AND 1000 OR normalized !~ '[^[:space:]]'
    OR translate(normalized, E'\n\t', '') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid feedback' USING ERRCODE = '22023'; END IF;
  SELECT body INTO previous FROM public.activity_feedback WHERE activity_id = p_activity_id AND author_id = actor;
  IF previous IS NOT NULL THEN
    IF previous = normalized THEN RETURN true; END IF;
    RAISE EXCEPTION 'Feedback already submitted' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.activity_feedback (activity_id, author_id, body, created_at) VALUES (p_activity_id, actor, normalized, clock_timestamp());
  RETURN true;
END;
$function$;
GRANT jomlepakz_completion_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_completion_api;
ALTER FUNCTION public.jomlepakz_complete_activity(uuid, bigint, text) OWNER TO jomlepakz_completion_api;
ALTER FUNCTION public.jomlepakz_activity_feedback_state(uuid) OWNER TO jomlepakz_completion_api;
ALTER FUNCTION public.jomlepakz_submit_activity_feedback(uuid, text) OWNER TO jomlepakz_completion_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_completion_api;
REVOKE jomlepakz_completion_api FROM postgres;
REVOKE ALL ON FUNCTION public.jomlepakz_complete_activity(uuid, bigint, text), public.jomlepakz_activity_feedback_state(uuid), public.jomlepakz_submit_activity_feedback(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_complete_activity(uuid, bigint, text), public.jomlepakz_activity_feedback_state(uuid), public.jomlepakz_submit_activity_feedback(uuid, text) TO authenticated;
COMMIT;
