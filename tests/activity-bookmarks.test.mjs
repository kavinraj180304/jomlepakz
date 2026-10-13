import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiledModule = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const validation = load('../src/lib/activities/validation.ts', { '@/lib/config/um-locations': load('../src/lib/config/um-locations.ts') });
const discovery = load('../src/lib/activities/discovery.ts', { './validation': validation });
const bookmarks = load('../src/lib/activities/bookmarks.ts', { './discovery': discovery });
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
function action(client, eligible = true, changes = []) {
  return load('../src/app/saved-activities/actions.ts', {
    'next/cache': { revalidatePath: path => changes.push(path) },
    '@/lib/activities/bookmarks': bookmarks,
    '@/lib/auth/server': { currentIdentity: async () => client ? { client } : null, isEligible: async () => eligible },
  });
}
test('bookmark input rejects owner/status injection, invalid UUIDs and nonboolean state', async () => {
  const calls = [], client = { rpc: async (...args) => { calls.push(args); return { data: true }; } };
  for (const input of [{ activityId: id, saved: true, userId: 'B' }, { activityId: id, saved: true, status: 'joined' },
    { activityId: 'demo-id', saved: true }, { activityId: id, saved: 'true' }, { activityId: id }]) {
    assert.equal((await action(client).setActivitySaved(input)).ok, false);
  }
  assert.equal(calls.length, 0);
});
test('isolated caller A/B clients save, duplicate save and unsave without affecting each other', async () => {
  // Caller-scoped stubs verify application routing, not real PostgreSQL RLS.
  const rows = new Map(), calls = [], changes = [];
  const client = owner => ({ rpc: async (name, args) => {
    calls.push({ owner, name, args });
    if (args.p_saved) rows.set(`${owner}:${args.p_activity_id}`, true);
    else rows.delete(`${owner}:${args.p_activity_id}`);
    return { data: args.p_saved, error: null };
  } });
  const a = action(client('A'), true, changes), b = action(client('B'), true, changes);
  await a.setActivitySaved({ activityId: id, saved: true });
  await a.setActivitySaved({ activityId: id, saved: true });
  assert.equal(rows.size, 1);
  await b.setActivitySaved({ activityId: id, saved: true });
  assert.equal(rows.size, 2);
  await b.setActivitySaved({ activityId: id, saved: false });
  await b.setActivitySaved({ activityId: id, saved: false });
  assert.equal(rows.has(`A:${id}`), true);
  assert.equal(rows.has(`B:${id}`), false);
  assert.ok(calls.every(call => call.name === 'jomlepakz_set_activity_saved' && Object.keys(call.args).sort().join(',') === 'p_activity_id,p_saved'));
  assert.deepEqual(changes.slice(0, 3), ['/saved-activities', '/my-activities', `/activities/${id}`]);
});
test('signed-out or ineligible callers never reach the bookmark RPC', async () => {
  const calls = [], client = { rpc: async () => calls.push('called') };
  for (const api of [action(null), action(client, false)]) assert.equal((await api.setActivitySaved({ activityId: id, saved: true })).ok, false);
  assert.equal(calls.length, 0);
});
test('RPC failures or ambiguous responses never report a successful bookmark mutation', async () => {
  for (const response of [{ error: { code: '42501', message: 'private SQL' } }, { error: { code: 'P0001' } }, { data: null }, { data: false }]) {
    const changes = [], result = await action({ rpc: async () => response }, true, changes).setActivitySaved({ activityId: id, saved: true });
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /private SQL/); assert.deepEqual(changes, []);
  }
  assert.equal((await action({ rpc: async () => { throw new Error('secret'); } }).setActivitySaved({ activityId: id, saved: false })).ok, false);
});
test('saved reads use only the authenticated caller and validate paginated private DTOs', async () => {
  const calls = [], api = load('../src/lib/activities/bookmarks-server.ts', {
    'server-only': {}, './bookmarks': bookmarks,
    '@/lib/auth/server': { requireEligibleUser: async () => ({ client: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'jomlepakz_activity_saved' ? true : { items: [{ id, activity: null }], hasNext: false }, error: null };
    } } }) },
  });
  assert.equal(await api.getActivitySaved(id), true);
  assert.deepEqual(await api.getSavedActivities(2), { items: [{ id, activity: null }], hasNext: false });
  assert.deepEqual(calls, [{ name: 'jomlepakz_activity_saved', args: { p_activity_id: id } }, { name: 'jomlepakz_saved_activities', args: { p_page: 2 } }]);
  await assert.rejects(api.getSavedActivities(501)); await assert.rejects(api.getActivitySaved('demo'));
  assert.equal(calls.length, 2);
  assert.equal(bookmarks.savedActivitiesSchema.safeParse({ items: [{ id, activity: null, userId: 'A' }], hasNext: false }).success, false);
  assert.equal(bookmarks.savedActivitiesSchema.safeParse({ items: Array(21).fill({ id, activity: null }), hasNext: false }).success, false);
});
test('saved page preserves the profile entry, real cards, empty state and nonparticipation copy', () => {
  const page = readFileSync(new URL('../src/app/saved-activities/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /demoActivities|ActivityCollections|DemoBanner/);
  assert.match(page, /No saved activities yet/);
  assert.match(page, /Saving does not join an activity or reserve a spot/);
  assert.match(readFileSync(new URL('../src/components/profile/profile-screen.tsx', import.meta.url), 'utf8'), /\/saved-activities/);
});
