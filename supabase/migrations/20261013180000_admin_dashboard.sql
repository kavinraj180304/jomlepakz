-- Admin feature boundary. No identities/admin grants or chat access are created.
BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_status_valid;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_valid CHECK
  (account_status IN ('pending_verification', 'active', 'suspended', 'banned', 'deleted'));
ALTER TABLE public.profiles ADD COLUMN moderation_revision bigint NOT NULL DEFAULT 1 CHECK (moderation_revision >= 1);
ALTER TABLE public.categories ADD COLUMN moderation_revision bigint NOT NULL DEFAULT 1 CHECK (moderation_revision >= 1);
ALTER TABLE public.reports ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1);
ALTER TABLE public.moderation_actions ADD COLUMN target_category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT;
ALTER TABLE public.moderation_actions DROP CONSTRAINT moderation_actions_target_valid;
ALTER TABLE public.moderation_actions ADD CONSTRAINT moderation_actions_target_valid CHECK (
  (action_type IN ('suspend_user', 'ban_user', 'restore_user', 'grant_admin', 'revoke_admin')
    AND target_user_id IS NOT NULL AND target_activity_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('hide_activity', 'restore_activity', 'cancel_activity')
    AND target_activity_id IS NOT NULL AND target_user_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('remove_message', 'restore_message')
    AND target_message_id IS NOT NULL AND target_user_id IS NULL AND target_activity_id IS NULL AND target_category_id IS NULL)
  OR (action_type IN ('enable_category', 'disable_category') AND target_category_id IS NOT NULL
    AND target_user_id IS NULL AND target_activity_id IS NULL AND target_message_id IS NULL)
  OR (action_type = 'set_report_status' AND report_id IS NOT NULL AND target_user_id IS NULL
    AND target_activity_id IS NULL AND target_message_id IS NULL AND target_category_id IS NULL));

CREATE OR REPLACE FUNCTION private.current_user_has_approved_identity() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (SELECT 1 FROM auth.users u
    JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
      AND d.is_active AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = u.id AND p.account_status IN ('suspended', 'banned', 'deleted'))
      AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id));
$function$;
CREATE FUNCTION private.current_user_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT private.current_user_is_eligible() AND EXISTS (SELECT 1 FROM public.admin_memberships
    WHERE user_id = private.discovery_actor() AND status = 'active');
$function$;
CREATE FUNCTION private.admin_can_review_report(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT private.current_user_is_admin() AND EXISTS (SELECT 1 FROM public.reports r
    WHERE r.id = p_id AND r.target_type IN ('activity', 'user') AND r.reporter_id <> private.discovery_actor()
      AND r.target_user_id IS DISTINCT FROM private.discovery_actor()
      AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.id = r.target_activity_id AND a.host_id = private.discovery_actor()));
$function$;
CREATE FUNCTION public.jomlepakz_current_user_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$ SELECT private.current_user_is_admin(); $function$;
ALTER FUNCTION private.current_user_is_admin() OWNER TO postgres;
ALTER FUNCTION private.admin_can_review_report(uuid) OWNER TO postgres;
ALTER FUNCTION public.jomlepakz_current_user_is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.current_user_is_admin(), private.admin_can_review_report(uuid),
  public.jomlepakz_current_user_is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_current_user_is_admin() TO authenticated;

CREATE ROLE jomlepakz_admin_api NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_admin_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.current_user_is_admin(),
  private.admin_can_review_report(uuid) TO jomlepakz_admin_api;
GRANT SELECT (id, full_name, account_status, moderation_revision, created_at) ON public.profiles TO jomlepakz_admin_api;
GRANT UPDATE (account_status, moderation_revision) ON public.profiles TO jomlepakz_admin_api;
GRANT SELECT (id, host_id, title, status, visibility_status, starts_at, ends_at, revision) ON public.activities TO jomlepakz_admin_api;
GRANT UPDATE (status, visibility_status, cancelled_at, revision) ON public.activities TO jomlepakz_admin_api;
GRANT SELECT (activity_id, user_id, status) ON public.activity_participants TO jomlepakz_admin_api;
GRANT UPDATE (status, status_changed_at, decided_by, decided_at) ON public.activity_participants TO jomlepakz_admin_api;
GRANT SELECT (id, slug, name, is_active, sort_order, moderation_revision) ON public.categories TO jomlepakz_admin_api;
GRANT UPDATE (is_active, moderation_revision) ON public.categories TO jomlepakz_admin_api;
GRANT SELECT (id, target_type, target_user_id, target_activity_id, reason_code, details, status, revision, created_at) ON public.reports TO jomlepakz_admin_api;
GRANT UPDATE (status, reviewed_by, reviewed_at, reviewer_notes, revision) ON public.reports TO jomlepakz_admin_api;
GRANT SELECT (id) ON public.moderation_actions TO jomlepakz_admin_api;
GRANT INSERT (actor_id, actor_kind, action_type, target_user_id, target_activity_id, target_category_id,
  report_id, reason, before_state, after_state) ON public.moderation_actions TO jomlepakz_admin_api;
