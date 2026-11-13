# Stage 7K - Hardened 068 authorization rehearsal

**PREPARED ONLY. No SQL, migration or API mutation was executed.** Migration 068 itself is unchanged. Stage 7J findings are in the conversation; Stage 7I's repository report remains historical evidence.

## Changed files

- `supabase-tests/068_resident_verification_security.sql`: expanded post-patch matrix and privileged side-effect assertions.
- `supabase-tests/068_verification_test_support.sql`: shared environment gate, baseline checks, exact denial matching, snapshots and hashes.
- `supabase-tests/068_verification_precontrol.sql`: separate legacy negative-control run.
- `supabase-tests/068_verification_cleanup_check.sql`: post-rollback read-only fingerprint checks.
- `src/residents/residentVerificationSecurityMigration.test.js`: existing static tests updated and four new contracts added.
- This report and API/setup plan.

No application source, migration, environment, Auth/RLS configuration or Community Credit code changed. Earlier work remains on `defense/scope-cleanup-20261106` at `c1cc57f`. Generated logs and the private original-support diagnostic under `supabase-tests/runners-out/` remain untracked, not release artifacts.

## False-positive corrections

The old helper accepted any insufficient-privilege error or zero-row UPDATE as equivalent denial. The new helper distinguishes:

1. **Guard rejection:** expected SQLSTATE (normally 42501), exact message, and exception context containing `prevent_role_self_change`. Any unrelated exception is rethrown. An expected guard failure cannot pass through zero rows.
2. **RLS filtering:** exactly zero affected rows with no exception. A generic missing table/function/SELECT privilege cannot count as success.
3. **Allowed operation:** exactly one affected row and no exception.

Each authenticated actor must have expected JWT identity/role, own-row SELECT visibility, SELECT grant, UPDATE privilege on every current profile column, and the expected records-administration predicate. These are SQL session-context tests, not signed-JWT tests. The legacy control separately requires ordinary approval/rejection and owner metadata/identifier tampering to succeed, using a reviewer-supplied legacy guard fingerprint. Failure of a legacy control blocks interpretation of its corresponding post-patch denial.

Anonymous denial is classified separately as existing grant denial or RLS filtering, not credited to 068. Baseline and post-patch schema/policy fingerprints must be compared out of band so another policy change cannot masquerade as 068's effect.

## Prepared matrix and side effects

- Secretary approval/reapproval and Punong rejection, exact position links, server actor/time assertions.
- Active ordinary official approval/rejection/metadata denial and role protection on their own row.
- Resident self-approval, verifier, clock, notes, system identifier and email tampering denial; cross-account denial.
- Rejected resubmission, real contact editing, verified-name re-verification, ineligible resubmission/name denial.
- Archived and unlinked officials with valid baseline own access but no records-administrator power.
- Anonymous denial, protected UUID/creation timestamp and mixed editable/protected payloads.
- Service-role and direct privileged maintenance paths, explicitly labeled SQL context checks.
- Privileged assertions require two verification notifications, one rejection, one ineligibility, owner-resubmission and name-change notifications; directory UUID linkage, changed name and inactive eligibility; two sync audit entries plus the eligibility audit.
- Profile equality is checked after the initial denied cases. Final rollback is followed by private hashes of profiles, directory, notifications, activity log, credit events and enrollments. A mismatch raises an error rather than merely printing false.

Fixtures must have no preexisting target directory row, valid nonblank names/contact values, and seven distinct synthetic accounts: Secretary, Punong, active ordinary official, archived official, unlinked official, rejected resident and pending target resident. Archived/unlinked mapping conditions and exact Auth/profile inventories are checked. Existing unrelated incident, complaint and document tables must be empty.

### Coverage still requiring expansion or observation

SQL execution/parse validity, grants for test helpers, all expected side-effect cardinalities, real Auth/PostgREST JWTs, ID-document replacement and protected creation metadata under every role, null-JWT authenticated attempts, concurrent stale updates, every trusted cloud-only updater, and complete external-effect isolation remain unverified. No static test proves these behaviors. Notification/audit schema drift or unexpected additional trigger effects must cause investigation, not relaxed expected counts.

## Required setup - separate approval before execution

1. Obtain explicit authorization naming the disposable endpoint/database, cluster identity, fixture manifest hash, allowed test writes and teardown plan. Do not infer approval from the database name. Nothing in Stage 7K authorizes executing the migration or provisioning this environment.
2. Use only an approved schema-only baseline and synthetic fixtures. Never copy production Auth users, resident records or application data. Privately review the full table inventory and a deterministic content-hash manifest; verify all records' provenance. Test-account UUIDs, role links, names, credential origin and expected initial states belong in a protected local manifest.
3. Independently establish outbound containment: no production endpoint/credential, no active external SMS/email worker, SMTP delivery, webhook subscription, pg_net request worker or scheduled outbound job. Use approved network egress blocking or isolated test sinks; **database attestation flags do not enforce networking**. No real recipients. Do not modify production workers or settings.
4. An authorized setup owner provisions a private `bb_qa.environment_attestation` table, inaccessible for writes by anon/authenticated/service_role, with exactly one row: `approval_id text`, `manifest_sha256 text`, `synthetic_only boolean`, `outbound_blocked boolean`. Values attest completed independent reviews, not assumptions. Do not put passwords or tokens there.
5. Record the exact approved database name and `pg_control_system().system_identifier` privately using the trusted disposable connection. A database/cluster name is not proof of safety; require the manifest, endpoint review and approval as well. The SQL harness requires all of them and fails if absent.
6. Review effective policies, helper owners/definitions/search paths/grants, all profile columns/types/constraints and every trigger. Capture the legacy guard MD5 and migration-file SHA256 in the manifest. PostgreSQL 17-compatible behavior remains the target; installed PostgreSQL 18 binaries alone do not constitute an environment or a completed compatibility test.
7. Create the seven fictional Auth accounts through approved isolated Auth setup, with corresponding application profiles and exact position links. No account setup is performed by the harness. Confirm expected status/role, valid names and phone formats and sufficient SELECT visibility for actual decisions. Do not disable the real RLS/guard to make a test pass.

