-- Narrow host operations. Client tables remain denied by the foundation.
-- All future safety/membership writes must share advisory key (20261010, 1).
BEGIN;
ALTER TABLE public.activities ADD COLUMN creation_request_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.activities ADD CONSTRAINT activities_host_request_unique UNIQUE (host_id, creation_request_id);

CREATE ROLE jomlepakz_activity_api NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, private, auth TO jomlepakz_activity_api;
GRANT EXECUTE ON FUNCTION private.current_user_is_eligible(), auth.uid() TO jomlepakz_activity_api;
GRANT SELECT (id, auth_user_id) ON public.profiles TO jomlepakz_activity_api;
GRANT SELECT (id, slug, name, is_active, sort_order) ON public.categories TO jomlepakz_activity_api;
GRANT SELECT ON public.activities TO jomlepakz_activity_api;
GRANT INSERT (host_id, category_id, title, description, location_text, on_campus,
  starts_at, ends_at, capacity, join_mode, cover_asset_path, cover_alt, creation_request_id)
  ON public.activities TO jomlepakz_activity_api;
GRANT UPDATE (category_id, title, description, location_text, on_campus, starts_at,
  ends_at, capacity, cover_asset_path, cover_alt, revision, status, cancelled_at)
  ON public.activities TO jomlepakz_activity_api;
GRANT SELECT (activity_id, user_id, status) ON public.activity_participants TO jomlepakz_activity_api;
GRANT UPDATE (status, status_changed_at, decided_at, decided_by)
  ON public.activity_participants TO jomlepakz_activity_api;
GRANT INSERT (recipient_id, activity_id, kind, summary, event_key)
  ON public.notifications TO jomlepakz_activity_api;

CREATE POLICY activity_api_profile_self ON public.profiles FOR SELECT
  TO jomlepakz_activity_api USING (auth_user_id = (SELECT auth.uid()));
CREATE POLICY activity_api_categories ON public.categories FOR SELECT
  TO jomlepakz_activity_api USING (true);
CREATE POLICY activity_api_owned_read ON public.activities FOR SELECT TO jomlepakz_activity_api
  USING (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())));
CREATE POLICY activity_api_owned_insert ON public.activities FOR INSERT TO jomlepakz_activity_api
  WITH CHECK (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid()))
    AND status = 'scheduled' AND visibility_status = 'visible');
CREATE POLICY activity_api_owned_update ON public.activities FOR UPDATE TO jomlepakz_activity_api
  USING (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid())))
  WITH CHECK (host_id IN (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid()))
    AND status IN ('scheduled', 'cancelled'));
CREATE POLICY activity_api_roster_read ON public.activity_participants FOR SELECT TO jomlepakz_activity_api
  USING (activity_id IN (SELECT id FROM public.activities));
CREATE POLICY activity_api_close_pending ON public.activity_participants FOR UPDATE TO jomlepakz_activity_api
  USING (status = 'pending' AND activity_id IN (SELECT id FROM public.activities))
  WITH CHECK (status = 'declined' AND activity_id IN (SELECT id FROM public.activities));
CREATE POLICY activity_api_event_insert ON public.notifications FOR INSERT TO jomlepakz_activity_api
  WITH CHECK (activity_id IN (SELECT id FROM public.activities)
    AND kind IN ('activity_updated', 'activity_cancelled')
    AND recipient_id IN (SELECT user_id FROM public.activity_participants WHERE activity_id = notifications.activity_id));

CREATE FUNCTION private.activity_actor()
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid;
BEGIN
  IF NOT private.current_user_is_eligible() THEN
    RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO actor FROM public.profiles WHERE auth_user_id = auth.uid();
  IF actor IS NULL THEN RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END;
$function$;

CREATE FUNCTION private.owned_activity_payload(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object('id', a.id, 'title', a.title, 'description', a.description,
    'categorySlug', c.slug, 'categoryName', c.name, 'location', a.location_text,
    'startsAt', a.starts_at, 'endsAt', a.ends_at, 'capacity', a.capacity,
    'joinMode', a.join_mode, 'status', a.status, 'visibility', a.visibility_status,
    'coverPath', a.cover_asset_path, 'coverAlt', a.cover_alt, 'revision', a.revision::text,
    'canEdit', a.status = 'scheduled' AND a.visibility_status = 'visible' AND a.starts_at > statement_timestamp(),
    'upcoming', a.status = 'scheduled' AND a.ends_at > statement_timestamp(),
    'occupied', 1 + (SELECT count(*) FROM public.activity_participants p
      WHERE p.activity_id = a.id AND p.status = 'joined'))
  FROM public.activities a LEFT JOIN public.categories c ON c.id = a.category_id
  WHERE a.id = target_id;
$function$;

CREATE FUNCTION public.jomlepakz_activity_categories()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM private.activity_actor();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('slug', slug, 'name', name) ORDER BY sort_order, name)
    FROM public.categories WHERE is_active), '[]'::jsonb);
END;
$function$;

