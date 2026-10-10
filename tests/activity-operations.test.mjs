import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function load(relativePath, stubs = {}) {
  const filename = new URL(relativePath, import.meta.url);
  const source = readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const compiledModule = { exports: {} };
  const require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const locations = load('../src/lib/config/um-locations.ts');
const validation = load('../src/lib/activities/validation.ts', { '@/lib/config/um-locations': locations });
const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const requestId = '4d0b8b33-e1ee-4e90-90c4-d8285d2dca1f';
const draft = { title: ' Badminton ', description: 'Bring your racket.', categorySlug: 'sports',
  date: future, time: '20:30', durationMinutes: 60, capacity: 8,
  locationChoice: 'um-sports-centre', customLocation: '', joinMode: 'approval', coverKey: 'sports' };
function actions(client, eligible = true) {
  const refreshed = [];
  const exported = load('../src/app/activities/actions.ts', {
    'next/cache': { revalidatePath: path => refreshed.push(path) },
    '@/lib/auth/server': { currentIdentity: async () => client ? { client, userId: 'authenticated-caller' } : null, isEligible: async () => eligible },
    '@/lib/activities/validation': validation,
  });
  return { ...exported, refreshed };
}

test('activity validation bounds texts/numbers, rejects past and invalid dates and normalizes MYT', () => {
  const parsed = validation.activityDraftSchema.parse(draft);
  assert.equal(parsed.title, 'Badminton');
  assert.equal(validation.activityInput(parsed).starts_at, future + 'T12:30:00.000Z');
  const custom = validation.activityDraftSchema.parse({ ...draft, locationChoice: 'custom', customLocation: '  Library entrance  ' });
  assert.equal(validation.activityInput(custom).custom_location, 'Library entrance');
  for (const changes of [{ title: ' ' }, { title: 'a'.repeat(101) }, { description: 'a'.repeat(1001) },
    { capacity: 1 }, { capacity: 51 }, { capacity: 2.5 }, { durationMinutes: 0 }, { durationMinutes: 241 },
    { date: '2020-01-01' }, { date: '2090-02-31' }, { date: '2090-01-01' }, { time: '24:00' },
    { locationChoice: 'invented' }, { locationChoice: 'custom', customLocation: 'x\ny' },
    { locationChoice: 'custom', customLocation: 'x'.repeat(151) }]) {
    assert.equal(validation.activityDraftSchema.safeParse({ ...draft, ...changes }).success, false, JSON.stringify(changes));
  }
  assert.equal(validation.activityDraftSchema.safeParse({ ...draft, title: '😀'.repeat(100) }).success, true);
});

test('strict schemas reject host/status/visibility and arbitrary images, and require an edit revision', () => {
  for (const changes of [{ host_id: id }, { status: 'completed' }, { visibility_status: 'visible' },
    { coverKey: 'https://evil.test/image.svg' }, { cover_asset_path: '/demo/sports.jpg' }]) {
    assert.equal(validation.saveActivitySchema.safeParse({ draft: { ...draft, ...changes }, requestId }).success, false);
  }
  assert.equal(validation.saveActivitySchema.safeParse({ draft, requestId, host_id: id }).success, false);
  assert.equal(validation.saveActivitySchema.safeParse({ draft, requestId, activityId: id }).success, false);
  assert.equal(validation.saveActivitySchema.safeParse({ draft, requestId, activityId: id, revision: '1' }).success, true);
  assert.equal(validation.cancelActivitySchema.safeParse({ activityId: id, revision: '1', status: 'cancelled' }).success, false);
});

test('invalid or ineligible requests never reach activity RPCs', async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: id, error: null }; } };
  assert.equal((await actions(client).saveActivity({ draft: { ...draft, capacity: 100 }, requestId })).ok, false);
  assert.equal((await actions(client, false).saveActivity({ draft, requestId })).ok, false);
  assert.equal((await actions(null).saveActivity({ draft, requestId })).ok, false);
  assert.equal((await actions(client, false).cancelActivity({ activityId: id, revision: '1' })).ok, false);
  assert.equal(calls, 0);
});

test('saving sends allowed data only, no actor ID, then refreshes real details/hosting', async () => {
  let received;
  const api = actions({ rpc: async (name, input) => { received = { name, input }; return { data: id, error: null }; } });
  assert.deepEqual(await api.saveActivity({ draft, requestId }), { ok: true, id });
  assert.equal(received.name, 'jomlepakz_save_activity');
  assert.equal(received.input.p_activity_id, null);
  assert.equal(received.input.p_input.title, 'Badminton');
  assert.equal(received.input.p_input.join_mode, 'approval');
  assert.equal(received.input.p_request_id, requestId);
  assert.doesNotMatch(JSON.stringify(received.input), /host_id|authenticated-caller|visibility_status/);
  assert.ok(api.refreshed.includes('/my-activities'));
  assert.equal((await api.saveActivity({ draft, requestId, activityId: id, revision: '2' })).ok, true);
  assert.equal(received.input.p_revision, '2');
});

test('cross-user, conflict and unexpected errors remain friendly without Supabase detail leakage', async () => {
  for (const code of ['42501', '40001', '22023', 'P0001', 'XX000']) {
    const api = actions({ rpc: async () => ({ data: null, error: { code, message: 'SECRET SQL DETAIL' } }) });
    const result = await api.saveActivity({ draft, requestId });
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.message, /SECRET|SQL/);
    if (code === '40001') assert.match(result.message, /Reload/);
  }
});

test('cancellation uses the dedicated RPC and revision, never a direct delete', async () => {
  let received;
  const api = actions({ rpc: async (name, input) => { received = { name, input }; return { data: id, error: null }; } });
  assert.deepEqual(await api.cancelActivity({ activityId: id, revision: '3' }), { ok: true, id });
  assert.deepEqual(received, { name: 'jomlepakz_cancel_activity', input: { p_activity_id: id, p_revision: '3' } });
});

test('owned activity DTO rejects unknown covers and contains only explicit permitted fields', () => {
  const dto = { id, title: 'Test', description: 'Test', categorySlug: 'sports', categoryName: 'Sports',
    location: 'UM Sports Centre', startsAt: future + 'T12:30:00Z', endsAt: future + 'T13:30:00Z',
    capacity: 8, joinMode: 'approval', status: 'scheduled', visibility: 'visible', coverPath: null,
    coverAlt: null, revision: '1', occupied: 1, canEdit: true, upcoming: true };
  assert.equal(validation.ownedActivitySchema.safeParse(dto).success, true);
  assert.equal(validation.ownedActivitySchema.safeParse({ ...dto, coverPath: 'https://evil.test' }).success, false);
  assert.equal(validation.ownedActivitySchema.safeParse({ ...dto, host_id: id }).success, false);
});

test('approved activity images are existing bounded JPEG assets', () => {
  for (const cover of validation.activityCovers.filter(item => item.path)) {
    const bytes = readFileSync(new URL('../public' + cover.path, import.meta.url));
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
    assert.ok(bytes.length < 2 * 1024 * 1024);
    assert.ok(cover.alt.length > 0);
  }
});
