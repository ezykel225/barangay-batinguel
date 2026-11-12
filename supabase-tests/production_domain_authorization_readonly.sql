-- STAGE 7Y.6: OPTIONAL SECOND PASS, PREPARED ONLY. NOT EXECUTED.
-- RAW FUNCTION BODIES: private manual review only, never automatic publication.
-- Review identity/decision core first. No application function is invoked.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- Focused retained-domain access/decision gates, not another public-wide dump.
-- Function names exist per prior evidence; any absent row is a review blocker.
select p.oid::regprocedure::text as signature,
 pg_get_functiondef(p.oid) as private_definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in (
 'protect_document_request_status',
 'community_credit_require_admin','community_credit_may_view_resident',
 'community_credit_profile','my_community_credit_profile',
 'complaint_is_visible_to_caller','complaint_queue','complaint_parties_for',
 'kp_case_is_visible_to_caller','open_kp_case',
 'record_kp_hearing_outcome','conclude_kp_case',
 'search_case_residents','link_complaint_party')
order by signature;
rollback;
