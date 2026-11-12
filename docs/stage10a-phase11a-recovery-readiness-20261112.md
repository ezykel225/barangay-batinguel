# Stage 10A Phase 11A — recovery readiness

Prepared November 12, 2026. Local, read-only inspection only. No hosted connection, restore, export, SQL/RPC, migration, deployment, commit, or push was performed.

## Executive summary

**Recommendation: NO-GO for migrations 068/069.** The primary PostgreSQL custom-format archive exists, its SHA-256 matches the recorded value, and PostgreSQL 17 `pg_restore --list` reads its 1,206 TOC entries without error. Its verified size is **921,123 bytes**; the earlier **9,211,123-byte** record was a documentation error preserved below for traceability. On November 12, 2026, one additional private byte-for-byte copy was created in a dedicated subfolder and independently verified with the same size and SHA-256. Most importantly, no full restore has been rehearsed and the owner has not accepted that risk.

The archive is strong database evidence, not complete platform recovery. Its TOC includes database data entries for Auth users, Storage metadata, profiles, resident directory, notifications, activity log, and Community Credit-like tables. It does not prove recoverability, contain actual Storage object files, or reconstruct external Supabase/Vercel configuration and secrets.

## Backup verification

| Check | Result |
|---|---|
| Primary path | `C:\Users\Ezequel\BarangayBatinguel-PrivateBackups\barangay-batinguel-20261111-082001.dump` |
| Exists | Yes |
| Actual size | 921,123 bytes |
| Corrected recorded size | 921,123 bytes |
| Historical discrepancy | Earlier documentation stated 9,211,123 bytes; local verification established that value was incorrect |
| Actual SHA-256 | `746856261D8470176C8AC3EA2066C0EF668619A652839919E5FCEDE858DDCF3D` |
| Recorded SHA-256 | Match |
| Second matching copy | Verified at `C:\Users\Ezequel\BarangayBatinguel-PrivateBackups\VerifiedSecondCopy-20261112\barangay-batinguel-20261111-082001.dump` |
| Second-copy size / SHA-256 | 921,123 bytes / `746856261D8470176C8AC3EA2066C0EF668619A652839919E5FCEDE858DDCF3D` — match |
| Other files in named directory | Two zero-byte `.dump` attempts; not backups |
| Reader | `pg_restore (PostgreSQL) 17.11` |
| Archive listing | Readable; exit 0, 1,206 TOC entries, no reported error |
| Restore demonstrated | No |

The checksum match strongly identifies the intended archive, and the size record and local redundancy are now corrected. Copying is not a restore rehearsal; both copies share the same source and do not prove that the archive can reconstruct a working system.

## Recovery coverage matrix

| Component | Archive evidence | Restore demonstrated | Additional recovery material / unknowns |
|---|---|---|---|
| PostgreSQL schema and records | Likely included; readable schema/data TOC | No | Rehearsed restore, extension/version compatibility, ownership/grants/RLS, sequences, constraints and recovery duration |
| Supabase Auth database records | `auth.users` data and extensive `auth` TOC references present | No | Auth service compatibility, signing/JWT settings, provider secrets, redirect configuration and controlled post-restore validation |
| Storage object files | **Not included by database metadata backup** | No | Separate private export/inventory of bucket object bytes and integrity evidence |
| Storage metadata | `storage.objects` and `storage.buckets` data entries present | No | Reconcile metadata with separately recovered object files and policies |
| Auth providers and SMTP | Not established by archive | No | Private inventory/export of provider, redirect, email/SMS and SMTP settings/secrets |
| Edge Functions | Not established; no `supabase_functions` TOC evidence | No | Source/deployed-version inventory, environment secrets and redeployment procedure |
| Environment variables and secrets | Not expected | No | Private Supabase/Vercel environment inventory; rotation/re-entry procedure without putting values in Git/docs |
| Vercel project configuration | Not included | No | Project/domain/branch/build/protection/environment inventory; known good deployment IDs and owner access |
| Community Credit V1 | Four Community Credit/ledger/score-like public table-data entries present | No | Exact V1 object manifest, counts/score invariants, grants/functions/triggers and post-restore reconciliation; never rewrite ledger history to force a pass |
| Resident verification and directory | `profiles` and `barangay_residents` data entries present | No | Counts/status invariants, trigger/policy/function verification and approved account checks |
| Notifications and audit history | `notifications` and `activity_log` data entries present | No | Count/time-range invariants, trigger side effects, external delivery history and reconciliation |

Database restoration may overwrite transactions after the archive timestamp and cannot undo or reproduce external email, SMS, webhooks, platform logs, browser sessions, or Storage files. A frontend rollback cannot reverse database changes.

## Incident-response decision tree