### Rehearsal order (not executed)

Use a protected local psql configuration/pgpass, SSL when remote, `psql -X -v ON_ERROR_STOP=1`. Required nonsecret variables: `approval_id`, `manifest_sha256`, `approved_database`, `approved_system_identifier`, seven `*_id` variables, plus `legacy_guard_md5` for the legacy control. Supply UUIDs privately; never passwords in command lines/history.

1. Run `supabase-tests/068_verification_precontrol.sql` on the verified **legacy disposable** baseline. It rolls back and invokes cleanup checks. Save only labels/outcomes and hashes, not raw records or credentials.
2. Independently review the result. A failed baseline is a blocker, not permission to skip the control.
3. Under separate approval, apply **only the reviewed 068 file** to that disposable schema; no 061-067 auto-application, no 064. Verify schema diff and unchanged table fingerprints, grants/ownership and trigger bindings. Capture the resulting guard/policy fingerprints.
4. Run `supabase-tests/068_resident_verification_security.sql`. It does not apply a migration. Require every assertion and the post-ROLLBACK cleanup checks to finish successfully. A failure exits psql; verify connection closure and rollback, then perform independent before/after hash checks on reconnection.
5. Run real JWT-backed API verification below against a fresh approved fixture state. SQL tests rollback; API tests commit their synthetic changes and require separate cleanup/teardown approval.

Rollback does not restore sequence counters or undo external email/SMS/webhooks, remote side effects, logs or client-visible notifications already consumed. Keep workers/clients isolated. The four primary tables plus V1 credit tables are hashed; also compare the complete approved public/Auth/Storage manifest afterward. The harness does not claim exhaustive cross-schema cleanup or delete test users automatically.

## Separate real JWT-backed API validation plan

No API tests have run. This plan uses the actual isolated Auth and PostgREST services, not fabricated JWTs or mock authentication.

1. Pin an approved HTTPS endpoint/project reference and reject the production project (`mpcyqwasurhtdztzobwg`) and all redirects to unapproved hosts. The existing production-connected `.env` must not be used or changed for this runner. Use separate private test-only process configuration, not a browser production session.
2. Owner-provided fictional credentials authenticate with the real Auth password grant. Validate the session with Auth's user endpoint; compare UUID to the approved manifest. Keep tokens/passwords only in protected local memory/configuration, never logs, screenshots, source or shell history. Signed account sessions are required for Secretary, Punong, ordinary, archived, unlinked and resident cases.
3. For every actor, prove baseline own-profile read and an actual allowed contact edit. Inspect minimal fields and affected-row representation; privileged observers verify unchanged protected fields. Never assume HTTP 200 means an UPDATE changed a row.
4. Send direct PATCH requests to `/rest/v1/profiles?id=eq.<synthetic-id>` with `Prefer: return=representation`. Use the same decision, metadata, identity and mixed-payload matrix as SQL. Require one returned row for allowed operations. Classify guard errors by code/message; classify RLS denial by empty representation plus an independent unchanged-record check. Authentication failure (401/expired JWT), missing RPC and unrelated 403 are failures/blockers, not authorization passes.
5. Compare a legacy isolated clone's vulnerable cases with the patched clone while keeping Auth identities, grants and fixtures equivalent. Do not perform precontrols on production.
6. A separately protected privileged observer reads only synthetic rows and in-app notification/directory/audit state. Assert actor, timestamp bounds using server time, status, exact event counts and no mixed-update partial writes. SQL transaction `now()` equality is not appropriate for independent HTTP requests.
7. Anonymous tests use only the isolated publishable/anon key and no session. Staff-role tests must never use a service key. Optional service-role HTTP testing requires separately approved isolated backend credential handling and must not put the key into frontend code.
8. Preserve expected fixture snapshots; run API cleanup only under its explicit approval or dispose of the entire approved environment. Do not delete users/records by a broad name prefix. Verify complete manifest differences, not only HTTP success.

## Production metadata compatibility status

The owner's confirmed production findings match the broad policy/guard weakness and the ID-linked Secretary/Punong helper assumptions. Complete current cloud column types, policy roles, trigger predicates/order, helper fingerprints/owners and private Auth synchronization definitions have not been independently captured here. No production session or credentials were used. Stage 7H metadata queries and a private body review remain the source of truth; names/grants alone are insufficient. A NULL WITH CHECK normally reuses USING; it is not itself unrestricted access.

## Validation / decision

Validation: **11 static tests passed**; **2,549 Jest tests / 108 suites passed**, 139.264 seconds (`stage7k-full.log`); strict `CI=true` build **passed without warnings**, exit 0 (`stage7k-build-strict.log`); `git diff --check` passed with line-ending advisories. A final SQL-only baseline clarification adds a genuinely changed own-contact UPDATE rolled back in a dedicated subtransaction for each actor; targeted static contracts were rerun after that clarification. SQL scripts are **prepared, not executed**.

Unchanged migration 068 SHA256: `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

Migration 068 remains ready for review and a separately approved isolated rehearsal with the gates above; it is **not approved or validated for production**. Initial rehearsal must first validate SQL syntax/helper privileges on the disposable clone and investigate any failure rather than weakening assertions.
