import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../migrations/20261013120000_activity_bookmarks.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
test('bookmark migration is additive, owner-scoped, non-bypass and has no participant writes', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.match(sql, /CREATE ROLE jomlepakz_bookmark_api[\s\S]*NOBYPASSRLS/);
  assert.match(sql, /bookmarks_owner_gate[\s\S]*AS RESTRICTIVE/);
  assert.match(sql, /WITH CHECK \(user_id = \(SELECT private.discovery_actor\(\)\)\)/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE)\b|(?:INSERT INTO|UPDATE|DELETE FROM) public\.activity_participants/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO (?:anon|authenticated)/);
  assert.match(sql, /REVOKE jomlepakz_bookmark_api FROM postgres/);
});
test('bookmark mutation derives owner after the shared gate and uses explicit idempotent state', () => {
  assert.match(sql, /pg_advisory_xact_lock\(20261010, 1\);\s*actor := private.discovery_actor\(\)/);
  assert.match(sql, /IF public.jomlepakz_activity_details\(p_activity_id\) IS NULL/);
  assert.match(sql, /ON CONFLICT \(user_id, activity_id\) DO NOTHING/);
  assert.match(sql, /DELETE FROM public.saved_activities WHERE user_id = actor AND activity_id = p_activity_id/);
  assert.match(sql, /ORDER BY created_at DESC, activity_id DESC LIMIT 21 OFFSET/);
  assert.match(sql, /public.jomlepakz_activity_details\(activity_id\)/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
});
test('bookmark migration SQL quotes, bodies and top-level statement delimiters are balanced', () => {
  let depth = 0, tail = '';
  for (let offset = 0; offset < sql.length; offset++) {
    const character = sql[offset];
    if (character === "'") {
      let closed = false;
      for (++offset; offset < sql.length; offset++) {
        if (sql[offset] === "'" && sql[offset + 1] === "'") offset++;
        else if (sql[offset] === "'") { closed = true; break; }
      }
      assert.ok(closed); tail += 'literal'; continue;
    }
    if (character === '$') {
      const delimiter = sql.slice(offset).match(/^\$[a-zA-Z_][a-zA-Z_0-9]*\$/)?.[0];
      assert.ok(delimiter);
      const end = sql.indexOf(delimiter, offset + delimiter.length);
      assert.notEqual(end, -1); offset = end + delimiter.length - 1; tail += 'body'; continue;
    }
    if (character === '(') depth++;
    if (character === ')') depth--;
    assert.ok(depth >= 0);
    if (character === ';' && depth === 0) tail = ''; else tail += character;
  }
  assert.equal(depth, 0); assert.equal(tail.trim(), '');
});
