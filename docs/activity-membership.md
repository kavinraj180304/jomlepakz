# Atomic activity membership

Status: authored, not applied or verified against PostgreSQL. Apply only after
review to a disposable local/confirmed Development database; never Production.

Instant joining is the default. An approval-mode join creates a pending request;
host approval/decline remains a separate, unimplemented flow. Pending requests
do not consume seats and grant no accepted-participant access. No chat is wired.

## RPC contract and authorization

- `jomlepakz_activity_membership(activity_id)` returns only the caller's status
  and permitted actions; clients never supply a user ID or participant status.
- `jomlepakz_join_activity(activity_id)` derives the eligible profile from Auth,
  rejects the host, suspended/revoked/unverified accounts, inactive hosts,
  either-direction host blocks, hidden/cancelled/completed/started activities.
  Duplicate current join/request is idempotent. A left participant may rejoin;
  removed/declined participants cannot self-reactivate.
- `jomlepakz_leave_activity(activity_id)` withdraws joined/pending membership
  while scheduled and before the end. No row/left is idempotent. It permits an
  existing member to withdraw after a block/hide, although detail visibility may
  prevent using the screen. Ended/cancelled/completed membership is frozen to
  preserve attendance/feedback history. Suspended users cannot invoke normal RPCs.

Mutations require READ COMMITTED, take the existing shared transaction advisory
gate, revalidate identity, then lock the activity row with `FOR UPDATE`. Capacity
is **host + joined non-hosts**, matching current discovery/host edit semantics.
The count is rechecked after locking; concurrent final-seat requests serialize.
The shared gate also coordinates current host updates/cancellation/moderation.
It serializes all membership mutations, a deliberate small V1 tradeoff.

The existing participant primary key prevents duplicate relationships. Existing
indexes cover activity/status seat counts; no additional index is justified.
Existing participant transition triggers create join/request notifications;
duplicate RPC calls emit no new transition. Withdrawal does not send a decline.

The non-login, non-owner, NOBYPASSRLS function role has narrow column grants and
caller-bound policies. An activity UPDATE policy permits row locking but
`WITH CHECK(false)` forbids actual activity writes. Helpers have hardened
`search_path=pg_catalog`, qualified references, and no client EXECUTE. Clients
receive EXECUTE on the three public RPCs, no raw participant CRUD.

Errors: `42501` access denied/unavailable, `P0001` full or lifecycle closed,
`22023` unsupported isolation. UI uses fixed friendly messages and treats
network/invalid results as unconfirmed; refresh before retrying. No optimistic
seat counts. Returned activity/status are validated before success and refresh.

## Verification

See [testing.md](testing.md#focused-qa-and-membership) for exact commands,
local safeguards, real concurrency/RLS scenarios, two-context browser flow and
the complete manual matrix. Passing Node contract tests is not proof of SQL
locking, policy enforcement or live deployment.
