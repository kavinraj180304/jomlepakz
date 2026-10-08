# JomLepakz visual handover

Source: all 14 screenshots in `references/base44/`. They show 12 distinct views; Filters and Settings each have two captures. Screenshots are visual inspiration only, not code or a complete behaviour specification. No prototype code was imported and no application code was changed.

**How to read this:** visible details are observations. Navigation described as “likely” is a suggested interpretation that needs confirmation. All captures are narrow, mobile-style layouts; **no desktop layouts are available for any screen**. Scrollbars alone do not establish a desktop design.

## Simple screen inventory

| View | Reference file(s) | Main entry / destination |
| --- | --- | --- |
| Discover | `discover page.png` | Discover bottom tab |
| Filters overlay | `Filters.png`, `Filters 2.png` | Discover filter button |
| Create Activity — step 1 | `Create Activity 1.png` | Central + button |
| Activity Details — step 2 | `Create Activity 2.png` | Step 1 Continue |
| Preview Activity — step 3 | `Preview Activity.png` | Step 2 Continue |
| My Activities | `My Activities.png` | My Activities bottom tab |
| Saved Activities | `Saved Activities.png` | Entry point not shown |
| Messages | `Messages.png` | Messages bottom tab |
| Group conversation | `Group Messaging.png` | Likely an activity conversation row |
| Notifications | `Notifications.png` | Notifications bottom tab |
| Profile | `Profile.png` | Entry point not shown |
| Settings | `Settings.png`, `Settings 2.png` | Entry point not shown |

## Screen notes

### Discover

- **Purpose / components:** browse activities; brand header, hamburger menu, search, filter button, date tabs, category chips, image cards, time/location, participant avatars, spots-left badges and bookmark buttons.
- **Navigation:** four labelled bottom destinations: Discover, My Activities, Notifications, Messages; central + likely opens creation. Cards likely open activity detail; hamburger destination is unseen.
- **Mobile layout:** one card column; horizontal tab/chip rows extend beyond the right edge; bottom navigation stays at the bottom of the capture.
- **State / reuse:** Upcoming and All selected; outline bookmarks. Reuse activity cards, chips, search field, badges, avatar stack and navigation bar.
- **Missing:** expanded menu, search results/no results, other tabs/categories, saved toggle result, card-detail destination and lower content.

### Filters overlay

- **Purpose / components:** narrow discovery results; close icon, Category, Date, Location and partially visible Availability sections; Reset and Apply buttons.
- **Navigation:** likely returns to Discover after Apply or close; the distinction between saving and discarding changes is unshown.
- **Mobile layout:** rounded sheet over a dimmed Discover page in `Filters 2.png`, scrollable body and bottom action row. `Filters.png` is a tighter capture of the same controls.
- **State / reuse:** All, Any date and Anywhere selected. Reuse sheet, selectable chips and paired actions.
- **Missing:** full Availability options, non-default selection, applied filter indicator/results, Reset result and dismissal behaviour.

### Create Activity — step 1

- **Purpose / components:** set basics; title field, 1-of-3 progress bar, six categories, date/time fields, duration options and Continue.
- **Navigation:** Continue likely opens step 2; bottom navigation remains visible. No back/cancel control is shown here.
- **Mobile layout:** stacked form; date and start time share a row; chips wrap; Continue sits above bottom navigation. The 4-hour option is partly hidden.
- **State / reuse:** blank title, Sports selected, 1 hr highlighted; Continue appears disabled. Reuse labelled inputs, chip selector, progress header and action footer.
- **Missing:** completed valid form, date/time picker, validation, enabled Continue, lower content and draft/discard behaviour when leaving.

### Activity Details — step 2

- **Purpose / components:** enter location, capacity and description; 2-of-3 progress, back arrow, UM location chips, custom-location field, max-participants field and Continue.
- **Navigation:** back likely returns to step 1; Continue likely opens Preview.
- **Mobile layout:** wrapping location chips and stacked fields in a scrolling form; description is cut off above the action footer.
- **State / reuse:** KK1 selected and entered, capacity 8, description filled; Continue appears enabled. Reuse form controls, chips and wizard footer.
- **Missing:** complete lower form, custom location, capacity limits/errors, description limits and preservation of entered values after Back.

### Preview Activity — step 3

- **Purpose / components:** review before publishing; 3-of-3 progress, helper text, card with blank image area, date/spots/bookmark badges, title, schedule, location, attendance and description; Back and Publish Activity.
- **Navigation:** Back likely returns to step 2; publish destination is unshown.
- **Mobile layout:** single preview column, paired actions above bottom navigation.
- **State / reuse:** 0 going, 8 spots, no photo; reuse activity card, metadata rows and wizard controls. Whether the preview bookmark is interactive is unclear.
- **Missing:** image selection or intended fallback, publishing/loading/error/success states and the newly published activity destination.

### My Activities

- **Purpose / components:** manage participation; Upcoming, Hosting, Joined and Past tabs; activity cards with Hosting badges, available spots and overflow menus.
- **Navigation:** bottom tabs; card likely opens detail; overflow actions are unseen.
- **Mobile layout:** vertically stacked large cards beneath tabs, with bottom navigation.
- **State / reuse:** Upcoming selected; visible cards labelled Hosting. Reuse activity cards, tab row, role badge and overflow button.
- **Missing:** Hosting/Joined/Past contents, empty lists, open overflow menu, edit/cancel/leave outcomes and completed/cancelled cards.

### Saved Activities

