import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL(
  '../supabase/migrations/20261017090000_grant_notifications_activity_details.sql',
  import.meta.url,
), 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);

test('notification role receives EXECUTE for its nested activity-details call', () => {
  assert.ok(statements.includes(
    'grant execute on function public.jomlepakz_activity_details(uuid) to jomlepakz_notification_api',
  ));
});

test('notification permission repair grants no function access to other roles', () => {
  const grants = statements.filter(statement => /^grant .* on function /.test(statement));
  assert.deepEqual(grants, [
    'grant execute on function public.jomlepakz_activity_details(uuid) to jomlepakz_notification_api',
  ]);
  assert.doesNotMatch(grants[0].split(' to ')[1], /\b(public|anon|authenticated)\b/);
});

test('repair executes as function owner transactionally and restores SET FALSE without other changes', () => {
  assert.deepEqual(statements, [
    'begin',
    'grant jomlepakz_discovery_api to postgres with set true',
    'set role jomlepakz_discovery_api',
    'grant execute on function public.jomlepakz_activity_details(uuid) to jomlepakz_notification_api',
    'reset role',
    'grant jomlepakz_discovery_api to postgres with set false',
    'commit',
  ]);
});
