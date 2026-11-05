# Existing-project migration rollout preparation — 2026-11-05

## Gate: NO-GO for production execution yet

Option 1 is selected: use the existing Supabase project, repository and Vercel website. This document prepares **062 → 063 → 065 → 066 → 067** only. **064 is excluded.** No SQL migration, production write, backup containing application records, policy activation, main change, push or deployment was performed.

Candidate: `da47a83be76d8a4a5ff432abb9afa3ceb6a53ed8`. Current main/last successful GitHub-recorded Production deployment: `739e8879a273c8b82f6d7a06ff66222169976aae` (previous review). Recheck those references at execution time. Main pushes normally trigger Vercel; the handoff-only ignored-build rule does not protect main.

## Evidence obtained now

Repeated read-only GET probes against the authorized existing production project:

- `person_analytics`, `barangay_safety_analytics`, `repeated_dispute_analytics`, `community_credit_activities_list`, `my_community_credit_correction_requests`: **404 / PGRST202**.
- `person_history`, `my_community_credit_profile`, `community_credit_admin_state`, `community_credit_resident_directory`, `incident_queue`, `tanod_roster`: **401 / 42501**, confirming resolution and anonymous refusal, not authorized functionality.
- OpenAPI discovery: **401**. No application records were returned.

These results support the reported missing API contracts but cannot prove the exact SQL migration ledger state: a stale API schema cache can also cause PGRST202. The three standard/provisioned pgpass locations checked remain absent. No usable production SQL credentials are available, and no live catalog inspection, RLS/body comparison or production-data compatibility assertion has succeeded. A historical schema snapshot is not a current backup or preflight.

Prepared, **not executed**: `supabase-tests/production_rollout_preflight_readonly.sql`. It opens a read-only transaction, bounds execution time, reports catalogs/fingerprints/ACLs and aggregate blocker counts, then rolls back. It creates no objects and prints no names, phones, complaint content, credentials or function bodies. Small aggregate counts are still internal evidence; keep results private. It is an inventory, not a complete automated migration approval.

## Source review and remaining risks

| File | Reviewed behavior | Required live gate / risk |
| --- | --- | --- |
| 062 | Requires 001–061; creates complaint date index and descriptive analytics RPCs/private helper. No application DML or credit scoring mutation. Definer functions use empty search path; exposed readers require signed-in official checks. | Verify prerequisite signatures and index absence. Plain CREATE INDEX can block writes; table sizes and lock budget are unknown. New objects are not generally safe to replay blindly. Coordinate with 066 to avoid an intermediate privacy exposure. |
| 063 | Guarded revocation of retired reservation/health/waste/registry client access; removes 13 policies, preserves rows, owner/service-role access and specified retained reads. | All named functions/policies and expected grants must match. Resolve every future pending/approved reservation before retirement. Old production UI will fail closed on retired screens between apply and frontend cutover. Retained legacy reference reads must still work. No silent bypass if guards reject drift. |
| 065 | Replaces only the SMS manager predicate, removing Nurse/health-source permission; retains official announcement/event permission. Guards exact old/new body, caller ACLs and data preservation. | Requires 063 and direct SQL connection with `auth.role()` null. SHARE locks three SMS tables; aborts if any live health-source recipient is pending/attempting. Never fix this by editing recipient outcomes or sending test messages. Auth accounts/sessions are not retired by this SQL. |
| 066 | Replaces history/analytics readers, adds two private helpers; ordinary officials lose linked complaint/KP disclosures; verified person identities are consolidated. No application row changes or table/policy changes. | Requires 061/062 and declared preceding retirement sequence. Preserve replacement-function grants/ownership. Verify own-resident/ordinary official/Secretary/Punong Barangay boundaries in isolation and authorized read-only production checks. |
| 067 | Adds six private V2 workflow tables; extends policy/rule/enrollment/event/audit schema, creates guards/RPCs and replaces shared V1 functions. Existing policy rows default to `legacy_v1`. No policy creation, activation, enrollment, ledger event or score reset is performed by installation. | Validate actual 059/060 objects, named constraints, audit vocabulary and old function definitions. ALTER/constraint operations take locks. Tightens individual V1/V2 credit access to the resident and records administrators; ordinary officials must use aggregate/directory views. V1 values must remain identical. New objects prevent blind reruns. |

