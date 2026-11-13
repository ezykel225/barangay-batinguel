# Stage 7Y.8 — Controlled authorization testing preparation

November 10, 2026. Defense November 16/18. **Procedure only: execution blocked; production deployment NO-GO.** No hosted resources or accounts inspected/created/modified; no SQL, Auth/API or RPC execution.

## Safest available approach and present blockers

Use a **genuinely disposable hosted Supabase environment**, with a reviewed application-schema-only baseline and synthetic data. This preserves managed Auth/PostgREST behavior without Docker/local PostgreSQL. An existing staging environment is acceptable only if its owner separately proves it isolated, disposable, synthetic-only and free of unrelated dependencies/users. No such environment is currently verified or approved.

Owner constraints remain: two active Free projects must remain untouched and no additional free project is available under the reported capacity. Do not pause/delete/repurpose either, assume a new free resource, enable branching or incur charges. Conditional options, in safety order:

1. Separately approved disposable hosted capacity with its own verified project identity and cost/resource approval, if the owner can provide it.
2. An independently provided approved staging project proven disposable and synthetic-only, with its own access/cleanup authorization; a different organization name alone proves nothing.
3. If neither exists, stop at this procedure/static review and transparent defense notes. Do not convert production into a test environment, use a public/shared sandbox or claim mocked Auth/SQL Editor role simulation proves JWT enforcement.

**Missing today:** approved endpoint/project, synthetic Auth-account manifest, controlled delivery configuration, matching test baseline, verified hosted recovery path and hosted-compatible test execution adapter. Production role counts or sessions are not test accounts. No existing passwords, JWTs or service credentials were extracted. The missing production-version CSV is separate provenance work and does not replace these requirements.

## Prerequisite checklist — separate approvals

- [ ] Owner names exact disposable project/endpoint, operator, resource/cost limits, permitted setup/test/cleanup writes and expiry. Record a production endpoint denylist privately. Validate every request destination; stop on redirects/unexpected hosts. Database name `postgres` is not isolation proof.
- [ ] Separately approve schema-only provenance/transfer. Use reviewed baseline definitions matching actual required foundations; no production Auth users, resident rows, files or application data. Sanitize raw bodies/defaults and outbound automation privately. Do not blindly replay 001 on an empty project: original pre-001 tables are required. Do not invent stubs or replace managed Auth/Storage schemas.
- [ ] Required foundations: profiles/Auth linkage/defaults; 007 guard, 011/012 signup/name composition, 022 notifications, 030/031 official links/position checks, 044 records helper, 054/055 directory sync, 056 eligibility; retained dependencies and audit vocabulary. For V1 integration install compatible 059/060 plus prerequisites. No 064, no bulk pending 061–067/V2 installation.
- [ ] Review effective INSERT/UPDATE/ALL/SELECT policies, table/column/function grants, owner/bypass roles, trigger bindings/order and every discovered privileged profile writer. Expected 18 profile columns, pending/null defaults and linked active Secretary/Punong chain. Preserve full private original definitions and exact baseline/migration hashes.
- [ ] Disable real external delivery through approved TEST configuration: no production SMS/provider keys/workers, real recipients, scheduled jobs, pg_net/webhooks or uncontrolled email. Use authorized synthetic mailboxes/sinks for real signup; inability to control confirmation delivery blocks that case. Do not silently change production settings. No live SMS test required.
- [ ] Recovery is independently available through an approved hosted restore mechanism OR a tested reconstructible synthetic schema/fixture procedure with Auth/storage cleanup. Preserve full old definitions and synthetic manifest/state, not only fingerprints. Do not assume managed backup/restore exists on the selected plan. If neither safe method is available, do not apply the test migrations.
- [ ] Prepare a hosted-compatible operator/API procedure or runner, with endpoint/provenance guards and exact fixture manifest. Existing 068 psql harnesses have `\ir`, variables and local cluster/database gates: **not directly SQL Editor compatible**. Do not remove their safety checks just to run them. A reviewed hosted adapter remains required for automated harness execution.

## Minimum synthetic identities and fixture manifest

