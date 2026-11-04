-- NOT APPLIED. Requires applied migrations 001-061. Descriptive analytics only.
-- No prediction, risk score, identity inference, Community Credit event, or score mutation.
begin;

create index complaints_created_at_idx on public.complaints(created_at desc);

create function public.analytics_person_matters(p_person_kind text,p_person_id uuid)
returns table(matter_key text,matter_kind text,matter_id uuid,reference text,occurred_at timestamptz,
  category text,area_label text,role text,outcome text,related_records jsonb)
language sql stable security definer set search_path='' as $$
  select 'incident:'||i.id::text,'incident',i.id,i.reference,i.occurred_at,i.incident_type,
    coalesce(nullif(btrim(i.area_note),''),nullif(btrim(i.location_text),''),'Not recorded'),p.role,p.outcome_status,
    coalesce((select jsonb_agg(jsonb_build_object('kind','complaint','reference',c.reference,'kp_reference',k.reference) order by c.reference)
      from public.incident_case_links l join public.kp_cases k on k.id=l.case_id
      join public.complaints c on c.id=k.complaint_id where l.incident_id=i.id),'[]'::jsonb)
  from public.incident_parties p join public.incidents i on i.id=p.incident_id
  where (p_person_kind='resident' and p.resident_id=p_person_id)
     or (p_person_kind='external' and p.external_person_id=p_person_id)
  union all
  select 'complaint:'||c.id::text,'complaint',c.id,c.reference,c.created_at,c.category,
    coalesce(nullif(btrim(c.location_note),''),'Not recorded'),p.party_role,'unknown',
    coalesce((select jsonb_agg(jsonb_build_object('kind','incident','reference',i.reference) order by i.reference)
      from public.kp_cases k join public.incident_case_links l on l.case_id=k.id
      join public.incidents i on i.id=l.incident_id where k.complaint_id=c.id),'[]'::jsonb)
  from public.complaint_parties p join public.complaints c on c.id=p.complaint_id
  where (p_person_kind='resident' and p.resident_id=p_person_id)
     or (p_person_kind='external' and p.external_person_id=p_person_id);
$$;

create function public.person_analytics(p_person_kind text,p_person_id uuid,p_from date default null,p_to date default null,p_window text default 'all')
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

