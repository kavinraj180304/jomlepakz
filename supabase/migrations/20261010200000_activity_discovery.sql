-- Read-only discovery. Existing client table grants and deny policies stay intact.
BEGIN;
CREATE ROLE jomlepakz_discovery_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private TO jomlepakz_discovery_api;
GRANT EXECUTE ON FUNCTION private.current_user_is_eligible() TO jomlepakz_discovery_api;

-- Bounded authorization helpers: no client EXECUTE; no arbitrary Auth identities.
-- These inspect safety/membership state without recursive table policies.
CREATE FUNCTION private.discovery_actor() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    AND private.current_user_is_eligible();
$function$;
CREATE FUNCTION private.discovery_is_member(p_id uuid, p_host uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT private.discovery_actor() IS NOT NULL AND
    (p_host = private.discovery_actor() OR EXISTS (
      SELECT 1 FROM public.activity_participants
      WHERE activity_id = p_id AND user_id = private.discovery_actor() AND status = 'joined'));
$function$;
CREATE FUNCTION private.discovery_can_read(p_id uuid, p_host uuid, p_status text,
  p_visibility text, p_start timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT private.current_user_is_eligible() AND p_visibility = 'visible'
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users
      WHERE (blocker_id = private.discovery_actor() AND blocked_id = p_host)
         OR (blocked_id = private.discovery_actor() AND blocker_id = p_host))
    AND (private.discovery_is_member(p_id, p_host) OR (
      p_status = 'scheduled' AND p_start > statement_timestamp() AND EXISTS (
        SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.auth_user_id
        JOIN private.approved_email_domains d
          ON d.domain = private.normalized_email_domain(u.email) COLLATE "C"
        WHERE p.id = p_host AND p.account_status = 'active' AND p.verified_at IS NOT NULL
          AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
          AND d.is_active AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp())
          AND NOT EXISTS (SELECT 1 FROM private.revoked_auth_identities r WHERE r.auth_user_id = u.id)
      )));
$function$;
ALTER FUNCTION private.discovery_actor() OWNER TO postgres;
ALTER FUNCTION private.discovery_is_member(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION private.discovery_can_read(uuid, uuid, text, text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.discovery_actor(), private.discovery_is_member(uuid, uuid),
  private.discovery_can_read(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.discovery_actor(), private.discovery_is_member(uuid, uuid),
  private.discovery_can_read(uuid, uuid, text, text, timestamptz) TO jomlepakz_discovery_api;

GRANT SELECT (id, host_id, category_id, title, description, location_text, on_campus,
  starts_at, ends_at, capacity, join_mode, status, visibility_status, cover_asset_path,
  cover_alt, revision) ON public.activities TO jomlepakz_discovery_api;
GRANT SELECT (id, full_name, profile_visibility) ON public.profiles TO jomlepakz_discovery_api;
GRANT SELECT (id, slug, name) ON public.categories TO jomlepakz_discovery_api;
GRANT SELECT (activity_id, status) ON public.activity_participants TO jomlepakz_discovery_api;
CREATE POLICY discovery_activities ON public.activities FOR SELECT TO jomlepakz_discovery_api
  USING (private.discovery_can_read(id, host_id, status, visibility_status, starts_at));
CREATE POLICY discovery_hosts ON public.profiles FOR SELECT TO jomlepakz_discovery_api
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.host_id = profiles.id));
CREATE POLICY discovery_categories ON public.categories FOR SELECT TO jomlepakz_discovery_api
  USING (private.current_user_is_eligible());
CREATE POLICY discovery_capacity ON public.activity_participants FOR SELECT TO jomlepakz_discovery_api
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id));

