# Stage 7Y.7 — Security migration compatibility review

November 10, 2026. Defense November 16/18. **NO-GO for deployment. 068 → 069 remain proposed, unchanged and unexecuted.**

## Evidence and decision

Read both migrations completely; traced current resident signup/details/ID and official decision payloads, local notification/directory/eligibility/V1 enrollment definitions and earlier metadata reconciliation. Production predicate/body/default findings in this stage are the owner's confirmed inspection summary, not raw definitions independently parsed here. Other collected document/registry/complaint predicates were not reproduced in the summary and are not assumed correct.

**The confirmed current behavior supports the intended need and structural compatibility of both corrections. No additional confirmed defect in their reviewed scope warrants rewriting them. They are ready for a separately approved controlled authorization rehearsal, not production application.** Runtime execution, private alternate writers and recovery remain gates.

## Current gap → proposed protection

| Path | Confirmed current finding | Proposed result and remaining limit |
|---|---|---|
| Official direct profiles UPDATE | is_official checks only profile role; staff policy admits that helper on resident rows | 068 replaces staff old/new predicates with linked active Secretary/Punong records helper; guard independently checks owner/admin. Ordinary officials/Tanod cannot decide another resident's status |
| Own UPDATE | Own UUID policy remains an alternate permissive path; legacy trigger does not independently protect all decision metadata | 068 preserves own editing but compares status/verifier/time/notes together; rejects unauthorized changes, apart from defined pending resubmission. Frontend hiding is not credited |
| Stable role/account fields | Legacy API role protection exists, but broad profile-column grants remain | 068 rejects differences outside its editable-field allowlist, including id/role/email/system_id/created_at. It covers staff decisions too; unknown future columns fail closed |
| Initial own INSERT | Own id + resident role only; UPDATE guard does not run on ordinary INSERT | 069 requires pending and null verified_by/verified_at/verification_notes. Own pending insertion remains possible; initially verified/rejected/ineligible or forged-metadata insertion is denied by policy |
| Auth signup | Literal resident role; verification fields omitted; confirmed defaults pending/null | Consistent with both changes: ordinary UPDATE guard is not an INSERT guard and 069 does not replace privileged signup. Actual signup and metadata filtering still need a JWT-backed test |
| UPSERT | INSERT candidate and conflict UPDATE are distinct paths | Both patches are required. Test actual PostgREST payload/default and conflict behavior; primary-key collision alone proves nothing |
| Eligibility RPC | Privileged authorization uses records helper | 068 still sees JWT actor inside the SECURITY DEFINER RPC; authorized status update is consistent with guard. Ordinary caller cannot gain authority merely through definer execution |

The two altered UPDATE policies remain permissive ORs. Changing only the staff predicate would not protect the owner path; the trigger is essential. NULL explicit WITH CHECK is not alone an exploit; owner-confirmed broad predicates/legacy guard supply the substantive evidence.

## Remaining ways protected values can change

After the proposed patches, these changes are intentional rather than bypasses:

- Secretary/Punong decisions on resident targets, with server-controlled verifier/time; pending decisions clear stamps. Authorized notes remain editable. A metadata-only authorized edit can restamp the decision; test intended audit meaning.
- Resident resubmission from pending/rejected/verified under 068's conditions; verified→pending is allowed even without a name change if the client requests it with unchanged stamps and permissible notes. Verified name/ID changes reset review; ineligible identity changes/re-entry are blocked. This is not self-approval.
- Explicit service-role and tightly scoped direct postgres/supabase_admin maintenance exemptions. Null JWT alone is not sufficient under 068. These paths can alter protected fields and require credential/operator controls.
- Trusted Auth signup/service/other RLS-bypassing INSERT writers: 069 constrains the ordinary self-INSERT policy, not every privileged writer. Arbitrary privileged code, disabled/replaced guards or added permissive policies remain outside the patch's assurance.

