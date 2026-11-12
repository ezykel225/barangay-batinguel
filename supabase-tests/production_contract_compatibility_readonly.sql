-- STAGE 7Y.4 PREPARED ONLY, NOT EXECUTED. Catalog-only contract inspection.
-- Existence already confirmed by owner; do not invoke application routines.
-- Keep metadata private. No bodies, policy literals, defaults or records printed.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- 1: actual function contracts/grants, including argument names and default count.
select p.proname,pg_get_function_identity_arguments(p.oid) as identity_arguments,
 p.proargnames,p.proargmodes,p.pronargdefaults,
 pg_get_function_result(p.oid) as return_type,p.prosecdef,p.provolatile,
 pg_get_userbyid(p.proowner) as owner,
 md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
 md5(coalesce(array_to_string(p.proconfig,E'\n'),'')) as config_fingerprint,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in ('activate_community_credit_policy','add_tanod_member','amend_blotter_entry','assign_kp_panel_member','attribute_incident_tanod','barangay_resident_directory','blotter_history_for','case_support_history','clearance_case_warning','community_credit_admin_state','community_credit_enroll_active_residents','community_credit_enroll_on_active_resident','community_credit_guard_event','community_credit_profile','community_credit_resident_directory','complaint_attachments_for','complaint_history_for','complaint_parties_for','complaint_queue','complaint_screenings_for','compose_full_name','conclude_kp_case','confirm_complaint_screening','current_official_holds_position','current_official_is_active','current_official_may_administer_records','current_tanod_member_id','encode_walk_in_complaint','file_complaint_as_resident','handle_new_resident_signup','incident_counts_by_status','incident_counts_by_type','incident_detail','incident_kp_link','incident_location_frequency','incident_map_points','incident_monthly_trend','incident_queue','incident_tanod_for','is_official','kp_case_for_complaint','kp_case_panel_for','kp_case_parties_for','kp_followups_for','kp_hearing_attendance_for','kp_hearings_for','link_complaint_party','link_incident_kp','my_community_credit_profile','notify_verification','official_id_for_current_user','official_tanod_followups','open_kp_case','prepare_complaint_screening','prevent_role_self_change','protect_document_request_status','public_safety_monthly','public_safety_overview','public_safety_type_counts','public_safety_zone_type_counts','public_safety_zones','public_tanod_on_duty','record_complaint_attachment','record_incident','record_kp_attendance','record_kp_hearing_outcome','retire_community_credit_policy','save_barangay_resident','save_community_credit_policy','save_community_credit_rule','save_kp_followups','schedule_kp_hearing','schedule_tanod_assignment','search_case_residents','set_barangay_resident_eligibility','set_community_credit_rule_active','set_incident_map_location','set_incident_status','set_tanod_account_link','set_tanod_assignment_active','set_tanod_member_active','sms_audience_options','sms_broadcast_state','sms_prepare_broadcast','sms_preview','sms_save_rule','sms_source_history','stamp_activity_actor','sync_verified_resident_directory','tanod_account_states','tanod_add_followup','tanod_assignments_for','tanod_check_in','tanod_check_out','tanod_coverage_summary','tanod_my_duty','tanod_my_followups','tanod_my_identity','tanod_my_reports','tanod_roster','track_complaint','update_kp_hearing_record','update_tanod_member','withdraw_complaint_evidence')
order by p.proname,identity_arguments;

-- 2: actual column names/types/nullability; defaults only as hashes.
select c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) as column_type,
 a.attnotnull,a.attidentity,a.attgenerated,
 md5(coalesce(pg_get_expr(d.adbin,d.adrelid),'')) as default_fingerprint
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in ('activity_log','announcements','barangay_officials','barangay_residents','barangay_term_members','barangay_terms','blotter_entries','blotter_entry_history','case_support_events','community_credit_enrollments','community_credit_events','community_credit_policies','community_credit_rules','complaint_attachments','complaint_parties','complaint_screenings','complaint_status_history','complaints','document_requests','events','incident_case_links','incident_tanod','incidents','kapitan_availability','kapitan_status','kp_case_followups','kp_case_panel','kp_cases','kp_hearing_attendance','kp_hearings','notification_reads','notifications','official_account_links','official_availability','profiles','residents_registry','sms_broadcast_recipients','sms_broadcasts','sms_source_rules','tanod_account_links','tanod_assignments','tanod_attendance','tanod_incident_notes','tanod_members','tanod_operation_events')
 and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum;

