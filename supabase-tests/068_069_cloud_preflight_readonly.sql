-- STAGE 7W: PREPARED FOR REVIEW ONLY. NOT EXECUTED.
-- Owner must confirm the authorized project and approve read-only inspection.
-- Catalog metadata only: no application/Auth rows, secrets, function bodies,
-- role impersonation, application RPC invocation or authorization mutations.
-- Hashes indicate differences, not security correctness or recoverable backups.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;

-- A: execution mode, managed roles and prerequisite relation presence.
select current_setting('server_version') as server_version,
       current_setting('transaction_read_only') as transaction_read_only;
select rolname,rolsuper,rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role','authenticator',
                 'postgres','supabase_admin','supabase_auth_admin') order by rolname;
select name as required_relation,to_regclass(name) is not null as present
from (values ('public.profiles'),('auth.users'),('public.official_account_links'),
 ('public.barangay_officials'),('public.barangay_residents'),('public.notifications'),
 ('public.activity_log'),('supabase_migrations.schema_migrations')) as required(name);

-- B: RLS, owner and column/constraint fingerprints. No default literals.
select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.oid in (to_regclass('public.profiles'),to_regclass('public.official_account_links'),
 to_regclass('public.barangay_officials'),to_regclass('public.barangay_residents'))
order by n.nspname,c.relname;
select a.attname as column_name,format_type(a.atttypid,a.atttypmod) as column_type,
 a.attnotnull,a.attidentity,a.attgenerated,
 md5(coalesce(pg_get_expr(d.adbin,d.adrelid),'')) as default_fingerprint
from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.profiles') and a.attnum>0 and not a.attisdropped
order by a.attnum;
select conname,contype,convalidated,md5(pg_get_constraintdef(oid)) as definition_fingerprint
from pg_constraint where conrelid=to_regclass('public.profiles') order by conname;

-- C: all policy command paths, including INSERT/UPDATE/ALL and SELECT/DELETE.
-- Predicate hashes avoid disclosing embedded literals. Privately inspect any
-- effective definition needed to interpret these hashes; do not infer a pass.
select schemaname,tablename,policyname,roles,cmd,permissive,
 md5(coalesce(qual,'')) as using_fingerprint,
 md5(coalesce(with_check,'')) as check_fingerprint,
 qual is null as using_is_null,with_check is null as explicit_check_is_null
from pg_policies where schemaname='public' and tablename in
 ('profiles','official_account_links','barangay_officials','barangay_residents')
order by tablename,cmd,policyname;

-- D: effective privileges include inherited/PUBLIC grants, not merely explicit ACLs.
select r.rolname,privilege,
 has_table_privilege(r.oid,c.oid,privilege) as effective_table_privilege
from pg_roles r cross join pg_class c
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
 ('REFERENCES'),('TRIGGER')) as privileges(privilege)
where r.rolname in ('anon','authenticated','service_role')
 and c.oid=to_regclass('public.profiles') order by r.rolname,privilege;
select r.rolname,a.attname as column_name,
 has_column_privilege(r.oid,a.attrelid,a.attnum,'SELECT') as can_select,
 has_column_privilege(r.oid,a.attrelid,a.attnum,'INSERT') as can_insert,
 has_column_privilege(r.oid,a.attrelid,a.attnum,'UPDATE') as can_update
from pg_roles r cross join pg_attribute a
where r.rolname in ('anon','authenticated','service_role')
 and a.attrelid=to_regclass('public.profiles') and a.attnum>0 and not a.attisdropped
order by r.rolname,a.attnum;

-- E: required signatures (missing objects are reported, never created).
select signature,to_regprocedure(signature) is not null as present
from (values ('public.prevent_role_self_change()'),('public.compose_full_name()'),
 ('public.handle_new_resident_signup()'),('public.is_official(uuid)'),
 ('public.current_official_holds_position(text)'),
 ('public.current_official_may_administer_records()'),('public.notify_verification()'),
 ('public.sync_verified_resident_directory()'),
 ('public.set_barangay_resident_eligibility(uuid,boolean)')) as required(signature);

-- F: all public functions plus direct Auth/profile trigger functions. Do not
-- expose proconfig values: custom settings can themselves contain credentials.
select p.oid::regprocedure::text as signature,pg_get_function_result(p.oid) as result_type,
 p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner) as owner,
 md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
 md5(coalesce(array_to_string(p.proconfig,E'\n'),'')) as config_fingerprint,
 r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as effective_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where p.prokind='f' and r.rolname in ('anon','authenticated','service_role')
 and (n.nspname='public' or p.oid in
  (select tgfoid from pg_trigger where tgrelid in
   (to_regclass('auth.users'),to_regclass('public.profiles')) and not tgisinternal))
order by signature,r.rolname;

-- G: trigger event/timing/binding/enablement and predicates, as fingerprints.
-- Compare function OIDs, not rendered regprocedure text: schema qualification in
-- that display changes with search_path and previously produced false negatives.
select n.nspname as target_schema,c.relname as target_table,t.tgname,
 t.tgfoid::regprocedure::text as function_signature,
 case
  when t.tgrelid=to_regclass('auth.users') and t.tgname='trg_handle_new_resident_signup'
   then t.tgfoid=to_regprocedure('public.handle_new_resident_signup()')
  when t.tgrelid=to_regclass('public.profiles') and t.tgname='trg_compose_full_name'
   then t.tgfoid=to_regprocedure('public.compose_full_name()')
  when t.tgrelid=to_regclass('public.profiles') and t.tgname='trg_prevent_role_self_change'
   then t.tgfoid=to_regprocedure('public.prevent_role_self_change()')
  when t.tgrelid=to_regclass('public.profiles') and t.tgname='trg_notify_verification'
   then t.tgfoid=to_regprocedure('public.notify_verification()')
  when t.tgrelid=to_regclass('public.profiles') and t.tgname='trg_sync_verified_resident_directory'
   then t.tgfoid=to_regprocedure('public.sync_verified_resident_directory()')
  else null
 end as expected_function_matches,
 t.tgtype,t.tgenabled,
 t.tgattr::text as attribute_numbers,t.tgqual is null as unconditional,
 md5(pg_get_triggerdef(t.oid)) as definition_fingerprint
from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and t.tgrelid in
 (to_regclass('public.profiles'),to_regclass('auth.users'),to_regclass('public.barangay_residents'))
order by target_schema,target_table,t.tgname;

-- H: additional role memberships and automation presence are metadata only.
select parent.rolname as granted_role,member.rolname as member_role,m.admin_option
from pg_auth_members m join pg_roles parent on parent.oid=m.roleid
join pg_roles member on member.oid=m.member
where member.rolname in ('anon','authenticated','service_role','authenticator','supabase_auth_admin')
order by member_role,granted_role;
select e.extname,e.extversion,n.nspname as extension_schema
from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname;
select table_schema,table_name,column_name,data_type from information_schema.columns
where (table_schema='supabase_migrations' and table_name='schema_migrations')
 or (table_schema in ('cron','net') and table_name in ('job','http_request_queue'))
order by table_schema,table_name,ordinal_position;

-- No cron commands/URLs, queue payloads, migration statement arrays or user rows.
-- Ledger versions, if needed, require a separate reviewed query after presence
-- and column shape are confirmed. SQL Editor applications may be unrecorded.
rollback;
