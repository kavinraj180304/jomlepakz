-- LOCAL DEVELOPMENT ONLY: existing real host A/participant B; fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;
DO $test_acl$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_activity_dashboard(text, integer)', 'EXECUTE'), 'anonymous dashboard reads denied');
SELECT ok(NOT has_table_privilege('authenticated', 'public.activity_participants', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.activities', 'SELECT')
  AND NOT pg_has_role('authenticated', 'jomlepakz_dashboard_api', 'MEMBER'), 'clients cannot bypass dashboard through raw tables or role membership');
SELECT ok(NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'jomlepakz_dashboard_api'), 'dashboard owner respects RLS');

CREATE TEMP TABLE dashboard_test_context AS
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
  (SELECT id FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_id;
DO $prerequisites$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_test_context WHERE a IS NOT NULL AND b IS NOT NULL AND category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Two existing real eligible A/B accounts and active category are required';
  END IF;
END;
$prerequisites$;
CREATE TEMP TABLE dashboard_fixture_ids AS
  SELECT gen_random_uuid() AS id, 'future' || n AS kind FROM generate_series(1, 21) n
  UNION ALL SELECT gen_random_uuid(), kind FROM unnest(ARRAY['ongoing', 'ended', 'completed', 'cancelled', 'pending', 'left', 'removed', 'declined', 'saved', 'unrelated']) kind;
GRANT SELECT ON dashboard_test_context, dashboard_fixture_ids TO authenticated;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity, status, cancelled_at, completed_at)
  SELECT f.id, CASE WHEN f.kind = 'unrelated' THEN t.bp ELSE t.ap END, t.category_id,
    'Dashboard ' || f.kind, 'Rolled-back dashboard fixture', 'UM Main Library',
    CASE WHEN f.kind IN ('ended', 'completed') THEN statement_timestamp() - interval '2 hours'
      WHEN f.kind = 'ongoing' THEN statement_timestamp() - interval '1 minute' ELSE statement_timestamp() + interval '2 days' END,
    CASE WHEN f.kind IN ('ended', 'completed') THEN statement_timestamp() - interval '1 hour'
      WHEN f.kind = 'ongoing' THEN statement_timestamp() + interval '1 hour' ELSE statement_timestamp() + interval '2 days 1 hour' END,
    2, CASE WHEN f.kind IN ('completed', 'cancelled') THEN f.kind ELSE 'scheduled' END,
    CASE WHEN f.kind = 'cancelled' THEN statement_timestamp() END,
    CASE WHEN f.kind = 'completed' THEN statement_timestamp() END
  FROM dashboard_fixture_ids f CROSS JOIN dashboard_test_context t;
INSERT INTO public.activity_participants (activity_id, user_id, status, joined_at)
  SELECT f.id, t.bp, CASE WHEN f.kind IN ('pending', 'left', 'removed', 'declined') THEN f.kind ELSE 'joined' END,
    CASE WHEN f.kind NOT IN ('pending', 'left', 'removed', 'declined') THEN clock_timestamp() END
  FROM dashboard_fixture_ids f CROSS JOIN dashboard_test_context t WHERE f.kind NOT IN ('saved', 'unrelated');

-- Collect every page so unrelated pre-existing account activity cannot change assertions.
CREATE FUNCTION pg_temp.dashboard_test_items(section text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $test_function$
DECLARE result jsonb := '[]'::jsonb; response jsonb; page integer;
BEGIN
  FOR page IN 1..500 LOOP
    response := public.jomlepakz_activity_dashboard(section, page);
    result := result || (response->'items');
    EXIT WHEN response->>'hasNext' = 'false';
  END LOOP;
  RETURN result;
END;
$test_function$;
REVOKE ALL ON FUNCTION pg_temp.dashboard_test_items(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.dashboard_test_items(text) TO authenticated;

SELECT set_config('request.jwt.claim.sub', a::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM dashboard_test_context;
SET LOCAL ROLE authenticated;
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.dashboard_test_items('Hosting')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text
  WHERE f.kind = 'future1' AND entry->>'relationship' = 'host'
    AND entry->'activity'->>'isHost' = 'true' AND entry->'activity'->>'canEdit' = 'true'), 'host A sees owned future record with edit authority');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 0, 'A does not join own hosted fixture activities');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Past')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 3, 'A sees owned ended/completed/cancelled history');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', b::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM dashboard_test_context;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 22, 'B sees twenty-one future and one ongoing joined fixtures');
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  WHERE entry->'activity'->>'canEdit' = 'true' OR entry->'activity'->'revision' <> 'null'::jsonb), 'B joined projection has no host edit controls or revision');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind IN ('pending', 'left', 'removed', 'declined')), 0, 'non-joined relationships excluded');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Hosting')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind <> 'unrelated'), 0, 'B cannot see A fixtures in Hosting');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Past')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 3, 'B preserved joined history includes ended/completed/cancelled');
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind = 'ongoing'
  AND entry->'activity'->>'inProgress' = 'true' AND entry->'activity'->>'upcoming' = 'false'), 'ongoing record remains active with correct time flags');
SELECT is(jsonb_array_length(public.jomlepakz_activity_dashboard('Joined', 1)->'items'), 20, 'Joined first page bounded to twenty');
SELECT is(public.jomlepakz_activity_dashboard('Joined', 1)->>'hasNext', 'true', 'Joined exposes Next');
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.jomlepakz_activity_dashboard('Joined', 1)->'items') first_page
  JOIN jsonb_array_elements(public.jomlepakz_activity_dashboard('Joined', 2)->'items') second_page
  ON first_page->>'id' = second_page->>'id'), 'unchanged Joined pages have no duplicate records');
SELECT is(public.jomlepakz_set_activity_saved(id, true), true, 'B saves without joining') FROM dashboard_fixture_ids WHERE kind = 'saved';
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind = 'saved'), 0, 'saved-only record never enters Joined');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Past')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind = 'saved'), 0, 'saved-only record never enters Past');
SELECT throws_ok('SELECT public.jomlepakz_activity_dashboard(''Admin'', 1)', '22023', NULL::text, 'unsupported section denied');
SELECT throws_ok('SELECT public.jomlepakz_activity_dashboard(''Joined'', 0)', '22023', NULL::text, 'invalid page denied');
SELECT throws_ok('SELECT public.jomlepakz_cancel_activity(id, 1) FROM dashboard_fixture_ids WHERE kind = ''future1''',
  '42501', NULL::text, 'B cannot cancel A activity through RPC');
RESET ROLE;

UPDATE public.activities SET visibility_status = 'hidden' WHERE id = (SELECT id FROM dashboard_fixture_ids WHERE kind = 'future1');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text WHERE f.kind = 'future1'), 0, 'hidden joined record excluded by RLS');
RESET ROLE;
INSERT INTO public.blocked_users (blocker_id, blocked_id) SELECT ap, bp FROM dashboard_test_context;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Joined')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 0, 'host block hides joined fixtures');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.dashboard_test_items('Past')) entry
  JOIN dashboard_fixture_ids f ON entry->>'id' = f.id::text), 0, 'host block hides history fixtures');
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = (SELECT bp FROM dashboard_test_context);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_activity_dashboard(''Joined'', 1)', '42501', NULL::text, 'suspended B old session denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
