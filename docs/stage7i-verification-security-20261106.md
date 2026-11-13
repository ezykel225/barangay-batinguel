# Stage 7I - Resident account verification security patch preparation

Status: **PREPARED ONLY. NO SQL EXECUTED.** Separate review and isolated PostgreSQL rehearsal are required before any production authorization.

## Evidence and scope

Production findings supplied by the owner establish a permissive staff UPDATE path for any `is_official` caller and an own-profile UPDATE path, both with NULL WITH CHECK. All 18 profile columns have authenticated UPDATE privileges. Migration 007's guard protects role changes and some status changes, but permits officials generally and does not independently guard decision metadata. These are confirmed owner-reported production facts; this task did not connect to production to repeat them.

Reviewed repository sources: 002/007 profile guards; 011/012 name composition; 022 notifications; 031 official position identity; 036 policy inventory; 044 records-administrator helper; 055 directory synchronization; 056 eligibility; ResidentDashboard settings/ID resubmission, ResidentSignup ID upload, OfficialDashboard verification/rejection/ineligibility and subsequent ID-path cleanup; existing service/Edge source references. No repository profile-email synchronization writer was found. Original pre-001 database objects are not fully represented in migrations, so undocumented cloud triggers/functions remain an explicit compatibility question.

## Proposed migration

`supabase-migrations/068_resident_verification_security.sql`

Number 068 avoids colliding with the preserved development sequence 061-067. This patch depends on the installed profile/directory/authorization foundations, not pending analytics/V2 migrations. Do not execute 061-067 merely to apply this security correction; 064 remains excluded. Deployment tooling must support deliberate explicit selection rather than blindly applying all numeric predecessors.

The migration changes two existing UPDATE policies and replaces only the existing guard function. There is no backfill, record update, table deletion, new account, score change or frontend change. It runs atomically with short lock and statement timeouts. Preconditions abort on missing foundation objects/columns, unexpected UPDATE/ALL policies, missing RLS, unexpected BEFORE UPDATE triggers, or nonmatching/disabled expected triggers.

### Proposed protections

- Staff UPDATE USING and WITH CHECK require the existing records-administrator helper and resident target role. The helper is backed by official profile, explicit account link, Secretary/Punong position and non-archived official record, not a name or client role claim.
- Own-profile UPDATE has explicit old-row and new-row identity checks. Both permissive policy paths remain covered by the guard; narrowing only the staff policy would leave owner metadata tampering open.
- Ordinary edits cannot change stable ID, role, email, system ID, creation fields, or unknown future columns. A JSONB field allowlist fails closed for additions. Structured/display names remain editable descriptive attributes subject to re-verification, not authorization keys.
- Verification status, verifier, decision clock and notes are guarded together. Only records administrators may make decisions on resident accounts. Client-supplied verifier/time are replaced with the actual actor and transaction time, including metadata-only corrections.
- Residents cannot approve themselves or forge decision metadata. Rejected/verified owners may return to pending using the existing resubmission pattern; client metadata must remain unchanged except notes may be cleared. Server-side resubmission clears stale decision stamps.
- Verified residents changing name parts or ID-document path return to pending. Ineligible owners cannot re-enter pending or change these identity attributes without staff review. Contact, Purok and photo editing retain the normal path.
- An authenticated security-definer eligibility RPC still carries the actor's JWT identity; it passes only for the same authorized staff roles. `current_user` is not treated as authorization.
- Service-role maintenance retains its explicit trusted bypass. Missing JWT alone is not trusted: direct maintenance requires postgres/supabase_admin session and an unassumed privileged role. Authenticated/anon SET ROLE sessions cannot use that null-JWT path.

### Existing workflows and trigger interactions

The existing `trg_compose_full_name` executes before `trg_prevent_role_self_change` by name. Its post-composition name and original name parts are compared. The existing trigger is not recreated or reordered.

`trg_notify_verification` and `trg_sync_verified_resident_directory` stay as AFTER triggers. Successful status transitions remain available to their existing notification and directory-sync behavior; rejected transactions cannot leave those effects committed. A new approved resident still reaches 055's UUID-based synchronization. The 056 eligibility RPC retains its own locks, snapshot restoration and audit logic. No notification function, directory function or Community Credit function is replaced.

The normal official approve/reject/ineligible payload remains compatible: frontend actor/time are now server-controlled. Authorized ID-file cleanup can still clear the resident profile path. Signup INSERT and Auth password/session flows are untouched. This UPDATE patch is not an INSERT-policy or storage-policy audit.

## Exact files created

1. `supabase-migrations/068_resident_verification_security.sql`
2. `supabase-tests/068_resident_verification_security.sql`
3. `src/residents/residentVerificationSecurityMigration.test.js`
4. This report.
5. `src/incidents/incidentMigration.test.js`
6. `src/kpcases/kpCaseMigration.test.js`
7. `src/complaints/officialComplaints.test.js`

