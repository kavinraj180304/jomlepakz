# Real in-app notifications

`/notifications` now uses real recipient-scoped records, newest first by
`(created_at DESC, id DESC)`. Existing icon rows, slight unread highlight, dots and
Mark All Read placement are preserved. The screen shows the total **currently
visible** unread count across all pages. Pages contain 20 rows plus a lookahead;
URL page values are validated and bounded 1–500. Empty/loading/error states are real.

## Event sources

| Event | Source | Recipient |
| --- | --- | --- |
| Activity updated | Existing host save RPC, per committed edit revision | Joined and pending participants |
| Activity cancelled | Existing cancellation RPC, per activity revision | Joined and pending participants |
| Join requested | Trusted participant transition hook: new/left → pending, approval mode | Activity host |
| Participant joined | Trusted transition hook: instant admission or authorized approval | Activity host |
| Request approved | Pending → joined with current host/admin decision provenance | Applicant |
| Request declined | Pending → declined with current host/admin decision provenance | Applicant |

Host update/cancellation workflows already exist. Join/approval workflows remain
design-only; this migration adds their event hooks, **not** join/approval RPCs or
new participant write privileges. Hooks require a live eligible authenticated actor,
eligible host/applicant, a visible future scheduled activity, no host/applicant block,
the relevant join mode and trusted decision provenance. Trusted maintenance without
an actor does not fabricate join events. Future mutation RPCs must acquire the shared
mutation gate before row locks and participant transitions.

Same-status retries emit nothing. Event keys are database-generated and the existing
recipient/event uniqueness remains a final guard. Notification inserts roll back
with their source transaction. Cancellation closes pending requests without decision
provenance and after changing activity state; therefore it does **not** create false
join-declined notifications. Cancellation retries remain idempotent.

Chat is not implemented: no message trigger, per-message notification, push, email,
typing/presence event or external delivery is added. Future messaging summaries need
a separately reviewed coalescing policy before activation. No fictional events are
backfilled into real accounts.

## Privacy, links and read state

The migration adds private authorization/event helpers, `source_user_id` for block
filtering, and a NOLOGIN/NOBYPASSRLS notification reader role. It has SELECT on required
columns and UPDATE on `read_at` only, with a restrictive recipient/safety RLS gate.
Clients retain denied raw table access and cannot execute private producers or create
trusted notifications. Public APIs are only:

- `jomlepakz_notifications(p_page)`
- `jomlepakz_mark_all_notifications_read()`

Both derive recipient identity from current authentication and live eligibility.
Suspended users fail with old sessions. Reads, unread count and Mark All Read share
RLS: hidden activities and either-direction host/source blocks exclude their events.
All receipts remain recipient-only, including redacted historical events. No sender,
recipient, Auth identity or internal event key is returned to the browser.

Summaries are fixed plain-text strings selected by event kind; stored arbitrary text
cannot become trusted UI content. No message body or participant name is included.
The secured detail RPC determines whether an activity ID may be returned for a link.
Otherwise the event is shown without a link, using Activity details unavailable.
This includes cancellation notices for formerly pending applicants. Purged activities
receive a generic unavailable summary. Links are built only as `/activities/{validated
UUID}`; no external URL, arbitrary path or unimplemented chat route is stored/rendered.

Mark All Read takes the shared mutation gate, then rechecks eligibility and updates
only the caller's currently visible unread rows using database time. It is idempotent;
blocked/hidden receipts stay unread until they become visible and are marked later.
New events committed after the read transaction remain unread. The UI waits for
confirmed persistence and refreshes; failures do not falsely clear unread indicators.
No realtime subscription or global navigation badge is introduced by this screen work.

## Development setup and tests

Review `supabase/migrations/20261013160000_in_app_notifications.sql` and apply only
to the verified Development project after previous migrations. Follow [setup](setup.md)
for reference checks and dry-run review. No database migration was applied on your
behalf and previously applied migration files are unchanged. Existing recipient/time
and unread indexes support the query; no additional index is introduced.

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

On a disposable local Development stack with existing real eligible A/B accounts:

```powershell
supabase test db
supabase db lint --local
```

`supabase/tests/notifications.test.sql` exercises actual event triggers, host update/
cancellation RPCs, recipient RLS, chronology, pagination, read isolation, inaccessible
links, blocks and suspension. It fails if two real unblocked eligible accounts or an
active category are absent. Test activity/relationship fixtures and test-only grants
roll back; no identities are created. SQL is not a replacement join/approval API.
Supabase CLI, Docker and psql are unavailable here, so this live A/B test and DB lint
were not run. Node tests use isolated A/B caller stubs plus actual DTO/UI logic and
static SQL checks; they do not establish live RLS correctness.

## Manual verification

1. As host A, use an existing real activity with joined/pending B relationships.
   Edit activity details, then cancel it. As B, confirm each event's generic copy,
   newest-first ordering and correct activity links/history accessibility.
2. Exercise request/instant admission/approve/decline hooks with the rolled-back
   local SQL test. Those user-facing workflows are not implemented by this task.
3. A must not see B's receipts. Mark All Read as A; B's unread count/read state must
   remain unchanged. Refresh/reopen A: highlight and unread count stay cleared.
4. With 21+ receipts, check Next/Previous, stable ties, page refresh and total unread
   count across pages. Repeat Mark All Read; no additional changes occur.
5. Try direct REST notification insertion/summary mutation and forged recipient
   ownership; deny them. Suspend B through trusted tooling: old-session RPCs fail.
6. Hide an activity or establish a source/host block through trusted tooling: affected
   receipts disappear from both list and count. A pending applicant's cancelled event
   remains a generic own receipt without unauthorized details navigation.
7. Verify empty state, malformed/repeated page values, network-failure read-state
   handling and layouts at 375/390px and desktop. Check keyboard focus and text wrapping.
