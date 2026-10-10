import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../migrations/20261010200000_activity_discovery.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');
test('discovery is read only with narrow non-bypass owner and client EXECUTE only', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|INSERT INTO|UPDATE public|DELETE FROM)\b/);
  assert.match(sql, /CREATE ROLE jomlepakz_discovery_api NOLOGIN NOSUPERUSER NOINHERIT[\s\S]*NOBYPASSRLS/);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO (authenticated|anon)/);
  assert.match(sql, /REVOKE jomlepakz_discovery_api FROM postgres/);
  assert.match(sql, /ALTER FUNCTION public\.jomlepakz_activity_details\(uuid\) OWNER TO jomlepakz_discovery_api/);
  assert.equal([...sql.matchAll(/SET search_path = pg_catalog/g)].length, 6);
  assert.equal([...sql.matchAll(/IF NOT private\.current_user_is_eligible\(\)/g)].length, 2);
  assert.match(sql, /CREATE POLICY discovery_activities[\s\S]*private\.discovery_can_read/);
});
test('row visibility, privacy, host-inclusive counts and bounded stable pagination are database enforced', () => {
  assert.match(sql, /p_visibility = 'visible'/);
  assert.match(sql, /blocker_id = private\.discovery_actor\(\) AND blocked_id = p_host/);
  assert.match(sql, /blocked_id = private\.discovery_actor\(\) AND blocker_id = p_host/);
  assert.match(sql, /status = 'joined'/);
  assert.match(sql, /profile_visibility = 'students' OR private\.discovery_is_member/);
  assert.match(sql, /ELSE 'UM activity host'/);
  assert.match(sql, /p_page NOT BETWEEN 1 AND 500/);
  assert.match(sql, /ORDER BY a\.starts_at, a\.id LIMIT 21 OFFSET \(p_page - 1\) \* 20/);
  assert.match(sql, /'occupied', 1 \+ \(SELECT count\(\*\)/);
  assert.match(sql, /Asia\/Kuala_Lumpur/);
});
test('SQL delimiters, parentheses and final statement are balanced', () => {
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