The three existing inventory tests now require exactly 61 files and the exact added 068 filename; all existing historical filename assertions remain. This accommodates the explicitly prepared migration, not an assertion bypass.

Existing application source, 061-067 development history, Community Credit, History/Analytics UI and earlier uncommitted work are preserved. Generated Stage 7I logs under `supabase-tests/runners-out/` are not release artifacts.

## Validation and limitations

Focused Jest initially passed **71 tests / 5 suites**. Seven new tests inspect static migration contracts, including both policy paths, protected fields, explicit maintenance bypass, server stamps, trigger binding and prepared negative cases. They **do not execute SQL or prove PostgreSQL authorization**. Existing frontend grouping, verification and eligibility tests remain in the focused run.

The prepared SQL harness uses actual `SET LOCAL ROLE authenticated`, synthetic JWT claims and SECURITY INVOKER test helpers. It checks ordinary official approval/rejection/metadata denial, resident self-verification/stamp/notes/identity tampering denial, cross-account denial, real own-contact edits, resubmission, staff decisions with server stamps, name-change invalidation and 056 eligibility. RLS zero-row filtering counts as denial; allowed updates must affect exactly one row. It rolls back fixture edits and synchronous notification/directory effects. It has not been executed. No local `psql` or `pg_ctl` executable was found on PATH; Docker and production execution are excluded.

Strict `CI=true` production build passed without warnings (exit 0, `stage7i-build-strict.log`). The first full run had 2,542 passes and three failures: each was an exact 60-file inventory guard, now correctly updated to expect this specific 61st file. Final validation results are recorded after completion below.

Final validation: **298 focused tests / 8 suites passed** (`stage7i-focused-accepted.log`); **2,545 full Jest tests / 108 suites passed**, 109.287 seconds (`stage7i-full-final.log`). `git diff --check` passed with existing line-ending advisories. The final precondition clarification also requires compose/guard triggers to be unconditional, covering every UPDATE rather than a column-limited trigger; targeted security contracts were rerun after that SQL-only clarification.

## Safe non-production verification procedure

1. Obtain separate approval for a disposable PostgreSQL/Supabase-compatible environment with a schema matching production. No production records, passwords, service-role keys or external notification delivery. A database-name gate is an accident guard, not proof of synthetic provenance.
2. Privately compare effective cloud profile columns/types/defaults, all UPDATE/ALL policies, trigger order/event definitions and function definitions with this patch's assumptions. Also review private maintenance and Auth-to-profile update functions absent from the repository. Never test permissions by changing real accounts.
3. Use an existing reviewed schema-only baseline and fictional fixtures. Establish distinct Secretary, Punong, ordinary official, rejected resident and pending resident profiles, with correct active official identity links. Disable external SMS/webhook delivery in that isolated environment by approved test infrastructure, not production settings.
4. Capture policy/guard definitions, privileges and synthetic notification/directory counts before application. Apply **only 068** in the disposable environment; confirm no historical rows change and all other schema objects/grants remain as expected.
5. Run the SQL harness with `psql -X -v ON_ERROR_STOP=1`, database name prefixed `bb068_test_`, supplying its five documented synthetic UUID variables through private local configuration. Do not put passwords in arguments/history. Confirm successful completion/rollback and unchanged fixture counts afterward.
6. Separately test archived/unlinked staff denial; unknown future columns; ID-path change re-verification; no-JWT authenticated/anon denial; trusted direct maintenance and service-role workflows; actor/time/notes null cases; and ordinary staff's own profile editing. Verify actual notification payloads, directory synchronization and eligibility reactivation, not merely that an UPDATE succeeded.
7. Use real local Auth/PostgREST sessions for the same matrix. A forged local test claim in a trusted SQL session tests database logic, not JWT signature verification or browser behavior. Require direct API negative tests as well as frontend controls.
8. Rehearse failure rollback and concurrent staff/owner updates. The patch does not add optimistic version checks; existing last-writer behavior and 056 locking remain. Review stale decisions as a separate concern.

## Recovery and release gates

Before any future authorized application, preserve a private schema backup with exact old guard/policies/grants and verify restoration in isolation. Prefer forward repair. Restoring the old guard or broad staff policy reopens the known vulnerability and is not a safe routine rollback. SQL Editor trusted maintenance remains powerful; protect those credentials.

Remaining gates: SQL parse/application and behavioral rehearsal, effective cloud trigger/schema drift review, trusted Auth/maintenance compatibility, external notification isolation and real authenticated API matrix. The migration fails closed on inventory differences instead of improvising policy replacement. No claim is made that the production vulnerability is fixed before deployment.

Ready for separate code/security review, **not ready for production execution**. No migration, production write, Docker use, commit, push, merge or deployment occurred.