- **Purpose / components:** revisit bookmarked activities; back header, cards and filled blue bookmarks.
- **Navigation:** back destination and entry point unshown; cards likely open detail; bottom navigation is present.
- **Mobile layout:** one scrolling card column; second card is only partly visible.
- **State / reuse:** saved bookmark state; reuse activity card and back header.
- **Missing:** unsaving result, empty list, unavailable/past saved activities and the menu/link that opens this screen.

### Messages

- **Purpose / components:** browse conversations; avatar, group/person name, message preview, timestamp and unread count per row.
- **Navigation:** activity row likely opens Group conversation; person rows imply a direct conversation whose view is missing; bottom tabs are shown.
- **Mobile layout:** full-width stacked rows with timestamps/unread badges on the right.
- **State / reuse:** Badminton has 2 unread; Aiman has 1; Aiman's avatar is a placeholder. Reuse conversation row, avatar fallback and unread badge.
- **Missing:** empty inbox, direct conversation, updated/read row, conversation creation and loading/error states.

### Group conversation

- **Purpose / components:** activity coordination; back arrow, activity avatar/title, 6 participants, overflow menu, sender names, incoming/outgoing bubbles, timestamps, composer and send icon.
- **Navigation:** back likely opens Messages; participant header and overflow destinations are unknown.
- **Mobile layout:** header, conversation body and bottom composer; global bottom navigation is absent.
- **State / reuse:** incoming bubbles are pale; outgoing bubble is blue; empty composer and pale send button. Reuse chat header, bubbles and composer.
- **Missing:** keyboard-open layout, populated composer, sending/failed message, participant list, menu actions, long history and access after leaving/cancellation.

### Notifications

- **Purpose / components:** activity/message updates; Mark all as read, icon rows, relative times and unread blue dots. Examples include join, reminder, update, message, full activity and cancellation.
- **Navigation:** activity notices likely open detail; message notice likely opens a conversation; bottom tabs are shown. Actual links are unverified.
- **Mobile layout:** stacked full-width rows; long cancellation text wraps.
- **State / reuse:** first three rows appear unread; remaining rows have no dot. Reuse notification row, status dot and icon container.
- **Missing:** all-read result, empty list, individual read behaviour and destinations for full/cancelled activities.

### Profile

- **Purpose / components:** display identity; back/Edit header, partly cropped photo, name, university/student badge, faculty/course/year, bio, interest chips and hosted/joined counters.
- **Navigation:** Edit likely opens a profile form; back and entry point are unshown; bottom navigation is present.
- **Mobile layout:** centred identity, stacked sections, wrapping interests and two counters side by side; capture is scrolled/cropped at the top.
- **State / reuse:** populated profile, 3 hosted and 7 joined. Reuse identity header, badge, interest chips and statistic tile.
- **Missing:** top-of-page capture, Edit form/save/error, missing photo/bio, another user's profile and meaning/time range of counters.

### Settings

- **Purpose / components:** account, privacy and preferences; Profile Details, Email, Change Password, Privacy Settings; reminder/update/message toggles; Dark Mode; Help & Support, Send Feedback, Log Out and Delete Account.
- **Navigation:** chevron rows imply subpages/actions but none are captured; back destination is unknown; bottom navigation is present.
- **Mobile layout:** scrolling sectioned list with icon/label rows, right-aligned toggles/chevrons. Second capture shows lower sections.
- **State / reuse:** notification toggles appear on; Dark Mode appears off; account actions are red. Reuse settings row, section label, switch and destructive-action style.
- **Missing:** each linked subpage, toggle persistence/error, dark theme, support/feedback views, logout destination and delete confirmation/result.

## Contradictions and decisions to resolve

- **Attendance:** Badminton shows “4 going” and “2 spots left” on cards, but chat says 6 participants and a notification says it is full. These may be different moments or counting rules; define capacity, whether the host counts, and chat membership before implementation.
- **Activity data:** the similarly named Badminton preview uses 9:36 PM, 1 hr, KK1 and 8 free spots; existing cards use 8:00 PM, 90 mins, KK1 Badminton Court and 2 free spots. Treat these as separate sample states until their relationship is confirmed.
- **Categories:** Profile includes Networking, while discovery/creation/filter categories include Social and Events but no Networking. Confirm whether interests and activity categories intentionally differ.
- **Entry points:** hamburger contents are missing, leaving Profile, Settings and Saved Activities disconnected from the visible navigation.
- **Hidden controls:** Availability is unreadable in both filter captures; lower creation fields and the profile photo are cropped. Do not invent their contents.
- **Unspecified behaviour:** search mentions “activities or groups”, but no group-discovery view is shown. Creation has no visible photo field despite photo-based cards. Confirm scope and image handling.
- **Visual consistency:** active chips are blue, but settings switches use black. Confirm the intended shared style and disabled states; screenshot colours alone do not establish behaviour.

## References to add first

1. Activity detail with join/leave, host controls, full and cancelled states; publishing success destination.
2. Expanded hamburger menu; complete Filters including Availability; full creation form and image handling.
3. Validation/loading/error/empty states, plus populated search and all My Activities tabs.
4. Profile edit; settings subpages; dark mode; logout/delete confirmation; direct chat and keyboard-open group chat.
5. Desktop captures for each main destination, or an explicit decision that desktop layouts still need designing.

## Suggested implementation order (future work only)

1. Resolve navigation, participant counting, category and image decisions; collect the priority references above.
2. Define shared colours, spacing and typography; build navigation, headers, chips, buttons, inputs and activity cards.
3. Discover, Filters and activity detail/join/save flows, then Saved Activities.
4. Three-step creation with validation and publishing, then My Activities and host management.
5. Messages and conversations, then Notifications and their destinations.
6. Profile and Settings, followed by desktop layouts and remaining empty/error/accessibility states.
