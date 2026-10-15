-- Owner-only bookmarks. No participant writes or new client table grants.
BEGIN;
CREATE ROLE jomlepakz_bookmark_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_bookmark_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(),
  public.jomlepakz_activity_details(uuid) TO jomlepakz_bookmark_api;
GRANT SELECT (user_id, activity_id, created_at), INSERT (user_id, activity_id), DELETE
  ON public.saved_activities TO jomlepakz_bookmark_api;
-- The restrictive owner gate also protects against later broad permissive policies.
CREATE POLICY bookmarks_owner_gate ON public.saved_activities AS RESTRICTIVE
  FOR ALL TO jomlepakz_bookmark_api
  USING (user_id = (SELECT private.discovery_actor()))
  WITH CHECK (user_id = (SELECT private.discovery_actor()));
CREATE POLICY bookmarks_owner_read ON public.saved_activities FOR SELECT
  TO jomlepakz_bookmark_api USING (user_id = (SELECT private.discovery_actor()));
CREATE POLICY bookmarks_owner_insert ON public.saved_activities FOR INSERT
  TO jomlepakz_bookmark_api WITH CHECK (user_id = (SELECT private.discovery_actor()));
CREATE POLICY bookmarks_owner_delete ON public.saved_activities FOR DELETE
  TO jomlepakz_bookmark_api USING (user_id = (SELECT private.discovery_actor()));

CREATE FUNCTION public.jomlepakz_set_activity_saved(p_activity_id uuid, p_saved boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid;
BEGIN
  IF p_activity_id IS NULL OR p_saved IS NULL THEN
    RAISE EXCEPTION 'Invalid bookmark' USING ERRCODE = '22023';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Unsupported bookmark isolation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.discovery_actor();
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_saved THEN
    IF public.jomlepakz_activity_details(p_activity_id) IS NULL THEN
      RAISE EXCEPTION 'Activity unavailable' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.saved_activities (user_id, activity_id) VALUES (actor, p_activity_id)
      ON CONFLICT (user_id, activity_id) DO NOTHING;
  ELSE
    -- Removal remains possible after visibility changes; never removes another owner's row.
    DELETE FROM public.saved_activities WHERE user_id = actor AND activity_id = p_activity_id;
  END IF;
  RETURN p_saved;
END;
$function$;
CREATE FUNCTION public.jomlepakz_activity_saved(p_activity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_activity_id IS NULL THEN RAISE EXCEPTION 'Invalid bookmark' USING ERRCODE = '22023'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.saved_activities WHERE user_id = actor AND activity_id = p_activity_id);
END;
$function$;
CREATE FUNCTION public.jomlepakz_saved_activities(p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid bookmark page' USING ERRCODE = '22023';
  END IF;
  WITH matching AS (
    SELECT activity_id, created_at FROM public.saved_activities WHERE user_id = actor
      ORDER BY created_at DESC, activity_id DESC LIMIT 21 OFFSET (p_page - 1) * 20
  ), page_rows AS (SELECT * FROM matching ORDER BY created_at DESC, activity_id DESC LIMIT 20)
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', activity_id, 'activity', public.jomlepakz_activity_details(activity_id))
      ORDER BY created_at DESC, activity_id DESC) FROM page_rows), '[]'::jsonb),
    'hasNext', (SELECT count(*) > 20 FROM matching)) INTO result;
  RETURN result;
END;
$function$;
GRANT jomlepakz_bookmark_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_bookmark_api;
ALTER FUNCTION public.jomlepakz_set_activity_saved(uuid, boolean) OWNER TO jomlepakz_bookmark_api;
ALTER FUNCTION public.jomlepakz_activity_saved(uuid) OWNER TO jomlepakz_bookmark_api;
ALTER FUNCTION public.jomlepakz_saved_activities(integer) OWNER TO jomlepakz_bookmark_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_bookmark_api;
REVOKE ALL ON FUNCTION public.jomlepakz_set_activity_saved(uuid, boolean),
  public.jomlepakz_activity_saved(uuid), public.jomlepakz_saved_activities(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_set_activity_saved(uuid, boolean),
  public.jomlepakz_activity_saved(uuid), public.jomlepakz_saved_activities(integer) TO authenticated;
REVOKE jomlepakz_bookmark_api FROM postgres;
COMMIT;
