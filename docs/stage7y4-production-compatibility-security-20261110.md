# Stage 7Y.4 — Production compatibility and security reconciliation

November 10, 2026. **Structural presence confirmed by owner; functional compatibility and authorization unresolved. Deployment remains NO-GO.** No hosted SQL or application RPC executed here.

## Evidence boundary

Accepted owner-confirmed evidence: 88 migration-version entries, 64 public-policy metadata rows, all 45 required relations present as ordinary tables, all 104 required function names present with one overload each. Basic existence checks were not repeated. Full exports, actual signatures and policy rows were not supplied in this turn: there is no honest way to report a current policy-by-policy match from counts alone.

Reviewed current CRA frontend API wrappers, CreditProfile, document submission, complaint/KP APIs, local declarations and security foundations, 068/069 and earlier reports. No application code, environment or migration changed. The bounded declaration extraction covers 103 of the 104 function names; `is_official(uuid)` is an expected baseline helper whose CREATE definition was not found in the inspected local files. That is a provenance gap, not a missing hosted function.

Local 043 documents deployment through multiple connector calls plus a correction and possible formatting differences. This supports why timestamp-ledger entries do not map one-to-one to numbered files. Its historical verification comments are not current production authorization evidence.

## Expected contracts

See `docs/stage7y4-local-rpc-contracts-20261110.md` for local argument/default/return declarations and source migration for every required function/helper name. This is source extraction, not an SQL parser or proof of deployed definitions. The proposed 068 guard is explicitly identified by its source filename. Compare argument names as well as types: PostgREST named JSON arguments must match, and a single existing overload can still be incompatible. Default argument counts, return columns, JSON shapes, exposed schema and schema cache also matter.

Representative exact frontend contracts:

| Surface | Required contract / response |
|---|---|
| Resident V1 credit | `my_community_credit_profile()` returns JSONB with `profile`; `community_credit_profile(p_resident_id uuid)` returns the profile object directly |
| Credit display | `configured`, `enrolled`, `current_score`, `maximum_score`, `policy_name`, `credit_started_at`, `starting_score`/`base_score`, `event_total`, positive/negative/repair counts, `last_credit_event_at`, resident summary and `ledger` array; ledger uses id/verified_at/event/category/points/source/source_reference/verified_by |
| Credit administration | Existing policy/rule/admin/enrollment RPCs only; activate/retire take `p_id`; save policy takes p_id/name/description/base_score/minimum_score/maximum_score; no V2 workflows |
| Resident complaint | `file_complaint_as_resident(p_category text,p_narrative text,p_location_note text,p_respondents jsonb)` returns reference text; subsequent own complaint SELECT must resolve its id for evidence upload |
| Complaint detail | parties/history/attachments readers take `p_complaint_id`; preserve their privacy-shaped table returns, not unrestricted private table reads |
| KP | `kp_case_for_complaint(p_complaint_id uuid)` returns rows; frontend accepts zero rows as no accessible case. Hearing/panel/party readers use p_case_id; attendance uses p_hearing_id. Writers must retain source-declared named parameters and server-stamped actor/time |
| Incidents/analytics | incident_queue and map/aggregate readers use existing p_from/p_to/p_type contracts as applicable; details take p_incident_id. Map uses real nullable coordinates, not invented points; public safety uses aggregate RPCs only |
| Directory/verification | directory readers; save resident payload; `set_barangay_resident_eligibility(p_resident_id uuid,p_active boolean)`; direct profiles PATCH remains a separate entry point |
| Tanod | own identity/duty/reports derive current JWT link; check-in p_assignment_id, check-out p_attendance_id, followup p_incident_id/p_note; no caller-selected operational identity |

JSONB return types cannot prove these keys. Fingerprints cannot explain a function body. Owner/private semantic review of effective definitions is still needed, followed by separately authorized real API tests; do not invoke production RPCs to discover their shapes.

## Required columns, constraints and relationships

| Area | Source expectation to compare |
|---|---|
| profiles | UUID id linked to Auth identity; role/email/system_id/created_at, full_name and first/middle/last/suffix, contact_number/purok/photo_url/id_document_url, verification_status/verified_by/verified_at/verification_notes. All 18 expected fields needed by 068; role vocabulary must retain resident/official/Tanod support. Full original baseline constraints/defaults remain a provenance gap |
| document_requests | id, resident_id, document_type, full_name, contact_number, purok, purpose, additional_notes, status, reviewed_by, reviewer_notes, created_at, updated_at. 001 declares UUID PK; resident_id/reviewed_by reference auth.users; statuses pending/approved/declined/ready_for_pickup/claimed. Later guard/RLS must preserve authorized transitions and immutable resident request fields |
| Credit policies/rules | policy base/min/max and draft/active/retired lifecycle; partial unique active-policy index; rules reference policy, unique policy/rule_code, category/sign/source constraints. 060 requires 100/0/100 activation model; do not infer actual policy values from schema |
| Credit events/enrollment | events reference directory resident, policy, rule and verifier; immutable event guard, snapshots and unique reversal link. Enrollment resident/policy pair unique, starting_score=100, constrained enrollment_source. Directory resident UUID is distinct from profile/Auth UUID; linkage must be preserved |
| Complaints | id/reference/category/narrative/location/status and filing/encoding actors/times per 040; unique references, parties/status history/attachments FK to complaint; attachment object paths unique; private reader/storage visibility predicates. Link metadata must not be conflated with proved wrongdoing |
| KP | cases reference complaints and confirmed screenings, unique complaint-case relationship per 043; panel/hearings reference case, attendance references hearing/party; status/proceeding/outcome constraints, immutable/protected record triggers; later conclusion and followup support must remain |

