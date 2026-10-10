-- Initial schema only: docs/database.md. PostgreSQL 15+ (Supabase).
-- No policies, users, admin grants, seed data, or business write RPCs.
-- Admission/capacity, identity, verification, blocking and audit operations
-- require a later reviewed migration before client writes are permitted.
-- Existing objects intentionally cause an error; never overwrite history.
BEGIN;

CREATE FUNCTION public.jomlepakz_valid_interests(values_to_check text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT cardinality(values_to_check) <= 7
    AND coalesce(array_ndims(values_to_check), 1) = 1
    AND coalesce(array_lower(values_to_check, 1), 1) = 1
    AND array_position(values_to_check, NULL) IS NULL
    AND values_to_check <@ ARRAY[
      'Sports', 'Study', 'Food', 'Social', 'Networking', 'Hobbies', 'Events'
    ]::text[]
    AND cardinality(values_to_check) = (
      SELECT count(DISTINCT interest) FROM unnest(values_to_check) AS selected(interest)
    );
$function$;

CREATE FUNCTION public.jomlepakz_stamp_timestamps()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := statement_timestamp();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  IF TG_ARGV[0] = 'updated_at' THEN
    NEW.updated_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text,
  faculty text,
  programme text,
  study_year smallint,
  bio text,
  interests text[] NOT NULL DEFAULT '{}'::text[],
  profile_visibility text NOT NULL DEFAULT 'activity_members',
  account_status text NOT NULL DEFAULT 'pending_verification',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  deleted_at timestamptz,
  CONSTRAINT profiles_name_length CHECK (
    full_name IS NULL OR (char_length(full_name) BETWEEN 1 AND 100 AND full_name ~ '[^[:space:]]')
  ),
  CONSTRAINT profiles_faculty_length CHECK (
    faculty IS NULL OR (char_length(faculty) BETWEEN 1 AND 150 AND faculty ~ '[^[:space:]]')
  ),
  CONSTRAINT profiles_programme_length CHECK (
    programme IS NULL OR (char_length(programme) BETWEEN 1 AND 150 AND programme ~ '[^[:space:]]')
  ),
  CONSTRAINT profiles_year_range CHECK (study_year BETWEEN 1 AND 6),
  CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 500),
  CONSTRAINT profiles_interests_valid CHECK (public.jomlepakz_valid_interests(interests)),
  CONSTRAINT profiles_visibility_valid CHECK (
    profile_visibility IN ('students', 'activity_members')
  ),
  CONSTRAINT profiles_status_valid CHECK (
    account_status IN ('pending_verification', 'active', 'suspended', 'deleted')
  ),
  CONSTRAINT profiles_active_requirements CHECK (
    account_status <> 'active' OR (
      auth_user_id IS NOT NULL AND verified_at IS NOT NULL
      AND full_name IS NOT NULL AND faculty IS NOT NULL AND programme IS NOT NULL
    )
  ),
  CONSTRAINT profiles_deleted_requirements CHECK (
    (account_status = 'deleted' AND deleted_at IS NOT NULL
      AND auth_user_id IS NULL AND full_name IS NULL AND faculty IS NULL
      AND programme IS NULL AND study_year IS NULL AND bio IS NULL
      AND cardinality(interests) = 0)
    OR (account_status <> 'deleted' AND deleted_at IS NULL)
  ),
  CONSTRAINT profiles_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT categories_slug_valid CHECK (
    char_length(slug) BETWEEN 1 AND 50 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT categories_name_length CHECK (char_length(name) BETWEEN 1 AND 50 AND name ~ '[^[:space:]]'),
  CONSTRAINT categories_sort_order_valid CHECK (sort_order >= 0),
  CONSTRAINT categories_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  location_text text NOT NULL,
  on_campus boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL,
  join_mode text NOT NULL DEFAULT 'instant',
  status text NOT NULL DEFAULT 'scheduled',
  visibility_status text NOT NULL DEFAULT 'visible',
  cover_asset_path text,
  cover_alt text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT activities_title_length CHECK (char_length(title) BETWEEN 1 AND 100 AND title ~ '[^[:space:]]'),
  CONSTRAINT activities_description_length CHECK (char_length(description) BETWEEN 1 AND 1000 AND description ~ '[^[:space:]]'),
  CONSTRAINT activities_location_length CHECK (char_length(location_text) BETWEEN 1 AND 150 AND location_text ~ '[^[:space:]]'),
  CONSTRAINT activities_schedule_valid CHECK (ends_at > starts_at),
  CONSTRAINT activities_capacity_valid CHECK (capacity BETWEEN 2 AND 50),
  CONSTRAINT activities_join_mode_valid CHECK (join_mode IN ('instant', 'approval')),
  CONSTRAINT activities_status_valid CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  CONSTRAINT activities_visibility_valid CHECK (visibility_status IN ('visible', 'hidden')),
  -- Only existing approved demo art is permitted until uploads are reviewed.
  CONSTRAINT activities_cover_valid CHECK (
    (cover_asset_path IS NULL AND cover_alt IS NULL)
    OR (cover_asset_path IS NOT NULL
      AND cover_asset_path IN ('/demo/sports.jpg', '/demo/food.jpg', '/demo/study.jpg')
      AND cover_alt IS NOT NULL AND char_length(cover_alt) BETWEEN 1 AND 300
      AND cover_alt ~ '[^[:space:]]')
  ),
  CONSTRAINT activities_revision_valid CHECK (revision >= 1),
  CONSTRAINT activities_lifecycle_timestamps CHECK (
    (status = 'scheduled' AND cancelled_at IS NULL AND completed_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL
      AND completed_at >= ends_at AND cancelled_at IS NULL)
  ),
  CONSTRAINT activities_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.activity_participants (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  joined_at timestamptz,
  status_changed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (activity_id, user_id),
  CONSTRAINT activity_participants_status_valid CHECK (
    status IN ('pending', 'joined', 'declined', 'left', 'removed')
  ),
  CONSTRAINT activity_participants_joined_time CHECK (status <> 'joined' OR joined_at IS NOT NULL),
  CONSTRAINT activity_participants_decision_pair CHECK (
    (decided_at IS NULL) = (decided_by IS NULL)
  ),
  CONSTRAINT activity_participants_timestamp_order CHECK (
    updated_at >= created_at AND status_changed_at >= requested_at
    AND (joined_at IS NULL OR joined_at >= requested_at)
    AND (decided_at IS NULL OR decided_at >= requested_at)
  )
);

CREATE TABLE public.saved_activities (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, activity_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL,
  visibility_status text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  removed_at timestamptz,
  -- Enables notification message/activity consistency through a composite FK.
  CONSTRAINT messages_id_activity_unique UNIQUE (id, activity_id),
  CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 500 AND body ~ '[^[:space:]]'),
  CONSTRAINT messages_visibility_valid CHECK (visibility_status IN ('visible', 'removed')),
  CONSTRAINT messages_removal_time CHECK (
    (visibility_status = 'visible' AND removed_at IS NULL)
    OR (visibility_status = 'removed' AND removed_at IS NOT NULL AND removed_at >= created_at)
  )
);