GRANT INSERT (recipient_id, activity_id, kind, summary, event_key) ON public.notifications TO jomlepakz_admin_api;
CREATE POLICY admin_profiles ON public.profiles FOR ALL TO jomlepakz_admin_api USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());
CREATE POLICY admin_activities ON public.activities FOR ALL TO jomlepakz_admin_api USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());
CREATE POLICY admin_participants ON public.activity_participants FOR ALL TO jomlepakz_admin_api USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());
CREATE POLICY admin_categories ON public.categories FOR ALL TO jomlepakz_admin_api USING (private.current_user_is_admin()) WITH CHECK (private.current_user_is_admin());
CREATE POLICY admin_reports ON public.reports FOR SELECT TO jomlepakz_admin_api USING (private.admin_can_review_report(id));
CREATE POLICY admin_report_updates ON public.reports FOR UPDATE TO jomlepakz_admin_api USING (private.admin_can_review_report(id)) WITH CHECK (private.admin_can_review_report(id));
CREATE POLICY admin_audit_read ON public.moderation_actions FOR SELECT TO jomlepakz_admin_api USING (private.current_user_is_admin());
CREATE POLICY admin_audit_insert ON public.moderation_actions FOR INSERT TO jomlepakz_admin_api
  WITH CHECK (private.current_user_is_admin() AND actor_id = private.discovery_actor() AND actor_kind = 'admin'
    AND action_type IN ('hide_activity', 'cancel_activity', 'suspend_user', 'ban_user', 'enable_category', 'disable_category', 'set_report_status'));
CREATE POLICY admin_cancel_notice ON public.notifications FOR INSERT TO jomlepakz_admin_api
  WITH CHECK (private.current_user_is_admin() AND kind = 'activity_cancelled'
    AND EXISTS (SELECT 1 FROM public.activity_participants p WHERE p.activity_id = notifications.activity_id AND p.user_id = recipient_id AND p.status IN ('joined', 'pending')));

CREATE FUNCTION public.jomlepakz_admin_dashboard(p_section text DEFAULT 'Overview', p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT private.current_user_is_admin() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  IF p_section IS NULL OR p_section NOT IN ('Overview', 'Reports', 'Activities', 'Users', 'Categories') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid admin filters' USING ERRCODE = '22023'; END IF;
  WITH matching AS (
    SELECT jsonb_build_object('type', 'report', 'id', r.id, 'revision', r.revision::text, 'status', r.status,
      'reason', r.reason_code, 'details', r.details, 'targetType', r.target_type,
      'targetId', coalesce(r.target_user_id, r.target_activity_id), 'subject',
      coalesce((SELECT title FROM public.activities WHERE id = r.target_activity_id),
        (SELECT full_name FROM public.profiles WHERE id = r.target_user_id), 'Unavailable target')) AS payload,
      extract(epoch FROM r.created_at) AS sort_key, r.id
      FROM public.reports r WHERE p_section = 'Reports' AND r.status IN ('pending', 'in_review')
    UNION ALL
    SELECT jsonb_build_object('type', 'activity', 'id', id, 'revision', revision::text, 'title', title, 'status', status, 'visibility', visibility_status),
      -extract(epoch FROM starts_at), id FROM public.activities WHERE p_section = 'Activities'
    UNION ALL
    SELECT jsonb_build_object('type', 'user', 'id', id, 'revision', moderation_revision::text, 'name', coalesce(full_name, 'Deleted user'), 'status', account_status),
      -extract(epoch FROM created_at), id FROM public.profiles WHERE p_section = 'Users' AND id <> private.discovery_actor()
    UNION ALL
    SELECT jsonb_build_object('type', 'category', 'id', id, 'revision', moderation_revision::text, 'name', name, 'slug', slug, 'active', is_active),
      sort_order, id FROM public.categories WHERE p_section = 'Categories'
  ), candidates AS (SELECT * FROM matching ORDER BY sort_key, id LIMIT 21 OFFSET (p_page - 1) * 20),
  page_rows AS (SELECT * FROM candidates ORDER BY sort_key, id LIMIT 20)
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(payload ORDER BY sort_key, id) FROM page_rows), '[]'::jsonb),
    'hasNext', (SELECT count(*) > 20 FROM candidates), 'counts', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.reports WHERE status = 'pending'),
      'inReview', (SELECT count(*) FROM public.reports WHERE status = 'in_review'),
      'hiddenActivities', (SELECT count(*) FROM public.activities WHERE visibility_status = 'hidden'),
      'suspendedUsers', (SELECT count(*) FROM public.profiles WHERE account_status = 'suspended'),
      'bannedUsers', (SELECT count(*) FROM public.profiles WHERE account_status = 'banned'),
      'activeCategories', (SELECT count(*) FROM public.categories WHERE is_active))) INTO result;
  RETURN result;
