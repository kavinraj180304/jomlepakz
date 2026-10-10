# JomLepakz V1 database design

Design proposal, reviewed against the checkout on 10 October 2026. This document contains no SQL and does not create tables, migrations, policies, or database changes.

## Basis and boundaries

- [Scope](scope.md): verified UM students, Post -> Discover -> Join -> Meet, a 10-20 student beta, activity chat, in-app notifications, private feedback, and basic moderation.
- [Architecture](architecture.md): Next.js App Router with a future Supabase/PostgreSQL boundary. Its statements that database clients and Supabase packages do not exist are now stale: the checkout has `src/lib/supabase/` factories and dependencies. This inspection does not establish any live schema or deployed permissions.
- `src/lib/demo/activities.ts` and `src/lib/demo/screens.ts`: typed fictional activities, categories, profiles, saved/joined collections, notifications, conversations, and reports.
- Activity/profile forms and activity details, collections, chat, settings, auth, and admin components: current screens are still demo previews. Their display strings, initials, counts, and public demo admin route are not production authorization rules.
- Local Next.js `node_modules/next/dist/docs/01-app/02-guides/data-security.md`: validate permissions at the data boundary and return only necessary fields to the browser. No application code is changed here.

The twelve tables below are the minimum proposed application schema. Supabase Auth owns credentials and email verification; no password, token, email copy, generic conversations table, public user rating, or direct-message table is added.

## Shared conventions and security boundary

- UUID identifiers; database-generated identifiers for ordinary records. Relationship tables use composite primary keys. Required fields are non-null unless explicitly marked optional.
- Timestamps are timezone-aware instants, stored consistently in UTC. Display dates and interpret form input in `Asia/Kuala_Lumpur`; store actual `starts_at` and `ends_at`, not strings such as "Today" or "1 hr".
- `created_at` and `updated_at`, where listed, are database-controlled. Actors, ownership, verification, state transitions, and audit timestamps come from authenticated context or trusted operations, never arbitrary submitted fields.
- Enable row-level security (RLS) on every exposed table, deny anonymous application data access, and restrict grants as well as rows. An owner-only row policy does not prevent an owner from changing privileged columns. Use column restrictions and narrowly scoped operations with explicit field allowlists.
- Ordinary data access requires a verified identity linked to an `active` profile. A suspended/deleted account cannot continue using application data merely because an old token remains valid. Minimal access to one's own account-state notice may be returned separately.
- Every admin operation additionally checks a current `active` admin membership. Use live database state for revocation, not user-editable metadata or a stale token role. Privileged keys stay on the server. Restricted database operations must validate their actor too, use a fixed safe search path if privileged, and expose no arbitrary actor/target/state update interface.
- No table has unrestricted user hard-delete access. Rows with safety/history value are retained or anonymized under a controlled retention process. RLS and restricted projections apply to nested reads, counts, exports, notifications, realtime subscriptions, and search as well as normal pages.
- Foreign keys are restrictive by default. Listed cascades are only for controlled physical purges, never a way for a user to erase evidence. Primary/unique keys provide their own indexes; additional indexes below support reverse lookups and common reads.

## Proposed tables

### 1. `profiles`