create function public.barangay_safety_analytics(p_from date default null,p_to date default null,p_category text default null,p_area text default null,p_window text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean; v_result jsonb; v_now timestamptz:=now(); v_today date:=(now() at time zone 'Asia/Manila')::date;
  v_start timestamptz; v_end timestamptz; v_current_start timestamptz; v_previous_start timestamptz;
begin
  perform public.person_history_require_view();
  -- The named, barangay-wide repeat_people list is for records administrators only.
  -- Others receive NULL plus repeat_people_restricted=true, never an empty list.
  v_admin:=coalesce(public.current_official_may_administer_records(),false);
  if p_window is null or p_window not in ('all','last_30_days','last_90_days','last_12_months','previous_12_months','custom')
    or (p_window='custom' and (p_from is null and p_to is null)) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid analytics range'; end if;
  v_current_start:=((v_today-interval '12 months')::date::timestamp at time zone 'Asia/Manila');
  v_previous_start:=((v_today-interval '24 months')::date::timestamp at time zone 'Asia/Manila');
  if p_window='last_30_days' then v_start:=v_now-interval '30 days'; v_end:=v_now;
  elsif p_window='last_90_days' then v_start:=v_now-interval '90 days'; v_end:=v_now;
  elsif p_window='last_12_months' then v_start:=v_current_start; v_end:=v_now;
  elsif p_window='previous_12_months' then v_start:=v_previous_start; v_end:=v_current_start;
  elsif p_window='custom' then if p_from is not null then v_start:=(p_from::timestamp at time zone 'Asia/Manila'); end if; if p_to is not null then v_end:=((p_to+1)::timestamp at time zone 'Asia/Manila'); end if; end if;
  with incidents as (
    select i.*,coalesce(nullif(btrim(i.area_note),''),nullif(btrim(i.location_text),''),'Not recorded') area
    from public.incidents i where (v_start is null or i.occurred_at>=v_start) and (v_end is null or i.occurred_at<v_end)
      and (p_category is null or p_category='' or i.incident_type=p_category)
      and (p_area is null or p_area='' or coalesce(nullif(btrim(i.area_note),''),nullif(btrim(i.location_text),''),'Not recorded')=p_area)
  ), parties as (select p.* from public.incident_parties p join incidents i on i.id=p.incident_id)
  select jsonb_build_object('filters',jsonb_build_object('window',p_window,'from',p_from,'to',p_to,'starts_at',v_start,'ends_at_exclusive',v_end,'category',p_category,'area',p_area),
    'coverage',jsonb_build_object('basis','recorded_incidents_and_verified_party_links','incident_matter_count',(select count(*) from incidents),
      'incidents_with_verified_people',(select count(distinct incident_id) from parties)),
    'overview',jsonb_build_object('distinct_incident_matters',(select count(*) from incidents),'linked_people',(select count(distinct coalesce(resident_id,external_person_id)) from parties),
      'respondent_subject_matters',(select count(distinct incident_id) from parties where role in ('respondent','subject')),
      'victim_matters',(select count(distinct incident_id) from parties where role='victim'),
      'substantiated_outcomes',(select count(distinct incident_id) from parties where outcome_status='substantiated'),
      'not_substantiated_outcomes',(select count(distinct incident_id) from parties where outcome_status='not_substantiated')),
    'monthly',coalesce((select jsonb_agg(x order by x.month) from (select to_char(date_trunc('month',occurred_at at time zone 'Asia/Manila'),'YYYY-MM') as month,count(*) total from incidents group by 1) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x order by x.total desc,x.category) from (select incident_type category,count(*) total from incidents group by 1) x),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(x order by x.total desc,x.area) from (select area,count(*) total from incidents group by 1) x),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(x order by x.total desc,x.role) from (select role,count(distinct incident_id) total from parties group by 1) x),'[]'::jsonb),
    'outcomes',coalesce((select jsonb_agg(x order by x.total desc,x.outcome) from (select outcome_status outcome,count(distinct incident_id) total from parties group by 1) x),'[]'::jsonb),
    'weekdays',coalesce((select jsonb_agg(x order by x.weekday_number) from (select extract(isodow from occurred_at at time zone 'Asia/Manila')::int weekday_number,to_char(occurred_at at time zone 'Asia/Manila','FMDay') weekday,count(*) total from incidents group by 1,2) x),'[]'::jsonb),
    'time_buckets',coalesce((select jsonb_agg(x order by x.bucket) from (select (extract(hour from occurred_at at time zone 'Asia/Manila')::int/4) bucket,count(*) total from incidents group by 1) x),'[]'::jsonb),
    'repeat_people',case when v_admin then coalesce((select jsonb_agg(x order by x.qualifying_matters desc,x.display_name) from (
      with qualified as (
        select case when p.resident_id is not null then 'resident' else 'external' end person_kind,
          coalesce(p.resident_id,p.external_person_id) person_id,
          case when p.resident_id is not null then concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix) else concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix) end display_name,
          'incident:'||p.incident_id::text matter_key,'incident'::text matter_kind,i.reference,p.outcome_status outcome,i.incident_type category,i.occurred_at recorded_at
        from parties p join incidents i on i.id=p.incident_id left join public.barangay_residents r on r.id=p.resident_id
        left join public.external_persons e on e.id=p.external_person_id where p.role in ('respondent','subject')
        union all
        select case when p.resident_id is not null then 'resident' else 'external' end,coalesce(p.resident_id,p.external_person_id),
          case when p.resident_id is not null then concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix) else concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix) end,
          'complaint:'||p.complaint_id::text,'complaint',c.reference,'unknown',c.category,c.created_at
        from public.complaint_parties p join public.complaints c on c.id=p.complaint_id
        left join public.barangay_residents r on r.id=p.resident_id left join public.external_persons e on e.id=p.external_person_id
        where p.party_role='respondent' and (p.resident_id is not null or p.external_person_id is not null)
          and (v_start is null or c.created_at>=v_start) and (v_end is null or c.created_at<v_end)
      )
      select q.person_kind,q.person_id,max(q.display_name) display_name,count(distinct q.matter_key) qualifying_matters,
        count(distinct q.matter_key) filter(where q.outcome='substantiated') substantiated,
        count(distinct q.matter_key) filter(where q.outcome='not_substantiated') not_substantiated,
        count(distinct q.matter_key) filter(where q.outcome='not_determined') not_determined,
        count(distinct q.matter_key) filter(where q.outcome='referred') referred,
        count(distinct q.matter_key) filter(where q.outcome='closed') closed,
        count(distinct q.matter_key) filter(where q.outcome='unknown') unknown,
        (select q2.category from qualified q2 where q2.person_kind=q.person_kind and q2.person_id=q.person_id
          group by q2.category order by count(distinct q2.matter_key) desc,q2.category limit 1) top_category,max(q.recorded_at) last_recorded_matter
        ,coalesce(jsonb_agg(distinct jsonb_build_object('matter_key',q.matter_key,'reference',q.reference,'kind',q.matter_kind)),'[]'::jsonb) contributing_matters
      from qualified q group by q.person_kind,q.person_id having count(distinct q.matter_key)>1
    ) x),'[]'::jsonb) end,
    'repeat_people_restricted',not v_admin,
    'community_credit',case when not exists(select 1 from public.community_credit_policies where status='active') then
      jsonb_build_object('configured',false,'message','Community Credit policy is not configured.') else jsonb_build_object(
      'configured',true,'policy_id',(select id from public.community_credit_policies where status='active'),
      'enrolled_residents',(select count(distinct e.resident_id) from public.community_credit_enrollments e join public.community_credit_policies p on p.id=e.policy_id where p.status='active'),
      'residents_with_events',(select count(distinct e.resident_id) from public.community_credit_events e join public.community_credit_policies p on p.id=e.policy_id where p.status='active'),
      'event_count',(select count(*) from public.community_credit_events e join public.community_credit_policies p on p.id=e.policy_id where p.status='active'),
      'starting_score_distribution',coalesce((select jsonb_agg(x order by x.score) from (select e.starting_score score,count(*) residents from public.community_credit_enrollments e join public.community_credit_policies p on p.id=e.policy_id where p.status='active' group by e.starting_score) x),'[]'::jsonb),
      'current_score_distribution',coalesce((select jsonb_agg(x order by x.score) from (
        select score,count(*) residents from (
          select greatest(p.minimum_score,least(p.maximum_score,e.starting_score+coalesce(sum(v.points_delta_snapshot),0))) score
          from public.community_credit_enrollments e join public.community_credit_policies p on p.id=e.policy_id
          left join public.community_credit_events v on v.resident_id=e.resident_id and v.policy_id=e.policy_id
          where p.status='active' group by e.id,p.minimum_score,p.maximum_score,e.starting_score
        ) scores group by score) x),'[]'::jsonb)
    ) end
  ) into v_result;
  return v_result;
