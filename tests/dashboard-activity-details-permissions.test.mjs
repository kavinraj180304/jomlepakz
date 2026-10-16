import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL(
  '../supabase/migrations/20261016090000_grant_dashboard_activity_details.sql',
  import.meta.url,
), 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);

test('dashboard receives EXECUTE on the existing activity details function', () => {
  assert.ok(statements.includes(
    'grant execute on function public.jomlepakz_activity_details(uuid) to jomlepakz_dashboard_api',
  ));
});

test('function grants never target PUBLIC, anon, or authenticated', () => {
  const functionGrants = statements.filter(statement => /^grant .* on function /.test(statement));
  assert.equal(functionGrants.length, 1);
  for (const statement of functionGrants) {
    const recipients = statement.split(' to ')[1];
    assert.doesNotMatch(recipients, /\b(public|anon|authenticated)\b/);
    assert.equal(recipients, 'jomlepakz_dashboard_api');
  }
});

test('transaction restores postgres SET FALSE, preserves ADMIN/INHERIT, and changes no other permissions', () => {
  assert.deepEqual(statements, [
    'begin',
    'grant jomlepakz_discovery_api to postgres with set true',
    'set role jomlepakz_discovery_api',
    'grant execute on function public.jomlepakz_activity_details(uuid) to jomlepakz_dashboard_api',
    'reset role',
    'grant jomlepakz_discovery_api to postgres with set false',
    'commit',
  ]);
});
