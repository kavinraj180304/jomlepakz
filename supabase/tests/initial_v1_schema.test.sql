-- Local pgTAP catalog/permission checks only. No fixture users or profiles.
-- Run against the local Supabase database after migration, never Production.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
-- Test-only pgTAP execution under client roles; rolled back with the suite.
-- New extension functions no longer inherit PUBLIC EXECUTE after hardening.
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;
DO $test_acl$
DECLARE function_signature text;
BEGIN
  FOR function_signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e' AND e.extname = 'pgtap'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', function_signature); END LOOP;
END;
$test_acl$;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(12);

-- Scope every catalog assertion to the twelve approved application tables.
CREATE TEMP TABLE expected_v1_tables (name text PRIMARY KEY);
INSERT INTO expected_v1_tables (name) VALUES
  ('profiles'), ('categories'), ('activities'), ('activity_participants'),
  ('saved_activities'), ('messages'), ('notifications'), ('reports'),
  ('blocked_users'), ('admin_memberships'), ('moderation_actions'), ('activity_feedback');

SELECT is((
  SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND c.relkind = 'r'
), 12, 'all twelve application tables exist');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND NOT c.relrowsecurity
), 'RLS enabled on every application table');

SELECT is((
  SELECT count(*)::integer FROM pg_policies p
  JOIN expected_v1_tables t ON t.name = p.tablename WHERE p.schemaname = 'public'
    AND p.permissive = 'PERMISSIVE'
    AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
), 0, 'no permissive client policies; internal gate roles do not grant client access');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM expected_v1_tables t
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS permissions(name)
  WHERE has_table_privilege('anon', format('public.%I', t.name), permissions.name)
), 'anon has no application table privileges');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM expected_v1_tables t
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS permissions(name)
  WHERE has_table_privilege('authenticated', format('public.%I', t.name), permissions.name)
), 'authenticated has no application table privileges');

SELECT is((
  SELECT count(*)::integer FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND k.contype = 'p'
), 12, 'every table has a primary key');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND k.contype = 'f' AND NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid
      AND i.indisvalid AND i.indpred IS NULL AND i.indnkeyatts >= cardinality(k.conkey)
      AND NOT EXISTS (
        SELECT 1 FROM generate_subscripts(k.conkey, 1) AS key_position(value)
        WHERE i.indkey[key_position.value - 1] <> k.conkey[key_position.value]
      )
  )
), 'all foreign keys have a supporting leading-column index');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname LIKE '%\_at' ESCAPE '\' AND a.atttypid <> 'timestamptz'::regtype
), 'all timestamp fields use timestamptz');

SELECT is((
  SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'jomlepakz_valid_interests', 'jomlepakz_stamp_timestamps', 'jomlepakz_notification_links'
  ) AND NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog']
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 3, 'helpers are invoker-only, use safe search paths and deny client execution');

SELECT ok(public.jomlepakz_valid_interests(ARRAY['Sports', 'Networking'])
  AND public.jomlepakz_valid_interests('{}'::text[])
  AND NOT public.jomlepakz_valid_interests(ARRAY['Sports', 'Sports'])
  AND NOT public.jomlepakz_valid_interests(ARRAY['Unknown'])
  AND NOT public.jomlepakz_valid_interests(ARRAY['Sports', NULL]),
  'interest allowlist accepts empty/valid values and rejects duplicates, unknowns and nulls');

SELECT is((
  SELECT count(*)::integer FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN expected_v1_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND NOT g.tgisinternal AND g.tgenabled = 'O'
    AND g.tgfoid IN ('public.jomlepakz_stamp_timestamps()'::regprocedure,
      'public.jomlepakz_notification_links()'::regprocedure)
), 12, 'eleven creation timestamp triggers plus notification-link trigger exist');

SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint k
  WHERE k.conrelid = 'public.notifications'::regclass
    AND k.conname = 'notifications_message_activity_fk'
    AND k.confrelid = 'public.messages'::regclass
    AND cardinality(k.conkey) = 2 AND k.confdeltype = 'n'
), 'notifications use a message/activity composite foreign key with null-on-purge behavior');

SELECT * FROM finish();
ROLLBACK;