- **Primary key:** `id`, generated UUID, stable even after account anonymization.
- **Foreign key:** optional, unique `auth_user_id` -> `auth.users.id`; only the trusted signup/linking operation sets it. On physical Auth deletion, set this link to null after the account-deletion workflow has marked the profile deleted. Application identities reference `profiles.id`, not an email. Resolve the caller by matching authenticated UID to `auth_user_id`; a caller cannot claim another profile ID.
- **Fields:** `full_name` (1-100 trimmed characters), `faculty` and `programme` (1-150); these three can be null during onboarding/anonymization but are required for an active profile. Optional `study_year` (integer 1-6), optional `bio` (up to 500), `interests` (unique values from a bounded allowlist), `profile_visibility`, `account_status`, optional `verified_at`, `created_at`, `updated_at`, optional `deleted_at`.
- **Statuses/constraints:** `account_status`: `pending_verification`, `active`, `suspended`, `deleted`; `profile_visibility`: `students`, `activity_members`. Active status requires a linked, trusted UM-verified identity and a completed basic profile. Deleted profiles have no usable Auth link or identifying profile text. Faculty/programme are self-described, not verified academic claims.
- **Ownership/read access:** the student owns profile content. Other eligible students receive a restricted projection respecting visibility and either-direction blocking. Minimal host/participant identity is visible to eligible fellow activity members; academic details and bio respect privacy. Account/verification fields and the Auth link are excluded from other students' projections. No email is exposed.
- **User changes:** own name, faculty, programme, year, bio, interests, visibility; limited onboarding while pending verification. An account deletion request is an operation, not direct status editing.
- **Server/database controls:** identity/link, verification, account status, deletion, timestamps; no `is_admin` or editable role field. Notification preferences and dark mode are demo-only and not required stored fields for this schema.
- **Indexes/deletion:** unique index on `auth_user_id`; `(account_status, created_at)` for moderation. Keep a scrubbed profile tombstone for historical FKs; do not cascade a profile deletion into hosted activities, reports, or audit records. Physical removal is restricted until referenced history has been processed. Enforce the active-profile link constraint in the database so direct Auth deletion cannot leave an active unlinked profile. Mark deleted, scrub and unlink together during controlled deactivation before physically deleting Auth credentials.

### 2. `categories`

- **Primary key:** `id`, UUID. **Foreign keys:** none.
- **Fields/constraints:** unique lowercase `slug`, unique `name` (1-50), `sort_order` (nonnegative integer), `is_active`, `created_at`, `updated_at`.
- **Status:** active/inactive through `is_active`; inactive categories remain readable on historical activities but cannot be selected for a new activity.
- **Ownership:** platform-owned; students read active category choices.
- **User changes:** none. **Server/database controls:** trusted maintenance controls all category fields and timestamps.
- **Indexes/deletion:** unique slug/name; `(is_active, sort_order)` for selectors. Restrict deletion while referenced; deactivate instead.
- **Approved activity category set (10 October 2026):** Sports, Study, Food, Gaming, Events, Fitness, Outdoor, Volunteering, Networking, Hobby, Entertainment, Other. Stable lowercase slugs, deterministic fresh-seed UUIDs and active flags are recorded in `supabase/seed.sql` and `src/lib/config/activity-categories.ts`. Development seeds upsert by slug and preserve existing IDs. "All" is a filter, not a category. Profile interests retain their separate existing allowlist; activity categories do not change that constraint.

### 3. `activities`

- **Primary key:** `id`, UUID.
- **Foreign keys:** `host_id` -> `profiles.id`; `category_id` -> `categories.id`.
- **Fields:** `title` (1-100), `description` (1-1000), `location_text` (1-150), `on_campus` boolean, `starts_at`, `ends_at`, `capacity` integer, `join_mode`, `status`, `visibility_status`, optional `cover_asset_path` and `cover_alt`, optional `cancelled_at` and `completed_at`, `revision`, `created_at`, `updated_at`.
- **Statuses/constraints:** `status`: `scheduled`, `cancelled`, `completed`; `visibility_status`: `visible`, `hidden`; `join_mode`: `instant`, `approval`. `ends_at > starts_at`; proposed capacity 2-50 **including the host**, matching the form hint. Creation requires a future start, active verified host and active category. Cover assets, if allowed, must be approved paths, never unrestricted remote URLs. `revision` increases with material edits.
- **Ownership/read access:** one immutable host, derived by resolving the authenticated creator. Active verified students discover visible, scheduled activities subject to blocking; members can see permitted history. Hidden activities are unavailable to students; authorized admins can inspect them. No V1 host transfer.
- **User changes:** host submits edits to title, description, category, location, on-campus flag, schedule, capacity, and approved cover metadata before start. Capacity may increase or decrease only above occupied seats. Join mode is fixed after creation in V1. Host can request cancellation before completion and completion after `ends_at`; cannot directly assign statuses/timestamps. Material changes notify joined members and pending applicants.
- **Server/database controls:** ID, host, state transitions, moderation visibility, revision, timestamps, occupancy calculation. No stored `full` status or client-editable participant count. A time-derived "in progress" label is not a separate state.
- **Indexes/deletion:** `(status, visibility_status, starts_at, id)` for feed; `(category_id, status, starts_at)` for filtering; `(host_id, starts_at)` for Hosting. At beta scale, bounded title/description search needs no separate search index initially. Cancel/hide instead of deleting. Controlled purge is restricted while reports or moderation actions refer to the activity; afterward dependent operational rows can cascade as specified below.