The new column/constraint/index queries cover all 45 retained relations to avoid omitting dependencies such as directory, notification, incident and Tanod tables. Column numbers returned by the column query resolve FK arrays. Constraint hashes do not prove their semantics, and default hashes do not prove pending/null signup values without a trusted comparison. Partial unique indexes require index inspection separately from pg_constraint.

## Authorization expectations, not current verified enforcement

- Real actors use Auth-issued JWTs; all ordinary authenticated roles share the Postgres authenticated role. EXECUTE=true cannot distinguish Secretary from another official; internal checks must do that.
- Secretary/Punong identity must resolve profile role → explicit official_account_links → non-archived official position, never display-name matching.
- Resident profiles/documents/complaints need own-record access boundaries; anonymous tracking remains limited to the existing reference/contact lookup contract.
- Ordinary officials may see complaint queue summaries but not protected full narratives/party data. Secretary/Punong have source-defined detail rights. Walk-in encoding is Secretary-gated; KP opening/outcome/conclusion are Punong-gated; administrative KP operations/readers use their source-defined Secretary/Punong checks.
- Private complaint party/history/attachment and KP tables must not acquire direct ordinary-client grants merely because official RPCs need them. Incidents/Tanod and credit tables likewise use their reviewed gated surfaces.
- Credit access must use the linked resident; scores remain server-calculated with immutable ledger and no automatic complaint/incident deductions. Policy/rule management uses existing admin checks.
- Tanod operational reads require a legitimate active account link and permitted assignment/incident scope. Anonymous detailed-incident/directory/verification writes must fail.
- Historical nurse/reservation records and frontend retirement do not imply backend permission revocation.

The reported 64 policy rows cannot establish these predicates, grant coverage, permissive OR interactions, owner/bypass privileges or trigger guards. The existing Stage 7W output already requested policy fingerprints and NULL checks; obtain its actual rows rather than re-counting policies. A NULL WITH CHECK is not itself proof of a bypass: command semantics, USING fallback, other policies and triggers all matter. Review full effective definitions privately when hashes cannot settle meaning, including private definer writers. Do not publish bodies/settings that may embed secrets.

## 068/069 assessment and conflicts

Order: **068 then 069**, independent of absent 061–067. Foundations 007/011/012/022/031/044/055/056 must match; no 064. 068 expects exactly its two UPDATE policy paths (and no unexpected UPDATE/ALL paths), 18 columns and unconditional compose-before-guard trigger bindings: compose tgtype 23, guard 19; notify/sync AFTER triggers type 21, enabled O. Unknown BEFORE UPDATE triggers intentionally block it. 069 expects the single reviewed own INSERT path/no extra INSERT/ALL path and the reviewed guard marker; that marker is not cryptographic proof.

068 constrains direct UPDATE policies and the trigger, protects stable identifiers/role/metadata, uses server actor/time for decisions, permits defined pending resubmissions and retains AFTER notifications/sync. 069 constrains own INSERT to pending resident/null decision stamps. Neither secures every privileged Auth/service/private writer or changes SELECT privacy. Review signup defaults and effective trigger function behavior separately.

Potential conflicts: additional cloud policies/triggers, different owners/defaults, private Auth updates, unknown future profile columns, stale client UPSERT payloads, archived/unlinked official behavior and metadata corrections. 068's allowlist deliberately fails closed on unknown columns. Existing Tanod verified-name help text may disagree with 068's resident-only reset; actual affected accounts unknown. Direct Verify/Reject zero-affected-row reporting remains an existing P2 UI concern.

Both files use transactions and short timeouts, no backfill. Failed DDL should roll back within its transaction; inspect editor state, do not blindly retry. After commit, rollback requires reviewed definitions/forward repair, not just SQL ROLLBACK. Restoring old broad policies reintroduces the vulnerability. Preserve private full definitions and verified recoverable backups before any separately approved production change. Business notifications, email/SMS/webhooks and platform logs may not be reversible; SQL rollback is not external-side-effect containment.

## New minimum remaining catalog inspection

`supabase-tests/production_contract_compatibility_readonly.sql` contains six queries for unanswered contracts, not basic presence: (1) function arguments/default-count/results/owner/grants/fingerprints; (2) columns/type/nullability/default hashes; (3) constraints/FK endpoints; (4) indexes/partial uniqueness fingerprints; (5) effective table/column privileges with RLS; (6) exact profile/Auth trigger bindings. No policy-count query or version/existence recheck is included. Use previously captured policy and version exports.

