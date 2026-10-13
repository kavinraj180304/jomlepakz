import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../migrations/20261013140000_activity_dashboard.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
test('dashboard is read-only with non-bypass RLS owner and no new activity storage or client table grants', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.match(sql, /CREATE ROLE jomlepakz_dashboard_api[\s\S]*NOBYPASSRLS/);
  assert.doesNotMatch(sql, /CREATE TABLE|\b(DROP|TRUNCATE|INSERT INTO|UPDATE public|DELETE FROM)\b/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO (?:anon|authenticated)/);
  assert.match(sql, /USING \(user_id = \(SELECT private.discovery_actor\(\)\)\)/);
  assert.match(sql, /USING \(private.discovery_can_read/);
  assert.match(sql, /REVOKE jomlepakz_dashboard_api FROM postgres/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
});
test('dashboard predicates use only host/current joined relationship, lifecycle and bounded stable pagination', () => {
  assert.match(sql, /a.host_id = actor OR EXISTS/);
  assert.match(sql, /p.user_id = actor AND p.status = 'joined'/);
  assert.match(sql, /a.status IN \('cancelled', 'completed'\) OR a.ends_at <= statement_timestamp\(\)/);
  assert.match(sql, /a.status = 'scheduled' AND a.ends_at > statement_timestamp\(\)/);
  assert.match(sql, /LIMIT 21 OFFSET \(p_page - 1\) \* 20/);
  assert.match(sql, /p_page NOT BETWEEN 1 AND 500/);
  assert.match(sql, /public.jomlepakz_activity_details\(id\)/);
  assert.match(sql, /a.id ASC/);
});
