// Opt-in LOCAL DISPOSABLE PostgreSQL QA only. Never part of npm test.
// Reuses one real reviewed Auth identity; creates no Auth accounts.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { localQAConfig, operatorClient, asCaller } from '../qa/local-context.mjs';

const { users: [uid] } = localQAConfig();
let operator;
const rpc = c => c.query("SELECT public.jomlepakz_complete_onboarding('Onboarding QA','Science','Mathematics') AS result");
before(async () => {
  operator = await operatorClient();
  const state = await asCaller(uid, c => c.query('SELECT public.jomlepakz_account_access() AS access'));
  assert.equal(state.rows[0].access.state, 'needs_onboarding', 'A must be a real confirmed approved local identity without a profile');
  assert.equal((await operator.query('SELECT 1 FROM public.profiles WHERE auth_user_id=$1', [uid])).rowCount, 0);
});
after(async () => { await operator?.end(); });

// Each scenario uses a rollback, including Auth/domain/status changes. These
// records must be reviewed local test identities, never real hosted user data.
async function scenario(setup, operation) {
  await operator.query('BEGIN');
  try {
    await operator.query("SELECT pg_advisory_xact_lock(20261010,1)");
    if (setup) await setup(operator);
    await operator.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await operator.query('SET LOCAL ROLE authenticated');
    await operation(operator);
  } finally { await operator.query('ROLLBACK'); }
}

test('missing profile becomes eligible, required fields normalize, retry preserves profile and timestamp', async () => {
  await scenario(null, async c => {
    assert.equal((await rpc(c)).rows[0].result, true);
    assert.equal((await c.query('SELECT public.jomlepakz_account_access() AS access')).rows[0].access.state, 'eligible');
    await c.query('RESET ROLE');
    const first = (await c.query('SELECT id,full_name,verified_at FROM public.profiles WHERE auth_user_id=$1', [uid])).rows[0];
    await c.query('SET LOCAL ROLE authenticated');
    await c.query("SELECT public.jomlepakz_complete_onboarding('Changed','Changed','Changed')");
    await c.query('RESET ROLE');
    const second = (await c.query('SELECT id,full_name,verified_at FROM public.profiles WHERE auth_user_id=$1', [uid])).rows[0];
    assert.deepEqual(second, first);
  });
});

test('pending profile completion works without replacing its identity', async () => {
  await scenario(c => c.query("INSERT INTO public.profiles(auth_user_id,full_name) VALUES($1,'Pending')", [uid]), async c => {
    const context = (await c.query('SELECT public.jomlepakz_account_access() AS access')).rows[0].access;
    assert.equal(context.state, 'needs_onboarding'); assert.equal(context.profile.full_name, 'Pending');
    assert.equal((await rpc(c)).rows[0].result, true);
  });
});

for (const status of ['suspended', 'banned', 'deleted']) {
  test(`${status} profile cannot be reactivated`, async () => {
    await scenario(c => c.query('INSERT INTO public.profiles(auth_user_id,account_status) VALUES($1,$2)', [uid, status === 'deleted' ? 'pending_verification' : status]).then(async () => {
      if (status === 'deleted') {
        // Proper tombstoning unlinks and records the revoked identity.
        await c.query("UPDATE public.profiles SET account_status='deleted',deleted_at=clock_timestamp(),auth_user_id=NULL WHERE auth_user_id=$1", [uid]);
      }
    }), async c => {
      assert.equal((await c.query('SELECT public.jomlepakz_account_access() AS access')).rows[0].access.state, 'restricted');
      await assert.rejects(rpc(c), error => error.code === '42501');
    });
  });
}
for (const [name, setup] of [
  ['unconfirmed', c => c.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1', [uid])],
  ['Auth banned', c => c.query("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1", [uid])],
  ['revoked', c => c.query('INSERT INTO private.revoked_auth_identities(auth_user_id) VALUES($1)', [uid])],
  ['domain disabled', c => c.query('UPDATE private.approved_email_domains SET is_active=false WHERE domain=(SELECT private.normalized_email_domain(email) FROM auth.users WHERE id=$1)', [uid])],
  ['disallowed exact domain', c => c.query("UPDATE auth.users SET email='local-onboarding@not-approved.example' WHERE id=$1", [uid])],
]) test(`${name} identity is denied`, async () => {
  await scenario(setup, async c => {
    assert.equal((await c.query('SELECT public.jomlepakz_account_access() AS access')).rows[0].access.state, 'restricted');
    await assert.rejects(rpc(c), error => error.code === '42501');
  });
});

test('invalid fields are rejected by SQL independently of the form', async () => {
  for (const value of ['', '   ', '\u00a0', 'bad\ntext', 'bad\u0085text', 'bad\u2028text', 'x'.repeat(151)]) {
    await scenario(null, async c => {
      await assert.rejects(c.query('SELECT public.jomlepakz_complete_onboarding($1,$1,$1)', [value]), error => error.code === '22023');
    });
  }
});
test('ordinary users cannot directly insert or update profiles', async () => {
  for (const query of ["INSERT INTO public.profiles(full_name) VALUES('Forged')", "UPDATE public.profiles SET account_status='active'"]) {
    await scenario(null, c => assert.rejects(c.query(query), error => error.code === '42501'));
  }
});

test('two overlapping onboarding submissions create exactly one profile', async () => {
  let created;
  try {
    await operator.query('BEGIN');
    await operator.query('SELECT pg_advisory_xact_lock(20261010,1)');
    const competing = Promise.allSettled([asCaller(uid, rpc), asCaller(uid, rpc)]);
    let queued = false;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const waiting = await operator.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='jomlepakz-focused-qa' AND wait_event='advisory' AND query LIKE 'SELECT public.jomlepakz_complete_onboarding%'");
        if (waiting.rows[0].n === 2) { queued = true; break; }
        await delay(100); await operator.query('SELECT pg_stat_clear_snapshot()');
      }
    } finally { await operator.query('ROLLBACK'); }
    const results = await competing;
    assert.equal(queued, true, 'both real callers must overlap at the mutation gate');
    assert.ok(results.every(result => result.status === 'fulfilled' && result.value.rows[0].result === true));
    const rows = (await operator.query('SELECT id FROM public.profiles WHERE auth_user_id=$1', [uid])).rows;
    assert.equal(rows.length, 1); created = rows[0].id;
  } finally {
    // A was verified missing before this suite; delete only the exact new local
    // profile. Auth credentials are never deleted or changed by this cleanup.
    const rows = await operator.query('SELECT id FROM public.profiles WHERE auth_user_id=$1', [uid]);
    created ??= rows.rows[0]?.id;
    if (created) await operator.query('DELETE FROM public.profiles WHERE id=$1 AND auth_user_id=$2', [created, uid]);
  }
});
