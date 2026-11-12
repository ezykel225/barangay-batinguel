-- PREPARED, NOT EXECUTED. Synthetic disposable database ONLY; never production.
-- psql -X -v ON_ERROR_STOP=1 ... -f this_file
-- Required psql variables: secretary_id, punong_id, ordinary_id, resident_id,
-- target_id, archived_id, unlinked_id plus the support-file approval variables. Fixture: resident_id is rejected; target_id is pending; both are
-- resident profiles with valid names. Staff accounts have distinct, active,
-- verified official_account_links/positions. No auth accounts are created here.
-- Use a trusted local test connection allowed SET ROLE, not service-role HTTP.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
\ir 068_verification_test_support.sql

select pg_temp.assert_true((select count(*)=7 from public.profiles
  where id in (:'secretary_id',:'punong_id',:'ordinary_id',:'resident_id',:'target_id',:'archived_id',:'unlinked_id')),'distinct fixture accounts');
select pg_temp.assert_true((select role='resident' and verification_status='rejected' from public.profiles where id=:'resident_id'),'rejected fixture');
select pg_temp.assert_true((select role='resident' and verification_status='pending' from public.profiles where id=:'target_id'),'pending fixture');
select pg_temp.assert_true((select count(*)=3 from public.profiles where role='official'
  and id in (:'secretary_id',:'punong_id',:'ordinary_id')),'official fixture roles');

