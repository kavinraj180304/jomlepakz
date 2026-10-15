# JomLepakz deployment

This guide prepares a Vercel **PREVIEW** using **DEVELOPMENT Supabase**. It does not authorize a Production launch, database apply, or change to hosted settings.

## Environment separation

| Environment | Branch / origin | Supabase | Configuration location |
| --- | --- | --- | --- |
| LOCAL | Local checkout, `http://localhost:3000` | DEVELOPMENT | Ignored root `.env.local` |
| PREVIEW | Non-production branch; current preparation branch: `dev`; trusted HTTPS Vercel Preview origin | DEVELOPMENT | Vercel Preview scope, preferably branch-specific |
| PRODUCTION | `main`; future production domain | Separate future PRODUCTION project | Future Vercel Production scope |

Local and Preview share Development data and Auth settings; Preview operations can change that data. Production must have a separate Supabase project. Do not merge to `main`, promote a deployment, or run `vercel --prod` as part of Preview preparation. Check the Vercel Production Branch is `main`; repository inspection alone cannot confirm hosted settings. When connecting/importing a repository, ensure the first deployment also targets Preview; do not accept a default Production deployment.

## Vercel environment variable names

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Use the Development project's URL and publishable key for Preview. Configure the app origin as the exact trusted HTTPS Preview origin, with no path, query, fragment or credentials. It must match the origin used in the browser during Auth testing.

Optional, only for separately approved opt-in analytics:

- `NEXT_PUBLIC_ANALYTICS_ENABLED`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

Leave these optional variables unset for the initial Preview; analytics is off by default. See [demo data and analytics](demo-data-analytics.md). Do not add demo-seed, database QA, database passwords, Google provider secrets, or Supabase service-role credentials to the Vercel app. Google provider credentials belong in Google/Supabase configuration.

All listed variables are public configuration. Never put secrets in them. Keep values out of Git, documentation and chat. Let Next.js/Vercel manage `NODE_ENV`; a Preview still uses a production build.

Set the required names in **Preview**, with a `dev` branch override when appropriate. Rebuild/redeploy after changing configuration: browser-facing public variables are bundled at build time. Vercel environment changes apply to subsequent deployments. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

The application does not infer its origin from Vercel system variables or request headers. Prefer a stable branch Preview URL or a dedicated Preview domain, confirmed in Vercel before final Auth testing. Always test Auth from that canonical origin. If using a different deployment URL, explicitly configure that origin, add its redirects, and rebuild. Do not move a Preview artifact to Production with Development configuration baked in.

## Development Supabase redirects for Preview

Replace `<PREVIEW_HOST>` with the actual trusted Preview hostname; it is a placeholder, not a literal hostname. In **Development Supabase -> Authentication -> URL Configuration**, add these exact Redirect URLs:

```text
https://<PREVIEW_HOST>/auth/confirm
https://<PREVIEW_HOST>/auth/callback
https://<PREVIEW_HOST>/auth/recovery
https://<PREVIEW_HOST>/update-password
```

Retain LOCAL redirects for local testing:

```text
http://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/recovery
http://localhost:3000/update-password
```

