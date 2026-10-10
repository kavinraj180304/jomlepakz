// Source regression checks only; pgTAP and Dashboard tests execute the gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../migrations/20261010120000_um_signup_gate.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');
const tables = ['profiles', 'categories', 'activities', 'activity_participants',
  'saved_activities', 'messages', 'notifications', 'reports', 'blocked_users',
  'admin_memberships', 'moderation_actions', 'activity_feedback'];

test('additive atomic migration neither seeds users nor grants table access to clients', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM|CREATE OR REPLACE)\b/i);
  assert.doesNotMatch(sql, /INSERT INTO (auth\.|public\.profiles)/i);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO (authenticated|anon)/i);
  assert.match(sql, /VALUES \('siswa\.um\.edu\.my'\)/);
});

test('all application tables have restrictive gates, not permissive access grants', () => {
  const actual = [...sql.matchAll(/CREATE POLICY um_eligibility_gate ON public\.(\w+) AS RESTRICTIVE/g)]
    .map(match => match[1]);
  assert.deepEqual(actual.sort(), tables.sort());
  assert.equal([...sql.matchAll(/WITH CHECK \(\(SELECT private\.current_user_is_eligible\(\)\)\)/g)].length, 12);
  assert.doesNotMatch(sql, /TO (authenticated|anon) USING \(true\)/i);
});

test('live authorization ignores JWT email/metadata and checks current verified status and ban', () => {
  assert.match(sql, /u\.id = auth\.uid\(\)/);
  assert.match(sql, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(sql, /u\.banned_until <= statement_timestamp\(\)/);
  assert.match(sql, /p\.account_status = 'active' AND p\.verified_at IS NOT NULL/);
  assert.doesNotMatch(sql, /auth\.jwt\(|raw_user_meta_data|user_metadata/);
  assert.match(sql, /OLD\.email IS DISTINCT FROM NEW\.email/);
  assert.match(sql, /THEN 'pending_verification' ELSE account_status END/);
});

test('hook is invoker-only and function names are qualified with fixed paths', () => {
  assert.match(sql, /private\.before_user_created\(event jsonb\)[\s\S]*?SECURITY INVOKER\s+SET search_path = pg_catalog/);
  assert.equal([...sql.matchAll(/SET search_path = pg_catalog/g)].length, 5);
  assert.match(sql, /d\.domain = email_domain COLLATE "C" AND d\.is_active/);
  assert.doesNotMatch(sql, /ILIKE|endsWith|SECURITY DEFINER[\s\S]*EXECUTE format/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.before_user_created\(jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE jomlepakz_auth_gate FROM postgres/);
});

test('OAuth/recovery identity gate remains self-only and grants no app permissions', () => {
  const identity = readFileSync(new URL('../migrations/20261010140000_auth_identity_gate.sql', import.meta.url), 'utf8')
    .replace(/--[^\r\n]*/g, '');
  assert.doesNotMatch(identity, /\b(DROP|TRUNCATE|INSERT INTO|UPDATE|CREATE POLICY|CREATE OR REPLACE)\b/i);
  assert.doesNotMatch(identity, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
  assert.match(identity, /u\.id = auth\.uid\(\)/);
  assert.match(identity, /p\.account_status IN \('suspended', 'deleted'\)/);
  assert.match(identity, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(identity, /private\.normalized_email_domain\(u\.email\) COLLATE "C"/);
  assert.equal([...identity.matchAll(/SET search_path = pg_catalog/g)].length, 2);
});
