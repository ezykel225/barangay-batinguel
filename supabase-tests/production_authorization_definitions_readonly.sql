-- STAGE 7Y.6: PREPARED ONLY. NOT EXECUTED. Requires owner read-only approval.
-- WARNING: RAW DEFINITIONS, unlike earlier fingerprint-only inventories.
-- May contain confidential literals/URLs/settings. Review PRIVATELY in Editor.
-- Do not commit output, upload it automatically or paste unreviewed bodies in chat.
-- No application routines, defaults or policy expressions are executed.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- 1: full predicates for the four unresolved direct-table security boundaries.
-- Include every policy command: permissive ALL/UPDATE/INSERT interactions matter.
select tablename,policyname,roles,cmd,permissive,qual as using_expression,
 with_check as explicit_check_expression
from pg_policies where schemaname='public'
 and tablename in ('profiles','residents_registry','document_requests','complaints')
order by tablename,cmd,policyname;

-- 2: exact identity/decision/signup chain, selected by known signature, not invoked.
select p.oid::regprocedure::text as signature,
 pg_get_functiondef(p.oid) as private_definition
from pg_proc p
where p.prokind='f' and p.oid in (
 to_regprocedure('public.is_official(uuid)'),
 to_regprocedure('public.prevent_role_self_change()'),
 to_regprocedure('public.handle_new_resident_signup()'),
 to_regprocedure('public.compose_full_name()'),
 to_regprocedure('public.current_official_holds_position(text)'),
 to_regprocedure('public.current_official_may_administer_records()'),
 to_regprocedure('public.set_barangay_resident_eligibility(uuid,boolean)'),
 to_regprocedure('public.notify_verification()'),
 to_regprocedure('public.sync_verified_resident_directory()'),
 to_regprocedure('public.current_official_is_active()'))
order by signature;

-- 3: initial profile defaults only; deparse, do not evaluate defaults.
-- No profile rows selected. NULL means no catalog default, not a tested INSERT.
select a.attname,format_type(a.atttypid,a.atttypmod) as column_type,a.attnotnull,
 pg_get_expr(d.adbin,d.adrelid) as private_default_expression
from pg_attribute a left join pg_attrdef d
 on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.profiles') and not a.attisdropped
 and a.attname in ('id','role','verification_status','verified_by','verified_at','verification_notes')
order by a.attnum;
rollback;