CREATE FUNCTION public.jomlepakz_my_activities(p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM private.activity_actor();
  IF p_id IS NOT NULL THEN RETURN private.owned_activity_payload(p_id); END IF;
  RETURN coalesce((SELECT jsonb_agg(private.owned_activity_payload(a.id) ORDER BY a.created_at DESC, a.id DESC)
    FROM (SELECT id, created_at FROM public.activities ORDER BY created_at DESC, id DESC LIMIT 100) a), '[]'::jsonb);
END;
$function$;

CREATE FUNCTION public.jomlepakz_save_activity(p_input jsonb, p_activity_id uuid DEFAULT NULL,
  p_revision bigint DEFAULT NULL, p_request_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  actor uuid;
  activity public.activities%ROWTYPE;
  chosen_category_id uuid;
  start_time timestamptz;
  end_time timestamptz;
  duration_minutes integer;
  participant_limit integer;
  location_value text;
  cover_path text;
  cover_description text;
  result_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.activity_actor();
  IF p_activity_id IS NULL THEN
    IF p_request_id IS NULL OR p_revision IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid creation request' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO result_id FROM public.activities
      WHERE host_id = actor AND creation_request_id = p_request_id;
    IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  ELSE
    SELECT * INTO activity FROM public.activities WHERE id = p_activity_id AND host_id = actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501'; END IF;
    IF activity.status <> 'scheduled' OR activity.visibility_status <> 'visible'
      OR activity.starts_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Activity cannot be edited' USING ERRCODE = 'P0001';
    END IF;
    IF p_revision IS NULL OR p_revision <> activity.revision THEN
      RAISE EXCEPTION 'Activity changed; reload before editing' USING ERRCODE = '40001';
    END IF;
  END IF;
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p_input)) <> 10 OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key) WHERE key NOT IN ('title', 'description',
        'category_slug', 'starts_at', 'duration_minutes', 'capacity', 'location_choice',
        'custom_location', 'join_mode', 'cover_key')) THEN
    RAISE EXCEPTION 'Invalid activity fields' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['title', 'description', 'category_slug', 'starts_at',
    'location_choice', 'custom_location', 'join_mode', 'cover_key']) AS fields(key)
    WHERE jsonb_typeof(p_input -> key) IS DISTINCT FROM 'string')
    OR jsonb_typeof(p_input -> 'duration_minutes') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_input -> 'capacity') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid activity fields' USING ERRCODE = '22023';
  END IF;
  start_time := (p_input ->> 'starts_at')::timestamptz;
  duration_minutes := (p_input ->> 'duration_minutes')::integer;
  participant_limit := (p_input ->> 'capacity')::integer;
  IF NOT isfinite(start_time) OR start_time <= clock_timestamp()
    OR start_time > clock_timestamp() + interval '365 days'
    OR duration_minutes NOT BETWEEN 30 AND 240 OR participant_limit NOT BETWEEN 2 AND 50
    OR p_input ->> 'join_mode' NOT IN ('instant', 'approval') THEN
    RAISE EXCEPTION 'Invalid activity schedule or capacity' USING ERRCODE = '22023';
  END IF;
  end_time := start_time + make_interval(mins => duration_minutes);
  SELECT id INTO chosen_category_id FROM public.categories WHERE slug = p_input ->> 'category_slug' AND is_active;
  IF chosen_category_id IS NULL THEN RAISE EXCEPTION 'Category unavailable' USING ERRCODE = '22023'; END IF;
  location_value := CASE p_input ->> 'location_choice'
    WHEN 'um-main-library' THEN 'UM Main Library' WHEN 'um-sports-centre' THEN 'UM Sports Centre'
    WHEN 'um-varsity-lake' THEN 'UM Varsity Lake' WHEN 'dewan-tunku-canselor' THEN 'Dewan Tunku Canselor (DTC)'
    WHEN 'kompleks-perdanasiswa' THEN 'Kompleks Perdanasiswa' WHEN 'rimba-ilmu' THEN 'Rimba Ilmu Botanic Garden'
    WHEN 'custom' THEN btrim(p_input ->> 'custom_location') ELSE NULL END;
  IF location_value IS NULL OR char_length(location_value) NOT BETWEEN 1 AND 150
    OR location_value !~ '[^[:space:]]' OR EXISTS (
      SELECT 1 FROM regexp_split_to_table(location_value, '') chars(value)
      WHERE ascii(value) < 32 OR ascii(value) BETWEEN 127 AND 159) THEN
    RAISE EXCEPTION 'Invalid location' USING ERRCODE = '22023';
  END IF;
  IF p_input ->> 'cover_key' NOT IN ('none', 'sports', 'food', 'study') THEN
    RAISE EXCEPTION 'Invalid activity image' USING ERRCODE = '22023';
  END IF;
  cover_path := CASE WHEN p_input ->> 'cover_key' = 'none' THEN NULL
    ELSE '/demo/' || (p_input ->> 'cover_key') || '.jpg' END;
  cover_description := CASE p_input ->> 'cover_key' WHEN 'sports' THEN 'Sports equipment'
    WHEN 'food' THEN 'Food for a shared meal' WHEN 'study' THEN 'Books and study materials' ELSE NULL END;
  IF p_activity_id IS NULL THEN
    INSERT INTO public.activities (host_id, category_id, title, description, location_text, on_campus,
      starts_at, ends_at, capacity, join_mode, cover_asset_path, cover_alt, creation_request_id)
    VALUES (actor, chosen_category_id, btrim(p_input ->> 'title'), btrim(p_input ->> 'description'), location_value,
      p_input ->> 'location_choice' <> 'custom', start_time, end_time, participant_limit,
      p_input ->> 'join_mode', cover_path, cover_description, p_request_id) RETURNING id INTO result_id;
  ELSE
    IF p_input ->> 'join_mode' <> activity.join_mode THEN
      RAISE EXCEPTION 'Approval mode cannot change after creation' USING ERRCODE = '22023';
    END IF;
    IF participant_limit < 1 + (SELECT count(*) FROM public.activity_participants
      WHERE activity_id = p_activity_id AND status = 'joined') THEN
      RAISE EXCEPTION 'Capacity is below occupied seats' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.activities SET category_id = chosen_category_id,
      title = btrim(p_input ->> 'title'), description = btrim(p_input ->> 'description'),
      location_text = location_value, on_campus = p_input ->> 'location_choice' <> 'custom',
      starts_at = start_time, ends_at = end_time, capacity = participant_limit,
      cover_asset_path = cover_path, cover_alt = cover_description, revision = revision + 1
      WHERE id = p_activity_id RETURNING id INTO result_id;
    INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key)
      SELECT user_id, p_activity_id, 'activity_updated', 'Activity details were updated',
        'activity:' || p_activity_id || ':revision:' || (activity.revision + 1) || ':updated'
      FROM public.activity_participants WHERE activity_id = p_activity_id AND status IN ('joined', 'pending')
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN result_id;
END;
$function$;

