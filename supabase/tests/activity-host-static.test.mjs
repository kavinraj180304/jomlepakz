import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../migrations/20261010180000_activity_host_operations.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');

test('host APIs are atomic, narrowly owned and do not enable raw client access', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM|BYPASSRLS;)\b/);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO (authenticated|anon)/);
  assert.match(sql, /CREATE ROLE jomlepakz_activity_api NOLOGIN NOSUPERUSER NOINHERIT/);
  assert.match(sql, /REVOKE jomlepakz_activity_api FROM postgres/);
  assert.match(sql, /auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /IF NOT private\.current_user_is_eligible\(\)/);
  assert.equal([...sql.matchAll(/SET search_path = pg_catalog/g)].length, 6);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.jomlepakz_activity_categories/);
});

test('new migration top-level quotes, bodies and terminators are balanced', () => {
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
      tail += 'literal'; continue;
    }
    if (character === '$') {
      const delimiter = sql.slice(offset).match(/^\$[a-zA-Z_][a-zA-Z_0-9]*\$/)?.[0];
      assert.ok(delimiter);
      const end = sql.indexOf(delimiter, offset + delimiter.length);
      assert.notEqual(end, -1);
      offset = end + delimiter.length - 1;
      tail += 'body'; continue;
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
test('mutations lock before authorization, enforce ownership/revision and count real seats', () => {
  assert.equal([...sql.matchAll(/PERFORM pg_advisory_xact_lock\(20261010, 1\);\s+actor := private\.activity_actor\(\)/g)].length, 2);
  assert.equal([...sql.matchAll(/id = p_activity_id AND host_id = actor FOR UPDATE/g)].length, 2);
  assert.match(sql, /p_revision <> activity\.revision/);
  assert.match(sql, /participant_limit < 1 \+ \(SELECT count\(\*\)/);
  assert.match(sql, /WHERE activity_id = p_activity_id AND status = 'joined'/);
  assert.match(sql, /creation_request_id = p_request_id/);
  assert.match(sql, /UNIQUE \(host_id, creation_request_id\)/);
});
test('database independently validates fields, future time, mode, location and approved images', () => {
  assert.match(sql, /jsonb_object_keys\(p_input\)\) <> 10/);
  assert.match(sql, /start_time <= clock_timestamp\(\)/);
  assert.match(sql, /participant_limit NOT BETWEEN 2 AND 50/);
  assert.match(sql, /duration_minutes NOT BETWEEN 30 AND 240/);
  assert.match(sql, /p_input ->> 'join_mode' <> activity\.join_mode/);
  assert.match(sql, /p_input ->> 'cover_key' NOT IN \('none', 'sports', 'food', 'study'\)/);
  assert.match(sql, /char_length\(location_value\) NOT BETWEEN 1 AND 150/);
});
test('curated SQL locations match the application configuration', () => {
  const config = readFileSync(new URL('../../src/lib/config/um-locations.ts', import.meta.url), 'utf8');
  const rows = [...config.matchAll(/id: "([^"]+)", label: "([^"]+)", isActive: true/g)];
  assert.equal(rows.length, 6);
  for (const [, id, label] of rows) assert.ok(sql.includes(`WHEN '${id}' THEN '${label}'`));
});
test('cancellation retains activity/history, closes pending requests and notifies atomically', () => {
  assert.match(sql, /status = 'cancelled', cancelled_at = clock_timestamp\(\), revision = revision \+ 1/);
  assert.match(sql, /status = 'declined', status_changed_at = clock_timestamp\(\)/);
  assert.match(sql, /decided_at = NULL, decided_by = NULL/);
  assert.equal([...sql.matchAll(/INSERT INTO public\.notifications/g)].length, 2);
  assert.match(sql, /IF activity\.status = 'cancelled' THEN RETURN activity\.id/);
  assert.doesNotMatch(sql, /GRANT DELETE/);
});
