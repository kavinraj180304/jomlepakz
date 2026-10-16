import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { asCaller, checkIdentities, fixture, localQAConfig, operatorClient, removeFixture } from '../qa/local-context.mjs';

// Runs only against a reviewed disposable local stack and existing Auth users.
const { users: [host, applicant, other] } = localQAConfig();
let operator, profiles;
before(async () => { operator = await operatorClient(); profiles = await checkIdentities(operator); });
after(async () => { await operator?.end(); });
const rpc = (uid, name, id) => asCaller(uid, c => c.query(`SELECT public.${name}($1) AS result`, [id])).then(r => r.rows[0].result);
const list = id => rpc(host, 'jomlepakz_pending_join_requests', id);
const decide = (uid, id, request, decision = 'approve', revision = '1') => asCaller(uid, c => c.query(
  'SELECT public.jomlepakz_decide_join_request($1,$2,$3,$4,$5) AS result',
  [id, request.applicantId, request.requestedAt, revision, decision])).then(r => r.rows[0].result);
const denied = operation => assert.rejects(operation, error => error.code === '42501');
const seats = async id => Number((await operator.query("SELECT 1+count(*) AS n FROM public.activity_participants WHERE activity_id=$1 AND status='joined'", [id])).rows[0].n);

test('only host lists requests; approval updates occupancy, trusted decision fields and notifications once', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval', capacity: 8 });
  try {
    assert.deepEqual(await list(id), []);
    await rpc(applicant, 'jomlepakz_join_activity', id);
    const [request] = await list(id);
    assert.deepEqual(Object.keys(request).sort(), ['applicantId', 'name', 'requestedAt']);
    assert.equal(request.applicantId, profiles[1].id);
    await denied(() => rpc(applicant, 'jomlepakz_pending_join_requests', id));
    await denied(() => rpc(other, 'jomlepakz_pending_join_requests', id)); // Even an admin is not this host.
    await denied(() => asCaller(null, c => c.query('SELECT public.jomlepakz_pending_join_requests($1)', [id]), 'anon'));
    await denied(() => decide(applicant, id, request));
    assert.equal(await seats(id), 1);
    assert.equal((await decide(host, id, request)).outcome, 'joined');
    assert.equal(await seats(id), 2);
    assert.deepEqual(await list(id), []);
    const row = (await operator.query('SELECT status,joined_at,decided_at,decided_by FROM public.activity_participants WHERE activity_id=$1 AND user_id=$2', [id, profiles[1].id])).rows[0];
    assert.equal(row.status, 'joined'); assert.ok(row.joined_at); assert.ok(row.decided_at); assert.equal(row.decided_by, profiles[0].id);
    assert.equal((await decide(host, id, request)).outcome, 'stale');
    assert.equal((await decide(host, id, request, 'reject')).outcome, 'stale');
    assert.equal(await seats(id), 2);
    assert.equal((await operator.query("SELECT count(*)::int AS n FROM public.notifications WHERE activity_id=$1 AND kind='join_approved'", [id])).rows[0].n, 1);
    await denied(() => asCaller(applicant, c => c.query('SELECT * FROM public.activity_participants WHERE activity_id=$1', [id])));
  } finally { await removeFixture(operator, id); }
});

test('rejection consumes no seat, records the host and emits the existing decline notification', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval' });
  try {
    await rpc(applicant, 'jomlepakz_join_activity', id);
    const [request] = await list(id);
    assert.equal((await decide(host, id, request, 'reject')).outcome, 'declined');
    assert.equal(await seats(id), 1);
    const row = (await operator.query('SELECT status,joined_at,decided_at,decided_by FROM public.activity_participants WHERE activity_id=$1', [id])).rows[0];
    assert.equal(row.status, 'declined'); assert.equal(row.joined_at, null); assert.ok(row.decided_at); assert.equal(row.decided_by, profiles[0].id);
    assert.deepEqual(await list(id), []);
    assert.equal((await decide(host, id, request, 'reject')).outcome, 'stale');
    assert.equal((await operator.query("SELECT count(*)::int AS n FROM public.notifications WHERE activity_id=$1 AND kind='join_declined'", [id])).rows[0].n, 1);
    await denied(() => rpc(applicant, 'jomlepakz_join_activity', id));
  } finally { await removeFixture(operator, id); }
});