END;
$function$;

CREATE FUNCTION public.jomlepakz_admin_action(p_action text, p_target uuid, p_revision bigint, p_reason text, p_status text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; target record; affected record; audit_id uuid := gen_random_uuid(); before_value jsonb; after_value jsonb;
  user_target uuid; activity_target uuid; category_target uuid; report_target uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported isolation' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  IF NOT private.current_user_is_admin() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  actor := private.discovery_actor();
  IF p_action IS NULL OR p_action NOT IN ('hide_activity', 'cancel_activity', 'suspend_user', 'ban_user', 'enable_category', 'disable_category', 'set_report_status')
    OR p_target IS NULL OR p_revision IS NULL OR p_revision < 1 OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR p_reason ~ '[[:cntrl:]]' OR (p_action <> 'set_report_status' AND p_status IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid moderation action' USING ERRCODE = '22023'; END IF;
  IF p_action IN ('hide_activity', 'cancel_activity') THEN
    SELECT id, status, visibility_status, revision INTO target FROM public.activities WHERE id = p_target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target unavailable' USING ERRCODE = '42501'; END IF;
    IF target.revision <> p_revision THEN RAISE EXCEPTION 'Target changed' USING ERRCODE = '40001'; END IF;
    activity_target := p_target; before_value := jsonb_build_object('status', target.status, 'visibility', target.visibility_status);
    IF p_action = 'hide_activity' THEN
      IF target.visibility_status = 'hidden' THEN RAISE EXCEPTION 'Already hidden' USING ERRCODE = 'P0001'; END IF;
      UPDATE public.activities SET visibility_status = 'hidden', revision = revision + 1 WHERE id = p_target;
    ELSE
      IF target.status <> 'scheduled' THEN RAISE EXCEPTION 'Cancellation closed' USING ERRCODE = 'P0001'; END IF;
      UPDATE public.activities SET status = 'cancelled', cancelled_at = clock_timestamp(), revision = revision + 1 WHERE id = p_target;
      INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key)
        SELECT user_id, p_target, 'activity_cancelled', 'Activity was cancelled', 'activity:' || p_target || ':revision:' || (target.revision + 1) || ':cancelled'
        FROM public.activity_participants WHERE activity_id = p_target AND status IN ('joined', 'pending') ON CONFLICT DO NOTHING;
      UPDATE public.activity_participants SET status = 'declined', status_changed_at = clock_timestamp(), decided_by = NULL, decided_at = NULL
        WHERE activity_id = p_target AND status = 'pending';
    END IF;
    SELECT jsonb_build_object('status', status, 'visibility', visibility_status) INTO after_value FROM public.activities WHERE id = p_target;
  ELSIF p_action IN ('suspend_user', 'ban_user') THEN
    IF p_target = actor THEN RAISE EXCEPTION 'Cannot moderate own account' USING ERRCODE = '42501'; END IF;
    -- Lock activities in stable order before the profile and relationship updates.
    PERFORM id FROM public.activities WHERE status = 'scheduled' AND ends_at > clock_timestamp()
      AND (host_id = p_target OR EXISTS (SELECT 1 FROM public.activity_participants p WHERE p.activity_id = activities.id AND p.user_id = p_target)) ORDER BY id FOR UPDATE;
    SELECT id, account_status, moderation_revision INTO target FROM public.profiles WHERE id = p_target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target unavailable' USING ERRCODE = '42501'; END IF;
    IF target.moderation_revision <> p_revision THEN RAISE EXCEPTION 'Target changed' USING ERRCODE = '40001'; END IF;
    IF target.account_status = 'deleted' OR target.account_status = 'banned' OR (p_action = 'suspend_user' AND target.account_status = 'suspended') THEN
      RAISE EXCEPTION 'Account action closed' USING ERRCODE = 'P0001'; END IF;
    user_target := p_target; before_value := jsonb_build_object('status', target.account_status);
    UPDATE public.profiles SET account_status = CASE WHEN p_action = 'ban_user' THEN 'banned' ELSE 'suspended' END,
      moderation_revision = moderation_revision + 1 WHERE id = p_target;
    FOR affected IN SELECT id, visibility_status FROM public.activities WHERE host_id = p_target AND status = 'scheduled' AND ends_at > clock_timestamp() AND visibility_status <> 'hidden' ORDER BY id LOOP
      UPDATE public.activities SET visibility_status = 'hidden', revision = revision + 1 WHERE id = affected.id;
      INSERT INTO public.moderation_actions (actor_id, actor_kind, action_type, target_activity_id, reason, before_state, after_state)
        VALUES (actor, 'admin', 'hide_activity', affected.id, btrim(p_reason), jsonb_build_object('visibility', affected.visibility_status), jsonb_build_object('visibility', 'hidden'));
    END LOOP;
    UPDATE public.activity_participants p SET status = CASE WHEN p.status = 'joined' THEN 'removed' ELSE 'declined' END,
      status_changed_at = clock_timestamp(), decided_by = NULL, decided_at = NULL
      WHERE p.status IN ('joined', 'pending') AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = p.activity_id AND a.status = 'scheduled'
        AND a.ends_at > clock_timestamp() AND (p.user_id = p_target OR (a.host_id = p_target AND p.status = 'pending')));
    after_value := jsonb_build_object('status', CASE WHEN p_action = 'ban_user' THEN 'banned' ELSE 'suspended' END);
  ELSIF p_action IN ('enable_category', 'disable_category') THEN
    SELECT id, is_active, moderation_revision INTO target FROM public.categories WHERE id = p_target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target unavailable' USING ERRCODE = '42501'; END IF;
    IF target.moderation_revision <> p_revision THEN RAISE EXCEPTION 'Target changed' USING ERRCODE = '40001'; END IF;
    IF target.is_active = (p_action = 'enable_category') THEN RAISE EXCEPTION 'Category already has this state' USING ERRCODE = 'P0001'; END IF;
    category_target := p_target; before_value := jsonb_build_object('active', target.is_active);
    UPDATE public.categories SET is_active = (p_action = 'enable_category'), moderation_revision = moderation_revision + 1 WHERE id = p_target;
    after_value := jsonb_build_object('active', p_action = 'enable_category');
  ELSE
    IF p_status IS NULL OR p_status NOT IN ('in_review', 'resolved', 'dismissed') THEN RAISE EXCEPTION 'Invalid review status' USING ERRCODE = '22023'; END IF;
    SELECT id, status, revision INTO target FROM public.reports WHERE id = p_target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE = '42501'; END IF;
    IF target.revision <> p_revision THEN RAISE EXCEPTION 'Target changed' USING ERRCODE = '40001'; END IF;
    IF target.status IN ('resolved', 'dismissed') OR target.status = p_status THEN RAISE EXCEPTION 'Review transition closed' USING ERRCODE = 'P0001'; END IF;
    report_target := p_target; before_value := jsonb_build_object('status', target.status);
    UPDATE public.reports SET status = p_status, reviewed_by = actor, reviewed_at = clock_timestamp(), reviewer_notes = btrim(p_reason), revision = revision + 1 WHERE id = p_target;
    after_value := jsonb_build_object('status', p_status);
  END IF;
  INSERT INTO public.moderation_actions (id, actor_id, actor_kind, action_type, target_user_id, target_activity_id, target_category_id, report_id, reason, before_state, after_state)
    VALUES (audit_id, actor, 'admin', p_action, user_target, activity_target, category_target, report_target, btrim(p_reason), before_value, after_value);
  RETURN audit_id;
END;
$function$;
-- Explicit id insert is needed for the generated audit reference returned by the RPC.
GRANT INSERT (id) ON public.moderation_actions TO jomlepakz_admin_api;
GRANT jomlepakz_admin_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_admin_api;
ALTER FUNCTION public.jomlepakz_admin_dashboard(text, integer) OWNER TO jomlepakz_admin_api;
ALTER FUNCTION public.jomlepakz_admin_action(text, uuid, bigint, text, text) OWNER TO jomlepakz_admin_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_admin_api;
REVOKE ALL ON FUNCTION public.jomlepakz_admin_dashboard(text, integer), public.jomlepakz_admin_action(text, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_admin_dashboard(text, integer), public.jomlepakz_admin_action(text, uuid, bigint, text, text) TO authenticated;
REVOKE jomlepakz_admin_api FROM postgres;
COMMIT;