**Unverified risks:** other executable definer profile writers, transitive dynamic SQL, effective signup handling of untrusted metadata, actual maintenance connection identities, stale clients, concurrent link/archive changes, and SELECT privacy. No new exploitable alternate path through the proposed ordinary policy+guard combination was established in this source review. 069 is not an immutable-field allowlist for every INSERT column: an own pending client may still supply other grant/constraint-permitted profile fields such as creation metadata. That is a separate integrity/scope question, not verification approval or role elevation; do not claim those INSERT fields are newly protected.

## Legitimate workflow compatibility

| Workflow | Source-level conclusion / caveat |
|---|---|
| Signup | Auth UUID explicitly supplied; literal resident; pending default/null decision fields align. Nullable role/no role default is acceptable for this trigger because it supplies role; not proof every alternate creator does |
| Own contact/photo/Purok/details | Allowlisted. Auth email changes or other stable-field maintenance are not ordinary profile PATCHes; test trusted pathways separately |
| ID/details resubmission | Current resident payload uses pending/null notes without forging verifier/time. Rejected→pending accepted; pending resubmission needs meaningful name/ID change per guard. Ineligible owner cannot reopen |
| Secretary/Punong verify/reject/ineligible | Existing clients send actor/time, but 068 overwrites them with actual auth.uid()/now(). Existing supported status vocabulary preserved |
| Directory reinstatement | 056 locks profile then directory, checks records helper and restores authoritative directory snapshot after sync; intended to work with 068. Concurrent changes require runtime tests |
| Staff profile editing | Own ordinary fields remain permitted; role/email/id/creation changes blocked. No added staff permission to edit another official |
| Tanod profile editing | Own ordinary fields remain permitted, protected metadata blocked. Existing verified-name reset helper text may disagree with 068's resident-only reset; document/test separately |

Malformed structured names/phone fields can make directory synchronization fail and roll back verification. That existing data-compatibility condition is not proof of authorization failure or a reason to bypass validation. No resident records were examined here.

## Notifications, directory and V1

068 replaces the guard body, not existing trigger bindings; 069 only changes the INSERT policy. Compose runs before guard. Directory sync AFTER INSERT/UPDATE OF role/verification_status acts only on newly verified residents, UUID-upserts directory data, preserves existing birth date/resident_status and records audit. 056 reinstatement preserves the authoritative directory snapshot. Neither migration backfills existing records.

Local notify_verification emits submitted on pending entry and resident decision notifications on status changes, ignores same-status updates and catches notification failures with a warning. **A committed verification is not proof its notification succeeded.** Denied mutations must produce no committed notification/directory effects; allowed cases need both state and notification assertions, with warning/failure evidence handled explicitly.

Directory creation/reactivation can invoke 060's existing V1 enrollment trigger. With a configured compatible active policy this may legitimately create enrollment at **100**, once per resident/policy; without active policy it returns without enrollment. It must not fabricate ledger events, deductions or change policy/rules. Existing incompatible active policy configuration can raise an enrollment error and roll back the initiating transaction; schema alone does not prove current policy values. No V2 activation or scoring rewrite is proposed.

## Order, preconditions and lockout/recovery

1. Foundations 007/011/012/022/031/044/055/056 plus reviewed profile schema/helper ownership required; V1 interactions require compatible installed 059/060. No dependency on absent 061–067 and no 064.
2. 068 requires RLS, 18 named fields, exact expected UPDATE policy inventory/no extra UPDATE/ALL, compose/guard unconditional BEFORE bindings and enabled notification/sync AFTER types. Structural metadata supports these; preflight is not a full semantic/fingerprint proof. Additional policies/triggers/columns or role changes must be reviewed, not bypassed.
3. 069 follows successful reviewed 068; it checks the expected INSERT inventory and guard message marker. The marker is not proof of exact 068 contents. Never apply 069 alone as a substitute for UPDATE protection or leave 068 as a complete INSERT fix.
4. Each file has its own transaction and 3-second lock/30-second statement timeout. Lock contention should cause a stop, not an improvised longer timeout. During a future separately authorized rollout, prevent an uncontrolled gap between commits: 068 alone leaves the initial INSERT concern. These separate transactions are not an atomic combined rollout; do not edit/repackage their transaction boundaries without review.
5. Before production approval: private full old definitions/grants, verified recoverable backup, named operator/window, forward-repair plan and actual tested account/workflow compatibility. Stable-field freeze, trusted Auth maintenance, pending UPSERT defaults and unexpected columns can lock out legitimate updates if untested.
6. ROLLBACK only reverses uncommitted transaction work. After commit use separately reviewed recovery/forward repair; restoring the legacy broad guard/policies reintroduces the flaw. API writes, Auth/storage, external delivery and platform logs need separate handling. No insecure automatic rollback.

