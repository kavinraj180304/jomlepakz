-- Run on local Supabase after ALL migrations. No synthetic users/service keys.
-- Operator access sets up assertions; actual requests execute as client roles.
-- Everything, including the optional real-profile unlink, rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;
DO $test_acl$
DECLARE function_signature text;
BEGIN
  FOR function_signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', function_signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();

-- Exercise real default ACLs on fresh, rolled-back probes (no explicit revokes).
CREATE FUNCTION public.jomlepakz_foundation_acl_probe() RETURNS boolean
  LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS 'SELECT true';
CREATE FUNCTION private.jomlepakz_foundation_acl_probe() RETURNS boolean
  LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS 'SELECT true';
CREATE TABLE public.jomlepakz_foundation_acl_probe_table (id integer);
CREATE SEQUENCE public.jomlepakz_foundation_acl_probe_sequence;
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_foundation_acl_probe()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.jomlepakz_foundation_acl_probe()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.jomlepakz_foundation_acl_probe()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.jomlepakz_foundation_acl_probe()', 'EXECUTE'),
  'new functions do not inherit public or direct client execution');
SELECT ok(NOT has_table_privilege('anon', 'public.jomlepakz_foundation_acl_probe_table', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.jomlepakz_foundation_acl_probe_table', 'INSERT'),
  'new tables do not inherit client access');
SELECT ok(NOT has_sequence_privilege('anon', 'public.jomlepakz_foundation_acl_probe_sequence', 'USAGE')
  AND NOT has_sequence_privilege('authenticated', 'public.jomlepakz_foundation_acl_probe_sequence', 'USAGE'),
  'new sequences do not inherit client access');

CREATE TEMP TABLE foundation_tables AS
SELECT unnest(ARRAY['profiles', 'categories', 'activities', 'activity_participants',
  'saved_activities', 'messages', 'notifications', 'reports', 'blocked_users',
  'admin_memberships', 'moderation_actions', 'activity_feedback']) AS name;
CREATE TEMP TABLE foundation_denied_queries AS
SELECT t.name, operation, CASE operation
  WHEN 'SELECT' THEN format('SELECT * FROM public.%I LIMIT 1', t.name)
  WHEN 'INSERT' THEN format('INSERT INTO public.%I DEFAULT VALUES', t.name)
  WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I = %I WHERE false', t.name, a.attname, a.attname)
  WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE false', t.name)
END AS query FROM foundation_tables t
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS operations(operation)
JOIN pg_attribute a ON a.attrelid = format('public.%I', t.name)::regclass AND a.attnum = 1;
GRANT SELECT ON foundation_denied_queries TO anon, authenticated;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM foundation_tables t CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) operations(name)
  WHERE has_table_privilege(roles.name, format('public.%I', t.name), operations.name)
), 'all client CRUD table privileges denied');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM foundation_tables t CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) operations(name)
  WHERE has_any_column_privilege(roles.name, format('public.%I', t.name), operations.name)
), 'no column-level escape around table revocation');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public'
  AND policyname = 'foundation_client_deny' AND permissive = 'RESTRICTIVE' AND cmd = 'ALL'
  AND roles = ARRAY['anon', 'authenticated']::name[]), 12, 'twelve restrictive vetoes');
SELECT ok(NOT pg_has_role('authenticated', 'jomlepakz_auth_gate', 'MEMBER')
  AND NOT pg_has_role('anon', 'jomlepakz_auth_gate', 'MEMBER'), 'clients cannot assume internal gate role');
SELECT ok(NOT has_schema_privilege('authenticated', 'public', 'CREATE')
  AND NOT has_schema_privilege('authenticated', 'private', 'CREATE'), 'no client schema creation');
SELECT ok(EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars' AND NOT public
  AND file_size_limit = 2097152 AND allowed_mime_types = ARRAY['image/webp']::text[]), 'private bounded avatar bucket');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'storage'
  AND policyname IN ('jomlepakz_avatar_foundation_deny', 'jomlepakz_avatar_bucket_config_deny')
  AND permissive = 'RESTRICTIVE' AND cmd = 'ALL'), 2, 'object and bucket configuration vetoes');
SELECT ok(NOT has_function_privilege('authenticated', 'private.record_unlinked_auth_identity()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.record_unlinked_auth_identity()', 'EXECUTE'), 'unlink trigger is not a client RPC');

-- Actual CRUD attempts, independently for each operation. No rows are created.
SET LOCAL ROLE anon;
SELECT throws_ok(query, '42501', NULL::text, 'anon denied ' || operation || ' ' || name)
  FROM foundation_denied_queries ORDER BY name, operation;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(query, '42501', NULL::text, 'authenticated denied ' || operation || ' ' || name)
  FROM foundation_denied_queries ORDER BY name, operation;
