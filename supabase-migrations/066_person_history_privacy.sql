-- NOT APPLIED. Requires migrations 001-063 and 065 to be applied, and 062 in
-- particular (it replaces 062's person_analytics). 064 is optional and
-- unrelated: it deletes retired-module rows only (reservations, health, waste,
-- their notifications) and touches no object read or replaced here, so 066 is
-- valid whether or not 064 is ever applied, before or after it.
--
-- People & History privacy and identity accuracy. ADDITIVE: no table, column,
-- constraint, policy, row or grant is created, altered or dropped. Two existing
-- functions are replaced in place (CREATE OR REPLACE keeps their EXECUTE grants
-- exactly as 061/062 left them) and one private helper is added.
--
-- ── 1. THE DEFECT ────────────────────────────────────────────────────────
-- person_history() (061, applied) and person_analytics() (062) admit ANY
-- active official (person_history_require_view), and both returned linked
-- COMPLAINT material to every one of them: references, categories, statuses,
-- party roles and dates, the KP case reference, and -- through each incident
-- row -- the KP and complaint references of the incident's KP link. 062
-- masked only the complaint location.
--
-- The rest of the system draws the line elsewhere. Complaint detail is
-- complaint_is_visible_to_caller() (040): the filer, the Barangay Secretary
-- and the Punong Barangay. KP cases are kp_case_is_visible_to_caller() (043):
-- the Secretary and the Punong Barangay. An incident's KP link is
-- incident_kp_link() (051), gated by that same KP predicate. The safe
-- complaint queue (040) deliberately withholds even the category from
-- everybody else. So any official could read through People & History what
-- the Complaints module refuses them.
--
-- ── 2. THE RULE APPLIED HERE ────────────────────────────────────────────
-- current_official_may_administer_records() (044) -- the Barangay Secretary
-- or the Punong Barangay -- is exactly the set of officials the complaint and
-- KP predicates admit. No new permission model is introduced. For any other
-- active official:
--   * complaint records are NOT RETURNED AT ALL -- not masked, not counted.
--     A count or a timeline entry would disclose that a complaint exists.
--   * complaint and KP references are not returned on incident rows.
--   * the distinct-matter count is computed over incidents only, so the
--     difference between counts cannot reveal a hidden KP link.
-- Incident material stays visible to every active official, because
-- incident_queue() (044) and incident_parties_for() (061) already give it to
-- them: type, status, recorded time, location text, area note, blotter
-- reference, and the people involved with their roles and outcomes.
--
-- ── 3. VERIFIED IDENTITY LINKS ──────────────────────────────────────────
-- A resident's history now also includes records filed under an EXTERNAL
-- person whom a records administrator verified as that resident through
-- external_person_resident_links (061). Only that explicit, current mapping
-- is used -- never a name, a date or a place. A corrected mapping is followed
-- as it now stands; the correction history (061) is not touched. No party
-- row, complaint or incident is modified. An external person's own history is
-- unchanged: it lists only that external identity's records.
--
-- ── 4. COUNTING RULES ───────────────────────────────────────────────────
-- A RECORD is one incident or one complaint. A person who holds two roles on
-- one record, or who appears on it under both a resident and a verified
-- external identity, still counts that record once.
--   incident_records   distinct incidents.
--   complaint_records  distinct complaints (NULL for non-administrators).
--   distinct_matters   records, except that an incident whose KP case
--                      (incident_case_links -> kp_cases.complaint_id) belongs
--                      to a complaint THIS PERSON is also linked to counts
--                      together with that complaint as ONE matter. Nothing
--                      else merges two records: not the same person, not the
--                      same day, not the same place. For non-administrators
--                      it is computed over incidents only.
-- The existing 062 keys keep their 062 meaning: distinct_linked_matters,
-- incident_matters and complaint_kp_matters remain RECORD counts (062 TEST 5
-- deliberately kept a KP-linked incident and complaint as two). For a
-- non-administrator complaint_kp_matters is now NULL and the record counts
-- cover incidents only, per section 2.
--
-- ── 5. INCIDENT LOCATION IN person_history ───────────────────────────────
-- Each incident row now carries location_text and area_note exactly as
-- stored, plus `location` = area_note when it is not blank, else
-- location_text when it is not blank, else NULL -- the same precedence 062's
-- analytics use -- and `location_source` ('area_note' | 'location_text' |
-- NULL) saying which. Nothing is derived or invented; both columns are
-- already readable by every active official through incident_queue().
-- The `incidents` array stays one row per party row, as in 061 (so every role
-- is visible); each row now names the identity it came through
-- (via_identity_kind / via_identity_id). The `timeline` lists each incident
-- ONCE -- 061 repeated an incident once per role -- and a `counts` object
-- carries the section 4 counts.
--
-- ── 6. JUDGMENT-ORIENTED OUTPUT REMOVED ─────────────────────────────────
-- person_analytics no longer returns `historical_review` (with its
-- `requires_review` flag at a threshold of five matters) or
-- `community_credit_periods` (respondent/subject counts split at the
-- resident's Community Credit enrollment). A count of matters crossing a
-- number is a judgment about a person, and splitting it by credit enrollment
-- implies a relationship to the score that does not and must not exist.
-- `indicators` keeps its two positions for compatibility with the People &
-- History screen, with neutral keys and labels: the first is no longer
-- labelled "Repeated respondent/subject involvement". No score, rank or
-- recommendation is produced anywhere. Community Credit is not read at all.
--
-- ⚠️ Not changed here, and recorded so nobody thinks it was missed:
--   * community_credit_profile() (060) still returns a constant
--     historical_review {available:false, threshold:5}. It is inert, and
--     Community Credit is out of scope for this migration.
--   * barangay_safety_analytics() (062) still reports a resident and their
--     verified external identity as two entries in its administrator-only
--     repeat_people list, and counts them twice in overview.linked_people.
--
-- ── 7. ROLLBACK ─────────────────────────────────────────────────────────
-- supabase-tests/066_rollback_contingency.sql restores 061's person_history
-- and 062's person_analytics verbatim and drops the helper. EMERGENCY USE
-- ONLY: it re-opens the disclosure described in section 1.

begin;

-- The verified identities a person's history covers. For a resident: the
-- resident, plus every external person explicitly linked to them. For an
-- external person: only that person. Internal: no client EXECUTE.
create function public.person_history_identities(p_person_kind text,p_person_id uuid)
returns table(identity_kind text,identity_id uuid)
language sql stable security definer set search_path='' as $$
  select 'resident'::text,p_person_id where p_person_kind='resident'
  union all
  select 'external'::text,l.external_person_id from public.external_person_resident_links l
   where p_person_kind='resident' and l.resident_id=p_person_id
  union all
  select 'external'::text,p_person_id where p_person_kind='external';
$$;

-- Every linked record of a person, one row per party row (a person may hold
-- several roles on one record). Complaint rows are produced only when
-- p_include_complaints is true; callers pass the records-administrator check.
-- matter_key is the de-duplication key of section 4. Internal: no EXECUTE.
create function public.person_linked_records(p_person_kind text,p_person_id uuid,p_include_complaints boolean)
returns table(record_key text,record_kind text,record_id uuid,reference text,occurred_at timestamptz,
  category text,area_label text,role text,outcome text,matter_key text,via_identity_kind text,via_identity_id uuid)
language sql stable security definer set search_path='' as $$
  with ids as (select * from public.person_history_identities(p_person_kind,p_person_id)),
  person_complaints as (
    select distinct p.complaint_id from public.complaint_parties p join ids
      on (ids.identity_kind='resident' and p.resident_id=ids.identity_id)
      or (ids.identity_kind='external' and p.external_person_id=ids.identity_id)
    where p_include_complaints
  )
  select 'incident:'||i.id::text,'incident',i.id,i.reference,i.occurred_at,i.incident_type,
    coalesce(nullif(btrim(i.area_note),''),nullif(btrim(i.location_text),''),'Not recorded'),p.role,p.outcome_status,
    coalesce((select 'complaint:'||k.complaint_id::text from public.incident_case_links l
               join public.kp_cases k on k.id=l.case_id
              where l.incident_id=i.id and k.complaint_id in (select complaint_id from person_complaints)),
             'incident:'||i.id::text),
    ids.identity_kind,ids.identity_id
  from ids join public.incident_parties p
    on (ids.identity_kind='resident' and p.resident_id=ids.identity_id)
    or (ids.identity_kind='external' and p.external_person_id=ids.identity_id)
  join public.incidents i on i.id=p.incident_id
  union all
  select 'complaint:'||c.id::text,'complaint',c.id,c.reference,c.created_at,c.category,
    coalesce(nullif(btrim(c.location_note),''),'Not recorded'),p.party_role,'unknown','complaint:'||c.id::text,
    ids.identity_kind,ids.identity_id
  from ids join public.complaint_parties p
    on (ids.identity_kind='resident' and p.resident_id=ids.identity_id)
    or (ids.identity_kind='external' and p.external_person_id=ids.identity_id)
  join public.complaints c on c.id=p.complaint_id
  where p_include_complaints;
$$;

create or replace function public.person_history(p_person_kind text,p_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean; v_identity jsonb; v_incidents jsonb; v_complaints jsonb;
begin
  perform public.person_history_require_view();
  v_admin:=coalesce(public.current_official_may_administer_records(),false);
  if p_person_kind='resident' then
    select jsonb_build_object('kind','resident','id',r.id,'full_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'purok',r.purok,'resident_status',r.resident_status,'credit_applicable',true,
      'verified_external_identities',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,
          'full_name',concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix)) order by e.last_name,e.first_name,e.id)
        from public.external_person_resident_links l join public.external_persons e on e.id=l.external_person_id
        where l.resident_id=r.id),'[]'::jsonb)) into v_identity
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

  -- One row per (incident, role, identity) party row, as 061 returned per
  -- party row. The KP and complaint references of an incident's KP link are
  -- records-administrator data (incident_kp_link, 051) and are NULL otherwise.
  select coalesce(jsonb_agg(jsonb_build_object('matter_id',p.incident_id,'matter_key','incident:'||p.incident_id::text,
    'incident_id',i.id,'reference',i.reference,'occurred_at',i.occurred_at,
    'type',i.incident_type,'status',i.status,'role',p.role,'outcome',p.outcome_status,'blotter_reference',b.entry_reference,
    'location_text',i.location_text,'area_note',i.area_note,
    'location',coalesce(nullif(btrim(i.area_note),''),nullif(btrim(i.location_text),'')),
    'location_source',case when nullif(btrim(i.area_note),'') is not null then 'area_note'
                           when nullif(btrim(i.location_text),'') is not null then 'location_text' end,
    'via_identity_kind',ids.identity_kind,'via_identity_id',ids.identity_id,
    'kp_reference',case when v_admin then k.reference end,
    'complaint_reference',case when v_admin then c.reference end) order by i.occurred_at desc,i.id,p.role),'[]'::jsonb) into v_incidents
  from public.person_history_identities(p_person_kind,p_person_id) ids
  join public.incident_parties p on (ids.identity_kind='resident' and p.resident_id=ids.identity_id)
    or (ids.identity_kind='external' and p.external_person_id=ids.identity_id)
  join public.incidents i on i.id=p.incident_id
  left join public.blotter_entries b on b.incident_id=i.id
  left join public.incident_case_links l on l.incident_id=i.id left join public.kp_cases k on k.id=l.case_id
  left join public.complaints c on c.id=k.complaint_id;

  if v_admin then
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
      from public.person_history_identities(p_person_kind,p_person_id) ids
      join public.complaint_parties cp on (ids.identity_kind='resident' and cp.resident_id=ids.identity_id)
        or (ids.identity_kind='external' and cp.external_person_id=ids.identity_id)
      join public.complaints c on c.id=cp.complaint_id
      group by c.id,c.reference,c.created_at,c.category,c.status
    ) q;
  else
    v_complaints:='[]'::jsonb;
  end if;

  return jsonb_build_object('identity',v_identity,'incidents',v_incidents,'complaints',v_complaints,
    'complaints_restricted',not v_admin,
    'counts',(select jsonb_build_object(
        'incident_records',count(distinct r.record_key) filter(where r.record_kind='incident'),
        'complaint_records',case when v_admin then count(distinct r.record_key) filter(where r.record_kind='complaint') end,
        'distinct_matters',count(distinct r.matter_key))
      from public.person_linked_records(p_person_kind,p_person_id,v_admin) r),
    'timeline',coalesce((select jsonb_agg(x order by x->>'occurred_at' desc) from (
      select jsonb_build_object('kind','incident','occurred_at',r->>'occurred_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) x
      from (select distinct on (r->>'incident_id') r from jsonb_array_elements(v_incidents) r order by r->>'incident_id') u(r)
      union all select jsonb_build_object('kind','complaint','occurred_at',r->>'created_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) from jsonb_array_elements(v_complaints) r
    ) s),'[]'::jsonb));
end; $$;

create or replace function public.person_analytics(p_person_kind text,p_person_id uuid,p_from date default null,p_to date default null,p_window text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean; v_identity jsonb; v_now timestamptz:=now(); v_today date:=(now() at time zone 'Asia/Manila')::date;
  v_filter_start timestamptz; v_filter_end timestamptz; v_current_start timestamptz; v_previous_start timestamptz; v_result jsonb;
begin
  perform public.person_history_require_view();
  -- Complaint records reach records administrators only (section 2).
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
  else
    select jsonb_build_object('kind','external','id',e.id,'display_name',concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix),
      'status','external','recorded_location',concat_ws(', ',e.recorded_barangay,e.recorded_city_municipality))
      into v_identity from public.external_persons e where e.id=p_person_id;
  end if;
  if v_identity is null then raise exception 'Person unavailable'; end if;

  with raw as (select * from public.person_linked_records(p_person_kind,p_person_id,v_admin)),
  related as (select r.record_key,
      case when r.record_kind='incident' and v_admin then
        coalesce((select jsonb_agg(jsonb_build_object('kind','complaint','reference',c.reference,'kp_reference',k.reference) order by c.reference)
          from public.incident_case_links l join public.kp_cases k on k.id=l.case_id
          join public.complaints c on c.id=k.complaint_id where l.incident_id=r.record_id),'[]'::jsonb)
      when r.record_kind='complaint' then
        coalesce((select jsonb_agg(jsonb_build_object('kind','incident','reference',i.reference) order by i.reference)
          from public.kp_cases k join public.incident_case_links l on l.case_id=k.id
          join public.incidents i on i.id=l.incident_id where k.complaint_id=r.record_id),'[]'::jsonb)
      else '[]'::jsonb end related_records
    from (select distinct on(record_key) * from raw order by record_key) r),
  filtered as (select * from raw where (v_filter_start is null or occurred_at>=v_filter_start) and (v_filter_end is null or occurred_at<v_filter_end)),
  records as (select distinct on(record_key) * from filtered order by record_key,occurred_at),
  responsible as (select distinct on(record_key) * from raw where role in ('respondent','subject') order by record_key,occurred_at),
  current12 as (select * from responsible where occurred_at>=v_current_start and occurred_at<=v_now),
  previous12 as (select * from responsible where occurred_at>=v_previous_start and occurred_at<v_current_start)
  select jsonb_build_object(
    'analytics_available',exists(select 1 from raw),
    'coverage',jsonb_build_object('basis','verified_linked_records',
      'message','Based on verified linked records, including records filed under an external identity a records administrator verified as this resident. Unlinked records are not attributed to this person.',
      'linked_record_count',(select count(distinct record_key) from raw),'complaint_records_included',v_admin,'historical_linking_complete',null),
    'identity',v_identity,'filters',jsonb_build_object('window',p_window,'from',p_from,'to',p_to,'starts_at',v_filter_start,'ends_at_exclusive',v_filter_end),
    'summary',jsonb_build_object(
      -- 062 meanings kept: these are RECORD counts.
      'distinct_linked_matters',(select count(*) from records),
      'incident_matters',(select count(*) from records where record_kind='incident'),
      'complaint_kp_matters',case when v_admin then (select count(*) from records where record_kind='complaint') end,
      -- 066 counts (section 4).
      'incident_records',(select count(*) from records where record_kind='incident'),
      'complaint_records',case when v_admin then (select count(*) from records where record_kind='complaint') end,
      'distinct_matters',(select count(distinct matter_key) from filtered)),
    'roles',coalesce((select jsonb_agg(x order by x.total desc,x.role) from
      (select role,count(distinct record_key) total from filtered group by role) x),'[]'::jsonb),
    'outcomes',coalesce((select jsonb_agg(x order by x.total desc,x.outcome) from
      (select outcome,count(distinct record_key) total from filtered where role in ('respondent','subject') group by outcome) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x order by x.total desc,x.category) from
      (select category,count(distinct record_key) total,round(100.0*count(distinct record_key)/nullif((select count(*) from records),0),1) percentage
       from filtered group by category) x),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(x order by x.total desc,x.area_label) from
      (select area_label,count(distinct record_key) total from filtered group by area_label) x),'[]'::jsonb),
    'weekdays',coalesce((select jsonb_agg(x order by x.weekday_number) from
      (select extract(isodow from occurred_at at time zone 'Asia/Manila')::int weekday_number,
       to_char(occurred_at at time zone 'Asia/Manila','FMDay') weekday,count(distinct record_key) total from filtered group by 1,2) x),'[]'::jsonb),
    'time_buckets',coalesce((select jsonb_agg(x order by x.bucket_order) from
      (select case when extract(hour from occurred_at at time zone 'Asia/Manila')<4 then 1
        when extract(hour from occurred_at at time zone 'Asia/Manila')<8 then 2 when extract(hour from occurred_at at time zone 'Asia/Manila')<12 then 3
        when extract(hour from occurred_at at time zone 'Asia/Manila')<16 then 4 when extract(hour from occurred_at at time zone 'Asia/Manila')<20 then 5 else 6 end bucket_order,
       case when extract(hour from occurred_at at time zone 'Asia/Manila')<4 then '12 AM–3:59 AM'
        when extract(hour from occurred_at at time zone 'Asia/Manila')<8 then '4 AM–7:59 AM' when extract(hour from occurred_at at time zone 'Asia/Manila')<12 then '8 AM–11:59 AM'
        when extract(hour from occurred_at at time zone 'Asia/Manila')<16 then '12 PM–3:59 PM' when extract(hour from occurred_at at time zone 'Asia/Manila')<20 then '4 PM–7:59 PM' else '8 PM–11:59 PM' end bucket,
       count(distinct record_key) total from filtered group by 1,2) x),'[]'::jsonb),
    'monthly',coalesce((select jsonb_agg(x order by x.month) from
      (select to_char(date_trunc('month',occurred_at at time zone 'Asia/Manila'),'YYYY-MM') as month,count(distinct record_key) total from filtered group by 1) x),'[]'::jsonb),
    'comparison',jsonb_build_object('current_period','last_12_months','current_period_qualifying_matters',(select count(*) from current12),
      'previous_period_qualifying_matters',(select count(*) from previous12),'absolute_change',(select count(*) from current12)-(select count(*) from previous12)),
    'indicators',jsonb_build_array(
      jsonb_build_object('key','respondent_or_subject_records_last_12_months','label','Records with a respondent or subject role, last 12 months','matter_count',(select count(*) from current12),
        'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',c.record_key,'reference',c.reference,'kind',c.record_kind,'role',c.role,'outcome',c.outcome,'related_records',rel.related_records) order by c.occurred_at desc)
          from current12 c join related rel on rel.record_key=c.record_key),'[]'::jsonb)),
      jsonb_build_object('key','period_change','label','Record count compared with the previous comparable period','current',(select count(*) from current12),'previous',(select count(*) from previous12),
        'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',c.record_key,'reference',c.reference,'kind',c.record_kind,'role',c.role,'outcome',c.outcome,'related_records',rel.related_records) order by c.occurred_at desc)
          from current12 c join related rel on rel.record_key=c.record_key),'[]'::jsonb))),
    'contributing_matters',coalesce((select jsonb_agg(jsonb_build_object('matter_key',f.record_key,'distinct_matter_key',f.matter_key,'kind',f.record_kind,'reference',f.reference,
      'occurred_at',f.occurred_at,'category',f.category,'area',f.area_label,'role',f.role,'outcome',f.outcome,
      'via_identity_kind',f.via_identity_kind,'related_records',rel.related_records) order by f.occurred_at desc,f.record_key,f.role)
      from filtered f join related rel on rel.record_key=f.record_key),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

-- The two helpers are internal. CREATE OR REPLACE kept person_history's and
-- person_analytics' grants exactly as 061/062 set them (authenticated only).
revoke all on function public.person_history_identities(text,uuid),
  public.person_linked_records(text,uuid,boolean) from public,anon,authenticated,service_role;

commit;
