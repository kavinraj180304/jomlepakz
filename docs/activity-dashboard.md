# Real My Activities

`/my-activities` uses URL tabs Hosting (default), Joined, Saved and Past. Existing
card, header, horizontal tabs and touch-target styling are retained. Each section
has an empty state. Tabs reset to page one; refresh/sharing preserves section/page.
Malformed/repeated parameters reset to Hosting page one with a notice.

## Query and authorization

The new read-only `jomlepakz_activity_dashboard(p_section, p_page)` RPC reads the
existing activity and participant rows; it creates no activity copies or tables.
Hosting selects own scheduled activities with `ends_at > now`; Joined selects
non-host activities with the caller's actual `status='joined'` relationship and
the same active lifecycle predicate. Both include in-progress activities. Pending,
left, removed and declined relationships are excluded. Hosting and Joined sort by
`(starts_at ASC, id ASC)`.

Past combines owned and currently joined history where the activity is cancelled,
completed, or its end time has passed, sorted by `(starts_at DESC, id ASC)`. A
cancelled future activity is terminal and therefore appears in Past. An elapsed
scheduled activity is labelled Ended, not falsely marked Completed. Lifecycle flags
and seat counts come from the existing secured activity detail projection.

Saved reuses the owner-only bookmark DAL/RPC and ordering described in
[activity bookmarks](activity-bookmarks.md). It keeps unavailable placeholders
removable. A saved-only record never enters Joined or Past; hosts and actual joined
participants can independently see those views. Views reuse one record rather than
persisting duplicate data. Both Saved entry points share the same card renderer.

Every page contains at most 20 rows plus a lookahead for Next; pages are bounded
1–500. Existing host/activity/participant indexes support the query. No additional
index is justified here. Concurrent changes can shift offset pages.

A read-only NOLOGIN/NOBYPASSRLS dashboard owner has column SELECT grants only.
Participant RLS restricts it to the authenticated caller's relationships; activity
RLS reuses current eligibility, membership, visibility and either-direction host
block checks. The authenticated client gets only RPC EXECUTE, no raw table grants.
Hidden or blocked records are excluded, even if formerly hosted/joined; bookmarks
do not bypass these checks. No emails, participant identities or Auth IDs are returned.
Owner revision/Edit/Cancel appear only for owned records. Cancel applies to scheduled
records; Edit additionally requires the secured `canEdit` flag. Participants receive
View joined activity only. Join/leave/chat operations remain unimplemented, following
the earlier design-only scope; no demo buttons claim those operations succeeded.

## Development setup and checks

Review and apply `supabase/migrations/20261013140000_activity_dashboard.sql` only to
the verified Development project after previous migrations, including bookmarks.
Follow [setup](setup.md) for project-ref verification and dry-run review. No migrations
were applied on your behalf; existing migrations were not modified.

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

On a disposable **local Development stack** with two existing real eligible accounts:

```powershell
supabase test db
supabase db lint --local
```

`supabase/tests/activity_dashboard.test.sql` checks host A and participant B through
actual authenticated RPCs. It fails if real-account/category prerequisites are absent.
Participant/activity fixtures and test grants roll back; no identities are created.
Supabase CLI, Docker and psql are unavailable here, so live database tests were not run.
Node tests use isolated host/participant caller stubs and real DTO/UI logic; they do
not establish live SQL or RLS correctness. Browser layout is also a manual check.

## Manual verification

1. Sign in as host A. Create a future activity. My Activities → Hosting shows its
   current title, date, occupancy and Edit/Cancel controls. Edit it and return:
   all views/details show the updated record.
2. Using an existing approved joined relationship or rolled-back local SQL fixture,
   sign in as participant B. Joined shows that activity; Hosting does not. B has
   no edit/cancel controls or host revision. Direct A-only mutation attempts fail.
3. Pending/left/removed/declined B relationships must not appear in Joined. No new
   join/approval/leave feature was implemented by this dashboard task.
4. Save an unrelated activity as B: Saved shows it, Joined/Past do not. Unsave
   through either Saved entry point; both update. Empty lists show their section's
   appropriate action. Inaccessible saved records reveal no activity details.
5. Check future, in-progress, ended-scheduled, completed and cancelled activities.
   Active host/member rows stay in Hosting/Joined; ended/terminal rows move to Past.
   Labels distinguish Ended from Completed. Terminal rows have no Edit/Cancel.
6. With 21+ matching records, verify Next/Previous without repeated rows on unchanged
   data, section preservation, refresh and browser Back/Forward. Switching a section
   from page two resets page one. Beyond the last page retains Previous navigation.
7. Hide a record or establish a host block using trusted Development tooling:
   exclude it from Hosting/Joined/Past. Suspend B: old-session dashboard reads fail.
8. Check 375/390px and desktop: horizontal tabs, readable cards, control focus,
   empty/loading/error states, and no horizontal page overflow.
