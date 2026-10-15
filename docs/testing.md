# Accessibility and mobile audit

## Trusted onboarding checks (15 October 2026)

Local code checks: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.
The default test suite includes onboarding schema/action/routing/Proxy tests and
migration source checks. These do not execute PostgreSQL or establish live RLS.
`supabase/tests/onboarding.test.sql` adds catalog/ACL assertions for an isolated
local stack after the new migration; it was not executed during implementation.

`tests/integration/onboarding.test.mjs` is opt-in and is outside `npm test`.
It reuses the existing local QA configuration guard (`QA_TARGET`,
`QA_DATABASE_URL`, `QA_A_UID`, `QA_B_UID`, `QA_ADMIN_UID`; names only).
It rejects hosted targets, creates no Auth users, and requires A to be an existing
reviewed confirmed approved local Auth identity with no profile or revocation.
Most scenarios roll back, including temporary Auth/domain/status changes.
The real overlapping-submission test commits one profile then deletes only that
exact new local profile. Use a disposable local stack without concurrent app use.
This integration test was not run; do not use it against hosted Development.

After authorized Development migration application, manually verify email signup
and confirmation -> onboarding -> home, existing Auth user onboarding, approved
Google onboarding, required fields, repeat submissions and sign-out. Restricted
accounts must remain denied; service failures must show unavailable/retry UI.
General profile viewing/editing remains a demo. Authenticated browser, SQL ACL,
and concurrency checks remain separate from the local code suite below.

Reviewed 13 October 2026. This pass keeps the existing design, layouts and feature
boundaries. It is a focused audit, not a WCAG conformance certification.

## Coverage and method

Chrome viewport overrides: **375, 390, 430 and 1280px** (desktop), normally 812 or
900px high; dialogs also checked at 375 by 300px. Compare document `scrollWidth`
with `clientWidth`, since a scrollbar can reduce usable width by 15px.

Source review covered auth/recovery, discovery, detail, create/edit, hosting/
joined/saved/past collections, notifications, profile/settings, activity inbox/
chat, completion/feedback, moderation, policies and loading/error/empty states.

Browser geometry/semantics checks covered 14 component views at four widths
(56 checks), plus seven public routes at four widths (28 checks). All **84**
final checks had no page-wide horizontal overflow, one `h1`, labelled visible
form controls and image `alt` attributes. Decorative inbox thumbnails use empty
alt text; activity covers have descriptive alt text. Date/category rows have
intentional internal horizontal scrolling.

The component views used disposable local display fixtures to render the actual
components without granting database access. The temporary development-only
route was removed before final lint/build. No accounts, admin memberships or
database records were created. These are **component checks**, not authenticated
end-to-end or database authorization tests. The fixture wrapper differs from
real chat/admin route chrome; their final shell and live states need the manual
checks below. The desktop admin width is defined by source, not authenticated
browser verification in this pass.

Public routes checked directly: `/sign-in`, `/sign-up`, `/password-reset`,
`/terms`, `/privacy`, `/community-guidelines`, `/safety`. `/account-status`
redirects a signed-out visitor to sign-in; its authenticated content and the
recovery-only password form require real sessions.

## Issues found and fixed

