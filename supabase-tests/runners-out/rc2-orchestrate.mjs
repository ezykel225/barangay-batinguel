import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
const c='pg067test', main='validation067_rc2_20261104', contracts='validation067_rc2_contracts_20261104'
const run=(db,sql)=>execFileSync('docker',['exec','-i',c,'psql','-X','-q','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:60000})
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')
const log=(name,fn)=>{try{const out=fn();fs.writeFileSync(`supabase-tests/runners-out/rc2-${name}.log`,out||'');console.log('PASS '+name);if(out)console.log(out.trim().split('\n').slice(-3).join('\n'))}catch(e){fs.writeFileSync(`supabase-tests/runners-out/rc2-${name}.log`,String(e.stdout||'')+String(e.stderr||''));throw e}}
const install=read('supabase-tests/067_install_safety.sql')
const pre=install.slice(0,install.indexOf('-- @@APPLY_067@@'))
const snapshot=`
create schema rc2_audit;
create table rc2_audit.tables_before(name text primary key,columns text[],rows jsonb,attrs jsonb);
do $capture$ declare r record; keys text[]; payload jsonb; attrs jsonb; begin
for r in select tablename from pg_tables where schemaname='public' loop
 select array_agg(attname::text order by attnum),jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by attnum) into keys,attrs from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=format('public.%I',r.tablename)::regclass and a.attnum>0 and not a.attisdropped;
 execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from public.%I x',r.tablename) into payload;
 insert into rc2_audit.tables_before values(r.tablename,keys,payload,attrs);
end loop; end $capture$;
create table rc2_audit.constraints_before as select c.relname as tab,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace;
create table rc2_audit.functions_before as select p.oid::regprocedure::text signature,p.proname,md5(pg_get_functiondef(p.oid)) fingerprint from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
create table rc2_audit.profiles_before as select id,profile from t067i_profile_before;
create function rc2_audit.assert_preserved() returns void language plpgsql as $check$
declare tbl record; payload jsonb; attrs jsonb; begin
 for tbl in select * from rc2_audit.tables_before loop
 if to_regclass(format('public.%I',tbl.name)) is null then raise exception 'Original table missing: %',tbl.name; end if;
 execute format('select coalesce(jsonb_agg(j order by j::text),''[]''::jsonb) from (select (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(x)) where key=any($1)) j from public.%I x) q',tbl.name) into payload using tbl.columns;
 if payload is distinct from tbl.rows then raise exception 'Original data changed: %',tbl.name; end if;
 select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by attnum) into attrs from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=format('public.%I',tbl.name)::regclass and a.attnum>0 and not a.attisdropped and a.attname::text=any(tbl.columns);
 if attrs is distinct from tbl.attrs then raise exception 'Original columns changed: %',tbl.name; end if;
 end loop;
 if exists(select 1 from rc2_audit.constraints_before b left join pg_constraint k on k.conrelid=format('public.%I',b.tab)::regclass and k.conname=b.conname where (k.oid is null or pg_get_constraintdef(k.oid)<>b.definition) and not (b.tab='activity_log' and b.conname='activity_log_entity_type_check') and not (b.tab='community_credit_enrollments' and b.conname in ('community_credit_enrollments_starting_score_check','community_credit_enrollments_enrollment_source_check'))) then raise exception 'Unexpected original constraint change';end if;
 if exists(select 1 from rc2_audit.functions_before b left join pg_proc p on p.oid=to_regprocedure(b.signature) where (p.oid is null or md5(pg_get_functiondef(p.oid))<>b.fingerprint) and b.proname not in ('sms_may_manage','person_history','person_analytics','community_credit_may_view_resident','community_credit_enroll_resident','community_credit_enroll_active_residents','community_credit_guard_event','community_credit_profile')) then raise exception 'Unexpected original function replacement'; end if;
end $check$;
commit;`
log('seed-v1-and-snapshot',()=>run(main,pre+snapshot))
for(const [number,file] of [[62,'062_analytics_insights.sql'],[63,'063_retire_legacy_module_access.sql'],[65,'065_retire_nurse_sms_permissions.sql'],[66,'066_person_history_privacy.sql'],[67,'067_community_credit_v2.sql']]){
 if(number===65){const sql=execFileSync('node',['supabase-tests/065_build_test_runner.mjs'],{encoding:'utf8'});log('065-security-harness',()=>run(contracts,sql))}
 if(number===67){const sql=read('supabase-tests/runners-out/067-install.sql');log('067-install-safety',()=>run(contracts,sql))}
 for(const [tag,db]of [['v1',main],['contracts',contracts]])log(`apply-${number}-${tag}`,()=>run(db,read('supabase-migrations/'+file)))
 log(`preservation-after-${number}`,()=>run(main,'select rc2_audit.assert_preserved();'))
 if(number===62)log('062-behavior-89',()=>run(contracts,read('supabase-tests/062_analytics_behavioral.sql')))
 if(number===63)log('063-security-24',()=>run(contracts,read('supabase-tests/063_retired_modules_behavioral.sql')))
 if(number===66)log('066-privacy',()=>run(contracts,read('supabase-tests/066_person_history_privacy_behavioral.sql')))
 if(number===67)log('067-behavior-28',()=>run(contracts,read('supabase-tests/067_community_credit_v2_behavioral.sql')))
}
log('v1-profiles-unchanged',()=>run(main,`begin;create function pg_temp.q(p uuid) returns jsonb language plpgsql as $$declare v jsonb;begin perform set_config('request.jwt.claim.sub','f0671000-0000-4000-8000-000000000001',true);set local role authenticated;select public.community_credit_profile(p) into v;reset role;return v;end;$$;do $$begin if exists(select 1 from rc2_audit.profiles_before b where (pg_temp.q(b.id)-array['status','policy_model','has_previous_policies','gauge']) is distinct from b.profile) then raise exception 'V1 profile changed';end if;if exists(select 1 from public.community_credit_policies where policy_model<>'legacy_v1') or exists(select 1 from public.community_credit_activities) or exists(select 1 from public.community_credit_participations) or exists(select 1 from public.community_credit_transitions) or exists(select 1 from public.community_credit_correction_requests) or exists(select 1 from public.community_credit_requests) then raise exception 'Unexpected V2 activation/data';end if;raise notice 'V1 scores preserved: 85,100,100,n/a; no V2 activation or data';end;$$;rollback;`))
console.log('COMPLETE: full ordered candidate, all stage tests, V1 data/structure/profile preservation')
