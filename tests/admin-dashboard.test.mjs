import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const compiledModule = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const activity = load('../src/lib/activities/validation.ts', { '@/lib/config/um-locations': load('../src/lib/config/um-locations.ts') });
const discovery = load('../src/lib/activities/discovery.ts', { './validation': activity });
const validation = load('../src/lib/admin/validation.ts', { '@/lib/activities/discovery': discovery });
const feedback = load('../src/lib/activities/feedback.ts');
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const input = { action: 'hide_activity', targetId: id, revision: '1', reason: 'Safety review' };
function auth(admin) {
  return load('../src/lib/auth/server.ts', {
    'server-only': {}, './navigation': { safeNextPath: value => value },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: id } } }) },
      rpc: async name => ({ data: name === 'jomlepakz_current_user_is_eligible' ? true : admin }) }) },
  });
}
test('normal user /admin server guard denied; live active admin allowed; malformed role result fails closed', async () => {
  await assert.rejects(auth(false).requireEligibleUser('/admin', true), /redirect:\/account-status/);
  assert.equal((await auth(true).requireEligibleUser('/admin', true)).userId, id);
  for (const value of [null, 'true', [], { role: 'admin' }]) await assert.rejects(auth(value).requireEligibleUser('/admin', true), /account-status/);
});
function action(admin, calls = [], response = { data: id }, paths = []) {
  return load('../src/app/admin/actions.ts', {
    'next/cache': { revalidatePath: path => paths.push(path) }, '@/lib/admin/validation': validation, '@/lib/activities/feedback': feedback,
    '@/lib/auth/server': { currentIdentity: async () => ({ client: { rpc: async (name, args) => {
      calls.push({ name, args }); return name === 'jomlepakz_current_user_is_admin' ? { data: admin } : response;
    } } }), isEligible: async () => true },
  });
}
test('normal user direct moderation action denied before protected RPC; admin allowed without forged actor', async () => {
  const calls = [];
  assert.equal((await action(false, calls).moderate(input)).ok, false);
  assert.deepEqual(calls.map(call => call.name), ['jomlepakz_current_user_is_admin']);
  calls.length = 0;
  const paths = [], result = await action(true, calls, { data: id }, paths).moderate(input);
  assert.deepEqual(result, { ok: true, auditId: id });
  assert.deepEqual(calls[1], { name: 'jomlepakz_admin_action', args: { p_action: 'hide_activity', p_target: id, p_revision: '1', p_reason: 'Safety review', p_status: null } });
  assert.ok(paths.includes('/admin'));
});
test('admin completion uses the approved completion RPC and requires its audited result', async () => {
  const auditId = 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180', calls = [];
  const result = await action(true, calls, { data: { activityId: id, revision: '2', auditId } }).moderate({ ...input, action: 'complete_activity' });
  assert.deepEqual(result, { ok: true, auditId });
  assert.deepEqual(calls[1], { name: 'jomlepakz_complete_activity', args: { p_activity_id: id, p_revision: '1', p_reason: 'Safety review' } });
  assert.equal((await action(true, [], { data: { activityId: id, revision: '2', auditId: null } }).moderate({ ...input, action: 'complete_activity' })).ok, false);
});
test('admin input rejects role grants, actor injection, invalid status/revision and blank reasons', async () => {
  for (const change of [{ action: 'grant_admin' }, { moderator: id }, { revision: '9223372036854775808' }, { revision: 'not-a-number' }, { revision: '0' }, { reason: ' ' },
    { reason: 'a\0b' }, { status: 'resolved' }, { action: 'set_report_status' }, { action: 'set_report_status', status: 'active' }]) {
    const calls = [];
    assert.equal((await action(true, calls).moderate({ ...input, ...change })).ok, false);
    assert.equal(calls.length, 0);
  }
});
test('stale/error admin results are friendly, never audited-success or revalidated', async () => {
  for (const response of [{ error: { code: '40001', message: 'secret SQL' } }, { error: { code: '42501' } }, { data: 'invalid' }]) {
    const paths = [], result = await action(true, [], response, paths).moderate(input);
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /secret SQL/); assert.deepEqual(paths, []);
  }
});
test('admin DAL requires server admin guard, validates pagination and excludes private chat/report identity fields', async () => {
  const calls = [], counts = { pending: 1, inReview: 0, hiddenActivities: 0, suspendedUsers: 0, bannedUsers: 0, activeCategories: 12 };
  const api = load('../src/lib/admin/server.ts', { 'server-only': {}, './validation': validation,
    '@/lib/auth/server': { requireEligibleUser: async (path, admin) => { calls.push({ path, admin }); return { client: { rpc: async (name, args) => {
      calls.push({ name, args }); return { data: { counts, items: [], hasNext: false } };
    } } }; } },
  });
  await api.getAdminDashboard({ section: 'Reports', page: 2 });
  assert.deepEqual(calls[0], { path: '/admin', admin: true });
  await assert.rejects(api.getAdminDashboard({ section: 'Reports', page: 501 }));
  assert.equal(calls.length, 2);
  assert.equal(validation.adminItemSchema.safeParse({ type: 'user', id, revision: '1', name: 'User', status: 'active', auth_user_id: id }).success, false);
  for (const filters of [{ section: 'Secrets' }, { page: '1e2' }, { section: ['Reports', 'Users'] }]) assert.equal(validation.parseAdminFilters(filters).invalid, true);
});
