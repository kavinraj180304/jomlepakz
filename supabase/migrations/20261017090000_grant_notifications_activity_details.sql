-- Repair the notification RPC's nested activity-details call as the function owner.
-- Preserve existing RLS, function ownership, and postgres membership options.
BEGIN;

GRANT jomlepakz_discovery_api TO postgres
  WITH SET TRUE;

SET ROLE jomlepakz_discovery_api;

GRANT EXECUTE ON FUNCTION public.jomlepakz_activity_details(uuid)
  TO jomlepakz_notification_api;

RESET ROLE;

GRANT jomlepakz_discovery_api TO postgres
  WITH SET FALSE;

COMMIT;
