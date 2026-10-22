-- NOT APPLIED. Community Credit Phase 1 foundation only.
-- Reports, complaints, incidents and blotter entries never create credit events here.
begin;

create table public.community_credit_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  base_score integer not null check (base_score between -100000 and 100000),
  minimum_score integer not null check (minimum_score between -100000 and 100000),
  maximum_score integer not null check (maximum_score between -100000 and 100000),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effective_from timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (minimum_score <= base_score and base_score <= maximum_score),
  check ((status = 'active' and effective_from is not null) or status <> 'active')
);
create unique index community_credit_one_active_policy
  on public.community_credit_policies ((status)) where status = 'active';

create table public.community_credit_rules (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  rule_code text not null check (rule_code ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  category text not null check (category in ('positive','negative','repair','correction')),
  source_domain text not null check (source_domain in ('community_activity','incident_outcome','kp_outcome','credit_repair','administrative_correction')),
  points_delta integer not null check (points_delta between -10000 and 10000 and points_delta <> 0),
  repairable boolean not null default false,
  active boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (policy_id, rule_code),
  check ((category = 'negative' and points_delta < 0) or
         (category in ('positive','repair') and points_delta > 0) or
         category = 'correction')
);
create index community_credit_rules_policy_idx on public.community_credit_rules(policy_id,active,rule_code);

create table public.community_credit_events (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  rule_id uuid not null references public.community_credit_rules(id) on delete restrict,
  event_kind text not null check (event_kind in ('positive','negative','repair','correction')),
  rule_code_snapshot text not null,
  rule_title_snapshot text not null,
  points_delta_snapshot integer not null check (points_delta_snapshot between -10000 and 10000 and points_delta_snapshot <> 0),
  source_type text not null check (source_type in ('community_activity','incident_outcome','kp_outcome','credit_repair','administrative_correction')),
  source_id uuid,
  source_reference_snapshot text check (length(source_reference_snapshot) <= 200),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null,
  note text check (length(note) <= 1000),
  reverses_event_id uuid unique references public.community_credit_events(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index community_credit_events_resident_policy_idx
  on public.community_credit_events(resident_id,policy_id,created_at desc,id);

alter table public.community_credit_policies enable row level security;
alter table public.community_credit_rules enable row level security;
alter table public.community_credit_events enable row level security;
revoke all on public.community_credit_policies,public.community_credit_rules,public.community_credit_events
  from public,anon,authenticated,service_role;

-- Keep high-level administration visible without copying resident history into the activity log.
do $audit$
declare v_expression text;
begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into v_expression
  from pg_catalog.pg_constraint
  where conrelid='public.activity_log'::regclass and conname='activity_log_entity_type_check';
  if v_expression is null then raise exception 'Existing activity log vocabulary is required'; end if;
  alter table public.activity_log drop constraint activity_log_entity_type_check;
  execute 'alter table public.activity_log add constraint activity_log_entity_type_check check (('||v_expression||') or entity_type in (''community_credit_policy'',''community_credit_rule''))';
end;
$audit$;

create function public.community_credit_require_admin()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.current_official_may_administer_records(),false) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end; $$;

create function public.community_credit_may_view_resident(p_resident_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.current_official_is_active() or exists(
      select 1 from public.barangay_residents r
      join public.profiles p on p.id=r.profile_id
      where r.id=p_resident_id and p.id=auth.uid() and p.role='resident'
    )
  );
$$;

create function public.community_credit_guard_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_rule public.community_credit_rules%rowtype; v_original public.community_credit_events%rowtype;
begin
  select * into v_rule from public.community_credit_rules where id=new.rule_id;
  if not found or v_rule.policy_id<>new.policy_id or not v_rule.active then raise exception 'Active rule unavailable'; end if;
  new.event_kind:=v_rule.category;
  new.rule_code_snapshot:=v_rule.rule_code;
  new.rule_title_snapshot:=v_rule.title;
  new.points_delta_snapshot:=v_rule.points_delta;
  new.source_type:=v_rule.source_domain;
  if new.verified_at>now() then raise exception 'Verification time cannot be in the future'; end if;
  if new.reverses_event_id is not null then
    select * into v_original from public.community_credit_events where id=new.reverses_event_id;
    if not found or v_original.resident_id<>new.resident_id or v_original.policy_id<>new.policy_id
      or v_original.reverses_event_id is not null then raise exception 'Invalid reversal target'; end if;
    if v_rule.category<>'correction' or v_rule.points_delta<>-v_original.points_delta_snapshot then
      raise exception 'A reversal must be an equal, opposite correction'; end if;
  end if;
  return new;
end; $$;
create trigger community_credit_event_guard before insert on public.community_credit_events
  for each row execute function public.community_credit_guard_event();

create function public.community_credit_immutable_event()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Community credit events are immutable'; end; $$;
create trigger community_credit_events_no_update_delete before update or delete on public.community_credit_events
  for each row execute function public.community_credit_immutable_event();

create function public.community_credit_profile(p_resident_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resident public.barangay_residents%rowtype; v_policy public.community_credit_policies%rowtype;
  v_total bigint; v_result jsonb; v_ledger jsonb;
begin
  if p_resident_id is null or not public.community_credit_may_view_resident(p_resident_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into v_resident from public.barangay_residents where id=p_resident_id;
  if not found then raise exception 'Resident unavailable'; end if;
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then
    return jsonb_build_object('configured',false,'message','Community credit policy is not configured.',
      'resident',jsonb_build_object('id',v_resident.id,'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
      'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null),'ledger','[]'::jsonb);
  end if;
  select coalesce(sum(e.points_delta_snapshot),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'created_at',e.created_at,'verified_at',e.verified_at,'event',e.rule_title_snapshot,'rule_code',e.rule_code_snapshot,
    'category',e.event_kind,'points',e.points_delta_snapshot,'source',e.source_type,'source_reference',e.source_reference_snapshot,
    'verified_by',coalesce(p.full_name,'Verified official'),'note',e.note,'reverses_event_id',e.reverses_event_id)
    order by e.created_at desc,e.id desc),'[]'::jsonb)
  into v_total,v_ledger from public.community_credit_events e left join public.profiles p on p.id=e.verified_by
  where e.resident_id=p_resident_id and e.policy_id=v_policy.id;
  select jsonb_build_object('configured',true,'resident_id',v_resident.id,'policy_id',v_policy.id,'policy_name',v_policy.name,
    'policy_description',v_policy.description,'base_score',v_policy.base_score,'event_total',v_total,
    'current_score',greatest(v_policy.minimum_score,least(v_policy.maximum_score,v_policy.base_score+v_total)),
    'minimum_score',v_policy.minimum_score,'maximum_score',v_policy.maximum_score,
    'positive_event_count',count(*) filter(where e.event_kind='positive'),'negative_event_count',count(*) filter(where e.event_kind='negative'),
    'repair_event_count',count(*) filter(where e.event_kind='repair'),'correction_event_count',count(*) filter(where e.event_kind='correction'),
    'last_credit_event_at',max(e.created_at),'resident',jsonb_build_object('id',v_resident.id,
      'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
      'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null),
    'ledger',v_ledger) into v_result
  from public.community_credit_events e where e.resident_id=p_resident_id and e.policy_id=v_policy.id;
  return v_result;
end; $$;

create function public.community_credit_resident_directory()
returns table(id uuid,first_name text,middle_name text,last_name text,suffix text,purok text,resident_status text,account_linked boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.current_official_is_active() then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select r.id,r.first_name,r.middle_name,r.last_name,r.suffix,r.purok,r.resident_status,r.profile_id is not null
    from public.barangay_residents r order by r.last_name,r.first_name,r.id;
end; $$;

create function public.my_community_credit_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select r.id into v_id from public.barangay_residents r join public.profiles p on p.id=r.profile_id
    where p.id=auth.uid() and p.role='resident';
  if v_id is null then return jsonb_build_object('linked',false,'message','Your resident directory record is not yet linked to this account.'); end if;
  return jsonb_build_object('linked',true,'profile',public.community_credit_profile(v_id));
end; $$;

create function public.community_credit_admin_state()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  return jsonb_build_object('policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.community_credit_policies p),'[]'::jsonb),
    'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_code) from public.community_credit_rules r),'[]'::jsonb));
end; $$;

create function public.save_community_credit_policy(p_id uuid,p_name text,p_description text,p_base_score integer,p_minimum_score integer,p_maximum_score integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.community_credit_require_admin();
  if p_minimum_score>p_base_score or p_base_score>p_maximum_score then raise exception 'Minimum, base and maximum scores are invalid'; end if;
  if p_id is null then
    insert into public.community_credit_policies(name,description,base_score,minimum_score,maximum_score,created_by,updated_by)
    values(btrim(p_name),coalesce(btrim(p_description),''),p_base_score,p_minimum_score,p_maximum_score,auth.uid(),auth.uid()) returning id into v_id;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_policy',v_id,'Community credit policy created');
  else
    update public.community_credit_policies set name=btrim(p_name),description=coalesce(btrim(p_description),''),base_score=p_base_score,
      minimum_score=p_minimum_score,maximum_score=p_maximum_score,updated_by=auth.uid(),updated_at=now()
    where id=p_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'Only draft policies can be edited'; end if;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',v_id,'Community credit policy updated');
  end if;
  return v_id;
end; $$;

create function public.activate_community_credit_policy(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  if exists(select 1 from public.community_credit_policies where status='active') then raise exception 'Retire the active policy before activating another'; end if;
  update public.community_credit_policies set status='active',effective_from=now(),updated_by=auth.uid(),updated_at=now() where id=p_id and status='draft';
  if not found then raise exception 'Only a draft policy can be activated'; end if;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',p_id,'Community credit policy activated');
end; $$;

create function public.retire_community_credit_policy(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  update public.community_credit_policies set status='retired',updated_by=auth.uid(),updated_at=now() where id=p_id and status='active';
  if not found then raise exception 'Only the active policy can be retired'; end if;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',p_id,'Community credit policy retired');
end; $$;

create function public.save_community_credit_rule(p_id uuid,p_policy_id uuid,p_rule_code text,p_title text,p_description text,p_category text,p_source_domain text,p_points_delta integer,p_repairable boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text;
begin
  perform public.community_credit_require_admin();
  select status into v_status from public.community_credit_policies where id=p_policy_id;
  if v_status is null or v_status='retired' then raise exception 'Rules require a draft or active policy'; end if;
  if p_category='correction' then raise exception 'Correction rules are schema-supported but not available in Phase 1 administration'; end if;
  if p_points_delta=0 or (p_category='negative' and p_points_delta>=0) or (p_category in ('positive','repair') and p_points_delta<=0) then raise exception 'Points do not match the rule category'; end if;
  if p_id is null then
    insert into public.community_credit_rules(policy_id,rule_code,title,description,category,source_domain,points_delta,repairable,created_by,updated_by)
    values(p_policy_id,upper(btrim(p_rule_code)),btrim(p_title),coalesce(btrim(p_description),''),p_category,p_source_domain,p_points_delta,coalesce(p_repairable,false),auth.uid(),auth.uid()) returning id into v_id;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_rule',v_id,'Community credit rule created');
  else
    update public.community_credit_rules set rule_code=upper(btrim(p_rule_code)),title=btrim(p_title),description=coalesce(btrim(p_description),''),category=p_category,
      source_domain=p_source_domain,points_delta=p_points_delta,repairable=coalesce(p_repairable,false),updated_by=auth.uid(),updated_at=now()
    where id=p_id and policy_id=p_policy_id and active=false returning id into v_id;
    if v_id is null then raise exception 'Only an inactive rule can be edited'; end if;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_rule',v_id,'Community credit rule updated');
  end if;
  return v_id;
end; $$;

create function public.set_community_credit_rule_active(p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  if p_active is null then raise exception 'Rule state is required'; end if;
  update public.community_credit_rules r set active=p_active,updated_by=auth.uid(),updated_at=now()
  from public.community_credit_policies p where r.id=p_id and p.id=r.policy_id and p.status in ('draft','active');
  if not found then raise exception 'Rule unavailable'; end if;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values('edited','community_credit_rule',p_id,case when p_active then 'Community credit rule enabled' else 'Community credit rule disabled' end);
end; $$;

revoke all on function public.community_credit_require_admin(),public.community_credit_may_view_resident(uuid),
  public.community_credit_guard_event(),public.community_credit_immutable_event(),public.community_credit_profile(uuid),public.community_credit_resident_directory(),
  public.my_community_credit_profile(),public.community_credit_admin_state(),
  public.save_community_credit_policy(uuid,text,text,integer,integer,integer),public.activate_community_credit_policy(uuid),
  public.retire_community_credit_policy(uuid),public.save_community_credit_rule(uuid,uuid,text,text,text,text,text,integer,boolean),
  public.set_community_credit_rule_active(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.community_credit_profile(uuid),public.community_credit_resident_directory(),public.my_community_credit_profile(),public.community_credit_admin_state(),
  public.save_community_credit_policy(uuid,text,text,integer,integer,integer),public.activate_community_credit_policy(uuid),
  public.retire_community_credit_policy(uuid),public.save_community_credit_rule(uuid,uuid,text,text,text,text,text,integer,boolean),
  public.set_community_credit_rule_active(uuid,boolean) to authenticated;
commit;
