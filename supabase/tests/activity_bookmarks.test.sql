-- LOCAL/DEVELOPMENT ONLY. Existing real A/B accounts; no identities are created.
-- All fixtures, test-only grants, visibility and suspension changes roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, jomlepakz_bookmark_api;
DO $test_acl$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, jomlepakz_bookmark_api', signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_set_activity_saved(uuid, boolean)', 'EXECUTE'), 'anonymous bookmark writes denied');
SELECT ok(NOT has_table_privilege('authenticated', 'public.saved_activities', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.saved_activities', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.saved_activities', 'DELETE')
  AND NOT pg_has_role('authenticated', 'jomlepakz_bookmark_api', 'MEMBER'), 'clients have RPC-only bookmark access');
SELECT ok(NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'jomlepakz_bookmark_api'), 'bookmark owner cannot bypass RLS');

CREATE TEMP TABLE bookmark_test_context AS
WITH eligible AS (
  SELECT p.id AS profile_id, u.id AS auth_id FROM public.profiles p JOIN auth.users u ON u.id = p.auth_user_id
  JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email)
  WHERE p.account_status = 'active' AND p.verified_at IS NOT NULL AND d.is_active
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
    AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
    AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
), pair AS (
  SELECT a.profile_id AS ap, a.auth_id AS a, b.profile_id AS bp, b.auth_id AS b FROM eligible a CROSS JOIN eligible b
  WHERE a.auth_id <> b.auth_id AND NOT EXISTS (SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a.profile_id AND blocked_id = b.profile_id) OR (blocker_id = b.profile_id AND blocked_id = a.profile_id))
  ORDER BY a.auth_id, b.auth_id LIMIT 1
)
SELECT (SELECT a FROM pair) AS a, (SELECT b FROM pair) AS b, (SELECT ap FROM pair) AS ap, (SELECT bp FROM pair) AS bp,
  (SELECT id FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_id,
  gen_random_uuid() AS activity_id;
GRANT SELECT ON bookmark_test_context TO authenticated, jomlepakz_bookmark_api;
SELECT ok(a IS NOT NULL AND b IS NOT NULL AND category_id IS NOT NULL,
  'A/B integration prerequisite: two existing real eligible unblocked accounts and active category') FROM bookmark_test_context;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity)
  SELECT activity_id, ap, category_id, 'Bookmark isolation fixture', 'Rolled-back bookmark check', 'UM Main Library',
    statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2
  FROM bookmark_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
-- Fail rather than silently claiming A/B coverage if the prerequisites are absent.
DO $prerequisites$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bookmark_test_context WHERE a IS NOT NULL AND b IS NOT NULL AND category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Two existing real eligible A/B accounts and active category are required';
  END IF;
END;
$prerequisites$;

SELECT set_config('request.jwt.claim.sub', a::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM bookmark_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_set_activity_saved(activity_id, true), true, 'A saves activity') FROM bookmark_test_context;
SELECT is(public.jomlepakz_set_activity_saved(activity_id, true), true, 'A duplicate save is idempotent') FROM bookmark_test_context;
SELECT is(public.jomlepakz_activity_saved(activity_id), true, 'A sees own saved state') FROM bookmark_test_context;
SELECT ok(EXISTS (SELECT 1 FROM bookmark_test_context t,
  LATERAL jsonb_array_elements(public.jomlepakz_saved_activities()->'items') entry
  WHERE entry->>'id' = t.activity_id::text AND entry->'activity'->>'id' = t.activity_id::text), 'A saved list contains own readable activity');
SELECT is(public.jomlepakz_activity_details(activity_id)->>'occupied', '1', 'bookmark does not increase attendance') FROM bookmark_test_context;
SELECT throws_ok('SELECT * FROM public.saved_activities', '42501', NULL::text, 'direct client bookmark reads denied');
SELECT throws_ok('INSERT INTO public.saved_activities SELECT bp, activity_id FROM bookmark_test_context', '42501', NULL::text, 'A cannot write B bookmark directly');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.saved_activities s JOIN bookmark_test_context t ON s.user_id = t.ap AND s.activity_id = t.activity_id), 1, 'duplicate save creates only one A row');
SELECT is((SELECT count(*)::integer FROM public.activity_participants p JOIN bookmark_test_context t ON p.activity_id = t.activity_id), 0, 'saving creates no participant row');

