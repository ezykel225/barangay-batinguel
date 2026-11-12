-- STAGE 7Y.1: PREPARED ONLY, NOT EXECUTED. Catalog metadata only.
-- Manually confirm the existing authorized project. No application RPC calls.
-- Names/signatures/grants are private metadata. No records, bodies or defaults.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- 1: execution mode and optional migration ledger shape (no ledger rows).
select current_setting('server_version') as server_version,
 current_setting('transaction_read_only') as transaction_read_only;
select to_regclass('supabase_migrations.schema_migrations') is not null as ledger_present;
select column_name,data_type from information_schema.columns
where table_schema='supabase_migrations' and table_name='schema_migrations'
order by ordinal_position;

-- 2: complete public relation inventory; RLS flags apply to tables, not views.
select c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m','f') order by c.relname;

-- 3: required retained relations; absence is a review blocker, never create stubs.
with required(name) as (values
 ('activity_log'),
 ('announcements'),
 ('barangay_officials'),
 ('barangay_residents'),
 ('barangay_term_members'),
 ('barangay_terms'),
 ('blotter_entries'),
 ('blotter_entry_history'),
 ('case_support_events'),
 ('community_credit_enrollments'),
 ('community_credit_events'),
 ('community_credit_policies'),
 ('community_credit_rules'),
 ('complaint_attachments'),
 ('complaint_parties'),
 ('complaint_screenings'),
 ('complaint_status_history'),
 ('complaints'),
 ('document_requests'),
 ('events'),
 ('incident_case_links'),
 ('incident_tanod'),
 ('incidents'),
 ('kapitan_availability'),
 ('kapitan_status'),
 ('kp_case_followups'),
 ('kp_case_panel'),
 ('kp_cases'),
 ('kp_hearing_attendance'),
 ('kp_hearings'),
 ('notification_reads'),
 ('notifications'),
 ('official_account_links'),
 ('official_availability'),
 ('profiles'),
 ('residents_registry'),
 ('sms_broadcast_recipients'),
 ('sms_broadcasts'),
 ('sms_source_rules'),
 ('tanod_account_links'),
 ('tanod_assignments'),
 ('tanod_attendance'),
 ('tanod_incident_notes'),
 ('tanod_members'),
 ('tanod_operation_events'))
select name as required_relation,c.relkind,
 case when c.oid is null then 'MISSING' else 'PRESENT_REVIEW_COLUMNS_AND_ACCESS' end as status
from required r left join pg_class c on c.oid=to_regclass('public.'||r.name)
order by r.name;

