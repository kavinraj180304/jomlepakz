# Development demo data and optional analytics

## Fictional development fixtures

`development/demo-data.json` contains four clearly labelled **[DEMO]** activities
and fictional persona labels: Hana Example and Ravi Example. It covers upcoming
instant joining, a full activity, a pending request, a cancelled activity and a
participant's saved list. These are not real people, meetups or attendance.

`scripts/demo-data.mjs` is an **explicit manual command**, outside migrations and
`supabase/seed.sql`. No build, deployment, signup or migration runs it. It refuses
NODE_ENV=production and all non-loopback database addresses. It creates no Auth
accounts, profiles or admins and never changes a person's name or restrictions.
Only a reviewed disposable local stack is supported, not hosted Development or
Production. Do not point loopback ports at a tunnel to a hosted database.

Prerequisites: apply the reviewed schema locally, including notification
helpers, and seed active reference categories. Use two existing eligible,
confirmed, unblocked fictional development accounts whose profiles already have
the exact names `[DEMO] Hana Example` and `[DEMO] Ravi Example`. Do not repurpose
real profiles. Account/profile provisioning remains owner-controlled; this
command does not bypass onboarding or grant eligibility.

In ignored `.env.demo.local`, privately configure:

| Name | Value |
| --- | --- |
| `DEMO_TARGET` | `local-disposable` |
| `DEMO_DATABASE_URL` | Local PostgreSQL operator connection, never a hosted/tunnel URL |
| `DEMO_HOST_UID` | Existing fictional host Auth UUID |
| `DEMO_PARTICIPANT_UID` | Existing fictional participant Auth UUID |

Run manually from the repository root, using Node 22.9+:

```powershell
npm.cmd run demo:seed
```

The transaction takes the existing safety gate, checks fictional identity names
and eligibility, and uses fixed demo IDs. Reruns preserve existing dates, edits
and relationships; a conflicting owner/title aborts rather than overwriting.
On any failure all insertion is rolled back. Participant relationships are
operator-created fixtures, not a production API or an authorization test.
Existing join/request notification triggers may create fictional host notices.
No chat, report or feedback text is inserted. Nothing was inserted in this run:
local database/accounts are not configured.

Manual: run twice, check the four IDs appear once, names/titles clearly show
DEMO, full occupancy is host+one joined participant, pending consumes no seat,
cancelled has no join, and B's saved list is not visible to A. Test a hosted URL,
production mode and a real-name profile: each must fail before insertion.

## PostHog setup

Integration is present but **off by default**. No analytics service was enabled
or contacted in this run. Only public project-token variables were added as
blank names in `.env.example`; no private key or new SDK dependency was added.

1. Create a separate PostHog Development project. Choose and review the region,
   provider processing/logging, retention and deletion process. Update the
   placeholders in `/privacy` before enabling. The legal text remains a draft
   requiring review before public launch.
2. Copy the project's **public project token**, not a personal/private API key,
   into ignored local environment/deployment configuration:
   `NEXT_PUBLIC_POSTHOG_KEY`. Only `phc_` project tokens are accepted.
3. Set `NEXT_PUBLIC_POSTHOG_HOST` to exactly `https://eu.i.posthog.com` or
   `https://us.i.posthog.com`, matching the project region. Custom hosts and
   redirects are intentionally unsupported.
4. In PostHog project settings enable **Discard client IP data** as an additional
   safeguard. Keep browser autocapture, session replay, person enrichment and
   unrelated integrations off. This app does not initialize those features.
5. Set `NEXT_PUBLIC_ANALYTICS_ENABLED=true` only after the notice/settings review,
   then rebuild/restart. Blank/false/invalid configuration sends nothing and
   hides analytics controls. A new browser is still opted out. Choose **Allow
   anonymous analytics** in the existing footer to allow future events.
6. For an eligible ordinary account, visit discover/detail, create an activity,
   and successfully join an instant activity. Check PostHog's live events. An
   approval request, leave, save, edit, denied/full join or failed creation must
   not emit `join_completed`/`activity_created`.
7. Inspect event payloads: only a fixed event name, fresh random `distinct_id`,
   public project token and `$process_person_profile=false`,
   `$geoip_disable=true`, `$ip=null`. No account/activity ID, URL/query/referrer,
   browser metadata or user content. The server does not forward client IP or
   request headers; PostHog sees the application server's network connection.
8. Turn analytics off, clear cookies, enable DNT/GPC or set the deployment flag
   false: future events stop. A choice change does not retract already delivered
   events or queued/in-flight captures. Block PostHog: app success stays success.

The first-party HttpOnly preference cookie expires after 180 days and has no
identifier. Delivery is server-side HTTP capture, scheduled with Next `after`,
with a two-second timeout, no redirects/retries/logged payloads. Page views run
on client mount after authorized data renders, not on SSR/prefetch/404. Events
are not linked, so charts support **event totals**, not funnels or unique users.
Successful idempotent RPC retries can count another completion; collection and
ad blockers can undercount. There is no exactly-once analytics ledger. These
counts cannot establish attendance, capacity correctness or moderation facts.

API/processing references: [PostHog API](https://posthog.com/docs/api),
[capture API](https://posthog.com/docs/api/capture),
[anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events),
[privacy controls](https://posthog.com/docs/privacy),
[IP storage controls](https://posthog.com/docs/privacy/data-storage).

## Tests and changed paths

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
node --test tests/privacy-analytics.test.mjs tests/demo-data.test.mjs
```

Tests inspect outbound payloads with mocked transport, refusal gates, preference
validation, unauthorized event calls, provider failures, fixture labelling and
rollback before non-fictional profiles. They do not prove live PostHog delivery
or PostgreSQL seed execution. Run the manual checks above with the reviewed
local fixture accounts and Development PostHog project.

Changed paths: `.env.example`, `package.json`, `development/demo-data.json`,
`scripts/demo-data.mjs`, `src/lib/analytics/{config,server}.ts`,
`src/app/analytics/actions.ts`, `src/components/analytics/{preferences,product-view}.tsx`,
`src/components/policies/policy-links.tsx`, `src/lib/policies/content.ts`,
`src/app/page.tsx`, `src/app/activities/[id]/page.tsx`,
`src/app/activities/{actions,membership-actions}.ts`,
`tests/{privacy-analytics,demo-data,activity-operations,activity-membership,failure-states}.test.mjs`,
`docs/{demo-data-analytics,testing,policy-pages}.md` and `supabase/README.md`.
