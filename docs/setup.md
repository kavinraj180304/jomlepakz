# Local setup

Run commands in the existing JomLepakz repository root, where `package.json` lives. Do not run create-next-app again or initialize another Git repository.

## Requirements

- Node.js 20.9 or later, the current [Next.js minimum](https://nextjs.org/docs/app/getting-started/installation).
- npm, supplied with Node.js.
- Git for working with this repository.

Check the available tools with `node --version`, `npm --version`, and `git --version`.

## Install and develop

In PowerShell:

```powershell
cd C:\Users\Dell\Documents\jomlepakz
npm ci
npm run dev
```

`npm ci` installs the dependencies recorded in `package-lock.json`. Open http://localhost:3000, or the address printed by the dev server if that port is occupied. Edit `src/app/page.tsx` to change the home page. Stop the server with Ctrl+C.

The generated layout uses Google fonts through `next/font/google`; the first build may need network access to fetch them. Tailwind is configured through the Turbopack loader in `next.config.ts` and the import in `src/app/globals.css`.

## Check and run production

```powershell
npm run lint
npm run build
npm start
```

`lint` runs ESLint; `build` compiles the app and checks TypeScript; `start` serves the completed production build. Run `start` only after a successful build. These commands match the current `package.json` scripts.

## Environment and database

Supabase client infrastructure uses `@supabase/supabase-js` and `@supabase/ssr`, following the [current Supabase Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs). The installed Next.js 16 uses `src/proxy.ts` to refresh sessions with `getClaims()`, forwarding updated cookies to server rendering and the browser, including Supabase's cache protection headers.

Copy `.env.example` to `.env.local` if `.env.local` does not already exist. Manually populate these values from your **development** Supabase project's Connect dialog:

- `NEXT_PUBLIC_SUPABASE_URL`: the development project's URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable key.
- `NEXT_PUBLIC_APP_URL`: `http://localhost:3000` (or the actual local origin if using another port). Used as the trusted confirmation/callback origin; use HTTPS on a hosted deployment and never include a path, credentials or query string.

Keep real values only in Git-ignored `.env.local`. Use the publishable key for both clients; never use a secret or service-role key. Next.js sets `NODE_ENV` automatically. Restart `npm run dev` after populating the values. The Proxy needs the Supabase URL/key when serving requests; lint/build can run without them because client construction happens at request time.

The browser client is `src/lib/supabase/client.ts`; the request-scoped server client is `src/lib/supabase/server.ts`. Await the server factory and use it outside cached functions; with Cache Components enabled, cookie-dependent Server Components need a Suspense boundary. Password signup/signin/signout, Google PKCE sign-in, confirmation/recovery handlers, password updates and protected page layouts are implemented. Migrations are authored under `supabase/migrations/`; this does not establish that they have been applied. Trusted profile onboarding and application persistence remain pending.

### Exact development connection test

After populating `.env.local`, run this read-only test in PowerShell from the repository root (Node.js 20.12+). It requests Auth settings with the publishable key, needs no tables, and prints no credentials:

```powershell
@'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Populate the Supabase URL and publishable key in .env.local first.');
const response = await fetch(new URL('/auth/v1/settings', url), {
  headers: { apikey: key },
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error('Supabase connection failed: HTTP ' + response.status);
await response.json();
console.log('PASS: development Supabase Auth connection (HTTP 200).');
'@ | node --env-file=.env.local --input-type=module
```

Then run `npm run dev` and open the printed local URL. The homepage should load through the Proxy without Supabase configuration errors. The Auth settings test confirms connectivity and key acceptance; use the password-authentication test flow below to check sign-in and session refresh.

## UM signup gate: manual Development setup

For real activity creation, also review the later
`20261010180000_activity_host_operations.sql` and
[activity operations setup/test flow](activity-operations.md). It uses existing
publishable-key sessions and requires an active verified real profile plus
seeded categories. It does not grant eligibility or require provider secrets.

After the three Auth/base migrations, also review
`supabase/migrations/20261010160000_rls_foundation.sql` and
[the authorization foundation](authorization-foundation.md). It closes the
identity-unlink gap, hardens future privileges and reserves private avatar
storage. Feature access stays denied. Apply only to a confirmed Development
project after preview; verify the existing `avatars` bucket does not conflict.
No extra secrets or Dashboard policies are required for this foundation.

The database implementation is `supabase/migrations/20261010120000_um_signup_gate.sql`,
after `20261010094238_initial_v1_schema.sql`. It contains no DROP/TRUNCATE, creates
no users and does not automatically activate profiles or grant admin membership.
The email-change trigger invalidates verification on future actual email changes;
it preserves suspended/deleted states. No migration has been applied as part of
authoring this gate, and no Dashboard settings or secrets were entered.

### Apply and configure the Development project

1. Open your **Development** Supabase Dashboard. Confirm its project reference
   independently; this repository currently has no confirmed CLI-linked project.
   Use the guarded migration preview/apply procedure in [supabase/README.md](../supabase/README.md#apply-manually-to-development).
   Review all intended pending migration files and existing remote history. Apply only
   the intended unapplied migrations, never edit applied files or apply to Production.
2. Before enabling public registration, audit existing Auth users and profiles.
   There is no grandfathering: current email must be confirmed and approved,
   and the linked profile must be active and verified. Do not reactivate
   suspended users, assign administrators, or delete ineligible accounts.
   Missing/pending profiles remain denied until a separately reviewed trusted
   onboarding operation exists. Keep operator Dashboard recovery access.
3. In **Authentication -> Hooks**, choose **Before User Created**, select a
   Postgres function and set **schema `private`, function `before_user_created`**.
   Save/enable it. Confirm it appears enabled. Supabase currently documents this
   hook on Free and Pro plans; actual hosted activation must be checked manually.
   If the function is not selectable or activation fails, keep registration
   disabled until resolved; do not expose the private schema through the Data API.
4. In Authentication's **Email provider/sign-in settings**, enable email
   confirmations and **Secure Email Change** (confirmation at both old and new
   addresses). Allow new signups only after the hook is enabled. Keep anonymous
   sign-ins, unused providers and manual identity linking disabled for V1.
5. If enabling **Google**, configure the OAuth client and its secret yourself
   in the provider settings. Copy the Dashboard's callback URL into your Google
   OAuth configuration. Configure **URL Configuration** with the Development
   site URL and exact implemented callback routes; do not add production or
   broad wildcard redirects. Continue with Google now uses the PKCE callback.
   Google account-picker domain hints are not the security gate. Follow the
   exact Google/recovery configuration below before enabling the provider.
6. Run the Development checks below using accounts you own/control. Confirm
   password **and** Google behavior before opening registration. Never paste
   tokens, passwords, provider secrets or database credentials into chat.

### Security configuration and review

- `private.approved_email_domains` starts with **only `siswa.um.edu.my`** active.
  Staff domains must be explicitly approved and added by a trusted operator in
  a new reviewed migration; `um.edu.my` is not assumed. Deactivate a domain
  instead of deleting it. Changes immediately affect subsequent database requests.
- The parser trims outer ASCII space/tab/CR/LF, lowercases using the `C`
  collation, validates ordinary ASCII mailbox syntax/lengths, then compares
  domains by exact equality. Missing/malformed emails and unknown/inactive
  domains fail closed. Quoted local parts and internationalized mailboxes are
  deliberately unsupported. Subdomains/suffix lookalikes do not match.
- The Auth hook is **security invoker**. `supabase_auth_admin` gets only schema
  usage, hook/parser execution and allowlist SELECT with an explicit role-only
  RLS policy. No client can invoke the hook or read/write the allowlist.
- `private.current_user_is_eligible()` is a fixed-search-path, self-only boolean
  reader owned by the trusted migration operator (`postgres`). This bounded
  security-definer function reads live Auth state and profiles without recursive
  RLS; it accepts no target user ID or dynamic SQL and exposes no identity data.
  Clients receive no Auth-table privileges. Migrations must run as the trusted
  Supabase `postgres` operator, not an application user.
- Email invalidation runs under a separate **non-login, non-bypass-RLS** role
  with SELECT on only profile link/status/verification and UPDATE on only
  status/verification. It has no Auth read grant or client membership. Temporary
  role membership/schema CREATE used to assign ownership are revoked before commit.
- Every exposed base table has an **additional restrictive** eligibility policy.
  Existing table privilege revocations remain, and no permissive client access
  is added. Even eligible accounts currently cannot read application tables.
  Future policies must add ownership, blocking and privacy rules; eligibility
  alone is not sufficient. Pending onboarding needs a separate narrow trusted
  operation, because this gate intentionally rejects pending profiles.
- Before every future server data operation, use the request-scoped user client
  and call `rpc('jomlepakz_current_user_is_eligible')`; allow only a successful
  result strictly equal to `true`. Treat RPC errors as denial. Do not cache the
  boolean across requests. RLS still checks each database operation. Privileged
  service-role operations bypass RLS and need explicit actor/eligibility checks.
  Proxy `getClaims()` or a frontend domain check does not establish eligibility.

Email changes are not covered by the creation hook. Pending email changes keep
the old current email; when the current email changes, verification is cleared
and active profiles become pending. A trusted operation must verify the new
approved identity again. Suspensions and admin memberships are never reset.
Existing ineligible accounts may authenticate, but cannot access protected data,
including with a stale JWT. Current Auth bans are checked alongside profile status.

Review focused on exact matching, NULL handling, safe paths, no arbitrary user
parameters, role scope, restrictive policies, and preserved suspensions. SQL
runtime and hosted hook behavior still require the local/Development checks.
Auth-trigger errors can block email changes. Empty/mistyped allowlists or bad
hook grants can block signup; repair through trusted operator access while
keeping signup disabled. Do not recover by opening RLS or guessing staff domains.

Sources: [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[hook permissions/configuration](https://supabase.com/docs/guides/auth/auth-hooks),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[email confirmation/change configuration](https://supabase.com/docs/guides/local-development/cli/config).

### Tests

Available source checks (no hosted changes):

```powershell
node --test supabase/tests/*.test.mjs tests/*.test.mjs
npm run lint
npm run build
```

Once CLI/Docker are installed and local configuration exists, apply only locally
and run the behavioral database suite:

```powershell
supabase start
supabase migration up --local
supabase db lint --local --level warning --fail-on warning
supabase test db --local
```

After `supabase init`, add these settings to the generated `supabase/config.toml`
for local Auth tests (do not duplicate existing TOML sections):

```toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/private/before_user_created"

[auth.email]
enable_confirmations = true
double_confirm_changes = true
```

The pgTAP gate suite creates no users or profiles. It exercises allowed/denied
hook payloads under the actual Auth role, malformed email parsing, permissions,
inactive domains, and restrictive RLS despite a temporary permissive policy.
It tests an existing ineligible real account if one exists, otherwise explicitly
skips that assertion. All temporary policies/grants/domain changes roll back.

Required manual Development tests, via a local Supabase client/test harness until
the real password/Google Auth screens:

| Test | Expected result |
| --- | --- |
| 1. Sign up with a controlled `siswa.um.edu.my` mailbox; repeat with uppercase domain. Test Google with a real approved provider identity too. | Auth account creation allowed; password email must be confirmed. No full app access before trusted profile completion/verification. |
| 2. Attempt new password/Google signup with a controlled non-UM account. Also test `um.edu.my`, subdomains and suffix lookalikes. | Creation denied; no new Auth user. Existing duplicates may produce an Auth anti-enumeration response instead: verify actual user creation in the Dashboard. |
| 3. Sign in to an **already existing** ineligible Development account. Call the eligibility RPC, then query protected app tables directly with its token/publishable key. | RPC returns `false`; protected query is permission denied or returns no rows. Repeat with a stale token after domain deactivation/email change. Do not insert synthetic users or alter a real user's email to fabricate this fixture. If none exists, record this test as pending. |
| 4. Run malformed hook payloads in `um_signup_gate.test.sql`; attempt malformed email through Auth directly. | Hook rejects missing email, extra `@`, embedded whitespace/control characters, trailing dot and lookalikes; Auth may reject syntax even before the hook. |
| 5. Approved domain but unconfirmed, suspended, banned, missing profile or pending profile; forged admin/verification metadata. | No protected access or admin promotion. |
| 6. Complete an email change to another address and retry with the old token. | Verification cleared; current non-approved email denied; approved replacement still needs trusted re-verification. Suspended state preserved. |

## Password authentication: manual settings and exact test flow

Implemented routes: `/sign-up`, `/sign-in`, `/auth/confirm`, `/auth/callback`,
and `/account-status`. Sign out is a POST Server Action button on account status
and Settings, with no GET logout URL. `/activities/*`, `/my-activities`,
`/saved-activities`, `/messages/*`, `/notifications`, `/profile/*`, `/settings`
and `/admin` have protected server layouts and Proxy checks. `/admin` additionally
requires an active current admin membership, checked using the user's own client;
until narrow membership/profile read policies are approved it remains denied.
`/` and `/demo/states` remain public fictional demos. `/password-reset` sends
real reset requests; `/auth/recovery` validates links and `/update-password`
checks the current approved identity before showing or submitting an update.

### Required Development Dashboard settings

1. Complete the UM migration/hook setup above. Without the live eligibility RPC,
   protected access fails closed even if password authentication succeeds.
2. Enable Email/password sign-in and **Confirm Email**. Set minimum password
   length to at least 8; keep Secure Email Change enabled. Configure email delivery
   yourself. Supabase's default sender has delivery restrictions; configure SMTP
   if it cannot deliver to your controlled UM mailbox. Never enter secrets in chat.
3. Under **Authentication -> URL Configuration**, set Site URL to your actual
   Development origin, e.g. `http://localhost:3000`, matching `.env.local`'s
   `NEXT_PUBLIC_APP_URL`. Add these exact redirect URLs:

   ```text
   http://localhost:3000/auth/confirm
   http://localhost:3000/auth/callback
   ```

   Replace the origin consistently when using a different port/host. Do not use
   request Host headers or unrestricted redirect wildcards as configuration.
4. Under **Authentication -> Email Templates -> Confirm signup**, use a
   token-hash link, which can confirm from another browser/device:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Confirm your email</a>
   ```

   Do not put real tokens into the template. The `/auth/confirm` handler accepts
   only email/signup verification, never recovery/invite types, and establishes
   the SSR session through `verifyOtp`. The default `ConfirmationURL` template
   is also supported through `/auth/callback` and `exchangeCodeForSession`, but
   that PKCE flow needs the original browser's verifier cookie. Callback success
   goes to `/profile` if eligible, otherwise `/account-status`; URL-provided
   `next`/provider error text is never reflected by these handlers.

### Exact manual test

1. Start `npm run dev`. In a private browser window, visit `/profile` and
   `/activities/create`. Expect a sign-in redirect with an internal `next` path;
   no protected page content should be shown. The public home still loads.
2. Visit `/sign-up`. Enter your name, a **UM mailbox you control**, and a password
   of 8-72 characters. Expect a neutral check-email message. No profile is
   automatically created/activated and no admin rights are granted. Passwords
   are never trimmed, logged, stored in app metadata or returned in form state.
3. Before confirmation, try `/sign-in`. Expect the friendly confirmation/error
   notice and no protected access. Open the received confirmation link. With
   the recommended template, `/auth/confirm` establishes the session and sends
   a newly registered account to **Account access pending**. Use its Sign out
   button, then sign in with the confirmed credentials and expect the same status.
4. Repeat the confirmation link, and try `/auth/confirm` without a token or with
   a malformed token/type. Expect `/sign-in?notice=confirmation_failed`, with no
   raw provider error or token displayed. If the link expired, a trusted operator
   must arrange a fresh confirmation email through supported Supabase tooling;
   an in-app resend form is not implemented yet.
5. Try wrong credentials, malformed email and a short signup password. Expect
   friendly messages/field errors. Server Actions also reject invalid input when
   browser validation is bypassed. Try a new non-approved email: the database
   hook must deny creation. Duplicate signup gets a neutral response.
6. For the **positive protected-route test**, use an existing real Development
   account that already has an approved, confirmed email and a completed active,
   verified profile established through a reviewed trusted operation. Sign in
   after opening `/settings`; expect return to `/settings`. Reload it, then check
   session refresh after the access token expires. No manually created fake users
   or client-written status/verification fields are needed or allowed.
7. From `/settings`, select Sign out. Expect `/sign-in?notice=signed_out`.
   Reload/revisit `/profile` or `/settings`; expect sign-in again. For pending
   accounts the same button is available on `/account-status`. Sign out affects
   this browser's session; already extracted stateless access tokens can remain
   valid until expiry. It does not mean every other device is signed out.
8. Sign in with an existing ineligible/suspended Development account. Protected
   routes must go to `/account-status`, and direct app-table queries must still
   be denied by grants/RLS. Disable an approved domain or suspend the account via
   an authorized operator operation and retry with an old token: access is denied
   on the next request. An ordinary user cannot access `/admin` through metadata.
9. Visit `/sign-in?next=https://example.com` and repeat with `next=//example.com`
   and encoded slashes/backslashes. Successful eligible sign-in stays on a known
   internal route; it never redirects off-site. Callback URLs ignore `next`.

Profile onboarding and data-access policies are deliberately still pending:
authentication can be tested fully, but a fresh account cannot become eligible
or load protected database data merely by confirming an email. Protected screens
still show fictional content once authorized. The DAL helper
`requireEligibleUser()` must also be called by future data operations, alongside
RLS and each operation's ownership/privacy checks. No service-role key is used.

Run `node --test tests/password-auth.test.mjs` for isolated behavioral tests of
the actual Zod schemas, Server Actions, error handling, redirects and callback
handlers. These use stubs and create no accounts or network requests. Run lint,
build and the database suites separately. Actual delivery/cookies/session refresh
must be verified manually against the configured Development project.

Sources: [Supabase SSR/session refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs),
[password authentication](https://supabase.com/docs/guides/auth/passwords),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Google sign-in and password recovery

New migration `supabase/migrations/20261010140000_auth_identity_gate.sql` must be
applied **after** the base schema and UM signup gate. It adds a self-only boolean
RPC that checks the current confirmed email against the same exact private
domain allowlist, plus Auth ban and suspended/deleted profile state. Pending or
missing profiles can pass this identity check for password recovery, but remain
denied by the full application eligibility gate. No table grants, profile
activation, admin privileges, users or permissive app policies are added. The
fixed-search-path reader is owned by the trusted `postgres` migration operator;
anonymous execution is revoked. No migration was applied during implementation.

### Exact Google Cloud and Supabase Development configuration

1. Confirm your **Development** project and apply only intended pending files
   using the guarded preview/apply procedure above. Verify the Before User Created
   hook is enabled and only explicitly approved domains are active. Registration
   must not open while the hook is disabled or missing.
2. In **Google Cloud -> Google Auth Platform**, select/create your project's
   OAuth configuration. Complete **Branding** with the JomLepakz name, support
   email and required application/contact details. In **Audience**, choose the
   audience appropriate to your owned Cloud project. A project outside UM's
   Workspace normally needs **External**, with **Testing** and your real test
   users listed. Add controlled approved and non-approved Google identities for
   the allow/deny tests. Do not assume you can select UM's Internal audience.
3. In **Data Access**, use only `openid`,
   `https://www.googleapis.com/auth/userinfo.email` and
   `https://www.googleapis.com/auth/userinfo.profile`. No Google API beyond basic
   sign-in, offline access or extra sensitive scopes is needed.
4. In **Clients -> Create client -> Web application**, add the actual app origin
   under **Authorized JavaScript origins**, e.g. `http://localhost:3000`.
   Under **Authorized redirect URIs**, add the exact **Supabase** callback shown
   in Dashboard -> Authentication -> Google provider settings, normally:

   ```text
   https://<DEVELOPMENT_PROJECT_REF>.supabase.co/auth/v1/callback
   ```

   This Google redirect is **not** the app's `/auth/callback`. If using a fully
   local Supabase stack instead, the documented callback is
   `http://127.0.0.1:54321/auth/v1/callback`; configure that separately yourself.
5. Create the client. Copy its Client ID and Client Secret yourself into
   **Supabase -> Authentication -> Sign In / Providers -> Google**, then enable
   the provider and save. Keep normal validation/nonce settings enabled. The
   secret lives only in Google/Supabase configuration: do not add Google secrets
   or provider credentials to app files, Git, chat or `NEXT_PUBLIC_*` variables.
   The app needs only the existing Supabase publishable configuration.
6. In **Supabase -> Authentication -> URL Configuration**, set Site URL to the
   same trusted app origin as `NEXT_PUBLIC_APP_URL`. Allow exactly:

   ```text
   http://localhost:3000/auth/callback
   http://localhost:3000/auth/confirm
   http://localhost:3000/auth/recovery
   http://localhost:3000/update-password
   ```

   Substitute your actual Development origin consistently. Do not add wildcard
   destinations. The server supplies fixed callback URLs and ignores user input
   for OAuth/recovery redirect targets. Google's account picker is only UX; the
   database hook and live identity checks enforce UM access.

### Exact password recovery configuration

1. Keep Email/password enabled, Confirm Email enabled, minimum password length
   at least 8, and Secure Email Change enabled. Configure SMTP delivery yourself
   if the default Supabase sender cannot deliver to the controlled UM test inbox.
   Retain sensible Auth rate limits; do not paste SMTP secrets into Git or chat.
2. In **Authentication -> Email Templates -> Reset Password**, set the link to:

   ```html
   <a href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&amp;type=recovery">Reset your password</a>
   ```

   This template works across browsers/devices. The handler accepts only a
   `recovery` type for token-hash links, removes the token by redirecting to
   `/update-password`, and applies `no-store`/`no-referrer` response headers.
   Supabase rejects expired/used tokens. Keep Confirm Signup's separate
   `/auth/confirm` template unchanged.
3. If retaining the default `{{ .ConfirmationURL }}` recovery template, the
   request supplies `/auth/recovery` as its fixed redirect. The callback
   exchanges the code using the original browser's PKCE verifier; opening in
   another browser cannot complete that flow. The recommended token-hash
   template avoids this verifier dependency.

### Exact Development tests

1. Run `npm run dev`; open `/sign-in` or `/sign-up`, then **Continue with Google**.
   Choose a real approved UM Google identity you control. Supabase validates
   OAuth, the callback exchanges PKCE and calls live `getUser()`, then the
   database identity RPC. An eligible profile goes to `/profile`; approved
   pending/missing profiles go to `/account-status` without activation.
2. Try a **new** non-approved Google account. Creation must be rejected by the
   hook; verify no new Auth user in the Dashboard. Test an existing non-approved
   Google-linked account too: its callback session is rejected/sign-out attempted,
   and protected routes/direct app queries stay denied. Do not create synthetic
   users to fabricate existing-account fixtures. `um.edu.my` and subdomain/suffix
   lookalikes are not implicitly approved. A real UM address must actually be
   usable with Google's provider; a mailbox domain alone does not establish that.
3. Cancel Google consent. Try an invalid/used code, open a PKCE callback in a
   browser without its verifier, and add `next=https://example.com` to callbacks.
   Expect the fixed friendly sign-in failure page, never provider error text,
   codes, tokens or an off-site redirect. Revoke/suspend an account and repeat:
   live checks must deny it even if an older JWT exists.
4. Open `/password-reset`; submit malformed input, then a controlled existing
   approved address. Valid input gets a neutral check-inbox message, including
   for nonexistent accounts. No response reveals account existence. A non-UM
   existing account may receive Auth email, but cannot pass the recovery callback
   or gain app access. Request errors remain neutral except rate-limit guidance.
5. Open the recovery email. With the recommended template, `/auth/recovery`
   verifies the token and current approved identity, then shows `/update-password`.
   A pending profile can reset credentials without becoming active. Enter
   mismatched or short passwords; expect server validation errors. Submit matching
   8-72 character passwords; expect sign-out and the friendly sign-in success
   notice. Confirm old password fails and new password works.
6. Reuse the link, wait for expiry, remove/change its token, or change its type to
   `signup`. Expect `/password-reset?notice=reset_failed` with a new-link form.
   Visit `/update-password` while signed out: no form is shown; a fresh link is
   requested. If a session expires before submission, the action denies the
   update with a friendly notice. Banned/suspended/unapproved identities cannot
   update through this app flow.
7. An already authenticated approved account may also open `/update-password`
   to update its **own** credentials, following Supabase's authenticated-update
   model. A query flag or recovery UI state never authorizes the operation.
   The server rechecks Auth and live identity on every submission; Supabase
   applies its password-change/re-authentication settings. Password updates never
   reset suspension, activate profiles or grant admin membership. Full app data
   remains protected by the separate eligibility/RLS rules.
8. Run `node --test supabase/tests/*.test.mjs tests/*.test.mjs`, `npm run lint`
   and `npm run build`. Run local pgTAP/db-lint when CLI/Docker are available.
   The automated tests use stubs, exercise the actual handlers/actions and create
   no accounts. Real Google consent, mail delivery, cookies and password changes
   require these manual Development tests; they were not performed on your behalf.

Sources: [Supabase Google PKCE/setup](https://supabase.com/docs/guides/auth/social-login/auth-google),
[password recovery](https://supabase.com/docs/guides/auth/passwords),
[resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Activity discovery read API

After the five earlier migrations, the pending
`supabase/migrations/20261010200000_activity_discovery.sql` adds two authenticated
read RPCs and a dedicated read-only RLS role. Apply only after verifying the
Development project reference using the checks above. No SQL has been applied
on your behalf. Seed real development categories before using filters; no events
or users are seeded. See [discovery behavior, checks and exact manual test](activity-discovery.md).
The home route now requires an eligible session and uses private/no-store responses.
Raw table access remains denied; no Dashboard secret/config change is required.

## Finding your way around

- [Architecture and intended folders](architecture.md)
- [V1 scope](scope.md)
- [Development checklist](progress.md)
- [Visual handover](base44-handover.md)

Keep `docs/` and `references/` intact. See `README.md` for a brief project overview.