-- Actual RLS/trigger evaluation under authenticated, not SECURITY DEFINER tests.
select set_config('request.jwt.claims',jsonb_build_object('sub',:'ordinary_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'ordinary_id',false);
select pg_temp.assert_true(not public.current_official_may_administer_records(),'ordinary official fixture');
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'target_id'),false,'ordinary cannot approve');
select pg_temp.expect_update(format('update public.profiles set verification_status=''rejected'' where id=%L',:'target_id'),false,'ordinary cannot reject');
select pg_temp.expect_update(format('update public.profiles set verification_notes=''tampered'' where id=%L',:'target_id'),false,'ordinary cannot edit metadata');
select pg_temp.expect_update(format('update public.profiles set role=''resident'' where id=%L',:'ordinary_id'),false,'own policy cannot change role','Protected account fields cannot be edited');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',:'resident_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'resident_id',false);
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'resident_id'),false,'resident cannot self verify','Verification decisions and metadata require authorized records staff');
select pg_temp.expect_update(format('update public.profiles set verified_by=case when verified_by=%L::uuid then %L::uuid else %L::uuid end where id=%L',:'secretary_id',:'punong_id',:'secretary_id',:'resident_id'),false,'resident cannot forge verifier','Verification decisions and metadata require authorized records staff');
select pg_temp.expect_update(format('update public.profiles set verified_at=coalesce(verified_at,now())+interval ''1 day'' where id=%L',:'resident_id'),false,'resident cannot forge decision clock','Verification decisions and metadata require authorized records staff');
select pg_temp.expect_update(format('update public.profiles set verification_notes=coalesce(verification_notes,'''')||''TEST_ONLY_TAMPER'' where id=%L',:'resident_id'),false,'resident cannot rewrite notes','Verification decisions and metadata require authorized records staff');
select pg_temp.expect_update(format('update public.profiles set system_id=''TEST-ALTERED'' where id=%L',:'resident_id'),false,'resident cannot change system identity','Protected account fields cannot be edited');
select pg_temp.expect_update(format('update public.profiles set email=''tampered@example.invalid'' where id=%L',:'resident_id'),false,'resident cannot alter profile email','Protected account fields cannot be edited');
select pg_temp.expect_update(format('update public.profiles set verification_status=''pending'' where id=%L',:'target_id'),false,'resident cannot edit another account');
reset role;
select pg_temp.assert_true(not exists((select * from public.profiles except select * from bb068_profiles_before) union all (select * from bb068_profiles_before except select * from public.profiles)),'denied updates changed no profile rows');
set local role authenticated;
select pg_temp.expect_update(format('update public.profiles set contact_number=case when contact_number=''09990000000'' then ''09990000001'' else ''09990000000'' end where id=%L',:'resident_id'),true,'ordinary own profile update');
select pg_temp.expect_update(format('update public.profiles set verification_status=''pending'',verification_notes=null where id=%L',:'resident_id'),true,'rejected resident can resubmit');
select pg_temp.assert_true((select verification_status='pending' and verified_by is null and verified_at is null from public.profiles where id=:'resident_id'),'resubmission clears decision stamps');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',:'secretary_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'secretary_id',true);
select pg_temp.assert_true(public.current_official_may_administer_records(),'Secretary fixture');
select pg_temp.assert_true(public.current_official_holds_position('Barangay Secretary'),'Secretary position link');
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'',verified_by=%L,verified_at=''2000-01-01'' where id=%L',:'ordinary_id',:'target_id'),true,'Secretary approves');
select pg_temp.assert_true((select verified_by=auth.uid() and verified_at=now() from public.profiles where id=:'target_id'),'decision stamps are server owned');
select pg_temp.expect_update(format('update public.profiles set role=''official'' where id=%L',:'target_id'),false,'staff cannot promote resident role','Protected account fields cannot be edited');
reset role;
select id as directory_id from public.barangay_residents where profile_id=:'target_id' \gset

select set_config('request.jwt.claims',jsonb_build_object('sub',:'target_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'target_id',false);
select pg_temp.expect_update(format('update public.profiles set first_name=first_name||'' TEST'' where id=%L',:'target_id'),true,'verified owner can correct name');
select pg_temp.assert_true((select verification_status='pending' and verified_by is null and verified_at is null from public.profiles where id=:'target_id'),'name correction invalidates verification');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'secretary_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'secretary_id',true);
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'target_id'),true,'Secretary rechecks changed identity');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',:'punong_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'punong_id',true);
select pg_temp.assert_true(public.current_official_may_administer_records(),'Punong fixture');
select pg_temp.assert_true(public.current_official_holds_position('Punong Barangay'),'Punong position link');
select pg_temp.expect_update(format('update public.profiles set verification_status=''rejected'',verification_notes=''TEST ONLY rejection'' where id=%L',:'target_id'),true,'Punong rejects');
select pg_temp.assert_true((select verified_by=auth.uid() and verified_at=now() from public.profiles where id=:'target_id'),'Punong server stamps');
select public.set_barangay_resident_eligibility(:'directory_id',false);
select pg_temp.assert_true((select verification_status='ineligible' from public.profiles where id=:'target_id'),'eligibility RPC still works');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'target_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'target_id',false);
select pg_temp.expect_update(format('update public.profiles set verification_status=''pending'' where id=%L',:'target_id'),false,'ineligible resident cannot resubmit','Verification decisions and metadata require authorized records staff');
select pg_temp.expect_update(format('update public.profiles set first_name=first_name||'' TEST'' where id=%L',:'target_id'),false,'ineligible resident cannot change identity','Ineligible identity changes require records staff review');
reset role;
-- Additional protected and mixed updates: use the owner path, not hidden rows.
select set_config('request.jwt.claims',jsonb_build_object('sub',:'resident_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'resident_id',false);
select pg_temp.expect_update(format('update public.profiles set id=%L where id=%L',:'target_id',:'resident_id'),false,'protected UUID','Protected account fields cannot be edited');
select pg_temp.expect_update(format('update public.profiles set created_at=created_at+interval ''1 day'' where id=%L',:'resident_id'),false,'protected creation timestamp','Protected account fields cannot be edited');
select pg_temp.expect_update(format('update public.profiles set contact_number=''09990000002'',role=''official'' where id=%L',:'resident_id'),false,'mixed permitted and protected update','Protected account fields cannot be edited');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',:'archived_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'archived_id',false);
select pg_temp.assert_true(not public.current_official_is_active(),'archived official inactive');
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'target_id'),false,'archived official cannot approve');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'unlinked_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'unlinked_id',false);
select pg_temp.assert_true(not public.current_official_is_active(),'unlinked official inactive');
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'target_id'),false,'unlinked official cannot approve');
reset role;

-- Anonymous denial is a separate grant/RLS result, not credited to 068's guard.
select set_config('request.jwt.claims','{"role":"anon"}',true) \gset
select set_config('bb068.anonymous_target',:'target_id',true) as anonymous_target \gset
set local role anon;
do $$ declare n integer; begin
  if has_table_privilege(current_user,'public.profiles','UPDATE') then
    update public.profiles set verification_status='verified' where id=current_setting('bb068.anonymous_target')::uuid;
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Anonymous update unexpectedly affected rows'; end if;
  else
    begin
      update public.profiles set verification_status='verified' where id=current_setting('bb068.anonymous_target')::uuid;
      raise exception 'Anonymous UPDATE grant expectation failed';
    exception when insufficient_privilege then
      if sqlerrm<>'permission denied for table profiles' then raise; end if;
    end;
  end if;
end $$;
reset role;

-- Trusted backend checks are SQL role-context tests, NOT signed HTTP tests.
select set_config('request.jwt.claims','{"role":"service_role"}',true) \gset
set local role service_role;
select pg_temp.expect_update(format('update public.profiles set verification_notes=''TEST ONLY service maintenance'' where id=%L',:'resident_id'),true,'service-role maintenance');
reset role;
select set_config('request.jwt.claims','{}',true) \gset
select pg_temp.assert_true(session_user in ('postgres','supabase_admin') and current_setting('role')='none','trusted maintenance session');
select pg_temp.expect_update(format('update public.profiles set verification_notes=''TEST ONLY direct maintenance'' where id=%L',:'resident_id'),true,'trusted SQL maintenance');

-- Privileged observers prove AFTER side effects instead of trusting UPDATE success.
select pg_temp.assert_true((select count(*) from public.notifications where entity_type='resident_account' and entity_id=:'target_id' and event='verified')
 -(select count(*) from bb068_notifications_before where entity_type='resident_account' and entity_id=:'target_id' and event='verified')=2,'two verification notifications');
select pg_temp.assert_true((select count(*) from public.notifications where entity_type='resident_account' and entity_id=:'target_id' and event='rejected')
 -(select count(*) from bb068_notifications_before where entity_type='resident_account' and entity_id=:'target_id' and event='rejected')=1,'rejection notification');
select pg_temp.assert_true((select count(*) from public.notifications where entity_type='resident_account' and entity_id=:'target_id' and event='ineligible')
 -(select count(*) from bb068_notifications_before where entity_type='resident_account' and entity_id=:'target_id' and event='ineligible')=1,'eligibility notification');
select pg_temp.assert_true((select count(*) from public.notifications where entity_type='resident_account' and entity_id=:'resident_id' and event='submitted')
 -(select count(*) from bb068_notifications_before where entity_type='resident_account' and entity_id=:'resident_id' and event='submitted')=1,'resubmission notification');
select pg_temp.assert_true((select count(*) from public.notifications where entity_type='resident_account' and entity_id=:'target_id' and event='submitted')
 -(select count(*) from bb068_notifications_before where entity_type='resident_account' and entity_id=:'target_id' and event='submitted')=1,'name-change notification');
select pg_temp.assert_true((select count(*)=1 from public.barangay_residents d join public.profiles p on p.id=d.profile_id where p.id=:'target_id' and d.resident_status='inactive' and d.first_name=p.first_name),'directory synchronized and eligibility preserved');
select pg_temp.assert_true((select count(*) from public.activity_log where entity_type='barangay_resident' and entity_id=:'directory_id')
 -(select count(*) from bb068_audit_before where entity_type='barangay_resident' and entity_id=:'directory_id')=3,'two sync audits and eligibility audit');
rollback;
\ir 068_verification_cleanup_check.sql
