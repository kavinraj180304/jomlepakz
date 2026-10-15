-- Local only after all migrations. Uses existing real identities; no users or
-- profiles are created/activated. Test activities and all changes roll back.
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
SELECT ok(NOT has_function_privilege('anon', 'private.activity_caller_uid()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.activity_caller_uid()', 'EXECUTE'), 'browser roles cannot execute activity caller helper');
SELECT ok(has_function_privilege('jomlepakz_activity_api', 'private.activity_caller_uid()', 'EXECUTE'), 'restricted activity owner can execute caller helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.activity_caller_uid()'::regprocedure
  AND prosecdef AND provolatile='s' AND prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
  AND pronargs=0 AND prorettype='uuid'::regtype AND proowner='postgres'::regrole
  AND proconfig @> ARRAY['search_path=pg_catalog']), 'private caller helper has bounded postgres execution');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
  WHERE p.oid='private.activity_caller_uid()'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'), 'PUBLIC cannot execute activity caller helper');
SELECT ok(to_regprocedure('public.activity_caller_uid()') IS NULL, 'no public caller helper wrapper');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.activity_actor()'::regprocedure
  AND NOT prosecdef AND proowner='jomlepakz_activity_api'::regrole
  AND prosrc !~ 'auth[[:space:]]*\.' AND prosrc LIKE '%private.activity_caller_uid()%'), 'actor retains restricted invoker ownership and uses caller helper');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public'
  AND policyname IN ('activity_api_profile_self','activity_api_owned_read','activity_api_owned_insert','activity_api_owned_update')
  AND coalesce(qual,'') !~ 'auth[[:space:]]*\.' AND coalesce(with_check,'') !~ 'auth[[:space:]]*\.'
  AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%activity_caller_uid%'), 4, 'four host policies use private caller helper');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner='jomlepakz_activity_api'::regrole
  AND prosrc ~ 'auth[[:space:]]*\.'), 'restricted activity functions have no direct Auth reference');
SELECT ok(NOT has_any_column_privilege('jomlepakz_activity_api', 'auth.users', 'SELECT')
  AND NOT has_any_column_privilege('jomlepakz_activity_api', 'auth.users', 'UPDATE'), 'activity role has no Auth table reads or writes');
SELECT ok(NOT pg_has_role('postgres', 'jomlepakz_activity_api', 'MEMBER'), 'temporary migration membership removed');
-- Reproduce the hosted boundary only inside this isolated local rollback test.
REVOKE USAGE ON SCHEMA auth FROM jomlepakz_activity_api;
SELECT ok(NOT has_schema_privilege('jomlepakz_activity_api','auth','USAGE'), 'local fixture has no restricted-role Auth schema usage');
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_save_activity(jsonb,uuid,bigint,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.jomlepakz_cancel_activity(uuid,bigint)', 'EXECUTE'), 'anon cannot mutate activities');
SELECT ok(has_function_privilege('authenticated', 'public.jomlepakz_save_activity(jsonb,uuid,bigint,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.activity_actor()', 'EXECUTE'), 'only public approved RPCs executable');
SELECT ok(NOT has_table_privilege('authenticated', 'public.activities', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.activities', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.activities', 'DELETE'), 'raw mutations remain denied');
SELECT ok(NOT pg_has_role('authenticated', 'jomlepakz_activity_api', 'MEMBER')
  AND NOT has_column_privilege('jomlepakz_activity_api', 'public.activities', 'host_id', 'UPDATE')
  AND NOT has_column_privilege('jomlepakz_activity_api', 'public.activities', 'visibility_status', 'UPDATE'), 'no impersonation or moderation grant');
SELECT is((SELECT count(*)::integer FROM pg_proc p WHERE p.proname IN ('jomlepakz_activity_categories',
  'jomlepakz_my_activities', 'jomlepakz_save_activity', 'jomlepakz_cancel_activity')
  AND p.proowner = 'jomlepakz_activity_api'::regrole AND p.prosecdef
  AND p.proconfig @> ARRAY['search_path=pg_catalog']), 4, 'four bounded definer APIs have narrow owner and fixed path');

CREATE TEMP TABLE activity_test_context AS
WITH eligible AS (SELECT u.id FROM auth.users u JOIN public.profiles p ON p.auth_user_id = u.id
  JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email)
  WHERE p.account_status = 'active' AND p.verified_at IS NOT NULL AND d.is_active
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
    AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
    AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
  ORDER BY u.created_at, u.id LIMIT 2)
