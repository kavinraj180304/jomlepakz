# JomLepakz

JomLepakz helps Universiti Malaya (UM) students find people to do activities with through the core loop: **Post -> Discover -> Join -> Meet**.

## Current development status

The Next.js application foundation is scaffolded. Product features have not been implemented yet. The repository retains the V1 scope, development checklist, and Base44 screenshot handover. The planned initial beta is for 10-20 UM students.

- [Project scope](docs/scope.md)
- [Development progress](docs/progress.md)
- [Visual handover](docs/base44-handover.md)
- [Reference screenshots](references/base44/)

## Main stack

Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind CSS 4, and ESLint 9, with Node.js and npm for development. Application routes and styles live in `src/app/`; static assets live in `public/`. Backend, database, and authentication choices remain to be confirmed.

## Local setup

Use Node.js 20.9 or later and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. To check and run a production build:

```sh
npm run lint
npm run build
npm start
```

`.env.example` lists variable names only, without values or credentials. Currently it lists only `NODE_ENV`; service-specific names will be added when those services are chosen. It is a reference list, not a ready-to-use configuration file. Keep actual environment values in ignored local environment files.
