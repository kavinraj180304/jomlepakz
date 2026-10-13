-- LOCAL DEVELOPMENT ONLY. Requires existing reviewed admin A and real non-admin B/C.
-- No users or admin memberships are created. Every fixture/change rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, jomlepakz_completion_api;
DO $test_acl$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, jomlepakz_completion_api', signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_memberships', 'INSERT') AND NOT pg_has_role('authenticated', 'jomlepakz_admin_api', 'MEMBER'), 'no student self-grant or API role escalation');
SELECT ok(NOT has_table_privilege('jomlepakz_admin_api', 'public.messages', 'SELECT'), 'dashboard owner has no private chat access');
CREATE TEMP TABLE feedback_test_context AS
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
  IF NOT EXISTS (SELECT 1 FROM feedback_test_context WHERE a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL AND category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = bp AND blocked_id = cp) OR (blocker_id = cp AND blocked_id = bp))) THEN
    RAISE EXCEPTION 'Existing reviewed admin A and two eligible real unblocked non-admin B/C accounts are required'; END IF;
END;
$preconditions$;
GRANT SELECT ON feedback_test_context TO authenticated;

GRANT SELECT ON feedback_test_context TO jomlepakz_completion_api;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity)
  SELECT activity_id, bp, category_id, 'Ended activity fixture', 'Completion check', 'UM Main Library', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour', 3 FROM feedback_test_context
  UNION ALL SELECT owned_id, bp, category_id, 'Future activity fixture', 'Early completion check', 'UM Main Library', statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 3 FROM feedback_test_context
  UNION ALL SELECT participant_activity_id, bp, category_id, 'Admin completion fixture', 'Snapshot check', 'UM Main Library', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour', 3 FROM feedback_test_context;
INSERT INTO public.activity_participants (activity_id, user_id, status, requested_at, joined_at, status_changed_at)
  SELECT activity_id, cp, 'joined', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '3 hours' FROM feedback_test_context
  UNION ALL SELECT owned_id, cp, 'pending', statement_timestamp(), NULL::timestamptz, statement_timestamp() FROM feedback_test_context;
SELECT set_config('request.jwt.claim.sub', b::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM feedback_test_context;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_complete_activity(owned_id, 1) FROM feedback_test_context', '22023', NULL::text, 'host cannot complete before end time');
SELECT public.jomlepakz_complete_activity(activity_id, 1) FROM feedback_test_context;
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(activity_id, ''Host self feedback'') FROM feedback_test_context', '42501', NULL::text, 'host cannot submit participant feedback');
SELECT throws_ok('SELECT public.jomlepakz_complete_activity(activity_id, 1) FROM feedback_test_context', '40001', NULL::text, 'stale completion retry cannot change frozen state');
RESET ROLE;
SELECT is((SELECT status FROM public.activities WHERE id = (SELECT activity_id FROM feedback_test_context)), 'completed', 'host completion persists completed lifecycle');
SELECT ok((SELECT completed_at >= ends_at FROM public.activities WHERE id = (SELECT activity_id FROM feedback_test_context)), 'database completion timestamp is after end');
SELECT is((SELECT count(*)::integer FROM private.activity_feedback_eligibility WHERE activity_id = (SELECT activity_id FROM feedback_test_context)), 1, 'only accepted non-host is captured');

SELECT set_config('request.jwt.claim.sub', c::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true) FROM feedback_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_feedback_state(activity_id)->>'state', 'ready', 'accepted C sees ready feedback state') FROM feedback_test_context;
SELECT throws_ok('SELECT public.jomlepakz_complete_activity(owned_id, 1) FROM feedback_test_context', '42501', NULL::text, 'participant cannot complete activity');
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(owned_id, ''Pending feedback'') FROM feedback_test_context', '42501', NULL::text, 'pending participant cannot submit');
SELECT is(public.jomlepakz_submit_activity_feedback(activity_id, 'Private text only'), true, 'accepted C submits after completion') FROM feedback_test_context;
SELECT is(public.jomlepakz_submit_activity_feedback(activity_id, 'Private text only'), true, 'same-text transport retry is idempotent') FROM feedback_test_context;
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(activity_id, ''Replace feedback'') FROM feedback_test_context', '23505', NULL::text, 'second entry/edit forbidden');
SELECT is(public.jomlepakz_activity_feedback_state(activity_id)->>'body', 'Private text only', 'author can read own private text') FROM feedback_test_context;
SELECT throws_ok('SELECT * FROM public.activity_feedback', '42501', NULL::text, 'raw client feedback read denied');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.activity_feedback WHERE activity_id = (SELECT activity_id FROM feedback_test_context)), 1, 'one entry per user/activity');

SELECT set_config('request.jwt.claim.sub', b::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM feedback_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_feedback_state(activity_id)->'body', 'null'::jsonb, 'host cannot read participant feedback') FROM feedback_test_context;
RESET ROLE;
SET LOCAL ROLE jomlepakz_completion_api;
SELECT is((SELECT count(*)::integer FROM public.activity_feedback WHERE activity_id = (SELECT activity_id FROM feedback_test_context)), 0, 'owner-role RLS hides participant feedback from host context');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', a::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM feedback_test_context;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_complete_activity(owned_id, 1, ''Admin review'') FROM feedback_test_context', '22023', NULL::text, 'admin also cannot complete early');
SELECT public.jomlepakz_complete_activity(participant_activity_id, 1, 'Activity ended') FROM feedback_test_context;
SELECT is(public.jomlepakz_activity_feedback_state(activity_id)->'body', 'null'::jsonb, 'unrelated admin receives no private feedback body') FROM feedback_test_context;
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(activity_id, ''Admin nonparticipant'') FROM feedback_test_context', '42501', NULL::text, 'admin cannot submit without participant entitlement');
RESET ROLE;
SELECT ok(EXISTS (SELECT 1 FROM public.moderation_actions m JOIN feedback_test_context t ON m.target_activity_id = t.participant_activity_id
  WHERE m.actor_id = t.ap AND m.action_type = 'complete_activity'), 'admin completion has moderator/action/target/time audit');
-- A late trusted membership insert must not create completion-time entitlement.
INSERT INTO public.activity_participants (activity_id, user_id, status, joined_at)
  SELECT participant_activity_id, cp, 'joined', clock_timestamp() FROM feedback_test_context;
SELECT set_config('request.jwt.claim.sub', c::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true) FROM feedback_test_context;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(participant_activity_id, ''Late membership'') FROM feedback_test_context', '42501', NULL::text, 'late membership cannot bypass frozen entitlement');
RESET ROLE;
INSERT INTO public.blocked_users (blocker_id, blocked_id) SELECT cp, bp FROM feedback_test_context
  ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(activity_id, ''Private text only'') FROM feedback_test_context', '42501', NULL::text, 'host block enforced on feedback RPC');
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = (SELECT cp FROM feedback_test_context);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_activity_feedback_state(activity_id) FROM feedback_test_context', '42501', NULL::text, 'suspended old session cannot read state');
SELECT throws_ok('SELECT public.jomlepakz_submit_activity_feedback(activity_id, ''Private text only'') FROM feedback_test_context', '42501', NULL::text, 'suspended old session cannot submit');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
