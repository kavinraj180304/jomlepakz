import { Client } from 'pg';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function localQAConfig() {
  if (process.env.QA_TARGET !== 'local-disposable') throw new Error('BLOCKED: QA_TARGET=local-disposable and a reviewed local database are required.');
  let url;
  try { url = new URL(process.env.QA_DATABASE_URL); } catch { throw new Error('BLOCKED: set QA_DATABASE_URL privately in .env.qa.local.'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('BLOCKED: database QA is restricted to a local disposable PostgreSQL stack.');
  const users = [process.env.QA_A_UID, process.env.QA_B_UID, process.env.QA_ADMIN_UID];
  if (users.some(id => !uuid.test(id ?? '')) || new Set(users).size !== 3) throw new Error('BLOCKED: three distinct existing reviewed Auth UUIDs (A, B, admin) are required. No identities are created.');
  return { databaseURL: url.href, users };
}
export async function operatorClient() {
  const config = localQAConfig();
  const client = new Client({ connectionString: config.databaseURL, connectionTimeoutMillis: 5000, application_name: 'jomlepakz-focused-qa' });
  try { await client.connect(); } catch { throw new Error('BLOCKED: the configured local QA database is unavailable.'); }
  return client;
}
export async function checkIdentities(client) {
  const { users } = localQAConfig();
  const { rows } = await client.query(`SELECT p.id, p.auth_user_id, EXISTS (SELECT 1 FROM public.admin_memberships m WHERE m.user_id=p.id AND m.status='active') AS admin
    FROM public.profiles p JOIN auth.users u ON u.id=p.auth_user_id
    JOIN private.approved_email_domains d ON d.domain=private.normalized_email_domain(u.email) AND d.is_active
    WHERE p.auth_user_id=ANY($1::uuid[]) AND p.account_status='active' AND p.verified_at IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id=u.id)`, [users]);
  const profiles = users.map(uid => rows.find(row => row.auth_user_id === uid));
  if (profiles.some(p => !p) || profiles[0].admin || profiles[1].admin || !profiles[2].admin) throw new Error('BLOCKED: A/B must be eligible non-admins and the admin must have reviewed active membership.');
  const blocked = await client.query('SELECT 1 FROM public.blocked_users WHERE blocker_id=ANY($1::uuid[]) AND blocked_id=ANY($1::uuid[])', [profiles.map(p => p.id)]);
  if (blocked.rowCount) throw new Error('BLOCKED: the selected QA identities have existing blocks. Choose another reviewed local fixture set.');
  return profiles;
}
export async function asCaller(uid, operation, role = 'authenticated') {
  const client = await operatorClient();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [uid ?? '', JSON.stringify({ sub: uid, role })]);
    await client.query(role === 'anon' ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}
export async function fixture(client, hostId, { capacity = 2, mode = 'instant' } = {}) {
  const result = await client.query(`INSERT INTO public.activities (host_id,category_id,title,description,location_text,starts_at,ends_at,capacity,join_mode)
    SELECT $1,id,'Local QA membership','Disposable local QA fixture','UM Main Library',clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 1 hour',$2,$3
    FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1 RETURNING id`, [hostId, capacity, mode]);
  if (!result.rows[0]) throw new Error('BLOCKED: an active seeded category is required.');
  return result.rows[0].id;
}
export async function removeFixture(client, id) {
  // Only exact IDs created by this run; never a broad marker-based purge.
  await client.query('DELETE FROM public.notifications WHERE activity_id=$1', [id]);
  await client.query('DELETE FROM public.activities WHERE id=$1', [id]);
}
