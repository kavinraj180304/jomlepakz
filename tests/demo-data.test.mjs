import assert from 'node:assert/strict';
import test from 'node:test';
import { demoConfig, demoData, insertDemo } from '../scripts/demo-data.mjs';
const host = '5f7b6c21-a169-47be-a3c9-8762649bb146', participant = 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180';
const env = { DEMO_TARGET: 'local-disposable', DEMO_DATABASE_URL: 'postgres://localhost:54322/postgres', DEMO_HOST_UID: host, DEMO_PARTICIPANT_UID: participant };
test('demo insertion requires explicit local development target and refuses hosted/production/ambiguous identities', () => {
  assert.equal(demoConfig(env).ids.length, 2);
  for (const change of [{ DEMO_TARGET: '' }, { NODE_ENV: 'production' }, { DEMO_DATABASE_URL: 'postgres://project.supabase.co/postgres' },
    { DEMO_DATABASE_URL: 'postgres://localhost.evil.test/postgres' }, { DEMO_DATABASE_URL: 'https://localhost' }, { DEMO_HOST_UID: 'invalid' }, { DEMO_PARTICIPANT_UID: host }]) assert.throws(() => demoConfig({ ...env, ...change }), /BLOCKED/);
});
test('all fictional fixtures are visibly labelled, have unique IDs and model host-inclusive full and pending states', () => {
  assert.equal(demoData.synthetic, true);
  for (const name of Object.values(demoData.personas)) assert.match(name, /^\[DEMO\]/);
  assert.equal(new Set(demoData.activities.map(item => item.id)).size, demoData.activities.length);
  for (const item of demoData.activities) { assert.match(item.title, /^\[DEMO\]/); assert.match(item.description, /fictional|synthetic/i); }
  assert.ok(demoData.activities.some(item => item.capacity === 2 && item.participantStatus === 'joined'));
  assert.ok(demoData.activities.some(item => item.joinMode === 'approval' && item.participantStatus === 'pending'));
  assert.doesNotMatch(JSON.stringify(demoData), /@|password|service_role/);
});
test('demo preparation rolls back before inserting when profiles are not already fictional', async () => {
  const queries = [], client = { query: async sql => { queries.push(sql); return { rows: [], rowCount: 0 }; } };
  await assert.rejects(() => insertDemo(client, demoConfig(env)), /exact fictional/);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.ok(queries.every(sql => !sql.startsWith('INSERT')));
});