Use exact host/path entries for this project. Add another explicit set only for another trusted Preview origin; remove obsolete entries. Supabase supports Preview wildcards, but they are unnecessary for this fixed-origin setup. Redirect targets must be allowed by [Supabase URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

### Site URL and email templates

Development Supabase has one shared Site URL. For the initial Preview test window, set it to the canonical Preview HTTPS origin, matching the Preview app origin. The token-hash Confirm signup and Reset Password templates in [setup](setup.md) use that Site URL, so both send users to Preview even when a request starts on localhost. Merely adding redirect URLs does not change those template destinations.

Use the existing `/auth/confirm` signup template and `/auth/recovery` recovery template for Preview. After testing, restore the LOCAL Site URL when resuming localhost email-flow testing, or coordinate a separate approved template change for simultaneous local/Preview email flows. Do not blindly append paths to the email template redirect target: this app supplies a complete callback path, not just an origin. Changing shared Auth settings affects all Development testers.

Google sign-in returns to the app's `/auth/callback`. Google's authorized redirect URI remains the **Development Supabase** callback shown in its Google provider settings (the Supabase `/auth/v1/callback` endpoint), not a Vercel app callback. Review the authorized JavaScript origins for the Preview origin if required by the existing Google client configuration; follow [Google setup](setup.md). Keep Confirm Email, the UM identity hook and eligibility checks enabled.

## Package scripts and build configuration

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js development server |
| `npm run lint` | ESLint; run separately from the build |
| `npm test` | Local Node test suite, including static SQL checks and mocked application tests |
| `npm run build` | Next.js production build, also used for Preview |
| `npm start` | Serve a built app locally; not a Vercel build command |
| `npm run test:qa` | Focused local membership/failure tests |
| `npm run test:db` | Separate live database integration QA; requires private Development QA configuration |
| `npm run test:e2e` | Separate Playwright QA; requires configured test environment |
| `npm run demo:seed` | Guarded local/disposable fixtures; never run as a Vercel build step |

Vercel settings:

- Framework preset: **Next.js**; root directory: repository root.
- Install command: `npm ci`; build command: `npm run build`.
- Output directory: leave the framework default; do not use a static export.
- Select **Node 24.x** in Vercel and use the same major locally for parity. The installed Supabase client requires Node 22+, stricter than Next.js's Node 20.9 minimum. Vercel supports [Node 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). No Node engine is pinned in `package.json`, so check the dashboard runtime explicitly.

`next.config.ts` enables `cacheComponents`, `partialPrefetching` and a Turbopack CSS rule using `@tailwindcss/turbopack`. There is no custom output directory or static-export setting. Keep the current Next.js server deployment: Auth route handlers, Server Actions and SSR cookie/Proxy handling require server support. No build configuration change is required for this documentation preparation; hosted compatibility still needs a successful Vercel Preview build.

## Preview deployment checklist

- [ ] Confirm the intended commit and `dev` (or another non-production branch); confirm Vercel's Production Branch is `main`.
- [ ] Ensure any repository import or deployment targets Preview. Do not launch or promote Production.
- [ ] Confirm all required Preview variables point to DEVELOPMENT Supabase and the chosen canonical Preview origin; leave analytics off.
- [ ] Confirm the Development database has the required migrations, grants, RPCs and UM Auth hook from [setup](setup.md) and [database](database.md). A successful app build does not apply migrations. Any database apply is a separate authorized Development task.
- [ ] Configure the exact Preview redirects, Site URL, email templates, email delivery and Google provider settings above; preserve LOCAL redirects.
- [ ] Run `npm run lint`, `npm test`, and `npm run build` locally. On PowerShell use `npm.cmd` if needed.
- [ ] Create a Preview deployment from the non-production branch. Verify its target, runtime and build logs privately, without sharing environment values.
- [ ] Open the canonical Preview origin. If deployment protection is enabled, ensure intended testers can access it and complete email/OAuth redirects.
- [ ] With controlled real Development accounts, verify sign-up/confirmation, sign-in, Google sign-in, password reset/update, sign-out and protected-route redirects.
- [ ] Verify discovery and authorized activity operations against Development, capacity/permission behavior, mobile layout and friendly failure states. Use [testing](testing.md) for separate live database/browser QA.
- [ ] Record the Preview URL and hosted smoke-test results privately; restore the Development Site URL if returning to LOCAL email testing.

Local lint/tests/build provide static and mocked validation. They do not establish live Supabase permissions/RLS/concurrency, email delivery, OAuth configuration, Vercel runtime behavior or Preview accessibility. Production remains a future, separately authorized deployment using its own Supabase project.

## Preparation validation (2026-10-15)

On branch `dev`, `npm.cmd run lint`, `npm.cmd test` (128 passed, zero failed or skipped), and `npm.cmd run build` all passed. The build compiled, completed TypeScript checks and generated 32 pages. `git diff --check` passed. This run used local Node 26.10.0, not the recommended Vercel Node 24.x; the Preview build still needs verification on its selected runtime. No deployment or hosted configuration change was performed, and no secret values were printed.
