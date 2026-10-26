-- NOT APPLIED. Requires applied migration 059. Community Credit enrollment only.
-- No complaint, KP, incident, blotter, Tanod or historical record creates a credit event here.
begin;

create table public.community_credit_enrollments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  started_at timestamptz not null default now(),
  starting_score integer not null default 100 check (starting_score = 100),
  enrollment_source text not null check (enrollment_source in ('active_resident_batch','resident_created','resident_reactivated')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  unique(resident_id,policy_id)
);
create index community_credit_enrollments_policy_idx on public.community_credit_enrollments(policy_id,started_at,resident_id);
alter table public.community_credit_enrollments enable row level security;
revoke all on public.community_credit_enrollments from public,anon,authenticated,service_role;

create function public.community_credit_enroll_resident(p_resident_id uuid,p_source text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_inserted uuid;
begin
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then return false; end if;
  if v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100 then
    raise exception 'The active policy must use the approved 100 / 0 / 100 score model';
  end if;
  if p_source not in ('active_resident_batch','resident_created','resident_reactivated') then raise exception 'Invalid enrollment source'; end if;
  if not exists(select 1 from public.barangay_residents r where r.id=p_resident_id and r.resident_status='active') then return false; end if;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
    values(p_resident_id,v_policy.id,100,p_source,p_actor)
    on conflict(resident_id,policy_id) do nothing returning id into v_inserted;
  return v_inserted is not null;
end; $$;

create function public.community_credit_enroll_active_residents(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_added integer;
begin
  perform public.community_credit_require_admin();
  select * into v_policy from public.community_credit_policies where id=p_policy_id and status='active' for update;
  if not found then raise exception 'Active policy unavailable'; end if;
  if v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100 then
    raise exception 'The active policy must use the approved 100 / 0 / 100 score model';
  end if;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
  select r.id,v_policy.id,100,'active_resident_batch',auth.uid() from public.barangay_residents r where r.resident_status='active'
  on conflict(resident_id,policy_id) do nothing;
  get diagnostics v_added=row_count;
  return jsonb_build_object('policy_id',v_policy.id,'added',v_added,'enrolled',(
    select count(*) from public.community_credit_enrollments e join public.barangay_residents r on r.id=e.resident_id
    where e.policy_id=v_policy.id and r.resident_status='active'));
end; $$;

create function public.community_credit_enroll_on_active_resident()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.resident_status='active' and (tg_op='INSERT' or old.resident_status is distinct from 'active') then
    perform public.community_credit_enroll_resident(new.id,case when tg_op='INSERT' then 'resident_created' else 'resident_reactivated' end,auth.uid());
  end if;
  return new;
end; $$;
create trigger community_credit_enroll_active_resident after insert or update of resident_status on public.barangay_residents
  for each row execute function public.community_credit_enroll_on_active_resident();

create or replace function public.save_community_credit_policy(p_id uuid,p_name text,p_description text,p_base_score integer,p_minimum_score integer,p_maximum_score integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.community_credit_require_admin();
  if p_base_score is distinct from 100 or p_minimum_score is distinct from 0 or p_maximum_score is distinct from 100 then
    raise exception 'Community Credit v1 requires base 100, minimum 0 and maximum 100';
  end if;
  if p_id is null then
    insert into public.community_credit_policies(name,description,base_score,minimum_score,maximum_score,created_by,updated_by)
    values(btrim(p_name),coalesce(btrim(p_description),''),100,0,100,auth.uid(),auth.uid()) returning id into v_id;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_policy',v_id,'Community credit policy created');
  else
    update public.community_credit_policies set name=btrim(p_name),description=coalesce(btrim(p_description),''),base_score=100,
      minimum_score=0,maximum_score=100,updated_by=auth.uid(),updated_at=now()
    where id=p_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'Only draft policies can be edited'; end if;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',v_id,'Community credit policy updated');
  end if;
  return v_id;
end; $$;

-- The applied 059 function returned void. Recreate it so activation can report the real enrollment count.
drop function public.activate_community_credit_policy(uuid);
create function public.activate_community_credit_policy(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_added integer; v_enrolled integer;
begin
  perform public.community_credit_require_admin();
  select * into v_policy from public.community_credit_policies where id=p_id and status='draft' for update;
  if not found then raise exception 'Only a draft policy can be activated'; end if;
  if v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100 then
    raise exception 'The approved policy configuration is base 100, minimum 0, maximum 100';
  end if;
  if exists(select 1 from public.community_credit_policies where status='active') then raise exception 'Retire the active policy before activating another'; end if;
  update public.community_credit_policies set status='active',effective_from=now(),updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
  select r.id,v_policy.id,100,'active_resident_batch',auth.uid()
  from public.barangay_residents r where r.resident_status='active'
  on conflict(resident_id,policy_id) do nothing;
  get diagnostics v_added=row_count;
  select count(*) into v_enrolled from public.community_credit_enrollments e
  join public.barangay_residents r on r.id=e.resident_id
  where e.policy_id=v_policy.id and r.resident_status='active';
  insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',p_id,'Community credit policy activated');
  return jsonb_build_object('policy_id',p_id,'added',v_added,'enrolled',v_enrolled);
end; $$;

create or replace function public.community_credit_guard_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_rule public.community_credit_rules%rowtype; v_original public.community_credit_events%rowtype; v_started timestamptz;
begin
  select * into v_rule from public.community_credit_rules where id=new.rule_id;
  if not found or v_rule.policy_id<>new.policy_id or not v_rule.active then raise exception 'Active rule unavailable'; end if;
  select e.started_at into v_started from public.community_credit_enrollments e where e.resident_id=new.resident_id and e.policy_id=new.policy_id;
  if v_started is null then raise exception 'Resident is not enrolled in this Community Credit policy'; end if;
  new.event_kind:=v_rule.category; new.rule_code_snapshot:=v_rule.rule_code; new.rule_title_snapshot:=v_rule.title;
  new.points_delta_snapshot:=v_rule.points_delta; new.source_type:=v_rule.source_domain;
  if new.verified_at>now() then raise exception 'Verification time cannot be in the future'; end if;
  if new.verified_at<v_started then raise exception 'Pre-enrollment records cannot create Community Credit events'; end if;
  if new.reverses_event_id is not null then
    select * into v_original from public.community_credit_events where id=new.reverses_event_id;
    if not found or v_original.resident_id<>new.resident_id or v_original.policy_id<>new.policy_id or v_original.reverses_event_id is not null then raise exception 'Invalid reversal target'; end if;
    if v_original.verified_at<v_started then raise exception 'A pre-enrollment event cannot be reversed into the Community Credit ledger'; end if;
    if v_rule.category<>'correction' or v_rule.points_delta<>-v_original.points_delta_snapshot then raise exception 'A reversal must be an equal, opposite correction'; end if;
  end if;
  return new;
end; $$;

create or replace function public.community_credit_profile(p_resident_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resident public.barangay_residents%rowtype; v_policy public.community_credit_policies%rowtype;
 v_enrollment public.community_credit_enrollments%rowtype; v_total bigint; v_result jsonb; v_ledger jsonb;
begin
  if p_resident_id is null or not public.community_credit_may_view_resident(p_resident_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_resident from public.barangay_residents where id=p_resident_id;
  if not found then raise exception 'Resident unavailable'; end if;
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then return jsonb_build_object('configured',false,'message','Community credit policy is not configured.','resident',jsonb_build_object(
   'id',v_resident.id,'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
   'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null),'ledger','[]'::jsonb,'historical_review',jsonb_build_object('available',false,'threshold',5)); end if;
  select * into v_enrollment from public.community_credit_enrollments where resident_id=p_resident_id and policy_id=v_policy.id;
  if not found then return jsonb_build_object('configured',true,'enrolled',false,'message','Community credit enrollment has not started for this resident.',
   'policy_id',v_policy.id,'policy_name',v_policy.name,'minimum_score',0,'maximum_score',100,'resident',jsonb_build_object(
   'id',v_resident.id,'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
   'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null),'ledger','[]'::jsonb,'historical_review',jsonb_build_object('available',false,'threshold',5)); end if;
  select coalesce(sum(e.points_delta_snapshot),0),coalesce(jsonb_agg(jsonb_build_object('id',e.id,'created_at',e.created_at,
   'verified_at',e.verified_at,'event',e.rule_title_snapshot,'rule_code',e.rule_code_snapshot,'category',e.event_kind,'points',e.points_delta_snapshot,
   'source',e.source_type,'source_reference',e.source_reference_snapshot,'verified_by',coalesce(p.full_name,'Verified official'),'note',e.note,
   'reverses_event_id',e.reverses_event_id) order by e.created_at desc,e.id desc),'[]'::jsonb) into v_total,v_ledger
  -- verified_at is the authoritative decision date; created_at only records when the database row was created.
  from public.community_credit_events e left join public.profiles p on p.id=e.verified_by
  where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
  select jsonb_build_object('configured',true,'enrolled',true,'resident_id',v_resident.id,'policy_id',v_policy.id,'policy_name',v_policy.name,
   'policy_description',v_policy.description,'credit_started_at',v_enrollment.started_at,'starting_score',v_enrollment.starting_score,
   'base_score',v_enrollment.starting_score,'event_total',v_total,'current_score',greatest(0,least(100,v_enrollment.starting_score+v_total)),
   'minimum_score',0,'maximum_score',100,'positive_event_count',count(*) filter(where e.event_kind='positive'),
   'negative_event_count',count(*) filter(where e.event_kind='negative'),'repair_event_count',count(*) filter(where e.event_kind='repair'),
   'correction_event_count',count(*) filter(where e.event_kind='correction'),'last_credit_event_at',max(e.created_at),
   'resident',jsonb_build_object('id',v_resident.id,'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
   'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null),
   'ledger',v_ledger,'historical_review',jsonb_build_object('available',false,'threshold',5)) into v_result
  from public.community_credit_events e where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
  return v_result;
end; $$;

revoke all on function public.community_credit_enroll_resident(uuid,text,uuid),public.community_credit_enroll_active_residents(uuid),
 public.community_credit_enroll_on_active_resident(),public.save_community_credit_policy(uuid,text,text,integer,integer,integer),
 public.activate_community_credit_policy(uuid) from public,anon,authenticated,service_role;
grant execute on function public.community_credit_enroll_active_residents(uuid),
 public.save_community_credit_policy(uuid,text,text,integer,integer,integer),public.activate_community_credit_policy(uuid) to authenticated;
commit;