## Minimum real JWT tests before approval — not executed

Run only in a separately approved safe synthetic environment with genuine accounts, delivery sinks/containment, exact project identity and manifest cleanup; neither existing project is approved for mutation fixtures. SQL claims simulation alone is not JWT proof.

| Test group | Required actors / expected result |
|---|---|
| Registration/INSERT | Real resident signup produces pending/null stamps; profile-less own pending INSERT if reachable; forged state/stamps/role/other UUID denied; prove no duplicate-key false pass |
| Owner UPDATE | Pending/rejected/verified/ineligible residents: own ordinary edits and defined resubmissions allowed; self-approval/metadata/role/stable account identifier/creation-field changes and mixed protected edits denied atomically; verified name/ID-document reset correct |
| Role denials | Anonymous, Resident, Tanod, other Official, archived/unlinked Secretary/Punong cannot directly decide another resident or call eligibility successfully. Prove valid baseline Auth/grants before interpreting rejection |
| Authorized decisions | Independently linked Secretary and Punong each verify/reject/ineligible/reinstate through current direct PATCH and eligibility paths; verify server actor/time, one intended row, notes and valid repeated/no-op behavior |
| UPSERT | New/conflict attempts for forged states/metadata denied; actual supported pending/contact payload/default behavior checked separately from PATCH |
| Side effects/V1 | Allowed decisions: notification outcome, directory UUID/snapshot/audit and enrollment invariants; no arbitrary ledger changes/deductions. Denial: independent observer sees unchanged row and no committed side effects |
| Trusted maintenance | Approved synthetic Auth/service/direct-maintenance identities work only through explicit intended exceptions; null-JWT untrusted identity denied; stable-field maintenance and password/session workflows remain usable |
| Read privacy/regression | Own vs another resident; ordinary official protected complaint/KP denial; Secretary/Punong allowed scope; Tanod own-duty scope; no reliance on hidden UI |

Capture safe assertion IDs, request result classifications and independent pre/post state. HTTP 200/zero rows is not a successful decision; invalid JWT, missing grants and collisions are not attributed to 068/069. API requests commit separately; cleanup by exact synthetic manifest under separate approval, not production deletion or guessed name prefixes.

## Required fixes and final readiness

- **Required proposed backend corrections:** 068 and 069 together address the confirmed authorization and initial-state policy gaps. No edits made or additional migration invented.
- **Required validation:** execute and pass the matrix, review alternate privileged writers and recovery; resolve any concrete failures before production authorization.
- **Separate P2 work:** zero-row success reporting, registry field minimization/privacy and Tanod helper wording remain recommendation-only; they do not replace database security.

**NO-GO remains.** Production summary confirms the rationale and improves compatibility confidence, but neither static review nor catalog definitions prove actual patched PostgreSQL/PostgREST/Auth behavior.

Only this report added. No SQL/RPC execution, hosted access, application/migration changes, Docker/PostgreSQL, commits/push/deployment. `git diff --check` passed (exit 0; existing line-ending warnings); 068/069 SHA-256 hashes remain identical to preserved values. No Jest/build rerun for report-only review; no database authorization tests executed.