### 4. `activity_participants`

- **Primary key:** `(activity_id, user_id)`, one reusable relationship row per student/activity.
- **Foreign keys:** `activity_id` -> `activities.id`; `user_id` -> `profiles.id`; optional `decided_by` -> `profiles.id`.
- **Fields:** `status`, `requested_at`, optional `joined_at`, `status_changed_at`, optional `decided_at`, optional `decided_by`, optional `last_read_at`, `created_at`, `updated_at`.
- **Statuses/constraints:** `pending`, `joined`, `declined`, `left`, `removed`. The host has **no participant row**; hosting already grants membership and consumes one seat. Only `joined` consumes an additional seat. Pending requests reserve no seats. Joined state requires `joined_at`; host decisions require trusted decision actor/time. Rejoin can reuse a `left` row; no self-rejoin from `removed` or `declined` in V1. No attendance/no-show claim is inferred from membership.
- **Ownership/read access:** student owns their relationship; host can review requests and manage non-host members. Other members receive only eligible joined-member projections, never rejected/pending applicant lists. Pending users see their own request, not chat or its roster. Admin access is limited to safety work.
- **User changes:** student requests join/withdraw/leave and advances own read cursor to a server-validated time; host requests approve/decline/remove. No direct insert/update of status, actor, or joined time. Read cursors only advance and cannot exceed server time.
- **Server/database controls:** IDs from operation context, all state transitions, seat admission, decision provenance, timestamps. Rejoining sets a fresh read cursor so old unread counts are not fabricated; chat history visibility follows the policy below.
- **Indexes/deletion:** `(user_id, status, activity_id)` for My Activities; `(activity_id, status)` for roster/admission/requests. Controlled activity purge cascades; profile deletion retains the historical relationship against the tombstone. Live removal/leave preserves the row and immediately ends chat access. Terminal activities freeze participation history; account deletion does not rewrite completed membership.

### 5. `saved_activities`

- **Primary key:** `(user_id, activity_id)`.
- **Foreign keys:** `user_id` -> `profiles.id`; `activity_id` -> `activities.id`.
- **Fields:** `created_at`. **Status:** present = saved, absent = unsaved; no participation status.
- **Constraints/ownership:** duplicate saves are impossible; only the owner reads their bookmark list. Save requires current activity visibility; a stored bookmark never bypasses later visibility/block restrictions.
- **User changes:** save/unsave only for self. **Server/database controls:** owner from authentication, creation time. Neither operation touches participant rows, seats, chat access, or host permissions.
- **Indexes/deletion:** `(user_id, created_at, activity_id)` for ordered saves; `(activity_id)` for reverse lookup/purge. Cascade on controlled profile or activity purge; delete the owner's bookmarks during account anonymization.

### 6. `messages`

- **Primary key:** `id`, UUID.
- **Foreign keys:** `activity_id` -> `activities.id` (required); `sender_id` -> `profiles.id`.
- **Fields:** `body` (1-500 trimmed characters), `visibility_status`, `created_at`, optional `removed_at`. No direct-message recipient.
- **Statuses/constraints:** `visible`, `removed`. Sending requires an active verified caller who is the host or a currently `joined` member of a visible scheduled activity before `ends_at`. No messages from pending/saved/left/removed users. Completed/cancelled chats are read-only for the preserved host/joined membership.
- **Ownership/read access:** author owns authorship, activity owns conversation context. Eligible members may read the activity history, including earlier messages; either-direction blocked senders are filtered from body, previews, and unread counts. Removed content is excluded from student results, with an optional generic placeholder. Only safety-authorized admins retrieve retained removed bodies.
- **User changes:** submit body on creation. Proposed V1 messages are immutable to students; no edit or erase operation. **Server/database controls:** activity membership checks, sender from authentication, time, visibility/removal, IDs. Moderation removes visibility, not evidence immediately.
- **Indexes/deletion:** `(activity_id, created_at, id)` for stable chat pagination/read cursors; `(sender_id)` for safety/deletion lookup. Profile anonymization changes displayed identity to "Deleted user" and scrubs identifying body text where required by retention review. Report-linked messages cannot be physically purged until evidence processing permits it; controlled activity purge otherwise cascades.