CREATE TABLE public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE TABLE public.admin_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  granted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT admin_memberships_status_valid CHECK (status IN ('active', 'revoked')),
  CONSTRAINT admin_memberships_revocation_valid CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at >= granted_at)
  ),
  CONSTRAINT admin_memberships_no_self_grant CHECK (granted_by IS NULL OR granted_by <> user_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  message_id uuid,
  kind text NOT NULL,
  summary text NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  read_at timestamptz,
  CONSTRAINT notifications_event_unique UNIQUE (recipient_id, event_key),
  CONSTRAINT notifications_message_activity_fk FOREIGN KEY (message_id, activity_id)
    REFERENCES public.messages(id, activity_id) ON DELETE SET NULL (message_id),
  CONSTRAINT notifications_kind_valid CHECK (kind IN (
    'join_requested', 'participant_joined', 'join_approved', 'join_declined',
    'participant_removed', 'activity_updated', 'activity_cancelled',
    'activity_completed', 'message', 'reminder', 'activity_full'
  )),
  CONSTRAINT notifications_summary_length CHECK (char_length(summary) BETWEEN 1 AND 300 AND summary ~ '[^[:space:]]'),
  CONSTRAINT notifications_event_key_length CHECK (char_length(event_key) BETWEEN 1 AND 300 AND event_key ~ '[^[:space:]]'),
  CONSTRAINT notifications_message_link_valid CHECK (
    message_id IS NULL OR (kind = 'message' AND activity_id IS NOT NULL)
  ),
  CONSTRAINT notifications_read_time CHECK (read_at IS NULL OR read_at >= created_at)
);

