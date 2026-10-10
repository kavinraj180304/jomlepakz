-- Foundation hardening only. No feature permissions or synthetic users.
-- Apply after the three preceding migrations as postgres, in Development first.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this migration as the trusted postgres migration operator';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets') AND c.relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'Supabase Storage objects and buckets RLS must already be enabled';
  END IF;
END;
$preflight$;

REVOKE CREATE ON SCHEMA public, private FROM PUBLIC, anon, authenticated;
-- Global function defaults are necessary: a schema-only revoke cannot remove
-- PostgreSQL's global PUBLIC EXECUTE default. Existing functions are unchanged.
-- Future postgres-owned functions in ANY schema need explicit execution grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, private
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, private
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Preserve identity revocation even after a profile's Auth link is scrubbed.
-- Deliberately no Auth FK: removal of the Auth row must not erase revocation.
CREATE TABLE private.revoked_auth_identities (
  auth_user_id uuid PRIMARY KEY,
  revoked_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE private.revoked_auth_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.revoked_auth_identities FROM PUBLIC, anon, authenticated;
GRANT INSERT (auth_user_id) ON private.revoked_auth_identities TO jomlepakz_auth_gate;
CREATE POLICY auth_gate_identity_revoke ON private.revoked_auth_identities
  FOR INSERT TO jomlepakz_auth_gate WITH CHECK (true);

CREATE FUNCTION private.record_unlinked_auth_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.auth_user_id IS NOT NULL AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id THEN
    INSERT INTO private.revoked_auth_identities (auth_user_id)
      VALUES (OLD.auth_user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
GRANT jomlepakz_auth_gate TO postgres;
GRANT CREATE ON SCHEMA private TO jomlepakz_auth_gate;
ALTER FUNCTION private.record_unlinked_auth_identity() OWNER TO jomlepakz_auth_gate;
REVOKE CREATE ON SCHEMA private FROM jomlepakz_auth_gate;
REVOKE jomlepakz_auth_gate FROM postgres;
REVOKE ALL ON FUNCTION private.record_unlinked_auth_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_revoke_unlinked_identity BEFORE UPDATE OF auth_user_id
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.record_unlinked_auth_identity();

-- Replace bodies in this NEW migration; never edit previously applied files.
CREATE OR REPLACE FUNCTION private.current_user_is_eligible()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.auth_user_id = u.id
    JOIN private.approved_email_domains d
      ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false) AND d.is_active
      AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND p.account_status = 'active' AND p.verified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
  );
$function$;
CREATE OR REPLACE FUNCTION private.current_user_has_approved_identity()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN private.approved_email_domains d
      ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false) AND d.is_active
      AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.profiles p
        WHERE p.auth_user_id = u.id AND p.account_status IN ('suspended', 'deleted'))
      AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
  );
$function$;
ALTER FUNCTION private.current_user_is_eligible() OWNER TO postgres;
ALTER FUNCTION private.current_user_has_approved_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.current_user_is_eligible(),
  private.current_user_has_approved_identity(),
  public.jomlepakz_current_user_is_eligible(),
  public.jomlepakz_current_user_has_approved_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_is_eligible(),
  private.current_user_has_approved_identity(),
  public.jomlepakz_current_user_is_eligible(),
  public.jomlepakz_current_user_has_approved_identity() TO authenticated;

-- Repeat explicit table AND column revocations, including any accidental
-- direct column grants. Retain existing internal Auth-role permissions.
DO $permissions$
DECLARE
  table_name text;
  column_names text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles', 'categories', 'activities',
    'activity_participants', 'saved_activities', 'messages', 'notifications',
    'reports', 'blocked_users', 'admin_memberships', 'moderation_actions', 'activity_feedback'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      INTO column_names FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = format('public.%I', table_name)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped;
    EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',
      column_names, column_names, column_names, column_names, table_name);
    -- Also prevent accidental broad existing client policies from opening
    -- this foundation merely because someone restores a grant.
    EXECUTE format('CREATE POLICY foundation_client_deny ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', table_name);
  END LOOP;
END;
$permissions$;

-- Reserve the avatar namespace. An existing bucket is a preflight conflict,
-- never silently convert a public bucket or overwrite existing configuration.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/webp']::text[]);
-- Scoped veto: unrelated buckets retain their existing behavior. Even a broad
-- permissive Storage policy cannot authorize clients in the avatar namespace.
CREATE POLICY jomlepakz_avatar_foundation_deny ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'avatars') WITH CHECK (bucket_id <> 'avatars');
CREATE POLICY jomlepakz_avatar_bucket_config_deny ON storage.buckets AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (id <> 'avatars') WITH CHECK (id <> 'avatars');

COMMENT ON TABLE private.revoked_auth_identities IS
  'Internal unlink revocation ledger; no client access. Historical unlinks need operator reconciliation. Retention needs review.';
COMMIT;