### 7. `notifications`

- **Primary key:** `id`, UUID.
- **Foreign keys:** `recipient_id` -> `profiles.id`; optional `activity_id` -> `activities.id`; optional `message_id` -> `messages.id`.
- **Fields:** `kind`, safe `summary` (1-300), `event_key`, `created_at`, optional `read_at`.
- **Kinds/status:** `join_requested`, `participant_joined`, `join_approved`, `join_declined`, `participant_removed`, `activity_updated`, `activity_cancelled`, `activity_completed`, `message`, `reminder`, `activity_full`. Unread/read derives from `read_at`, not a second boolean.
- **Constraints/ownership:** private to recipient. Unique `(recipient_id, event_key)` deduplicates one recipient/event; event key is generated from the committed operation, not chosen by the browser. Message reference, if supplied, must belong to the referenced activity. Kind determines required links. Full is an event/derived condition, never stored activity state.
- **User changes:** own mark-read operation only. **Server/database controls:** recipient selection, all content/links/kinds, event key, timestamps. Mark-read records server time; other fields remain immutable.
- **Indexes/deletion:** `(recipient_id, created_at, id)` plus partial unread index on recipient/time; `(activity_id)` and `(message_id)` for cleanup. Cascade on controlled recipient purge; remove own notifications on anonymization. Activity/message purge nulls links and scrubs summaries as necessary. Summaries contain no message bodies, reporter identities, feedback, or private report details; reads recheck current access and blocking even for older notifications.

### 8. `reports`

- **Primary key:** `id`, UUID.
- **Foreign keys:** `reporter_id` -> `profiles.id`; optional `target_user_id` -> `profiles.id`, `target_activity_id` -> `activities.id`, `target_message_id` -> `messages.id`; optional `reviewed_by` -> `profiles.id`.
- **Fields:** `target_type`, `reason_code`, optional `details` (up to 2000), restricted `evidence_snapshot`, `status`, optional `reviewer_notes`, `created_at`, optional `reviewed_at`.
- **Statuses/constraints:** `status`: `pending`, `in_review`, `resolved`, `dismissed`; target type `user`, `activity`, `message`, with exactly the corresponding single target FK populated. Proposed reasons: `harassment`, `unsafe_activity`, `spam`, `inappropriate_content`, `other`. Other requires details. Relevant conduct can be described against a user/activity/message; no generic unvalidated target ID. Server checks legitimate current access or retained participation context for reporting, without forcing contact with a blocked user. Message reports derive their activity from the message.
- **Ownership/read access:** reporter submits; safety admins review. Reporter receives only own submitted fields and coarse review status. No student, including the reported user or activity host, can read reporter identity, evidence snapshot, reviewer notes, queue counts, or underlying report rows belonging to others. Enforcement notices use separate redacted outputs.
- **User changes:** target/reason/details at submission only; immutable afterward. **Server/database controls:** reporter, validated target, narrowly captured evidence/context, status, reviewer identity/notes, timestamps. Restrict reviewer access and prevent self-review when the reviewer is reporter or target; use an operator escalation if no independent admin is available.
- **Indexes/deletion:** `(status, created_at)` for review queue; `(reporter_id, created_at)` for own reports; each target FK and `reviewed_by` for context. No student delete. FKs restrict target physical deletion until controlled retention/anonymization review; reporter deletion retains a tombstone, with sensitive evidence scrubbed when allowed. Reports must remain nonpublic after target deletion.

### 9. `blocked_users`

