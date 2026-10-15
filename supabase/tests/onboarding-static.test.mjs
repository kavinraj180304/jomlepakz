// Source checks only: SQL permissions/concurrency require the local DB tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/20261015120000_trusted_profile_onboarding.sql', import.meta.url), 'utf8');
const access = sql.split('CREATE FUNCTION public.jomlepakz_account_access()')[1].split('$function$;')[0];
const mutation = sql.split('CREATE FUNCTION public.jomlepakz_complete_onboarding(')[1].split('$function$;')[0];
const identityRepair = readFileSync(new URL('../migrations/20261015140000_onboarding_private_identity.sql', import.meta.url), 'utf8');

test('additive onboarding repair grants only auth schema usage for the existing auth.uid execution permission', () => {
  const repair = readFileSync(new URL('../migrations/20261015130000_onboarding_auth_schema_usage.sql', import.meta.url), 'utf8');
  assert.deepEqual(repair.split(';').map(statement => statement.trim()).filter(Boolean), [
    'BEGIN', 'GRANT USAGE ON SCHEMA auth TO jomlepakz_onboarding_api', 'COMMIT',
  ]);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION auth\.uid\(\)/);
});

test('onboarding migration preserves the client denial boundary and restricts owner authority', () => {
  assert.match(sql, /NOLOGIN NOSUPERUSER NOINHERIT[\s\S]*NOBYPASSRLS/);
  assert.doesNotMatch(sql, /(?:INSERT|UPDATE)[^;]*ON public\.profiles TO (?:authenticated|anon)/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|ALTER TABLE auth\.|(?:INSERT INTO|UPDATE|DELETE FROM) auth\./);
  assert.doesNotMatch(sql, /TO (?:authenticated|anon)[^;]*WITH CHECK/);
  assert.match(sql, /CREATE POLICY onboarding_self_gate[\s\S]*AS RESTRICTIVE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.onboarding_lock_identity\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /SET search_path = pg_catalog/);
  const revokeMembership = sql.indexOf('REVOKE jomlepakz_onboarding_api FROM postgres;');
  assert.ok(revokeMembership > sql.indexOf('GRANT EXECUTE ON FUNCTION public.jomlepakz_complete_onboarding(text, text, text) TO authenticated;'));
  assert.match(sql.trim(), /^--[\s\S]*BEGIN;[\s\S]*COMMIT;$/);
});

test('access reader reuses live approval and eligibility and refuses unexpected states', () => {
  assert.match(access, /private\.current_user_has_approved_identity\(\)/);
  assert.match(access, /private\.current_user_is_eligible\(\)/);
  assert.match(access, /account_status = 'pending_verification'/);
  assert.match(access, /RAISE EXCEPTION 'Account state unavailable'/);
  assert.doesNotMatch(access, /\b(?:INSERT INTO|UPDATE public|DELETE FROM|EXCEPTION WHEN)\b/);
});

test('mutation derives identity, serializes before checking, locks rows and preserves already-active profiles', () => {
  assert.match(mutation, /^p_full_name text, p_faculty text, p_programme text\)/);
  assert.match(mutation, /caller uuid := auth\.uid\(\)/);
  assert.ok(mutation.indexOf('pg_advisory_xact_lock(20261010, 1)') < mutation.indexOf('PERFORM private.onboarding_lock_identity()'));
  assert.match(sql, /FROM auth\.users WHERE id = caller FOR SHARE/);
  assert.match(sql, /normalized_email_domain\(current_email\)[^;]*FOR SHARE/);
  assert.match(mutation, /WHERE auth_user_id = caller FOR UPDATE/);
  assert.ok(mutation.indexOf("account_status = 'active' AND private.current_user_is_eligible() THEN RETURN true") < mutation.indexOf('INSERT INTO public.profiles'));
  assert.match(mutation, /account_status <> 'pending_verification'[\s\S]*ERRCODE = '42501'/);
  assert.match(mutation, /'active', clock_timestamp\(\)/);
  assert.doesNotMatch(mutation, /EXCEPTION WHEN|ON CONFLICT[^;]*DO UPDATE|SET auth_user_id/);
});