CREATE FUNCTION public.jomlepakz_cancel_activity(p_activity_id uuid, p_revision bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor uuid; activity public.activities%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(20261010, 1);
  actor := private.activity_actor();
  SELECT * INTO activity FROM public.activities WHERE id = p_activity_id AND host_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activity access denied' USING ERRCODE = '42501'; END IF;
  IF activity.status = 'cancelled' THEN RETURN activity.id; END IF;
  IF activity.status <> 'scheduled' THEN RAISE EXCEPTION 'Activity cannot be cancelled' USING ERRCODE = 'P0001'; END IF;
  IF p_revision IS NULL OR activity.revision <> p_revision THEN
    RAISE EXCEPTION 'Activity changed; reload before cancelling' USING ERRCODE = '40001';
  END IF;
  UPDATE public.activities SET status = 'cancelled', cancelled_at = clock_timestamp(), revision = revision + 1
    WHERE id = p_activity_id;
  INSERT INTO public.notifications (recipient_id, activity_id, kind, summary, event_key)
    SELECT user_id, p_activity_id, 'activity_cancelled', 'Activity was cancelled',
      'activity:' || p_activity_id || ':revision:' || (activity.revision + 1) || ':cancelled'
    FROM public.activity_participants WHERE activity_id = p_activity_id AND status IN ('joined', 'pending')
    ON CONFLICT DO NOTHING;
  UPDATE public.activity_participants SET status = 'declined', status_changed_at = clock_timestamp(),
    decided_at = NULL, decided_by = NULL WHERE activity_id = p_activity_id AND status = 'pending';
  RETURN activity.id;
END;
$function$;

-- No client role membership, schema creation, raw table grants or DELETE.
GRANT jomlepakz_activity_api TO postgres;
GRANT CREATE ON SCHEMA public, private TO jomlepakz_activity_api;
ALTER FUNCTION private.activity_actor() OWNER TO jomlepakz_activity_api;
ALTER FUNCTION private.owned_activity_payload(uuid) OWNER TO jomlepakz_activity_api;
ALTER FUNCTION public.jomlepakz_activity_categories() OWNER TO jomlepakz_activity_api;
ALTER FUNCTION public.jomlepakz_my_activities(uuid) OWNER TO jomlepakz_activity_api;
ALTER FUNCTION public.jomlepakz_save_activity(jsonb, uuid, bigint, uuid) OWNER TO jomlepakz_activity_api;
ALTER FUNCTION public.jomlepakz_cancel_activity(uuid, bigint) OWNER TO jomlepakz_activity_api;
REVOKE CREATE ON SCHEMA public, private FROM jomlepakz_activity_api;
REVOKE jomlepakz_activity_api FROM postgres;
REVOKE ALL ON FUNCTION private.activity_actor(), private.owned_activity_payload(uuid),
  public.jomlepakz_activity_categories(), public.jomlepakz_my_activities(uuid),
  public.jomlepakz_save_activity(jsonb, uuid, bigint, uuid),
  public.jomlepakz_cancel_activity(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jomlepakz_activity_categories(), public.jomlepakz_my_activities(uuid),
  public.jomlepakz_save_activity(jsonb, uuid, bigint, uuid),
  public.jomlepakz_cancel_activity(uuid, bigint) TO authenticated;
COMMIT;