No reviewed file deliberately deletes production application rows or drops application tables. This does **not** make their permission/function/constraint changes risk-free or universally reversible. None changes Auth account records or grants essential-service access according to score. No automatic deduction follows a complaint/incident.

### Explicit unresolved privacy/policy items

1. **062 exact credit distributions:** `barangay_safety_analytics` returns exact starting/current score distributions to active officials. 067's separate `community_credit_aggregate` suppresses small buckets, but does not replace 062. This is documented in 067 itself and affects V1 as well as future V2 analytics. Review/resolve the inconsistent disclosure policy with a focused, tested SQL amendment before an unrestricted rollout; do not assume hiding a chart changes backend permissions. No amendment was made or authorized here.
2. **V2 stays inactive:** installing 067 does not make participation awards or resident V2 correction submissions available under V1. Those workflows require an active participation policy. Groupmates must be told they are unavailable; do not label that expected refusal as a migration failure or activate V2 to make a demo pass.
3. **Stale comment in 067:** the transition header says enrollment starts at zero, while the executable transition inserts `v_to.base_score`, and V2 policy constraints require 100/0/100. The executable behavior is a 100-point start; the comment is inaccurate. No code/comment was changed in this preparation.

## Exact artifacts and prior rehearsal

Normalized LF SHA256 (matches Step 2 rehearsed SQL):

| Migration | SHA256 |
| --- | --- |
| 062 | `749cc015d0b4ea25b74e541d76ceb1e086a2796d70452375dee26f4458f5b7f1` |
| 063 | `dc8f0d0b966b1bb99f5478176ba29459ed2aa17201be8c58512f09e6f5338097` |
| 065 | `9498e4cf95bb405eba0d97432b031d4486cfcaf34a20f4299ae690cee9ca1a19` |
| 066 | `0296be99a45e0abbb8275739ec9816adb1cd383560abb584144494512c568d86` |
| 067 | `49c16096b02242d3ea7e9f411c6668068680a8d8bc4ae87f941c5aece3db6f80` |

The Windows 067 file has CRLF SHA256 `51e6e2c3797d3f8d14ca0d4b19bc9304d96a8ed931c6b3c096b78b50a6d97c4d`; normalization explains the difference, not SQL drift.

Prior local evidence in `docs/release-candidate-step2.md`: full sequence applied; original rows/columns preserved; V1 scores 85/100/100/n/a preserved; no automatic V2 state created; 062 89 contracts, 063 24, 066 34, 067 28, concurrency 11 and correction smoke 11 passed. Later authenticated API rehearsal passed 68 assertions. These are synthetic/local results, not fresh production proof. The 062 stage harness predates 066's replacement privacy contract and must not be treated as the final privacy expectation. **Never run these fixture-writing behavioral harnesses on production.**

Latest frontend/static evidence from the preceding review: 2,685 Jest tests/120 suites, production build and 48 static checks passed. No source/migration changes now require repeating the full suite; document/SQL-preflight preparation is not an executed production validation.

## Backup and recovery plan — before any execution approval

The project was reported as Free. Do not assume accessible daily backups/PITR. Supabase recommends regular exports for Free projects. Database backups contain Storage metadata, not the actual stored files. References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/kb/faqs/platform/free-plan-backups . Check current project capabilities with the owner.

