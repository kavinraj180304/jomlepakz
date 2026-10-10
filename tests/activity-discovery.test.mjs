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
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const activity = { id, title: 'Real activity', description: 'Details', categorySlug: 'sports', categoryName: 'Sports',
  location: 'UM Sports Centre', startsAt: '2026-10-20T12:00:00+00:00', endsAt: '2026-10-20T13:00:00+00:00',
  capacity: 8, occupied: 1, joinMode: 'approval', status: 'scheduled', coverPath: null, coverAlt: null,
  hostName: 'UM activity host', isHost: false, revision: null, canEdit: false, inProgress: false, upcoming: true };
function dal(result, calls = [], authorize = async () => {}) {
  return load('../src/lib/activities/server.ts', {
    'server-only': {}, './validation': validation, './discovery': discovery,
    '@/lib/auth/server': { requireEligibleUser: async () => {
      await authorize();
      return { client: { rpc: async (name, args) => { calls.push({ name, args }); return result; } } };
    } },
  });
}
test('discovery validates bounded filters and generates internal pagination URLs preserving search', () => {
  const { filters, invalid } = discovery.parseDiscoveryFilters({ q: ' badminton ', category: 'sports', page: '2', campus: '1', date: 'Tomorrow' });
  assert.equal(invalid, false);
  assert.equal(filters.q, 'badminton');
  assert.equal(discovery.discoveryUrl(filters), '/?q=badminton&category=sports&date=Tomorrow&campus=1&page=2');
  for (const input of [{ page: '0' }, { page: '501' }, { page: '1.5' }, { page: ['1', '2'] }, { q: 'x'.repeat(121) },
    { date: 'invented' }, { available: 'true' }, { category: '../sports' }]) {
    const result = discovery.parseDiscoveryFilters(input);
    assert.equal(result.invalid, true);
    assert.equal(result.filters.page, 1);
  }
  assert.equal(discovery.discoveryUrl(discovery.parseDiscoveryFilters({ q: '//evil.test?x=1' }).filters), '/?q=%2F%2Fevil.test%3Fx%3D1');
});
test('discovery uses the caller client and only validated filters, never an actor ID', async () => {
  const calls = [];
  const api = dal({ data: { items: [activity], hasNext: true }, error: null }, calls);
  const filters = discovery.parseDiscoveryFilters({ page: '2', available: '1' }).filters;
  const result = await api.discoverActivities(filters);
  assert.deepEqual(result.items, [activity]);
  assert.deepEqual(calls, [{ name: 'jomlepakz_discover_activities', args: { p_search: '', p_category: '', p_date: 'Upcoming', p_available: true, p_on_campus: false, p_page: 2 } }]);
  await assert.rejects(api.discoverActivities({ ...filters, page: 501 }));
  assert.equal(calls.length, 1);
});
test('details do not query malformed/demo IDs, return null for inaccessible rows, and respect eligibility', async () => {
  const calls = [], api = dal({ data: null, error: null }, calls);
  assert.equal(await api.getActivityDetails('badminton-tonight'), null);
  assert.equal(await api.getActivityDetails('malformed'), null);
  assert.equal(calls.length, 0);
  assert.equal(await api.getActivityDetails(id), null);
  assert.deepEqual(calls[0], { name: 'jomlepakz_activity_details', args: { p_id: id } });
  const denied = dal({ data: activity }, [], async () => { throw new Error('authorization denied'); });
  await assert.rejects(denied.getActivityDetails(id), /authorization denied/);
});
test('DTO accepts lifecycle states and approved images; rejects identity leaks and forged edit controls', () => {
  for (const status of ['scheduled', 'cancelled', 'completed']) assert.equal(discovery.discoveredActivitySchema.safeParse({ ...activity, status }).success, true);
  assert.equal(discovery.discoveredActivitySchema.safeParse({ ...activity, isHost: true, revision: '1', canEdit: true }).success, true);
  for (const change of [{ email: 'private@example.test' }, { auth_user_id: id }, { coverPath: 'https://evil.test/img.jpg' },
    { canEdit: true }, { revision: '2' }, { startsAt: 'invalid' }, { occupied: 0 }]) {
    assert.equal(discovery.discoveredActivitySchema.safeParse({ ...activity, ...change }).success, false);
  }
});
test('database errors and malformed data become friendly errors without raw provider details', async () => {
  for (const response of [{ error: { message: 'secret raw SQL', code: '42501' }, data: null }, { error: null, data: { secret: 'raw' } }]) {
    const api = dal(response);
    await assert.rejects(api.getActivityDetails(id), /^Error: Activity details are unavailable\. Please try again later\.$/);
    await assert.rejects(api.discoverActivities(discovery.parseDiscoveryFilters({}).filters), /^Error: Activities are unavailable\. Please try again later\.$/);
  }
});
test('production discovery/detail imports no demo fixtures or static demo route params', () => {
  for (const path of ['../src/app/page.tsx', '../src/app/activities/[id]/page.tsx', '../src/components/discovery/discover-screen.tsx', '../src/components/discovery/category-chips.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /lib\/demo|demoActivities|generateStaticParams|DemoOnlyButton/);
  }
  const navigation = load('../src/lib/auth/navigation.ts');
  assert.equal(navigation.isProtectedPath('/'), true);
});
