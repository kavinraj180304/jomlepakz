import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../migrations/20261013200000_completion_private_feedback.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
test('completion checks post-lock wall clock, host/admin authority and freezes non-host joined eligibility', () => {
  assert.match(sql, /finished_at := clock_timestamp\(\);\s*IF target.ends_at > finished_at/);
  assert.match(sql, /target.host_id <> actor AND NOT administrator/);
  assert.match(sql, /status = 'joined' AND user_id <> target.host_id AND joined_at <= finished_at/);
  assert.match(sql, /actor, 'admin', 'complete_activity'/);
  assert.match(sql, /NOBYPASSRLS/);
});
test('feedback is author-only, unique, immutable and never broadly readable by admin/host', () => {
  assert.match(sql, /USING \(author_id = private.discovery_actor\(\)\)/);
  assert.match(sql, /target.host_id = actor OR NOT EXISTS/);
  assert.match(sql, /IF previous = normalized THEN RETURN true/);
  assert.match(sql, /USING ERRCODE = '23505'/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|ALL)[^;]*activity_feedback[^;]*TO (?:authenticated|jomlepakz_admin_api)|UPDATE public.activity_feedback|DELETE FROM public.activity_feedback/);
  assert.match(sql, /private.discovery_can_read\(target.id/);
});