1. Agree recovery owner, downtime window, acceptable recovery time/data loss and a way to halt application writes/jobs during cutover. No controls are changed by this plan.
2. Obtain **separate authorization for a sensitive data backup**: it includes real records and Auth data/password hashes, unlike the earlier schema-only export authorization. Store encrypted with restrictive ACLs outside the repository, e.g. a private encrypted recovery volume chosen by the owner; retain a protected off-device copy. Never print contents or upload to GitHub/Vercel/chat.
3. Capture recoverable schema, data, sequences, privileges/custom roles and Supabase migration ledger, with explicit coverage of application and Auth schemas. Confirm exact pg_dump/CLI exclusions: a default schema-only/public-only dump is insufficient. Capture managed-schema restoration limitations and role-password handling. Do not dump system-role secrets unnecessarily.
4. Inventory Storage buckets and privately preserve relevant file objects plus metadata; separately record secure recovery procedures for Auth redirect/provider/SMTP settings, secrets, Edge Function configuration and hosting variables. These are not all restored by a PostgreSQL dump. No key rotation or configuration change is part of this task.
5. Use an SSL-verified connection and protected pgpass/secure prompt; never put passwords into a URI, command history or report. Verify client/server version compatibility and dump completion/checksums. The old schema-only snapshot is not a current data recovery point.
6. Restore and verify on an existing **local disposable** Supabase-compatible environment, without creating a hosted project. Use approved protected handling of real backup data, disable outbound email/SMS/webhooks/jobs and never expose the restore through the frontend or upload it. Restore evidence must include rows, sequences, constraints, grants/RLS, Auth consistency, Storage coverage and recovery duration. If real-data restore is not authorized, that recovery gate stays open.
7. Export a private pre-change V1 manifest: policy state, rules, enrollments, ledger, server-calculated score per resident, and canonical private fingerprints of preserved rows. Keep identifying values private. Reconcile changes under a write pause or record legitimate concurrent writes; raw counts alone are insufficient proof of preservation.

### Failure handling

- Every migration includes its own transaction. On any error, stop and verify rollback of **that file**; earlier committed migrations remain applied. Never retry the entire directory or insert 064 to fill the gap.
- 062 has no reviewed standalone rollback file. Capture original definitions/dependencies and prepare/rehearse a targeted forward repair or removal of only new unused objects. Do not improvise CASCADE cleanup.
- `063_rollback_contingency.sql` restores retired permissions/policies: emergency-only; compare against the fresh production catalog, not just the old snapshot.
- `065_rollback_contingency.sql` reopens Nurse SMS authority; separate authorization required.
- `066_rollback_contingency.sql` reopens complaint disclosures. Prefer forward repair while preserving restrictions.
- `067_rollback_contingency.sql` is an uninstall guarded against any V2 use. Once V2 data exists it refuses; do not delete history to satisfy it. A policy restore transition is not a schema rollback and would itself require separate approval. Uninstall also widens individual credit visibility back to V1's older rule.
- Revert/redeploy the frontend separately if necessary, accounting for intentional retired-endpoint denial. Database restore is last resort, coordinated with write pause and reconciliation; it may overwrite post-backup transactions. No automatic rollback is approved.

## Ordered execution checklist — NOT authorized to execute

### A. Read-only preflight / GO review

1. Owner verifies project identity and supplies an existing protected SQL connection or runs the prepared read-only script in the existing project's SQL Editor. No password in chat. Prefer an existing minimally privileged inspection role; **creating/granting a new role would be a separate production write**. An existing admin connection must be constrained to a read-only transaction for inspection.
2. Record server version, extensions, catalog signatures/owners/search paths, table/column/constraint/trigger/index state, policy/grant state, actual migration ledger if present, and private exact old/new function comparisons. SQL Editor deployments may not populate a ledger; filenames/comments are not proof of installation. Detect partial/manual equivalents or collisions before deciding which files to apply. Do not replay an already installed CREATE-based file.
3. Evaluate every 063/065 guard condition read-only, future unresolved reservation count, pending/attempting live health SMS count, current role links, table sizes/locks, and V1 100/0/100 model/enrollments/ledger integrity. Investigate every mismatch; no stubs, no weakened guards or invented statuses.
4. Resolve the analytics distribution privacy policy, verify any resulting exact amendment in isolation, and refresh the artifact manifest/test evidence if SQL changes.
5. Complete backup and recovery rehearsal above. Record pending operational decisions (reservation resolution, Nurse account/session retirement, outbound jobs) for separate owner authorization.
6. Present final preflight results, exact file hashes, timeouts/maintenance plan and recovery evidence for explicit **migration execution approval**. Current result is NO-GO until these gates close.

