-- Keep managed Auth lookups behind a narrow postgres-owned private helper.
BEGIN;

CREATE FUNCTION private.activity_caller_uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT auth.uid();
$function$;
ALTER FUNCTION private.activity_caller_uid() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.activity_caller_uid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.activity_caller_uid() TO jomlepakz_activity_api;

-- Preserve the restricted owner and ACL; retain membership until all changes finish.
GRANT jomlepakz_activity_api TO postgres;

CREATE OR REPLACE FUNCTION private.activity_actor()
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid;
BEGIN
  IF NOT private.current_user_is_eligible() THEN
    RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO actor FROM public.profiles WHERE auth_user_id = private.activity_caller_uid();
  IF actor IS NULL THEN RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END;
$function$;

ALTER POLICY activity_api_profile_self ON public.profiles
  USING (auth_user_id = (SELECT private.activity_caller_uid()));
ALTER POLICY activity_api_owned_read ON public.activities
  USING (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT private.activity_caller_uid())));
ALTER POLICY activity_api_owned_insert ON public.activities
  WITH CHECK (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT private.activity_caller_uid()))
    AND status = 'scheduled' AND visibility_status = 'visible');
ALTER POLICY activity_api_owned_update ON public.activities
  USING (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT private.activity_caller_uid())))
  WITH CHECK (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT private.activity_caller_uid()))
    AND status IN ('scheduled', 'cancelled'));

REVOKE jomlepakz_activity_api FROM postgres;
COMMIT;
