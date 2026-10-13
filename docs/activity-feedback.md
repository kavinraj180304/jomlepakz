# Completion and private feedback

Activity details retain the existing card/header/host controls and add a bordered
completion/private-feedback section. Hosts get a confirmation control only after the
server end time. Administrators use the activity dashboard's Complete activity action
with a required reason; the database rejects early completion regardless of UI state.
No automatic completion job, public rating score, host feedback list or broad admin
feedback review is introduced.

## Database behavior

Review `supabase/migrations/20261013200000_completion_private_feedback.sql` after the
earlier admin migration and apply only to verified Development, following [setup](setup.md).
No migration or account changes were applied on your behalf.

- `jomlepakz_complete_activity(activity_id, revision, reason)` uses the shared mutation
  gate, current eligibility, host/live-admin authority, activity row lock, revision and
  `clock_timestamp()` after waiting. Only scheduled activities can complete. Host
  completion requires visibility; administrator completion can address hidden records.
  Admin completion and its moderator/action/target/timestamp audit commit atomically.
- Completion captures accepted **non-host** participants in an immutable private
  eligibility table, then closes pending requests without false approval/decline
  notifications. It preserves joined history. Snapshot and lifecycle changes roll back
  together. Repeating with a stale revision fails without duplicate effects.
- Existing completed records are conservatively backfilled only from preserved joined
  rows whose `joined_at <= completed_at`; hosts are excluded. Missing qualifying history
  produces no entitlement. A later membership insert cannot add feedback eligibility.
- `jomlepakz_activity_feedback_state(activity_id)` returns own state/body and authorized
  completion controls, never another participant's feedback. Friendly states are awaiting
  completion, ready, submitted, host excluded, nonparticipant and unavailable.
- `jomlepakz_submit_activity_feedback(activity_id, body)` derives author from authentication
  and checks frozen eligibility, completed lifecycle, elapsed end time, current visibility,
  eligibility and blocks. The shared gate serializes it with safety changes. No participant
  activity UPDATE privilege is needed to perform the authorized read.
- Feedback is immutable plain text, 1–1000 Unicode characters. Line breaks/tabs are allowed;
  invalid controls and whitespace-only text are rejected. Database timestamp and the
  existing `(activity_id, author_id)` primary key enforce one entry. Same-text retries are
  idempotent; a different second entry fails. No author, rating or status input is accepted.

The NOLOGIN/NOBYPASSRLS completion API owner has scoped grants/RLS. Raw client table and
private eligibility access remain denied. Feedback SELECT is author-only; neither host
nor general administrator authority grants other people's bodies. The admin API has no
feedback SELECT grant. A separately justified moderation/product review flow would need
explicit design and authorization before adding access. UI renders plain text with no HTML
interpretation. Reports/evidence are not replaced by feedback.

## Verification

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

On an existing disposable local Development stack with reviewed admin A, normal host B
and accepted participant C (existing real eligible accounts, B/C unblocked):

```powershell
supabase test db
supabase db lint --local
```

`supabase/tests/activity_feedback.test.sql` checks early host/admin denial, legitimate
completion, participant/host/nonparticipant authorization, unique immutable feedback,
own-body privacy, moderator audit, frozen eligibility, blocks and suspended old sessions.
Fixtures and test-only grants roll back; no identities or admin memberships are created.
CLI/Docker/psql are unavailable here, so real SQL/RLS tests were not executed. Node tests
use real validators/actions with isolated caller clients; they are not live authorization
proof. Browser focus/layout and draft behavior are manual checks.

## Manual tests

1. As host B, open a future/in-progress activity: no completion control. Direct early
   completion RPC fails. An ended scheduled activity remains Ended until valid completion.
2. After end, confirm completion as B. Refresh: Completed appears in details/Past,
   host Edit/Cancel controls disappear, and the host cannot submit participant feedback.
3. As accepted C, an ended but uncompleted activity says feedback awaits completion.
   After B completes, submit plain-text feedback. Refresh: own text and Submitted state
   persist. Repeat the same transport request: one row; different text is rejected.
4. Pending/left/removed/declined or unrelated users cannot submit. A late joined fixture
   after completion does not create entitlement. Cancelled activity cannot be completed.
5. As admin A, complete an ended activity with a reason; verify the audit record. Attempt
   early completion: deny. Admin/host cannot view C's body or a public aggregate.
6. Establish a host block, hide the activity or suspend C through trusted Development
   tooling: direct feedback operations fail while retained feedback remains private.
7. Verify network failure preserves draft and does not show false success. Check empty,
   waiting/submitted states, Unicode count, keyboard use and 375/390px layouts.