- **Primary key:** `(blocker_id, blocked_id)`.
- **Foreign keys:** both -> `profiles.id`.
- **Fields:** `created_at`. **Status:** row present = blocked; absent = unblocked.
- **Constraints/ownership:** no self-block; blocker must be the authenticated caller. Only blocker reads their list. Either-direction existence is used internally to enforce restrictions without revealing who blocked whom.
- **User changes:** add/remove own block via restricted operations. **Server/database controls:** caller identity, timestamp, consequences for shared activities, privacy checks. Generic unavailable/not-eligible outcomes avoid revealing a block.
- **Indexes/deletion:** composite PK supports outgoing checks; `(blocked_id, blocker_id)` supports reverse checks. Keep blocks against anonymized tombstones as long as related history remains; cascade only on controlled physical profile purge.
- **Proposed behavior:** hide blocked profiles/hosted discovery listings; reject joins into a roster containing either-direction blocks with host or joined peers; hide each other's chat content. If blocking occurs after joining, leave/remove the blocking student from each shared future scheduled activity when both are non-host participants. If blocker is host, remove the other member; if blocked user is host, blocker leaves. Decline affected pending requests. Do not expose block reasons in notifications. Completed/cancelled roster history stays intact with content filtered. Unblocking never auto-rejoins anyone.

### 10. `admin_memberships`

- **Primary key/foreign key:** `user_id` -> `profiles.id`, one membership per profile. Optional `granted_by` and `revoked_by` -> `profiles.id`.
- **Fields:** `status`, `granted_at`, optional `granted_by`, optional `revoked_at`, optional `revoked_by`.
- **Statuses/constraints:** `active`, `revoked`; an effective admin also requires an active verified profile. Revoked membership requires revocation time. First bootstrap grant can have no student actor only through an explicitly recorded trusted operator procedure.
- **Ownership/read access:** platform-owned authority, not student profile content. Ordinary students cannot list memberships; a restricted self-capability check can expose whether admin tools are available. Authority checks avoid recursive membership RLS designs.
- **User changes:** none, including for an ordinary moderator. Grant/revoke is restricted to a separate trusted operator, never self-service and never inferred from submitted form data or user metadata. V1 has one moderation capability, not an editable role hierarchy.
- **Server/database controls:** all fields, grant/revoke provenance, timestamps; every change records a moderation/audit action in the same transaction. Reactivation refreshes grant provenance; audit history preserves previous cycles.
- **Indexes/deletion:** PK suffices for permission checks; index `granted_by` and `revoked_by` for audit lookup. No self-delete. Account suspension/deletion disables effective privilege immediately and revokes membership during deletion. Retain membership/audit provenance against profile tombstones; restrict physical profile purge until reviewed.

### 11. `moderation_actions`

- **Primary key:** `id`, UUID.
- **Foreign keys:** optional `actor_id` -> `profiles.id`, optional `report_id` -> `reports.id`; exactly one of `target_user_id` -> `profiles.id`, `target_activity_id` -> `activities.id`, `target_message_id` -> `messages.id`.
- **Fields:** `actor_kind` (`admin`, `operator`, `system`), optional `operator_reference` (trusted operator/job audit identifier, required when no profile actor exists), `action_type`, `reason` (1-1000), restricted minimal `before_state` and `after_state`, `created_at`.
- **Actions/status:** `suspend_user`, `restore_user`, `hide_activity`, `restore_activity`, `cancel_activity`, `remove_message`, `restore_message`, `grant_admin`, `revoke_admin`. Immutable committed event, not a mutable workflow status. Failed actions do not create successful audit rows.
- **Constraints/ownership:** platform-owned append-only audit. Admin actor is required for admin-origin actions and checked at execution; operator/system actions require trusted provenance. Action type must match its target. Only the operator can grant/revoke admin. When linked to a report, validate that the action target is the reported object or its derived responsible user/activity, not an unrelated record.
- **User changes:** none. **Server/database controls:** every field; mutation of the target and audit insert are atomic. Retain actor identity at the time of action even after later revocation. Avoid embedding reporter identity in action text or state snapshots.
- **Read access/indexes/deletion:** safety admins only, with redacted enforcement notices for affected users. Index `(report_id, created_at)`, `(actor_id, created_at)`, and each target/time. Restrict referenced target/report/actor purge while audit is retained. No normal update/delete; trusted retention purge only. Restoring content must recheck account/activity safety and access rather than blindly replaying an old state.

### 12. `activity_feedback`

