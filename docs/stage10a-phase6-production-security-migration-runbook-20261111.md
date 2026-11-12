# Stage 10A Phase 6 — production security migration runbook

November 11, 2026. Target: existing Supabase project `mpcyqwasurhtdztzobwg`. No execution is authorized by this document.

## Readiness decision

**Technical prerequisites: GO. Production execution: NO-GO until the owner supplies the operational approvals listed at the end.**

Production evidence now confirms the five trigger mappings/enabled state, six security-function fingerprints, profile columns, policy inventories and verification defaults. The OID-based preflight correction removes the earlier display-name false negatives. Migrations 068/069 remain unchanged, contain separate transactions, 3-second lock timeouts, 30-second statement timeouts and no record backfill.

## Write pause

Choose and approve one pause level before the window:

1. **Hard pause (preferred):** an owner-controlled maintenance response at the hosting edge prevents normal users reaching the application, and barangay staff stop using all dashboards. Confirm no separately distributed client is using the public Supabase endpoint. Hosting changes and later restoration require separate approval.
2. **Coordinated soft pause:** schedule after hours, notify all authorized staff, stop verification/signup/profile-edit activity, close logged-in dashboard tabs and monitor for unexpected use. This reduces but cannot prove zero direct API traffic because the public client configuration is embedded in the frontend.

Do not obtain a pause by disabling RLS, triggers, Auth, database access, API keys or existing accounts. If the owner cannot accept the residual concurrency risk of a soft pause and will not authorize a hard pause, do not execute.

The operator records: window start/end, pause level, named operator, owner approver, selected project reference, current migration hashes, backup checksum reference and incident/forward-repair owner.

## Preservation baseline

Before the window, capture read-only aggregate/invariant evidence without exporting resident details:

- profile counts grouped by role and verification status;
- directory resident count and active/inactive count;
- notification and activity-log aggregate counts relevant to verification;
- V1 policy identity/status/base/minimum/maximum model;
- V1 enrollment and event counts, plus aggregate score invariants through the existing server-calculated reader;
- trigger/policy/function fingerprints from the final preflight.

068/069 alter two policies and one trigger-function body only. They do not UPDATE/INSERT/DELETE application rows, change Community Credit objects, backfill profiles or invoke V2. Any unexpected record-count or V1 change is an incident.

## Exact execution order

