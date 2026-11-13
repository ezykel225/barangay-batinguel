# Stage 7Y.1 ? Supabase reconciliation audit

November 10, 2026. **Preparation only; hosted schema compatibility UNKNOWN; deployment NO-GO.**

## Evidence and scope

Branch `defense/scope-cleanup-20261106`, HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`. Existing extensive uncommitted work is preserved. Reviewed current App routes, local relative-import graph, API wrappers, migration object declarations and security-affecting definitions, 068/069, Stage 7W/7X reports and existing preflight. This is a structural dependency/reconciliation review, not a fresh line-by-line security certification of every historical migration. No hosted connection, SQL execution, Auth session or credentials used.

The bounded static traversal reached 148 JS/JSX modules and identified 90 literal RPC/wrapper names (including the resident-directory conditional). Imports/API wrappers can include unused exports; these are a conservative compatibility checklist, not proof every operation runs on every page. Dynamic/runtime dependencies require separate verification.

## Local migration inventory and order

The current folder contains 001?060 plus prepared 068/069. **061?067, including 064, are absent from this checkout.** Historical branches/reports are not proof of current hosted installation. Do not replay absent numbers or merge old SQL to fill gaps. 001 assumes pre-existing baseline objects; it is not a complete empty-project bootstrap.

Review groups: 001?012 baseline documents/profile protections/name composition/storage/reservation logic; 013?014 legacy health; 015?017 audit; 018?019 official archive/terms; 020?025 reservation/notifications; 026?039 official links/availability/identity/grant hardening; 040?043 complaints/evidence/KP; 044?049 incidents/Tanod/public aggregates; 050?053 case support and authenticated Tanod; 054?057 directory/sync/eligibility/map location; 058 SMS; 059?060 V1 credit/enrollment. Retired-service migrations can still contain shared retained dependencies (especially notifications/audit).

Future sequence: obtain inventory and reconcile actual definitions first; establish full private backup/recovery evidence and separately approved safe behavioral validation; apply only genuinely absent reviewed prerequisites in dependency order if separately authorized; security correction **068 ? 069**. Foundations 007/011/012/022/031/044/055/056 are required, not pending analytics/V2. No 064 and no automatic 062?067 rollout. Ledger versions alone do not prove installed definitions, especially SQL Editor-applied changes.

068 narrows both permissive UPDATE policies and guards protected fields/verification metadata, uses linked active Secretary/Punong helpers, stamps server actor/time and permits defined resubmission. 069 constrains own INSERT to pending resident/null decision metadata. Both use transactions/timeouts/preconditions, do not backfill, and remain unexecuted. Unexpected policies/triggers cause intentional aborts. Signup/private definer/service writers bypassing ordinary RLS need separate review. 069?s message marker is not a full fingerprint of 068. Preserve old definitions privately; hashes are not backups. Forward repair is preferable to restoring known overbroad policies.

## Reconciliation matrix

| Category | Current evidence | Resolution |
|---|---|---|
| Required and present | Local declarations/callers below; **no currently confirmed hosted object** | Mark hosted present only after catalog output and definition/signature review |
| Required but missing | **No hosted absence established** | Inventory MISSING rows identify candidates; permission errors are not absence or authorization success |
| Existing but potentially obsolete | Legacy objects listed below; hosted existence unknown | Preserve historical records and shared dependencies; no deletion recommendation |
| Unknown pending cloud inspection | Every hosted relation, overload, trigger, policy, grant and installed version | Collect inventory and Stage 7W outputs privately |

### Retained feature dependency map

| Feature | Required objects / boundary |
|---|---|
| Auth, registration, roles | auth.users; profiles; compose_full_name/signup/guard; official_account_links and linked-position helpers; Auth settings not proven by catalogs |
| Public pages/Officials | announcements, events, barangay_officials, barangay_terms/members, official_availability, kapitan_availability/status; optional status row may be absent but schema still required |
| Resident/Official documents, Reports | document_requests, profiles, activity_log; document status guard and notification triggers; reports reuse retrieved data, no separate reports table assumed |
| Complaints/KP/case support | complaints/parties/status_history/attachments/screenings; kp_cases/panel/hearings/attendance/followups; case_support_events, incident_case_links; authorized RPCs below |
| Directory/verification | barangay_residents, profiles; directory/save/eligibility RPCs, verification notifications and sync; residents_registry remains legacy complaint/reference data, not authoritative directory |
| Incidents/blotter | incidents, blotter_entries/history, incident_tanod; queue/detail/write/history/map-location RPCs |
| Official Safety Map/Analytics | existing incident_queue/map_points/counts/trend/location readers; projection in frontend is not a substitute for backend access control |
| Public Community Safety | public_safety_* aggregates only; no public detailed-incident reader |
| Tanod | members/assignments/account_links/attendance/operation_events/incident_notes; JWT-linked own-duty/reports and official administration |
| Community Credit V1 | policies/rules/events/enrollments; server-calculated profile and immutable ledger/enrollment guards; no V2 activation |
| SMS/notifications/audit | sms_source_rules/broadcasts/recipients, notifications/notification_reads/activity_log; send-sms-broadcast Edge Function and private provider configuration (not inspected) |

Supabase Auth, Storage buckets/policies (`id-verification`, `resident-photos`, `official-photos`, complaint evidence), Realtime/publication if used, Edge deployment and provider configuration are additional compatibility gates. Catalog inventory does not prove these work. Never invoke SMS preview/dispatch or business RPCs in production merely to discover availability.

### Required relations checked by the inventory

`activity_log`, `announcements`, `barangay_officials`, `barangay_residents`, `barangay_term_members`, `barangay_terms`, `blotter_entries`, `blotter_entry_history`, `case_support_events`, `community_credit_enrollments`, `community_credit_events`, `community_credit_policies`, `community_credit_rules`, `complaint_attachments`, `complaint_parties`, `complaint_screenings`, `complaint_status_history`, `complaints`, `document_requests`, `events`, `incident_case_links`, `incident_tanod`, `incidents`, `kapitan_availability`, `kapitan_status`, `kp_case_followups`, `kp_case_panel`, `kp_cases`, `kp_hearing_attendance`, `kp_hearings`, `notification_reads`, `notifications`, `official_account_links`, `official_availability`, `profiles`, `residents_registry`, `sms_broadcast_recipients`, `sms_broadcasts`, `sms_source_rules`, `tanod_account_links`, `tanod_assignments`, `tanod_attendance`, `tanod_incident_notes`, `tanod_members`, `tanod_operation_events`.

### RPC name checklist with repository provenance

The inventory prints actual identity arguments, return types and grants for comparison to these source callers. Name-only PRESENT is not a PostgREST compatibility pass: compare named parameters, types, overloads, result fields, exposed schema and schema cache.

| RPC name | Local migration declarations/replacements | Caller evidence |
|---|---|---|
| `activate_community_credit_policy` | 059, 060 | `src/communityCredit/communityCreditApi.js` |
| `add_tanod_member` | 044 | `src/tanod/tanodApi.js` |
| `amend_blotter_entry` | 044 | `src/incidents/incidentApi.js` |
| `assign_kp_panel_member` | 043 | `src/kpcases/kpCaseApi.js` |
| `attribute_incident_tanod` | 044 | `src/incidents/incidentApi.js` |
| `barangay_resident_directory` | 054 | `src/dashboards/OfficialDashboard.jsx` |
| `blotter_history_for` | 044 | `src/incidents/incidentApi.js` |
| `case_support_history` | 050 | `src/casesupport/SupportHistory.jsx` |
| `clearance_case_warning` | 051 | `src/casesupport/ClearanceWarning.jsx` |
| `community_credit_admin_state` | 059 | `src/communityCredit/communityCreditApi.js` |
| `community_credit_enroll_active_residents` | 060 | `src/communityCredit/communityCreditApi.js` |
| `community_credit_profile` | 059, 060 | `src/communityCredit/communityCreditApi.js` |
| `community_credit_resident_directory` | 059 | `src/residents/ResidentDirectory.jsx` |
| `complaint_attachments_for` | 040, 050 | `src/complaints/complaintApi.js` |
| `complaint_history_for` | 040 | `src/complaints/complaintApi.js` |
| `complaint_parties_for` | 040 | `src/complaints/complaintApi.js` |
| `complaint_queue` | 040 | `src/complaints/complaintApi.js` |
| `complaint_screenings_for` | 042 | `src/screening/screeningApi.js` |
| `conclude_kp_case` | 046 | `src/kpcases/kpCaseApi.js` |
| `confirm_complaint_screening` | 042 | `src/screening/screeningApi.js` |
| `encode_walk_in_complaint` | 040 | `src/complaints/complaintApi.js` |
| `file_complaint_as_resident` | 040 | `src/complaints/complaintApi.js` |
| `incident_counts_by_status` | 044 | `src/safetymap/safetyApi.js` |
| `incident_counts_by_type` | 044 | `src/safetymap/safetyApi.js` |
| `incident_detail` | 044 | `src/incidents/incidentApi.js` |
| `incident_kp_link` | 051 | `src/casesupport/IncidentKpLink.jsx` |
| `incident_location_frequency` | 044, 048 | `src/safetymap/safetyApi.js` |
| `incident_map_points` | 044 | `src/safetymap/safetyApi.js` |
| `incident_monthly_trend` | 044 | `src/safetymap/safetyApi.js` |
| `incident_queue` | 044 | `src/analytics/supportedAnalyticsApi.js`, `src/incidents/incidentApi.js`, `src/safetymap/safetyApi.js` |
| `incident_tanod_for` | 044 | `src/incidents/incidentApi.js` |
| `kp_case_for_complaint` | 043 | `src/kpcases/kpCaseApi.js` |
| `kp_case_panel_for` | 043 | `src/kpcases/kpCaseApi.js` |
| `kp_case_parties_for` | 043 | `src/kpcases/kpCaseApi.js` |
| `kp_followups_for` | 051 | `src/casesupport/CaseFollowups.jsx` |
| `kp_hearing_attendance_for` | 043 | `src/kpcases/kpCaseApi.js` |
| `kp_hearings_for` | 043 | `src/kpcases/kpCaseApi.js` |
| `link_complaint_party` | 051 | `src/casesupport/PartyLink.jsx` |
| `link_incident_kp` | 051 | `src/casesupport/IncidentKpLink.jsx` |
| `my_community_credit_profile` | 059 | `src/communityCredit/communityCreditApi.js` |
| `official_id_for_current_user` | 026, 031 | `src/components/Sidebar.jsx`, `src/dashboards/OfficialDashboard.jsx` |
| `official_tanod_followups` | 053 | `src/tanod/OfficialTanodNotes.jsx` |
| `open_kp_case` | 043 | `src/kpcases/kpCaseApi.js` |
| `prepare_complaint_screening` | 042 | `src/screening/screeningApi.js` |
| `public_safety_monthly` | 045 | `src/safetymap/publicSafetyApi.js` |
| `public_safety_overview` | 045 | `src/safetymap/publicSafetyApi.js` |
| `public_safety_type_counts` | 045 | `src/safetymap/publicSafetyApi.js` |
| `public_safety_zone_type_counts` | 049 | `src/safetymap/publicSafetyApi.js` |
| `public_safety_zones` | 045 | `src/safetymap/publicSafetyApi.js` |
| `public_tanod_on_duty` | 052 | `src/tanod/tanodPortalApi.js` |
| `record_complaint_attachment` | 041, 050 | `src/complaints/complaintApi.js` |
| `record_incident` | 044, 053 | `src/incidents/incidentApi.js` |
| `record_kp_attendance` | 043 | `src/kpcases/kpCaseApi.js` |
| `record_kp_hearing_outcome` | 043 | `src/kpcases/kpCaseApi.js` |
| `retire_community_credit_policy` | 059 | `src/communityCredit/communityCreditApi.js` |
| `save_barangay_resident` | 054, 056 | `src/residents/ResidentDirectory.jsx` |
| `save_community_credit_policy` | 059, 060 | `src/communityCredit/communityCreditApi.js` |
| `save_community_credit_rule` | 059 | `src/communityCredit/communityCreditApi.js` |
| `save_kp_followups` | 051 | `src/casesupport/CaseFollowups.jsx` |
| `schedule_kp_hearing` | 043 | `src/kpcases/kpCaseApi.js` |
| `schedule_tanod_assignment` | 044 | `src/tanod/tanodApi.js` |
| `search_case_residents` | 051 | `src/casesupport/PartyLink.jsx` |
| `set_barangay_resident_eligibility` | 056 | `src/dashboards/OfficialDashboard.jsx`, `src/residents/ResidentDirectory.jsx` |
| `set_community_credit_rule_active` | 059 | `src/communityCredit/communityCreditApi.js` |
| `set_incident_map_location` | 057 | `src/incidents/incidentApi.js` |
| `set_incident_status` | 044 | `src/incidents/incidentApi.js` |
| `set_tanod_account_link` | 052 | `src/tanod/tanodPortalApi.js` |
| `set_tanod_assignment_active` | 044 | `src/tanod/tanodApi.js` |
| `set_tanod_member_active` | 044 | `src/tanod/tanodApi.js` |
| `sms_audience_options` | 058 | `src/sms/SmsComposer.jsx` |
| `sms_broadcast_state` | 058 | `src/sms/SmsComposer.jsx`, `src/sms/smsApi.js` |
| `sms_prepare_broadcast` | 058 | `src/sms/SmsComposer.jsx` |
| `sms_preview` | 058 | `src/sms/SmsComposer.jsx` |
| `sms_save_rule` | 058 | `src/sms/SmsComposer.jsx` |
| `sms_source_history` | 058 | `src/sms/SmsComposer.jsx`, `src/sms/SmsHistory.jsx` |
| `tanod_account_states` | 052 | `src/tanod/tanodPortalApi.js` |
| `tanod_add_followup` | 053 | `src/tanod/tanodPortalApi.js` |
| `tanod_assignments_for` | 044 | `src/tanod/tanodApi.js` |
| `tanod_check_in` | 052 | `src/tanod/tanodPortalApi.js` |
| `tanod_check_out` | 052 | `src/tanod/tanodPortalApi.js` |
| `tanod_coverage_summary` | 044 | `src/safetymap/safetyApi.js` |
| `tanod_my_duty` | 052 | `src/tanod/tanodPortalApi.js` |
| `tanod_my_followups` | 053 | `src/tanod/tanodPortalApi.js` |
| `tanod_my_identity` | 052 | `src/tanod/tanodPortalApi.js` |
| `tanod_my_reports` | 053 | `src/tanod/tanodPortalApi.js` |
| `tanod_roster` | 044 | `src/tanod/tanodApi.js` |
| `track_complaint` | 040 | `src/complaints/complaintApi.js` |
| `update_kp_hearing_record` | 043 | `src/kpcases/kpCaseApi.js` |
| `update_tanod_member` | 047 | `src/tanod/tanodApi.js` |
| `withdraw_complaint_evidence` | 050 | `src/casesupport/EvidenceActions.jsx` |

### Retired / deferred objects ? preserve

`reservations`, `waste_schedule`, `health_events`, `nurse_availability`, `medicine_stock`, `medical_programs`, reservation slots/create/track/protection functions, health/reservation storage rules, notification labels, source rules and historical audit events may remain. Their current existence is unknown. Removal from App routes does not revoke database privileges. Keep historical records, shared date/reference helpers and legacy complaint metadata. Voter-reference UI retirement does not make `residents_registry` disposable.

Current routes intentionally retire reservation/tracking/health/nurse; retained resident/official/Tanod routes remain. Resident History/Analytics are deferred; person_history/person_analytics and barangay_safety_analytics/repeated_dispute_analytics are not required by the current restored UI. Community Credit V2 RPCs are not added to this checklist.

## Prepared read-only inventory and statement review

`supabase-tests/production_schema_reconciliation_readonly.sql` is Phase 1. `supabase-tests/production_migration_versions_readonly.sql` is optional Phase 2, only after the ledger/version column is confirmed. Separate files avoid dynamic SQL or DO blocks and avoid aborting the whole inventory when the ledger does not exist.

| Statements | Effects / required access |
|---|---|
| BEGIN READ ONLY; three SET LOCAL settings | Transaction/session-local state only; no persistent configuration change; connected database role |
| Version/mode, ledger presence and columns | Catalog/settings reads; information_schema visibility is privilege-filtered |
| Relation inventory and required-relation CTE | pg_class/namespace/name resolution only; no application rows |
| Required-function CTE and function inventory | Catalog inspection, identity/result formatting, definition hashes and privilege checks; inspected routines are never invoked |
| Trigger and policy inventories | Deparse/hash definitions, do not execute predicates/triggers |
| ROLLBACK | Ends read-only transaction/settings |
| Optional SELECT version FROM migration ledger | Metadata rows only; requires SELECT on ledger and schema USAGE; do not request/grant privileges to overcome failure |

All built-ins resolve through pg_catalog: current_setting/to_regclass, pg_get_userbyid, function identity/result/definition formatting, has_function_privilege, pg_get_triggerdef, md5/coalesce/count. No application function calls, dynamic SQL, SELECT INTO, DML, DDL, role changes, grants or migration execution. Default/function bodies/configuration/policy literals are not output. Some built-ins deparse definitions to hash them; this does not execute them. Ledger versions are not records of successful SQL Editor applications. Read-only work may take locks, consume resources and produce ordinary platform logs.

Use the existing authorized project SQL Editor with its normal administrative role (usually postgres); no passwords/service keys needed in SQL/chat. Keep metadata output private. Generic function/result/argument/object names can contain confidential identifiers; review exports before sharing. The script does not read resident/Auth rows, cron payloads, migration names/statement arrays, or secrets. pg_catalog search_path reduces function-shadowing risk.

## Manual collection and reconciliation procedure

1. Confirm the intended existing project identity privately; separately authorize manual read-only inspection. Do not infer identity from database name. No SQL has run in this stage.
2. Paste/run the complete Phase 1 file including transaction/settings/rollback. Collect every numbered query output privately. If result navigation is limited, wrap each SELECT with the same read-only transaction/settings/rollback. Stop on errors; ROLLBACK an aborted transaction. Do not create stubs or adjust grants.
3. Only if the ledger and version column are present/readable, run the complete optional Phase 2 file. Otherwise label migration state untracked/unavailable; never create a ledger. Map timestamp/version values to actual approved files; do not assume numeric labels match.
4. Compare relation kinds/RLS, required names, actual overloads/named arguments/results against callers, and trigger enablement/events/order. Required lookup can find an unexpected view with the right name: inspect its shape and security separately.
5. Run the previously reviewed Stage 7W preflight only under separate owner read-only approval for deeper profile columns, grants, role memberships and fingerprints. Compare full definitions privately where needed; hashes alone cannot explain predicates or correctness. Missing helpers/unknown INSERT or UPDATE/ALL policies are blockers.
6. Populate each matrix row with source filename, exact cloud signature/object, fingerprint, grants/RLS, review date and disposition. Extra objects are not deletion candidates. Unknown private definer writers and transitive dependencies require additional separately reviewed metadata inspection.
7. No migration approval follows from this inventory. Resolve current-schema drift, real database/JWT validation gap, backup/recovery and outbound containment before a separately authorized rollout. Do not use either existing project for synthetic mutation tests.

## Risks and recommendation

**NO-GO remains.** Historical broad official verification and conditional self-profile INSERT exposure are not fixed by UI restrictions. 068/069 have static evidence only, no real PostgreSQL/Auth/API execution. Current private writers, SELECT privacy, production grants, complete baseline and frontend/backend response compatibility remain unknown. Existing zero-row Verify/Reject success reporting and prospective Tanod help-text mismatch remain documented P2 concerns. Do not activate V2 or auto-run missing migrations.

## Validation and files

Added only the two prepared SQL inventories, this report, and local generated dependency diagnostic `supabase-tests/runners-out/stage7y1-dependency-inventory.json` (not release source). No application, migrations, environment or deployment configuration changed. Static dependency extraction/review only; SQL syntax/database execution and live compatibility not tested. No Jest/build rerun: no application code changed and this stage requests inventory preparation, not runtime validation. `git diff --check` passed (exit 0; existing LF/CRLF warnings). SHA-256 hashes of 068 and 069 remain identical to Stage 7W/7X.