-- 3: constraints and FK endpoints (column-number arrays resolve via query 2).
-- Check definitions hashed to avoid embedded sensitive literals.
select c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,
 k.conkey,k.confrelid::regclass::text as referenced_relation,k.confkey,
 k.confupdtype,k.confdeltype,md5(pg_get_constraintdef(k.oid)) as definition_fingerprint
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('activity_log','announcements','barangay_officials','barangay_residents','barangay_term_members','barangay_terms','blotter_entries','blotter_entry_history','case_support_events','community_credit_enrollments','community_credit_events','community_credit_policies','community_credit_rules','complaint_attachments','complaint_parties','complaint_screenings','complaint_status_history','complaints','document_requests','events','incident_case_links','incident_tanod','incidents','kapitan_availability','kapitan_status','kp_case_followups','kp_case_panel','kp_cases','kp_hearing_attendance','kp_hearings','notification_reads','notifications','official_account_links','official_availability','profiles','residents_registry','sms_broadcast_recipients','sms_broadcasts','sms_source_rules','tanod_account_links','tanod_assignments','tanod_attendance','tanod_incident_notes','tanod_members','tanod_operation_events')
order by c.relname,k.conname;

-- 4: indexes include partial uniqueness not represented by pg_constraint.
select c.relname,i.indexrelid::regclass::text as index_name,
 i.indisunique,i.indisprimary,i.indisvalid,i.indisready,
 md5(pg_get_indexdef(i.indexrelid)) as definition_fingerprint,
 md5(coalesce(pg_get_expr(i.indpred,i.indrelid),'')) as predicate_fingerprint
from pg_index i join pg_class c on c.oid=i.indrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('activity_log','announcements','barangay_officials','barangay_residents','barangay_term_members','barangay_terms','blotter_entries','blotter_entry_history','case_support_events','community_credit_enrollments','community_credit_events','community_credit_policies','community_credit_rules','complaint_attachments','complaint_parties','complaint_screenings','complaint_status_history','complaints','document_requests','events','incident_case_links','incident_tanod','incidents','kapitan_availability','kapitan_status','kp_case_followups','kp_case_panel','kp_cases','kp_hearing_attendance','kp_hearings','notification_reads','notifications','official_account_links','official_availability','profiles','residents_registry','sms_broadcast_recipients','sms_broadcasts','sms_source_rules','tanod_account_links','tanod_assignments','tanod_attendance','tanod_incident_notes','tanod_members','tanod_operation_events')
order by c.relname,index_name;

-- 5: effective table/column privileges and RLS; grants do not prove row access.
select c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname,
 has_table_privilege(r.oid,c.oid,'SELECT') as table_select,
 has_table_privilege(r.oid,c.oid,'INSERT') as table_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') as table_update,
 has_table_privilege(r.oid,c.oid,'DELETE') as table_delete,
 has_table_privilege(r.oid,c.oid,'TRUNCATE') as table_truncate,
 a.attname,has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') as column_select,
 has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') as column_insert,
 has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') as column_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join pg_roles r
where n.nspname='public' and c.relname in ('activity_log','announcements','barangay_officials','barangay_residents','barangay_term_members','barangay_terms','blotter_entries','blotter_entry_history','case_support_events','community_credit_enrollments','community_credit_events','community_credit_policies','community_credit_rules','complaint_attachments','complaint_parties','complaint_screenings','complaint_status_history','complaints','document_requests','events','incident_case_links','incident_tanod','incidents','kapitan_availability','kapitan_status','kp_case_followups','kp_case_panel','kp_cases','kp_hearing_attendance','kp_hearings','notification_reads','notifications','official_account_links','official_availability','profiles','residents_registry','sms_broadcast_recipients','sms_broadcasts','sms_source_rules','tanod_account_links','tanod_assignments','tanod_attendance','tanod_incident_notes','tanod_members','tanod_operation_events')
 and r.rolname in ('anon','authenticated','service_role')
order by c.relname,r.rolname,a.attnum;

-- 6: 068/069 trigger preconditions and signup binding, no trigger execution.
select n.nspname,c.relname,t.tgname,t.tgfoid::regprocedure::text as function_signature,
 t.tgtype,t.tgenabled,t.tgattr::text as attribute_numbers,t.tgqual is null as unconditional,
 md5(pg_get_triggerdef(t.oid)) as definition_fingerprint
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and ((n.nspname='public' and c.relname='profiles')
 or (n.nspname='auth' and c.relname='users'))
order by n.nspname,c.relname,t.tgname;
rollback;
