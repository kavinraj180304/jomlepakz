# Real activity discovery

`/` requires an eligible signed-in account and reads real Supabase activities.
`/activities/[id]` uses the same visibility boundary. There is no fictional event
fallback or static demo ID. Approved local JPEG covers remain optional image assets.

## Database and behavior

Apply `supabase/migrations/20261010200000_activity_discovery.sql` to the **verified
Development project only**, after the five earlier migrations. Follow the reference
checks in [setup](setup.md). No database changes have been applied on your behalf.
The additive, transactional migration has no DROP/TRUNCATE or data changes; existing
migrations are untouched. Existing feed/category/roster indexes support these queries.

- `jomlepakz_discover_activities(p_search, p_category, p_date, p_available, p_on_campus, p_page)`.
- `jomlepakz_activity_details(p_id)`.

These authenticated-only RPCs use a read-only NOLOGIN/NOBYPASSRLS owner with column
grants and scoped SELECT policies. Raw client table access stays denied. Fixed-path,
postgres-owned private self-identity/boolean helpers check eligibility, blocks and
membership without recursive policies; clients cannot execute them. No service key.
Every RPC checks current eligibility regardless of route handling.

Discovery lists visible scheduled future activities with a currently eligible host.
Hosts and joined participants can read visible history, including cancelled/completed
activities. Pending/left/removed/declined participants and unrelated users cannot read
terminal/history records. Hidden records and either-direction host blocks deny details
even to members. Unknown/inaccessible UUIDs return null and the same not-found UI;
malformed/former-demo IDs do too. No admin bypass is added.

Host names respect profile privacy: visible for `students` profiles or activity
members, otherwise “UM activity host”. No email, Auth ID, academic/admin/account data
or participant identities are returned. Edit revision is returned only to the host.
Occupancy is one host plus joined participants, counted in the database snapshot;
pending requests and bookmarks use no seats. Future joining must still serialize
and revalidate admission; displayed availability cannot authorize a seat.

Search is a bounded literal substring, not interpolated SQL. Date filters use MYT:
Today, Tomorrow, and Saturday/Sunday within the next seven calendar days including
today. Pages contain 20 rows ordered by `(starts_at, id)`, with one extra row for Next;
page numbers are bounded 1–500. Next/Previous preserve filters, filter changes reset
page 1, and malformed/repeated parameters reset with a friendly notice. Concurrent
creation/editing can shift offset pages; this is not a frozen browsing snapshot.

### Search/filter query design

The existing authenticated RPC performs case-insensitive literal substring matching
with `strpos(lower(title || ' ' || description || ' ' || location_text || ' ' || category_name), lower(p_search))`.
Percent, underscore, quotes and SQL-looking text are literal search text. No external
search service is used. Category is a slug equality, availability is
`capacity > 1 + count(joined participants)`, and all predicates apply **before**
the 21-row pagination limit. Existing visibility, host eligibility and block checks
continue to apply to every search.

URL parameters: `q` (trimmed, at most 120 characters, no internal control characters),
`category` (empty or lowercase slug, at most 50 characters), `date` (Upcoming/Today/Tomorrow/Weekend),
`available` and `campus` (`0`/`1`), `page` (canonical decimal integer 1–500).
Repeated or malformed recognized parameters reset the applied filters with a notice;
unknown parameter names are ignored. A syntactically valid unknown category returns
no matches. The DAL validates again before sending typed RPC parameters.
Defaults are omitted from generated URLs. Refresh, sharing and Back/Forward read
the applied URL state; only submitting search applies its draft text. Category/date
changes and applying the sheet return to page one and preserve the applied search.
Clear search and filters navigates to `/` and empties the search input.

The scrollable mobile sheet contains category, date, campus and availability.
Changes apply together with Show activities; Close/Escape discards them. Reset filters
resets the sheet's draft; Show activities commits it while preserving the search.
The main Clear search and filters control clears everything, including search.

No new indexes or migrations are justified for this change: existing
`activities_feed_idx` supports status/future scheduling, `activities_category_schedule_idx`
supports category/status/time, and `participants_activity_status_idx` supports joined
seat counts. A normal B-tree does not accelerate substring search. Add a text-search
index only after representative query plans show a need; this query spans category
text from another table, so a simple activity-title index would not cover it.

Loading, empty and friendly retry states retain the existing card/filter UI. Missing
migration/configuration errors never substitute fixtures. After streaming starts,
Next.js may return the not-found UI with HTTP 200 and `noindex`; before streaming,
the status is 404. Joining, bookmarks, chat, profile onboarding, automatic completion
and other existing demo screens are outside this change.

