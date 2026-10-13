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
test('filters reject control characters, repeated values and noncanonical page numbers', () => {
  for (const input of [{ q: 'a\0b' }, { q: 'a\nb' }, { q: ['one', 'two'] }, { category: ['sports', 'study'] },
    { date: ['Today', 'Tomorrow'] }, { available: ['1', '0'] }, { campus: 'yes' },
    ...['1e2', '0x10', '+2', ' 2 ', '02', '2.0', 'Infinity'].map(page => ({ page }))]) {
    assert.equal(discovery.parseDiscoveryFilters(input).invalid, true, JSON.stringify(input));
  }
  assert.equal(discovery.parseDiscoveryFilters({ q: ' Lepak 咖啡 ', page: '500' }).filters.q, 'Lepak 咖啡');
});
test('combined filters round-trip through a shareable URL, pagination and page-one changes', () => {
  const filters = discovery.parseDiscoveryFilters({ q: 'badminton %_ & friends', category: 'sports', date: 'Weekend', available: '1', campus: '1', page: '3' }).filters;
  const params = Object.fromEntries(new URL(discovery.discoveryUrl(filters), 'https://example.test').searchParams);
  assert.deepEqual(discovery.parseDiscoveryFilters(params), { filters, invalid: false });
  const changed = discovery.changedDiscoveryFilters(filters, { date: 'Tomorrow' });
  assert.deepEqual(changed, { ...filters, date: 'Tomorrow', page: 1 });
  assert.deepEqual(discovery.changedDiscoveryFilters(filters, { q: ' study ' }), { ...filters, q: 'study', page: 1 });
  assert.equal(discovery.discoveryUrl(discovery.parseDiscoveryFilters({}).filters), '/');
});

// Exercise actual component event handlers with isolated hooks; browser focus/layout
// still need the documented manual check. No DOM test dependency is installed.
function componentHarness(path, extra = {}) {
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; },
    useRef() { const index = cursor++; if (!(index in slots)) slots[index] = { current: { showModal() {}, close() {} } }; return slots[index]; },
    useTransition: () => [false, callback => callback()],
  };
  const components = load(path, { react, ...extra });
  return props => { cursor = 0; return Object.values(components)[0](props); };
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
test('filter sheet discards dismissed edits and applies category, date and availability together', () => {
  const applied = [], value = discovery.parseDiscoveryFilters({ category: 'sports', date: 'Today', available: '1' }).filters;
  const render = componentHarness('../src/components/discovery/discovery-filters.tsx', {
    '@/components/ui/button': { Button: 'button' }, '@/lib/activities/discovery': discovery,
    '@/lib/ui/dialog-focus': load('../src/lib/ui/dialog-focus.ts'),
  });
  const props = { value, categories: [], disabled: false, onApply: draft => applied.push(draft) };
  const find = predicate => elements(render(props), predicate)[0];
  find(e => e.props?.['aria-haspopup'] === 'dialog').props.onClick();
  find(e => e.type === 'select' && e.props.value === 'sports').props.onChange({ target: { value: 'study' } });
  find(e => e.props?.['aria-label'] === 'Close filters').props.onClick();
  assert.equal(applied.length, 0);
  find(e => e.props?.['aria-haspopup'] === 'dialog').props.onClick();
  assert.equal(elements(render(props), e => e.type === 'select')[0].props.value, 'sports');
  find(e => e.props?.children === 'Reset filters').props.onClick();
  find(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(applied, [{ category: '', date: 'Upcoming', available: '0', campus: '0' }]);
  find(e => e.type === 'select' && e.props.value === '').props.onChange({ target: { value: 'study' } });
  find(e => e.type === 'select' && e.props.value === 'Upcoming').props.onChange({ target: { value: 'Tomorrow' } });
  elements(render(props), e => e.type === 'input')[1].props.onChange({ target: { checked: true } });
  find(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(applied[1], { category: 'study', date: 'Tomorrow', available: '1', campus: '0' });
});
test('discovery keeps unfinished search out of filter navigation and clears applied filters', () => {
  const navigations = [], filters = discovery.parseDiscoveryFilters({ q: 'applied', page: '2', available: '1' }).filters;
  const render = componentHarness('../src/components/discovery/discover-screen.tsx', {
    'next/navigation': { useRouter: () => ({ push: url => navigations.push(url) }) },
    'next/link': { default: 'a' }, 'next/image': { default: 'img' }, '@/components/activities/activity-card': { ActivityCard: 'article' },
    '@/components/ui/input': { Input: 'input' }, '@/components/ui/button': { Button: 'button' },
    './category-chips': { CategoryChips: 'categories' }, './discovery-filters': { DiscoveryFilterControl: 'filters' },
    '@/lib/utils': { cn: (...args) => args.join(' ') }, '@/lib/activities/discovery': discovery, '@/lib/activities/validation': validation,
  });
  const props = { filters, categories: [], activities: [activity], hasNext: true, invalid: false };
  const find = predicate => elements(render(props), predicate)[0];
  find(e => e.type === 'input').props.onChange({ target: { value: 'unfinished' } });
  find(e => e.type === 'categories').props.onChange('sports');
  assert.equal(navigations.pop(), '/?q=applied&category=sports&available=1');
  find(e => e.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(navigations.pop(), '/?q=unfinished&available=1');
  assert.equal(find(e => e.type === 'a' && e.props.children === 'Next').props.href, '/?q=applied&available=1&page=3');
  find(e => e.props?.children === 'Clear search and filters').props.onClick();
  assert.equal(navigations.pop(), '/');
  assert.equal(find(e => e.type === 'input').props.value, '');
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
