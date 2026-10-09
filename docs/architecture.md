# JomLepakz architecture

JomLepakz helps UM students Post -> Discover -> Join -> Meet. Keep the application small and follow the [V1 scope](scope.md). This document describes where code belongs as features are implemented; it does not add those features.

## What exists today

The generated project uses Next.js 16.4 App Router, React 19.3, TypeScript, Tailwind CSS 4, ESLint, and npm. `src/app/page.tsx` shows Discover using typed static demo data from `src/lib/demo/activities.ts`. `src/app/activities/[id]/page.tsx` renders demo activity details. `src/app/layout.tsx` supplies the root HTML, fonts, metadata, header, and bottom navigation; `src/app/globals.css` contains global styling. Static assets are in `public/`.

`next.config.ts` currently enables Cache Components and Partial Prefetching and configures the Tailwind Turbopack loader. `@/` imports point to `src/`, as defined in `tsconfig.json`.

Shared Button and Input components live in `src/components/ui/`, the ActivityCard lives in `src/components/activities/`, navigation lives in `src/components/navigation/`, and Discover controls live in `src/components/discovery/`. Search and filters operate only on demo data in browser memory. Other navigation destinations show a demo-only notice. See [the design system](design-system.md). There are no database clients, migrations, Server Actions, or API routes yet.

## Minimal intended structure

`src/app/`, `src/components/ui/`, `src/components/activities/`, `src/lib/`, `public/`, `docs/`, and `references/` exist today. Create other folders when their first real file is needed.

| Location | Responsibility |
| --- | --- |
| `src/app/` | URL pages, shared layouts, global styles, and route-specific server actions. |
| `src/components/ui/` | Small reusable controls such as buttons and form fields, once shared by screens. |
| `src/components/activities/` | Activity cards, activity forms, and other activity-specific UI. |
| `src/components/navigation/` | Shared header and navigation components. |
| `src/lib/validation/` | Shared input validation rules, such as activity field checks. |
| `src/lib/` | Small non-UI helpers, such as date formatting, when needed. |
| `src/lib/supabase/client.ts` | Future browser client factory; no implementation yet. |
| `src/lib/supabase/server.ts` | Future server client factory; no implementation yet. |
| `supabase/migrations/` | Future versioned SQL database changes, outside `src/`. |
| `public/` | Public images and other static files; never secrets. |
| `docs/` and `references/` | Product decisions, setup instructions, and visual references. |

## Pages and layouts

A `page.tsx` exposes a screen at its folder's URL: `src/app/page.tsx` serves `/`. When activity browsing is implemented, `src/app/activities/page.tsx` could serve `/activities`, and `src/app/activities/[id]/page.tsx` could serve an individual activity. These are placement examples, not existing routes or a committed route plan.

Keep `src/app/layout.tsx` as the common wrapper. Add a nested `layout.tsx` only when several related pages need the same wrapper. Put shared navigation in a component and render it from the appropriate layout.

Pages and layouts are Server Components by default. Add `"use client"` to the small components that require browser state or event handlers, such as interactive filters. A component used by only one page can stay alongside that page; move it into `src/components/` when it is reused.

## Validation, utilities, and writes

Start with ordinary TypeScript functions. Keep one-off helpers near their caller; move shared rules to `src/lib/validation/` and shared utilities to `src/lib/`. No validation library or generic service/repository layer is needed now.

When a form needs to save data, a nearby `actions.ts` with `"use server"` can hold its Server Action. For example, an activity creation action would live beside the activity creation page. Validate input and check the user's permission on the server for every write; browser validation is only feedback. Read data in Server Components where practical. Add a Route Handler (`route.ts`) only for a real HTTP endpoint requirement, such as an external webhook.

## Future Supabase boundary

When Supabase integration is authorized, use separate browser and server client factories. Browser code imports `client.ts`; Server Components and Server Actions import `server.ts`, which creates a client for the current request and handles its cookie context. Keep server-only code out of browser imports. Public client configuration is distinct from privileged secret keys; privileged keys must never reach the browser.

Document database schema and permission changes as ordered SQL files under `supabase/migrations/`. Review and version those files with the code. No Supabase packages, authentication flow, database schema, or migration commands are introduced now. Revisit the official server-side guidance before implementing cookie/session handling.

## Official references

- [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Server Actions](https://nextjs.org/docs/app/api-reference/directives/use-server)
- [Supabase browser and server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
