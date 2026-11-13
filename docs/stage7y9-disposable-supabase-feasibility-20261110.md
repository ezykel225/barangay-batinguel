# Stage 7Y.9 — Disposable hosted Supabase staging feasibility

November 10, 2026. Defense November 16/18. **Status: BLOCKED for reproducible setup/execution today; technically feasible conditional on baseline, capacity and approvals.** Production deployment remains NO-GO.

## Local findings

- Local migrations contain 001–060, prepared 068/069; 061–067 absent. No 064. Neither security migration changed.
- **001 cannot bootstrap an empty managed project.** Its first operation creates a policy on existing reservations; it then drops an existing profiles role constraint and reservation policy, references existing profiles/Auth/officials and only later creates document_requests/waste_schedule. Original baseline tables, constraints/policies/triggers/defaults/grants are not fully defined by these files.
- Baseline examples needing authoritative definitions: profiles, reservations, barangay_officials, residents_registry, activity_log, announcements/events and legacy availability/health tables referenced by historical files; is_official(uuid) CREATE remains absent locally. Managed Supabase Auth objects are supplied by the platform, not by importing another project's managed internals.
- Existing column/constraint/index/function fingerprints are not a restorable schema. Catalog contracts provide strong comparison targets but do not reconstruct missing bodies/check expressions/policies. Previous private baseline recovery was documented historically; no currently validated, sanitized, hosted-compatible complete reconstruction package was established in this stage. No archive/data inspected, no production export requested or performed.
- The local supabase folder contains functions and local linking metadata, not a complete checked-in database bootstrap/configuration bundle. Do not expose or reuse its project link to provision or migrate production accidentally.
- History is not a clean declarative setup: migrations contain data corrections (027), backfills and exact old-policy assumptions. 030's initial official-link backfill requires unambiguous profile/name matches and aborts on unmatched/duplicate links. Synthetic fixture ordering must satisfy a reviewed setup plan; do not weaken its assertions or insert genuine official identities just to replay it.
- 043 documents multiple application chunks/corrections. Timestamp ledger identifiers cannot substitute for a dependency plan; version export remains missing. Missing 061–067 are not dependencies of 068/069 and must not be recovered blindly to fill numbers.

## Safest reconstruction route

Prefer an already preserved, privately reviewed schema-only application baseline **if** its completeness, provenance, compatibility and absence of production records/secrets can be independently verified. Otherwise missing baseline definitions must be recovered from authorized existing evidence or a separately approved schema-definition collection. This task does not authorize a new production export.

Build an explicitly reviewed application-schema reconstruction manifest: exact DDL objects, dependencies, owners/grants/RLS, helpers, trigger bindings, extensions, Auth signup binding and only required Storage definitions. Keep managed Auth/Storage system schema creation under Supabase management. Do not fabricate stubs from frontend expectations, copy production Auth identities/records or treat partial CSVs as a dump.

Two baselines serve different tests:

1. Reviewed legacy application state before 068/069 for vulnerable negative controls and patch attribution.
2. The same state after exact unchanged 068 → 069 for positive/negative JWT regression tests.

A minimal verification fixture still needs real directory/notification/audit/helper dependencies and V1 059/060 integration. A full defense-app staging adds complaints/KP/incidents/Tanod/public safety/storage. Narrow scope reduces records, not permission realism. Do not remove guards, replace Auth with mocks or silently skip missing dependencies. Do not replay migrations already represented in the baseline; compare objects and record the precise boundary first.

## Synthetic accounts and data

Required real test Auth accounts: Resident A/B; distinct Secretary and Punong; ordinary Official; Tanod. Additional cases: archived/unlinked officials, resident pending/rejected/verified/ineligible states and a designated profile-less Auth identity if a legitimate reachable insertion path can be established. A profile collision is not proof against forged INSERT.

Create explicit synthetic official directory appointments and official_account_links for Secretary/Punong/other official, preserving unique links and active/non-archived position semantics. Tanod needs active roster/account link and controlled assignment for own-duty access. Resident directory profile_id linkage must use exact Auth/profile UUIDs. No matching real people by name, no real residents or genuine appointments in fixtures.

Local `supabase-seeds/seed_demo_barangay_residents.sql` and preserved SMS demo seed exist; these are not complete Auth/official-link fixtures. The SMS seed header specifies synthetic residents with NULL mobile numbers and no existing-row updates. Review exact seed transactions, collision checks and prerequisites before any separately approved use. Do not edit or automatically run either seed. No fixture payloads were copied into this report.

## Delivery containment

