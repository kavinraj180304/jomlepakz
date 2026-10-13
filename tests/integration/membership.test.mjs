import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { asCaller, checkIdentities, fixture, localQAConfig, operatorClient, removeFixture } from '../qa/local-context.mjs';

// Real PostgreSQL connections and role/JWT contexts; no mocked seat allocator.
const { users: [a, b, admin] } = localQAConfig();
let operator, profiles;
before(async () => { operator = await operatorClient(); profiles = await checkIdentities(operator); });
after(async () => { await operator?.end(); });
const rpc = (uid, name, id) => asCaller(uid, client => client.query(`SELECT public.${name}($1) AS result`, [id])).then(r => r.rows[0].result);
const denied = operation => assert.rejects(operation, error => error.code === '42501');

test('two final-seat requests never overbook; duplicate join and leave are idempotent', async () => {
  const id = await fixture(operator, profiles[0].id);
  try {
    await denied(() => rpc(a, 'jomlepakz_join_activity', id));
    // Hold the real admission gate until both ordinary caller connections wait.
    // This proves overlap rather than depending on connection startup timing.
    await operator.query('BEGIN');
    await operator.query('SELECT pg_advisory_xact_lock(20261010,1)');
    const competing = Promise.allSettled([rpc(b, 'jomlepakz_join_activity', id), rpc(admin, 'jomlepakz_join_activity', id)]);
    let queued = false;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const waiting = await operator.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='jomlepakz-focused-qa' AND wait_event='advisory' AND query LIKE 'SELECT public.jomlepakz_join_activity%'");
        if (waiting.rows[0].n === 2) { queued = true; break; }
        await delay(100);
        await operator.query('SELECT pg_stat_clear_snapshot()');
      }
    } finally { await operator.query('COMMIT'); }
    const race = await competing;
    assert.equal(queued, true, 'Both ordinary callers must overlap at the admission lock');
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(race.find(r => r.status === 'rejected').reason.code, 'P0001');
    const winner = race[0].status === 'fulfilled' ? b : admin, loser = winner === b ? admin : b;
    assert.equal((await rpc(winner, 'jomlepakz_join_activity', id)).status, 'joined');
    assert.equal((await operator.query("SELECT count(*)::int AS seats FROM public.activity_participants WHERE activity_id=$1 AND status='joined'", [id])).rows[0].seats, 1);
    assert.equal((await rpc(winner, 'jomlepakz_leave_activity', id)).status, 'left');
    assert.equal((await rpc(winner, 'jomlepakz_leave_activity', id)).status, 'left');
    assert.equal((await rpc(loser, 'jomlepakz_join_activity', id)).status, 'joined');
    assert.equal((await operator.query('SELECT count(*)::int AS rows FROM public.activity_participants WHERE activity_id=$1', [id])).rows[0].rows, 2);
  } finally { await removeFixture(operator, id); }
});

test('approval requests reserve no seats and can be withdrawn; closed/hidden/blocked/suspended admission is denied', async () => {
  const id = await fixture(operator, profiles[0].id, { mode: 'approval' });
  try {
    assert.equal((await rpc(b, 'jomlepakz_join_activity', id)).status, 'pending');
    assert.equal((await operator.query("SELECT count(*)::int AS seats FROM public.activity_participants WHERE activity_id=$1 AND status='joined'", [id])).rows[0].seats, 0);
    assert.equal((await rpc(b, 'jomlepakz_leave_activity', id)).status, 'left');
    await operator.query("UPDATE public.activities SET visibility_status='hidden' WHERE id=$1", [id]);
    await denied(() => rpc(b, 'jomlepakz_join_activity', id));
    await operator.query("UPDATE public.activities SET visibility_status='visible' WHERE id=$1", [id]);
    // Safety fixtures are transactional: neither account nor existing policy is changed permanently.
    for (const pair of [[profiles[0].id, profiles[1].id], [profiles[1].id, profiles[0].id]]) {
    await operator.query('BEGIN');
    try {
      await operator.query('INSERT INTO public.blocked_users (blocker_id,blocked_id) VALUES ($1,$2)', pair);
      await operator.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [b]);
      await operator.query('SET LOCAL ROLE authenticated');
      await denied(() => operator.query('SELECT public.jomlepakz_join_activity($1)', [id]));
    } finally { await operator.query('ROLLBACK'); }
    }
    for (const suspended of [profiles[1].id, profiles[0].id]) {
    await operator.query('BEGIN');
    try {
      await operator.query("UPDATE public.profiles SET account_status='suspended' WHERE id=$1", [suspended]);
      await operator.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [b]);
      await operator.query('SET LOCAL ROLE authenticated');
      await denied(() => operator.query('SELECT public.jomlepakz_join_activity($1)', [id]));
    } finally { await operator.query('ROLLBACK'); }
    }
    await operator.query("UPDATE public.activities SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=$1", [id]);
    await denied(() => rpc(b, 'jomlepakz_join_activity', id));
    await operator.query("UPDATE public.activities SET status='scheduled',cancelled_at=NULL,starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [id]);
    await denied(() => rpc(b, 'jomlepakz_join_activity', id));
  } finally { await removeFixture(operator, id); }
});

test('anon/raw status writes and normal moderation calls are denied; bookmarks remain private and admin reads require membership', async () => {
  const id = await fixture(operator, profiles[0].id);
  try {
    await denied(() => asCaller(null, client => client.query('SELECT public.jomlepakz_join_activity($1)', [id]), 'anon'));
    await denied(() => asCaller(b, client => client.query("INSERT INTO public.activity_participants(activity_id,user_id,status,joined_at) VALUES ($1,$2,'joined',clock_timestamp())", [id, profiles[1].id])));
    await denied(() => asCaller(b, client => client.query("UPDATE public.activity_participants SET status='joined' WHERE activity_id=$1", [id])));
    await denied(() => asCaller(b, client => client.query('SELECT * FROM public.activity_participants')));
    await denied(() => asCaller(b, client => client.query('DELETE FROM public.activity_participants WHERE activity_id=$1', [id])));
    await denied(() => asCaller(b, client => client.query('SELECT public.jomlepakz_admin_dashboard()')));
    await denied(() => asCaller(b, client => client.query("SELECT public.jomlepakz_admin_action('hide_activity',$1,1,'Forged action')", [id])));
    await denied(() => asCaller(b, client => client.query('INSERT INTO public.admin_memberships(user_id) VALUES ($1)', [profiles[1].id])));
    await asCaller(a, client => client.query('SELECT public.jomlepakz_set_activity_saved($1,true)', [id]));
    const aSaved = await asCaller(a, client => client.query('SELECT public.jomlepakz_activity_saved($1) AS saved', [id]));
    const bSaved = await asCaller(b, client => client.query('SELECT public.jomlepakz_activity_saved($1) AS saved', [id]));
    assert.equal(aSaved.rows[0].saved, true); assert.equal(bSaved.rows[0].saved, false);
    assert.ok((await asCaller(admin, client => client.query('SELECT public.jomlepakz_admin_dashboard() AS data'))).rows[0].data.counts);
  } finally { await removeFixture(operator, id); }
});
