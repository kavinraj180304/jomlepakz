# Initial V1 schema

`migrations/20261010094238_initial_v1_schema.sql` implements the base structures in
[the approved database design](../docs/database.md). It requires Supabase's Auth
schema and roles, on PostgreSQL 15 or later. It creates twelve tables, three
invoker-only helpers, timestamp/link triggers, constraints and indexes in one
transaction. It intentionally fails on existing conflicting objects.

The base migration enables RLS on all application tables with no policies. Privileges are revoked
from `PUBLIC`, `anon` and `authenticated`, including helper execution. Privileged
database roles can still bypass RLS. The migration seeds no users, profiles,
categories or admin memberships. A separate Development category seed is now
available below. No existing tables or migrations are changed.

This is a locked base schema, not working application persistence. A later
reviewed migration must implement authenticated ownership, UM verification,
admission/capacity locking, blocking, lifecycle, feedback eligibility, private
projections and audited operator/admin operations before adding client access.
The single mutation gate from the design is not exposed or implemented here.
Admin event timestamps currently have defaults; provenance and transitions
remain restricted to future operator operations. No automatic Auth signup
trigger is included.

Notification creation requires live activity links (and a message for message
events). A composite FK prevents a message from referencing the wrong activity.
On controlled deletion, links are nulled and summaries are replaced with generic
text. Profile tombstones and restrictive safety/history FKs remain intact.
Approved existing demo cover art is the only allowed cover path for now. Profile
interests retain the original seven-value allowlist, independent of the new
twelve-category activity catalog;
changing this immutable validation helper later requires reviewing existing rows
and revalidating its dependent constraint.

## UM signup gate