Separate real Supabase Auth identities: Secretary; Punong; ordinary official; Tanod; resident A and resident B. Add archived/unlinked official cases and resident fixture states pending/rejected/verified/ineligible (independent accounts or separately reset approved fixture states). A designated profile-less Auth identity is needed for meaningful direct INSERT tests. If normal signup always creates a profile and no legitimate reachable profile-less state exists, mark that case blocked pending separately approved fixture construction; a duplicate-key error is not a pass. Do not disable production triggers or delete real profiles.

Secretary/Punong must have distinct explicit account links to matching non-archived synthetic appointments; other official must not hold those positions. Tanod needs an active synthetic roster/account link. Resident A/B ownership and directory links are explicit UUIDs, never inferred from names. Test names/records are fictional and clearly labeled; prefixes alone do not establish provenance.

Private manifest: actor labels/UUIDs, fixture object IDs and expected states, links/positions, permitted record relationships, source provenance, expected metadata and cleanup dependencies. No credentials in Git/chat/process arguments/logs. Use actual test Auth login; hold genuine short-lived JWTs privately. Anon uses only the test publishable key and no Authorization user session. Secret/admin access is only for separately approved setup/observer/cleanup, never to make an ordinary-role test succeed.

## Execution sequence after approval — no actions performed now

1. Verify endpoint/provenance/delivery controls/recovery and all actor identities. Establish allowed baseline own reads/contact edits and source-defined role permissions. An invalid JWT or missing grant cannot serve as a post-patch security pass.
2. In the isolated legacy baseline only, perform narrow vulnerable negative controls for ordinary-official decisions, owner metadata and initially verified INSERT where reachable. Save the observed reason/affected state. Restore the exact synthetic fixtures through approved teardown/reset; do not run vulnerable controls in production.
3. Capture schema/policy/function/trigger/grant definitions and fixture snapshots, V1 policy/enrollment/event state, notifications/directory/audit baselines. Independently test recovery before changing the schema.
4. Apply the exact unchanged **068 file first**, as its own reviewed transaction. Confirm success and expected policy/guard changes before proceeding. Respect 3s lock/30s statement timeouts; stop on conflict or precondition error, inspect transaction state, never bypass checks.
5. Apply exact unchanged **069 second**, independently confirm the sole own INSERT predicate and unchanged signup/default/grant/trigger surfaces. Its message marker is not full proof of 068. No partial migration state is acceptable for final verdict; 068 alone leaves the initial INSERT gap. Do not rewrite transaction boundaries to pretend the pair is atomic.
6. Log in through test Auth for each actor; privately verify actual user identity/claims. Use direct test PostgREST requests, not only UI buttons, with `Prefer: return=representation` for approved writes and narrow SELECT projections. These calls are controlled writes even for expected denials.
7. Execute the read/write/downstream groups below using independent fixture states. Observe persisted state independently; report actual SQLSTATE/HTTP behavior and affected rows without raw personal records/JWTs.
8. Compare all invariants, perform approved manifest cleanup/recovery and verify no residual helpers/accounts/files or unintended schema differences. Preserve sanitized assertion evidence. Stop on any failure; do not weaken assertions or privilege actors to obtain a pass.

## Concrete API request forms for future runner/operator

All paths below are relative to the **verified test** `<endpoint>/rest/v1`. IDs are from the protected synthetic manifest, never production. Do not place JWTs in URLs or captured logs.

- Own read: `GET /profiles?id=eq.<actor-id>&select=id,role,verification_status`.
- Direct update: `PATCH /profiles?id=eq.<target-id>` with one case-specific JSON payload; role-forgery `{ "role": "official" }`; self-approval `{ "verification_status": "verified" }`; ordinary edit `{ "purok": "TEST ONLY PUROK" }`. Protected metadata fields are tested independently and mixed with a permitted edit.
- Direct new profile: `POST /profiles` with own profile-less ID, literal resident role, valid synthetic names and either safe pending/null metadata or the case's forged fields. Confirm mandatory schema fields before execution; malformed input is not an authorization pass.
- Conflict candidate: `POST /profiles?on_conflict=id` with `Prefer: resolution=merge-duplicates,return=representation` and a complete reviewed pending/forged candidate. Test actual defaults/omitted fields; do not assume PATCH and UPSERT are equivalent.
- Eligibility: `POST /rpc/set_barangay_resident_eligibility` with `{ "p_resident_id": "<synthetic-directory-id>", "p_active": true }`, and false in a separate case. This is a write, not an availability probe.
- Signup/session: legitimate test Auth signup/login and refresh with approved synthetic mailbox/credentials; real frontend signup payload. Admin-provisioned confirmed accounts do not prove normal signup/confirmation behavior.

