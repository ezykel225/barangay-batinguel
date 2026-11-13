# Stage 7Y.6 — Focused authorization and security-fix readiness

November 10, 2026. Defense: November 16 and 18. **Deployment NO-GO; prepared corrections remain unapplied and database-untested.** No application or production change in this stage.

## Smallest remaining security questions

Stage 7Y.5A has settled required object presence, Q5 coverage, bounded signature/grant/column/index compatibility and expected profile/Auth trigger structure. Do not repeat those inventories. The eight private exports remain ignored via local `.git/info/exclude`; missing version-only CSV is a separate provenance issue.

| Priority | Evidence established | Exact unresolved requirement |
|---|---|---|
| P1 verification | Profiles grants allow API UPDATE on all columns; two permissive UPDATE policies have no explicit check; earlier owner/source evidence describes broad generic-official guard | Effective USING predicates and guard body must constrain every direct PATCH path; Secretary/Punong only for resident decisions and server metadata; frontend controls are not enforcement |
| P1 creation | One own INSERT policy and existing signup trigger | Actual INSERT predicate, pending/null defaults and signup body; profile-less direct INSERT and conflict UPSERT reachability; privileged writers do not copy client verification/role fields |
| P1 helper chain | is_official(uid uuid) boolean exists, definer/stable; linked-position/admin helpers exist | is_official authoritative body still missing locally; current official-role/link/non-archived position resolution and null-actor handling need semantic review |
| P1 test gate | 068/069 source/static tests only | Actual PostgreSQL + real JWT positive/negative tests and recovery evidence in separately authorized safe environment; not either existing production project |
| P2 privacy | Registry grants broad but RLS enabled; one public ALL policy; OfficialDashboard eagerly fetches all fields | Effective predicate/helper and intended role scope; unnecessary columns can be minimized separately, but projection cannot repair backend authorization |
| Domain assurance | RPC signatures/grants and private-table boundaries match the bounded local expectations | Document predicates/guard, V1 linked-resident/admin gates, complaint/KP detail and position checks, JSONB output semantics |

NULL explicit WITH CHECK is not itself proof of a bypass: USING fallback, command, permissive OR/restrictive AND, trigger and grant layers matter. Likewise public policy scope means applicability to roles, not unconditional access. Q5 broad grants are capability prerequisites, not evidence that RLS admits an anonymous caller. Owner/definer/BYPASSRLS writers must be audited separately.

## Exact evidence request and prepared SQL

1. `supabase-tests/production_authorization_definitions_readonly.sql`: three targeted queries—full policies only for profiles/residents_registry/document_requests/complaints; ten exact core signatures (is_official, guard/signup/compose, linked-position/admin/active helpers, eligibility, verification notification and directory sync); six initial profile defaults. No record reads, role impersonation or function evaluation.
2. `supabase-tests/production_domain_authorization_readonly.sql`: optional follow-up selecting 14 retained-domain functions for document protection, V1 access/profile, complaint/KP visibility and privileged actions, and legacy party links. Inspect core first; expand only if bodies refer to other unresolved helpers/writers. This is not an exhaustive private-function audit or a guarantee that no unknown writer exists.

**These files expose raw definitions, unlike prior hash-only scripts.** Function bodies, policy predicates and defaults can embed secrets, personal literals or confidential URLs. Read-only means no mutation, not harmless publication. Owner must separately approve manual read-only execution, inspect output privately, and sanitize before any sharing. Keep any raw exports in the already ignored private evidence folder; do not place them in tracked reports, CI, chat or screenshots without review. Do not automatically upload them. No credential/service key needs to appear in the SQL.

Every statement reviewed: BEGIN READ ONLY, three SET LOCAL settings, catalog SELECT(s), ROLLBACK. `pg_get_functiondef`/`pg_get_expr` deparse without executing bodies/defaults; policy text is read, not evaluated. The optional script reads only pg_proc/pg_namespace. No application/Auth records, RPC invocation, DDL/DML/grants/SET ROLE or persistent configuration changes. PostgreSQL SQL Editor syntax, not psql. Normal authorized administrative role (usually postgres) needs catalog/built-in access; missing signatures yield absent rows or schema-access errors, not automatic repair. Keep timeouts, stop on errors, rollback an open failed transaction. Platform logs/resource use can still occur. No script executed here.

