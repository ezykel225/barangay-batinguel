# Stage 7W — Hosted Supabase security preflight

November 7, 2026. Branch `defense/scope-cleanup-20261106`; HEAD unchanged at `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`. **PREPARATION ONLY. Deployment remains NO-GO. No hosted SQL was executed.**

## Deliverables and evidence

- `supabase-tests/068_069_cloud_preflight_readonly.sql`: standalone, SQL Editor-compatible catalog inspection for review before approval to run it.
- This procedure and approval checklist.
- `src/residents/cloudSecurityPreflight.test.js`: static guardrails for the script, unchanged migrations and approval separation. It is not a SQL parser or authorization test.

Reviewed Stage 7T/7U/7V, both prepared migrations, existing 068 precontrol/support/post-patch/cleanup scripts, and repository definitions 002/007/011/012/022/031/044/055/056. The repository establishes intended definitions, not the effective current hosted schema. Prior owner-supplied production findings remain historical evidence; fresh cloud RLS/grants/functions were not retrieved here.

Preserved hashes:

- 068: `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.
- 069: `F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F`.

## Known security surface

Official verification/rejection/ineligibility generally uses direct `profiles` UPDATEs; linked directory eligibility/reinstatement uses `set_barangay_resident_eligibility(uuid,boolean)`. Its records helper checks official role, explicit account link, Secretary/Punong position and non-archived directory entry. Resident name/ID resubmission also updates profiles. Auth signup conditionally creates a profile through a privileged trigger. Trusted service/maintenance and any private cloud SECURITY DEFINER writers are separate entry points.

The earlier broad UPDATE policy/guard permits callers recognized as officials more access than the intended Secretary/Punong decision rules. Owner metadata is insufficiently protected. 068 narrows both UPDATE policy paths and adds protected-field/metadata enforcement, server stamps and defined resubmission behavior. It leaves AFTER notification/directory synchronization in place.

The self-profile INSERT policy recorded by migration 002 constrains own UUID/resident role but not initial verification state/stamps. If current grants, signup behavior and other triggers permit a profile-less Auth user to insert a profile, a verified self-insert may bypass the UPDATE guard. 069 restricts that policy to own pending resident profiles with null verification metadata. It does not replace privileged signup code or constrain RLS-bypassing writers. Both migrations are prepared, unexecuted and not production-approved.

## What the read-only preflight does

The script starts `begin read only`, sets short local timeouts and `search_path=pg_catalog`, performs catalog SELECTs, and ends with `rollback`. It does not impersonate a role or invoke application functions. Sections:

| Output | Review purpose |
|---|---|
| A — version/mode/roles/object presence | Confirm read-only state and expected managed roles/foundations; identify optional migration ledger |
| B — relation RLS/owners/column types/constraints | Detect missing columns, changed types/default fingerprints, identity/generated fields and unexpected owners |
| C — all policy command paths | Include INSERT, UPDATE and ALL, not just the two named UPDATE policies; preserve role/permissiveness and predicate fingerprints |
| D — effective table/column grants | Includes inherited/PUBLIC effects; flag unexpected anonymous UPDATE/INSERT or API TRUNCATE privileges |
| E — exact required signatures | Missing helpers/triggers/RPCs are reported, never created |
| F — function metadata/EXECUTE | All public functions and Auth/profile trigger functions, definer status, owners, return types and fingerprints; no body/config literals |
| G — trigger timing/bindings | INSERT versus UPDATE coverage, enablement, predicates, attribute limits and ordering review |
| H — memberships/extensions/automation/ledger shape | Identify role inheritance and possible cron/network dependencies without commands, URLs or payloads |

It selects no application/Auth records, UUIDs, emails, phone numbers, passwords, tokens or queue contents. Predicate/body/default/config values are hashed to avoid accidental literal disclosure. Keep all output private anyway: schema metadata can be confidential. **Hashes cannot prove a predicate is correct, recover its definition or establish that an object is migration 068/069.** The owner must privately review full effective definitions and compare them to approved source.

Object absence/permission errors are blockers, not authorization passes. SQL Editor may show only a final result set; collect each named query's output using the editor's available result navigation/export, or run each reviewed SELECT inside its own read-only BEGIN/ROLLBACK transaction after approval. Do not run excerpts that omit the transaction/settings. Do not substitute SELECTs from application tables to fill missing output.

If the migration ledger exists and its `version` column is confirmed, a separately reviewed metadata query can list only versions; never export stored statement arrays. SQL Editor migration application may not appear in that ledger, so use definitions, bindings and approved fingerprints rather than claiming a complete migration state from versions alone.

## Approval gates — none granted or exercised by this stage

### Gate A — Read-only hosted inspection

- [ ] Owner explicitly authorizes running this exact reviewed preflight on the existing intended project.
- [ ] Confirm project identity in Dashboard; do not infer it from database name. The production project previously identified is `mpcyqwasurhtdztzobwg`.
- [ ] Confirm every statement is catalog-only, transaction is read-only and no application routine is invoked.
- [ ] Run only the preflight, collect all sections privately; stop on errors/missing objects.
- [ ] Privately review effective policies, grants, trigger/function bodies, ownership and actual pending/null defaults. Check all public/private writers, including dynamic SQL and role-sensitive signup functions. Do not post definitions containing secrets.
- [ ] Preserve reviewed full old policy/function/grant definitions privately for recovery, not only hashes. No production mutation tests.

**Gate A does not approve schema export, project creation, test writes, migrations or deployment.** No output from the script has been obtained in this stage.

### Gate B — Isolated hosted test project and synthetic setup

- [ ] Explicit owner approval for a separate Supabase test project, organization/resource limits/costs, access and teardown. Do not assume a free resource is available.
- [ ] Record exact approved test project ID/HTTPS endpoint and reject production ID, unexpected redirects and unapproved hosts. A database named `postgres` is normal for hosted Supabase and is not isolation proof.
- [ ] Separate approval for a schema-only source/export/transfer. Prefer a previously reviewed private baseline if it matches current evidence; otherwise request a new schema-only export. No Auth users, application rows, storage objects, tokens or credentials copied from production.
- [ ] Review/sanitize function bodies/defaults, URLs, secrets and scheduled/outbound automation before transfer. Keep private raw snapshots out of Git and uploaded artifacts. Do not import managed Supabase Auth/Storage internal schema replacements.
- [ ] Provision only required compatible extensions/application schema, in verified dependency order. Do not invent stubs. Migration 001 assumes a pre-001 baseline, so blindly replaying 001 onward on an empty project is not a setup plan.
- [ ] Establish a legacy application-schema baseline representing installed 001–060 foundations as confirmed by definitions, without 068/069. Verify 007/011/012/022/031/044/055/056 and their helpers/trigger bindings. Do not apply pending 061–067 or 064 to satisfy unrelated assumptions.
- [ ] Prove the test project contains only expected synthetic data; create a protected fixture/provenance manifest, not a name-prefix assumption. Any seeded geographic/official data must be fictional and clearly labeled.
- [ ] Separately authorize fictional account creation and fixture writes. Required identities: active linked Secretary, Punong, ordinary official, archived official, unlinked official, pending resident, rejected resident, verified resident, ineligible resident, second resident and a designated profile-less identity.
- [ ] Use real Supabase Auth identities with exact corresponding profiles and explicit official links. Do not fabricate JWTs or use a service credential as an ordinary actor. Keep secrets in private test configuration/memory, never chat/Git/command lines.
- [ ] Contain external effects: no production SMS keys/workers, outbound Edge calls, cron commands, pg_net delivery or real recipients. Disable delivery through separately approved test configuration or owner-controlled sinks. Do not assume a new hosted project or rollback blocks egress. If containment cannot be demonstrated, stop before setup/mutations.
- [ ] For true signup/email-confirmation tests, approve a controlled test mailbox/sink and delivery setup; if unavailable, mark confirmation-delivery behavior blocked. Admin-provisioned confirmed accounts do not prove normal resident registration.

**Gate B does not approve application of 068/069 or production configuration changes.** No project, baseline, accounts, mailbox or fixture was created here. Existing application `.env` remains unchanged. Any test frontend must use separately approved test-only configuration and cannot silently fall back to production.

### Gate C — Isolated migrations and behavioral authorization tests

- [ ] Explicit approval naming the test project, exact migration hashes, synthetic write scope, delivery controls and cleanup plan.
- [ ] Before changing the test schema, record effective policies/grants/defaults/owners/trigger fingerprints, complete fixture hashes and V1 state.
- [ ] Run legacy negative controls only in the isolated legacy fixture. Prove allowed baseline reads/contact edits and expected vulnerable operations before attributing later denial to a patch.
- [ ] Apply **068 → 069**, each as its own reviewed file/transaction. Check completion before continuing. Do not paste both into another transaction blindly or skip failed preconditions.
- [ ] Confirm no unexpected grants, owner, Auth trigger, role/default or historical-data changes. 069's guard-message marker is an accident guard, not an adequate fingerprint of 068.
- [ ] Run the full role matrix below through actual signed JWT requests and independently verify persisted state/side effects.
- [ ] Verify cleanup and schema/fixture diffs; retain safe labels/results, not raw records/tokens. Do not weaken an assertion to obtain a pass.

**Existing 068 psql harnesses need a separately reviewed hosted adapter.** They use `\ir`, psql variables, a `bb068_test_*` database-name gate and cluster/system-identifier checks; they are not copy/paste SQL Editor scripts. Do not merely delete those gates because hosted databases are named `postgres`. Replace them only with verified project endpoint/cluster identity, protected attestation, explicit approval and provenance checks. If managed Supabase permissions prevent obtaining reliable required identity/privilege evidence, stop and report; do not grant privileges or claim the old harness passed. This stage prepares the procedure, not an executed or complete hosted harness.

SQL Editor `SET ROLE`/claims simulation, when separately approved in the test project, can supplement the matrix but does not prove Auth token verification or PostgREST behavior. Use a legitimate signed JWT from Auth for API evidence; validate the current user and expected UUID privately before each role's cases.

### Gate D — Any eventual production migration and release

- [ ] Gate A evidence current; Gate C complete with every failure explained and all required negative/positive cases passed.
- [ ] Independent review of exact migrations, INSERT/UPDATE/private-writer coverage, application compatibility and zero-row success handling.
- [ ] Private backup plus actual restoration/recovery evidence and a reviewed forward-repair plan, including old definitions and an operator/window.
- [ ] Owner explicitly approves **production migration execution** for the exact files, project and window. Approval to inspect/test is not this approval.
- [ ] Separate authorization for any hosted smoke-test writes, notification/read metadata, deployment/merge/push and test-project teardown.

No production operation is approved by this report. Frontend controls cannot replace backend enforcement.

## Isolated test matrix and evidence rules

For every actor, first confirm real Auth identity, expected role/link/archive state, an ordinary allowed read/contact operation, and effective baseline INSERT/SELECT/UPDATE rights. Anonymous means the test project's publishable/anon key with **no user JWT**, not an authenticated token mislabeled anonymous.

All requests target the pinned test project's HTTPS REST/Auth endpoints. Keep passwords/tokens out of payload logs. Use `Prefer: return=representation` where supported and select minimal fields. Distinguish missing RPC, expired/invalid session, parameter error, permission error, empty RLS-filtered update and actual successful mutation. An HTTP 200 or generic 42501 alone is not a pass. A protected observer restricted to synthetic fixtures checks one changed row for allowed cases, unchanged data for denials, actor/server-time bounds and synchronous side effects.

| ID | Case | Required observation after patches |
|---|---|---|
| B0 | Legacy baseline/control | Correct synthetic identity/grants; ordinary allowed edits succeed; reviewed vulnerable controls demonstrate the old issue without unrelated errors |
| N1 | Resident self-verification via INSERT | For a genuinely profile-less identity, own resident INSERT with verified/rejected/ineligible status fails and produces no committed profile/directory/notification effects |
| N2 | INSERT metadata/identity forgery | Own pending INSERT with verifier/time/notes, another UUID or elevated role fails; no partial row |
| N3 | Resident self-verification via UPDATE | Pending/rejected resident direct PATCH to verified/ineligible, forged metadata or protected account fields fails; own ordinary edits still work |
| N4 | Resident self-verification via UPSERT | New and conflict-row `ON CONFLICT` paths with forged status/stamps fail. DO NOTHING is not assumed to skip candidate checks; mixed contact/protected changes remain atomic |
| N5 | Ordinary official direct decisions | Direct table PATCH for verified/rejected/ineligible/reinstatement fails despite bypassing UI; archived/unlinked official cases also fail |
| N6 | Anonymous verification writes | Direct INSERT/UPDATE/UPSERT and eligibility RPC cannot change status. Classify existing grant denial separately from protection attributable to migrations |
| N7 | Direct table access and RPC bypasses | Another resident's private profile changes fail; ordinary official eligibility RPC fails; forged target UUID/position arguments do not override caller identity; public helper calls grant no authority |
| N8 | Additional privileged writer exposure | Every discovered executable definer writer is reviewed. A missing/non-RPC trigger function is not treated as proof all alternate writers are secured |
| P1 | Legitimate resident registration | Actual Auth signup creates own pending profile and null decision stamps. Confirm email-confirmation-on/no-immediate-session and intended ordinary registration path where test delivery can be controlled |
| P2 | Legitimate resident profile updates | Contact/Purok/photo/ID-path edits and defined rejected-resubmission/name re-verification work without protected-field forgery. Ineligible owners cannot reopen themselves |
| P3 | Secretary verification decisions | Existing verify/reject/ineligible/reinstatement flows succeed on fixture rows; actual actor and server stamps, notes, notifications and UUID directory sync are correct |
| P4 | Punong Barangay verification decisions | Same intended decision matrix as Secretary; no reliance on Secretary-only UI for server proof |
| P5 | Legitimate pending INSERT/UPSERT | Intended own pending insertion works; explicit safe conflict-contact update is tested. Verified-state UPSERT may be rejected by INSERT checks, so preserve current PATCH/signup compatibility instead of declaring every generic upsert supported |
| P6 | Trusted maintenance and downstream invariants | Explicit approved service/Auth maintenance paths behave as intended; V1 scores/events do not change from verification alone; no SMS/external delivery |
| C1 | Cleanup | Complete approved fixture/schema fingerprints compared, transient helpers removed only as approved, synthetic users/records handled by exact manifest—not broad deletion prefixes |

A duplicate primary-key error on an already existing profile is **not evidence of N1 protection**. Establish a profile-less identity through the approved synthetic Auth setup first; if the real signup trigger always creates a profile, report that condition and design a reviewed reachable-case test rather than deleting a real profile or weakening tests. Repeated tests must use isolated reset/teardown permissions, not accidental state left by prior cases.

For UPSERT, PostgreSQL documents INSERT candidate checks and additional UPDATE policy checks; project-specific PostgREST merge/default behavior must still execute successfully in the approved test project. Review omitted/default fields and verified→pending resubmission behavior explicitly. No policy protection is credited solely to a constraint collision or lack of table grants.

## Dependencies, compatibility and recovery

068 expects reviewed profile columns, RLS, only the named UPDATE policies, compose/guard BEFORE-trigger bindings/order and notification/sync AFTER triggers. The records helper comes from installed foundations, not pending analytics/V2 migrations. It protects stable fields and verification metadata while allowing defined owner edits and records-admin decisions. Potential regressions include private Auth writers, unexpected future columns, ID cleanup, metadata corrections, stale clients and unexpected policy roles.

069 expects the existing own INSERT policy and reviewed 068 guard, rejects unknown INSERT/ALL policy paths, and permits ordinary own pending/null-metadata registration. It does not restrict trusted RLS-bypassing signup or maintenance; effective defaults and those functions must be reviewed. It is not a universal identifier-at-insertion allowlist. No extra privilege grant or Auth trigger rewrite should be improvised to make tests pass.

Both files use transactions and short lock/statement timeouts and contain no backfill. A transaction failure should roll back DDL, but operator/editor transaction state must be checked. A committed schema change and later API mutations need separate recovery. Preserve full old definitions privately; hashes are not backups. Restoring broad old guards/policies reintroduces vulnerabilities and is not a safe automatic rollback. Prefer a reviewed forward repair/containment plan. Rollback cannot undo external mail/SMS/webhooks, sequence increments, platform logs or already consumed notifications.

## Validation performed in Stage 7W

Only local static/Jest/build checks run in this stage. No hosted SQL, catalog query, migration, account creation, verification decision, SMS, project creation or credential/session extraction occurred. SQL syntax execution and database authorization remain **unverified**.

Files added: this report, the read-only preflight SQL and the static Jest test. Existing migrations, 068 harnesses, `.env`, app code, dependencies, earlier changes and backups remain untouched. Generated `supabase-tests/runners-out/stage7w-*` logs are local diagnostics, not deployment artifacts.

Validation results:

- Focused: **25 tests / four suites passed**, exit 0. Includes static preflight/migration contracts and mocked Requests authorization/confirmation regression checks.
- Full Jest: **2,629 tests / 119 suites passed**, exit 0, 156.842 seconds. Existing React act/router and expected mocked API diagnostics remain in logs; these are not cloud authorization results.
- Normal production build: **passed**, exit 0, compiled successfully.
- Strict `CI=true` production build: **passed**, exit 0, compiled successfully.
- `git diff --check`: **passed**.
- SQL parsing/execution, hosted RLS/trigger behavior and real JWT requests: **not performed**. Static preparation checks are not substitutes.

**NO-GO remains:** current cloud definitions, privileged INSERT writers, real hosted signup/role authorization, cleanup and recovery evidence are still outstanding. Next authorization is Gate A only if the owner chooses; do not infer approval for Gates B–D.