test('private identity repair changes only caller lookup in the restricted RPC', () => {
  const original = sql.match(/CREATE FUNCTION public\.jomlepakz_complete_onboarding\([\s\S]*?\n\$function\$;/)[0];
  const updated = identityRepair.match(/CREATE OR REPLACE FUNCTION public\.jomlepakz_complete_onboarding\([\s\S]*?\n\$function\$;/)[0];
  const expected = original.replace('CREATE FUNCTION ', 'CREATE OR REPLACE FUNCTION ')
    .replace('DECLARE caller uuid := auth.uid(); profile record;', 'DECLARE caller uuid; profile record;')
    .replace('  PERFORM private.onboarding_lock_identity();', '  PERFORM private.onboarding_lock_identity();\n  caller := private.onboarding_caller_uid();');
  assert.equal(updated, expected, 'validation, locks, status checks, idempotency and return contract unchanged');
  assert.doesNotMatch(updated, /\bauth\s*\./);
  assert.ok(identityRepair.indexOf('GRANT jomlepakz_onboarding_api TO postgres;') < identityRepair.indexOf(updated));
  assert.match(identityRepair, /REVOKE jomlepakz_onboarding_api FROM postgres;\s*COMMIT;/);
  assert.doesNotMatch(identityRepair, /ALTER FUNCTION public\.jomlepakz_complete_onboarding.*OWNER TO/);
});

test('all four final onboarding policies preserve their conditions while removing direct Auth access', () => {
  const names = ['onboarding_self_gate', 'onboarding_self_read', 'onboarding_self_insert', 'onboarding_pending_update'];
  for (const name of names) {
    const oldPolicy = sql.match(new RegExp(`CREATE POLICY ${name} ON public\\.profiles[^;]*;`))[0];
    const updated = identityRepair.match(new RegExp(`ALTER POLICY ${name} ON public\\.profiles[^;]*;`))[0];
    const originalConditions = oldPolicy.slice(oldPolicy.indexOf('\n')).trim().replaceAll('auth.uid()', 'private.onboarding_caller_uid()');
    const updatedConditions = updated.slice(updated.indexOf('\n')).trim();
    assert.equal(updatedConditions.replace(/\s+/g, ' '), originalConditions.replace(/\s+/g, ' '));
    assert.doesNotMatch(updated, /\bauth\s*\./);
  }
  assert.equal([...identityRepair.matchAll(/ALTER POLICY /g)].length, 4);
  assert.doesNotMatch(identityRepair, /DROP POLICY|CREATE POLICY/);
});

test('caller helper is self-only postgres SECURITY DEFINER and restricted to the internal role', () => {
  assert.match(identityRepair, /CREATE FUNCTION private\.onboarding_caller_uid\(\)\s*RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog\s*AS \$function\$\s*SELECT auth\.uid\(\);\s*\$function\$;/);
  assert.match(identityRepair, /ALTER FUNCTION private\.onboarding_caller_uid\(\) OWNER TO postgres;/);
  assert.match(identityRepair, /REVOKE ALL ON FUNCTION private\.onboarding_caller_uid\(\) FROM PUBLIC, anon, authenticated;/);
  const grants = [...identityRepair.matchAll(/^GRANT [^;]+;/gm)].map(match => match[0]);
  assert.deepEqual(grants, [
    'GRANT EXECUTE ON FUNCTION private.onboarding_caller_uid() TO jomlepakz_onboarding_api;',
    'GRANT jomlepakz_onboarding_api TO postgres;',
  ]);
  assert.doesNotMatch(identityRepair, /CREATE FUNCTION public\.onboarding_caller_uid|GRANT[^;]*SCHEMA auth|GRANT[^;]*auth\.users/);
});
