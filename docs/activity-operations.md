# Real activity creation and host management

Create/edit retain the existing three-step form. Publishing now calls a
server-validated, user-scoped Supabase RPC. My Activities shows up to 100 real
hosted records; the edit route loads only the authenticated host's records.
Discovery and UUID details now use the separate [discovery read boundary](activity-discovery.md);
former fictional activity detail URLs are unavailable. Joining, bookmarks, chat
and notification display remain outside these operations.

## Migration and permissions

`supabase/migrations/20261010180000_activity_host_operations.sql` follows all
four existing migrations. It creates an internal NOLOGIN/NOBYPASSRLS role,
role-specific ownership policies and four authenticated-only public functions:

- `jomlepakz_activity_categories()` — active category names/slugs.
- `jomlepakz_my_activities(p_id)` — own explicit management projection/list.
- `jomlepakz_save_activity(p_input, p_activity_id, p_revision, p_request_id)` — create or edit.
- `jomlepakz_cancel_activity(p_activity_id, p_revision)` — cancellation.

Clients retain no raw table CRUD permissions and cannot assume the internal
role. Its column grants exclude changing host identity, join mode, moderation
visibility, completion metadata, account status or admin membership. It has no
DELETE privilege. Privileged functions have fixed `search_path = pg_catalog`,
qualified relations, narrow EXECUTE grants and ownership/eligibility checks.
Private helpers are not client RPCs. No service key or new secret is used.

Both mutation functions first acquire transaction advisory lock **(20261010, 1)**,
then resolve the authenticated eligible caller and lock the own target activity.
Future joins, blocks, suspension, moderation, category changes and trusted jobs
must acquire the same lock before authorization/state checks. Direct operator
writes which ignore the contract can still race with transactions.

Creation derives `host_id` from `auth.uid()` via the linked active/verified
profile. Record ID, initial scheduled/visible state and timestamps are database
controlled. `creation_request_id` has uniqueness per host; repeated creation with
the same opaque request UUID returns the original record without a second
publish. It never updates that record from a changed retry payload. After an
ambiguous response, check My Activities before publishing a different draft.

Edits require the last read revision, an own visible scheduled activity which
has not started, an active category and a future new schedule. Capacity includes
one host plus actual joined rows and cannot be reduced below that locked count.
Approval mode is immutable after creation. Successful edits advance revision and
create generic update notifications for joined/pending recipients atomically.

Cancellation retains the record/history, advances revision, creates cancellation
notifications and closes pending requests to declined without inventing host
decisions. Completed activities cannot be cancelled or edited. Retrying an
already-cancelled own activity creates no duplicate effects. No completion or
physical-delete endpoint is exposed.

## Validation, locations and images

Strict server-side Zod rejects host/status/visibility inputs and unexpected
fields. The RPC independently validates input keys/types, category state,
schedule, mode, locations and approved cover keys; existing database CHECKs
enforce text bounds as well.

- Title: 1–100 trimmed Unicode characters; description: 1–1,000.
- Start: a valid future date/time within 365 days, entered in Malaysia time.
- Duration: 30–240 minutes. The schema requires `ends_at`, so duration derives it.
- Capacity: integer 2–50 including the host; locked occupancy check on edits.
- Location: one curated ID resolved to a canonical label, or custom plain text
  of 1–150 characters without controls/line breaks. Curated choices set
  `on_campus=true`; custom choices conservatively set it false.
- Optional image: none, Sports, Food or Study from approved bundled assets.
  Both server and database reject arbitrary paths/URLs or image keys. Alt text
  is assigned from the approved catalog. There is no file upload input or
  unvalidated Storage upload path in this implementation.

Adding user-uploaded images needs its separately reviewed decoder/re-encoder,
size/type checks, ownership path, Storage permissions and cleanup. Existing
avatar Storage restrictions are unchanged.

## Development preparation

No hosted migration was applied. Follow the guarded Development reference,
history and dry-run procedure in `supabase/README.md`; include the new fifth
migration. Never edit applied files or apply this task to Production. Seed active
categories in Development using the documented seed procedure.

A real confirmed UM Auth user must already have a legitimately linked active,
verified profile. This change does not create profiles or grant verification,
status or admin authority. Missing/pending profiles remain denied; profile
onboarding is still a separate planned implementation. Do not fabricate users
or disable eligibility to test creation.

## Tests

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

The application tests execute the actual Zod/actions against isolated client
stubs: bounds, malformed/past times, MYT conversion, forged privileged fields,
approved covers, missing/ineligible identity, sanitized errors and RPC payloads.
Static SQL tests check ownership, locking, privilege scope and lifecycle rules.
These do not prove PostgreSQL execution or concurrency.

With a configured local Supabase stack, apply locally, lint and run pgTAP:

```powershell
supabase migration up --local
supabase db lint --local --level warning --fail-on warning
supabase test db --local
```

The SQL suite uses existing real eligible local identities; absent identities or
seeded categories cause explicit skips. Activities are transactionally rolled
back; no users/profiles are created or activated. Assertions execute as
`authenticated`, never service_role. It covers creation retries, occupancy,
future dates, forged host/image inputs, revision conflict, immutable approval,
own edit, B denial, cancellation, repeated cancellation and cancelled edit.

## Exact manual Development flow

1. Sign in as eligible A. Open Create Activity. Enter a future Malaysian date and
   time, category, curated location, capacity, description, approval mode and an
   approved image. Preview and publish. Confirm a real UUID detail URL, status
   scheduled, one occupied host seat and the derived end time.
2. Refresh the detail page. Open My Activities → Hosting. Confirm persistence.
   Edit title/location/capacity/image and save; refresh and verify the changes.
   Repeat with Other / Custom Location and with no image.
3. Submit past dates, impossible calendar dates, capacity 1/51/non-integer,
   blank/oversized text, custom controls, unknown category and forged image URL.
   UI/server or database must reject them without raw Supabase errors.
4. In two tabs read the same activity revision. Save tab one, then save tab two:
   tab two must report a conflict and must not overwrite tab one's edit.
5. As eligible B, open A's UUID/edit route: unavailable. Call the save/cancel RPCs
   with A's activity ID using B's ordinary session: denied. With A, forge host_id,
   status, moderation visibility or changed approval mode: denied. Direct table
   insert/update/delete remains denied for both users and anon.
6. Cancel as A, confirm the prompt, refresh and verify cancelled history in
   Hosting/Past and no edit action. Repeated cancellation must be harmless.
   With a legitimate joined/pending roster, verify notifications and pending
   closure through authorized operator inspection; notification UI is still demo.
7. When a real roster is available, attempt capacity below host + joined count:
   reject. Race a capacity edit with a future approved admission operation using
   the same lock: only a capacity-consistent outcome may commit.
8. Suspend/ban A through an authorized operator operation using the mutation
   contract; retry with A's old session. Reads/writes must fail eligibility.

Remaining limitations: SQL/runtime tests require local tooling and real accounts;
no live project was verified. General discovery/member read permissions, joins,
rate limiting, pagination beyond 100 hosted records and image uploads remain
separate work. Hiding/suspension and other privileged jobs must honor the lock.