| Scenario | Immediate action and maintenance state | Preserve | Narrow forward repair / approval |
|---|---|---|---|
| **A. 068 fails before commit** | Stop; keep maintenance and staff write pause active. Determine transaction state in a fresh read-only check; never blindly retry. | Exact editor error/time, project ref, migration hash, transaction result and before/after fingerprints | If no commit, diagnose the exact guard/lock/drift failure and prepare reviewed retry instructions. Any retry or SQL change requires owner approval. |
| **B. 068 commits; 069 fails** | Stop; retain 068 and keep signup/write traffic paused. Do not restore broad UPDATE policies. | 068 success evidence, 069 error, current policy/function/trigger fingerprints | Correct only 069's confirmed cause or safely re-execute exact 069 after review. Separate owner approval required. |
| **C. Secretary/Punong cannot verify** | Stop that workflow; keep maintenance active if verification is required for resumption. | JWT identity, active official link, non-archived position, target role/status, request/error and unchanged-row proof | Repair bad account-link/data only through separately approved operations; amend SQL only for a confirmed guard defect. Never add a blanket official bypass. |
| **D. Unauthorized actor can change protected fields** | Security incident: keep maintenance active, stop affected writes, preserve evidence; do not erase resulting history. | Actor/session role, request/response, before/after row, policies/guard fingerprint, notifications/audit/directory effects | Prepare the narrowest forward policy/guard correction and retest approved denial cases. Separate containment and repair approval required. |
| **E. Signup fails after 069** | Pause new registration; preserve any partial Auth/profile state and keep maintenance if signup is a resumption gate. | Auth event/error, signup-trigger binding/fingerprint, profile existence/defaults and API error without credentials | Repair the trusted signup path or confirmed policy incompatibility; do not weaken ordinary INSERT rules. SQL/data repair requires approval. |
| **F. Resident/directory/notification/audit/V1 inconsistency** | Stop and keep maintenance active. Do not delete/rewrite records or V1 ledger history. | Pre/post aggregate invariants, timestamps, trigger results, affected IDs privately and audit evidence | Identify the specific writer/side effect and apply a reviewed source-defined reconciliation. Restore is last resort with separate downtime/data-loss approval. |
| **G. Rollback does not offer `c1cc57f`** | Do not migrate. Keep/restore the safest verified traffic state without guessing; maintenance promotion is not a valid window until rollback is assured. | Current/previous deployment IDs, domains, branch, screenshots and timestamps | Resolve Vercel routing/eligibility with the owner. Any promotion, alias change, rollback or alternative deployment requires separate approval. |

Never respond to an incident by automatically restoring the known overbroad verification policies. Prefer containment plus a narrowly reviewed forward repair. Backup restoration is reserved for severe unrecoverable corruption and needs a separate decision because restore behavior and platform coverage are untested.

## Future maintenance safeguards

1. Obtain explicit approval for a fresh private backup immediately before the window; verify size/readability/SHA-256 and a second private copy.
2. Record the unresolved restore limitation or complete an approved isolated restore rehearsal. The owner currently has **not** accepted the risk.
3. Name the operator, owner approver, incident owner and Asia/Singapore maintenance window. Notify staff, finish/abandon work, sign out and close existing tabs.
4. Promote only the accepted maintenance Preview. Verify every production route shows maintenance, no React/Supabase requests occur, and `c1cc57f` is immediately offered as the Hobby rollback target. Otherwise stop before SQL.
5. Remember that Vercel maintenance does not stop already-open sessions, direct Supabase API clients, old deployment URLs or service integrations. The coordinated write pause remains mandatory; do not disable RLS, Auth, triggers, policies or keys.
6. Reconfirm project `mpcyqwasurhtdztzobwg`, backup and migration hashes; run the final corrected read-only preflight and stop on unexplained drift.
7. Execute only: exact **068 once → targeted read-only 068 verification → exact 069 once → targeted read-only 069 verification**. Stop on error, timeout, uncertain commit state or failed post-check.
8. Run read-only JWT checks first. Run write/denial cases only for owner-approved existing accounts, exact targets and acceptable business outcomes; record unavailable cases as not executed.
9. Compare profile verification, directory, notifications, audit and Community Credit V1 counts/invariants. Any unexplained change is an incident.
10. Resume traffic only after the owner reviews results, accepts listed unexecuted cases, explicitly approves resumption and verifies normal production after rollback.

## Remaining risks and approvals

Remaining risks: no restore rehearsal; both verified copies derive from the same archive; actual Storage files uncovered; external Auth/SMTP/provider/Edge/Vercel configuration and secrets uncovered; post-backup data-loss window; external side effects not reversible; authenticated positive/negative production tests necessarily limited to approved real workflows; direct API/session concurrency remains possible during Vercel maintenance.

Before execution the owner must separately approve: a fresh maintenance-window backup and verification; acceptance of remaining restore risk or a compliant restore rehearsal; named operators/window/incident authority; maintenance promotion and rollback criteria; exact 068 then 069 execution; each JWT-backed write attempt/account/target; treatment of unexecuted tests; any incident containment/forward repair; and final traffic resumption. Until those approvals and recovery gaps are resolved, remain **NO-GO**.
