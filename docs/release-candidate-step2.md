# Release candidate rehearsal ? Step 2

Date: 2026-11-04. Local-only SQL/source rehearsal; no production access, push,
PR modification, deployment, migration 064 or production V2 activation.

## Checkpoints

UI fixes committed locally as `d73fb89886dac986060378847611c132d9b9d54d`:

- `src/communityCredit/CreditManagement.jsx`
- `src/communityCredit/CreditV2Management.jsx`
- `src/communityCredit/creditUiState.js`
- `src/communityCredit/CreditReleaseState.test.jsx`
- `docs/release-candidate-step1.md`

Parent preservation checkpoint `aea275c43b825f6cb7f52da1e184a46d34a85037`
and original `codex-067-checkpoint` at `38aab1393c2d24df26f752118b5ec5e868103568`
remain intact. Only these five reviewed paths were staged. Seed, generated
runners, environment files and private backups were excluded.

## Local database setup and provenance

Reused healthy `pg067test`, image `supabase/postgres:17.6.1.136`, verified server
PostgreSQL 17.6, port 5455. Limits remain 1 GiB and one CPU. Initial free RAM was
about 3 GiB; disk about 10 GiB. Final container usage was about 226 MiB, disk
about 10 GiB. No image pull or existing database deletion/reset occurred.

Restored the EXISTING private `secure/barangay-analytics-062-baseline/schema.restore.sql`
and the verified modern Auth schema from the previous local GoTrue upgrade,
`secure/bb062-auth-migration-2026-10-31/auth-schema-after.sql`. Both remain private.
The public restore source contains zero top-level INSERT/COPY data sections.
The restored databases had zero Auth users, residents and credit policies before
synthetic setup. No credentials or new production export were used.

Restore source SHA256:

- Public schema: `6BC1491C6AE2D68004582C627D552064953AC8D190C74A33EE49A3BFA2E4EF3D`
- Modern Auth schema: `EF104D8C990BFE5A4919DB2906445896534B2003209683D81C4AF84F29B2AC43`

Existing Supabase roles anon/authenticated/service_role/supabase_admin were
verified. Restored modern auth first, then extensions schema, pgcrypto and
btree_gist, then public schema atomically. No invented table/Auth-column stubs.

New databases, retained for inspection:

- `validation067_rc2_20261104`: V1 preservation rehearsal.
- `validation067_rc2_contracts_20261104`: stage tests and final catalog checks.
- `validation067_race_1793769623851`: separate committed synthetic V2/race fixture.

No local PostgREST/GoTrue API service was running. Consequently there was no
HTTP/JWT-issuance/browser integration test. Role probes used actual PostgreSQL
roles and auth.uid-compatible synthetic JWT claims, not fabricated RPC results.

## Exact migration candidate

Applied in both new databases: **062 -> 063 -> 065 -> 066 -> 067**, each file
committing independently, with stop-on-error. 064 was absent and excluded.

| File | SHA256 of rehearsed bytes |
|---|---|
| 062_analytics_insights.sql | 749cc015d0b4ea25b74e541d76ceb1e086a2796d70452375dee26f4458f5b7f1 |
| 063_retire_legacy_module_access.sql | dc8f0d0b966b1bb99f5478176ba29459ed2aa17201be8c58512f09e6f5338097 |
| 065_retire_nurse_sms_permissions.sql | 9498e4cf95bb405eba0d97432b031d4486cfcaf34a20f4299ae690cee9ca1a19 |
| 066_person_history_privacy.sql | 0296be99a45e0abbb8275739ec9816adb1cd383560abb584144494512c568d86 |
| 067_community_credit_v2.sql | 49c16096b02242d3ea7e9f411c6668068680a8d8bc4ae87f941c5aece3db6f80 |

## Preservation and installation checks

Before the first pending migration, created synthetic V1 policies/rules, active
and inactive residents, enrollments and events using the established installation
fixture. No real residents or production policy records were copied.

Captured all 56 existing public tables' row payloads and original column/type/
nullability/default definitions, original constraints and function fingerprints.
After EACH pending migration, original rows and original columns matched. No
unexpected original constraint/function changes appeared; only the explicitly
reviewed enrollment/activity-log constraints and shared function replacements
were permitted to change. New table inventory is exactly the six V2 workflow
tables, bringing public tables from 56 to 62.