-- 4: required RPC/helper names. Name presence is NOT signature compatibility.
with required(name) as (values
 ('activate_community_credit_policy'),
 ('add_tanod_member'),
 ('amend_blotter_entry'),
 ('assign_kp_panel_member'),
 ('attribute_incident_tanod'),
 ('barangay_resident_directory'),
 ('blotter_history_for'),
 ('case_support_history'),
 ('clearance_case_warning'),
 ('community_credit_admin_state'),
 ('community_credit_enroll_active_residents'),
 ('community_credit_enroll_on_active_resident'),
 ('community_credit_guard_event'),
 ('community_credit_profile'),
 ('community_credit_resident_directory'),
 ('complaint_attachments_for'),
 ('complaint_history_for'),
 ('complaint_parties_for'),
 ('complaint_queue'),
 ('complaint_screenings_for'),
 ('compose_full_name'),
 ('conclude_kp_case'),
 ('confirm_complaint_screening'),
 ('current_official_holds_position'),
 ('current_official_is_active'),
 ('current_official_may_administer_records'),
 ('current_tanod_member_id'),
 ('encode_walk_in_complaint'),
 ('file_complaint_as_resident'),
 ('handle_new_resident_signup'),
 ('incident_counts_by_status'),
 ('incident_counts_by_type'),
 ('incident_detail'),
 ('incident_kp_link'),
 ('incident_location_frequency'),
 ('incident_map_points'),
 ('incident_monthly_trend'),
 ('incident_queue'),
 ('incident_tanod_for'),
 ('is_official'),
 ('kp_case_for_complaint'),
 ('kp_case_panel_for'),
 ('kp_case_parties_for'),
 ('kp_followups_for'),
 ('kp_hearing_attendance_for'),
 ('kp_hearings_for'),
 ('link_complaint_party'),
 ('link_incident_kp'),
 ('my_community_credit_profile'),
 ('notify_verification'),
 ('official_id_for_current_user'),
 ('official_tanod_followups'),
 ('open_kp_case'),
 ('prepare_complaint_screening'),
 ('prevent_role_self_change'),
 ('protect_document_request_status'),
 ('public_safety_monthly'),
 ('public_safety_overview'),
 ('public_safety_type_counts'),
 ('public_safety_zone_type_counts'),
 ('public_safety_zones'),
 ('public_tanod_on_duty'),
 ('record_complaint_attachment'),
 ('record_incident'),
 ('record_kp_attendance'),
 ('record_kp_hearing_outcome'),
 ('retire_community_credit_policy'),
 ('save_barangay_resident'),
 ('save_community_credit_policy'),
 ('save_community_credit_rule'),
 ('save_kp_followups'),
 ('schedule_kp_hearing'),
 ('schedule_tanod_assignment'),
 ('search_case_residents'),
 ('set_barangay_resident_eligibility'),
 ('set_community_credit_rule_active'),
 ('set_incident_map_location'),
 ('set_incident_status'),
 ('set_tanod_account_link'),
 ('set_tanod_assignment_active'),
 ('set_tanod_member_active'),
 ('sms_audience_options'),
 ('sms_broadcast_state'),
 ('sms_prepare_broadcast'),
 ('sms_preview'),
 ('sms_save_rule'),
 ('sms_source_history'),
 ('stamp_activity_actor'),
 ('sync_verified_resident_directory'),
 ('tanod_account_states'),
 ('tanod_add_followup'),
 ('tanod_assignments_for'),
 ('tanod_check_in'),
 ('tanod_check_out'),
 ('tanod_coverage_summary'),
 ('tanod_my_duty'),
 ('tanod_my_followups'),
 ('tanod_my_identity'),
 ('tanod_my_reports'),
 ('tanod_roster'),
 ('track_complaint'),
 ('update_kp_hearing_record'),
 ('update_tanod_member'),
 ('withdraw_complaint_evidence'))
select r.name as required_function,
 case when count(p.oid)=0 then 'MISSING' else 'PRESENT_REVIEW_OVERLOADS_AND_GRANTS' end as status,
 count(p.oid) as overload_count
from required r left join pg_namespace n on n.nspname='public'
left join pg_proc p on p.pronamespace=n.oid and p.proname=r.name and p.prokind='f'
group by r.name order by r.name;

-- 5: all public function signatures; identity arguments omit default literals.
-- EXECUTE is checked, not exercised. No function bodies/config values printed.
select p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,
 pg_get_function_result(p.oid) as result_type,p.prosecdef,p.provolatile,
 md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by p.proname,identity_arguments;

-- 6: application and signup trigger bindings; inspect enablement/event types.
select n.nspname,c.relname,t.tgname,t.tgfoid::regprocedure::text as function_signature,
 t.tgtype,t.tgenabled,t.tgattr::text as attribute_numbers,t.tgqual is null as unconditional,
 md5(pg_get_triggerdef(t.oid)) as definition_fingerprint
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))
order by n.nspname,c.relname,t.tgname;

-- 7: all public policies: no predicate literals, no record reads.
select tablename,policyname,roles,cmd,permissive,
 qual is null as using_is_null,with_check is null as explicit_check_is_null,
 md5(coalesce(qual,'')) as using_fingerprint,
 md5(coalesce(with_check,'')) as check_fingerprint
from pg_policies where schemaname='public' order by tablename,cmd,policyname;
rollback;
