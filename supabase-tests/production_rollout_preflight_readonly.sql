-- PREPARED, NOT EXECUTED. Metadata and aggregate counts only; no application rows.
-- Run only on the authorized existing project, using a protected SSL connection.
-- This is a pre-062 inventory, not a migration and not a behavioral test harness.
-- If an expected table is missing, STOP: do not create a stub or skip the query.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

select current_setting('server_version') as server_version,
       current_setting('transaction_read_only') as read_only;

-- Discover whether a managed migration ledger exists; SQL Editor applications
-- may not have ledger entries. Inspect ledger versions separately if present.
select to_regclass('supabase_migrations.schema_migrations') is not null as migration_ledger_exists;

select c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
order by c.relname;

-- Fingerprints only: do not print possibly confidential function bodies.
select p.oid::regprocedure::text as signature,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer,p.provolatile,p.proconfig,
       pg_get_userbyid(p.proowner) as owner,
       md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
order by signature;

select tablename,policyname,roles,cmd,permissive,
       md5(coalesce(qual,'')||' / '||coalesce(with_check,'')) as predicate_fingerprint
from pg_policies where schemaname='public' order by tablename,policyname;

select table_name,column_name,data_type,is_nullable,
       md5(coalesce(column_default,'')) as default_fingerprint
from information_schema.columns where table_schema='public'
order by table_name,ordinal_position;

select c.relname as table_name,k.conname,k.contype,k.convalidated,
       md5(pg_get_constraintdef(k.oid)) as definition_fingerprint
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by table_name,k.conname;

select c.relname as table_name,t.tgname,t.tgfoid::regprocedure::text as function_signature,t.tgenabled
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by table_name,t.tgname;

select table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' order by table_name,grantee,privilege_type;

-- Operational blockers: output counts only, never record identities/messages.
select count(*) as future_unresolved_reservations from public.reservations
where preferred_date >= (now() at time zone 'Asia/Manila')::date
  and status in ('pending','approved');

select count(*) as unresolved_health_sms_recipients
from public.sms_broadcast_recipients r join public.sms_broadcasts b on b.id=r.broadcast_id
where b.source_type in ('health_event','medical_program') and not b.dry_run
  and r.status in ('pending','attempting');

select status,count(*) as policies from public.community_credit_policies group by status order by status;
select count(*) as active_policy_model_mismatches from public.community_credit_policies
where status='active' and (base_score<>100 or minimum_score<>0 or maximum_score<>100);
select count(*) as invalid_existing_enrollments from public.community_credit_enrollments
where starting_score<>100 or enrollment_source not in ('active_resident_batch','resident_created','resident_reactivated');
select count(*) as enrollments from public.community_credit_enrollments;
select count(*) as ledger_events from public.community_credit_events;
select role,count(*) as accounts from public.profiles group by role order by role;

-- No deliberate production role impersonation, workflow writes or test fixtures.
rollback;
