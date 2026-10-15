-- Confirmed approved-domain email is the approved MVP verification mechanism.
-- No Auth users, profile fixtures, or direct client profile grants are added.
BEGIN;

CREATE FUNCTION public.jomlepakz_account_access() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE profile record;
BEGIN
  IF auth.uid() IS NULL OR NOT private.current_user_has_approved_identity() THEN
    RETURN jsonb_build_object('state', 'restricted');
  END IF;
  IF private.current_user_is_eligible() THEN RETURN jsonb_build_object('state', 'eligible'); END IF;
  SELECT account_status, full_name, faculty, programme INTO profile
    FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'needs_onboarding'); END IF;
  IF profile.account_status = 'pending_verification' THEN
    RETURN jsonb_build_object('state', 'needs_onboarding', 'profile', jsonb_build_object(
      'full_name', profile.full_name, 'faculty', profile.faculty, 'programme', profile.programme));
  END IF;
  -- Approved but neither eligible nor pending is an invariant error, not onboarding.
  RAISE EXCEPTION 'Account state unavailable' USING ERRCODE = 'P0001';
END;
$function$;
ALTER FUNCTION public.jomlepakz_account_access() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.jomlepakz_account_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_account_access() TO authenticated;

-- Managed Auth/domain access remains inside this bounded private helper.
-- Auth updates take their user-row lock before the email invalidation trigger
-- locks a profile; keep that same order here to avoid an email-change deadlock.
CREATE FUNCTION private.onboarding_lock_identity() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE caller uuid := auth.uid(); current_email text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Onboarding denied' USING ERRCODE = '42501'; END IF;
  SELECT email INTO current_email FROM auth.users WHERE id = caller FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM private.approved_email_domains
    WHERE domain = private.normalized_email_domain(current_email) COLLATE "C" FOR SHARE;
  IF NOT private.current_user_has_approved_identity() THEN
    RAISE EXCEPTION 'Onboarding denied' USING ERRCODE = '42501';
  END IF;
END;
$function$;
ALTER FUNCTION private.onboarding_lock_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.onboarding_lock_identity() FROM PUBLIC, anon, authenticated;

CREATE ROLE jomlepakz_onboarding_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private, auth TO jomlepakz_onboarding_api;
GRANT EXECUTE ON FUNCTION auth.uid(), private.onboarding_lock_identity(),
  private.current_user_has_approved_identity(), private.current_user_is_eligible(),
  public.jomlepakz_valid_interests(text[]) TO jomlepakz_onboarding_api;
GRANT SELECT (id, auth_user_id, account_status) ON public.profiles TO jomlepakz_onboarding_api;
GRANT INSERT (auth_user_id, full_name, faculty, programme, account_status, verified_at),
  UPDATE (full_name, faculty, programme, account_status, verified_at)
  ON public.profiles TO jomlepakz_onboarding_api;
CREATE POLICY onboarding_self_gate ON public.profiles AS RESTRICTIVE FOR ALL TO jomlepakz_onboarding_api
  USING (auth_user_id = (SELECT auth.uid())) WITH CHECK (auth_user_id = (SELECT auth.uid()));
CREATE POLICY onboarding_self_read ON public.profiles FOR SELECT TO jomlepakz_onboarding_api
  USING (auth_user_id = (SELECT auth.uid()));
CREATE POLICY onboarding_self_insert ON public.profiles FOR INSERT TO jomlepakz_onboarding_api
  WITH CHECK (auth_user_id = (SELECT auth.uid()) AND account_status = 'active' AND verified_at IS NOT NULL
    AND private.current_user_has_approved_identity());
CREATE POLICY onboarding_pending_update ON public.profiles FOR UPDATE TO jomlepakz_onboarding_api
  USING (auth_user_id = (SELECT auth.uid()) AND account_status IN ('pending_verification', 'active'))
  WITH CHECK (auth_user_id = (SELECT auth.uid()) AND account_status = 'active' AND verified_at IS NOT NULL
    AND private.current_user_has_approved_identity());

CREATE FUNCTION public.jomlepakz_complete_onboarding(p_full_name text, p_faculty text, p_programme text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE caller uuid := auth.uid(); profile record;
  normalized_name text; normalized_faculty text; normalized_programme text;
  -- Match JavaScript trim's non-control whitespace, independent of DB locale.
  trim_characters constant text := ' ' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000\FEFF';
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Unsupported onboarding isolation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  PERFORM private.onboarding_lock_identity();
  SELECT id, account_status INTO profile FROM public.profiles WHERE auth_user_id = caller FOR UPDATE;
  IF FOUND THEN
    IF profile.account_status = 'active' AND private.current_user_is_eligible() THEN RETURN true; END IF;
    IF profile.account_status <> 'pending_verification' THEN
      RAISE EXCEPTION 'Onboarding denied' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Reject controls before trimming, including CR/LF/tab; fields are single-line.
  normalized_name := btrim(p_full_name, trim_characters);
  normalized_faculty := btrim(p_faculty, trim_characters);
  normalized_programme := btrim(p_programme, trim_characters);
  IF normalized_name IS NULL OR char_length(normalized_name) NOT BETWEEN 1 AND 100
    OR normalized_faculty IS NULL OR char_length(normalized_faculty) NOT BETWEEN 1 AND 150
    OR normalized_programme IS NULL OR char_length(normalized_programme) NOT BETWEEN 1 AND 150
    OR normalized_name !~ '[^[:space:]]' OR normalized_faculty !~ '[^[:space:]]' OR normalized_programme !~ '[^[:space:]]'
    OR p_full_name ~ '[[:cntrl:]]' OR p_faculty ~ '[[:cntrl:]]' OR p_programme ~ '[[:cntrl:]]'
    OR (p_full_name || p_faculty || p_programme) ~ U&'[\007F-\009F\2028\2029]' THEN
    RAISE EXCEPTION 'Invalid onboarding fields' USING ERRCODE = '22023';
  END IF;
  IF profile.id IS NULL THEN
    INSERT INTO public.profiles (auth_user_id, full_name, faculty, programme, account_status, verified_at)
      VALUES (caller, normalized_name, normalized_faculty, normalized_programme, 'active', clock_timestamp());
  ELSE
    UPDATE public.profiles SET full_name = normalized_name, faculty = normalized_faculty,
      programme = normalized_programme, account_status = 'active', verified_at = clock_timestamp()
      WHERE auth_user_id = caller AND account_status = 'pending_verification';
  END IF;
  IF NOT private.current_user_is_eligible() THEN
    RAISE EXCEPTION 'Onboarding unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN true;
END;
$function$;
GRANT jomlepakz_onboarding_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_onboarding_api;
ALTER FUNCTION public.jomlepakz_complete_onboarding(text, text, text) OWNER TO jomlepakz_onboarding_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_onboarding_api;
REVOKE ALL ON FUNCTION public.jomlepakz_complete_onboarding(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_complete_onboarding(text, text, text) TO authenticated;
REVOKE jomlepakz_onboarding_api FROM postgres;
COMMIT;
