-- LOCAL DEVELOPMENT ONLY. Requires existing reviewed admin A and real non-admin B/C.
-- No users or admin memberships are created. Every fixture/change rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated;
DO $test_acl$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_memberships', 'INSERT') AND NOT pg_has_role('authenticated', 'jomlepakz_admin_api', 'MEMBER'), 'no student self-grant or API role escalation');
SELECT ok(NOT has_table_privilege('jomlepakz_admin_api', 'public.messages', 'SELECT'), 'dashboard owner has no private chat access');
CREATE TEMP TABLE admin_test_context AS
WITH eligible AS (
  SELECT p.id, u.id AS auth_id FROM public.profiles p JOIN auth.users u ON u.id = p.auth_user_id
    JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email)
  WHERE p.account_status = 'active' AND p.verified_at IS NOT NULL AND d.is_active AND u.email_confirmed_at IS NOT NULL
    AND NOT coalesce(u.is_anonymous, false) AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
    AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
), admins AS (SELECT e.* FROM eligible e JOIN public.admin_memberships m ON m.user_id = e.id WHERE m.status = 'active' ORDER BY e.id LIMIT 1),
normals AS (SELECT e.* FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM public.admin_memberships m WHERE m.user_id = e.id AND m.status = 'active') ORDER BY e.id)
SELECT (SELECT id FROM admins) AS ap, (SELECT auth_id FROM admins) AS a,
  (SELECT id FROM normals LIMIT 1) AS bp, (SELECT auth_id FROM normals LIMIT 1) AS b,
  (SELECT id FROM normals OFFSET 1 LIMIT 1) AS cp, (SELECT auth_id FROM normals OFFSET 1 LIMIT 1) AS c,
  (SELECT id FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_id,
  (SELECT moderation_revision FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_revision,
  (SELECT moderation_revision FROM public.profiles WHERE id = (SELECT id FROM normals OFFSET 1 LIMIT 1)) AS user_revision,
  gen_random_uuid() AS activity_id, gen_random_uuid() AS owned_id, gen_random_uuid() AS participant_activity_id,
  gen_random_uuid() AS report_id, gen_random_uuid() AS conflict_id;
DO $preconditions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_test_context WHERE a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Existing reviewed admin A and two eligible real non-admin B/C accounts are required'; END IF;
END;
$preconditions$;
GRANT SELECT ON admin_test_context TO authenticated;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity)
  SELECT activity_id, cp, category_id, 'Moderation fixture', 'Evidence remains', 'UM Main Library', statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2 FROM admin_test_context
  UNION ALL SELECT owned_id, ap, category_id, 'Conflict fixture', 'Conflict context', 'UM Main Library', statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2 FROM admin_test_context
  UNION ALL SELECT participant_activity_id, bp, category_id, 'Membership cleanup fixture', 'Cleanup context', 'UM Main Library', statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2 FROM admin_test_context;
INSERT INTO public.activity_participants (activity_id, user_id, status, joined_at)
  SELECT participant_activity_id, cp, 'joined', clock_timestamp() FROM admin_test_context;
INSERT INTO public.reports (id, reporter_id, target_type, target_activity_id, reason_code, details, evidence_snapshot)
  SELECT report_id, bp, 'activity', activity_id, 'unsafe_activity', 'Please review', '{"title":"Captured evidence"}'::jsonb FROM admin_test_context
  UNION ALL SELECT conflict_id, bp, 'activity', owned_id, 'unsafe_activity', 'Conflict example', '{}'::jsonb FROM admin_test_context;

SELECT set_config('request.jwt.claim.sub', b::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM admin_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_is_admin(), false, 'normal B is not admin');
SELECT throws_ok('SELECT public.jomlepakz_admin_dashboard()', '42501', NULL::text, 'normal B receives no admin data');
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''hide_activity'', activity_id, 1, ''Forged moderation'') FROM admin_test_context', '42501', NULL::text, 'normal B direct moderation call denied');
SELECT throws_ok('SELECT * FROM public.reports', '42501', NULL::text, 'normal B cannot read raw reports');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', a::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM admin_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_is_admin(), true, 'reviewed active admin A is allowed');
SELECT ok(public.jomlepakz_admin_dashboard()->'counts' IS NOT NULL, 'admin A receives real moderation counts');
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''set_report_status'', conflict_id, 1, ''Review'', ''resolved'') FROM admin_test_context', '42501', NULL::text, 'admin cannot review a report against own activity');
SELECT public.jomlepakz_admin_action('set_report_status', report_id, 1, 'Review started', 'in_review') FROM admin_test_context;
SELECT public.jomlepakz_admin_action('set_report_status', report_id, 2, 'Evidence reviewed', 'resolved') FROM admin_test_context;
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''hide_activity'', activity_id, 999, ''Stale'') FROM admin_test_context', '40001', NULL::text, 'stale revision rejected');
SELECT public.jomlepakz_admin_action('hide_activity', activity_id, 1, 'Unsafe content') FROM admin_test_context;
SELECT public.jomlepakz_admin_action('cancel_activity', activity_id, 2, 'Unsafe activity') FROM admin_test_context;
SELECT public.jomlepakz_admin_action('disable_category', category_id, category_revision, 'Temporarily unavailable') FROM admin_test_context;
SELECT public.jomlepakz_admin_action('suspend_user', cp, user_revision, 'Safety review') FROM admin_test_context;
SELECT public.jomlepakz_admin_action('ban_user', cp, user_revision + 1, 'Safety decision') FROM admin_test_context;
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''suspend_user'', ap, 1, ''Own account'') FROM admin_test_context', '42501', NULL::text, 'self moderation denied');
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''grant_admin'', bp, 1, ''Privilege escalation'') FROM admin_test_context', '22023', NULL::text, 'application admin cannot appoint admin');
RESET ROLE;
SELECT is((SELECT status FROM public.reports WHERE id = (SELECT report_id FROM admin_test_context)), 'resolved', 'report status persisted');
SELECT is((SELECT reviewed_by FROM public.reports WHERE id = (SELECT report_id FROM admin_test_context)), (SELECT ap FROM admin_test_context), 'reviewer derived from authenticated admin');
SELECT is((SELECT evidence_snapshot FROM public.reports WHERE id = (SELECT report_id FROM admin_test_context)), '{"title":"Captured evidence"}'::jsonb, 'moderation preserves report evidence');
SELECT is((SELECT count(*)::integer FROM public.moderation_actions WHERE report_id = (SELECT report_id FROM admin_test_context) AND action_type = 'set_report_status'), 2, 'each report transition has its own audit record');
SELECT ok(EXISTS (SELECT 1 FROM public.moderation_actions m JOIN admin_test_context t ON m.target_user_id = t.cp
  WHERE m.action_type = 'ban_user' AND m.actor_id = t.ap AND m.actor_kind = 'admin' AND m.created_at IS NOT NULL), 'ban audit records moderator action target and database timestamp');
