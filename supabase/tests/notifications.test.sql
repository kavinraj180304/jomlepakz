-- LOCAL DEVELOPMENT ONLY. Existing real A/B accounts; fixtures and ACLs roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, jomlepakz_notification_api;
DO $test_acl$
DECLARE signature text;
BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, jomlepakz_notification_api', signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('anon', 'public.jomlepakz_notifications(integer)', 'EXECUTE'), 'anonymous notification reads denied');
SELECT ok(NOT has_table_privilege('authenticated', 'public.notifications', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.notifications', 'SELECT')
  AND NOT pg_has_role('authenticated', 'jomlepakz_notification_api', 'MEMBER'), 'clients have no raw notification access or creation authority');
SELECT ok(NOT has_function_privilege('authenticated', 'private.notify_participant_transition()', 'EXECUTE'), 'trusted event producer is private');

CREATE TEMP TABLE notification_test_context AS
WITH eligible AS (
  SELECT p.id AS profile_id, u.id AS auth_id FROM public.profiles p JOIN auth.users u ON u.id = p.auth_user_id
  JOIN private.approved_email_domains d ON d.domain = private.normalized_email_domain(u.email)
  WHERE p.account_status = 'active' AND p.verified_at IS NOT NULL AND d.is_active
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
    AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
    AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
), pair AS (
  SELECT a.profile_id AS ap, a.auth_id AS a, b.profile_id AS bp, b.auth_id AS b FROM eligible a CROSS JOIN eligible b
  WHERE a.auth_id <> b.auth_id AND NOT EXISTS (SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a.profile_id AND blocked_id = b.profile_id) OR (blocker_id = b.profile_id AND blocked_id = a.profile_id))
  ORDER BY a.auth_id, b.auth_id LIMIT 1
)
SELECT (SELECT a FROM pair) AS a, (SELECT b FROM pair) AS b, (SELECT ap FROM pair) AS ap, (SELECT bp FROM pair) AS bp,
  (SELECT id FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_id,
  (SELECT slug FROM public.categories WHERE is_active ORDER BY sort_order LIMIT 1) AS category_slug;
DO $prerequisites$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notification_test_context WHERE a IS NOT NULL AND b IS NOT NULL AND category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Two existing real eligible A/B accounts and active category are required';
  END IF;
END;
$prerequisites$;
CREATE TEMP TABLE notification_fixture_ids AS
  SELECT gen_random_uuid() AS id, kind FROM unnest(ARRAY['instant', 'approval', 'decline', 'closed-pending']) kind
  UNION ALL SELECT gen_random_uuid(), 'extra' || n FROM generate_series(1, 21) n;
GRANT SELECT ON notification_test_context, notification_fixture_ids TO authenticated, jomlepakz_notification_api;
INSERT INTO public.activities (id, host_id, category_id, title, description, location_text, starts_at, ends_at, capacity, join_mode)
  SELECT f.id, t.ap, t.category_id, 'Notification ' || f.kind, 'Rolled-back notification fixture', 'UM Main Library',
    statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 1 hour', 2,
    CASE WHEN f.kind = 'instant' THEN 'instant' ELSE 'approval' END
  FROM notification_fixture_ids f CROSS JOIN notification_test_context t;

SELECT set_config('request.jwt.claim.sub', b::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM notification_test_context;
-- Trusted fixture writes simulate future join RPC transitions; clients still cannot write status.
SELECT pg_advisory_xact_lock(20261010, 1);
INSERT INTO public.activity_participants (activity_id, user_id, status, joined_at)
  SELECT f.id, t.bp, CASE WHEN f.kind = 'instant' THEN 'joined' ELSE 'pending' END,
    CASE WHEN f.kind = 'instant' THEN clock_timestamp() END
  FROM notification_fixture_ids f CROSS JOIN notification_test_context t;
UPDATE public.activity_participants SET status = status
  WHERE activity_id IN (SELECT id FROM notification_fixture_ids);
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE activity_id IN (SELECT id FROM notification_fixture_ids)
  AND kind = 'participant_joined'), 1, 'instant join emits once, same-status retries do not duplicate');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE activity_id IN (SELECT id FROM notification_fixture_ids)
  AND kind = 'join_requested'), 24, 'approval requests emit one host event per actual request');

