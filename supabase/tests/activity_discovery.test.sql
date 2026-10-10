-- LOCAL ONLY, after all migrations and development categories.
-- Existing real eligible A/B accounts only; no synthetic users/profile activation.
-- Privileged fixture setup is rolled back. Assertions use authenticated/anon roles.
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
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_activity_details(uuid)', 'EXECUTE'), 'anon cannot read activity details');
SELECT ok(NOT has_table_privilege('authenticated', 'public.activities', 'SELECT')
  AND NOT has_function_privilege('authenticated', 'private.discovery_actor()', 'EXECUTE')
  AND NOT pg_has_role('authenticated', 'jomlepakz_discovery_api', 'MEMBER'), 'raw reads and internal helpers/role remain denied');
SELECT is((SELECT count(*)::integer FROM pg_proc WHERE proname IN ('jomlepakz_activity_details', 'jomlepakz_discover_activities')
  AND proowner = 'jomlepakz_discovery_api'::regrole AND prosecdef
  AND proconfig @> ARRAY['search_path=pg_catalog']), 2, 'read APIs have narrow owner and fixed path');

CREATE TEMP TABLE discovery_test_context AS
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
  gen_random_uuid() AS first_id, gen_random_uuid()::text AS marker;
GRANT SELECT ON discovery_test_context TO authenticated;
SELECT skip('behavior tests need two existing eligible unblocked real local accounts and active category', 1)
  FROM discovery_test_context WHERE a IS NULL OR category_id IS NULL;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity)
  SELECT CASE WHEN n = 1 THEN t.first_id ELSE gen_random_uuid() END, t.ap, t.category_id,
    t.marker || ' activity ' || n, 'Rolled-back local discovery check', 'UM Main Library',
    statement_timestamp() + interval '2 days' + n * interval '1 minute',
    statement_timestamp() + interval '2 days' + n * interval '1 minute' + interval '1 hour', 2
  FROM discovery_test_context t CROSS JOIN generate_series(1, 21) n WHERE t.a IS NOT NULL AND t.category_id IS NOT NULL;
UPDATE public.profiles SET profile_visibility = 'activity_members' WHERE id = (SELECT ap FROM discovery_test_context);
SELECT set_config('request.jwt.claim.sub', coalesce(b::text, ''), true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM discovery_test_context;
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.jomlepakz_discover_activities(marker)->'items'), 20, 'first page has twenty real rows')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(public.jomlepakz_discover_activities(marker)->>'hasNext', 'true', 'next page indicated')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(jsonb_array_length(public.jomlepakz_discover_activities(marker, '', 'Upcoming', false, false, 2)->'items'), 1, 'second page has remaining row')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(public.jomlepakz_activity_details(first_id)->>'hostName', 'UM activity host', 'non-member cannot read private host name')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(public.jomlepakz_activity_details(first_id)->>'occupied', '1', 'host is one occupied seat')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(public.jomlepakz_activity_details(first_id)->>'revision', NULL::text, 'B cannot read host edit revision')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(public.jomlepakz_activity_details(gen_random_uuid()), NULL::jsonb, 'unknown UUID returns no record')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT throws_ok('SELECT public.jomlepakz_discover_activities(p_page => 0)', '22023', NULL::text, 'invalid pagination denied')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;

INSERT INTO public.activity_participants (activity_id, user_id, status)
  SELECT first_id, bp, 'pending' FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id)->>'occupied', '1', 'pending request does not occupy a seat')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.activity_participants SET status = 'joined', joined_at = statement_timestamp(), status_changed_at = statement_timestamp()
  WHERE activity_id = (SELECT first_id FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id)->>'occupied', '2', 'joined participant plus host fills activity')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SELECT is(jsonb_array_length(public.jomlepakz_discover_activities(marker, '', 'Upcoming', true)->'items'), 20, 'available filter excludes full activity')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.activities SET visibility_status = 'hidden' WHERE id = (SELECT first_id FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id), NULL::jsonb, 'hidden record denied even to joined B')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.activities SET visibility_status = 'visible', status = 'cancelled', cancelled_at = statement_timestamp()
  WHERE id = (SELECT first_id FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id)->>'status', 'cancelled', 'joined B can read cancelled history')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.activities SET status = 'completed', cancelled_at = NULL,
  starts_at = statement_timestamp() - interval '2 hours', ends_at = statement_timestamp() - interval '1 hour', completed_at = statement_timestamp()
  WHERE id = (SELECT first_id FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id)->>'status', 'completed', 'joined B can read completed history')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.activity_participants SET status = 'left', status_changed_at = statement_timestamp()
  WHERE activity_id = (SELECT first_id FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_activity_details(first_id), NULL::jsonb, 'former member cannot read terminal record')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
INSERT INTO public.blocked_users (blocker_id, blocked_id)
  SELECT ap, bp FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.jomlepakz_discover_activities(marker)->'items'), 0, 'host blocking B hides all hosted discovery')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.blocked_users SET blocker_id = (SELECT bp FROM discovery_test_context), blocked_id = (SELECT ap FROM discovery_test_context)
  WHERE blocker_id = (SELECT ap FROM discovery_test_context) AND blocked_id = (SELECT bp FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.jomlepakz_discover_activities(marker)->'items'), 0, 'B blocking host also hides discovery')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = (SELECT bp FROM discovery_test_context);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_discover_activities()', '42501', NULL::text, 'suspended B denied with existing JWT')
  FROM discovery_test_context WHERE a IS NOT NULL AND category_id IS NOT NULL;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