| Issue | Focused fix and evidence |
| --- | --- |
| Long unbroken activity text expanded the preview fieldset | Added `min-w-0` to the form's fieldset. A 99-character title, 149-character location and 199-character description previously produced a 1982px document at 375px. Afterward the four stress checks measured scroll/client widths of 360/360, 375/375, 415/415 and 1265/1265. |
| Opening inline cancellation/completion removed the focused trigger | Focus now moves to the safe Keep action, which describes the confirmation prompt. Escape or Keep returns focus to the original trigger. These are inline groups, so they do not trap focus like a modal. Escape is disabled while a mutation is pending. |
| Wizard step changes left focus behind | Focus moves to the screen heading on step changes; the step indicator announces its updated value. Keyboard activation showed a visible heading outline. |
| Preview validation left the user on a screen without the invalid field | Errors name the field and return to its step with the draft retained. A past-date test returned to step one with `Date: Choose a future time within the next year.` and the entered date preserved. |
| Native dialog Tab navigation could move into browser chrome | Shared edge handling wraps Tab/Shift+Tab inside Filters and the demo dialog. Eight successive filter Tab checks stayed inside; Shift+Tab from Close wrapped to Show activities. Native Escape still closes and restores the trigger. |
| Demo dialog had no short-viewport bound | Added a maximum viewport height and vertical scrolling; its trigger declares a dialog. Filters retain their existing bound: at 300px height the sheet is 268px high, top 32px, with 526px scrollable content and no horizontal overflow. |
| Muted text missed normal-text contrast on grey/blue surfaces | Changed only the muted foreground from `#64748b` to `#5b6b82`: white 4.76→5.43:1; secondary 4.34→4.95:1; muted 4.55→5.19:1; accent 4.37→4.99:1. Ratios calculated from the theme sRGB colours. |
| Primary hover lightened the background under white text | Replaced translucent hover blue with `#1d4ed8`; normal primary white text is 5.17:1 and the new hover is approximately 6.70:1. |
| Focus treatment varied across plain links/native fields | Added a shared solid blue `:focus-visible` outline, including controls with outline-removing utilities. Existing component focus rings remain. |
| Skip link scrolled but left focus on the body | Main content landmarks now have `tabIndex=-1`, enabling the native fragment link to focus content without adding an extra Tab stop. |
| Small standalone navigation/state controls | Auth navigation, Profile manage-sign-in, Settings utility links, admin pagination and error recovery links now have 44px minimum height. Small shared buttons are 44px high. Inline prose links retain their normal text layout. |
| State choice and feedback guidance lacked programmatic context | State-preview buttons expose `aria-pressed`; feedback textarea references its privacy/length guidance and reports invalid over-limit text. |

No heading hierarchy, input-label, missing-alt or button/link mismatch requiring
a redesign was found in the reviewed core components. Navigation remains links;
actions remain buttons. Notification unread status has text as well as colour.
Auth field errors retain `aria-invalid`/`aria-describedby`; other operation
notices use status/alert roles. No report/block/chat backend feature was added.

## Repeatable manual checks

Use ordinary reviewed Development accounts: host A, participant B, unrelated C
and a separately authorised admin. Do not use a service key or Production.

1. At every width, follow sign-in → Discover → detail → Save/Unsave → Saved/
   My Activities; test Hosting, Joined, Saved and Past, pagination and empty/
   unavailable records. Check long names, titles, locations, notification text,
   submitted feedback and moderation explanations.
2. Use keyboard only: Tab/Shift+Tab, Enter/Space, skip link, search, scrollable
   date/category choices and pagination. Ensure focus is visible and is not
   obscured by fixed navigation or sticky form actions. At 200% and 400% zoom,
   check reflow, readable labels and reachable actions.
3. Open Filters: check its accessible name, initial Category focus, forward/
   backward wrap, Escape/Close focus restoration, scrolling at short heights,
   and draft discard on reopening. Check desktop centering. Repeat with the
   demo dialog. Inline confirmation groups must allow normal Tab exit.
4. Create/edit all three wizard steps. Required fields should block progression;
   invalid final values should return to the right step with a readable error.
   Check success, stale revision, network failure and retained drafts. Confirm
   completion/cancellation focus behaviour with actual host state; don't perform
   destructive actions on an activity that is not explicitly disposable.
5. With NVDA/Chrome and VoiceOver/Safari, check heading order, landmark navigation,
   labels, disabled/pending state, error/status announcements, wizard changes,
   unread status and feedback privacy guidance. Automated DOM labels do not
   verify spoken output. Recovery, suspension and actual admin action results
   require appropriate real sessions.
6. On real iOS/Android phones, check date/time pickers, keyboard-open form/chat
   layouts, safe-area padding, scroll restoration and orientation changes. Chat
   and profile editing remain demo previews; do not infer delivery or saving.