Every statement reviewed: BEGIN READ ONLY; three SET LOCAL settings (transaction-local only); six catalog SELECTs; ROLLBACK. Built-ins format/hash definitions or check privileges and do not execute the inspected defaults/functions/triggers. No DML, DDL, dynamic SQL, role impersonation or application record reads. The normal authorized SQL Editor admin role (usually postgres) needs catalog visibility and managed-role availability; missing roles/permissions can cause errors. Do not adjust grants or stub objects to overcome failures. Metadata can be confidential; keep exports private. SQL syntax/database behavior has not been executed or certified here.

## Separate future authorization-test plan — NOT EXECUTED

Use synthetic identities in a separately authorized safe disposable environment only. Neither existing production project is approved for fixtures/writes. No suitable environment is assumed available. Block mutation tests until environment identity/provenance, external-delivery containment, genuine accounts, cleanup and exact migrations are separately approved.

| Actor | Expected read boundaries | Controlled write expectations after patches |
|---|---|---|
| Anonymous | Public pages/coarsened safety; no private profiles, credit or complaint detail | Direct verification INSERT/UPDATE/UPSERT and eligibility RPC denied |
| Resident | Own profile/documents/complaints/linked V1 ledger; other resident denied | Legitimate pending signup/contact edit/resubmission allowed; self-verification, forged metadata/role/id and other-user edits denied |
| Secretary | Source-authorized directory, protected complaint detail/KP admin and ordinary portal reads | Resident verify/reject/ineligible/reinstate allowed with server stamps; document transitions per existing rules; no Punong-only KP outcome/open/conclusion |
| Punong | Source-authorized records/detail/KP | Verification decisions plus source-defined Punong KP actions; document actions still follow their actual Secretary-specific rules, not blanket admin authority |
| Other official | Only source-authorized summaries/incident/credit views | Verification direct PATCH, INSERT/UPSERT bypass and eligibility RPC denied; no protected complaint/KP expansion |
| Tanod | Linked own duty/reports/roster as permitted; no Official portal/private resident records | Verification denied; operational writes only for valid assignment/incident scope |

Add archived/unlinked Secretary/Punong denials, profile-less signup INSERT negatives, conflict UPSERT candidates, mixed allowed/protected updates, immutable fields, service/maintenance and private definer writer cases. Prove baseline permissions before attributing a denial to 068/069. SQL Editor impersonation is not a replacement for JWT validation.

Read/session API checks require explicit legitimate accounts and separate authorization; inspect mount effects before visiting pages (notification reads/status changes can write). Do not treat a SELECT-looking RPC as side-effect-free without body review. All registration, INSERT/PATCH/UPSERT, verification, document/complaint/KP actions, check-in/out, credit changes, notification marking and storage writes require controlled-write approval. No test in this plan was run.

Assertions: allowed writes affect exactly one intended row; denied attempts leave persisted state/notification/directory/audit/credit invariants unchanged. Distinguish invalid JWT, absent grant, RLS-filtered zero rows, guard error, invalid payload and duplicate key. Duplicate-key failure is not INSERT-security proof. Use independent observer checks and an exact fixture manifest; no broad deletion or assumed transaction-wide API rollback. Separately approve Auth/storage teardown and external sinks. Keep tokens and records out of evidence.

## Prioritized blockers and next actions

1. **P1 security:** earlier source/owner-supported broad verification UPDATE and conditional self-INSERT exposure remain unresolved in current effective definitions. Do not declare 068/069 applied or enforced from existence.
2. **P1 validation gate:** 068/069 lack actual database/JWT authorization proof and recovery rehearsal; no safe mutation environment is currently approved.
3. **Compatibility gate:** actual signatures, JSON contracts, column/default/constraint/index shape and grants need output comparison; no current mismatch proven from counts alone. Baseline is_official definition remains unverified.
4. **P2:** zero-row verification success reporting and prospective Tanod wording mismatch; no code fix in this audit.
5. **Additional gates:** Storage policies, Edge/SMS configuration, Auth settings, PostgREST schema cache and full private-writer/SELECT privacy review are not proved by this inventory.

Next: provide existing policy/version exports and the six new catalog result sets after manual read-only approval. Reconcile actual contracts and semantic definitions, explain each mismatch, then seek separate safe authorization-test/recovery approval. Do not run migrations merely to align filenames. **NO-GO for deployment remains; object-presence reconciliation is complete but security/functionality reconciliation is not.**

## Files and verification

Added this report, local RPC-contract appendix and prepared catalog SQL only. No code/migration/configuration modified; no new V2. Offline extraction found 103 local declarations plus the unresolved baseline helper; prepared SQL reviewed without execution. No Jest/build rerun for documentation/query-only work; earlier 2,635 tests/120 suites are historical results, not fresh database evidence. `git diff --check` passed (exit 0, existing line-ending warnings). SHA-256 hashes of 068/069 match the preserved Stage 7W/7X values.
