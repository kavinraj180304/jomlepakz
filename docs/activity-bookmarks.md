# Activity bookmarks

Activity details now offer Save/Unsave. Profile's existing Saved Activities link
opens a real, owner-only list using the existing cards and bookmark styling.
The empty state links to Discover. Saves never create participant rows or seats.

## Database setup

Apply `supabase/migrations/20261013120000_activity_bookmarks.sql` only to the
**verified Development project**, after earlier migrations. Follow [setup](setup.md)
for project-reference verification and dry-run review. No database migration was
applied by this change; previously applied migration files are unchanged.

The existing `(user_id, activity_id)` primary key prevents duplicate saves. The
existing ordered-save index supports pages of 20 plus one row for Next, sorted by
`(created_at DESC, activity_id DESC)`. Pages are bounded 1–500; concurrent mutations
can shift offset pages. No additional indexes are introduced.

Three caller-scoped RPCs expose explicit saved state, own saved status and own list:

- `jomlepakz_set_activity_saved(p_activity_id, p_saved)`
- `jomlepakz_activity_saved(p_activity_id)`
- `jomlepakz_saved_activities(p_page)`

The dedicated NOLOGIN/NOBYPASSRLS owner has SELECT/INSERT/DELETE on bookmarks only,
with an owner-only restrictive RLS gate plus scoped permissive policies. Owner is
derived from the current authenticated eligible profile. Clients retain denied raw
table access and get only RPC EXECUTE; they cannot choose an owner or update status.
Mutation follows the shared `(20261010, 1)` advisory gate, rechecks current eligibility
after waiting and requires READ COMMITTED. Save is an idempotent INSERT; Unsave is
an owner-scoped idempotent DELETE. No participants or notifications are mutated.

Save checks the existing secured detail RPC. Listing reuses it to enforce current
visibility, blocks, history access and host-name privacy. An inaccessible stored
bookmark returns only its already-known ID with `activity: null`, rendered as
Activity unavailable; the owner can still Unsave it. No removed title, host, location
or membership data leaks through a bookmark. Suspension denies all bookmark RPCs.
Bookmarks do not grant chat access or membership.

## Verification

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
supabase test db
supabase db lint --local
```

The Node suite includes isolated A/B caller-client tests, validation, error handling
and static SQL permission checks. Those are **not** live A/B/RLS verification.
`supabase/tests/activity_bookmarks.test.sql` exercises actual RPCs and owner RLS
with two existing real eligible unblocked accounts on a disposable local Development
stack. It fails when those prerequisites are absent; it does not create identities.
All fixtures and test-only permissions roll back. Supabase CLI, Docker and psql were
not available in this workspace, so this SQL suite and DB lint were not run here.

## Manual A/B Development test

1. Verify Development, apply the reviewed pending migration, and sign in as A.
   Open a real activity, Save, refresh: Unsave is shown. Save again via the explicit
   RPC: exactly one A bookmark. Attendance and participants remain unchanged.
2. From Profile, open Saved Activities: the saved card appears with working detail
   navigation and Unsave. With more than 20 saves, test Next/Previous and refresh.
3. Sign in as B in a separate browser. A's bookmark is absent from B's list/status.
   B can save the same activity independently. B unsaving cannot alter A's bookmark.
   Direct REST attempts to read/write A's row fail; forged owner fields are rejected.
4. Unsave as A, refresh details and the list. After removing all bookmarks, confirm
   No saved activities yet and Explore activities. Repeated Unsave is harmless.
5. Save an activity, then use trusted Development tooling to hide it or establish a
   host block. Saved list shows Activity unavailable without private details; Unsave
   still works. Saving an inaccessible/unknown activity fails cleanly.
6. Suspend B through trusted Development tooling: with B's old session, list/save/
   unsave all deny access. Restore only through the approved trusted workflow.
7. At 375/390px and desktop, check cards, bookmark controls, loading/error messages,
   empty state and keyboard navigation. Test a network failure: no false success;
   reload current state before retrying an ambiguous result.
