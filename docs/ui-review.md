# JomLepakz UI review

Reviewed on 9 October 2026. This was a focused review of the existing static demo, with small usability fixes only.

## Reference basis

`docs/lovable-handover.md` and `references/lovable/` are absent. The review used the previously approved `docs/base44-handover.md` and `references/base44/` instead. Screenshots are visual inspiration; no prototype source was copied.

The references establish mobile card spacing, blue actions, rounded controls, a three-step creation flow and five-position bottom navigation. There are no desktop references. Activity detail, edit forms, authentication, admin and empty/loading/error states also lack dedicated reference captures.

## Width checks

Chrome was used with temporary viewport overrides. Desktop was tested at 1280px. All 17 routes below were rendered before their document width was measured: 68 checks in total.

| Width | Page overflow with demo data | Layout |
| --- | --- | --- |
| 375px | None | Single column; date/category rows scroll within the page |
| 390px | None | Single column; cards and form fields fit |
| 430px | None | Single column; bottom navigation labels fit |
| 1280px | None | Consumer screens centered at 512px maximum; admin at 1024px maximum |

Scrollbar space can reduce the usable width by 15px. Overflow was compared against the document's client width, not just the requested viewport width. Horizontal date/category scrolling is intentional.

Visual spot checks covered Discover, activity forms/preview, notifications, chat, loading states, admin and dialogs. All route checks covered geometry; they are not a pixel-perfect comparison of every screen.

## High-impact issues fixed

1. **Long activity text broke the preview width.** A 150-character unbroken location and 200-character unbroken description produced a document width of 1898px at a 375px viewport (360px usable width). Location now has a shrinking flex child and word wrapping; description wraps too. The same test now measures 360px with no page overflow.
2. **Small touch targets.** Shared back buttons were 28px, the Discover avatar/date tabs were 40px, and several tabs/chips/header actions were smaller than 44px. Shared back controls now measure 44 by 44px. Discover controls, My Activities/admin tabs, location chips, interest labels, filter checkbox rows, Profile Edit and Mark All Read now have at least 44px height. Detail's back link was also enlarged. Labels and overall structure remain unchanged.
3. **Desktop filter dialog was misplaced.** The fixed dialog appeared at the top-left rather than centered. Its desktop inset now allows automatic margins to center it. Verified at 1280 by 900px: width 512px, vertical position 290.625px with height 318.75px.
4. **Filter sheet needed a short-viewport limit.** Added a viewport-based maximum height and vertical scrolling. At 375 by 300px the sheet is 268px tall, starts at 32px and scrolls its 319px content.

## Other checks

- Cards retain their rounded 8:5 covers, bold titles and smaller schedule/location metadata. Main form text is 16px; date/time fields fit side by side.
- The prefilled edit wizard advances through all three steps and retains its values. Paired preview buttons fit at 375px. Native required-field validation remains in place.
- Bottom navigation retains Discover, My Activities, highlighted central Create, Notifications and Messages. Chat and authentication omit this bar as intended.
- Filters and Join preview dialogs fit on mobile. Escape closes Filters and returns focus to its trigger; Join preview closes through its Close button. Desktop Filters centers after the fix.
- Mark All Read changes only the demo read indicators and shows an explicit unsaved-preview notice.
- Chat's fixed input and send control fit on mobile. Submitting demo text shows “Nothing was sent” without adding a fake delivered message.
- My Activities → Past shows an empty state. `/demo/states` provides empty, loading skeleton and friendly error previews; Try again returns to the empty preview.

## Remaining differences and limits

- Original photographs and profile portraits are represented by stock images and avatar/initial fallbacks. Image crops, icon shapes and exact font metrics differ slightly.
- Headers generally align titles left; the Profile reference centers its title. Some chip sizes and line wrapping differ at each width. Small inline text links and state-preview buttons remain compact.
- Demo notices deliberately add vertical space and use explicit preview labels. The wizard footer's secondary button is slightly shorter than its primary button.
- **Existing scope difference:** Filters contains campus/availability controls; category/date controls stay on Discover. It does not reproduce the reference's full multi-section filter sheet. This was retained to avoid rebuilding the screen during this focused review.
- The approved header uses a profile button instead of the reference hamburger. Inbox contains activity conversations only, following the product decision; reference direct-message rows are omitted.
- Desktop remains a centered mobile-style layout. Its visual match cannot be assessed without desktop references.
- Real-phone keyboard behavior, iOS date/time pickers, safe-area behavior and actual slow-network transitions still need manual device checks. Loading/error previews were checked; no backend requests exist to test.

## Exact manual-check routes

Repeat at 375px, 390px, 430px and desktop, then check the forms/chat on a real phone.

| Screen | Route and action |
| --- | --- |
| Discover | `/` — scroll chips/cards, open Filters, search for a nonsense term to show the empty result |
| Activity detail | `/activities/badminton-tonight` — Join/Save preview dialogs; `/activities/library-study` — full activity button |
| Create | `/activities/create` — complete all three steps; scroll lower duration/description fields above the footer |
| Edit | `/activities/badminton-tonight/edit` — advance/back; try a long unbroken location and description |
| My Activities | `/my-activities` — Upcoming, Hosting, Joined and Past |
| Saved | `/saved-activities` — cards and back navigation |
| Profile | `/profile` — Edit, Saved Activities and Settings links |
| Edit Profile | `/profile/edit` — fields, interests and preview notice |
| Settings | `/settings` — rows and visual demo controls |
| Sign in | `/sign-in` — form, password-reset and sign-up links |
| Sign up | `/sign-up` — field validation and demo preview |
| Password reset | `/password-reset` — email field and demo preview |
| Notifications | `/notifications` — unread highlighting and Mark All Read |
| Inbox | `/messages` — activity rows and chat navigation |
| Chat | `/messages/badminton-tonight` — keyboard-open composer and unsent preview |
| Admin | `/admin` — Overview and Reports tabs |
| States | `/demo/states` — Empty, Loading, Error and Try again |

## Validation

- `npm run lint` — passed (exit 0).
- `npm run build` — passed (exit 0), including TypeScript and generation of 31 static pages.
- No dependencies, backend functionality or architecture changes were added.
