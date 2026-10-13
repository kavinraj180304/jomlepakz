import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

export const demoData = JSON.parse(readFileSync(new URL('../development/demo-data.json', import.meta.url), 'utf8'));
export function demoConfig(env = process.env) {
  if (env.DEMO_TARGET !== 'local-disposable' || env.NODE_ENV === 'production') throw new Error('BLOCKED: demo data requires an explicit disposable local development target.');
  let url;
  try { url = new URL(env.DEMO_DATABASE_URL); } catch { throw new Error('BLOCKED: configure a local demo database privately.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('BLOCKED: hosted databases are never accepted for demo insertion.');
  const ids = [env.DEMO_HOST_UID, env.DEMO_PARTICIPANT_UID];
  if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) || ids[0] === ids[1]) throw new Error('BLOCKED: two distinct existing fictional development Auth accounts are required.');
  return { databaseURL: url.href, ids };
}
export async function insertDemo(client, config) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(20261010,1)');
    const people = await client.query(`SELECT p.id,p.auth_user_id,p.full_name FROM public.profiles p JOIN auth.users u ON u.id=p.auth_user_id
      WHERE p.auth_user_id=ANY($1::uuid[]) AND p.account_status='active' AND p.verified_at IS NOT NULL
        AND u.email_confirmed_at IS NOT NULL AND private.notification_profile_eligible(p.id) FOR UPDATE OF p`, [config.ids]);
    const host = people.rows.find(p => p.auth_user_id === config.ids[0]);
    const participant = people.rows.find(p => p.auth_user_id === config.ids[1]);
    if (host?.full_name !== demoData.personas.host || participant?.full_name !== demoData.personas.participant) throw new Error('BLOCKED: profiles must already have the exact fictional [DEMO] names in the reviewed manifest. No account/profile changes are made.');
    const blocks = await client.query('SELECT 1 FROM public.blocked_users WHERE blocker_id=ANY($1::uuid[]) AND blocked_id=ANY($1::uuid[])', [[host.id, participant.id]]);
    if (blocks.rowCount) throw new Error('BLOCKED: select an unblocked fictional development profile pair.');
    for (const item of demoData.activities) {
      const category = await client.query('SELECT id FROM public.categories WHERE slug=$1 AND is_active', [item.category]);
      if (!category.rows[0]) throw new Error('BLOCKED: seed the existing active reference categories first.');
      const existing = await client.query('SELECT host_id,title FROM public.activities WHERE id=$1', [item.id]);
      if (existing.rows[0] && (existing.rows[0].host_id !== host.id || existing.rows[0].title !== item.title)) throw new Error('BLOCKED: a demo UUID collides with another record. No existing record is overwritten.');
      const inserted = await client.query(`INSERT INTO public.activities (id,host_id,category_id,title,description,location_text,starts_at,ends_at,capacity,join_mode,status,cancelled_at)
        VALUES ($1,$2,$3,$4,$5,$6,statement_timestamp()+$7*interval '1 day',statement_timestamp()+$7*interval '1 day'+interval '1 hour',$8,$9,$10,
          CASE WHEN $10='cancelled' THEN statement_timestamp() ELSE NULL END) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [item.id, host.id, category.rows[0].id, item.title, item.description, item.location, item.dayOffset, item.capacity, item.joinMode, item.status]);
      // Replays never reset live demo edits, dates or relationships.
      if (!inserted.rowCount) continue;
      await client.query(`INSERT INTO public.activity_participants(activity_id,user_id,status,joined_at)
        VALUES ($1,$2,$3,CASE WHEN $3='joined' THEN statement_timestamp() ELSE NULL END)`, [item.id, participant.id, item.participantStatus]);
      await client.query('INSERT INTO public.saved_activities(user_id,activity_id) VALUES ($1,$2)', [participant.id, item.id]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function main() {
  let client;
  try {
    const config = demoConfig();
    client = new Client({ connectionString: config.databaseURL, connectionTimeoutMillis: 5000 });
    await client.connect();
    await insertDemo(client, config);
    console.log('Fictional local demo activities prepared. Existing records were preserved.');
  } catch (error) {
    // Never print connection credentials, SQL or raw database/provider errors.
    console.error(error.message?.startsWith('BLOCKED:') ? error.message : 'Demo insertion failed; the transaction was rolled back. Check your local setup.');
    process.exitCode = 1;
  } finally { await client?.end().catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
