# Policy and safety page handoff

Four public routes (`/terms`, `/privacy`, `/community-guidelines`, `/safety`) share
the existing screen header, typography, colours and mobile width. Each shows a
draft/review warning. Footer links appear on ordinary screens and policy pages;
authentication screens include the same links, and signup adds a reading notice
before the form. This does not add a consent-recording or terms-acceptance system.

## Actual behaviour used as evidence

- `src/app/auth/actions.ts`: name/email/password signup, optional Google Auth,
  confirmation/reset emails; Supabase SSR clients use session cookies.
- Profile/chat components: fictional displays and local previews only. No saved
  profile edit, real message send, realtime subscription or direct-message flow.
- Activity, bookmark, dashboard, notification and completion RPC migrations:
  real records and ownership boundaries; instant join/leave and pending request/withdrawal are authored; approval decisions remain unavailable.
- Initial schema and foundation: reports/block relationships exist but users
  have no connected submission controls. Do not advertise either as usable yet.
- Admin RPC/dashboard: existing activity/user report moderation, account
  restrictions, activity actions and audit. No report-identity exposure to
  targets, general feedback reading or dashboard private-chat browsing.
- Optional PostHog HTTP capture is now present, disabled by default and requiring
  browser opt-in. Only four fixed event names with unlinkable random event IDs
  are sent; no content, account IDs, URLs or forwarded client metadata. See
  [demo-data-analytics.md](demo-data-analytics.md) for setup and actual limits.
  Deployment logs, provider regions/backups and live settings remain unverified.

Migrations staged in this checkout are not evidence they have been applied to a
deployed service. Reconcile these pages with the verified launch environment.

## Replace before public launch

Edit `src/lib/policies/content.ts`:

1. `policyDetails.operator`: accountable student team/operator name.
2. `policyDetails.contact`: monitored support/privacy/deletion-request email.
3. `policyDetails.safetyContact`: monitored safety-report email with a responsible
   reviewer. The placeholders deliberately have no mailto links.
4. `policyDetails.effectiveDate`: approved effective date; not the code-edit date.
5. Privacy infrastructure placeholder: verified hosting provider, logs, service
   regions, transfers and relevant provider handling.
6. Privacy retention placeholder: reviewed periods, backups, manual request
   handling, identity checks and exceptions for evidence/audit/revocation data.

Have the legal text reviewed, confirm the student-run operating arrangement and
non-affiliation statement, establish contacts/processes, and review language and
notice requirements. The Malaysian regulator's [privacy notice guidance](https://www.pdp.gov.my/ppdpv1/en/akta/guidance-on-the-preparation-of-personal-data-protection-notices/)
is a review reference; these drafts do not assert legal compliance. Remove the
draft warnings only after the review and operating details are complete. Do not
invent reporting controls, deadlines, data retention periods or UM endorsement.

## Manual verification

Completed for this change: `npm.cmd run lint`, `npm.cmd run build`, and a local
production-server HTTP smoke check. Each policy route and `/sign-up` returned
HTTP 200 without a session, contained all four policy links, and showed the
applicable draft-review text. Browser layout/accessibility checks below remain
manual; the HTTP check does not establish live database or legal compliance.

- Signed out: open all four URLs directly; no protected application data or
  sign-in redirect is required to read them.
- Signup: follow all policy links before entering data. Footer includes Safety.
- Discovery/settings: footer links work without interfering with bottom tabs.
- At a narrow mobile width: headings, long contacts and lists wrap; footer links
  have touch targets and policy pages have no fixed tab bar covering content.
- Keyboard: skip link, headings, footer focus and navigation remain usable.
- Read each page against the deployed features before launch, especially demo
  chat/profile, unavailable reports/blocks/approval decisions, feedback privacy and analytics.
