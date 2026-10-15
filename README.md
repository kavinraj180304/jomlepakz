# JomLepakz

JomLepakz helps Universiti Malaya (UM) students find people to do activities with through the core loop: **Post -> Discover -> Join -> Meet**.

## Current development status

The Next.js application includes Supabase-backed authentication, activity discovery and host/member operations, alongside public fictional demo screens. Live features require the Development database migrations and Auth configuration described in [setup](docs/setup.md). Local lint, tests and build checks do not verify a deployed database or hosted authentication. The planned initial beta is for 10-20 UM students.

- [Project scope](docs/scope.md)
- [Development progress](docs/progress.md)
- [Visual handover](docs/base44-handover.md)
- [Demo screen routes and checks](docs/demo-screens.md)
- [Reference screenshots](references/base44/)
- [Preview deployment guide and checklist](docs/deployment.md)

## Main stack

Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind CSS 4, ESLint 9, and Supabase with SSR cookie sessions, with Node.js and npm for development. Application routes and styles live in `src/app/`; static assets live in `public/`.

## Local setup

Use Node.js 22 or later and npm (the installed Supabase client requires Node 22+). For Preview parity, use Node 24.x locally and in Vercel. From the repository root:

```sh
npm ci
```

Create an ignored `.env.local` in the repository root using the required names below. Enter Development configuration privately; `.env.example` is a names-only reference. Follow [Supabase setup](docs/setup.md), then run `npm run dev` and open http://localhost:3000.

Required variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional analytics names: `NEXT_PUBLIC_ANALYTICS_ENABLED`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`. Leave analytics unconfigured/off for the initial Preview. These public variables must never contain private credentials.

To validate and optionally serve a production build locally:

```sh
npm run lint
npm test
npm run build
npm start
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`. `npm run build` creates a production-optimized artifact; it does not deploy to Production.

## Deployment environments

| Environment | Application | Supabase |
| --- | --- | --- |
| LOCAL | localhost, normally port 3000 | DEVELOPMENT |
| PREVIEW | Vercel non-production branch (`dev` for this preparation) | DEVELOPMENT |
| PRODUCTION | `main`, future launch only | Separate future PRODUCTION project |

Prepare and deploy only Preview at this stage. Configure Vercel variables in the Preview scope, use an explicit trusted HTTPS Preview origin, and complete the [redirect and deployment checklist](docs/deployment.md). Production remains unlaunched.
