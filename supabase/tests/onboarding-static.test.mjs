// Source checks only: SQL permissions/concurrency require the local DB tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/20261015120000_trusted_profile_onboarding.sql', import.meta.url), 'utf8');
const access = sql.split('CREATE FUNCTION public.jomlepakz_account_access()')[1].split('$function$;')[0];
const mutation = sql.split('CREATE FUNCTION public.jomlepakz_complete_onboarding(')[1].split('$function$;')[0];

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
