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

No environment values, Supabase account, or database are required for the starter app. `.env.example` currently contains the name `NODE_ENV` only; it is a reference list, not a ready-to-use environment file. Next.js sets `NODE_ENV` for its commands, so leave it unset for normal development.

When a feature actually requires configuration, document its variable names and keep real values in `.env.local`, which Git ignores. Never commit credentials. Database setup and migrations will be documented when Supabase integration is implemented; no Supabase installation is part of this setup.

## Finding your way around

- [Architecture and intended folders](architecture.md)
- [V1 scope](scope.md)
- [Development checklist](progress.md)
- [Visual handover](base44-handover.md)

Keep `docs/` and `references/` intact. See `README.md` for a brief project overview.