-- Required live links are checked on creation. Historical links may become
-- null on controlled purge; nulling an activity also clears the message and
-- scrubs any stale summary. No delete permission is given to client roles.
CREATE FUNCTION public.jomlepakz_notification_links()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activity_id IS NULL OR (NEW.kind = 'message' AND NEW.message_id IS NULL) THEN
      RAISE EXCEPTION 'Notification requires a live activity and, for message events, a message'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.activity_id IS NOT NULL AND NEW.activity_id IS NULL THEN
    NEW.message_id := NULL;
    NEW.summary := 'Activity no longer available';
  ELSIF OLD.message_id IS NOT NULL AND NEW.message_id IS NULL THEN
    NEW.summary := 'Message no longer available';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_activity_id uuid REFERENCES public.activities(id) ON DELETE RESTRICT,
  target_message_id uuid REFERENCES public.messages(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_type text NOT NULL,
  reason_code text NOT NULL,
  details text,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reviewed_at timestamptz,
  CONSTRAINT reports_target_valid CHECK (
    (target_type = 'user' AND target_user_id IS NOT NULL
      AND target_activity_id IS NULL AND target_message_id IS NULL)
    OR (target_type = 'activity' AND target_activity_id IS NOT NULL
      AND target_user_id IS NULL AND target_message_id IS NULL)
    OR (target_type = 'message' AND target_message_id IS NOT NULL
      AND target_user_id IS NULL AND target_activity_id IS NULL)
  ),
  CONSTRAINT reports_reason_valid CHECK (
    reason_code IN ('harassment', 'unsafe_activity', 'spam', 'inappropriate_content', 'other')
  ),
  CONSTRAINT reports_details_length CHECK (details IS NULL OR (char_length(details) BETWEEN 1 AND 2000 AND details ~ '[^[:space:]]')),
  CONSTRAINT reports_other_details_required CHECK (reason_code <> 'other' OR details IS NOT NULL),
  CONSTRAINT reports_evidence_object CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  CONSTRAINT reports_status_valid CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  CONSTRAINT reports_review_pair CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT reports_terminal_review CHECK (status NOT IN ('resolved', 'dismissed') OR reviewed_at IS NOT NULL),
  CONSTRAINT reports_review_time CHECK (reviewed_at IS NULL OR reviewed_at >= created_at),
  CONSTRAINT reports_independent_reviewer CHECK (
    reviewed_by IS NULL OR (reviewed_by <> reporter_id
      AND (target_user_id IS NULL OR reviewed_by <> target_user_id))
  )
);

CREATE TABLE public.activity_feedback (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (activity_id, author_id),
  CONSTRAINT activity_feedback_body_length CHECK (char_length(body) BETWEEN 1 AND 1000 AND body ~ '[^[:space:]]')
);

CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  report_id uuid REFERENCES public.reports(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_activity_id uuid REFERENCES public.activities(id) ON DELETE RESTRICT,
  target_message_id uuid REFERENCES public.messages(id) ON DELETE RESTRICT,
  actor_kind text NOT NULL,
  operator_reference text,
  action_type text NOT NULL,
  reason text NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT moderation_actions_actor_kind_valid CHECK (actor_kind IN ('admin', 'operator', 'system')),
  CONSTRAINT moderation_actions_actor_valid CHECK (
    (actor_kind <> 'admin' OR actor_id IS NOT NULL)
    AND (actor_id IS NOT NULL OR operator_reference IS NOT NULL)
  ),
  CONSTRAINT moderation_actions_operator_reference_length CHECK (
    operator_reference IS NULL OR (char_length(operator_reference) BETWEEN 1 AND 300
      AND operator_reference ~ '[^[:space:]]')
  ),
  CONSTRAINT moderation_actions_target_valid CHECK (
    (action_type IN ('suspend_user', 'restore_user', 'grant_admin', 'revoke_admin')
      AND target_user_id IS NOT NULL AND target_activity_id IS NULL AND target_message_id IS NULL)
    OR (action_type IN ('hide_activity', 'restore_activity', 'cancel_activity')
      AND target_activity_id IS NOT NULL AND target_user_id IS NULL AND target_message_id IS NULL)
    OR (action_type IN ('remove_message', 'restore_message')
      AND target_message_id IS NOT NULL AND target_user_id IS NULL AND target_activity_id IS NULL)
  ),
  CONSTRAINT moderation_actions_admin_grant_operator CHECK (
    action_type NOT IN ('grant_admin', 'revoke_admin') OR actor_kind = 'operator'
  ),
  CONSTRAINT moderation_actions_reason_length CHECK (char_length(reason) BETWEEN 1 AND 1000 AND reason ~ '[^[:space:]]'),
  CONSTRAINT moderation_actions_state_objects CHECK (
    jsonb_typeof(before_state) = 'object' AND jsonb_typeof(after_state) = 'object'
  )
);

