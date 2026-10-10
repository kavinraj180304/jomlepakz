-- Reviewed additive gate. Apply after the initial V1 schema; no user fixtures.
-- Dashboard hook activation is a separate required manual step (docs/setup.md).
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- This deliberately accepts ordinary ASCII mailbox syntax, not quoted local
-- parts, comments, internationalized domains or domain literals. Fail closed.
CREATE FUNCTION private.normalized_email_domain(email_to_check text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  normalized text := lower(btrim(email_to_check, E' \t\r\n') COLLATE "C");
  local_part text;
  domain_part text;
BEGIN
  IF char_length(normalized) > 254
    OR normalized !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+@[a-z0-9.-]+$' THEN
    RETURN NULL;
  END IF;
  local_part := split_part(normalized, '@', 1);
  domain_part := split_part(normalized, '@', 2);
  IF char_length(local_part) > 64 OR local_part LIKE '.%'
    OR local_part LIKE '%.' OR position('..' IN local_part) > 0
    OR char_length(domain_part) > 253
    OR domain_part !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    OR EXISTS (SELECT 1 FROM unnest(string_to_array(domain_part, '.')) AS labels(value)
      WHERE char_length(value) > 63) THEN
    RETURN NULL;
  END IF;
  RETURN domain_part;
END;
$function$;

CREATE TABLE private.approved_email_domains (
  domain text COLLATE "C" PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT approved_email_domains_canonical CHECK (
    domain = lower(domain) AND domain = btrim(domain)
    AND (private.normalized_email_domain('domain-check@' || domain) = domain) IS TRUE
  )
);
ALTER TABLE private.approved_email_domains ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER approved_email_domains_stamp BEFORE INSERT OR UPDATE
  ON private.approved_email_domains FOR EACH ROW
  EXECUTE FUNCTION public.jomlepakz_stamp_timestamps('updated_at');
-- Security configuration for all environments, not a Development fixture.
INSERT INTO private.approved_email_domains (domain) VALUES ('siswa.um.edu.my');

CREATE FUNCTION private.before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  email_domain text;
BEGIN
  IF jsonb_typeof(event -> 'user' -> 'email') = 'string' THEN
    email_domain := private.normalized_email_domain(event -> 'user' ->> 'email');
  END IF;
  IF email_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM private.approved_email_domains d
    WHERE d.domain = email_domain COLLATE "C" AND d.is_active
  ) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'An approved UM email address is required.'
  ));
END;
$function$;

-- No login, no bypass-RLS and no client membership. Only explicitly granted
-- columns are available to the email-invalidation trigger owned by this role.
CREATE ROLE jomlepakz_auth_gate NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT jomlepakz_auth_gate TO postgres;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_auth_gate;
GRANT SELECT (auth_user_id, account_status, verified_at)
  ON public.profiles TO jomlepakz_auth_gate;
GRANT UPDATE (account_status, verified_at) ON public.profiles TO jomlepakz_auth_gate;
GRANT EXECUTE ON FUNCTION public.jomlepakz_valid_interests(text[]) TO jomlepakz_auth_gate;
CREATE POLICY auth_gate_profile_read ON public.profiles
  FOR SELECT TO jomlepakz_auth_gate USING (true);
CREATE POLICY auth_gate_profile_invalidate ON public.profiles
  FOR UPDATE TO jomlepakz_auth_gate USING (true) WITH CHECK (true);
CREATE POLICY auth_gate_domain_read ON private.approved_email_domains
  FOR SELECT TO supabase_auth_admin USING (true);

-- Owned by the trusted migration operator (postgres) to read managed Auth
-- state and avoid recursive profile RLS. No Auth-table grants to client roles,
-- no caller-supplied ID, no dynamic SQL, and only a boolean leaves the function.
CREATE FUNCTION private.current_user_is_eligible()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.auth_user_id = u.id
    JOIN private.approved_email_domains d
      ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous, false)
      AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
      AND d.is_active AND p.account_status = 'active' AND p.verified_at IS NOT NULL
  );
$function$;

CREATE FUNCTION private.invalidate_profile_email_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Changing pending email_change alone does not invalidate the current email.
  -- Never restore suspended users and never touch admin memberships.
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles SET verified_at = NULL,
      account_status = CASE WHEN account_status = 'active'
        THEN 'pending_verification' ELSE account_status END
    WHERE auth_user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
-- Function ownership requires CREATE temporarily; runtime does not.
GRANT CREATE ON SCHEMA private TO jomlepakz_auth_gate;
ALTER FUNCTION private.invalidate_profile_email_verification() OWNER TO jomlepakz_auth_gate;
REVOKE CREATE ON SCHEMA private FROM jomlepakz_auth_gate;
CREATE TRIGGER jomlepakz_email_verification_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.invalidate_profile_email_verification();

-- A self-only boolean RPC for request-scoped server authorization. It exposes
-- no email, profile, arbitrary target ID, or account-management operation.
CREATE FUNCTION public.jomlepakz_current_user_is_eligible()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT private.current_user_is_eligible();
$function$;

REVOKE ALL ON TABLE private.approved_email_domains FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.normalized_email_domain(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.current_user_is_eligible() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.invalidate_profile_email_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jomlepakz_current_user_is_eligible() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin, authenticated;
GRANT SELECT ON private.approved_email_domains TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.normalized_email_domain(text) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.before_user_created(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.current_user_is_eligible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_current_user_is_eligible() TO authenticated;

-- RESTRICTIVE policies are AND gates, never grants of app access. Existing
-- revoked privileges remain revoked and no permissive client policy is added.
-- Future permissive policies must still implement ownership, blocking, etc.
CREATE POLICY um_eligibility_gate ON public.profiles AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.categories AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.activities AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.activity_participants AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.saved_activities AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.messages AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.notifications AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.reports AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.blocked_users AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.admin_memberships AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.moderation_actions AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));
CREATE POLICY um_eligibility_gate ON public.activity_feedback AS RESTRICTIVE
  FOR ALL TO authenticated USING ((SELECT private.current_user_is_eligible()))
  WITH CHECK ((SELECT private.current_user_is_eligible()));

REVOKE jomlepakz_auth_gate FROM postgres;
COMMIT;
