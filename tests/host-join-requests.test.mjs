import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, stubs = {}) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const compiled = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiled, compiled.exports);
  return compiled.exports;
}
const schema = load('../src/lib/activities/membership.ts');
const activityId = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const applicantId = 'e98dd0bf-8788-40ef-aa3a-4e00d8fab180';
const requestedAt = '2026-10-16T12:00:00.123456+00:00';
const input = { activityId, applicantId, requestedAt, revision: '1', decision: 'approve' };
function api(response, { eligible = true, calls = [], paths = [] } = {}) {
  return load('../src/app/activities/membership-actions.ts', {
    '@/lib/activities/membership': schema, 'next/cache': { revalidatePath: path => paths.push(path) },
    '@/lib/analytics/server': { recordProductEvent: async () => {} },
    '@/lib/auth/server': {
      currentIdentity: async () => ({ client: { rpc: async (name, args) => { calls.push({ name, args }); return response; } } }),
      isEligible: async () => eligible,
    },
  });
}
test('decisions reject actor/status injection, invalid versions and ineligible callers', async () => {
  const calls = [];
  for (const value of [{ ...input, hostId: applicantId }, { ...input, userId: applicantId },
    { ...input, status: 'joined' }, { ...input, decision: 'remove' }, { ...input, requestedAt: '' }, { ...input, revision: '0' }]) {
    assert.equal((await api({}, { calls }).decideJoinRequest(value)).ok, false);
  }
  assert.equal((await api({}, { calls, eligible: false }).decideJoinRequest(input)).ok, false);
  assert.deepEqual(calls, []);
});
test('approve/reject send the request version, never an actor, and refresh counts and notifications', async () => {
  for (const [decision, outcome] of [['approve', 'joined'], ['reject', 'declined']]) {
    const calls = [], paths = [];
    const result = await api({ data: { activityId, outcome } }, { calls, paths }).decideJoinRequest({ ...input, decision });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{ name: 'jomlepakz_decide_join_request', args: {
      p_activity_id: activityId, p_applicant_id: applicantId, p_requested_at: requestedAt, p_revision: '1', p_decision: decision,
    } }]);
    for (const path of ['/', `/activities/${activityId}`, '/my-activities', '/saved-activities', '/notifications']) assert.ok(paths.includes(path));
  }
});
test('full, stale, closed and ineligible applicant outcomes never report acceptance', async () => {
  for (const outcome of ['full', 'stale', 'closed', 'unavailable']) {
    const result = await api({ data: { activityId, outcome } }).decideJoinRequest(input);
    assert.equal(result.ok, false);
    if (outcome === 'full') assert.match(result.message, /full.*remains pending/);
  }
});
test('malformed, denied or contradictory results do not expose errors or confirm a decision', async () => {
  for (const response of [{ error: { code: '42501', message: 'PRIVATE' } }, { data: null },
    { data: { activityId: applicantId, outcome: 'joined' } }, { data: { activityId, outcome: 'declined' } },
    { data: { activityId, outcome: 'joined', email: 'PRIVATE' } }]) {
    const paths = [], result = await api(response, { paths }).decideJoinRequest(input);
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /PRIVATE/); assert.deepEqual(paths, []);
  }
});
test('request reads accept only the minimal projection and preserve microsecond request versions', async () => {
  const request = { applicantId, requestedAt, name: 'UM applicant' }, calls = [];
  const reader = response => load('../src/lib/activities/membership-server.ts', {
    'server-only': {}, './membership': schema,
    '@/lib/auth/server': { requireEligibleUser: async () => ({ client: { rpc: async (name, args) => { calls.push({ name, args }); return response; } } }) },
  });
  assert.deepEqual(await reader({ data: [request] }).getPendingJoinRequests(activityId), [request]);
  assert.deepEqual(calls, [{ name: 'jomlepakz_pending_join_requests', args: { p_activity_id: activityId } }]);
  for (const response of [{ data: [{ ...request, email: 'PRIVATE' }] }, { data: [{ ...request, auth_user_id: applicantId }] },
    { data: [], error: { code: '42501', message: 'PRIVATE' } }]) {
    await assert.rejects(reader(response).getPendingJoinRequests(activityId), /Join requests are unavailable/);
  }
});
test('request section is empty without requests; closed activities disable decisions', () => {
  const { HostJoinRequests } = load('../src/components/activities/host-join-requests.tsx', {
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/app/activities/membership-actions': { decideJoinRequest() {} },
    '@/components/ui/button': { Button: ({ children, ...props }) => createElement('button', props, children) },
  });
  assert.equal(renderToStaticMarkup(createElement(HostJoinRequests, { id: activityId, revision: '1', requests: [], canDecide: true })), '');
  const markup = renderToStaticMarkup(createElement(HostJoinRequests, { id: activityId, revision: '1',
    requests: [{ applicantId, requestedAt, name: 'UM applicant' }], canDecide: false }));
  assert.match(markup, /Join requests/); assert.match(markup, /UM applicant 1/);
  assert.equal((markup.match(/disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(markup, new RegExp(applicantId));
});
test('migration confines reads/decisions to hosts and uses the existing admission lock order', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261016120000_host_join_requests.sql', import.meta.url), 'utf8');
  assert.match(sql, /NOLOGIN NOSUPERUSER NOINHERIT[\s\S]*NOBYPASSRLS/);
  assert.doesNotMatch(sql, /GRANT[^;]*(?:SCHEMA auth|ON auth\.|TO (?:PUBLIC|anon))/i);
  assert.match(sql, /host_id = private\.discovery_actor\(\)/);
  assert.match(sql, /IF NOT private\.host_requests_owned\(p_activity_id\) THEN/);
  const decision = sql.slice(sql.indexOf('CREATE FUNCTION public.jomlepakz_decide_join_request'));
  assert.ok(decision.indexOf('pg_advisory_xact_lock(20261010, 1)') < decision.indexOf('FOR UPDATE'));
  assert.ok(decision.indexOf("target.capacity <= 1 +") < decision.indexOf('UPDATE public.activity_participants SET'));
  assert.match(decision, /request\.requested_at IS DISTINCT FROM p_requested_at/);
  assert.match(decision, /request\.status <> 'pending'/);
  assert.match(decision, /decided_at = decision_time, decided_by = actor/);
  assert.match(sql, /u\.profile_visibility = 'students'[\s\S]*ELSE 'UM applicant'/);
  const page = readFileSync(new URL('../src/app/activities/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /activity\.isHost && activity\.joinMode === "approval" \? await getPendingJoinRequests/);
});
