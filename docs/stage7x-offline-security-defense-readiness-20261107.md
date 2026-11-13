# Stage 7X — Offline security review and defense readiness

November 7, 2026. Branch `defense/scope-cleanup-20261106`; HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08` unchanged. **NO-GO for deployment/security approval.** Both existing Supabase projects remain untouched.

## Evidence boundaries and files

Reviewed Stage 7T–7W, migrations 068/069, 002/007 profile policies/guards, 011/012 composition/signup, 022 notification behavior, 028–033 official position/link protections, 044 records helper, 055 directory synchronization, 056 eligibility RPC, V1 foundations, frontend decision/resubmission/signup handlers, Tanod Settings, route/Auth role handling, Stage 7W catalog preflight and existing prepared SQL tests.

This is repository/source analysis. Earlier owner-confirmed cloud findings are historical, not refreshed current metadata. No hosted connection, project operation, credential/session extraction, SQL parsing/execution or real JWT-backed authorization test occurred. No Docker, local PostgreSQL or new project was installed/used/created. Capacity constraints do not justify using either existing project for mutation tests.

Files added:

1. `src/residents/offlineAuthorizationContracts.test.js` — six static source-contract tests.
2. This report.
3. `docs/defense-security-evidence-notes-20261107.md` — concise architecture/evidence/demo notes.

No application code or migration changed. Earlier uncommitted work, SQL harnesses, environment, seeds, backups and diagnostic artifacts remain. New test/build logs are untracked diagnostics under `supabase-tests/runners-out/stage7x-*`.

## 1. Entry-point review

| Path | Repository evidence | Security boundary and limitation |
|---|---|---|
| Direct resident profile INSERT | 002 checks own ID and resident role only | Initial status/decision stamps not independently constrained in that policy; 069 is prepared to narrow it |
| Auth signup profile creation | 011 privileged Auth trigger copies name/contact/Purok and server Auth ID, writes literal resident role, relies on verification defaults, uses ON CONFLICT DO NOTHING | It does not copy client verification fields in reviewed source. Effective defaults, trigger binding and other cloud writers remain unverified |
| Direct profile UPDATE | Official verify/reject/ineligible and fallback reinstatement; resident own details/ID resubmission | 068 changes both policy paths and the guard; UI restrictions do not protect raw HTTP writes |
| UPSERT/ON CONFLICT | No ordinary profile-upsert replacement was introduced; signup and directory SQL have their own conflict behavior | INSERT candidate and UPDATE branch requirements both matter. A duplicate-key error cannot demonstrate authorization. Actual PostgREST payload/default behavior is untested |
| Eligibility RPC | 056 checks non-null actor and records helper, locks profile then directory, updates status and audit | SECURITY DEFINER does not erase JWT identity. Ordinary callers should fail helper checks; only real tests can prove installed behavior |
| Records-position helper | 031 links profile role, official account UUID and non-archived position; 044 permits Secretary/Punong | Source 030 revokes client link-table privileges and has no client policy; 028/029/033 protect position/creation fields. Current effective grants/bindings are not proven |
| Profile composition/guard triggers | 068 requires unconditional compose before guard by trigger-name ordering | Whole-row changes reach the guard after name composition; future/unknown BEFORE UPDATE triggers cause preflight abort |
| Notification/directory AFTER triggers | 022/055 consume accepted transitions; 055 cannot modify a profile and does not create credit events | They are side effects, not permission checks. Rejected transactions must not commit their effects; external delivery cannot be assumed reversible |
| Privileged maintenance/private RPCs | Explicit service/direct maintenance exceptions; additional cloud functions may exist | RLS-bypassing code must be reviewed independently. Neither migration proves all arbitrary definer writers are safe |

### Confirmed versus conditional findings

**Confirmed in source / supported by earlier owner findings:** the legacy generic official UPDATE path is broader than Secretary/Punong; old guard does not independently protect all verification metadata; 002's self-INSERT check omits initial verification state; Verify/Reject frontend success paths do not require a returned affected row. The last issue can misreport RLS-filtered zero-row updates as successful; no live mutation was attempted.

**Conditional P1 exposure, not a production-tested exploit:** initially verified self-insert requires effective INSERT grants, a reachable profile-less Auth identity and no other blocking trigger/constraint. Auth's privileged path could bypass ordinary INSERT RLS if an effective writer/default differs from reviewed source. Current policies, role inheritance, schemas and definer exposure are unknown without future authorized inspection.

**Not established:** current anonymous writes, Tanod verification authority, leaked service credentials, successful role promotion, forged signed JWTs, or a concrete new bypass of 068/069. No search result or mock is treated as evidence of a successful cloud attack. A limited runtime-source search found no service-role reference in the inspected React/public source; that is not a full secret/history audit.

## 2. Review of 068 and 069

### Order, dependencies and repeat execution

Use **068 → 069**, only in a future explicitly approved environment. Their installed foundations include 007/011/012/022/031/044/055/056; pending 061–067 are not prerequisites. Migration 064 remains excluded. Do not bulk-run missing numeric files.

068 checks the expected profile columns, RLS, UPDATE/ALL policy inventory, compose/guard bindings/timing/order, and notification/sync triggers. 069 checks profile INSERT/ALL policy inventory and a reviewed-068 marker. That marker is not a cryptographic definition check. Compare complete private definitions and file hashes before execution.

The policy alterations and CREATE OR REPLACE guard are repeatable in effect if the exact expected schema is still present; preconditions can intentionally reject a diverged schema. This is not an endorsement of re-running migrations or bypassing migration tracking. There is no need for speculative IF EXISTS clauses or broad policy deletion.

### Reviewed UPDATE protections

- Staff old/new-row policy predicates use the records helper and resident target role. The own policy retains UUID equality. Both permissive paths are covered by the trigger.
- Stable ID, role, email, system ID, creation fields and unknown future columns are outside the ordinary editable-field allowlist, including for staff decisions.
- Status, verifier, timestamp and notes are compared together. Staff decisions use the actual actor and server time.
- Resident self-decision/metadata forgery is denied; defined rejected/verified→pending resubmission remains. Verified name/ID changes reset resident review. Ineligible owners cannot reopen themselves through these identity paths.
- Own ordinary profile editing remains distinct from staff authority. A SECURITY DEFINER `current_user` is not used as caller identity.
- Service-role maintenance and tightly constrained direct privileged sessions are explicit exceptions. A null JWT alone is not trusted by the proposed 068 guard.

### Reviewed INSERT protections

069 permits only non-null own UUID, resident role, pending initial status and null verifier/time/notes through the existing ordinary self-INSERT policy. It retains that policy's roles/permissiveness, does not grant privileges or replace signup, and aborts on unexpected INSERT/ALL paths. Client staff accounts gain no generic ability to insert pre-approved residents.

Privileged signup/service writers can bypass ordinary RLS. Their actual defaults/code and registration behavior are mandatory review/test items, not secured merely by this policy. 069 is not a complete immutable-field allowlist for every INSERT column.

### Interactions, transaction safety and compatibility

Both files have explicit transactions and short lock/statement timeouts; no backfill. 068 leaves the actual triggers installed and replaces their guard function, revoking direct client EXECUTE on it. PostgreSQL trigger execution and normal RPC execution are different; a trigger not being callable as an RPC is not proof that all alternate writers are secure.

Legitimate signup, own contact/Purok/photo updates, rejected ID/details resubmission, server-generated name composition, authorized verification, notification creation and directory synchronization are consistent with reviewed source contracts. They are **not database-validated**. Constraints, malformed legacy contacts/names, unknown profile fields, private Auth writers, future triggers, metadata defaults and stale clients can still cause regressions.

**Prospective P2 compatibility issue:** `TanodSettings.jsx` currently says a verified profile's name change returns it to pending. Legacy 007 applies that reset to non-official verified profiles; 068 intentionally scopes identity-reset logic to resident profiles. If verified Tanod profiles exist, that helper text would no longer describe the proposed guard. The current cloud data is unknown. Decide intended Tanod verification semantics and test/update the wording under a later focused change; do not broaden resident decision authority or change SQL speculatively here.

**No new corrective migration was prepared.** No additional SQL-policy defect was confirmed in 068/069's reviewed intended scope. Evidence gaps and the conditional privileged-writer risks are not reasons to invent a 070 migration. Existing prepared 068/069 remain the proposed corrections to the known weaknesses.

## 3. Future reproducible authorization matrix — not run

All outcomes below are **expected after both patches**, not verified results. D = deny a protected mutation with unchanged data; A = allow one intended affected row; C = conditional own-profile operation as specified. Prove baseline grants, SELECT visibility and identity before interpreting any denial.

| Operation | Anonymous | Resident | Tanod | Other official | Secretary | Punong |
|---|---|---|---|---|---|---|
| Direct own pending resident INSERT with empty stamps | D | C: designated profile-less identity only | No staff/Tanod creation privilege; existing own-ID conflict is not a security pass | Same | Same | Same |
| Direct initially verified/ineligible/rejected INSERT or forged verification metadata | D | D | D | D | D via ordinary self-INSERT policy | D via ordinary self-INSERT policy |
| INSERT another user's UUID or elevated role | D | D | D | D | D through ordinary self-INSERT policy | D through ordinary self-INSERT policy |
| Own ordinary contact/profile UPDATE, without protected changes | D | A | A | A | A | A |
| Change role/stable account ID/email/system ID/creation fields via ordinary UPDATE | D | D | D | D | D | D |
| Direct decision UPDATE on a resident target | D | D | D | D | A | A |
| Forge resident verifier/time/notes through owner UPDATE | D | D | D | D on another resident | Server-controlled stamps, authorized notes | Server-controlled stamps, authorized notes |
| Defined resident resubmission to pending | D | A, except ineligible re-entry | No resident self-decision path | No resident self-decision path | Authorized target decisions allowed | Authorized target decisions allowed |
| New/conflict UPSERT proposing verified state or forged stamps | D | D | D | D | D for ordinary INSERT candidate | D for ordinary INSERT candidate |
| Safe pending own contact UPSERT | D | C: correct resident candidate plus UPDATE rights/guard | No blanket support for non-resident role candidates | Same | Same | Same |
| `set_barangay_resident_eligibility` on fixture resident | D | D | D | D | A | A |
| Call trigger function as an ordinary API RPC | Not a supported grant/path | Same | Same | Same | Same | Same |

Normal **Auth signup** is separate from anonymous PostgREST profile insertion: it can create a pending resident through trusted server code even before the client receives a session. Whether registration/confirmation settings permit the operation must be tested. Explicit service/Auth maintenance is separate from all six ordinary actors and must never impersonate a passing resident/staff test.

Secretary/Punong expected allows require actual linked positions and non-archived records. Add separate archived/unlinked cases expecting denial, and attempts to alter position/link tables expecting denial under their existing protection. Read access to other residents' private fields is a separate current-policy question; 068/069 do not narrow SELECT policies. Do not claim that the matrix proves privacy for all SELECTs.

### Reproduction prerequisites

1. Future separate authorization for a genuinely disposable environment that respects the owner's resource/technology constraints. Neither existing project may be paused, deleted, repurposed or tested in this stage. No new project, local server or alternative service is assumed available.
2. Reviewed schema-only provenance matching required foundations, exact endpoint/cluster identity and expected synthetic inventory. No production records/Auth accounts or storage copied. Preserve current policy/function/grant fingerprints plus full private recovery definitions.
3. Fictional accounts created by real approved Auth setup: resident pending/rejected/verified/ineligible and second resident; Tanod with valid roster/account link; ordinary/archived/unlinked officials; Secretary/Punong with explicit distinct links; a designated profile-less identity. Credentials remain private. No fake JWT or mock Auth.
4. Verified containment of external SMS/email/webhook/cron/pg_net delivery. If normal signup confirmation delivery cannot be controlled safely, mark that case blocked. Administrative account provisioning does not substitute for signup/confirmation proof.
5. Explicit approval for fixture writes, migration application, negative controls and cleanup. Existing psql harnesses need a reviewed hosted adapter; do not delete their provenance/identity gates to make them run in SQL Editor.

### Sequence and assertions

- Capture legacy isolated fixtures, prove baseline allowed reads/contact updates and relevant vulnerable precontrols. A generic missing grant or unrelated 42501 is not a valid negative control.
- Apply reviewed 068 then 069 only in that future environment. Check every precondition and transaction result. Compare effective policies/owners/grants/trigger bindings and unchanged initial data.
- Authenticate every actor through actual Auth; validate the signed JWT/user privately against the manifest. Anonymous requests contain only the test publishable key, no leftover user session.
- Send direct REST INSERT/PATCH/UPSERT and exact RPC calls, bypassing UI to test the database boundary. Require one returned intended row for allowed operations; independently verify unchanged data after denial. Distinguish auth failure, missing RPC, invalid arguments, RLS zero rows, guard denial, duplicate key and real success.
- For INSERT negatives, prove the target identity genuinely has no profile. A primary-key collision does not validate 069. For existing-account conflicts, test actual ON CONFLICT DO NOTHING/UPDATE behavior with candidate defaults and complete relevant payloads. A pending UPSERT can intentionally re-enter review; generic verified-state UPSERT may be denied while ordinary PATCH remains valid.
- Test mixed allowed/protected updates for atomicity. Check actor/time bounds, status/notes, notification and directory effects, audit entries and V1 enrollment/ledger invariants. Verification may legitimately enroll an active resident under existing V1 triggers; it must not create fabricated deductions or arbitrary credit events.
- Repeat on independent fixture states to detect order dependence. Preserve safe assertion IDs/outcomes rather than raw profiles/tokens.

### Cleanup and recovery

Use an exact synthetic manifest and pre/post hashes, not broad name-prefix deletion. SQL rollback does not undo external delivery, sequence counters, platform logs or consumed notifications. API writes commit independently and need separately approved teardown/restoration. Auth accounts/storage outside a SQL transaction require their own explicit cleanup. Do not clean either existing project.

Preserve complete private old definitions and tested backups. Restoring broad old policies reopens vulnerabilities, so prefer reviewed forward repair/containment over automatic insecure rollback. Do not use frontend hiding as server containment. Deployment, production migrations and any live smoke-test writes each require separate approval after real database/API evidence exists.

## 4. Offline coverage strengthened

Six new source contracts assert both UPDATE policy paths, resident-target staff predicates, exclusion of stable identifiers from both JSONB allowlists, metadata tuple/stamp/resubmission checks, explicit maintenance identity boundaries, the restrictive INSERT predicate, safe signup field list, linked-position helper and independently gated eligibility RPC. They also ensure directory synchronization does not update profiles or create credit events.

Focused existing tests cover prepared SQL guards, unchanged migration fingerprints, Requests handler/permission wiring, directory behavior and Tanod route/Auth handling. These are static and mocked component tests, not a SQL-policy evaluator. Their passing cannot prove deployed RLS, actual grants, PostgreSQL parsing, real JWT validation or absence of private cloud writers.

## 5. Risks and defense recommendation

| Severity | Finding and status |
|---|---|
| P1 | Legacy verification UPDATE/metadata weakness: source-confirmed and historically owner-confirmed; current cloud not accessed |
| P1 conditional | Self-profile INSERT bypass and RLS-bypassing/private writer exposure: depends on current grants/reachable paths/defaults; not exploited or resolved by a live test |
| P1 release gate | 068/069 have no executed database/JWT authorization proof; current metadata and cleanup/recovery evidence unavailable |
| P2 | Existing Verify/Reject zero-affected-row success reporting, not changed here |
| P2 prospective | Tanod verified-name-change help text can disagree with 068's resident-only reset; actual affected accounts unverified |
| Evidence limitation | UI tests/builds and earlier offline screenshots are not authenticated cloud QA; private SELECT permissions and original pre-001 objects remain unverified |

No new P0 defect was established; this bounded offline review is not assurance that none exists. No corrective migration or business-workflow change was made without a confirmed scoped SQL defect.

Use `docs/defense-security-evidence-notes-20261107.md` for a concise, honest architecture/security explanation. Demonstrate previously captured TEST ONLY layouts and component-test evidence without introducing mock authentication into production components or pretending offline fixtures are real cloud sessions. Explain that review identified weaknesses, corrections are prepared, and deployment is withheld until their enforcement is verified.

## 6. Validation and final status

Focused: **66 tests / seven suites passed**, including six new static contracts. Full Jest: **2,635 tests / 120 suites passed** (140.066 seconds). Normal production build and strict `CI=true` production build both **compiled successfully**, with no reported build warnings. `git diff --check` passed. Local evidence logs are in `supabase-tests/runners-out/stage7x-{focused,full,build,strict,diffcheck}.log`; generated logs are not release source files.

No hosted Supabase access or mutation, project creation/pause/deletion, SQL migration execution, SMS, Docker/PostgreSQL installation/use, Vercel change, commit, push or deployment occurred. Both prepared migrations remain unchanged. **Deployment/security recommendation remains NO-GO.** No further production operation is authorized by this offline stage.