test('simultaneous final-seat approvals serialize; full applicant stays pending with no decision', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval', capacity: 2 });
  try {
    await rpc(applicant, 'jomlepakz_join_activity', id); await rpc(other, 'jomlepakz_join_activity', id);
    const requests = await list(id);
    await operator.query('BEGIN'); await operator.query('SELECT pg_advisory_xact_lock(20261010,1)');
    const race = Promise.all(requests.map(request => decide(host, id, request)));
    let queued = false;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const waiting = await operator.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='jomlepakz-focused-qa' AND wait_event='advisory' AND query LIKE 'SELECT public.jomlepakz_decide_join_request%'");
        if (waiting.rows[0].n === 2) { queued = true; break; }
        await delay(100); await operator.query('SELECT pg_stat_clear_snapshot()');
      }
    } finally { await operator.query('COMMIT'); }
    const results = await race;
    assert.equal(queued, true);
    assert.deepEqual(results.map(r => r.outcome).sort(), ['full', 'joined']);
    assert.equal(await seats(id), 2);
    const [pending] = await list(id);
    const row = (await operator.query('SELECT status,joined_at,decided_at,decided_by FROM public.activity_participants WHERE activity_id=$1 AND user_id=$2', [id, pending.applicantId])).rows[0];
    assert.equal(row.status, 'pending'); assert.equal(row.joined_at, null); assert.equal(row.decided_at, null); assert.equal(row.decided_by, null);
    assert.equal((await decide(host, id, pending)).outcome, 'full');
  } finally { await removeFixture(operator, id); }
});

test('withdrawn/renewed requests and stale activity revisions cannot be decided from old UI', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval' });
  try {
    await rpc(applicant, 'jomlepakz_join_activity', id);
    const [old] = await list(id);
    await rpc(applicant, 'jomlepakz_leave_activity', id);
    assert.equal((await decide(host, id, old)).outcome, 'stale');
    await rpc(applicant, 'jomlepakz_join_activity', id);
    assert.equal((await decide(host, id, old, 'reject')).outcome, 'stale');
    const [current] = await list(id);
    assert.equal((await decide(host, id, current, 'approve', '2')).outcome, 'stale');
    assert.equal(await seats(id), 1);
    assert.equal((await decide(host, id, current)).outcome, 'joined');
  } finally { await removeFixture(operator, id); }
});

test('privacy, eligibility, both block directions, joined-peer blocks and closed/hidden activities are rechecked', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval', capacity: 8 });
  try {
    await rpc(applicant, 'jomlepakz_join_activity', id);
    const [request] = await list(id);
    await rpc(other, 'jomlepakz_join_activity', id);
    const peer = (await list(id)).find(r => r.applicantId === profiles[2].id);
    await decide(host, id, peer);
    const scenarios = [
      ["UPDATE public.profiles SET profile_visibility='activity_members' WHERE id=$1", [profiles[1].id], null],
      ["UPDATE public.profiles SET account_status='suspended' WHERE id=$1", [profiles[1].id], 'unavailable'],
      ...[[0, 1], [1, 0], [2, 1], [1, 2]].map(([a, b]) => ['INSERT INTO public.blocked_users(blocker_id,blocked_id) VALUES ($1,$2)', [profiles[a].id, profiles[b].id], 'unavailable']),
      ["UPDATE public.activities SET visibility_status='hidden' WHERE id=$1", [id], 'closed'],
      ["UPDATE public.activities SET starts_at=clock_timestamp()-interval '1 minute' WHERE id=$1", [id], 'closed'],
      ["UPDATE public.activities SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=$1", [id], 'closed'],
    ];
    for (const [sql, args, expected] of scenarios) {
      await operator.query('BEGIN');
      try {
        await operator.query(sql, args);
        await operator.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [host]);
        await operator.query('SET LOCAL ROLE authenticated');
        if (expected === null) {
          const data = (await operator.query('SELECT public.jomlepakz_pending_join_requests($1) AS result', [id])).rows[0].result;
          assert.equal(data.find(r => r.applicantId === request.applicantId).name, 'UM applicant');
        } else {
          const result = (await operator.query('SELECT public.jomlepakz_decide_join_request($1,$2,$3,1,$4) AS result', [id, request.applicantId, request.requestedAt, 'approve'])).rows[0].result;
          assert.equal(result.outcome, expected);
        }
      } finally { await operator.query('ROLLBACK'); }
    }
    assert.equal((await list(id)).length, 1); assert.equal(await seats(id), 2);
  } finally { await removeFixture(operator, id); }
});