Review bodies against local 007/011/012/022/031/044/055/056/059/060 and proposed 068/069; do not infer body equivalence from a hash or formatting difference. Follow privileged writer calls transitively if discovered. A SELECT-bodied SECURITY DEFINER can read outside caller RLS, and a SELECT-looking application RPC can have writes; do not invoke it merely to inspect access.

## Reviewed local behavior and field-minimization recommendation

- Resident registration is real Supabase Auth signup, with server Auth UUID and literal resident role in the reviewed profile trigger. Trusted signup defaults remain a separate boundary from ordinary own INSERT policy.
- Verification/rejection/ineligible and fallback reinstatement directly PATCH profiles; directory eligibility uses its own locked, records-admin-gated RPC. Name/ID resubmission must remain possible without enabling self-approval. Preserve ID storage cleanup and verification notifications; testing either may write or produce side effects.
- Records permission uses linked active Secretary/Punong, not name matching. The old general guard uses is_official, which is too broad for the intended verification rule under earlier owner findings. 068 protects both policy paths and metadata; 069 adds initial-state INSERT protection.
- Documents: resident inserts own pending requests; resident UPDATE guard only permits resident_viewed_at. Secretary processing is independently governed by policy; a generic official guard exemption is not blanket Secretary authority. Punong must not automatically inherit Secretary-only actions.
- V1 credit: own view resolves directory profile_id and resident role; active officials may view through current_official_is_active; management requires records admin. Keep 100-point model, server calculation and immutable ledger. Complaints/incident involvement alone never authorize deductions. Do not infer JSON keys or actual scores from metadata.
- Complaints: ordinary official queue is a limited surface; full visibility is own resident or linked Secretary/Punong. KP readers/admin operations are records-position gated; opening/outcome/conclusion are Punong-only under local definitions. Empty permitted-reader results are distinct from missing RPCs or errors.
- Registry references remain necessary to complaint links; do not delete data or remove helper dependencies.

**Recommendation only:** replace OfficialDashboard's `residents_registry.select('*')` with `.select('full_name,purok,household_number')`, retaining `.order('full_name', { ascending: true })`. All current `registryEntries` consumers are local exact/partial normalizeName matching and Requests tooltips, which read precisely those three fields. No id is consumed by this state path. Complaint PartyLink/search RPC is separate and still returns IDs itself. Before implementation, test exact/partial/no/blank-name matching, null purok/household, unchanged tooltip privacy caveat, errors and current row-limit behavior. This does not fix backend access or pagination; lazy loading/role gating would be separate behavior changes. No implementation made.

## Authenticated test matrix — executable cases, not executed results

R = read-only only after effective RPC/mount effects are reviewed; W = controlled write. All cases need legitimate Auth-issued accounts, independently confirmed identity and synthetic ownership/link manifest. Anonymous uses only publishable key/no leftover JWT. Ordinary roles never use a service credential. Read-only session checks require separate account authorization; W cases require separately approved disposable synthetic environment, outbound containment and cleanup. No new project or alternative infrastructure is assumed available.

PASS requires request/response status, safe assertion ID, private actor/target manifest match and an independent state observation; never publish tokens/records. For W denials, HTTP success with zero rows is not successful verification; invalid JWT/missing grant/constraint collision must be distinguished from the intended policy/guard denial. All W cases check no partial changes and notification/directory/audit/credit effects. Allowed decisions require one intended affected row, correct server actor/time, expected notes and source-defined side effects.