-- Timestamp triggers do not grant write authority or implement lifecycle rules.
CREATE TRIGGER profiles_stamp BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps('updated_at');
CREATE TRIGGER categories_stamp BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps('updated_at');
CREATE TRIGGER activities_stamp BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps('updated_at');
CREATE TRIGGER activity_participants_stamp BEFORE INSERT OR UPDATE ON public.activity_participants
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps('updated_at');
CREATE TRIGGER saved_activities_stamp BEFORE INSERT OR UPDATE ON public.saved_activities
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER messages_stamp BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER blocked_users_stamp BEFORE INSERT OR UPDATE ON public.blocked_users
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER notifications_links BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_notification_links();
CREATE TRIGGER notifications_stamp BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER reports_stamp BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER activity_feedback_stamp BEFORE INSERT OR UPDATE ON public.activity_feedback
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();
CREATE TRIGGER moderation_actions_stamp BEFORE INSERT OR UPDATE ON public.moderation_actions
  FOR EACH ROW EXECUTE FUNCTION public.jomlepakz_stamp_timestamps();

CREATE INDEX profiles_status_created_idx ON public.profiles (account_status, created_at);
CREATE INDEX categories_active_sort_idx ON public.categories (is_active, sort_order);
CREATE INDEX activities_feed_idx ON public.activities (status, visibility_status, starts_at, id);
CREATE INDEX activities_category_schedule_idx ON public.activities (category_id, status, starts_at);
CREATE INDEX activities_host_schedule_idx ON public.activities (host_id, starts_at);
CREATE INDEX participants_user_status_idx ON public.activity_participants (user_id, status, activity_id);
CREATE INDEX participants_activity_status_idx ON public.activity_participants (activity_id, status);
CREATE INDEX participants_decided_by_idx ON public.activity_participants (decided_by);
CREATE INDEX saved_user_created_idx ON public.saved_activities (user_id, created_at, activity_id);
CREATE INDEX saved_activity_idx ON public.saved_activities (activity_id);
CREATE INDEX messages_activity_created_idx ON public.messages (activity_id, created_at, id);
CREATE INDEX messages_sender_idx ON public.messages (sender_id);
CREATE INDEX blocked_reverse_idx ON public.blocked_users (blocked_id, blocker_id);
CREATE INDEX admin_granted_by_idx ON public.admin_memberships (granted_by);
CREATE INDEX admin_revoked_by_idx ON public.admin_memberships (revoked_by);
CREATE INDEX notifications_recipient_created_idx ON public.notifications (recipient_id, created_at, id);
CREATE INDEX notifications_unread_idx ON public.notifications (recipient_id, created_at) WHERE read_at IS NULL;
CREATE INDEX notifications_activity_idx ON public.notifications (activity_id);
CREATE INDEX notifications_message_activity_idx ON public.notifications (message_id, activity_id);
CREATE INDEX reports_status_created_idx ON public.reports (status, created_at);
CREATE INDEX reports_reporter_created_idx ON public.reports (reporter_id, created_at);
CREATE INDEX reports_target_user_idx ON public.reports (target_user_id);
CREATE INDEX reports_target_activity_idx ON public.reports (target_activity_id);
CREATE INDEX reports_target_message_idx ON public.reports (target_message_id);
CREATE INDEX reports_reviewed_by_idx ON public.reports (reviewed_by);
CREATE INDEX feedback_author_created_idx ON public.activity_feedback (author_id, created_at);
CREATE INDEX feedback_created_activity_idx ON public.activity_feedback (created_at, activity_id);
CREATE INDEX moderation_report_created_idx ON public.moderation_actions (report_id, created_at);
CREATE INDEX moderation_actor_created_idx ON public.moderation_actions (actor_id, created_at);
CREATE INDEX moderation_user_created_idx ON public.moderation_actions (target_user_id, created_at);
CREATE INDEX moderation_activity_created_idx ON public.moderation_actions (target_activity_id, created_at);
CREATE INDEX moderation_message_created_idx ON public.moderation_actions (target_message_id, created_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- Revoke ALL also denies non-RLS privileges (e.g. REFERENCES/TRIGGER).
-- Scope revocations to these new objects, leaving existing project grants alone.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles, public.categories, public.activities,
  public.activity_participants, public.saved_activities, public.messages,
  public.blocked_users, public.admin_memberships, public.notifications,
  public.reports, public.activity_feedback, public.moderation_actions
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.jomlepakz_valid_interests(text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.jomlepakz_stamp_timestamps()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.jomlepakz_notification_links()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.activities IS
  'Capacity includes one host plus joined non-host rows. Admission requires a future locked transaction; clients have no writes.';
COMMENT ON TABLE public.reports IS
  'Private safety evidence. Reporter identity must never be exposed to reported users or hosts.';
COMMENT ON TABLE public.activity_feedback IS
  'Private completed-activity feedback, not a public user rating. Eligibility requires a future restricted operation.';
COMMENT ON TABLE public.admin_memberships IS
  'Operator-managed authority. No student or moderator self-service grants.';
COMMENT ON TABLE public.moderation_actions IS
  'Append-only safety audit through future restricted operations; no client writes.';

COMMIT;
