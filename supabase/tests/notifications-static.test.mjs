import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../migrations/20261013160000_in_app_notifications.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
test('notification migration exposes recipient-scoped reads/read_at updates, never trusted creation', () => {
  assert.match(sql.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  assert.match(sql, /notifications_recipient_gate[\s\S]*AS RESTRICTIVE/);
  assert.match(sql, /recipient_id = \(SELECT private.discovery_actor\(\)\)/);
  assert.match(sql, /GRANT UPDATE \(read_at\)/);
  assert.doesNotMatch(sql, /GRANT INSERT[^;]*TO jomlepakz_notification_api|GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]*TO authenticated/);
  assert.match(sql, /NOBYPASSRLS/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private.notification_profile_eligible/);
  assert.doesNotMatch(sql, /CREATE FUNCTION public\.[^(]*(?:create|send|insert)_notification/);
});
test('real transitions are deduplicated; cancellation closure is not mistaken for decline', () => {
  assert.match(sql, /IF NEW.status = OLD.status THEN RETURN NEW/);
  assert.match(sql, /activity.status <> 'scheduled'/);
  assert.match(sql, /NEW.decided_by = actor AND NEW.decided_at IS NOT NULL/);
  assert.match(sql, /AFTER INSERT OR UPDATE OF status ON public.activity_participants/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(sql, /source_user_id/);
  assert.doesNotMatch(sql, /CREATE TRIGGER[^;]*ON public.messages|http|smtp|send_email/);
});
test('notification pagination/count share RLS and read state uses post-gate server time', () => {
  assert.match(sql, /ORDER BY created_at DESC, id DESC LIMIT 21/);
  assert.match(sql, /count\(\*\) FROM public.notifications WHERE recipient_id = actor AND read_at IS NULL/);
  assert.match(sql, /pg_advisory_xact_lock\(20261010, 1\);\s*actor := private.discovery_actor/);
  assert.match(sql, /read_at = greatest\(clock_timestamp\(\), created_at\)/);
  assert.match(sql, /public.jomlepakz_activity_details\(activity_id\) IS NOT NULL/);
});
