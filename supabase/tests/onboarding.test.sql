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
