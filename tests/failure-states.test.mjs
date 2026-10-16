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
  const compiled = { exports: {} }, require = createRequire(filename);
  new Function('require', 'module', 'exports', outputText)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), compiled, compiled.exports);
  return compiled.exports;
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
const id = '5f7b6c21-a169-47be-a3c9-8762649bb146';
const activity = { id, title: 'Activity', description: 'Bring water.', categoryName: 'Sports', hostName: 'Host',
  capacity: 4, occupied: 4, upcoming: true, inProgress: false, status: 'scheduled', isHost: false,
  canEdit: false, revision: null, joinMode: 'instant', coverPath: null };
const feedback = { state: 'not_participant', body: null, canComplete: false, revision: null, requiresReason: false };
function detail({ record = activity, bookmark = async () => false, state = async () => feedback, requests = async () => [] } = {}) {
  const Page = load('../src/app/activities/[id]/page.tsx', {
    'next/image': { default: 'img' }, 'next/link': { default: 'a' },
    'next/navigation': { notFound: () => { throw new Error('not-found'); } },
    'lucide-react': { ArrowLeft: 'svg' },
    '@/components/activities/activity-card': { ActivityCard: 'activity-card' },
    '@/lib/activities/server': { getActivityDetails: async () => record },
    '@/lib/activities/validation': { activitySchedule: () => 'Future time' },
    '@/components/activities/cancel-activity': { CancelActivity: 'cancel' },
    '@/components/activities/bookmark-button': { BookmarkButton: 'bookmark' },
    '@/lib/activities/bookmarks-server': { getActivitySaved: bookmark },
    '@/lib/activities/feedback-server': { getFeedbackState: state },
    '@/components/activities/private-feedback': { PrivateFeedback: 'feedback' },
    '@/lib/activities/membership-server': { getPendingJoinRequests: requests, getActivityMembership: async () => ({ activityId: id, status: 'none', availability: 'open', canJoin: true, canLeave: false, requiresApproval: false }) },
    '@/components/activities/participation-control': { ParticipationControl: 'participation' },
    '@/components/activities/host-join-requests': { HostJoinRequests: 'join-requests' },
    '@/components/analytics/product-view': { ProductView: 'product-view' },
  }).default;
  const shell = Page({ params: Promise.resolve({ id }) });
  const content = elements(shell, e => typeof e.type === 'function' && e.type.name === 'ActivityDetailsContent')[0];
  return content.type(content.props);
}

test('detail starts both independent reads before either finishes, after the activity access check', async () => {
  const calls = [];
  let releaseBookmark, releaseFeedback;
  const result = detail({ bookmark: () => { calls.push('bookmark'); return new Promise(resolve => { releaseBookmark = resolve; }); },
    state: () => { calls.push('feedback'); return new Promise(resolve => { releaseFeedback = resolve; }); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['bookmark', 'feedback']);
  releaseBookmark(false); releaseFeedback(feedback);
  await result;
});

test('missing or inaccessible activity stops before bookmark/feedback reads', async () => {
  let calls = 0;
  await assert.rejects(detail({ record: null, bookmark: async () => { calls++; }, state: async () => { calls++; } }), /not-found/);
  assert.equal(calls, 0);
});

test('full and cancelled activity presentations remain distinct and offer no invalid host controls', async () => {
  const full = await detail();
  assert.equal(elements(full, e => e.type === 'activity-card')[0].props.capacityLabel, 'Full');
  const cancelled = await detail({ record: { ...activity, status: 'cancelled', upcoming: false } });
  assert.equal(elements(cancelled, e => e.type === 'activity-card')[0].props.capacityLabel, undefined);
  assert.ok(elements(cancelled, e => e.props?.role === 'status')[0].props.children.join('').includes('This activity will not take place'));
  assert.equal(elements(cancelled, e => e.type === 'cancel').length, 0);
  assert.equal(elements(cancelled, e => e.type === 'a' && e.props.href?.endsWith('/edit')).length, 0);
});

test('route boundaries use the refetching retry callback and never render raw error details', () => {
  const failure = load('../src/components/ui/route-failure.tsx', {
    'next/link': { default: 'a' }, '@/components/ui/button': { Button: 'button' },
  }).RouteFailure;
  for (const route of ['error', 'activities/error', 'my-activities/error', 'saved-activities/error', 'notifications/error', 'admin/error']) {
    let retries = 0;
    const boundary = load(`../src/app/${route}.tsx`, { '@/components/ui/route-failure': { RouteFailure: failure } }).default;
    const shell = boundary({ retry: () => { retries++; }, reset: () => { throw new Error('reset must not be used'); },
      error: new Error('PRIVATE_DATABASE_DETAIL') });
    const view = failure(shell.props);
    assert.equal(JSON.stringify(view).includes('PRIVATE_DATABASE_DETAIL'), false);
    elements(view, e => e.type === 'button')[0].props.onClick();
    assert.equal(retries, 1);
  }
});

test('detail retrieves and renders request data only for the host of an approval activity', async () => {
  let calls = 0;
  const requests = async () => { calls++; return [{ name: 'UM applicant' }]; };
  for (const record of [activity, { ...activity, joinMode: 'approval' }]) {
    const view = await detail({ record, requests });
    assert.equal(elements(view, e => e.type === 'join-requests').length, 0);
  }
  assert.equal(calls, 0);
  const host = { ...activity, isHost: true, joinMode: 'approval', revision: '1' };
  const view = await detail({ record: host, requests });
  assert.equal(calls, 1);
  const section = elements(view, e => e.type === 'join-requests')[0];
  assert.deepEqual(section.props.requests, [{ name: 'UM applicant' }]);
  assert.equal(section.props.canDecide, true);
  const closed = await detail({ record: { ...host, upcoming: false }, requests });
  assert.equal(elements(closed, e => e.type === 'join-requests')[0].props.canDecide, false);
});
