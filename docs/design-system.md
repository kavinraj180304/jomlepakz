# Small JomLepakz design system

Source: `docs/base44-handover.md` and the Discover, Activity Details, Preview Activity, and Filters screenshots in `references/base44/`. Base44 was selected because the requested Lovable files were absent. No prototype source code was imported.

## Tokens

| Use | Value |
| --- | --- |
| Primary / primary text | `#2563eb` / white |
| Background / card | white |
| Main text | `#0f172a` |
| Secondary surface / text | `#f1f5f9` / `#475569` |
| Input surface | `#f8fafc` |
| Supporting text | `#64748b` |
| Borders | `#dce5f0` |
| Selected surface | `#eff6ff` |

Colours are close visual estimates, not values from the original source. Supporting text is slightly darker than the faintest screenshot text for readability. Only the reference light theme is implemented.

Use the existing Geist sans font consistently. The screenshots do not identify their font. Page headings are 24px (30px from 640px), section and activity headings 20px bold, body and inputs 16px, supporting text 14px, and card badges 12px bold.

Use Tailwind's existing 4px spacing scale: 8px for related text, 12px for control gaps, 16px for mobile page padding and card content separation, 24px for section spacing, and 32px between sections. Inputs have 16px corners; activity cover areas have 24px corners and an 8:5 ratio. Buttons and badges use pill corners.

Cards have a white body without an enclosing border or heavy shadow. The rounded cover contains day/capacity badges and an optional action. With no cover content, it uses a pale surface like the preview screenshot. Pass an image with an appropriate accessible description and `object-cover` styling through the `cover` prop when actual image assets exist.

Buttons have blue primary, pale secondary, and outlined styles. Default height is 48px; the large full-width action is 56px with a soft blue shadow. Inputs are 56px high with a pale fill, thin border, and 16px text. Both include focus and disabled states. Labels remain outside inputs.

Mobile is the baseline. The preview uses 24px horizontal padding at 640px and two columns at 768px, capped at 1024px. These desktop choices are practical defaults; no desktop reference was supplied.

## Components and preview

- `src/components/ui/button.tsx`: shadcn/ui Button, styled with the shared tokens.
- `src/components/ui/input.tsx`: shadcn/ui Input for the required input styling.
- `src/components/activities/activity-card.tsx`: a display-only shell accepting title, schedule, location, optional attendance/badges/description, and optional cover/action slots. It does not fetch data or implement saving/joining.
- `src/lib/utils.ts`: the CLI-generated class-merging utility.
- `src/app/page.tsx`: Discover at `/`, using typed static demo data, search, category/date controls, filters, and linked demo detail pages. Other destinations now have visual-only screens; see [the screen guide](demo-screens.md). Joining, saving, authentication, messaging, and admin operations remain disconnected.

Configured using the current [official shadcn/ui existing-project method](https://ui.shadcn.com/docs/installation/next): `npx shadcn@latest init`, with the Base UI Nova preset, followed by adding only Button and Input. `components.json` points to `src/app/globals.css` and the existing `@/` aliases. Use `npx shadcn@latest add <component>` only when another primitive is needed; adding a preset again can overwrite custom styling.

## Manual comparison

Run `npm run dev` and open `/`. Compare blue buttons and white/pale surfaces; heading weight and metadata colour; pill corners; search sizing; card cover proportions, badges, and text spacing; and the fixed five-item bottom navigation. Check keyboard focus, long text, and mobile widths. Stock demo photos differ from the references, and participant initials are illustrative. The filter sheet is limited to on-campus and available-spots filters; category and date controls stay on Discover. Desktop uses a centred mobile-width layout because no desktop reference was supplied.
