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
const membership = load('../src/lib/activities/membership.ts'), id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
function actions(response, eligible = true, calls = [], paths = [], events = []) {
  return load('../src/app/activities/membership-actions.ts', {
    '@/lib/activities/membership': membership, 'next/cache': { revalidatePath: path => paths.push(path) },
    '@/lib/analytics/server': { recordProductEvent: async event => events.push(event) },
    '@/lib/auth/server': { currentIdentity: async () => ({ client: { rpc: async (name, args) => { calls.push({ name, args }); if (response instanceof Error) throw response; return response; } } }), isEligible: async () => eligible },
  });
}
test('join/leave reject actor/status injection and ineligible callers before RPC', async () => {
  const calls = [], api = actions({}, true, calls);
  for (const input of [{ activityId: 'invalid' }, { activityId: id, userId: id }, { activityId: id, status: 'joined' }]) {
    assert.equal((await api.joinActivity(input)).ok, false);
    assert.equal((await api.leaveActivity(input)).ok, false);
  }
  assert.equal((await actions({}, false, calls).joinActivity({ activityId: id })).ok, false);
  assert.equal((await actions({}, false, calls).leaveActivity({ activityId: id })).ok, false);
  assert.deepEqual(calls, []);
});
test('confirmed join/pending/leave results send only activity ID and refresh real counts', async () => {
  for (const status of ['joined', 'pending', 'left', 'none']) {
    const calls = [], paths = [], events = [], operation = ['joined', 'pending'].includes(status) ? 'joinActivity' : 'leaveActivity';
    assert.deepEqual(await actions({ data: { activityId: id, status } }, true, calls, paths, events)[operation]({ activityId: id }), { ok: true, status });
    assert.deepEqual(calls, [{ name: operation === 'joinActivity' ? 'jomlepakz_join_activity' : 'jomlepakz_leave_activity', args: { p_activity_id: id } }]);
    assert.ok(paths.includes(`/activities/${id}`)); assert.ok(paths.includes('/my-activities'));
    assert.deepEqual(events, status === 'joined' ? ['join_completed'] : []);
  }
});
test('full/denied/network/ambiguous results expose friendly errors and never confirm success', async () => {
  for (const response of [{ error: { code: '42501', message: 'private database detail' } }, { error: { code: 'P0001', message: 'private database detail' } },
    new Error('private database detail'), { data: null }, { data: { activityId: id, status: 'left' } },
    { data: { activityId: 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180', status: 'joined' } }]) {
    const paths = [], events = [], result = await actions(response, true, [], paths, events).joinActivity({ activityId: id });
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /private database detail/); assert.deepEqual(paths, []);
    assert.deepEqual(events, []);
  }
  assert.equal((await actions({ data: { activityId: id, status: 'joined' } }).leaveActivity({ activityId: id })).ok, false);
});
