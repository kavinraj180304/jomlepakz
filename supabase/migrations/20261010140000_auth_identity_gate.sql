-- Additive self-only identity gate for OAuth callback and password recovery.
-- Apply as the trusted postgres migration operator. No client table grants.
BEGIN;
CREATE FUNCTION private.current_user_has_approved_identity()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
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
  );
$function$;
CREATE FUNCTION public.jomlepakz_current_user_has_approved_identity()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT private.current_user_has_approved_identity();
$function$;
REVOKE ALL ON FUNCTION private.current_user_has_approved_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jomlepakz_current_user_has_approved_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_has_approved_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_current_user_has_approved_identity() TO authenticated;
COMMENT ON FUNCTION public.jomlepakz_current_user_has_approved_identity() IS
  'Self-only verified domain/status check; never grants app access, profile activation or admin status.';
COMMIT;