SELECT set_config('request.jwt.claim.sub', b::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM bookmark_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_saved(activity_id), false, 'B does not see A saved state') FROM bookmark_test_context;
SELECT is(public.jomlepakz_set_activity_saved(activity_id, false), false, 'B unsave cannot delete A bookmark') FROM bookmark_test_context;
SELECT is(public.jomlepakz_set_activity_saved(activity_id, true), true, 'B independently saves same activity') FROM bookmark_test_context;
RESET ROLE;
-- Exercise the actual RPC owner RLS, rather than only testing the function's WHERE clauses.
SET LOCAL ROLE jomlepakz_bookmark_api;
SELECT is((SELECT count(*)::integer FROM public.saved_activities s JOIN bookmark_test_context t ON s.user_id = t.ap AND s.activity_id = t.activity_id), 0, 'B context cannot read A row under owner RLS');
SELECT throws_ok('INSERT INTO public.saved_activities SELECT ap, gen_random_uuid() FROM bookmark_test_context',
  '42501', NULL::text, 'owner RLS rejects forged A ownership');
WITH removed AS (DELETE FROM public.saved_activities s USING bookmark_test_context t
  WHERE s.user_id = t.ap AND s.activity_id = t.activity_id RETURNING s.activity_id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'B context cannot delete A row under owner RLS');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.saved_activities s JOIN bookmark_test_context t ON s.activity_id = t.activity_id), 2, 'A and B bookmarks coexist');

UPDATE public.activities SET visibility_status = 'hidden' WHERE id = (SELECT activity_id FROM bookmark_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(activity_id), NULL::jsonb, 'bookmark grants no hidden activity access') FROM bookmark_test_context;
SELECT is((SELECT entry->'activity' FROM bookmark_test_context t,
  LATERAL jsonb_array_elements(public.jomlepakz_saved_activities()->'items') entry
  WHERE entry->>'id' = t.activity_id::text), 'null'::jsonb, 'saved list retains removable bookmark without hidden payload');
SELECT throws_ok('SELECT public.jomlepakz_set_activity_saved(activity_id, true) FROM bookmark_test_context',
  'P0001', NULL::text, 'cannot save hidden activity');
SELECT is(public.jomlepakz_set_activity_saved(activity_id, false), false, 'B removes unavailable saved activity') FROM bookmark_test_context;
SELECT is(public.jomlepakz_set_activity_saved(activity_id, false), false, 'repeated unsave is harmless') FROM bookmark_test_context;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.saved_activities s JOIN bookmark_test_context t ON s.user_id = t.ap AND s.activity_id = t.activity_id), 1, 'B unsave preserves A row');

UPDATE public.activities SET visibility_status = 'visible' WHERE id = (SELECT activity_id FROM bookmark_test_context);
INSERT INTO public.blocked_users (blocker_id, blocked_id) SELECT ap, bp FROM bookmark_test_context;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_set_activity_saved(activity_id, true) FROM bookmark_test_context',
  'P0001', NULL::text, 'host block prevents B saving');
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = (SELECT bp FROM bookmark_test_context);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_saved_activities()', '42501', NULL::text, 'suspended B cannot list with old session');
SELECT throws_ok('SELECT public.jomlepakz_set_activity_saved(activity_id, false) FROM bookmark_test_context',
  '42501', NULL::text, 'suspended B cannot mutate with old session');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', a::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM bookmark_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_saved(activity_id), true, 'A bookmark survives every B operation') FROM bookmark_test_context;
RESET ROLE;
CREATE TEMP TABLE bookmark_extra_activities AS SELECT gen_random_uuid() AS id FROM generate_series(1, 20);
GRANT SELECT ON bookmark_extra_activities TO authenticated;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity)
  SELECT e.id, t.ap, t.category_id, 'Bookmark pagination fixture', 'Rolled-back pagination check', 'UM Main Library',
    statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2
  FROM bookmark_extra_activities e CROSS JOIN bookmark_test_context t;
SET LOCAL ROLE authenticated;
DO $save_page_fixtures$
DECLARE target uuid;
BEGIN
  FOR target IN SELECT id FROM bookmark_extra_activities LOOP
    PERFORM public.jomlepakz_set_activity_saved(target, true);
  END LOOP;
END;
$save_page_fixtures$;
SELECT is(jsonb_array_length(public.jomlepakz_saved_activities()->'items'), 20, 'saved first page is bounded to twenty');
SELECT is(public.jomlepakz_saved_activities()->>'hasNext', 'true', 'twenty-one saves expose Next');
SELECT ok(jsonb_array_length(public.jomlepakz_saved_activities(2)->'items') > 0, 'second saved page is reachable');
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.jomlepakz_saved_activities()->'items') first_page
  JOIN jsonb_array_elements(public.jomlepakz_saved_activities(2)->'items') second_page
  ON first_page->>'id' = second_page->>'id'), 'stable saved pages do not repeat IDs');
SELECT is(public.jomlepakz_set_activity_saved(activity_id, false), false, 'A removes own bookmark') FROM bookmark_test_context;
SELECT throws_ok('SELECT public.jomlepakz_saved_activities(0)', '22023', NULL::text, 'invalid page denied');
SELECT throws_ok('SELECT public.jomlepakz_set_activity_saved(NULL, true)', '22023', NULL::text, 'null bookmark target denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
