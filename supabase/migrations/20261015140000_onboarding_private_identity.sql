-- Keep managed Auth lookups inside bounded postgres-owned private helpers.
BEGIN;

CREATE FUNCTION private.onboarding_caller_uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT auth.uid();
$function$;
ALTER FUNCTION private.onboarding_caller_uid() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.onboarding_caller_uid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.onboarding_caller_uid() TO jomlepakz_onboarding_api;

-- CREATE OR REPLACE preserves the existing restricted owner and execution ACL.
-- Keep membership until every ownership-sensitive operation has finished.
GRANT jomlepakz_onboarding_api TO postgres;

CREATE OR REPLACE FUNCTION public.jomlepakz_complete_onboarding(p_full_name text, p_faculty text, p_programme text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE caller uuid; profile record;
  normalized_name text; normalized_faculty text; normalized_programme text;
  -- Match JavaScript trim's non-control whitespace, independent of DB locale.
  trim_characters constant text := ' ' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000\FEFF';
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Unsupported onboarding isolation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  PERFORM private.onboarding_lock_identity();
  caller := private.onboarding_caller_uid();
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

ALTER POLICY onboarding_self_gate ON public.profiles
  USING (auth_user_id = (SELECT private.onboarding_caller_uid()))
  WITH CHECK (auth_user_id = (SELECT private.onboarding_caller_uid()));
ALTER POLICY onboarding_self_read ON public.profiles
  USING (auth_user_id = (SELECT private.onboarding_caller_uid()));
ALTER POLICY onboarding_self_insert ON public.profiles
  WITH CHECK (auth_user_id = (SELECT private.onboarding_caller_uid()) AND account_status = 'active' AND verified_at IS NOT NULL
    AND private.current_user_has_approved_identity());
ALTER POLICY onboarding_pending_update ON public.profiles
  USING (auth_user_id = (SELECT private.onboarding_caller_uid()) AND account_status IN ('pending_verification', 'active'))
  WITH CHECK (auth_user_id = (SELECT private.onboarding_caller_uid()) AND account_status = 'active' AND verified_at IS NOT NULL
    AND private.current_user_has_approved_identity());

REVOKE jomlepakz_onboarding_api FROM postgres;
COMMIT;