SELECT is((SELECT visibility_status FROM public.activities WHERE id = (SELECT activity_id FROM admin_test_context)), 'hidden', 'remove means hide, retaining record');
SELECT is((SELECT status FROM public.activities WHERE id = (SELECT activity_id FROM admin_test_context)), 'cancelled', 'admin cancellation persisted');
SELECT is((SELECT status FROM public.activity_participants WHERE activity_id = (SELECT participant_activity_id FROM admin_test_context) AND user_id = (SELECT cp FROM admin_test_context)), 'removed', 'suspension removes active membership');
SELECT is((SELECT is_active FROM public.categories WHERE id = (SELECT category_id FROM admin_test_context)), false, 'category disabled without deleting taxonomy');

SELECT set_config('request.jwt.claim.sub', c::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true) FROM admin_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_is_eligible(), false, 'banned C old session loses normal app authority');
SELECT is(public.jomlepakz_current_user_has_approved_identity(), false, 'banned C denied approved identity');
SELECT throws_ok('SELECT public.jomlepakz_saved_activities()', '42501', NULL::text, 'banned C cannot bypass through normal bookmarks');
RESET ROLE;
UPDATE public.admin_memberships SET status = 'revoked', revoked_at = clock_timestamp() WHERE user_id = (SELECT ap FROM admin_test_context);
SELECT set_config('request.jwt.claim.sub', a::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM admin_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_is_admin(), false, 'membership revocation takes effect with old session');
SELECT throws_ok('SELECT public.jomlepakz_admin_dashboard()', '42501', NULL::text, 'revoked A cannot retrieve dashboard');
SELECT throws_ok('SELECT public.jomlepakz_admin_action(''hide_activity'', owned_id, 1, ''Old session'') FROM admin_test_context', '42501', NULL::text, 'revoked A direct moderation denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
