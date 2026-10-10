// Dependency-free source checks; these do not parse/execute PostgreSQL.
// Run: node --test supabase/tests/migration-static.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const directory = new URL('../migrations/', import.meta.url);
const filename = '20261010094238_initial_v1_schema.sql';
const source = readFileSync(new URL(filename, directory), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');
const tables = [
  'profiles', 'categories', 'activities', 'activity_participants',
  'saved_activities', 'messages', 'notifications', 'reports',
  'blocked_users', 'admin_memberships', 'moderation_actions', 'activity_feedback',
];
const definitions = new Map([...sql.matchAll(
  /CREATE TABLE public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
)].map(match => [match[1], match[2]]));

test('new timestamped migration creates exactly the approved twelve tables', () => {
  assert.match(filename, /^\d{14}_initial_v1_schema\.sql$/);
  assert.ok(readdirSync(directory).includes(filename));
  assert.deepEqual([...definitions.keys()].sort(), [...tables].sort());
  for (const [name, definition] of definitions) {
    assert.match(definition, /PRIMARY KEY/, `${name} primary key`);
    assert.match(definition, /timestamptz NOT NULL DEFAULT statement_timestamp\(\)/,
      `${name} required timestamp`);
  }
});

test('security and DDL are committed atomically without destructive or user-seeding statements', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.equal([...sql.matchAll(/^BEGIN;/gm)].length, 1);
  assert.equal([...sql.matchAll(/^COMMIT;/gm)].length, 1);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM|CREATE POLICY|SECURITY DEFINER)\b/i);
  assert.doesNotMatch(sql, /\b(INSERT INTO|ALTER TABLE auth\.|CREATE OR REPLACE)\b/i);
  assert.doesNotMatch(sql, /IF NOT EXISTS/i);
});

test('SQL lexical delimiters and top-level statement terminators are balanced', () => {
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
      assert.ok(closed, 'string literal must close');
      tail += 'literal';
      continue;
    }
    if (character === '$') {
      const delimiter = sql.slice(offset).match(/^\$[a-zA-Z_][a-zA-Z_0-9]*\$/)?.[0];
      assert.ok(delimiter, 'dollar body must have a recognized tag');
      const end = sql.indexOf(delimiter, offset + delimiter.length);
      assert.notEqual(end, -1, 'dollar body must close');
      offset = end + delimiter.length - 1;
      tail += 'body';
      continue;
    }
    if (character === '(') depth++;
    if (character === ')') depth--;
    assert.ok(depth >= 0, 'unexpected closing parenthesis');
    if (character === ';' && depth === 0) tail = '';
    else tail += character;
  }
  assert.equal(depth, 0);
  assert.equal(tail.trim(), '');
});

test('RLS and explicit privilege revocations cover every table with no client grants', () => {
  const secured = [...sql.matchAll(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY;/g)]
    .map(match => match[1]);
  assert.deepEqual(secured.sort(), [...tables].sort());
  const revoked = sql.match(/REVOKE ALL PRIVILEGES ON TABLE([\s\S]*?)FROM PUBLIC, anon, authenticated;/);
  assert.ok(revoked);
  assert.deepEqual([...revoked[1].matchAll(/public\.(\w+)/g)].map(m => m[1]).sort(),
    [...tables].sort());
  assert.doesNotMatch(sql, /^\s*GRANT\b/im);
  for (const signature of ['jomlepakz_valid_interests(text[])',
    'jomlepakz_stamp_timestamps()', 'jomlepakz_notification_links()']) {
    assert.ok(sql.includes(`REVOKE ALL PRIVILEGES ON FUNCTION public.${signature}\n  FROM PUBLIC, anon, authenticated;`));
  }
});