- **Primary key:** `(activity_id, author_id)`.
- **Foreign keys:** `activity_id` -> `activities.id`; `author_id` -> `profiles.id`.
- **Fields:** `body` (1-1000 trimmed characters), `created_at`. **Status:** submitted; no review workflow or public rating value.
- **Constraints/ownership:** one private submission per author/activity after `status = completed` and `ends_at` has passed. Author must be the host or a participant whose preserved membership is `joined` at completion. This is activity feedback, not proof of physical attendance or a rating of a target student.
- **User changes:** own text on initial submission only; proposed V1 feedback is immutable. **Server/database controls:** author from authentication, eligibility, uniqueness, timestamps. No host-selected feedback visibility, score, rated user, or public aggregate.
- **Read access:** author reads own submission; safety-authorized admins read private feedback for beta/product/safety review. Hosts cannot read other participants' feedback. Safety concerns needing action should also be filed through reports; feedback does not silently create a report.
- **Indexes/deletion:** `(author_id, created_at)` for own submissions; `(created_at, activity_id)` for restricted beta review. Restrict physical activity purge until feedback retention review; author tombstone preserves relational integrity while identifying text can be anonymized. No student delete or cascade that erases safety evidence without review.

## Capacity, lifecycle, and concurrency

### Seat invariant

For a scheduled activity, occupied seats = **1 host + number of `joined` participant rows**. Available seats = capacity minus occupied seats. Pending, declined, left, removed, bookmarks, and notification counts consume zero seats. Do not store a redundant host participant row or authoritative cached count. Counts shown to the browser are informational snapshots; only the database admission operation decides.

### Atomic admission

1. Verify the caller's authentication, current active UM profile, and operation authority. Derive host/requester identity from that context. A host approving an applicant may name the applicant as a target; this does not authorize impersonating that applicant.
2. Start one database transaction. Acquire the shared V1 mutation gate described below, then lock the target activity row for update. All joins, approvals, leaves, removals, host edits, cancellation, and completion follow the same locking contract.
3. After obtaining the lock, reread current activity state/schedule/mode, caller and applicant status, current participant row, and either-direction blocks against host and joined roster. Reject joins at or after start, into hidden/cancelled/completed activities, or from the host. Count actual joined rows under this lock.
4. Instant join admits only if occupied seats are below capacity. Approval-mode request creates `pending` only if the activity is eligible and currently has a seat; it reserves none. Approval rechecks everything and claims a seat atomically. A previously pending request may fail approval because another applicant filled the last seat; leave it pending and return a clear capacity outcome. No waitlist/automatic approval in V1.
5. Write the relationship transition and essential event notifications in the same transaction; commit once. Duplicate join/request/approval returns the existing state without another seat or notification. On rollback neither membership nor notifications persist. `(activity_id, user_id)` uniqueness is an additional duplicate guard, not the capacity control.

Two requests for the last seat queue on the same activity row. The first commits; the second sees the updated joined count and fails admission. Approval versus instant join, capacity reduction versus approval, and cancellation versus join are serialized by the same lock. Capacity reduction below current occupancy fails, even if the form showed an earlier count. A cross-row seat invariant cannot be protected by a simple row check or a client-side count.

