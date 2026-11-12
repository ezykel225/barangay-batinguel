-- STAGE 7Y.3: PREPARED ONLY, NOT EXECUTED. Catalog-only inspection.
-- Confirm the intended existing project manually. No application records/RPC calls.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- Presence does not prove correct columns, RLS or privileges.
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
 case when c.oid is null then 'MISSING' else 'PRESENT' end as status
from required r left join pg_class c on c.oid=to_regclass('public.'||r.name)
order by r.name;

rollback;
