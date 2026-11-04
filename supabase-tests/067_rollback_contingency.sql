-- EMERGENCY ROLLBACK CONTINGENCY FOR MIGRATION 067. NOT A MIGRATION.
--
-- This UNINSTALLS Community Credit V2 and restores the 059/060 functions that
-- 067 replaced. It is for an emergency only (a defect in 067 itself found
-- BEFORE any V2 data exists), needs separate written approval, and must be
-- rehearsed on a disposable database first.
--
-- ⚠️ It REFUSES to run while any V2 data exists: a participation policy, an
-- activity, a participation, a V2 ledger event, a correction request, a
-- transition, a request record or a cap lock. Once V2 has been used, the safe
-- path is the two-person emergency RESTORE transition inside 067 (which keeps
-- V2 history read-only), not an uninstall. Deleting V2 history would need its
-- own reviewed data-retention procedure and a private export, and is not
-- provided here.
--
-- ⚠️ It also RE-OPENS individual score visibility to every active official
-- (059's community_credit_may_view_resident), which 067 narrowed.
--
-- It refuses without the typed acknowledgement, set in the same session first:
--   set community_credit.rollback_ack = 'REMOVE COMMUNITY CREDIT V2';
--
-- The function bodies below are copied verbatim from 059/060; a Jest test
-- re-extracts and compares them. The widened activity_log entity vocabulary is
-- deliberately left in place: narrowing a CHECK can fail on audit rows, and the
-- extra values are inert.

begin;

do $guard$
begin
  if coalesce(current_setting('community_credit.rollback_ack',true),'')<>'REMOVE COMMUNITY CREDIT V2' then
    raise exception 'Refused: set community_credit.rollback_ack to the typed acknowledgement first';
  end if;
  if exists(select 1 from public.community_credit_policies where policy_model='participation_v2')
     or exists(select 1 from public.community_credit_activities) or exists(select 1 from public.community_credit_participations)
     or exists(select 1 from public.community_credit_events where participation_activity_id is not null or reason is not null or request_id is not null)
     or exists(select 1 from public.community_credit_correction_requests) or exists(select 1 from public.community_credit_transitions)
     or exists(select 1 from public.community_credit_requests) or exists(select 1 from public.community_credit_cap_locks)
     or exists(select 1 from public.community_credit_enrollments where enrollment_source='policy_transition' or starting_score<>100)
     or exists(select 1 from public.community_credit_rules where annual_points_cap is not null or prepared_by is not null) then
    raise exception 'Refused: Community Credit V2 data exists. Use the two-person emergency restore transition instead of uninstalling 067';
  end if;
end $guard$;

-- From 059_community_credit_foundation.sql
create or replace function public.community_credit_may_view_resident(p_resident_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.current_official_is_active() or exists(
      select 1 from public.barangay_residents r
      join public.profiles p on p.id=r.profile_id
      where r.id=p_resident_id and p.id=auth.uid() and p.role='resident'
    )
  );
$$;

-- From 060_community_credit_enrollment.sql
create or replace function public.community_credit_enroll_resident(p_resident_id uuid,p_source text,p_actor uuid)
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

-- From 060_community_credit_enrollment.sql
create or replace function public.community_credit_enroll_active_residents(p_policy_id uuid)
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

-- From 060_community_credit_enrollment.sql
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

-- From 060_community_credit_enrollment.sql
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
-- End of restored bodies

drop trigger community_credit_policy_guard on public.community_credit_policies;
drop trigger community_credit_rule_guard on public.community_credit_rules;
drop trigger community_credit_enrollment_guard on public.community_credit_enrollments;

drop function public.community_credit_v2_prototype_rules(),public.save_community_credit_v2_policy(uuid,text,text),
  public.approve_community_credit_v2_policy(uuid),public.save_community_credit_v2_rule(uuid,uuid,text,text,text,integer,integer,text),
  public.approve_community_credit_v2_rule(uuid),public.create_community_credit_activity(uuid,uuid,text,timestamptz,timestamptz,text,text),
  public.community_credit_activities_list(integer),public.verify_community_credit_participation(uuid,uuid,uuid,text,text),
  public.award_community_credit_participation(uuid,uuid,uuid),public.reverse_community_credit_award(uuid,uuid,text),
  public.reaward_community_credit_participation(uuid,uuid,uuid,text),public.submit_community_credit_correction_request(uuid,text,uuid,text,text),
  public.my_community_credit_correction_requests(),public.community_credit_correction_requests_admin(text),
  public.resolve_community_credit_correction_request(uuid,text,text),public.community_credit_policy_history(uuid),
  public.my_community_credit_policy_history(),public.community_credit_aggregate(),public.community_credit_transition_preflight(),
  public.prepare_community_credit_transition(uuid,text),public.approve_community_credit_transition(uuid,text),
  public.cancel_community_credit_transition(uuid,text),public.community_credit_record_award(uuid,uuid,text,uuid,uuid),
  public.community_credit_check_participant(uuid,uuid,boolean),public.community_credit_require_resident_self(uuid),
  public.community_credit_activity_reference(integer),public.community_credit_request_finish(uuid,jsonb),
  public.community_credit_request_claim(uuid,text,jsonb),public.community_credit_milestone(bigint),public.community_credit_milestones(),
  public.community_credit_correction_json(public.community_credit_correction_requests),
  public.community_credit_guard_policy(),public.community_credit_guard_rule(),public.community_credit_guard_enrollment();

alter table public.community_credit_participations drop constraint community_credit_participations_active_award_fk,
  drop constraint community_credit_participations_last_reversed_fk;
alter table public.community_credit_events drop constraint community_credit_events_participation_fk,
  drop column participation_activity_id,drop column participation_resident_id,drop column reason,
  drop column reaward_of_event_id,drop column request_id;
drop table public.community_credit_transitions,public.community_credit_correction_requests,public.community_credit_cap_locks,
  public.community_credit_requests,public.community_credit_participations,public.community_credit_activities;
drop function public.community_credit_guard_workflow_row(),public.community_credit_v2_writer_on(),public.community_credit_v2_writer(boolean);

alter table public.community_credit_rules drop constraint community_credit_rules_cap_multiple,
  drop constraint community_credit_rules_independent_approval,drop column annual_points_cap,drop column evidence_requirement,
  drop column prepared_by,drop column approved_by,drop column approved_at;
alter table public.community_credit_policies drop constraint community_credit_policies_v2_score_model,
  drop constraint community_credit_policies_v2_approval,drop constraint community_credit_policies_independent_approval,
  drop column policy_model,drop column prepared_by,drop column approved_by,drop column approved_at;

alter table public.community_credit_enrollments drop constraint community_credit_enrollments_starting_score_check;
alter table public.community_credit_enrollments add constraint community_credit_enrollments_starting_score_check check (starting_score = 100);
alter table public.community_credit_enrollments drop constraint community_credit_enrollments_enrollment_source_check;
alter table public.community_credit_enrollments add constraint community_credit_enrollments_enrollment_source_check
  check (enrollment_source in ('active_resident_batch','resident_created','resident_reactivated'));

commit;