SELECT set_config('request.jwt.claim.sub', a::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true) FROM notification_test_context;
UPDATE public.activity_participants SET status = 'joined', joined_at = clock_timestamp(),
  status_changed_at = clock_timestamp(), decided_at = clock_timestamp(), decided_by = (SELECT ap FROM notification_test_context)
  WHERE activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'approval');
UPDATE public.activity_participants SET status = 'declined', status_changed_at = clock_timestamp(),
  decided_at = clock_timestamp(), decided_by = (SELECT ap FROM notification_test_context)
  WHERE activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'decline');
SET LOCAL ROLE authenticated;
SELECT public.jomlepakz_save_activity(jsonb_build_object('title', 'Updated notification fixture',
  'description', 'Updated details', 'category_slug', t.category_slug,
  'starts_at', statement_timestamp() + interval '2 days', 'duration_minutes', 60, 'capacity', 2,
  'location_choice', 'custom', 'custom_location', 'UM Main Library', 'join_mode', 'instant', 'cover_key', 'none'),
  f.id, 1, gen_random_uuid()) FROM notification_fixture_ids f CROSS JOIN notification_test_context t WHERE f.kind = 'instant';
SELECT public.jomlepakz_cancel_activity(id, 2) FROM notification_fixture_ids WHERE kind = 'instant';
SELECT public.jomlepakz_cancel_activity(id, 1) FROM notification_fixture_ids WHERE kind = 'closed-pending';
SELECT public.jomlepakz_cancel_activity(id, 3) FROM notification_fixture_ids WHERE kind = 'instant';
SELECT throws_ok('INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key) SELECT bp, id, ''join_approved'', ''Forged event'', ''forged'' FROM notification_fixture_ids CROSS JOIN notification_test_context LIMIT 1',
  '42501', NULL::text, 'A cannot insert arbitrary trusted notification');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'closed-pending')
  AND kind = 'join_declined'), 0, 'cancellation closure is not reported as a host decline');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'instant')
  AND kind = 'activity_cancelled'), 1, 'cancellation retry emits no duplicate');
CREATE TEMP TABLE notification_expected_rows AS SELECT id, recipient_id, kind, activity_id FROM public.notifications
  WHERE activity_id IN (SELECT id FROM notification_fixture_ids);
GRANT SELECT ON notification_expected_rows TO authenticated, jomlepakz_notification_api;
CREATE FUNCTION pg_temp.notification_test_items() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $test_function$
DECLARE result jsonb := '[]'::jsonb; response jsonb; page integer;
BEGIN
  FOR page IN 1..500 LOOP
    response := public.jomlepakz_notifications(page); result := result || (response->'items');
    EXIT WHEN response->>'hasNext' = 'false';
  END LOOP;
  RETURN result;
END;
$test_function$;
REVOKE ALL ON FUNCTION pg_temp.notification_test_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.notification_test_items() TO authenticated;

SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text), 26, 'A reads own twenty-six fixture events');
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text WHERE n.recipient_id = (SELECT bp FROM notification_test_context)), 'A cannot read B notifications');
SELECT is(jsonb_array_length(public.jomlepakz_notifications()->'items'), 20, 'notifications paginate at twenty');
SELECT is(public.jomlepakz_notifications()->>'hasNext', 'true', 'lookahead exposes Next');
SELECT ok(NOT EXISTS (SELECT 1 FROM (
  SELECT entry->>'createdAt' AS created_at, entry->>'id' AS id,
    lag(entry->>'createdAt') OVER (ORDER BY ordinal) AS previous_time,
    lag(entry->>'id') OVER (ORDER BY ordinal) AS previous_id
  FROM jsonb_array_elements(public.jomlepakz_notifications()->'items') WITH ORDINALITY AS notification_rows(entry, ordinal)
) ordered WHERE (created_at::timestamptz, id::uuid) > (previous_time::timestamptz, previous_id::uuid)), 'newest-first ordering has stable ID ties');
SELECT ok(public.jomlepakz_mark_all_notifications_read() >= 26, 'A marks all visible unread pages');
SELECT is(public.jomlepakz_notifications()->>'unreadCount', '0', 'A unread count becomes zero');
SELECT is(public.jomlepakz_mark_all_notifications_read(), 0, 'repeat Mark All Read is harmless');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notifications n JOIN notification_expected_rows e ON e.id = n.id
  WHERE n.recipient_id = (SELECT bp FROM notification_test_context) AND n.read_at IS NULL), 5, 'A Mark All Read leaves all five B events unread');

SELECT set_config('request.jwt.claim.sub', b::text, true),
  set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true) FROM notification_test_context;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text), 5, 'B reads only own five fixture events');
SELECT is((SELECT entry->'activityId' FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text
  WHERE n.kind = 'activity_cancelled' AND n.activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'closed-pending')),
  'null'::jsonb, 'cancelled pending applicant gets generic event without inaccessible detail link');
SELECT is((SELECT entry->>'activityId' FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text
  WHERE n.kind = 'activity_cancelled' AND n.activity_id = (SELECT id FROM notification_fixture_ids WHERE kind = 'instant')),
  (SELECT id::text FROM notification_fixture_ids WHERE kind = 'instant'), 'joined B can follow permitted cancelled history');
SELECT throws_ok('SELECT public.jomlepakz_notifications(0)', '22023', NULL::text, 'invalid page denied for eligible B');
RESET ROLE;
SET LOCAL ROLE jomlepakz_notification_api;
SELECT is((SELECT count(*)::integer FROM public.notifications n JOIN notification_expected_rows e ON e.id = n.id
  WHERE n.recipient_id = (SELECT ap FROM notification_test_context)), 0, 'B context owner RLS hides A rows');
WITH changed AS (UPDATE public.notifications SET read_at = clock_timestamp()
  WHERE recipient_id = (SELECT ap FROM notification_test_context) RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'B context owner RLS cannot mark A rows');
SELECT throws_ok('UPDATE public.notifications SET summary = ''Forged''', '42501', NULL::text, 'read API cannot forge system text');
RESET ROLE;
CREATE TEMP TABLE notification_unread_baseline AS
  SELECT count(*) AS total, count(*) FILTER (WHERE a.host_id = t.ap OR n.source_user_id = t.ap) AS affected
  FROM public.notifications n CROSS JOIN notification_test_context t LEFT JOIN public.activities a ON a.id = n.activity_id
  WHERE n.recipient_id = t.bp AND n.read_at IS NULL
    AND private.notification_can_read(n.activity_id, n.source_user_id, n.kind);
GRANT SELECT ON notification_unread_baseline TO authenticated;
INSERT INTO public.blocked_users (blocker_id, blocked_id) SELECT bp, ap FROM notification_test_context;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(pg_temp.notification_test_items()) entry
  JOIN notification_expected_rows n ON entry->>'id' = n.id::text), 0, 'host block excludes B events from reads');
SELECT is(public.jomlepakz_notifications()->>'unreadCount', (total - affected)::text,
  'unread count excludes exactly the newly blocked unread receipts') FROM notification_unread_baseline;
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = (SELECT bp FROM notification_test_context);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.jomlepakz_notifications()', '42501', NULL::text, 'suspended B old session cannot read notifications');
SELECT throws_ok('SELECT public.jomlepakz_mark_all_notifications_read()', '42501', NULL::text, 'suspended B cannot mark read');
SELECT throws_ok('SELECT public.jomlepakz_notifications(0)', '42501', NULL::text, 'authorization takes precedence for suspended caller');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