`migrations/20261010120000_um_signup_gate.sql` follows the base migration and
adds the exact-domain allowlist, invoker Auth hook, live self-eligibility reader,
email-change verification invalidation and twelve restrictive client RLS gates.
It grants no application table access. Internal role-only profile policies allow
the narrowly privileged email-invalidation trigger to run. No users are seeded.
See [manual Dashboard configuration and tests](../docs/setup.md#um-signup-gate-manual-development-setup).
Apply intended pending files in order; Dashboard hook activation is separate.

`migrations/20261010140000_auth_identity_gate.sql` adds a self-only live identity
check for OAuth and password recovery, independent of profile completion.
Pending accounts can recover credentials, while non-approved/banned/suspended
identities fail closed. Full app eligibility remains unchanged. No users, table
grants or profile activation are added. See the Google/recovery setup in `docs/setup.md`.

## Checks

`migrations/20261010180000_activity_host_operations.sql` follows the foundation
and exposes narrow host create/edit/cancel and own-read RPCs. Raw client table
access remains denied. Read [activity operations and Development tests](../docs/activity-operations.md)
before previewing/applying this fifth migration; it requires real eligible
profiles and seeded active categories, not manufactured accounts.

`migrations/20261010160000_rls_foundation.sql` follows the three files above.
It closes identity authorization after profile unlink, revokes future default
client privileges, repeats table/column revocations and adds restrictive client
vetoes. It also reserves a private, client-denied avatar bucket. Application
persistence remains closed. Review the default-privilege scope, bucket conflicts,
tests and [Development manual cross-user checks](../docs/authorization-foundation.md)
before applying. The existing preview procedure must include this fourth file.

Dependency-free static source checks, runnable without Supabase:

```powershell
node --test supabase/tests/*.test.mjs
```

With an installed Supabase CLI and Docker, initialize local configuration once
if absent, then execute against the local stack:

```powershell
if (-not (Test-Path -LiteralPath 'supabase/config.toml')) { supabase init }
supabase start
supabase migration up --local
supabase db lint --local --level warning --fail-on warning
supabase test db --local
```

The pgTAP test is catalog/permission-based and exercises the interest validator;
it creates no user/profile fixtures and rolls back its temporary objects. Static
checks do not prove SQL execution or business-operation concurrency. Those
operations are not part of this initial migration.

## Apply manually to Development

Use a project ref independently confirmed in the **Development** project's
dashboard. The ref is an identifier, not a key. Do not use a production ref.
With the CLI installed and authenticated, run from the repository root:

```powershell
$jomlepakzDevRef = 'REPLACE_WITH_CONFIRMED_DEVELOPMENT_PROJECT_REF'
if ($jomlepakzDevRef -notmatch '^[a-z]{20}$') { throw 'Set the confirmed Development project ref first.' }
if (-not (Test-Path -LiteralPath 'supabase/config.toml')) {
  supabase init
  if ($LASTEXITCODE -ne 0) { throw 'Supabase initialization failed.' }
}
supabase link --project-ref $jomlepakzDevRef
if ($LASTEXITCODE -ne 0) { throw 'Development link failed.' }
$jomlepakzLinkedRef = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($jomlepakzLinkedRef -ne $jomlepakzDevRef) { throw 'Linked project does not match Development.' }
supabase migration list --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration history check failed.' }
supabase db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration preview failed.' }
```

Check that remote history has no unexpected applied migrations and the preview
contains only the intended unapplied migration files listed above. Resolve schema/history conflicts
before proceeding; never repair history merely to suppress an error. Then, in
the same PowerShell session, apply with a repeated target check:

```powershell
if ((Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim() -ne $jomlepakzDevRef) {
  throw 'Linked project does not match the confirmed Development project.'
}
supabase db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Development migration failed; inspect database/history before retrying.' }
```

Do not share passwords/tokens in chat. The CLI can handle authentication locally.
These commands are instructions only; no remote project was linked or changed
while authoring the migration.

The forward migration contains no destructive statements. Foreign-key cascades
take effect only on future controlled deletes. Transactional failure rolls back
the schema; inspect actual migration history if the response is ambiguous. After
application, keep this file immutable and fix issues with a new timestamped
migration. Any later removal/purge needs a reviewed recovery/backup plan. Never
use a remote database reset as rollback.

## Development reference seed and location config

`seed.sql` contains only the twelve approved activity categories, with stable
slugs, deterministic UUIDs for fresh inserts, sort order and active flags. It
upserts by the database's unique slug. Existing IDs are preserved; unchanged
rows are not updated, so reruns also preserve timestamps. Unique names/IDs
provide additional protection: a conflicting row under a different slug fails
the statement instead of creating a duplicate or silently rewriting identity.
No existing category is deleted, and no users or activities are generated.

Supabase uses `seed.sql` for local seeding by default; this is separate from
migrations. Never add `--include-seed` to a Production push. To replay only the
seed without resetting anything, after applying migrations to a running local
Supabase stack, use PostgreSQL's `psql` against loopback (default local port):

```powershell
psql --host=127.0.0.1 --port=54322 --username=postgres --dbname=postgres --set=ON_ERROR_STOP=1 --file=supabase/seed.sql
```

This command requires an installed `psql` client. It does not use a linked
remote project. If local ports were customized, use the local database port
from your local configuration; do not substitute a hosted connection here.
No reset is needed. See [Supabase seeding guidance](https://supabase.com/docs/guides/local-development/seeding-your-database).

Application reference config:

- `src/lib/config/activity-categories.ts` supplies the same twelve names to
  activity creation and discovery. Database relationships should resolve by
  slug rather than assuming an existing database has fresh-seed UUIDs.
- `src/lib/config/um-locations.ts` contains six curated names and the explicit
  **Other / Custom Location** choice. This is application config, not a map API
  or database table. Locations still save as `activities.location_text`.
- Custom text is trimmed, limited to 1-150 Unicode characters, and rejects
  line breaks/control characters. The form also has a 150-character input
  limit. Future server writes must reuse this validator; current forms remain
  demo previews and do not persist data. Plain text must stay escaped on display.

Location sources: [UM Library](https://umlib.um.edu.my/centrallibrary),
[DTC and Perdanasiswa](https://umifest.um.edu.my/how-to-get-here),
[Perdanasiswa location](https://spm.um.edu.my/locations/kompleks-perdanasiswa-universiti-malaya/),
[UM recreational facilities](https://www.um.edu.my/recreational), and
[Rimba Ilmu Botanic Garden](https://www.um.edu.my/botanical-gardens).
The list does not imply venue booking, public access at all hours or availability.

Run reference/config tests with existing project dependencies installed:

```powershell
node --test tests/activity-options.test.mjs supabase/tests/migration-static.test.mjs
```

`tests/development-seed.test.sql` replays the real seed twice and checks duplicate
protection, identity/timestamp stability and active/order repair. Its transaction
is rolled back and creates no users. Run it with local `pg_prove`/pgTAP after
the local database is migrated (it requires the pgTAP extension files supplied
by Supabase):

```powershell
pg_prove --host=127.0.0.1 --port=54322 --username=postgres --dbname=postgres tests/development-seed.test.sql
```

The integration file stays outside `supabase/tests` because Supabase's Docker
test runner mounts that directory alone; this test must include the actual
parent seed file. Do not replace it with a duplicated seed or simulated DB.

Manual check: run the loopback seed command twice, then inspect categories in
local Studio ordered by `sort_order`: the twelve listed slugs appear once each
and are active. In Create Activity, check all twelve category choices, select
UM Main Library, then switch to Other / Custom Location. Blank/whitespace-only
or over-limit text must not reach Preview. Valid custom text appears in Preview
and survives Back/Continue and switching between preset and custom choices.
