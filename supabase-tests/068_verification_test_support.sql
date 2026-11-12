-- Shared by precontrol and post-patch harness. NO migration is applied here.
-- Caller must BEGIN first. Required independently approved environment values:
-- approval_id, manifest_sha256, approved_database, approved_system_identifier.
-- bb_qa.environment_attestation is provisioned only by separately approved setup.
select set_config('bb068.approval',:'approval_id',true) as approval_setting,
       set_config('bb068.manifest',:'manifest_sha256',true) as manifest_setting,
       set_config('bb068.database',:'approved_database',true) as database_setting,
       set_config('bb068.system_identifier',:'approved_system_identifier',true) as cluster_setting \gset
do $$
declare approved boolean;
begin
  if current_database() <> current_setting('bb068.database')
    or current_database() !~ '^bb068_test_[a-zA-Z0-9_]+$'
    or (select system_identifier::text from pg_control_system()) <> current_setting('bb068.system_identifier')
    or current_setting('bb068.approval')='' or current_setting('bb068.manifest') !~ '^[a-f0-9]{64}$' then
    raise exception 'Disposable environment identity/approval gate failed';
  end if;
  select count(*)=1 and bool_and(approval_id=current_setting('bb068.approval')
    and manifest_sha256=current_setting('bb068.manifest') and synthetic_only and outbound_blocked)
    into approved from bb_qa.environment_attestation;
  if approved is distinct from true then raise exception 'Synthetic provenance/outbound attestation missing'; end if;
  -- Attestation must be backed by out-of-band review, not inferred from its flags.
end $$;

create function pg_temp.assert_true(ok boolean,label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',label; end if;
end $$;

create function pg_temp.baseline_actor(actor uuid,staff boolean) returns void
language plpgsql security invoker as $$
declare affected integer;
begin
  perform pg_temp.assert_true(auth.uid()=actor and auth.role()='authenticated','JWT context');
  perform pg_temp.assert_true((select count(*)=1 from public.profiles where id=actor),'own SELECT visibility');
  perform pg_temp.assert_true(has_table_privilege(current_user,'public.profiles','SELECT'),'SELECT grant');
  perform pg_temp.assert_true((select bool_and(has_column_privilege(current_user,'public.profiles',a.attname,'UPDATE'))
    from pg_attribute a where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped),'column UPDATE baseline');
  perform pg_temp.assert_true(public.current_official_may_administer_records()=staff,'expected staff eligibility');
  -- Prove the own UPDATE policy actually permits a changed safe field, not
  -- merely that table privileges exist. Deliberately undo this probe locally.
  begin
    update public.profiles set contact_number=case when contact_number='09990000003'
      then '09990000004' else '09990000003' end where id=actor;
    get diagnostics affected=row_count;
    perform pg_temp.assert_true(affected=1,'baseline actual own UPDATE');
    raise exception 'Rollback successful baseline probe' using errcode='PT068';
  exception when sqlstate 'PT068' then null;
  end;
end $$;

create function pg_temp.expect_update(command text,allowed boolean,label text,expected_message text default null,expected_state text default '42501') returns void
language plpgsql security invoker as $$
declare affected integer:=0; denied boolean:=false; context text;
begin
  begin
    execute command;
    get diagnostics affected=row_count;
  exception when others then
    get stacked diagnostics context=pg_exception_context;
    -- A generic privilege or SELECT failure MUST NOT count as a guard pass.
    if expected_message is null or sqlstate<>expected_state or sqlerrm<>expected_message
      or position('prevent_role_self_change' in context)=0 then raise; end if;
    denied:=true;
  end;
  if allowed then
    perform pg_temp.assert_true(not denied and affected=1,label);
  elsif expected_message is not null then
    perform pg_temp.assert_true(denied,label);
  else
    -- Expected RLS filtering: an exception is not equivalent to zero rows.
    perform pg_temp.assert_true(not denied and affected=0,label);
  end if;
end $$;

-- Verified fixture inventory, not just a database-name convention.
select pg_temp.assert_true((select count(*)=7 from public.profiles),'exact synthetic profile inventory');
select pg_temp.assert_true((select count(*)=7 from auth.users where id in
  (:'secretary_id',:'punong_id',:'ordinary_id',:'resident_id',:'target_id',:'archived_id',:'unlinked_id'))),'synthetic Auth inventory');
select pg_temp.assert_true((select count(*)=7 from auth.users),'no extra Auth records');
select pg_temp.assert_true(not exists(select 1 from public.complaints)
  and not exists(select 1 from public.incidents) and not exists(select 1 from public.document_requests),'no business records in fixture');
-- Snapshot entire rows, privately in transaction; never print record contents.
create temp table bb068_profiles_before as table public.profiles;
create temp table bb068_directory_before as table public.barangay_residents;
create temp table bb068_notifications_before as table public.notifications;
create temp table bb068_audit_before as table public.activity_log;

select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_profiles from public.profiles r \gset
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_directory from public.barangay_residents r \gset
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_notifications from public.notifications r \gset
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_audit from public.activity_log r \gset
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_credit_events from public.community_credit_events r \gset
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) as baseline_enrollments from public.community_credit_enrollments r \gset
select pg_temp.assert_true(not exists(select 1 from public.barangay_residents where profile_id=:'target_id'),'target has no preexisting directory row');
select pg_temp.assert_true(exists(select 1 from public.official_account_links l join public.barangay_officials o on o.id=l.official_id where l.profile_id=:'archived_id' and o.archived_at is not null),'archived fixture mapping');
select pg_temp.assert_true(not exists(select 1 from public.official_account_links where profile_id=:'unlinked_id'),'unlinked fixture mapping');

select pg_temp.assert_true((select count(*)=7 from public.profiles where id in (:'secretary_id',:'punong_id',:'ordinary_id',:'resident_id',:'target_id',:'archived_id',:'unlinked_id')),'exact fixture UUID manifest');
