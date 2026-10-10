-- Local only, no synthetic Auth users or profile fixtures.
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
SELECT plan(4);
SELECT ok(NOT has_function_privilege('anon',
  'public.jomlepakz_current_user_has_approved_identity()', 'EXECUTE'), 'anonymous identity probing denied');
SELECT ok(has_function_privilege('authenticated',
  'public.jomlepakz_current_user_has_approved_identity()', 'EXECUTE'), 'self-only authenticated check executable');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'private.current_user_has_approved_identity()'::regprocedure
  AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog']), 'bounded privileged reader has fixed path');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.jomlepakz_current_user_has_approved_identity(), false, 'missing identity fails closed');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