- In-app notifications are database rows with audience/read-state logic; test those rows independently from external delivery. 022 catches notification errors, so a committed decision does not prove notification creation.
- `send-sms-broadcast` calls a live IPROG provider through its worker path. Source requires `SMS_BROADCASTS_LIVE_ENABLED === 'true'` plus provider/server credentials for live processing. In staging, do not deploy/enable the sender or copy production secrets. Dry run still writes broadcast/recipient state and is not read-only.
- Legacy `notify-reservation-sms` is a separate sender using provider configuration; do not assume the new broadcast live flag controls it. Leave it undeployed/unconfigured for security testing. Frontend retirement does not guarantee sender isolation.
- Supabase Auth signup/recovery/confirmation can send email. Use separately approved synthetic mailboxes/sinks and Auth settings; no real recipients. Admin-created confirmed accounts do not validate real registration/confirmation.
- Review database webhooks, schedules, cron/pg_net, Edge functions and imported function defaults/bodies for outbound paths. Platform defaults and an empty project do not prove containment. If any delivery cannot be bounded, stop before writes.
- No staging frontend/build may point to production; verify endpoint at request time and forbid fallback. No automatic GitHub/Vercel integrations or shared production keys added for this rehearsal.

## Reconstruction and recovery checklist — not executed

1. Obtain explicit disposable project/resource/cost approval, exact endpoint/operator and cleanup scope. Neither current project may be repurposed, paused, reset or changed.
2. Owner checks current Supabase Dashboard organization plan, active-project limits, entitlement to additional capacity/branching if relevant, available budget, region/Postgres/extension compatibility, backup/restore/export features and retention. These capabilities/prices were **not verified live** and are not assumed available on Free. No resource creation or plan change approved here.
3. Establish reviewed complete sanitized baseline and dependency manifest; decide fresh legacy reconstruction vs already represented migration boundary. Include full definitions privately, never raw records/secrets in Git.
4. Apply only the separately approved test setup to the separately approved endpoint. Keep system schemas managed, reproduce ownership/grants/trigger bindings, label all data synthetic, contain delivery and create real Auth/link fixtures. No commands executed now.
5. Verify the known 45-table/104-name contracts plus exact security semantics, default values and test-only inventory; a matching name/count alone is insufficient. Validate own-read baseline and ordinary permitted edits before negative controls.
6. Prove recreation **before** relying on recovery: repeat the same reviewed setup through a second approved empty fixture/environment or a provider-supported safe recovery path within approved capacity. Compare semantic objects/grants/triggers and manifest counts/relationships; Auth UUIDs may differ, so remap deliberate fixture IDs rather than expecting platform identifiers byte-identical. If capacity/recovery permissions are unavailable, this verification is blocked—not “verified by checklist.”
7. After a separately approved migration/write gate, run 068 then 069 and Stage 7Y.8 JWT matrix, including downstream directory/notification/V1 invariants. Do not call a legacy psql harness directly in SQL Editor; it needs a reviewed hosted adapter.
8. On failure, stop, preserve sanitized evidence, inspect transaction state and restore/reconstruct only the disposable fixture under explicit approval. Never change production or silently relax tests. Committed API calls/Auth/storage/external delivery are not undone by a final SQL rollback.
9. Approved teardown is manifest-driven; immutable audit/credit ledger cleanup may require whole approved disposable-fixture recovery rather than bypassing guards. No broad deletion and no automatic project deletion. Retain private recovery definitions and safe results per owner policy.

## Effort estimate and blockers

Planning estimates, not measured execution or guarantees:

| Work | Conditional effort |
|---|---|
| Owner capacity/access/delivery approvals | Owner/provider dependent; not estimable locally |
| Validate an already complete sanitized baseline and setup manifest | Roughly 0.5–1 working day if usable evidence is available |
| Recover/reconcile missing baseline from authorized definitions | Roughly 1–3+ working days; can expand substantially if provenance is incomplete |
| Synthetic Auth/position/role fixtures and hosted test adapter | Roughly 0.5–1 working day after schema setup is reliable |
| Independent recreation, JWT/side-effect tests and failure investigation | Roughly 1–2+ working days; defect repair/review additional |

These tasks are dependency-bound, not an assurance of completion before November 16/18. Avoid promising a quick project-create-and-run-migrations shortcut.

**Hard blockers now:** no approved hosted capacity; incomplete original schema bootstrap; unvalidated sanitized reconstruction artifact; no approved synthetic identities/delivery configuration; no proven recovery/recreation; no ready hosted harness. **Not blockers to continued offline preparation:** missing version CSV alone and absent pending 061–067, provided the required foundation is reconstructed from actual approved definitions.

**Final feasibility: BLOCKED today, CONDITIONAL technical feasibility.** READY requires the baseline to construct successfully and repeatably under an approved plan/environment with genuine Auth and contained effects. There is no verified recreation procedure yet. Next safest action is owner capacity decision plus identification of an existing complete private baseline for separate authorized validation; continue honest stable-V1 defense preparation in parallel. No production deployment/security approval follows from this review.

## Scope verification

Only this report added. Local file inspection only; no hosted SQL/RPC, project creation, production export, real resident records read, migrations, application/configuration changes, Docker/PostgreSQL, commits/push/deployment. Existing seeds/history/uncommitted changes preserved. No Jest/build rerun for feasibility-only documentation. `git diff --check` passed (exit 0; existing line-ending warnings); SHA-256 hashes of 068/069 remain unchanged.