CREATE FUNCTION private.discovery_payload(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', a.id, 'title', a.title, 'description', a.description,
    'categorySlug', c.slug, 'categoryName', c.name, 'location', a.location_text,
    'startsAt', a.starts_at, 'endsAt', a.ends_at, 'capacity', a.capacity,
    'joinMode', a.join_mode, 'status', a.status, 'coverPath', a.cover_asset_path,
    'coverAlt', a.cover_alt,
    'occupied', 1 + (SELECT count(*) FROM public.activity_participants ap
      WHERE ap.activity_id = a.id AND ap.status = 'joined'),
    'hostName', CASE WHEN p.profile_visibility = 'students' OR private.discovery_is_member(a.id, a.host_id)
      THEN coalesce(p.full_name, 'Former UM host') ELSE 'UM activity host' END,
    'isHost', a.host_id = private.discovery_actor(),
    'revision', CASE WHEN a.host_id = private.discovery_actor() THEN a.revision::text ELSE NULL END,
    'canEdit', a.host_id = private.discovery_actor() AND a.status = 'scheduled' AND a.starts_at > statement_timestamp(),
    'upcoming', a.status = 'scheduled' AND a.starts_at > statement_timestamp(),
    'inProgress', a.status = 'scheduled' AND a.starts_at <= statement_timestamp() AND a.ends_at > statement_timestamp()
  ) FROM public.activities a JOIN public.categories c ON c.id = a.category_id
    JOIN public.profiles p ON p.id = a.host_id WHERE a.id = p_id;
$function$;
CREATE FUNCTION public.jomlepakz_discover_activities(p_search text DEFAULT '',
  p_category text DEFAULT '', p_date text DEFAULT 'Upcoming', p_available boolean DEFAULT false,
  p_on_campus boolean DEFAULT false, p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE result jsonb; today date := (statement_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF NOT private.current_user_is_eligible() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_search IS NULL OR char_length(p_search) > 120 OR p_category IS NULL
    OR char_length(p_category) > 50 OR p_date IS NULL OR p_date NOT IN ('Upcoming', 'Today', 'Tomorrow', 'Weekend')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 500 OR p_available IS NULL OR p_on_campus IS NULL THEN
    RAISE EXCEPTION 'Invalid discovery filters' USING ERRCODE = '22023';
  END IF;
  WITH matching AS (
    SELECT a.id, a.starts_at FROM public.activities a JOIN public.categories c ON c.id = a.category_id
    WHERE a.status = 'scheduled' AND a.starts_at > statement_timestamp()
      AND (p_category = '' OR c.slug = p_category)
      AND (p_search = '' OR strpos(lower(a.title || ' ' || a.description || ' ' || a.location_text || ' ' || c.name), lower(p_search)) > 0)
      AND (NOT p_on_campus OR a.on_campus)
      AND (NOT p_available OR a.capacity > 1 + (SELECT count(*) FROM public.activity_participants ap WHERE ap.activity_id = a.id AND ap.status = 'joined'))
      AND (p_date = 'Upcoming'
        OR (p_date = 'Today' AND (a.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = today)
        OR (p_date = 'Tomorrow' AND (a.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = today + 1)
        OR (p_date = 'Weekend' AND (a.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date BETWEEN today AND today + 6
          AND extract(isodow FROM a.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur') IN (6, 7)))
    ORDER BY a.starts_at, a.id LIMIT 21 OFFSET (p_page - 1) * 20
  ), page_rows AS (SELECT * FROM matching ORDER BY starts_at, id LIMIT 20)
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(private.discovery_payload(id) ORDER BY starts_at, id) FROM page_rows), '[]'::jsonb),
    'hasNext', (SELECT count(*) > 20 FROM matching)) INTO result;
  RETURN result;
END;
$function$;
CREATE FUNCTION public.jomlepakz_activity_details(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT private.current_user_is_eligible() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN private.discovery_payload(p_id);
END;
$function$;
GRANT jomlepakz_discovery_api TO postgres;
GRANT CREATE ON SCHEMA public, private TO jomlepakz_discovery_api;
ALTER FUNCTION private.discovery_payload(uuid) OWNER TO jomlepakz_discovery_api;
ALTER FUNCTION public.jomlepakz_discover_activities(text, text, text, boolean, boolean, integer) OWNER TO jomlepakz_discovery_api;
ALTER FUNCTION public.jomlepakz_activity_details(uuid) OWNER TO jomlepakz_discovery_api;
REVOKE CREATE ON SCHEMA public, private FROM jomlepakz_discovery_api;
REVOKE jomlepakz_discovery_api FROM postgres;
REVOKE ALL ON FUNCTION private.discovery_payload(uuid),
  public.jomlepakz_discover_activities(text, text, text, boolean, boolean, integer),
  public.jomlepakz_activity_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_discover_activities(text, text, text, boolean, boolean, integer),
  public.jomlepakz_activity_details(uuid) TO authenticated;
COMMIT;