### B. Approved migration window (future)

7. Keep Git/main and production frontend unchanged until its separate gate. Coordinate short maintenance/write pause, background workers and old UI behavior. Ensure 062's transient privacy contract cannot be used before 066 is committed, using an approved access/maintenance plan; an informational banner alone does not block API access.
8. With authorized direct SSL SQL access, `ON_ERROR_STOP` enabled and reviewed session lock/statement timeouts, apply individually: **062; verify → 063; verify → 065; verify → 066; verify → 067; verify**. Do not wrap files containing BEGIN/COMMIT in an assumed all-or-nothing outer transaction. Do not execute 001–061 or 064. Do not invoke transition preparation/approval/activation RPCs.
9. If any guard, timeout or validation fails: stop, keep main unchanged, diagnose actual committed state, and obtain recovery/forward-repair approval. Do not weaken checks or fabricate production fixture rows.

### C. Post-migration read-only verification (future)

10. Compare preserved records/V1 scores with the private manifest; confirm original data, links, enrollments and ledger remain intact. Confirm active policy remains legacy V1 and installation created zero V2 workflow records/transitions. Verify all new private tables have RLS enabled and no client direct read/write grants; only intended authenticated RPCs execute; private helpers deny direct execution.
11. Compare final RPC argument names/types/returns and grants against frontend calls, including `barangay_safety_analytics(date,date,text,text,text)`, `repeated_dispute_analytics(date,date,text)`, `person_analytics(text,uuid,date,date,text)`, `person_history(text,uuid)`, activity list `(integer)`, resident correction reader `()`, existing V1 profile/admin/directory readers and new V2 workflow signatures. Recheck API resolution. If SQL exists but PGRST202 persists, diagnose schema cache; any reload request is a separately authorized operational action.
12. Authorized resident read checks: own profile/credit only; another resident denied. Ordinary official: no individual credit/private complaint payload; permitted aggregates only. Secretary/Punong Barangay: expected protected records access. Anon: protected RPCs denied. Nurse: retired direct write/RPC/SMS authority denied. Do not infer enforcement from hidden navigation. Do not impersonate production users or create synthetic production accounts without approval.
13. Ensure old production document/complaint/KP services and Auth still function read-only. Any new write smoke test needs explicitly authorized clearly labelled records and cleanup/audit rules; do not inject the local harness or fabricated resident records into production.

### D. Separate frontend approval and smoke gate (future)

14. Present database verification and exact reviewed candidate/diff for **separate main merge/push/deployment approval**. Recheck remote main, deployment hooks and intended Vercel environment. No service-role key in the frontend. Deployment is not authorized by migration approval.
15. After approved frontend release: public pages/maps; login/session/logout; resident own-profile/documents/complaint status; official request/KP/resident/incidents/Tanod screens; Analytics filters and privacy; V1 gauge/ledger/labels; V2 inactive messaging. Verify correction/award controls are appropriately unavailable while V1 is active. Do not claim V2 is active or functional under V1.
16. Run critical mobile/desktop interactions and final eight-width gaps (320/375/414/768/1024/1280/1440/1920), including dialog scrolling, navigation/Escape/focus, map teardown/markers and chart/table overflow. Existing partial browser evidence does not certify all pages. Monitor API/console errors without collecting private payloads.
17. Before groupmate access, explicitly agree permitted production actions/accounts and data visibility. An existing production site remains production even when called group testing; groupmates must not receive privileged access to genuine resident data merely to explore unfinished workflows.

## Needed next

- Secure read-only catalog access or owner-executed preflight results (no passwords/raw private schemas in chat).
- Privacy decision/focused amendment for exact credit distributions.
- Separate authorization and secure destination for sensitive full backup/restore rehearsal.
- Maintenance/operational decisions and then separate migration, frontend deployment and any production write-test approvals.

No application or migration code changed. Prior checkpoints, branch history, SMS seed, temporary fixture, diagnostics and private backups remain preserved. Stop here; production execution is **not approved**.