7. Check contrast in the actual deployed theme, hover/focus/error/disabled states
   and cover-image badges. Token ratios are not a full automated colour audit.
   No axe or screen-reader conformance scan was run. Test OS contrast settings.
8. Check Notifications Mark All Read, loading/error transitions, admin sections
   and audit-reason fields using real Development data. No real server mutation,
   delivery, RLS/privacy or concurrent-user test is established by this UI audit.

## Validation

- `npm.cmd run lint` — passed, exit 0.
- `npm.cmd run build` — passed, exit 0, including TypeScript and 32 generated pages.
- `node --test tests/*.test.mjs supabase/tests/*.test.mjs` — 114 passed, 0 failed.
  The existing filter-sheet test loader now resolves the shared focus helper.
- Production browser check: skip activation focused `MAIN#main-content`;
  keyboard Tab reached Password with a solid blue focus outline. Standalone
  auth links measured 44px high. Temporary viewport overrides were reset.
- `git diff --check` — passed.

SQL tests still require the local Supabase/PostgreSQL tooling described in the
database setup documentation. No new dependencies or database changes.

## Focused performance and failure-state review

Follow-up on 13 October 2026. Scope: obvious request waterfalls, actual asset
sizes, bounded queries and the existing failure screens. No large refactor,
database migration, new index, external service or logging integration.

### Small fixes

- Activity details now start bookmark and private-feedback reads together, after
  the activity access check succeeds. Previously feedback waited for bookmark
  completion. A deferred-response test confirms both start before either
  finishes. Request count is unchanged; no live latency improvement is claimed.
- Route error screens now use the installed Next.js 16.4 `retry()` prop. The
  installed error-boundary implementation refreshes data and clears the boundary
  on retry; the previous `reset()` only cleared the boundary. Recovery preserves
  the current URL rather than discarding filters/pagination.
- Notifications, Saved, My Activities and Administration have specific failure
  messages. Root/activity failures remain friendly, with retry and a navigation
  alternative. Boundaries do not accept/render/log raw error objects; they use
  fixed copy even when given a private error message.
- My Activities, Administration, Create and Edit loading fallbacks now have a
  main landmark, heading and contextual announcement. Edit-unavailable state
  also has a heading and back navigation.
- Discovery's first cover uses eager loading/high fetch priority and subsequent
  covers stay lazy. This replaces the deprecated Next Image `priority` prop.
  Responsive `sizes`, fixed card aspect ratio and existing Next Image use remain.

### Measurements and inspection

Local production image endpoint, requested at **640px / quality 75**, accepting
WebP (not a browser LCP/Core Web Vitals measurement):

| Asset | Source dimensions / bytes | Optimised response dimensions / bytes |
| --- | --- | --- |
| sports.jpg | 1000×667 / 88,123 | 640×427 / 26,840 |
| food.jpg | 1000×667 / 171,080 | 640×427 / 40,692 |
| study.jpg | 1000×751 / 82,400 | 640×481 / 14,646 |

All returned HTTP 200 and `image/webp`. No source-image replacement was needed.
Inbox thumbnails have explicit 56×56 sizing; card covers already use `fill`,
responsive sizes and a reserved aspect ratio. Other list covers remain lazy.

Active discovery/dashboard/saved/notification/admin list RPCs return at most
20 items and use an extra candidate for `hasNext`, deterministic ordering and
bounded pages. Categories and moderation/unread counts serve current UI needs.
The old 100-row hosted helper/component are unused by active pages; they were
not expanded or refactored. No live query plan or database-duration measurement
was available, so no query/index change is justified by this review.

Empty states, unavailable saved records, full badges and cancellation notices
already exist. A missing/inaccessible activity stops before auxiliary reads and
uses the same not-found state, preserving privacy. Full/cancelled presentation
tests pass. Joining is still unavailable in this version; this review does not
claim a live full-seat join rejection test.

Source search found no realtime channels/subscriptions to clean up: chat is
still a demo preview. No application `console` logging or raw database
message/details/hint rendering was found. Existing operations map error codes
to friendly copy. Framework/provider logging configuration remains an operator
check; do not add account identifiers, tokens, message/feedback bodies or full
provider errors to logs when future diagnostics are introduced.

