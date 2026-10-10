import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../migrations/20261010160000_rls_foundation.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');
const tables = ['profiles', 'categories', 'activities', 'activity_participants',
  'saved_activities', 'messages', 'notifications', 'reports', 'blocked_users',
  'admin_memberships', 'moderation_actions', 'activity_feedback'];

test('foundation is atomic, additive and adds no users or business permissions', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  assert.doesNotMatch(sql, /INSERT INTO (auth\.users|public\.profiles)/i);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO (authenticated|anon)/i);
  assert.match(sql, /current_user <> 'postgres'/);
});

test('migration quotes, dollar bodies and top-level statement delimiters are balanced', () => {
  let depth = 0;
  let tail = '';
  for (let offset = 0; offset < sql.length; offset++) {
    const character = sql[offset];
    if (character === "'") {
      let closed = false;
      for (++offset; offset < sql.length; offset++) {
        if (sql[offset] === "'" && sql[offset + 1] === "'") offset++;
        else if (sql[offset] === "'") { closed = true; break; }
      }
      assert.ok(closed);
      tail += 'literal';
      continue;
    }
    if (character === '$') {
      const delimiter = sql.slice(offset).match(/^\$[a-zA-Z_][a-zA-Z_0-9]*\$/)?.[0];
      assert.ok(delimiter);
      const end = sql.indexOf(delimiter, offset + delimiter.length);
      assert.notEqual(end, -1);
      offset = end + delimiter.length - 1;
      tail += 'body';
      continue;
    }
    if (character === '(') depth++;
    if (character === ')') depth--;
    assert.ok(depth >= 0);
    if (character === ';' && depth === 0) tail = '';
    else tail += character;
  }
  assert.equal(depth, 0);
  assert.equal(tail.trim(), '');
});

test('table and column privileges are revoked and all twelve tables veto client access', () => {
  for (const table of tables) assert.ok(sql.includes(`'${table}'`));
  assert.match(sql, /REVOKE SELECT \(%s\), INSERT \(%s\), UPDATE \(%s\), REFERENCES \(%s\)/);
  assert.match(sql, /foundation_client_deny[^']*AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/);
});

test('future defaults revoke global and schema additions, rather than a ineffective schema-only revoke', () => {
  for (const kind of ['FUNCTIONS', 'TABLES', 'SEQUENCES']) {
    assert.match(sql, new RegExp(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres\\s+REVOKE (EXECUTE|ALL) ON ${kind} FROM PUBLIC, anon, authenticated`));
    assert.match(sql, new RegExp(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, private\\s+REVOKE (EXECUTE|ALL) ON ${kind}`));
  }
});

test('unlink revocation survives tombstoning and both self-checks consult it', () => {
  assert.match(sql, /CREATE TABLE private\.revoked_auth_identities/);
  assert.match(sql, /OLD\.auth_user_id IS DISTINCT FROM NEW\.auth_user_id/);
  assert.match(sql, /VALUES \(OLD\.auth_user_id\) ON CONFLICT DO NOTHING/);
  assert.equal([...sql.matchAll(/r\.auth_user_id = u\.id/g)].length, 2);
  assert.equal([...sql.matchAll(/u\.id = auth\.uid\(\)/g)].length, 2);
  assert.doesNotMatch(sql, /REFERENCES auth\.users/);
});

test('privileged functions have fixed paths, bounded owners and explicit execute revocation', () => {
  assert.equal([...sql.matchAll(/SET search_path = pg_catalog/g)].length, 3);
  assert.match(sql, /record_unlinked_auth_identity\(\) OWNER TO jomlepakz_auth_gate/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.record_unlinked_auth_identity\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT INSERT \(auth_user_id\)[^;]*TO jomlepakz_auth_gate/);
  assert.match(sql, /REVOKE jomlepakz_auth_gate FROM postgres/);
  assert.doesNotMatch(sql, /auth\.jwt\(|raw_user_meta_data/);
});

test('avatar storage is private, bounded and denied even alongside permissive policies', () => {
  assert.match(sql, /VALUES \('avatars', 'avatars', false, 2097152, ARRAY\['image\/webp'\]/);
  assert.match(sql, /ON storage\.objects AS RESTRICTIVE\s+FOR ALL TO anon, authenticated\s+USING \(bucket_id <> 'avatars'\) WITH CHECK \(bucket_id <> 'avatars'\)/);
  assert.match(sql, /ON storage\.buckets AS RESTRICTIVE\s+FOR ALL TO anon, authenticated\s+USING \(id <> 'avatars'\) WITH CHECK \(id <> 'avatars'\)/);
  assert.match(sql, /c\.relname IN \('objects', 'buckets'\) AND c\.relrowsecurity/);
  assert.doesNotMatch(sql, /GRANT[^;]*ON storage\./);
});
