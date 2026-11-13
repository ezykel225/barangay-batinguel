-- Stage 18 production catalog inventory. READ ONLY; no application row values.
\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset fieldsep '|'

begin read only;
set local statement_timeout = '60s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

select 'SECTION|connection';
select current_database(), current_user, current_setting('transaction_read_only');

select 'SECTION|relations';
select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
       pg_get_userbyid(c.relowner),coalesce(c.reltuples::bigint,0),
       pg_total_relation_size(c.oid)
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m','S')
order by c.relkind,c.relname;

select 'SECTION|exact_row_counts';
select format(
  'select %L as schema_name,%L as relation_name,count(*)::bigint as exact_rows from %I.%I;',
  n.nspname,c.relname,n.nspname,c.relname)
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
order by c.relname
\gexec

select 'SECTION|columns';
select n.nspname,c.relname,a.attnum,a.attname,
       format_type(a.atttypid,a.atttypmod),a.attnotnull,
       coalesce(pg_get_expr(d.adbin,d.adrelid),'') as default_expression,
       a.attidentity::text,a.attgenerated::text
from pg_attribute a
join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and c.relkind in ('r','p','v','m')
  and a.attnum>0 and not a.attisdropped
order by c.relname,a.attnum;

select 'SECTION|constraints';
select n.nspname,c.relname,con.conname,con.contype,con.convalidated,
       pg_get_constraintdef(con.oid,true)
from pg_constraint con
join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
order by c.relname,con.contype,con.conname;

select 'SECTION|foreign_keys';
select sn.nspname,sc.relname,con.conname,
       tn.nspname,tc.relname,pg_get_constraintdef(con.oid,true)
from pg_constraint con
join pg_class sc on sc.oid=con.conrelid
join pg_namespace sn on sn.oid=sc.relnamespace
join pg_class tc on tc.oid=con.confrelid
join pg_namespace tn on tn.oid=tc.relnamespace
where con.contype='f' and (sn.nspname='public' or tn.nspname='public')
order by sc.relname,con.conname;

select 'SECTION|policies';
select schemaname,tablename,policyname,permissive,roles,cmd,
       coalesce(qual,''),coalesce(with_check,'')
from pg_policies
where schemaname='public'
order by tablename,cmd,policyname;

select 'SECTION|triggers';
select n.nspname,c.relname,t.tgname,t.tgenabled,
       p.oid::regprocedure::text,pg_get_triggerdef(t.oid,true)
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and n.nspname in ('public','auth','storage')
order by n.nspname,c.relname,t.tgname;

select 'SECTION|functions';
select n.nspname,p.proname,p.oid::regprocedure::text,
       pg_get_function_result(p.oid),p.prosecdef,p.provolatile,
       pg_get_userbyid(p.proowner),md5(pg_get_functiondef(p.oid))
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
order by p.proname,p.oid::regprocedure::text;

select 'SECTION|retired_feature_function_references';
select p.oid::regprocedure::text,pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
  and pg_get_functiondef(p.oid) ~* '(reservation|waste_schedule|health_event|nurse_availability|medicine_stock|medical_program)'
order by p.oid::regprocedure::text;

select 'SECTION|views';
select n.nspname,c.relname,c.relkind,pg_get_viewdef(c.oid,true)
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname;

select 'SECTION|enums';
select n.nspname,t.typname,e.enumsortorder,e.enumlabel
from pg_type t
join pg_namespace n on n.oid=t.typnamespace
join pg_enum e on e.enumtypid=t.oid
where n.nspname='public'
order by t.typname,e.enumsortorder;

select 'SECTION|table_privileges';
select grantee,table_schema,table_name,privilege_type
from information_schema.table_privileges
where table_schema='public' and grantee in ('anon','authenticated','service_role')
order by table_name,grantee,privilege_type;

select 'SECTION|function_privileges';
select r.rolname,p.oid::regprocedure::text,
       has_function_privilege(r.oid,p.oid,'EXECUTE')
from pg_roles r
cross join pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
  and r.rolname in ('anon','authenticated','service_role')
order by p.oid::regprocedure::text,r.rolname;

select 'SECTION|storage_buckets';
select b.id,b.name,b.public,count(o.id)::bigint as object_count
from storage.buckets b
left join storage.objects o on o.bucket_id=b.id
group by b.id,b.name,b.public
order by b.id;

select 'SECTION|publication_tables';
select pubname,schemaname,tablename
from pg_publication_tables
where schemaname='public'
order by pubname,tablename;

select 'SECTION|migration_068_069_ledger';
select version,name
from supabase_migrations.schema_migrations
where name in ('068_resident_verification_security','069_resident_profile_insert_security')
   or name like '%068_resident_verification_security%'
   or name like '%069_resident_profile_insert_security%'
order by version;

rollback;
