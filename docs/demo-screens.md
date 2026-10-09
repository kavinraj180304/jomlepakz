# Visual-only screen guide

All screens use typed fictional fixtures in `src/lib/demo/activities.ts` and `src/lib/demo/screens.ts`. No database, authentication, server actions, API routes, real message sending, or admin operations are connected. Form values and notification read previews stay in browser memory and reset on reload. No success message claims that anything was saved, sent, or published.

| Screen | Route | Reference |
| --- | --- | --- |
| Discover | `/` | Discover screenshot |
| Activity detail | `/activities/[id]` | Preview Activity, adapted to detail |
| Create activity | `/activities/create` | Three-step creation screenshots |
| Edit activity | `/activities/[id]/edit` | Reuses creation; dedicated edit reference missing |
| My Activities | `/my-activities` | My Activities screenshot |
| Saved Activities | `/saved-activities` | Saved Activities screenshot; linked from Profile |
| Profile | `/profile` | Profile screenshot |
| Edit Profile | `/profile/edit` | Profile fields; dedicated edit reference missing |
| Settings | `/settings` | Settings screenshots |
| Sign in | `/sign-in` | Missing; existing design system used |
| Sign up | `/sign-up` | Missing; existing design system used |
| Password reset | `/password-reset` | Missing; existing design system used |
| Notifications | `/notifications` | Notifications screenshot |
| Activity inbox | `/messages` | Messages screenshot, with activity rows only |
| Activity chat | `/messages/[id]` | Group Messaging screenshot |
| Basic admin | `/admin` | Missing; read-only overview and report fixtures |
| State previews | `/demo/states` | Empty/loading/error references missing |

Activity IDs: `badminton-tonight`, `lunch-buddies`, `library-study`, `weekend-food`. Chat exists for the first three only. Unknown IDs show a friendly not-found screen. Dynamic pages resolve route parameters inside Suspense boundaries to match this Next.js project's Partial Prefetching configuration.

The shared app chrome shows the logo/avatar header on Discover and the fixed five-item navigation on normal screens. Auth pages and admin use separate shells; chat has its own header/composer and no global bottom navigation, matching the group-chat reference.

## Behaviour to check manually

1. Use each bottom navigation destination, then open Profile from Discover. Open Saved Activities and Settings from Profile.
2. Create: complete title/date/time, advance, select location/capacity/description, then preview. Back preserves in-memory fields. Final action explicitly says nothing was published. Edit is prefilled and explicitly says nothing was updated.
3. My Activities: switch Upcoming/Hosting/Joined/Past; Past displays an empty state. Hosting exposes the edit preview.
4. Profile: inspect Full Name, Faculty, Course/Programme, Year, Bio, Interests, Saved Activities and Settings. Submit Edit Profile; it must not change the Profile fixture. Dark Mode is a disabled visual control.
5. Auth: use fictional inputs. Sign-in/sign-up/reset submissions must report that no sign-in, account creation, or email sending occurred.
6. Notifications: newest first, with subtle unread backgrounds. Mark All Read changes only the current demo preview; reload restores fixtures.
7. Inbox: only activity groups, no compose button. In chat, type a fictional draft and preview it; no new bubble should appear and the notice says nothing was sent.
8. Admin: change Overview/Reports tabs. No delete, ban, approve, or other real moderation control exists.
9. State previews: view Empty, Loading and Error; Try again returns to the empty preview. Actual route loading and error boundary files reuse the same states.
10. Check mobile widths, keyboard focus, labelled fields, native form validation, fixed navigation, and the chat composer with the keyboard open.

## Visual limitations

No dedicated references exist for true activity detail, edit forms, authentication, admin, empty/loading/error states, desktop layouts, or keyboard-open chat. Existing screenshot patterns are adapted for these. Profile avatars use a neutral fallback and stock activity photography differs from the references. User decisions override reference person-based inbox rows: this demo contains activity conversations only.