end; $$;

create function public.repeated_dispute_analytics(p_from date default null,p_to date default null,p_window text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_now timestamptz:=now(); v_today date:=(now() at time zone 'Asia/Manila')::date; v_start timestamptz; v_end timestamptz;
begin
  -- Named complainant/respondent pairs: records administrators only (42501 otherwise).
  perform public.person_history_require_admin();
  if p_window is null or p_window not in ('all','last_30_days','last_90_days','last_12_months','previous_12_months','custom')
    or (p_window='custom' and (p_from is null and p_to is null)) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid analytics range'; end if;
  if p_window='last_30_days' then v_start:=v_now-interval '30 days'; v_end:=v_now;
  elsif p_window='last_90_days' then v_start:=v_now-interval '90 days'; v_end:=v_now;
  elsif p_window='last_12_months' then v_start:=((v_today-interval '12 months')::date::timestamp at time zone 'Asia/Manila'); v_end:=v_now;
  elsif p_window='previous_12_months' then v_start:=((v_today-interval '24 months')::date::timestamp at time zone 'Asia/Manila'); v_end:=((v_today-interval '12 months')::date::timestamp at time zone 'Asia/Manila');
  elsif p_window='custom' then if p_from is not null then v_start:=(p_from::timestamp at time zone 'Asia/Manila'); end if; if p_to is not null then v_end:=((p_to+1)::timestamp at time zone 'Asia/Manila'); end if; end if;
  return coalesce((with stable as (
    select p.complaint_id,p.party_role,case when p.resident_id is not null then 'resident:'||p.resident_id::text else 'external:'||p.external_person_id::text end person_key,
      case when p.resident_id is not null then concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix) else concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix) end display_name,c.reference,c.created_at
    from public.complaint_parties p join public.complaints c on c.id=p.complaint_id
    left join public.barangay_residents r on r.id=p.resident_id left join public.external_persons e on e.id=p.external_person_id
    where (p.resident_id is not null or p.external_person_id is not null) and p.party_role in ('complainant','respondent')
      and (v_start is null or c.created_at>=v_start) and (v_end is null or c.created_at<v_end)
  ), pairs as (
    select least(a.person_key,b.person_key) person_a_key,greatest(a.person_key,b.person_key) person_b_key,
      case when a.person_key<b.person_key then a.display_name else b.display_name end person_a,
      case when a.person_key<b.person_key then b.display_name else a.display_name end person_b,
      count(distinct a.complaint_id) matter_count,min(a.created_at) first_recorded,max(a.created_at) last_recorded,
      array_agg(distinct 'complaint:'||a.complaint_id::text) matter_keys,array_agg(distinct a.reference) matter_references
    from stable a join stable b on b.complaint_id=a.complaint_id and a.person_key<>b.person_key
    where a.party_role='complainant' and b.party_role='respondent' group by 1,2,3,4 having count(distinct a.complaint_id)>1)
  select jsonb_agg(to_jsonb(p) order by p.matter_count desc,p.person_a,p.person_b) from pairs p),'[]'::jsonb);
end; $$;

revoke all on function public.analytics_person_matters(text,uuid),public.person_analytics(text,uuid,date,date,text),
 public.barangay_safety_analytics(date,date,text,text,text),public.repeated_dispute_analytics(date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.person_analytics(text,uuid,date,date,text),public.barangay_safety_analytics(date,date,text,text,text),
 public.repeated_dispute_analytics(date,date,text) to authenticated;
commit;