test('foreign keys reference existing parents and use explicit deletion behavior', () => {
  const created = new Set(['auth.users']);
  for (const [table, definition] of definitions) {
    for (const match of definition.matchAll(/REFERENCES (\w+\.\w+)\([^)]*\) ON DELETE (RESTRICT|CASCADE|SET NULL)/g)) {
      assert.ok(created.has(match[1]), `${table}: parent ${match[1]} created first`);
    }
    assert.equal([...definition.matchAll(/REFERENCES /g)].length,
      [...definition.matchAll(/ON DELETE /g)].length, `${table} explicit delete actions`);
    created.add(`public.${table}`);
  }
});

test('critical relationship, privacy and state constraints are present', () => {
  for (const table of ['activity_participants', 'saved_activities', 'blocked_users', 'activity_feedback']) {
    assert.match(definitions.get(table), /PRIMARY KEY \(\w+, \w+\)/);
  }
  assert.match(definitions.get('profiles'), /auth_user_id uuid UNIQUE REFERENCES auth\.users/);
  assert.match(definitions.get('profiles'), /profiles_active_requirements[\s\S]*auth_user_id IS NOT NULL AND verified_at IS NOT NULL/);
  assert.match(definitions.get('profiles'), /profiles_deleted_requirements/);
  assert.match(definitions.get('activities'), /capacity BETWEEN 2 AND 50/);
  assert.match(definitions.get('activities'), /ends_at > starts_at/);
  assert.doesNotMatch(definitions.get('activities'), /participant_count|is_full/);
  assert.match(definitions.get('blocked_users'), /blocker_id <> blocked_id/);
  assert.match(definitions.get('reports'), /reports_target_valid[\s\S]*target_type = 'user'[\s\S]*target_type = 'activity'[\s\S]*target_type = 'message'/);
  assert.match(definitions.get('moderation_actions'), /moderation_actions_admin_grant_operator/);
  assert.doesNotMatch(definitions.get('profiles'), /is_admin/);
  assert.doesNotMatch(definitions.get('activity_feedback'), /rating|score|target_user/);
});

test('notification references validate message/activity pairing while permitting controlled purge', () => {
  const definition = definitions.get('notifications');
  assert.match(definition, /UNIQUE \(recipient_id, event_key\)/);
  assert.match(definition, /FOREIGN KEY \(message_id, activity_id\)[\s\S]*REFERENCES public\.messages\(id, activity_id\) ON DELETE SET NULL \(message_id\)/);
  assert.match(definition, /message_id IS NULL OR \(kind = 'message' AND activity_id IS NOT NULL\)/);
  assert.match(sql, /NEW\.activity_id IS NULL OR \(NEW\.kind = 'message' AND NEW\.message_id IS NULL\)/);
  assert.match(sql, /OLD\.activity_id IS NOT NULL AND NEW\.activity_id IS NULL THEN\s*NEW\.message_id := NULL;/);
  assert.match(sql, /NEW\.summary := 'Activity no longer available'/);
});

test('documented query indexes, timestamp triggers and safe helpers are present', () => {
  const expected = ['activities_feed_idx', 'activities_category_schedule_idx',
    'activities_host_schedule_idx', 'participants_user_status_idx', 'participants_activity_status_idx',
    'saved_user_created_idx', 'messages_activity_created_idx', 'blocked_reverse_idx',
    'notifications_unread_idx', 'reports_status_created_idx', 'feedback_author_created_idx',
    'moderation_report_created_idx'];
  for (const index of expected) assert.ok(sql.includes(`CREATE INDEX ${index} ON public.`));
  assert.match(sql, /notifications_unread_idx[^;]+WHERE read_at IS NULL/);
  for (const table of tables.filter(name => name !== 'admin_memberships')) {
    assert.ok(sql.includes(`CREATE TRIGGER ${table}_stamp BEFORE INSERT OR UPDATE ON public.${table}`));
  }
  assert.equal([...sql.matchAll(/SET search_path = pg_catalog/g)].length, 3);
  assert.match(sql, /NEW\.created_at := OLD\.created_at/);
  assert.match(sql, /NEW\.updated_at := statement_timestamp\(\)/);
  assert.doesNotMatch(sql, /CHECK\s*\([^;]*\b(now|current_timestamp|auth\.uid)\b/i);
});