| ID | Account / fixture | Test and expected outcome | Kind | Cleanup / PASS evidence |
|---|---|---|---|---|
| A1 | Anonymous | Public pages/coarse safety allowed; private profile/document/complaint/KP/credit denied | R | No cleanup if truly read-only; response contains no private fields; empty results accepted only where source specifies |
| A2 | Anonymous + valid synthetic target | Direct INSERT/PATCH/UPSERT/eligibility writes denied | W | Observer unchanged; classify privilege vs policy denial; no leftover effects |
| R1 | Resident A, resident B records | A sees own profile/documents/complaints/linked V1 only; B private records denied | R | No cleanup; exact owner scope and field set, correct unlinked/empty states |
| R2 | Profile-less synthetic Auth identity; controlled signup mailbox | Auth registration creates pending resident/null stamps; own permitted pending INSERT works where reachable | W | Exact manifest teardown/restoration; actual signup not substituted with admin-provisioned profile; inspect defaults/sync/notification effects |
| R3 | Same profile-less identity, independent baseline per attempt | Verified/ineligible/rejected INSERT, forged stamps/role/another UUID denied | W | Prove no existing-profile collision; zero inserted profile/directory/notification changes |
| R4 | Pending/rejected/verified resident fixtures | Self-approval, forged verifier/time/notes, role/id/email/system_id/created_at changes denied; mixed contact+protected update atomic | W | Reset only synthetic fixture; observer unchanged for denial, no forged audit effects |
| R5 | Pending/rejected/verified/ineligible resident fixtures | Contact/profile edit and defined pending resubmission allowed; verified name/ID resets review; ineligible re-entry denied | W | Verify guard-stamped result and ID-storage effects if used; exact fixture/storage cleanup |
| R6 | New and existing resident profiles | Forged UPSERT candidate/conflict denied; supported safe pending/contact UPSERT checked separately from PATCH | W | Actual PostgREST payload/default behavior; no duplicate-key-only passes; restore independent fixture |
| R7 | Verified synthetic resident | Own pending document request/complaint and evidence path allowed; cross-user/status forgery denied | W | Separate approval, no real service delivery; exact record/storage teardown and history consistency |
| S1 | Active linked Secretary + target resident | Authorized views, registry scope, protected complaint detail/KP admin | R | No cleanup; returned fields match approved scope, no hidden full-table leakage |
| S2 | Secretary + independent resident states | Verify/reject/ineligible/reinstate through direct PATCH and eligibility RPC allowed | W | One target, actual actor/server time, expected notifications/directory/audit; no arbitrary credit events/deductions |
| S3 | Secretary + document/KP fixtures | Authorized document transitions/KP admin allowed; Punong-only open/outcome/conclusion denied | W | Persisted allowed transition and denied-state invariants; cleanup exact fixture chain |
| P1 | Active linked Punong + fixtures | Authorized records and verification decisions allowed | R/W | Reads need no cleanup; W asserts S2 invariants with Punong actor, separate fixtures |
| P2 | Punong + KP/document fixtures | KP open/outcome/conclusion allowed only with valid confirmed-screening/proceeding prerequisites; no blanket Secretary document authority | W | Distinguish business precondition vs role denial; independently inspect case/history, cleanup fixture chain |
| O1 | Other Official + accessible summary/private targets | Allowed queue/incident/V1 views per actual source; protected complaint/KP and resident-private scope not expanded | R | No cleanup; expected field-level scope and valid empty/denial behavior |
| O2 | Other Official + resident fixture | Direct decisions, eligibility RPC, initial-state INSERT/UPSERT bypass denied | W | Independent unchanged row/effects; baseline allowed reads/own ordinary edits established |
| T1 | Tanod with valid active link | Own duty/reports/role navigation allowed; Official/private resident routes denied | R | No cleanup; identity/assignment scope, session persistence without marking notifications |
| T2 | Tanod + resident/assignment fixtures | Verification denied; only own valid check-in/out/followup allowed | W | No role escalation; expected operation events only; exact fixture restoration |
| X1 | Archived and unlinked Secretary/Punong fixtures | Position-specific reads/decisions denied; display name never grants authority | R/W | Valid Auth baseline; unchanged denied-target state; restore links/archive only in authorized fixture |
| C1 | Resident, Other Official, Secretary, Punong fixtures | V1 own/official read rules; admin policy/rule changes only records admins; no complaint/incident-driven deductions | R/W | Read no cleanup; W only approved synthetic policy/ledger fixture, no V2 activation or real-score changes |
| M1 | Separately approved trusted maintenance/Auth workflow | Legitimate backend writes remain possible only through explicit trusted paths; no null-JWT general bypass | W | Named operator and synthetic scope; audit preserved, complete state comparison; never credit maintenance as an ordinary-role pass |