Before future API execution, the hosted adapter must bind these forms to exact fixtures, assertions, observer and teardown; this document is not a completed automated runner. UI rendering/navigation must be checked for mount effects (notification marking/availability writes) before labeling a browser check read-only.

## Test matrix

R = read-only after body/mount-effect review. W = controlled mutation including denial probes. I = downstream integration initiated by W. Each PASS needs valid baseline identity/grants, correct allowed/denied result, exact intended affected-row behavior and independent before/after observer assertions. JWT failure, missing RPC, invalid input, FK error or duplicate key is not evidence of the intended guard.

| ID | Actor / initial fixture | Operation and expected result | Group | Cleanup / PASS evidence |
|---|---|---|---|---|
| R01 | Anonymous | Public metadata/coarse safety allowed; private resident/credit/complaint/KP denied | R | No cleanup if genuinely read-only; no private fields; source-defined empty result vs rejection distinguished |
| R02 | Resident A/B | A own profile/documents/complaints/linked V1 readable; B private data denied | R | No cleanup; observer/manifest proves ownership and field scope |
| R03 | Secretary/Punong/Other Official/Tanod | Exact source-defined records/summary/KP/duty scope; no privilege from display name or wrong portal | R | No cleanup; each real actor tested independently, including archived/unlinked staff |
| W01 | Resident | Role/id/email/system_id/created_at changes denied; mixed permitted/protected payload denied atomically | W | Exact fixture snapshot unchanged; no side effects |
| W02 | Pending/rejected resident | Self-verified/ineligible status and verifier/time/notes forgery denied individually | W | Independent persisted metadata/status unchanged; distinguish RLS zero rows vs guard rejection |
| W03 | Profile-less resident Auth identity | Own safe pending INSERT allowed; verified/rejected/ineligible/forged metadata/elevated role/other UUID INSERT denied | W | Genuinely absent profile baseline, one permitted row vs zero forbidden rows; dependent data cleanup by exact manifest |
| W04 | Real signup identity | Normal signup succeeds with own resident role, pending/null stamps and correct Auth linkage | W/I | Actual signup/confirmation path; compare one profile and notification outcome; approved Auth/account/storage teardown |
| W05 | Resident own profile | Contact/Purok/photo/allowed name edit succeeds, stable fields unchanged | W | Exactly intended row and allowed fields; restore synthetic snapshot |
| W06 | Rejected/verified/pending/ineligible residents | Defined pending resubmission allowed; verified name/ID replacement resets review; pending meaningful-change conditions checked; ineligible self-reentry denied | W/I | Correct status/stamps/notes and notification effect; ID storage cleanup only within approved synthetic bucket paths |
| W07 | Secretary and Punong, separately | Direct approve/reject/ineligible and RPC eligibility/reinstate allowed for synthetic resident targets | W/I | One intended decision, real actor/server time, authorized notes, directory UUID/snapshot and audit; forged client actor/clock overwritten |
| W08 | Anonymous/Resident/Other Official/Tanod | Direct decision/eligibility and crafted INSERT/UPSERT bypasses denied | W | Valid role baseline, target/notifications/directory/ledger unchanged; no frontend-only assertions |
| W09 | Archived/unlinked officials with valid sessions | Secretary/Punong label without valid active position link confers no decision authority | W | Observer unchanged; restore only authorized fixture links/appointments |
| W10 | Resident new/conflict candidates | Forged UPSERT states/stamps denied; supported safe pending/contact UPSERT behaves as specified | W | Real PostgREST merge/default behavior; no duplicate-key-only passes; no partial field update |
| W11 | Approved trusted Auth/service/maintenance actor | Explicit legitimate maintenance remains usable; arbitrary null-JWT identity not trusted | W | Separate privileged test, not ordinary-role evidence; protected synthetic state restored; no secret printed |
| I01 | W04/W06/W07 accepted transitions | Submitted/decision notifications follow local 022; same-status/no-op has no spurious notification | I | Independently count correct recipient/event/target; notification failures are separately reported, not hidden behind committed decision |
| I02 | W07 newly verified/reinstated | Directory sync preserves linkage, reviewed birth date/status and eligibility snapshot; correct audit | I | Compare exact UUID and allowed field diffs; malformed-source failure is atomic, not misclassified as permission denial |
| I03 | W07 + compatible active V1 synthetic policy | Enrollment at 100 once per resident/policy where applicable; existing score model/ledger history unchanged | I | Compare policy, enrollment, event/ledger snapshots; no complaint/incident deductions, no arbitrary credit events, no V2 |
| I04 | Independent no-active-policy and repeated-eligibility fixtures | No forced enrollment without active policy; no-op/idempotent retry does not duplicate effects | I | Correct expected zero/change count; restore exact synthetic policy state, not production policy activation |
| I05 | Separately approved fault fixture | Notification insertion failure does not falsely count as delivered; local trigger warning/business-result behavior observed | I | Controlled fault injection needs separate schema-write approval; restore fixture constraint/config and confirm recovery; otherwise mark blocked |

