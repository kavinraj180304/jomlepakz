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
const feedback = load('../src/lib/activities/feedback.ts'), id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
function actions(response, eligible = true, calls = [], paths = []) {
  return load('../src/app/activities/feedback-actions.ts', {
    '@/lib/activities/feedback': feedback, 'next/cache': { revalidatePath: path => paths.push(path) },
    '@/lib/auth/server': { currentIdentity: async () => ({ client: { rpc: async (name, args) => { calls.push({ name, args }); return response; } } }), isEligible: async () => eligible },
  });
}
test('private feedback is bounded Unicode plain text; rejects identity/rating injection', () => {
  assert.equal(feedback.feedbackInputSchema.parse({ activityId: id, body: ' Thanks\r\nall ' }).body, 'Thanks\nall');
  assert.equal(feedback.feedbackInputSchema.safeParse({ activityId: id, body: '🙂'.repeat(1000) }).success, true);
  for (const change of [{ body: ' ' }, { body: 'x'.repeat(1001) }, { body: 'a\0b' }, { authorId: id }, { rating: 5 }, { status: 'completed' }]) {
    assert.equal(feedback.feedbackInputSchema.safeParse({ activityId: id, body: 'Thanks', ...change }).success, false);
  }
});
test('ineligible/invalid feedback and completion never reach RPC; database identity is never client-supplied', async () => {
  const calls = [], api = actions({ data: true }, false, calls);
  assert.equal((await api.submitActivityFeedback({ activityId: id, body: 'Thanks' })).ok, false);
  assert.equal((await api.completeActivity({ activityId: id, revision: '1' })).ok, false);
  assert.equal((await actions({}, true, calls).completeActivity({ activityId: id, revision: 'bad' })).ok, false);
  assert.deepEqual(calls, []);
});
test('feedback sends only own activity/text, refreshes real state and preserves failure messages', async () => {
  const calls = [], paths = [];
  assert.deepEqual(await actions({ data: true }, true, calls, paths).submitActivityFeedback({ activityId: id, body: ' Thanks ' }), { ok: true });
  assert.deepEqual(calls, [{ name: 'jomlepakz_submit_activity_feedback', args: { p_activity_id: id, p_body: 'Thanks' } }]);
  assert.ok(paths.includes(`/activities/${id}`));
  for (const error of [{ code: '42501', message: 'secret' }, { code: '23505' }, { code: 'P0001' }]) {
    const result = await actions({ error }).submitActivityFeedback({ activityId: id, body: 'Thanks' });
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /secret/);
  }
});
test('completion checks the returned record and rejects early/unauthorized/stale/ambiguous results', async () => {
  assert.equal((await actions({ data: { activityId: id, revision: '2', auditId: null } }).completeActivity({ activityId: id, revision: '1' })).ok, true);
  for (const response of [{ error: { code: '22023' } }, { error: { code: '42501' } }, { error: { code: '40001' } }, { data: null },
    { data: { activityId: 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180', revision: '2', auditId: null } }]) {
    assert.equal((await actions(response).completeActivity({ activityId: id, revision: '1' })).ok, false);
  }
});
test('feedback state cannot expose a body outside own submitted state or unrelated identity fields', () => {
  const state = { state: 'ready', body: null, canComplete: false, revision: null, requiresReason: false };
  assert.equal(feedback.feedbackStateSchema.safeParse(state).success, true);
  for (const change of [{ body: 'Someone else feedback' }, { authorId: id }, { canComplete: true }]) assert.equal(feedback.feedbackStateSchema.safeParse({ ...state, ...change }).success, false);
});