V1 profile payloads remained identical apart from 067's added metadata keys,
with scores **85,100,100,n/a**. Active policy stayed V1. No V2 policy, activity,
participation, transition, request or correction was created by installation.
The independent 067 install-safety harness also passed: 17 credit rows identical,
four profiles preserved, no automatic V2 activation or audit additions.

One temporary rehearsal-helper failure occurred after 062: a PL/pgSQL record
named b shadowed a constraint-query alias b. Renamed the temporary record,
replaced only rc2_audit.assert_preserved, and resumed without replaying 062.
No migration/application SQL or acceptance assertion was changed.

## SQL integration/security results

| Check | Result |
|---|---|
| 062 behavioral harness | 89/89 passed after 062, before 066 supersedes its old privacy contract |
| 063 retirement harness | 24/24 passed after 063 and again on final schema |
| 065 generated security/guard harness | Completed successfully before installing 065; final retirement then applied |
| 066 privacy harness | 34/34 passed after 066 and again on final schema |
| 067 behavioral harness | 28/28 passed on final schema |
| 067 negative control | Exact expected failures 1,2,3,11,15,16,17,18,19,20,21,26 |
| V1 data/structure preservation | Passed after every migration |
| RPC catalog compatibility | 30 client functions: unique signatures, exact named args, return metadata, authenticated grants, no anon execute, definer/empty search path |
| Private helper ACLs | Eight inspected helpers reject authenticated/anon/service_role direct execute |
| Credit/SMS table privacy | All 13 tables RLS-enabled with no authenticated/anon direct DML/read privilege |
| Separate-session concurrency | 11/11 passed on a fresh synthetic V2 clone |
| Additional V2 correction smoke | 11/11 passed; request changes rolled back |

The 065 harness deliberately rehearses the old SMS helper and restores retirement
inside its transaction; its rollback warning is expected test output, not final
state. Final helper check permits linked active Secretary Announcement access
and denies health-event management. Role tests include resident/self access,
ordinary/unlinked/archived officials, records administrators, nurse, anon and
service-role paths as covered by the respective harnesses. The final contracts
database has zero residual Auth/resident/credit-event fixture rows.

062's original 89 assertions are NOT claimed to pass unchanged after 066: its
old disclosure expectations are superseded. Final person-history behavior is
validated by 066's 34 contracts and final analytics signatures/grants, plus
067's analytics compatibility assertion.

## Synthetic V2 workflow demonstration

The separate race clone prepared and independently approved policy/rules using
real RPCs, explicitly transitioned ONLY the isolated fixture policy, created
activities, verified participation and awarded actual synthetic ledger events.
The installation-preservation database remained V1 throughout.

A further transaction verified independent policy/rule approvals, resident V2
profile score 100, own correction submission, same-request replay, isolation from
a second resident, refusal of review by the award recorder, independent approval,
unchanged point totals, visible resolved status and refusal of a second decision.
Those correction changes rolled back; the race clone's earlier synthetic fixtures
remain deliberately committed there for separate-session visibility.

## Frontend/source checks

- Relevant Jest: **126 tests / 6 suites passed** (Community Credit state/forms,
  Analytics, privacy and Auth/session stability).
- Production build rerun: **compiled successfully** with CI=true.
- Migration source checks: **48 passed / 0 failed**; no database run implied.
- git diff --check: passed.
- Prior full Jest **2,676 / 119 suites** remains applicable to unchanged application
  bytes; not rerun in this step because the only subsequent tracked work is this
  rehearsal documentation and excluded diagnostics.
- Browser/Auth API integration and the eight-width manual matrix: NOT performed.

No application/migration files changed after the five-file commit. This report is
a new uncommitted documentation file. Temporary scripts/logs/catalog summaries
were kept in the already-excluded runners-out directory. Seed/private backups
are preserved.

## Decision and remaining blockers

**Ready for final integration review at SQL/source level; not approved for
production deployment.** No unresolved SQL prerequisite or candidate failure
remains in this rehearsal.

Still required: isolated full API/authenticated UI smoke and all manual viewports;
review of exact checkpoint/manifest and hosting deployment gates; separately
approved fresh production preflight, recoverable backup/recovery rehearsal,
maintenance/security account-retirement procedures and manual SQL cutover.
The reported production backend still lacks pending migrations; it was not
queried. V2 production activation remains a separate authorization.
