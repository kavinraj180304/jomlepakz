# Real administrator dashboard

The existing admin shell now has Overview, Reports, Activities, Users and Categories
tabs. Counts and paginated rows come from caller-scoped database RPCs, never fixtures.
Normal users are denied at `/admin`, at the server data boundary, and by each database
RPC. The caller-only live admin check replaces the previous intentionally denied raw
membership query. Layout authorization alone is not relied on to protect child data.

## Capabilities and audit

- Reports: pending/in-review **activity and user** reports; transition to in-review,
  resolved or dismissed with a required reason. Reporter identity, evidence snapshots,
  reviewer notes and private message bodies are not projected into this dashboard.
  Reports submitted by/about the moderator or against their hosted activity are excluded,
  including from counts. Such conflicts need an independent administrator/operator.
- Activities: hide inappropriate content or cancel scheduled activity. Hidden records
  remain in storage for evidence. Cancellation retains joined history, closes pending
  requests, and uses the existing deduplicated in-app cancellation notices.
- Users: suspend/ban another account. These states immediately fail current eligibility,
  even with old JWTs. Active hosted activities are hidden and active joined membership
  is removed; pending requests involving the suspended account/host are closed. Terminal
  activity history remains. Self-moderation is denied.
- Categories: enable/disable existing categories without renaming/deleting stable IDs.
  Creation/edit forms use the existing active-category query; existing activities remain
  readable when only their category is disabled. Development seed reapplication can
  reset reference catalog activation, so it is not an operational category-management tool.
- Overview: pending/in-review reports, hidden activities, suspended/banned users and
  active category counts. No private chat browsing/counts are provided.

Every successful mutation takes the shared `(20261010, 1)` advisory gate, rechecks live
eligible admin membership, locks its target, checks revision and writes an append-only
audit record atomically: moderator profile, action, target, reason, before/after state
and database timestamp. Cascaded activity hiding gets separate audit rows. Failed,
stale or unchanged actions do not create successful audit entries. No automatic retry
is used after an ambiguous result; reload before retrying.

The NOLOGIN/NOBYPASSRLS API owner has scoped column grants and admin-only RLS policies;
it is not a table owner. Students receive no direct protected-table privileges or role
membership. RPCs have fixed `search_path = pg_catalog` and qualified objects. The API
cannot grant/revoke admin membership or read messages. Only an owner-controlled reviewed
operator action may create the first real Development admin; this change neither creates
one nor activates users. Existing profile/audit constraints are extended in the new
migration, rather than editing applied migrations.

Ban is an authoritative **application account state**, not an external Supabase Auth
Admin API request. Normal app/approved-identity checks respect it. The retained admin
membership is ineffective during suspension/ban. No restore/unban control is exposed;
owner-controlled recovery must review/revoke admin membership before reactivating an
account, to avoid accidentally restoring authority. No credentials or service key added.

## Development setup and checks

Review `supabase/migrations/20261013180000_admin_dashboard.sql` and apply only to the
verified Development project after previous migrations. Follow [setup](setup.md) for
project-reference checks and dry-run review. No migrations or admin grants were applied
on your behalf. Use existing real accounts; never bootstrap through signup metadata.

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm.cmd run lint
npm.cmd run build
```

On a disposable local Development stack with an existing reviewed eligible admin A and
two existing eligible non-admin accounts B/C:

```powershell
supabase test db
supabase db lint --local
```

`supabase/tests/admin_dashboard.test.sql` fails if those real-account prerequisites are
absent. It tests normal-user/direct-RPC denial, admin allowance, audit records, report
conflicts/evidence preservation, stale revisions, category state, membership cleanup,
ban eligibility and admin revocation. Test fixtures and revocation roll back; no users
or memberships are created. CLI/Docker/psql are unavailable here, so live DB tests were
not run. Node tests exercise actual route guard/action/DAL logic with isolated clients;
they are not proof of live SQL/RLS correctness.

## Manual verification

1. Sign in as normal B: `/admin` denies access; direct dashboard/moderation RPC calls
   return permission denial. No counts/report payload may be returned.
2. As existing reviewed admin A, open `/admin`; each tab loads real data. With 21+ rows,
   check pagination, refresh and section switching. Check mobile/desktop shell styling.
3. Review an independent activity/user report; change status with a reason. Verify
   moderator/time and audit record through trusted tooling; evidence remains unchanged.
   Own/conflicted reports are unavailable. No dashboard tab shows private chat bodies.
4. Hide/cancel inappropriate activity; verify normal discovery and participation history.
   Suspend/ban C; verify C's old-session normal RPCs fail and active memberships are removed.
5. Disable/enable a category; verify creation choices update while old records remain.
6. Revoke A via a reviewed owner operation; A's old-session route and direct RPCs deny
   access. Test stale revisions/failed requests: no successful audit or false UI success.
