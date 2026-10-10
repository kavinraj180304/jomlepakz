-- Local database only. No Auth users/profiles are created or modified.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, supabase_auth_admin;
-- Test-only extension grants, not application grants; all rolled back.
DO $test_acl$
DECLARE function_signature text;
BEGIN
  FOR function_signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, supabase_auth_admin', function_signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();

SELECT is(private.normalized_email_domain(E' Student@SISWA.UM.EDU.MY\t'),
  'siswa.um.edu.my', 'approved domain is normalized exactly');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY[
    '', 'student', '@siswa.um.edu.my', 'a@@siswa.um.edu.my',
    'a b@siswa.um.edu.my', 'a..b@siswa.um.edu.my', '.a@siswa.um.edu.my',
    'a@siswa.um.edu.my.', 'a@siswa..um.edu.my', 'a@-siswa.um.edu.my',
    'a@siswa.um.edu.my' || chr(1), 'a@siśwa.um.edu.my'
  ]) AS malformed(email) WHERE private.normalized_email_domain(email) IS NOT NULL
), 'malformed/control/lookalike emails fail closed');
SELECT is(private.normalized_email_domain(NULL), NULL::text, 'missing email fails closed');
SELECT ok(NOT has_function_privilege('authenticated', 'private.before_user_created(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.before_user_created(jsonb)', 'EXECUTE'),
  'clients cannot invoke the Auth hook');
SELECT ok(NOT has_table_privilege('authenticated', 'private.approved_email_domains', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'private.approved_email_domains', 'UPDATE')
  AND NOT has_table_privilege('supabase_auth_admin', 'private.approved_email_domains', 'UPDATE'),
  'clients cannot read/change allowlist; Auth has no allowlist writes');
SELECT ok(NOT has_column_privilege('jomlepakz_auth_gate', 'auth.users', 'email', 'SELECT')
  AND NOT has_column_privilege('jomlepakz_auth_gate', 'public.profiles', 'full_name', 'UPDATE'),
  'invalidation owner has no Auth read or profile-content write grant');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public'
  AND policyname = 'um_eligibility_gate' AND permissive = 'RESTRICTIVE'
  AND roles = ARRAY['authenticated']::name[] AND cmd = 'ALL'), 12,
  'every exposed base table has a restrictive eligibility gate');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private' AND p.proname IN ('normalized_email_domain',
    'before_user_created', 'current_user_is_eligible', 'invalidate_profile_email_verification')
    AND NOT coalesce(p.proconfig @> ARRAY['search_path=pg_catalog'], false)),
  'all gate functions have a fixed search path');

SET LOCAL ROLE supabase_auth_admin;
SELECT is(private.before_user_created('{"user":{"email":"student@siswa.um.edu.my"}}'),
  '{}'::jsonb, 'approved student account creation allowed using actual Auth role');
SELECT is(private.before_user_created('{"user":{"email":"Student@SISWA.UM.EDU.MY"}}'),
  '{}'::jsonb, 'mixed-case approved account allowed');
SELECT ok((private.before_user_created('{"user":{"email":"student@gmail.com"}}')
  -> 'error' ->> 'http_code')::integer = 403, 'non-UM account creation denied');
SELECT ok(NOT EXISTS (SELECT 1 FROM unnest(ARRAY['a@um.edu.my', 'a@evil.siswa.um.edu.my',
  'a@siswa.um.edu.my.evil.test', 'a@@siswa.um.edu.my']) AS rejected(email)
  WHERE private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', email))) = '{}'::jsonb),
  'unapproved staff, suffix, subdomain and malformed emails denied');
SELECT ok(private.before_user_created('{"user":{"email":null}}') ? 'error'
  AND private.before_user_created('{"user":{"email":123}}') ? 'error'
  AND private.before_user_created('{}') ? 'error', 'missing or incorrectly typed email denied');
RESET ROLE;

UPDATE private.approved_email_domains SET is_active = false WHERE domain = 'siswa.um.edu.my';
SET LOCAL ROLE supabase_auth_admin;
SELECT ok(private.before_user_created('{"user":{"email":"student@siswa.um.edu.my"}}') ? 'error',
  'disabling a domain rejects signup');
RESET ROLE;
UPDATE private.approved_email_domains SET is_active = true WHERE domain = 'siswa.um.edu.my';

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_is_eligible(), false, 'missing authenticated identity denied');
RESET ROLE;

-- Optional integration assertion against an existing real Development account.
-- Set its JWT subject in this transaction; no user is invented or inserted.
SELECT set_config('request.jwt.claims', coalesce((
  SELECT jsonb_build_object('sub', u.id, 'role', 'authenticated')::text
  FROM auth.users u WHERE NOT EXISTS (
    SELECT 1 FROM private.approved_email_domains d
    WHERE d.domain = private.normalized_email_domain(u.email) AND d.is_active
  ) ORDER BY u.created_at LIMIT 1
), '{}'), true);
SET LOCAL ROLE authenticated;
SELECT skip('no existing ineligible real account; run the documented Development test', 1)
  WHERE auth.uid() IS NULL;
SELECT is(public.jomlepakz_current_user_is_eligible(), false,
  'existing ineligible account fails live eligibility even if it can authenticate')
  WHERE auth.uid() IS NOT NULL;
RESET ROLE;

-- Show that even a later permissive read policy cannot override the gate.
-- This temporary policy/grant exists only inside the rolled-back test.
CREATE POLICY gate_test_permissive_read ON public.profiles
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.profiles), 0,
  'ineligible/no-identity caller gets no protected profiles despite permissive read');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