### Validation and manual tests

- Lint and production build passed (32 pages generated).
- All **118** Node tests passed. Four new checks cover concurrent detail reads,
  no auxiliary read for missing activity, full/cancelled UI and safe retry copy.
- Production HTTP checks: signed-out detail, My Activities page two,
  Notifications and Admin redirected to sign-in; an unknown public route
  returned HTTP 404. This does not verify logged-in RLS or activity existence.
- `git diff --check` passed.

Use reviewed Development accounts for the remaining tests:

1. With slow networking, visit Discovery/detail/My Activities/Saved/
   Notifications/Admin/Create/Edit. Verify contextual loading, then real data;
   check skeletons do not imply successful loading or a permanently empty list.
2. Block a data request or disconnect after signing in. Verify friendly failure
   copy with no SQL, schema, provider payload or credentials. Restore networking
   and press Try again: confirm a new data request and successful recovery,
   keeping the same filters/page. Test failures in both detail auxiliary reads.
3. Open malformed, nonexistent, hidden, blocked and unrelated activity URLs.
   Confirm not-found/access handling without revealing which private record
   exists. With the host, verify full, cancelled, ended and completed states and
   unavailable editing. Do not cancel/complete a non-disposable live activity.
4. Exercise no-results, no-hosting/joined/saved/past, empty notifications and
   inaccessible saved records. Check Previous on an empty later page and all
   pagination URLs. Lists should never silently load all history.
5. In browser Network at mobile and desktop DPRs, inspect image selected widths,
   transfer sizes, lazy lower cards, first-cover priority and layout stability.
   Measure LCP/CLS under representative hosting/network conditions before making
   further performance changes; the local asset checks do not establish them.
6. Check normal/admin/suspended access with ordinary sessions; inspect deployed
   server/provider logging for accidental private payloads. Live database
   permissions and throttled authenticated flows remain manual, not established
   by these isolated Node and signed-out HTTP checks.

## Focused QA and membership

This section supersedes earlier notes that joining was unavailable. Atomic
instant join/leave and pending request/withdrawal are now authored; approval
decisions remain unavailable. The new migration is **not applied**. Do not treat
contract tests as proof of deployed RLS or concurrency safety.

### Commands

From the repository root (PowerShell, Node 22.9+ for the optional env-file flag):

```powershell
npm.cmd test
npm.cmd run test:qa
npm.cmd run lint
npm.cmd run build
npm.cmd run test:db
npm.cmd run test:e2e
```

`test` runs existing Node checks plus three membership action tests. `test:qa`
isolates membership and failure-state checks. `test:db` runs three real PostgreSQL
scenarios: competing final-seat requests/idempotency; pending/lifecycle/safety
restrictions; anon/raw CRUD/admin denial and A/B bookmark privacy. Assertions run
as `anon` or `authenticated` with explicit JWT identity, never `service_role`.
`test:e2e` runs an anonymous route guard and one two-context browser scenario:
A creates a two-seat activity, B joins, both see occupancy increase, B leaves,
both see occupancy decrease and the database records B as left.

### Local database and browser prerequisites

No automated command applies migrations or creates accounts. Provision a
**disposable local Supabase** stack using your reviewed setup; review/apply all
ordered migrations including `20261013220000_atomic_activity_membership.sql`
locally. Seed an active category and use three existing reviewed local accounts:
eligible non-admin A/B and an eligible admin with owner-granted membership.
They need confirmed approved-domain emails, verified profiles and no mutual
blocks. First-admin provisioning remains an owner-controlled operation.

Create ignored `.env.qa.local` privately with these variable names:

| Variable | Meaning |
| --- | --- |
| `QA_TARGET` | Literal `local-disposable` |
| `QA_DATABASE_URL` | Loopback PostgreSQL operator connection for fixture setup/cleanup only |
| `QA_A_UID`, `QA_B_UID`, `QA_ADMIN_UID` | Three distinct existing Auth UUIDs, not profile IDs |
| `NEXT_PUBLIC_SUPABASE_URL` | Loopback local Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local publishable key used by the app; use the app's existing env naming |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3230` |

