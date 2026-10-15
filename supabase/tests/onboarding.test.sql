-- Catalog/ACL checks only. Run on isolated local Supabase after all migrations.
-- This file creates no Auth users or profiles; assertions roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(has_function_privilege('authenticated', 'public.jomlepakz_account_access()', 'EXECUTE'), 'authenticated can check own account');
SELECT ok(has_function_privilege('authenticated', 'public.jomlepakz_complete_onboarding(text,text,text)', 'EXECUTE'), 'authenticated can submit bounded onboarding');
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_account_access()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.jomlepakz_complete_onboarding(text,text,text)', 'EXECUTE'), 'anonymous execution denied');
SELECT ok(NOT has_function_privilege('authenticated', 'private.onboarding_lock_identity()', 'EXECUTE'), 'managed Auth locking helper is private');
SELECT ok(NOT has_function_privilege('anon', 'private.onboarding_caller_uid()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.onboarding_caller_uid()', 'EXECUTE'), 'browser roles cannot execute caller helper');
SELECT ok(has_function_privilege('jomlepakz_onboarding_api', 'private.onboarding_caller_uid()', 'EXECUTE'), 'onboarding owner can execute caller helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.onboarding_caller_uid()'::regprocedure
  AND prosecdef AND provolatile='s' AND pronargs=0 AND prorettype='uuid'::regtype
  AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
  AND proconfig @> ARRAY['search_path=pg_catalog']), 'private caller helper has bounded postgres execution');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
  WHERE p.oid='private.onboarding_caller_uid()'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'), 'PUBLIC cannot execute caller helper');
SELECT ok(to_regprocedure('public.onboarding_caller_uid()') IS NULL, 'no public identity helper wrapper');
SELECT ok((SELECT prosrc !~ 'auth[[:space:]]*\.' FROM pg_proc
  WHERE oid='public.jomlepakz_complete_onboarding(text,text,text)'::regprocedure), 'restricted writer has no direct Auth reference');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  AND policyname IN ('onboarding_self_gate','onboarding_self_read','onboarding_self_insert','onboarding_pending_update')
  AND coalesce(qual,'') !~ 'auth[[:space:]]*\.' AND coalesce(with_check,'') !~ 'auth[[:space:]]*\.'
  AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%onboarding_caller_uid%'), 4, 'four onboarding policies use private caller helper');
SELECT ok(NOT has_any_column_privilege('jomlepakz_onboarding_api', 'auth.users', 'SELECT')
  AND NOT has_any_column_privilege('jomlepakz_onboarding_api', 'auth.users', 'UPDATE'), 'restricted owner has no managed Auth table reads or writes');
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'direct authenticated profile writes remain denied');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='profiles'
  AND grantee IN ('authenticated','anon','PUBLIC') AND privilege_type IN ('INSERT','UPDATE')), 'no column-level client write loophole');
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jomlepakz_onboarding_api' AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolsuper), 'restricted non-bypass owner');
SELECT ok(NOT pg_has_role('authenticated', 'jomlepakz_onboarding_api', 'MEMBER')
  AND NOT pg_has_role('postgres', 'jomlepakz_onboarding_api', 'MEMBER'), 'temporary membership removed and clients cannot assume owner');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.jomlepakz_complete_onboarding(text,text,text)'::regprocedure
  AND prosecdef AND proowner=(SELECT oid FROM pg_roles WHERE rolname='jomlepakz_onboarding_api')), 'writer is SECURITY DEFINER with restricted owner');
SELECT ok(EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.jomlepakz_account_access()'::regprocedure AND provolatile='s'), 'account reader is stable');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  AND policyname='foundation_client_deny' AND permissive='RESTRICTIVE'), 'foundation client veto remains');
SELECT * FROM finish();
ROLLBACK;