Notifications are intentionally fault-tolerant in local 022: approval can commit after notification failure. Keep notification delivery/state assertions separate. Directory sync/enrollment failures may abort the decision transaction; verify atomicity rather than overlooking errors. Correct V1 enrollment is not an event/deduction; active model values must be the existing approved 100/0/100. Never activate V2 to satisfy these cases.

## Recovery, rollback and lockout checks

- Freeze test actors/fixture manifest and record pre/post schema/grants/trigger hashes plus full private definitions. Retain existing records through setup; do not copy real data.
- Allowed own ordinary edit, resubmission, Secretary and Punong decisions, real login/session refresh and explicit trusted maintenance are lockout canaries. If a canary fails after valid baseline success, stop; investigate error context and atomic state, do not grant broader permissions.
- A failed uncommitted migration transaction should be rolled back and checked. After a committed file, ROLLBACK does not undo it. Recover only the approved disposable fixture via verified hosted recovery/reconstruction or reviewed forward correction, never automatic insecure policy rollback in production.
- API writes commit independently. Cleanup must include exact Auth users, profile/directory links, notifications/read markers, audit, credit enrollment/events and storage paths in dependency order under explicit teardown approval. Do not delete immutable audit/ledger records through unapproved APIs; approved disposable environment recovery may be necessary. No broad prefix deletes, no disabling immutable guards to make cleanup easy.
- External email/SMS/webhooks, consumed notifications, sequence counters and platform logs may survive SQL rollback. Prevent delivery before tests; document unreversible effects and retain approved evidence.
- Do not assume notifications exist because a decision succeeded, or that a missing notification should change the expected successful business transaction into a passing notification case.

## GO / NO-GO execution and deployment gates

**GO to isolated execution only when:** exact environment/access/resource approval; synthetic provenance/accounts/JWTs; complete baseline; current reviewed migration hashes and preconditions; outbound containment; hosted-compatible operator/runner assertions; tested recovery/cleanup; and explicit setup/migration/test-write approval are all present.

**NO-GO to execution now:** none of that hosted environment/account/recovery setup is established or authorized. No supplied production account is repurposed, no new resource created, and no test is marked passed.

**GO to production recommendation only after:** all required cases actually pass, every negative control/failure is explained, downstream and retained-service regression/privacy evidence is complete, backup/forward-repair verified, remaining defects resolved or explicitly gated, and independent review plus explicit production authorization. A successful isolated rehearsal does not itself authorize production migration or deployment.

For defense, preserve stable V1 and transparent limitations while arranging safe validation. Resource constraints do not justify weakening evidence or writing production records. Separate proposed V2/70-point rules and other SOP roadmap work remain deferred.

## Scope and verification

Only this document created. No hosted resources, accounts, credentials, SQL/RPC/Auth requests, migrations, application/environment changes, Docker/PostgreSQL, commits/push/deployment. Existing uncommitted work preserved. No Jest/build rerun for procedure-only work. `git diff --check` passed (exit 0; existing line-ending warnings). SHA-256 hashes of 068/069 remain unchanged.