Never commit credentials/session files. Review these values yourself; do not
send secrets in chat. The database suite rejects hosted database URLs. Its
operator prepares only exact activity fixtures; suspension/block checks roll
back, and cleanup removes only exact activity IDs created by this run.

Build using the same local app environment before browser testing. Next embeds
public environment variables at build time. For example, after preparing the
local env file:

```powershell
node --env-file=.env.qa.local node_modules/next/dist/bin/next build
```

Chrome must already be installed. The harness uses Chrome and does not download
browsers. Manually capture A and B's ordinary sessions, each in a fresh codegen
session, using the local app on port 3230:

```powershell
node --env-file=.env.qa.local node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3230
```

In another terminal (create `tests/.auth` first if needed):

```powershell
npx.cmd playwright codegen --channel=chrome --save-storage=tests/.auth/host.json http://127.0.0.1:3230/sign-in
npx.cmd playwright codegen --channel=chrome --save-storage=tests/.auth/participant.json http://127.0.0.1:3230/sign-in
```

Sign in with A in the first session and B in the second, then close each browser.
Stop the manual server before running `test:e2e`; it rebuilds in the inherited
QA environment, starts its own production server and refuses to reuse another
process. This prevents stale hosted public environment values in the bundle.
The flow rejects missing setup
with **BLOCKED**, rather than silently skipping. Both contexts additionally
reject non-loopback network requests.
Screenshots, video and traces are off; auth state and reports are ignored.

Also run the existing database pgTAP cases and `supabase db lint --local` in a
reviewed local setup. This machine has no Supabase CLI/Docker/PostgreSQL service;
these checks and the configured A/B/admin assertions remain unverified here.

### Manual verification matrix

Use disposable local/confirmed Development activities and ordinary accounts.
Where a feature is unavailable, verify the truthful disabled/demo state; do not
record a successful backend test for it. Test relevant flows at **375, 390, 430px
and desktop**, with keyboard, visible focus and slow/offline networking.

| Flow | Manual checks / expected result |
| --- | --- |
| Password signup/login/logout | Approved UM domain, confirmation, invalid/non-UM identity, generic duplicate/error responses, logout and protected route denial. |
| Google OAuth | Provider is currently disabled in inspected Development settings; enable only through reviewed configuration. Then test approved/non-approved email, cancelled callback, fixed redirects and session validation. |
| Password reset | Neutral request response; valid/expired/reused link, matching passwords, reset callback cannot redirect off-site. |
| Profile | Onboarding persists only Full Name, Faculty and Programme through its trusted RPC. General profile editing remains a demo. Confirm no client-controlled identity/account/admin writes. |
| Avatar | Upload remains unavailable; no successful upload claim. When enabled, test path ownership, type/size and cross-user reads/writes. |
| Create/edit/cancel | A creates; B cannot edit/cancel even by direct RPC; revision conflict, capacity reduction below occupancy, cancellation notification and frozen history. |
| Discover/detail | Real records, safe missing/hidden/blocked detail, bounded pagination, full/cancelled states and friendly failures. |
| Search/filter | Title/relevant text, category/date/availability, malformed URL sanitization, refresh/share, page changes and Clear filters. |
| Join/leave | Host denied; duplicate click/retry idempotent; final-seat race gives one winner; leave frees seat; started/past/cancelled/hidden/inactive-host/suspended/blocked admission denied. Existing blocked member can withdraw through RPC before end; detail may be hidden. |
| Host approval | Request becomes pending, no seat consumed, Cancel request becomes left. Approval/decline controls remain unavailable; simultaneous approvals cannot yet be tested. |
| Saves | A duplicate save creates one relationship; B cannot see A's saved list; unsave/empty state; bookmark never changes occupancy. |
| My Activities | Hosting A, joined B, saved owner, past/completed timestamps, empty states/pagination, controls restricted to real relationships. |
| Chat | Activity chat remains demo; no connected participant chat or Realtime subscription. Verify pending/unrelated user receives no trusted live messages. |
| Notifications | Join/request reaches host once, important edit/cancel reaches appropriate recipients; A cannot read/mark B's notifications; chronological order, unread count, Mark All Read, safe links. Approval transition notifications require future decision flow. |
| Reports | Submission remains unavailable/demo; do not claim live reporting. Once wired, verify controlled reasons, identity derivation, private reporter and immutable moderation status. |
| Blocks | Self-service block/unblock remains unavailable. Reviewed local SQL fixtures test both block directions preventing joins; moderation evidence must remain available. |
| Admin access | Anonymous/normal `/admin` denied; normal direct moderation RPC denied; reviewed admin allowed. Verify each authorized mutation creates audit. Known audit finding: admin profile suspension/ban validator EXECUTE grant needs separate review/fix before claiming success. |
| Feedback | Complete only after end by host/admin; accepted non-host participant submits once, no nonparticipant/pending/host self-feedback, author-only read, no public stars. |
| Mobile/accessibility | All widths, no horizontal overflow, usable filters/dialogs, Escape/focus restoration, labels, keyboard, error announcement and touch targets; inspect contrast manually. |