PostgreSQL row locks are held until transaction end; this design uses that guarantee. Future implementation must use a single database transaction/operation, not several browser or server REST calls that each commit separately. See [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

### Blocking and account-change races

At this small beta scale, use **one transaction-scoped database advisory mutation gate** for all application writes that depend on live safety/membership authority: admission, participant transitions, activity edits/lifecycle, blocks/unblocks, suspension/deletion, admin grants/revocations, moderation, messages, bookmarks, feedback, and event generation. Acquire gate first, then affected activity rows in stable ID order. Keep transactions short; do not perform uploads, network calls, or user interaction while holding locks.

The global gate deliberately serializes these writes for 10-20 users. It prevents a block or suspension from racing with a join/message based on stale checks, and lets a multi-activity block clean up shared membership atomically. Merely scanning current shared activities during blocking would miss a concurrent new join without this coordination. All trusted jobs/operator operations must follow the same contract; ordinary direct table mutations are denied. This gate is a proposed correctness mechanism, not an extra application table. Revisit finer-grained locking only if measured beta throughput requires it.

After acquiring the gate/row locks, recheck authority and state; don't authorize once before waiting and then assume it still holds. Read policies still independently check current state. Content already delivered to another user's browser cannot be recalled by blocking. New reads/events/subscriptions must respect changed access.

### Lifecycle and retry rules

- Participant transitions: first instant admission creates `joined`; approval requests create `pending`; host approval/decline moves `pending` to `joined`/`declined`; self-withdrawal moves `pending` to `left`; self-leave moves `joined` to `left`; host/safety removal moves `joined` to `removed`. Eligible `left` users can start a fresh request/admission, resetting prior decision fields and setting a fresh joined timestamp if admitted. No user-controlled revival of `declined`/`removed`; repeat operations never revive a terminal activity. Terminal lifecycle closes `pending` to `declined` without falsely recording a host decision; the activity state explains closure.
- `scheduled -> cancelled` by authorized host/admin; `scheduled -> completed` by authorized host or trusted completion job only after end time. No reopening in V1. Completing freezes roster eligibility for private feedback. Hidden is an independent moderation state, not a way to add seats or reopen membership.
- After start, prevent new admission and ordinary host edits/removals/leaves; allow safety blocking/removal and cancellation until completion. Cancellation declines pending requests; completed transition also closes pending requests. Keep joined rows as historical participation rather than overwriting them with "cancelled"; the activity supplies that status.
- Suspended hosts' future activities are hidden/cancelled through a safety operation; suspended participants in future scheduled activities are removed. Past roster history remains. Account deletion cancels future hosted activities, withdraws pending/active future participation, revokes admin, clears private conveniences, anonymizes profile, and then unlinks/removes Auth access. Restoring an account does not auto-rejoin, unhide, or uncancel activities.
- Retries use existing relationship state, activity revision, and server-generated event keys to avoid duplicate effects. Host edits submit the revision last read; reject stale edits rather than silently overwriting another edit. A timed-out response should be reconciled by reading state before retrying a non-idempotent operation.
- Message creation may use its record ID as event identity; duplicate transport submissions need a caller-scoped idempotency key if automatic retries are introduced. Without one, never automatically retry an ambiguous send. Reminder jobs use activity ID/revision/reminder slot for deduplication and recheck current schedule/eligibility.
- Chat previews and unread message counts derive from messages permitted to the reader after `last_read_at`. The host's read cursor can use message-notification read state in V1; do not fabricate a host participant row merely for this. Exact parity between host and participant conversation-level unread behavior remains a UI decision below.

## Important decisions

1. The host is authenticated, immutable, and counts as one seat; only non-host admitted members occupy participant rows.
2. Saves, pending requests, admitted membership, and lifecycle are distinct. "Full", "going", hosted/joined totals, date labels, sender names, and unread counts are derived display values.
3. Account state and admin authority are separate from user-editable profile content. Admin onboarding/revocation belongs to a trusted operator with audit records.
4. Messages always reference an activity. Pending or bookmarked activity relationships grant no conversation access.
5. Reports have explicit typed targets and private evidence. Reporter identity is never included in reported-user/host responses or enforcement notices.
6. Feedback is private completed-activity text, available to its author and authorized review staff; no public score, user-rating target, or host access to participants' feedback.
7. Preserve historical references with anonymized profile tombstones. Cancel/hide/remove are operational actions; physical purge is a separate reviewed process.
8. Capacity and safety-dependent writes are admitted through transactional database operations; neither RLS alone nor form validation proves these invariants.

## Unresolved decisions before implementation

These are product/security choices, not authorization to implement. Proposed defaults above remain provisional where listed.

| Decision | Proposed V1 default / question to settle |
| --- | --- |
| UM verification | Confirm accepted domains, student eligibility proof, verification expiry and trusted approval process. Email confirmation alone must not be assumed to prove UM enrollment. |
| Capacity | Confirm host-inclusive 2-50 limit. The form supports it, but fixture initials and older reference counts are not proof of a consistent roster. |
| Blocking in shared groups | Confirm automatic removal of the blocker (or the other member when blocker is host), blocking against all joined peers, and history filtering. Users need understandable consequences without revealing another person's block. |
| Privacy | Confirm default `activity_members` visibility, precise minimal identity/roster fields, and whether location is visible to all verified students or members only. Proposed discovery uses location text; don't allow private addresses until settled. |
| Completion and feedback | Confirm automatic completion timing, host feedback eligibility, immutable submissions, and how cancelled/no-show meetups differ from completed membership. No attendance tracking is proposed. |
| Messaging history/read state | Confirm full activity history for new/rejoining members and read-only terminal chats. Participant read cursors are defined; if hosts need identical per-conversation unread semantics, add a host cursor to activities later rather than claiming notification-read state is identical. |
| Moderation | Confirm actions, independent-review conflicts, who bootstraps admins, operator authorization, and minimum beta administrator coverage. Define trusted operator provenance before use. |
| Retention/deletion | Set durations and access rules for messages, feedback, reports, evidence snapshots, audit trails and backups; decide scrub versus purge for identifying content. No indefinite retention promise or automatic purge timing is made here. |
| Material edits | Confirm notification thresholds and whether schedule/location changes need participant reconfirmation. Proposed V1 notifies without automatic reconfirmation and forbids ordinary edits after start. |
| Category/interests/assets | Activity categories are now approved as the twelve-name set above, including Networking and singular Hobby. Profile interests remain separate; expanding their allowlist requires a new reviewed migration. Image upload is not implemented; use approved category art. |
| Notifications | Confirm which reminders/full events are essential and whether the visual preference switches are real V1 requirements. They must not disable mandatory safety/cancellation notices. |

## Security risks and required future verification

| Risk | Design control / future verification |
| --- | --- |
| Forged host, sender, reporter, participant or owner | Resolve caller via Auth-to-profile link in each operation; reject arbitrary ownership inputs and cross-user updates. |
| Student grants themselves admin or unsuspends themselves | No profile admin field; deny student writes to membership/account state. Test both API operations and direct table/column access. |
| Two people claim last seat | Locked transactional count and admission; test parallel instant joins/approvals and capacity/cancel races. |
| Direct writes bypass transactional gate | Deny raw state-changing writes; restrict callable operations and privileged jobs to the same locking/validation contract. Test alternate API paths. |
| Report/feedback identity leaks | Restrict tables and projections; test reported user, host, unrelated student and admin separately, including notification payloads, aggregates, cache, logs, exports, and realtime. |
| Old token retains suspended/admin access | Current account and membership checks on reads/writes; verify suspension/revocation takes effect with a previously issued session. |
| Blocking races or shared-chat leaks | Mutation gate, roster cleanup and current read filtering; test block versus join/send, previews, unread counts, and subscription revocation. |
| Privileged client bypasses RLS | Keep privileged keys server-only; verify explicit authorization in privileged operations. Avoid broad server endpoints that accept arbitrary table/actor/state inputs. |
| Cached private data crosses users | Avoid shared caching of private personalized data; scope safe projections to caller and invalidate/refetch on membership/safety changes. |
| Evidence erased by cascading deletion | Restrictive safety/history FKs, tombstones, controlled purge; test Auth deletion and report-linked content cleanup. |
| Harassment/spam or oversized content | Server/database text bounds, per-caller rate limits on requests/messages/reports, escaped plain-text rendering, restricted assets and logged moderation. Rate limits are not supplied by this schema alone. |
| Malicious target references/audit forgery | Target-type checks, real FKs, authorized context checks and atomic append-only audit. Test mismatched message/activity/report targets. |

Before migrations are authorized, settle the listed product defaults. Once implementation is separately authorized, review table grants/RLS/operation permissions and exercise allow/deny cases with multiple real test identities plus parallel capacity/safety transactions. Documentation checks do not establish working database security.

## Technical references

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): database row authorization and limitations of user-editable metadata; grants/column protection must complement ownership policies.
- [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data): Auth-linked application profiles and the need to account for existing access tokens during account changes.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): transaction-scoped row and advisory locks used by the proposed concurrency contract.

These references support the mechanisms. Product defaults and table choices above are proposals derived from this project's scope/UI, not claims that the mechanisms are implemented.