SELECT is(public.jomlepakz_current_user_is_eligible(), false, 'missing subject cannot gain app access');
SELECT is(public.jomlepakz_current_user_has_approved_identity(), false, 'missing subject cannot pass identity gate');
RESET ROLE;

-- Repeat CRUD under real A/B/admin subjects. Membership never changes the
-- SQL client role; all three requests execute as authenticated, not an operator.
CREATE TEMP TABLE foundation_subjects AS
WITH users AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
  FROM auth.users WHERE NOT coalesce(is_anonymous, false)),
admin AS (SELECT u.id FROM auth.users u JOIN public.profiles p ON p.auth_user_id = u.id
  JOIN public.admin_memberships m ON m.user_id = p.id WHERE m.status = 'active' LIMIT 1)
SELECT 'A'::text AS label, id FROM users WHERE position = 1
UNION ALL SELECT 'B', id FROM users WHERE position = 2
UNION ALL SELECT 'admin', id FROM admin;
GRANT SELECT ON foundation_subjects TO authenticated;
SELECT skip('no real local user ' || label || '; run manual cross-user checks', 48)
FROM (VALUES ('A'), ('B'), ('admin')) labels(label)
WHERE NOT EXISTS (SELECT 1 FROM foundation_subjects s WHERE s.label = labels.label);
SET LOCAL ROLE authenticated;
-- A CTE materializes claim assignment before the corresponding CRUD assertion.
WITH subjects AS MATERIALIZED (
  SELECT label, set_config('request.jwt.claim.sub', id::text, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated')::text, true)
  FROM foundation_subjects WHERE label = 'A'
)
SELECT throws_ok(q.query, '42501', NULL::text, s.label || ' denied ' || q.operation || ' ' || q.name)
  FROM subjects s CROSS JOIN foundation_denied_queries q;
WITH subjects AS MATERIALIZED (
  SELECT label, set_config('request.jwt.claim.sub', id::text, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated')::text, true)
  FROM foundation_subjects WHERE label = 'B'
)
SELECT throws_ok(q.query, '42501', NULL::text, s.label || ' denied ' || q.operation || ' ' || q.name)
  FROM subjects s CROSS JOIN foundation_denied_queries q;
WITH subjects AS MATERIALIZED (
  SELECT label, set_config('request.jwt.claim.sub', id::text, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated')::text, true)
  FROM foundation_subjects WHERE label = 'admin'
)
SELECT throws_ok(q.query, '42501', NULL::text, s.label || ' denied ' || q.operation || ' ' || q.name)
  FROM subjects s CROSS JOIN foundation_denied_queries q;
RESET ROLE;

-- Check revocation with a real, eligible existing local identity if available.
-- This does not create or confirm a user, activate a profile or assign admin.
CREATE TEMP TABLE foundation_real_subject AS
SELECT u.id FROM auth.users u JOIN public.profiles p ON p.auth_user_id = u.id
JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email)
WHERE d.is_active AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
  AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
  AND p.account_status = 'active' AND p.verified_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
ORDER BY u.created_at LIMIT 1;
SELECT skip('no eligible real local account; run the manual identity-unlink test', 4)
  WHERE NOT EXISTS (SELECT 1 FROM foundation_real_subject);
SELECT set_config('request.jwt.claims', coalesce((SELECT jsonb_build_object('sub', id,
  'role', 'authenticated')::text FROM foundation_real_subject), '{}'), true);
SELECT set_config('request.jwt.claim.sub', coalesce((SELECT id::text FROM foundation_real_subject), ''), true);
-- Subject presence is a non-sensitive temp flag usable under client role.
CREATE TEMP TABLE foundation_has_subject AS SELECT EXISTS (SELECT 1 FROM foundation_real_subject) AS present;
GRANT SELECT ON foundation_has_subject TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_has_approved_identity(), true, 'real approved identity initially allowed')
  FROM foundation_has_subject WHERE present;
RESET ROLE;
UPDATE public.profiles SET auth_user_id = NULL, account_status = 'pending_verification', verified_at = NULL
  WHERE auth_user_id IN (SELECT id FROM foundation_real_subject);
SELECT ok(EXISTS (SELECT 1 FROM private.revoked_auth_identities r
  JOIN foundation_real_subject s ON s.id = r.auth_user_id), 'unlink records old identity')
  WHERE EXISTS (SELECT 1 FROM foundation_real_subject);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_has_approved_identity(), false, 'old real identity denied after unlink')
  FROM foundation_has_subject WHERE present;
SELECT is(public.jomlepakz_current_user_is_eligible(), false, 'unlinked identity denied full app access')
  FROM foundation_has_subject WHERE present;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