### Current execution result

- Node tests: **121 passed**; focused QA: **7 passed**.
- Local PostgreSQL suite: **BLOCKED**, no `.env.qa.local`/disposable local database
  or reviewed A/B/admin identities. The command exits nonzero and performs no writes.
- Browser suite: **1 anonymous route-guard test passed; 1 authenticated flow
  BLOCKED** (nonzero exit), requiring the same local setup and private A/B sessions.
- Lint, production build and `git diff --check` passed.
- Migration remains unapplied; SQL locking/RLS behavior is a required local gate.

### Paths changed for this QA/join scope

- Database: `supabase/migrations/20261013220000_atomic_activity_membership.sql`.
- Membership: `src/lib/activities/membership.ts`, `membership-server.ts`,
  `src/app/activities/membership-actions.ts`, `src/components/activities/participation-control.tsx`,
  `src/app/activities/[id]/page.tsx`.
- Tests: `tests/activity-membership.test.mjs`, `tests/failure-states.test.mjs`,
  `tests/integration/membership.test.mjs`, `tests/e2e/membership.spec.ts`,
  `tests/qa/local-context.mjs`, `tests/qa/browser-server.mjs`, `playwright.config.ts`.
- Setup: `package.json`, `package-lock.json`, `.gitignore`.
- Documentation/current behaviour: `docs/testing.md`, `docs/activity-membership.md`,
  `docs/policy-pages.md`, `src/lib/policies/content.ts`.

Earlier feature/audit edits already present in the working tree were retained.

## Development demo and optional analytics checks

See [demo-data-analytics.md](demo-data-analytics.md) for the full changed paths,
local-only seed prerequisites and manual PostHog configuration. Analytics is
disabled by default; live service delivery and seed SQL remain unverified.

```powershell
node --test tests/privacy-analytics.test.mjs tests/demo-data.test.mjs
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Current results: **128 Node tests passed**, including seven new privacy/demo
checks; lint/build passed. `npm.cmd run demo:seed` correctly reported BLOCKED
without the explicit local target and made no connection or inserts.

Manual: default/invalid analytics configuration and absent/denied consent send
nothing. Allow in footer, perform the four supported events, inspect exact
minimal payloads, then turn off or enable DNT/GPC. Failed/full joins and pending
requests must not record join completion; editing does not record creation.
Provider failure must not change successful app operations. Verify the cookie
is a preference only, no analytics identity, and expires after 180 days. With
analytics enabled, check the footer control at all mobile widths and keyboard
focus/status messages. Legal/provider region/retention placeholders need review
before enabling. Seed only reviewed fictional local accounts, twice; inspect
no duplicate/reset and correct full/pending/cancelled/saved states.