Before each W case prove baseline identity/grants/visibility and isolate fixture state to avoid order-dependent passes. Preserve pre/post hashes and full private old definitions. API writes are separate committed transactions; final SQL ROLLBACK cannot undo them. Auth users, storage and external mail/SMS/webhooks need explicit teardown/sinks; sequences/logs/consumed notifications may not be reversible. No production synthetic users, live verification, SMS or score changes are approved.

## 068 then 069 — readiness and lockout checklist

- Required foundations 007/011/012/022/031/044/055/056, all 18 profile fields and expected RLS/policies/triggers match structurally in available metadata. Pending 061–067 are not prerequisites; exclude 064.
- Check exact effective UPDATE/ALL/INSERT predicates and trigger bodies first. 068 aborts on unexpected policy or BEFORE UPDATE inventory and leaves existing AFTER triggers; 069 expects reviewed 068 plus the sole own INSERT path. Its message marker is not proof of exact implementation.
- Compose BEFORE trigger name ordering and unconditional scope matter. Supplied Q6 supports expected types/enabled state; directory sync's 4/10 column restriction maps to role/status and is intentional.
- Unknown/extra future columns fail closed under 068; private Auth/service updates, stale client stamps/UPSERT and account metadata fixes can lock out legitimate operations if not tested. Archived/unlinked staff must be denied without accidentally treating a displayed Secretary title as authority. Explicit maintenance exceptions need independent review.
- Verify resubmission, name/ID reset, notifications, directory snapshot preservation, V1 enrollment and null stamp defaults before approval. Existing Tanod name-reset wording may need a separately approved adjustment; do not broaden SQL speculatively.
- Files are forward transactions with short lock/statement timeouts and no backfill. Schedule separately approved maintenance window and stop on precondition/lock errors; inspect transaction state. ROLLBACK only undoes uncommitted transaction work. After commit, use reviewed forward repair and verified recovery; reinstating old broad policies reopens the flaw.
- Preserve full private old definitions, grants and tested recoverable backups, plus approved operator/session and explicit exact-file authorization. No migration execution is authorized by this report; prepared hashes remain unchanged.

## GO / NO-GO gate

**NO-GO now:** semantic authorization evidence and actual database/JWT patch tests/recovery remain absent. Passing Jest, matching grants or disabled frontend buttons cannot close this gap.

GO requires: (1) private predicate/body/default review closes core and domain/helper/transitive-writer questions; (2) actual safe synthetic R/W matrix passes with every denial attributed correctly; (3) registration/resubmission/verification/notifications/directory/documents/complaints/KP/V1/Tanod regressions pass; (4) privacy/minimization concerns are assessed and any required changes separately reviewed; (5) backup/restoration/forward-repair and delivery containment verified; (6) current build/frontend smoke evidence; (7) separate explicit production migration and deployment approvals. Missing version export is tracked separately; no blind ledger repair/replay.

For November 16/18 prioritize closing core verification semantics, honest read-only retained-feature demonstrations and stable V1. Keep proposed V2 70-point rules, new due-process/analytics/household enhancements and credit-based service prioritization deferred until security/policy approval; never silently deny essential documents.

## Validation and scope

Created this report and two prepared SELECT-only scripts. No application, migration, configuration or private evidence modified; no Docker/PostgreSQL, hosted SQL/RPC, production writes, commits/push/deployment. SQL syntax/runtime authorization not executed. No Jest/build rerun for report/query-only work. `git diff --check` passed (exit 0; existing line-ending warnings). SHA-256 hashes of 068/069 match preserved values; `git check-ignore` confirms the private evidence exclusion remains effective.