SELECT (SELECT id FROM eligible LIMIT 1) AS a,
  (SELECT id FROM eligible OFFSET 1 LIMIT 1) AS b,
  (SELECT count(*) FROM public.categories) AS category_count,
  coalesce((SELECT jsonb_agg(jsonb_build_object('slug',slug,'name',name) ORDER BY sort_order,name)
    FROM public.categories WHERE is_active), '[]'::jsonb) AS expected_categories,
  gen_random_uuid() AS request_id, NULL::uuid AS activity_id,
  jsonb_build_object('title', 'Local authorization test', 'description', 'Rolled-back real-caller test',
    'category_slug', (SELECT slug FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1),
    'starts_at', statement_timestamp() + interval '2 days', 'duration_minutes', 60, 'capacity', 8,
    'location_choice', 'um-main-library', 'custom_location', '', 'join_mode', 'approval', 'cover_key', 'none') AS input;
GRANT SELECT ON activity_test_context TO authenticated;
GRANT UPDATE (activity_id) ON activity_test_context TO authenticated;
SELECT skip('requires an existing eligible real local A account and active seeded category', 1)
  FROM activity_test_context WHERE a IS NULL OR input ->> 'category_slug' IS NULL;
SELECT set_config('request.jwt.claim.sub', coalesce(a::text, ''), true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true)
  FROM activity_test_context;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT private.activity_caller_uid()', '42501', NULL::text, 'browser cannot invoke caller helper directly');
SELECT is(public.jomlepakz_activity_categories(), expected_categories,
  'eligible caller gets active categories without Auth schema usage, including empty-array result')
  FROM activity_test_context WHERE a IS NOT NULL;
SELECT is(public.jomlepakz_activity_categories(), '[]'::jsonb, 'zero category rows return empty array')
  FROM activity_test_context WHERE a IS NOT NULL AND category_count=0;
SELECT skip('zero-row categories assertion needs an eligible caller and an empty local category table', 1)
  FROM activity_test_context WHERE a IS NULL OR category_count<>0;
UPDATE activity_test_context SET activity_id = public.jomlepakz_save_activity(input, NULL, NULL, request_id)
  WHERE a IS NOT NULL AND input ->> 'category_slug' IS NOT NULL;
SELECT is(public.jomlepakz_save_activity(input, NULL, NULL, request_id), activity_id,
  'retrying creation returns the same activity') FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT is(public.jomlepakz_my_activities(activity_id) ->> 'occupied', '1', 'host occupies exactly one seat')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,NULL,NULL,%L::uuid)',
  input || jsonb_build_object('host_id', a), gen_random_uuid()), '22023', NULL::text, 'forged host field rejected')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,NULL,NULL,%L::uuid)',
  jsonb_set(input, '{starts_at}', to_jsonb('2020-01-01T00:00:00Z'::text)), gen_random_uuid()),
  '22023', NULL::text, 'past creation denied by database') FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,%L::uuid,2,%L::uuid)',
  input, activity_id, request_id), '40001', NULL::text, 'stale edit revision denied')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,%L::uuid,1,%L::uuid)',
  jsonb_set(input, '{join_mode}', '"instant"'::jsonb), activity_id, request_id),
  '22023', NULL::text, 'approval mode is immutable') FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,NULL,NULL,%L::uuid)',
  jsonb_set(input, '{cover_key}', '"https://evil.test/image.svg"'::jsonb), gen_random_uuid()),
  '22023', NULL::text, 'unapproved image denied by database') FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT is(public.jomlepakz_save_activity(input, activity_id, 1, request_id), activity_id, 'own edit succeeds')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT is(public.jomlepakz_my_activities(activity_id) ->> 'revision', '2', 'edit advances server revision')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
RESET ROLE;

SELECT skip('requires a second eligible real local B account for cross-user assertions', 1)
  FROM activity_test_context WHERE b IS NULL OR activity_id IS NULL;
SELECT set_config('request.jwt.claim.sub', coalesce(b::text, ''), true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true)
  FROM activity_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_my_activities(activity_id), NULL::jsonb, 'B cannot read A private host-management data')
  FROM activity_test_context WHERE b IS NOT NULL AND activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,%L::uuid,2,%L::uuid)',
  input, activity_id, request_id), '42501', NULL::text, 'B cannot edit A activity')
  FROM activity_test_context WHERE b IS NOT NULL AND activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_cancel_activity(%L::uuid,2)', activity_id),
  '42501', NULL::text, 'B cannot cancel A activity') FROM activity_test_context WHERE b IS NOT NULL AND activity_id IS NOT NULL;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', coalesce(a::text, ''), true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true)
  FROM activity_test_context;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_cancel_activity(activity_id, 2), activity_id, 'host cancellation succeeds')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT is(public.jomlepakz_my_activities(activity_id) ->> 'status', 'cancelled', 'cancelled history retained')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT is(public.jomlepakz_cancel_activity(activity_id, 2), activity_id, 'repeat cancellation is idempotent')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
SELECT throws_ok(format('SELECT public.jomlepakz_save_activity(%L::jsonb,%L::uuid,3,%L::uuid)',
  input, activity_id, request_id), 'P0001', NULL::text, 'cancelled activity cannot be edited')
  FROM activity_test_context WHERE activity_id IS NOT NULL;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
