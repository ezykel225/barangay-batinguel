-- EMERGENCY ROLLBACK CONTINGENCY FOR MIGRATION 066. NOT A MIGRATION.
--
-- ⚠️ Running this RE-OPENS the disclosure migration 066 closed: every active
-- official would again receive linked complaint references, categories,
-- statuses and roles through person_history() and person_analytics(), and the
-- KP and complaint references of an incident's KP link. Use it only to restore
-- service after a defect in 066 itself, with separate written approval, and
-- re-apply a corrected 066 as soon as possible.
--
-- It restores the two functions VERBATIM from migrations 061 and 062 (the
-- bodies below are generated from those files and a Jest test re-extracts and
-- compares them byte for byte), then drops 066's two private helpers. It
-- writes no row and changes no grant: CREATE OR REPLACE keeps the EXECUTE
-- grants that 061/062 set and 066 left untouched.
--
-- Order matters: the functions are replaced BEFORE the helpers are dropped,
-- because 066's versions call the helpers.

begin;

-- From 061_person_matter_linking.sql
create or replace function public.person_history(p_person_kind text,p_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_identity jsonb; v_incidents jsonb; v_complaints jsonb;
begin
  perform public.person_history_require_view();
  if p_person_kind='resident' then
    select jsonb_build_object('kind','resident','id',r.id,'full_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'purok',r.purok,'resident_status',r.resident_status,'credit_applicable',true) into v_identity
      from public.barangay_residents r where r.id=p_person_id;
  elsif p_person_kind='external' then
    select jsonb_build_object('kind','external','id',e.id,'full_name',concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix),
      'recorded_barangay',e.recorded_barangay,'recorded_city_municipality',e.recorded_city_municipality,
      'address_snapshot',e.address_snapshot,'credit_applicable',false,'linked_resident_id',l.resident_id,
      'linked_resident_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)) into v_identity
      from public.external_persons e left join public.external_person_resident_links l on l.external_person_id=e.id
      left join public.barangay_residents r on r.id=l.resident_id where e.id=p_person_id;
  else raise exception 'Invalid person kind'; end if;
  if v_identity is null then raise exception 'Person unavailable'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('matter_id',p.incident_id,'matter_key','incident:'||p.incident_id::text,
    'incident_id',i.id,'reference',i.reference,'occurred_at',i.occurred_at,
    'type',i.incident_type,'status',i.status,'role',p.role,'outcome',p.outcome_status,'blotter_reference',b.entry_reference,
    'kp_reference',k.reference,'complaint_reference',c.reference) order by i.occurred_at desc,i.id),'[]'::jsonb) into v_incidents
  from public.incident_parties p join public.incidents i on i.id=p.incident_id
  left join public.blotter_entries b on b.incident_id=i.id
  left join public.incident_case_links l on l.incident_id=i.id left join public.kp_cases k on k.id=l.case_id
  left join public.complaints c on c.id=k.complaint_id
  where (p_person_kind='resident' and p.resident_id=p_person_id) or (p_person_kind='external' and p.external_person_id=p_person_id);

  select coalesce(jsonb_agg(jsonb_build_object('matter_id',q.complaint_id,'matter_key','complaint:'||q.complaint_id::text,
    'complaint_id',q.complaint_id,'reference',q.reference,'created_at',q.created_at,'category',q.category,'status',q.status,
    'roles',q.roles,'kp_reference',q.kp_reference,'linked_incident_references',q.linked_incident_references)
    order by q.created_at desc,q.complaint_id),'[]'::jsonb) into v_complaints
  from (
    select c.id complaint_id,c.reference,c.created_at,c.category,c.status,
      array_agg(distinct cp.party_role order by cp.party_role) roles,
      (select k.reference from public.kp_cases k where k.complaint_id=c.id) kp_reference,
      (select coalesce(jsonb_agg(i.reference order by i.reference),'[]'::jsonb)
       from public.kp_cases k2 join public.incident_case_links l on l.case_id=k2.id
       join public.incidents i on i.id=l.incident_id where k2.complaint_id=c.id) linked_incident_references
    from public.complaint_parties cp join public.complaints c on c.id=cp.complaint_id
    where (p_person_kind='resident' and cp.resident_id=p_person_id)
       or (p_person_kind='external' and cp.external_person_id=p_person_id)
    group by c.id,c.reference,c.created_at,c.category,c.status
  ) q;

  return jsonb_build_object('identity',v_identity,'incidents',v_incidents,'complaints',v_complaints,
    'timeline',coalesce((select jsonb_agg(x order by x->>'occurred_at' desc) from (
      select jsonb_build_object('kind','incident','occurred_at',r->>'occurred_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) x from jsonb_array_elements(v_incidents) r
      union all select jsonb_build_object('kind','complaint','occurred_at',r->>'created_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) from jsonb_array_elements(v_complaints) r
    ) s),'[]'::jsonb));
end; $$;

-- From 062_analytics_insights.sql
create or replace function public.person_analytics(p_person_kind text,p_person_id uuid,p_from date default null,p_to date default null,p_window text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean; v_identity jsonb; v_enrolled timestamptz; v_now timestamptz:=now(); v_today date:=(now() at time zone 'Asia/Manila')::date;
  v_filter_start timestamptz; v_filter_end timestamptz; v_current_start timestamptz; v_previous_start timestamptz; v_result jsonb;
begin
  perform public.person_history_require_view();
  -- Complaint location notes are restricted to records administrators, as on the
  -- complaints table policy; every other official reads them as 'Restricted'.
  v_admin:=coalesce(public.current_official_may_administer_records(),false);
  if p_person_kind is null or p_window is null or p_person_kind not in ('resident','external') or p_person_id is null or p_window not in ('all','last_30_days','last_90_days','last_12_months','previous_12_months','custom')
    or (p_window='custom' and (p_from is null and p_to is null)) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid analytics request'; end if;
  v_current_start:=((v_today-interval '12 months')::date::timestamp at time zone 'Asia/Manila');
  v_previous_start:=((v_today-interval '24 months')::date::timestamp at time zone 'Asia/Manila');
  if p_window='last_30_days' then v_filter_start:=v_now-interval '30 days'; v_filter_end:=v_now;
  elsif p_window='last_90_days' then v_filter_start:=v_now-interval '90 days'; v_filter_end:=v_now;
  elsif p_window='last_12_months' then v_filter_start:=v_current_start; v_filter_end:=v_now;
  elsif p_window='previous_12_months' then v_filter_start:=v_previous_start; v_filter_end:=v_current_start;
  elsif p_window='custom' then if p_from is not null then v_filter_start:=(p_from::timestamp at time zone 'Asia/Manila'); end if; if p_to is not null then v_filter_end:=((p_to+1)::timestamp at time zone 'Asia/Manila'); end if; end if;
  if p_person_kind='resident' then
    select jsonb_build_object('kind','resident','id',r.id,'display_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'status',r.resident_status,'purok',r.purok) into v_identity from public.barangay_residents r where r.id=p_person_id;
    select e.started_at into v_enrolled from public.community_credit_enrollments e
      join public.community_credit_policies p on p.id=e.policy_id and p.status='active' where e.resident_id=p_person_id;
  else
    select jsonb_build_object('kind','external','id',e.id,'display_name',concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix),
      'status','external','recorded_location',concat_ws(', ',e.recorded_barangay,e.recorded_city_municipality))
      into v_identity from public.external_persons e where e.id=p_person_id;
  end if;
  if v_identity is null then raise exception 'Person unavailable'; end if;

  with raw as (select m.matter_key,m.matter_kind,m.matter_id,m.reference,m.occurred_at,m.category,
      case when m.matter_kind='complaint' and not v_admin then 'Restricted' else m.area_label end area_label,
      m.role,m.outcome,m.related_records
    from public.analytics_person_matters(p_person_kind,p_person_id) m),
  filtered as (select * from raw where (v_filter_start is null or occurred_at>=v_filter_start) and (v_filter_end is null or occurred_at<v_filter_end)),
  matters as (select distinct on(matter_key) * from filtered order by matter_key,occurred_at),
  qualifying as (select distinct on(matter_key) * from raw where role in ('respondent','subject') order by matter_key,occurred_at),
  pre as (select * from qualifying where v_enrolled is not null and occurred_at<v_enrolled),
  post as (select * from qualifying where v_enrolled is not null and occurred_at>=v_enrolled),
  current12 as (select * from qualifying where occurred_at>=v_current_start and occurred_at<=v_now),
  previous12 as (select * from qualifying where occurred_at>=v_previous_start and occurred_at<v_current_start)
  select jsonb_build_object(
    'analytics_available',exists(select 1 from raw),'coverage',jsonb_build_object('basis','verified_linked_records',
      'message','Based on verified linked records. Unlinked historical records are not attributed to this person.',
      'linked_record_count',(select count(distinct matter_key) from raw),'historical_linking_complete',null),
    'identity',v_identity,'filters',jsonb_build_object('window',p_window,'from',p_from,'to',p_to,'starts_at',v_filter_start,'ends_at_exclusive',v_filter_end),
    'summary',jsonb_build_object('distinct_linked_matters',(select count(*) from matters),
      'incident_matters',(select count(*) from matters where matter_kind='incident'),
      'complaint_kp_matters',(select count(*) from matters where matter_kind='complaint')),
    'roles',coalesce((select jsonb_agg(x order by x.total desc,x.role) from
      (select role,count(distinct matter_key) total from filtered group by role) x),'[]'::jsonb),
    'outcomes',coalesce((select jsonb_agg(x order by x.total desc,x.outcome) from
      (select outcome,count(distinct matter_key) total from filtered where role in ('respondent','subject') group by outcome) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x order by x.total desc,x.category) from
      (select category,count(distinct matter_key) total,round(100.0*count(distinct matter_key)/nullif((select count(*) from matters),0),1) percentage
       from filtered group by category) x),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(x order by x.total desc,x.area_label) from
      (select area_label,count(distinct matter_key) total from filtered group by area_label) x),'[]'::jsonb),
    'weekdays',coalesce((select jsonb_agg(x order by x.weekday_number) from
      (select extract(isodow from occurred_at at time zone 'Asia/Manila')::int weekday_number,
       to_char(occurred_at at time zone 'Asia/Manila','FMDay') weekday,count(distinct matter_key) total from filtered group by 1,2) x),'[]'::jsonb),
    'time_buckets',coalesce((select jsonb_agg(x order by x.bucket_order) from
      (select case when extract(hour from occurred_at at time zone 'Asia/Manila')<4 then 1
        when extract(hour from occurred_at at time zone 'Asia/Manila')<8 then 2 when extract(hour from occurred_at at time zone 'Asia/Manila')<12 then 3
        when extract(hour from occurred_at at time zone 'Asia/Manila')<16 then 4 when extract(hour from occurred_at at time zone 'Asia/Manila')<20 then 5 else 6 end bucket_order,
       case when extract(hour from occurred_at at time zone 'Asia/Manila')<4 then '12 AM–3:59 AM'
        when extract(hour from occurred_at at time zone 'Asia/Manila')<8 then '4 AM–7:59 AM' when extract(hour from occurred_at at time zone 'Asia/Manila')<12 then '8 AM–11:59 AM'
        when extract(hour from occurred_at at time zone 'Asia/Manila')<16 then '12 PM–3:59 PM' when extract(hour from occurred_at at time zone 'Asia/Manila')<20 then '4 PM–7:59 PM' else '8 PM–11:59 PM' end bucket,
       count(distinct matter_key) total from filtered group by 1,2) x),'[]'::jsonb),
    'monthly',coalesce((select jsonb_agg(x order by x.month) from
      (select to_char(date_trunc('month',occurred_at at time zone 'Asia/Manila'),'YYYY-MM') as month,count(distinct matter_key) total from filtered group by 1) x),'[]'::jsonb),
    'comparison',jsonb_build_object('current_period','last_12_months','current_period_qualifying_matters',(select count(*) from current12),
      'previous_period_qualifying_matters',(select count(*) from previous12),'absolute_change',(select count(*) from current12)-(select count(*) from previous12)),
    'community_credit_periods',jsonb_build_object('enrolled',v_enrolled is not null,'started_at',v_enrolled,
      'pre_enrollment_qualifying_matters',(select count(*) from pre),'post_enrollment_qualifying_matters',(select count(*) from post)),
    'historical_review',case when p_person_kind='external' then jsonb_build_object('available',false,'reason','not_applicable_to_external_person')
      else jsonb_build_object('available',v_enrolled is not null,'threshold',5,'qualifying_count',(select count(*) from pre),
       'requires_review',(select count(*) from pre)>5,'substantiated_count',(select count(*) from pre where outcome='substantiated'),
       'not_substantiated_count',(select count(*) from pre where outcome='not_substantiated'),
       'not_determined_or_unknown_count',(select count(*) from pre where outcome in ('not_determined','unknown','closed','referred')),
       'date_from',(select min(occurred_at) from pre),'date_to',(select max(occurred_at) from pre),
       'top_categories',coalesce((select jsonb_agg(x order by x.total desc,x.category) from (select category,count(*) total from pre group by category) x),'[]'::jsonb),
       'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',matter_key,'kind',matter_kind,'reference',reference,'occurred_at',occurred_at,
         'category',category,'role',role,'outcome',outcome,'related_records',related_records) order by occurred_at desc) from pre),'[]'::jsonb),
       'message','These historical records do not affect the resident''s starting Community Credit score of 100.') end,
    'indicators',jsonb_build_array(
      jsonb_build_object('key','repeated_responsibility_roles','label','Repeated respondent/subject involvement','matter_count',(select count(*) from current12),
        'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',matter_key,'reference',reference,'kind',matter_kind,'role',role,'outcome',outcome,'related_records',related_records) order by occurred_at desc) from current12),'[]'::jsonb)),
      jsonb_build_object('key','period_change','label','Matter count compared with previous comparable period','current',(select count(*) from current12),'previous',(select count(*) from previous12),
        'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',matter_key,'reference',reference,'kind',matter_kind,'role',role,'outcome',outcome,'related_records',related_records) order by occurred_at desc) from current12),'[]'::jsonb))),
    'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',matter_key,'kind',matter_kind,'reference',reference,
      'occurred_at',occurred_at,'category',category,'area',area_label,'role',role,'outcome',outcome,'related_records',related_records) order by occurred_at desc) from filtered),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

drop function public.person_linked_records(text,uuid,boolean);
drop function public.person_history_identities(text,uuid);

commit;
