# Authorization foundation

`20261010160000_rls_foundation.sql` follows the existing three migrations.
It creates no users, opens no feature access, and has no DROP/TRUNCATE or row
deletion statements. Existing migration files remain unchanged. No hosted
project was linked or migrated while authoring this change.

## Permissions

SELECT, INSERT, UPDATE and DELETE remain denied on all twelve application
tables for anon, normal users and application admins, including their own rows.
Table and column grants are revoked. A restrictive `foundation_client_deny`
policy additionally vetoes accidental broad permissive policies. Existing
internal Auth-role permissions remain intact. A future reviewed feature migration
must deliberately amend that veto, add appropriate grants/operations and test
ownership, field restrictions and current eligibility. Simply adding an allow
policy will not work. Onboarding/profile implementation is still pending.

The two approved public RPCs remain authenticated-only, no-argument boolean
self-checks. Their privileged readers use current `auth.uid()`, live Auth state,
approved domains, status checks, fixed `search_path = pg_catalog` and qualified
relations. No acting user ID, status or admin authority is accepted from clients.

`private.revoked_auth_identities` records old Auth UUIDs whenever a trusted
operation clears or changes an existing profile Auth link. Both self-checks
consult this ledger, so a surviving Auth account cannot recover authorization
after tombstoning. The trigger uses the existing non-login, non-bypass role with
only INSERT on the ledger's UUID column. Clients cannot inspect, insert, remove
or invoke it. Unlinking is a revocation, including identity-link corrections;
no automatic re-link or restoration is supported. Historical unlinks cannot be
reconstructed from scrubbed profiles: reconcile surviving Auth accounts manually
before opening registration. Retention and exceptional operator recovery need
review; do not blindly clear this ledger.

Schema CREATE is revoked from clients. Future postgres-owned tables/sequences
and functions have client privileges revoked by global and public/private
schema defaults. **Global function defaults affect future postgres-owned
functions in every schema**, including future operator/extension functions;
required EXECUTE privileges must be explicit. Existing objects and defaults for
other creators are unaffected. This global revoke is necessary because a
schema-level revoke cannot subtract PostgreSQL's global PUBLIC EXECUTE default.
See [PostgreSQL default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

## Storage

The migration reserves a private `avatars` bucket, maximum 2 MiB, WebP only.
Restrictive object and bucket-configuration policies deny client SELECT,
INSERT, UPDATE and DELETE in this namespace, even alongside permissive policies.
Other buckets retain their existing behavior and need a separate live audit.
An existing `avatars` bucket or conflicting policy aborts the entire transaction;
inspect it rather than resetting history or silently replacing its configuration.
Both managed Storage tables must already have RLS enabled or migration fails.

This is a storage foundation, not an upload implementation. Avatar ownership
paths, byte validation/re-encoding, private profile-based viewing, replacement
and cleanup belong to the separately planned profile implementation. MIME/size
bucket configuration alone is not proof of safe image contents. Signed URLs,
public buckets and privileged Storage clients require separate scrutiny.
Service keys bypass RLS; never use them as A, B or admin test credentials.
See [Supabase Storage authorization](https://supabase.com/docs/guides/storage/security/access-control).

## Repeatable checks

From the repository root:

```powershell
node --test supabase/tests/*.test.mjs
```

With CLI, Docker and a local Supabase stack already configured, after reviewing
the new migration, run **local only**:

```powershell
supabase migration up --local
supabase db lint --local --level warning --fail-on warning
supabase test db --local
```

These are manual commands, not commands executed during implementation.
`rls_foundation.test.sql` checks grants including column privileges, internal-role
membership, RPC restrictions, bucket settings and restrictive policies. It
executes all four CRUD operations as anon/authenticated and repeats them under
existing real A/B/admin identities when available. Missing real accounts are
explicitly skipped. Operator SQL is used only for setup; assertions use client
roles. No users/admin memberships are manufactured and no service key is used.
The optional unlink test temporarily updates one existing eligible local profile,
asserts ledger creation and both denials, and rolls back. Do not run it on Production.

## Manual Development cross-user tests

Use two controlled real approved UM accounts, A and B, and an independently
operator-authorized admin account if one exists. Use each account's ordinary
session with the publishable key; never a service-role client. Confirm the
Development target independently before any operator setup.

1. With no session, query every application table: permission denied; no private
   data. Try each write operation independently: denied.
2. As A, query or modify A's and B's profile IDs, and attempt to insert a profile
   with B's Auth UUID: denied. Repeat as B against A. Self-service editing is
   deliberately denied until the reviewed profile feature is implemented.
3. Attempt profile status/verification/Auth-link changes and admin membership
   insert/update/delete with A's session: denied. Forge admin/status metadata:
   it must not alter table access or boolean eligibility.
4. Repeat CRUD attempts for categories, activities, participants, saves,
   messages, notifications, reports, blocks, feedback and moderation actions.
   All remain denied. Admin membership must not bypass these denials.
5. Call both public self-checks as A/B: results describe only the caller.
   Calls without a session, to the hook/unlink trigger, or with an extra acting
   user ID must fail. An ineligible/suspended/banned identity must fail app eligibility.
6. Through the Storage API, attempt list/download/upload/upsert/delete/copy/move
   in `avatars`, including a destination under B's UUID: denied for anon, A, B
   and admin. Test bucket configuration changes too. Use an operator-provisioned
   harmless existing avatar for a meaningful download assertion; never edit
   Storage object rows manually. Verify the public download endpoint serves no image.
7. In local SQL tests, unlink the selected real identity transactionally:
   its old session must fail both self-checks even while Auth still exists.
   Roll back. Review existing deleted accounts separately; historical links are lost.

## Deployment and recovery

Follow the Development project-reference checks, migration-history inspection
and dry-run in `supabase/README.md`. Review bucket conflicts and catalog drift
first. Never apply to Production as part of this task. Transactional errors roll
back the migration; inspect migration history if the client response is ambiguous.
After application, fix problems through a new reviewed migration, not edits to
this file. Default-privilege recovery requires the actual prior ACLs, not a broad
grant to clients. New feature permissions need explicit review of the veto policies.

Live hook activation, deployed grants/owners/schema exposure, other buckets,
existing revocations, capacity locking and business authorization remain
unverified or unimplemented. Source tests are not evidence of executed SQL.
