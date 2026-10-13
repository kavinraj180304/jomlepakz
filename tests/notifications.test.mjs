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
const validation = load('../src/lib/notifications/validation.ts');
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const item = { id, kind: 'activity_updated', summary: 'Activity details were updated', createdAt: '2026-10-13T12:00:00+00:00', readAt: null, activityId: id };
test('notification DTO bounds data, rejects private fields and generates only safe internal links', () => {
  assert.equal(validation.notificationHref(item), `/activities/${id}`);
  assert.equal(validation.notificationHref({ activityId: null }), null);
  for (const activityId of ['//evil.test', 'javascript:alert(1)', '../admin']) assert.equal(validation.notificationHref({ activityId }), null);
  for (const change of [{ recipient_id: id }, { source_user_id: id }, { event_key: 'private' }, { href: 'https://evil.test' }, { summary: 'x'.repeat(301) }, { kind: 'message' }, { createdAt: 'invalid' }]) {
    assert.equal(validation.notificationSchema.safeParse({ ...item, ...change }).success, false);
  }
  assert.equal(validation.notificationsPageSchema.safeParse({ items: Array(21).fill(item), unreadCount: 1, hasNext: true }).success, false);
});
function actions(client, eligible = true, paths = []) {
  return load('../src/app/notifications/actions.ts', {
    'next/cache': { revalidatePath: path => paths.push(path) },
    '@/lib/auth/server': { currentIdentity: async () => client ? { client } : null, isEligible: async () => eligible },
  });
}
test('A/B Mark All Read uses caller clients, no recipient argument and leaves B state untouched', async () => {
  // Isolated application clients test caller routing; SQL tests establish actual RLS.
  const unread = { A: 3, B: 2 }, calls = [], paths = [];
  const client = owner => ({ rpc: async (...args) => { calls.push({ owner, args }); const data = unread[owner]; unread[owner] = 0; return { data }; } });
  assert.deepEqual(await actions(client('A'), true, paths).markAllNotificationsRead(), { ok: true, changed: 3 });
  assert.equal(unread.B, 2);
  assert.deepEqual(await actions(client('A')).markAllNotificationsRead(), { ok: true, changed: 0 });
  assert.deepEqual(await actions(client('B')).markAllNotificationsRead(), { ok: true, changed: 2 });
  assert.ok(calls.every(call => call.args.length === 1 && call.args[0] === 'jomlepakz_mark_all_notifications_read'));
  assert.deepEqual(paths, ['/notifications']);
});
test('signed-out/ineligible callers cannot mark read and errors never become false success', async () => {
  const calls = [], client = { rpc: async () => calls.push('called') };
  for (const api of [actions(null), actions(client, false)]) assert.equal((await api.markAllNotificationsRead()).ok, false);
  assert.deepEqual(calls, []);
  for (const response of [{ error: { message: 'private SQL' } }, { data: null }, { data: -1 }, { data: '3' }, { data: 1.5 }]) {
    const paths = [], result = await actions({ rpc: async () => response }, true, paths).markAllNotificationsRead();
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /private SQL/); assert.deepEqual(paths, []);
  }
});
test('notification reads are bounded, caller scoped and validate private responses', async () => {
  const calls = [], api = load('../src/lib/notifications/server.ts', {
    'server-only': {}, './validation': validation,
    '@/lib/auth/server': { requireEligibleUser: async () => ({ client: { rpc: async (name, args) => {
      calls.push({ name, args }); return { data: { items: [item], unreadCount: 3, hasNext: true } };
    } } }) },
  });
  assert.equal((await api.getNotifications(2)).unreadCount, 3);
  assert.deepEqual(calls, [{ name: 'jomlepakz_notifications', args: { p_page: 2 } }]);
  await assert.rejects(api.getNotifications(501)); assert.equal(calls.length, 1);
});
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
test('screen preserves unread highlighting, safe unavailable rows and chronological pagination controls', () => {
  const { NotificationsScreen } = load('../src/components/notifications/notifications-screen.tsx', {
    react: { useState: initial => [initial, () => {}], useTransition: () => [false, () => {}] },
    'next/navigation': { useRouter: () => ({ refresh() {} }) }, 'next/link': { default: 'a' },
    '@/components/ui/screen': { ScreenHeader: 'header' }, '@/components/ui/screen-states': { EmptyState: 'empty' },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/lib/notifications/validation': validation, '@/app/notifications/actions': { markAllNotificationsRead: async () => ({ ok: true }) },
  });
  const tree = NotificationsScreen({ items: [item, { ...item, id: 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180', readAt: item.createdAt, activityId: null }], unreadCount: 3, hasNext: true, page: 2, invalid: false });
  assert.equal(elements(tree, e => e.props?.className?.includes('bg-accent/40')).length, 1);
  assert.equal(elements(tree, e => e.props?.href?.startsWith('/activities/')).length, 1);
  assert.equal(elements(tree, e => e.props?.children === 'Activity details unavailable').length, 1);
  assert.equal(elements(tree, e => e.props?.children === 'Next')[0].props.href, '/notifications?page=3');
  const empty = NotificationsScreen({ items: [], unreadCount: 0, hasNext: false, page: 1, invalid: false });
  assert.equal(elements(empty, e => e.type === 'empty')[0].props.title, 'No notifications yet');
  assert.equal(elements(empty, e => e.type === 'header')[0].props.action.props.disabled, true);
});