1. Verify the Supabase project reference is `mpcyqwasurhtdztzobwg`.
2. Reconfirm both private backup archives are readable and match their recorded SHA-256; record that restoration is untested.
3. Begin the approved write pause and record the time.
4. Run the corrected read-only preflight. Require all expected mappings/functions/policies/columns/defaults and no unexplained fingerprint drift.
5. Open a fresh SQL Editor query containing only exact migration 068. Verify SHA-256 `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.
6. Execute 068 once. Stop on any error, timeout, unexpected output or uncertain transaction state. Do not edit a guard or extend its timeout in the window.
7. In a fresh read-only query, confirm the two expected UPDATE policies, the new guard fingerprint/configuration, and unchanged compose/notification/directory trigger bindings. Do not perform application writes yet.
8. If and only if step 7 passes, open a fresh query containing only exact migration 069. Verify SHA-256 `F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F`.
9. Execute 069 once. Stop on any error or uncertain transaction state.
10. In a fresh read-only query, confirm the sole self-INSERT policy now requires own UUID, resident role, pending status and null verifier/time/notes. Confirm signup trigger and all five trigger mappings remain enabled.
11. Run the approved read-only test group. Then run only owner-approved write cases against explicitly designated existing accounts/records.
12. Recheck preservation aggregates and V1 invariants. Resume traffic only if required tests pass or the owner accepts explicitly listed untested cases.
13. Record completion and the exact untested cases. Vercel deployment remains a separate approval.

## Stop conditions

Stop and keep/resume the pause if:

- project reference, backup checksum or migration hash is wrong;
- any preflight mapping/fingerprint/policy inventory differs unexpectedly;
- a required function/trigger is absent or disabled;
- 068 or 069 reports a precondition, lock, timeout or statement failure;
- the editor does not clearly report success/commit state;
- 068 post-check differs from the intended policies/guard;
- 069 post-check differs from the intended self-INSERT policy;
- any authorized account loses a previously legitimate baseline read/login unexpectedly;
- a denied actor can change verification/protected fields;
- notification/directory/V1 state changes unexpectedly;
- the write pause is breached or the operator cannot determine whether concurrent activity occurred.

## Post-migration tests using existing authorized accounts

Every account and target must be named privately by the owner. Do not infer permission to mutate a record from permission to log in. A write attempt expected to fail is still a production write test and requires approval.

### Read-only group

| Actor | Check | Expected |
|---|---|---|
| Existing resident | Login/session refresh; own profile, requests, complaints and linked V1 read | Existing authorized scope works; another resident remains inaccessible |
| Existing Secretary | Login; resident queue and source-authorized protected records | Authorized fields/readers work |
| Existing Punong | Login; source-authorized records/KP scope | Authorized fields/readers work |
| Existing ordinary Official | Existing summary/incident/V1 scope | No protected resident/complaint/KP expansion |
| Existing Tanod | Own duty/report scope | No Official/private-resident expansion |
| Archived/unlinked staff account, if owner-authorized and available | Login/baseline only | Position-specific authority absent |
| Anonymous browser/session | Public pages/coarsened safety | No private profile, complaint, KP or V1 detail |

Review page mount effects before calling a browser visit read-only: notification controls, document-view markers and availability/status controls can write.

### Approved write group

Run only cases for which the owner identifies a legitimate existing account, an exact target and acceptable business result.

| Actor/case | Write | Expected and evidence |
|---|---|---|
| Existing resident | Approved ordinary contact/Purok edit, if the resident owner consents | Exactly one own row; verification metadata unchanged |
| Existing resident | Crafted self-verification/protected-field PATCH | Denied atomically; observer confirms unchanged row and no side effects |
| Existing ordinary Official | Direct decision or eligibility attempt on owner-designated target | Denied; valid session/baseline access established first; unchanged observer state |
| Existing Tanod | Direct decision attempt | Denied; own Tanod baseline works; unchanged observer state |
| Existing active linked Secretary | A real, owner-approved pending/rejected decision that the barangay genuinely intends | Exactly one row; server actor/time; expected notification/directory/audit/V1 invariants |
| Existing active linked Punong | Independent real decision only if genuinely required and approved | Same assertions as Secretary |
| Archived/unlinked staff | Direct decision attempt, only if account use is explicitly approved | Denied; unchanged state |

Do not manufacture a production resident, reset a real resident merely to repeat a test, or change a real verified/ineligible decision without a genuine barangay purpose. If no appropriate existing record exists, record the positive or negative write case as **not executed**, not passed.

Profile-less INSERT and forged INSERT/UPSERT tests cannot be responsibly executed unless an already-existing owner-authorized Auth identity truly has no profile and the owner approves creating its profile. Migration 069 therefore receives structural/policy verification now and normal-signup observation at the next legitimate registration; absence of such a case is a remaining runtime limitation.

## Incident response and forward repair

- **Migration statement fails before commit:** its transaction should roll back. Keep the pause, inspect the editor transaction state and current fingerprints. Do not blindly retry.
- **068 commits but 069 fails:** retain 068; it closes the UPDATE flaw. Keep signup/write traffic paused because the INSERT gap remains. Diagnose 069's exact guard failure and prepare a separately reviewed forward correction or safe re-execution. Do not restore the broad UPDATE policies.
- **Legitimate resident edit is blocked:** keep the security guard. Capture the exact allowed field/state transition and error privately, then prepare a narrow versioned amendment for that concrete workflow. Do not add a generic owner bypass.
- **Secretary/Punong decision is blocked:** first verify JWT identity, active explicit account link, non-archived exact position and target resident role. Repair incorrect link/data operationally only with separate approval; change SQL only if a confirmed guard defect remains.
- **Signup is blocked:** pause new registrations, preserve the Auth/profile state and inspect the trusted signup path. Do not weaken the ordinary INSERT policy; signup is a separate trusted writer.
- **Unauthorized write succeeds:** immediately keep the application pause, preserve evidence and prevent further affected writes through the narrowest approved containment. Prepare a forward policy/guard correction. Do not erase the affected audit/history.
- **Notification/directory/V1 side effect is wrong:** keep the profile decision and evidence intact unless the barangay determines it was invalid. Repair the specific downstream state through reviewed source-defined operations; never edit/delete V1 ledger history to make a test pass.
- **Severe unrecoverable corruption:** backup restoration is last resort, requires a separately approved downtime/data-loss decision and remains higher risk because full restore has not been rehearsed. Storage objects and external configuration require separate recovery.

## Owner approvals required

1. Accept the untested-restore limitation and identify who may authorize last-resort restoration.
2. Choose hard or coordinated soft write pause and accept its residual concurrency risk.
3. Name operator, approver, maintenance window and incident/forward-repair owner.
4. Approve execution of exact 068 followed by exact 069 on the named project.
5. Name each existing account permitted for read-only validation.
6. Separately name each account, target record and exact write/denial attempt approved for production testing.
7. Decide which unavailable tests may be recorded as unexecuted rather than blocking traffic resumption.
8. Approve traffic resumption criteria after results are reviewed.
9. Keep Vercel deployment/push approval separate.

No deletion, reset, rebuild, V2 implementation or alteration of V1 history is part of this runbook.