## Checks

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

Tests exercise actual validators/DAL using isolated caller-client stubs and inspect
SQL permissions, visibility/privacy, counts, pagination and delimiter balance.
Static checks do not establish that the SQL executed successfully.
Component event tests cover draft cancellation, combined application, clear controls
and unfinished search isolation. Browser focus, responsive layout and actual database
query plans remain manual checks.

When an existing **local** Supabase stack has all migrations and development seed:

```powershell
supabase test db
supabase db lint --local
```

`supabase/tests/activity_discovery.test.sql` tests the actual RPC/RLS boundary with
two existing real eligible unblocked local accounts. Behavior tests skip if those
accounts/categories are absent. Fixtures, membership/block/status changes and test
grants roll back; no identities are created or activated. Assertions use authenticated
roles, not service-role credentials. Do not run fixtures on Production. CLI/Docker/psql
are unavailable here, so database integration checks were not run.

## Exact manual Development test

Search/filter regression cases (use the verified Development project):

- Search title, description, location and category text with mixed case. Try `%`,
  `_`, quotes and an unmatched term; punctuation is literal and empty results clear correctly.
- Combine category, Tomorrow/Weekend and Spots available. At MYT midnight, Tomorrow
  includes the next calendar day; Weekend includes Saturday/Sunday within seven days.
  A full activity disappears with availability enabled; pending participants consume no seats.
- With 21+ matching records, Next/Previous retain every filter. Changing a filter
  from page two returns to page one. Reload, share the URL and use Back/Forward;
  the input, chips, sheet values and results match the applied URL.
- Type an unfinished search, then change category: only the previously submitted
  search remains applied. Submit explicitly to apply the new text.
- At 375/390px, open the sheet, change all filters and apply together. Change again
  and Close/Escape: reopening restores the applied values. Check keyboard focus,
  scrolling, native select usability and no horizontal page overflow.
- Clear from both populated and empty results: URL becomes `/`, query empties,
  filters return to defaults and page becomes one. Reset filters in the sheet keeps
  search and commits only when Show activities is pressed.
- Open `/?page=1e2`, `/?q=a%00b`, `/?date=invalid`, `/?available=yes`, or
  `/?category=sports&category=study`: expect the friendly invalid-filter reset.
  A valid unknown slug shows empty results. `page=500` is valid, `page=501` is not.

1. Verify the Development reference, apply pending reviewed migrations and ensure
   twelve real categories exist using the documented development seed. Use existing
   eligible A/B accounts; start `npm.cmd run dev`. Signed out, open `/`: Sign In,
   no private activities. Sign in as A.
2. Create a future activity with an approved image, MYT time, curated/custom location,
   capacity 2 and approval required. Discover shows it once: correct image, location,
   date/time, Scheduled, `1 going` and `1 spots left`. Open its UUID detail: correct
   host/category/description and A-only Edit/Cancel controls.
3. As B in another browser, open the activity: no Edit/Cancel or host revision.
   A's private profile shows “UM activity host”; a `students` profile shows its name.
   Search the title, change category/date and campus/available filters; verify results.
   Search an unmatched string for the empty state, then reset. `/?page=0` and repeated
   page parameters show the invalid-filter reset notice.
4. With at least 21 matching real Development activities, Next shows remaining rows
   after the first 20; Previous returns with filters preserved. Beyond the last page,
   expect empty state with Previous. A full real activity shows Full and disappears
   with Spots available; pending requests/bookmarks do not increase occupancy.
5. As A, cancel the new activity: absent from discovery, Cancelled on A's detail.
   Unrelated B gets the same not-found state as an unused UUID, `/activities/not-a-uuid`
   and former `/activities/badminton-tonight`. No demo fallback.
6. Using existing Development records/trusted tooling or the rolled-back local SQL
   test, verify joined B sees cancelled/completed history with its clear status;
   unrelated B cannot. Hidden records deny both users; either-direction host blocks
   hide discovery/details. Suspended/ineligible accounts cannot use either RPC with
   an old session. Completion/block/admin controls are not implemented in the user UI.
7. In disposable local configuration, use an unreachable Supabase URL or stop an
   existing local stack: expect friendly auth/data errors, no raw provider/SQL errors
   or fixtures. Restore configuration and retry. Throttle networking to check loading;
   check layouts at 390px and 1280px. Do not expose credentials in screenshots/logs.

References: [Supabase function permissions](https://supabase.com/docs/guides/database/functions)
and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
