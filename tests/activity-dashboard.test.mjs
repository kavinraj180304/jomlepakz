import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const compiledModule = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const validation = load('../src/lib/activities/validation.ts', { '@/lib/config/um-locations': load('../src/lib/config/um-locations.ts') });
const discovery = load('../src/lib/activities/discovery.ts', { './validation': validation });
const dashboard = load('../src/lib/activities/dashboard.ts', { './discovery': discovery });
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const activity = { id, title: 'Real activity', description: 'Details', categorySlug: 'sports', categoryName: 'Sports',
  location: 'UM Sports Centre', startsAt: '2026-10-20T12:00:00+00:00', endsAt: '2026-10-20T13:00:00+00:00',
  capacity: 8, occupied: 2, joinMode: 'instant', status: 'scheduled', coverPath: null, coverAlt: null,
  hostName: 'UM host', isHost: false, revision: null, canEdit: false, inProgress: false, upcoming: true };
test('dashboard validates section/page, resets malformed URL values and preserves section on pagination', () => {
  assert.deepEqual(dashboard.parseDashboardFilters({ section: 'Joined', page: '2' }), { filters: { section: 'Joined', page: 2 }, invalid: false });
  assert.equal(dashboard.dashboardUrl({ section: 'Joined', page: 2 }), '/my-activities?section=Joined&page=2');
  assert.equal(dashboard.dashboardUrl({ section: 'Hosting', page: 1 }), '/my-activities');
  for (const input of [{ section: 'Admin' }, { section: ['Hosting', 'Joined'] }, { page: '501' }, { page: '1e2' }, { page: ['1', '2'] }]) {
    assert.deepEqual(dashboard.parseDashboardFilters(input), { filters: { section: 'Hosting', page: 1 }, invalid: true });
  }
});
function api(actor, response, calls = [], authorize = async () => {}) {
  return load('../src/lib/activities/dashboard-server.ts', {
    'server-only': {}, './dashboard': dashboard,
    './bookmarks-server': { getSavedActivities: async page => { await authorize(); calls.push({ actor, savedPage: page }); return { items: [{ id, activity: null }], hasNext: false }; } },
    '@/lib/auth/server': { requireEligibleUser: async () => { await authorize(); return { client: { rpc: async (name, args) => { calls.push({ actor, name, args }); return response; } } }; } },
  });
}
test('host A and participant B use their own caller clients and receive role-specific DTOs', async () => {
  const calls = [], host = { ...activity, isHost: true, revision: '1', canEdit: true };
  const a = api('A', { data: { items: [{ id, relationship: 'host', activity: host }], hasNext: true } }, calls);
  const b = api('B', { data: { items: [{ id, relationship: 'joined', activity }], hasNext: false } }, calls);
  assert.equal((await a.getActivityDashboard({ section: 'Hosting', page: 1 })).items[0].activity.canEdit, true);
  assert.equal((await b.getActivityDashboard({ section: 'Joined', page: 2 })).items[0].activity.revision, null);
  assert.deepEqual(calls, [
    { actor: 'A', name: 'jomlepakz_activity_dashboard', args: { p_section: 'Hosting', p_page: 1 } },
    { actor: 'B', name: 'jomlepakz_activity_dashboard', args: { p_section: 'Joined', p_page: 2 } },
  ]);
});
test('saved dashboard delegates to owner-scoped bookmarks without another activity representation', async () => {
  const calls = [], result = await api('B', {}, calls).getActivityDashboard({ section: 'Saved', page: 3 });
  assert.deepEqual(result, { items: [{ id, activity: null, relationship: 'saved' }], hasNext: false });
  assert.deepEqual(calls, [{ actor: 'B', savedPage: 3 }]);
});
test('invalid or unauthorized dashboard requests never query the data RPC', async () => {
  const calls = [], denied = api('B', {}, calls, async () => { throw new Error('denied'); });
  await assert.rejects(denied.getActivityDashboard({ section: 'Joined', page: 0 }));
  await assert.rejects(denied.getActivityDashboard({ section: 'Joined', page: 1 }), /denied/);
  assert.deepEqual(calls, []);
});
test('dashboard rejects forged role flags, mismatched records and raw error details', async () => {
  for (const response of [
    { data: { items: [{ id, relationship: 'host', activity }], hasNext: false } },
    { data: { items: [{ id: 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180', relationship: 'joined', activity }], hasNext: false } },
    { data: { items: [], hasNext: false }, error: { message: 'secret SQL' } },
  ]) await assert.rejects(api('B', response).getActivityDashboard({ section: 'Joined', page: 1 }), /^Error: Your activities are unavailable\. Please try again later\.$/);
});
test('lifecycle labels distinguish upcoming, ongoing, ended, cancelled and completed', () => {
  assert.equal(dashboard.activityStatusLabel(activity), 'Upcoming');
  assert.equal(dashboard.activityStatusLabel({ ...activity, upcoming: false, inProgress: true }), 'In progress');
  assert.equal(dashboard.activityStatusLabel({ ...activity, upcoming: false }), 'Ended');
  assert.equal(dashboard.activityStatusLabel({ ...activity, status: 'cancelled' }), 'Cancelled');
  assert.equal(dashboard.activityStatusLabel({ ...activity, status: 'completed' }), 'Completed');
});
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
test('real card shows host controls only for owned records and member controls only for Joined', () => {
  const { RealActivityTile } = load('../src/components/activities/real-activity-tile.tsx', {
    'next/link': { default: 'a' }, 'next/image': { default: 'img' },
    '@/lib/activities/dashboard': dashboard, '@/lib/activities/validation': validation,
    './activity-card': { ActivityCard: 'card' }, './bookmark-button': { BookmarkButton: 'bookmark' }, './cancel-activity': { CancelActivity: 'cancel' },
  });
  const render = (record, relationship) => RealActivityTile({ id, activity: record, relationship });
  const controls = tree => elements(tree, e => e.type === 'cancel' || e.props?.href?.endsWith('/edit'));
  assert.equal(controls(render({ ...activity, isHost: true, revision: '1', canEdit: true }, 'host')).length, 2);
  assert.equal(controls(render(activity, 'joined')).length, 0);
  assert.equal(controls(render(activity, 'host')).length, 0);
  assert.equal(controls(render({ ...activity, isHost: true, revision: '1', status: 'completed', canEdit: false }, 'host')).length, 0);
  assert.equal(elements(render(activity, 'joined'), e => e.props?.children === 'View joined activity').length, 1);
  assert.equal(elements(render(null, 'saved'), e => e.type === 'bookmark').length, 1);
});
