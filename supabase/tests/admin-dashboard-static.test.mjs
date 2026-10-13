import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../migrations/20261013180000_admin_dashboard.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
test('admin migration uses live protected membership, non-bypass owner and no chat/grant capability', () => {
  assert.match(sql, /user_id = private.discovery_actor\(\) AND status = 'active'/);
  assert.match(sql, /NOBYPASSRLS/);
  assert.doesNotMatch(sql, /GRANT[^;]*ON public.messages|INSERT INTO public.admin_memberships|CREATE FUNCTION public[^;]*grant_admin/);
  assert.match(sql, /REVOKE jomlepakz_admin_api FROM postgres/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]*TO authenticated/);
});
test('moderation acquires shared gate before live authority, checks revisions and inserts atomic audit', () => {
  assert.match(sql, /pg_advisory_xact_lock\(20261010, 1\);\s*IF NOT private.current_user_is_admin/);
  assert.match(sql, /USING ERRCODE = '40001'/);
  assert.match(sql, /VALUES \(audit_id, actor, 'admin', p_action/);
  assert.match(sql, /SET account_status = CASE WHEN p_action = 'ban_user' THEN 'banned'/);
  assert.match(sql, /r.reporter_id <> private.discovery_actor/);
  assert.match(sql, /r.target_type IN \('activity', 'user'\)/);
  assert.match(sql, /GRANT INSERT \(id\) ON public.moderation_actions/);
});
