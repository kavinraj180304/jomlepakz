-- Read-only personal collections; no duplicate activity tables or participant writes.
BEGIN;
CREATE ROLE jomlepakz_dashboard_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_dashboard_api;
GRANT EXECUTE ON FUNCTION private.discovery_actor(),
  private.discovery_can_read(uuid, uuid, text, text, timestamptz),
  public.jomlepakz_activity_details(uuid) TO jomlepakz_dashboard_api;
GRANT SELECT (id, host_id, status, visibility_status, starts_at, ends_at)
  ON public.activities TO jomlepakz_dashboard_api;
GRANT SELECT (activity_id, user_id, status) ON public.activity_participants TO jomlepakz_dashboard_api;
CREATE POLICY dashboard_visible_activities ON public.activities FOR SELECT TO jomlepakz_dashboard_api
  USING (private.discovery_can_read(id, host_id, status, visibility_status, starts_at));
CREATE POLICY dashboard_own_relationships ON public.activity_participants FOR SELECT TO jomlepakz_dashboard_api
  USING (user_id = (SELECT private.discovery_actor()));

CREATE FUNCTION public.jomlepakz_activity_dashboard(p_section text DEFAULT 'Hosting', p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid := private.discovery_actor(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_section IS NULL OR p_section NOT IN ('Hosting', 'Joined', 'Past')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid dashboard filters' USING ERRCODE = '22023';
  END IF;
  WITH matching AS (
    SELECT a.id, a.starts_at, CASE WHEN a.host_id = actor THEN 'host' ELSE 'joined' END AS relationship
    FROM public.activities a
    WHERE (a.host_id = actor OR EXISTS (SELECT 1 FROM public.activity_participants p
      WHERE p.activity_id = a.id AND p.user_id = actor AND p.status = 'joined'))
      AND (p_section <> 'Hosting' OR a.host_id = actor)
      AND (p_section <> 'Joined' OR a.host_id <> actor)
      AND CASE WHEN p_section = 'Past'
        THEN a.status IN ('cancelled', 'completed') OR a.ends_at <= statement_timestamp()
        ELSE a.status = 'scheduled' AND a.ends_at > statement_timestamp() END
    ORDER BY CASE WHEN p_section = 'Past' THEN a.starts_at END DESC,
      CASE WHEN p_section <> 'Past' THEN a.starts_at END ASC, a.id ASC
    LIMIT 21 OFFSET (p_page - 1) * 20
  ), page_rows AS (
    SELECT * FROM matching ORDER BY CASE WHEN p_section = 'Past' THEN starts_at END DESC,
      CASE WHEN p_section <> 'Past' THEN starts_at END ASC, id ASC LIMIT 20
  )
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'relationship', relationship, 'activity', public.jomlepakz_activity_details(id))
      ORDER BY CASE WHEN p_section = 'Past' THEN starts_at END DESC,
        CASE WHEN p_section <> 'Past' THEN starts_at END ASC, id ASC) FROM page_rows), '[]'::jsonb),
    'hasNext', (SELECT count(*) > 20 FROM matching)) INTO result;
  RETURN result;
END;
$function$;
GRANT jomlepakz_dashboard_api TO postgres;
GRANT CREATE ON SCHEMA public TO jomlepakz_dashboard_api;
ALTER FUNCTION public.jomlepakz_activity_dashboard(text, integer) OWNER TO jomlepakz_dashboard_api;
REVOKE CREATE ON SCHEMA public FROM jomlepakz_dashboard_api;
REVOKE jomlepakz_dashboard_api FROM postgres;
REVOKE ALL ON FUNCTION public.jomlepakz_activity_dashboard(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_activity_dashboard(text, integer) TO authenticated;
COMMIT;
