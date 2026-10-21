-- NOT APPLIED. Targeted SMS snapshots and guarded orchestration; no automatic sends.
-- Requires 054-057. Existing content RLS and public map/privacy behavior are unchanged.
begin;
create table public.sms_source_rules (
 source_type text not null check(source_type in ('announcement','event','health_event','medical_program')),
 source_id text not null,
 audience jsonb not null,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 updated_at timestamptz not null default now(),
 primary key(source_type,source_id)
);
create table public.sms_broadcasts (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 source_type text not null check(source_type in ('announcement','event','health_event','medical_program')),
 source_id text not null,
 broadcast_kind text not null check(broadcast_kind in ('initial','update','reminder','schedule_update')),
 audience jsonb not null,
 message_text text not null check(length(message_text) between 1 and 320),
 preview_token text not null,
 requested_by uuid not null references public.profiles(id) on delete restrict,
 dry_run boolean not null,
 created_at timestamptz not null default now()
);
create unique index sms_one_initial on public.sms_broadcasts(source_type,source_id)
 where broadcast_kind='initial' and not dry_run;
create index sms_source_history on public.sms_broadcasts(source_type,source_id,created_at desc);
create table public.sms_broadcast_recipients (
 id uuid primary key default gen_random_uuid(),
 broadcast_id uuid not null references public.sms_broadcasts(id) on delete restrict,
 resident_id uuid not null references public.barangay_residents(id) on delete restrict,
 normalized_phone text check(normalized_phone ~ '^639[0-9]{9}$'),
 status text not null check(status in ('pending','attempting','accepted','failed','unknown','skipped','dry_run')),
 reason text check(reason in ('missing_phone','invalid_phone','duplicate_phone','dry_run','provider_rejected','provider_unknown','transport_unknown','eligibility_changed')),
 provider_message_id text check(length(provider_message_id)<=128),
 attempted_at timestamptz,
 completed_at timestamptz,
 unique(broadcast_id,resident_id)
);
create unique index sms_unique_destination on public.sms_broadcast_recipients(broadcast_id,normalized_phone)
 where normalized_phone is not null;
create index sms_pending_recipients on public.sms_broadcast_recipients(broadcast_id,status);
alter table public.sms_source_rules enable row level security;
alter table public.sms_broadcasts enable row level security;
alter table public.sms_broadcast_recipients enable row level security;
revoke all on public.sms_source_rules,public.sms_broadcasts,public.sms_broadcast_recipients from public,anon,authenticated,service_role;

create function public.sms_may_manage(p_type text,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  ((p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null)) or
   (p_type in ('health_event','medical_program') and p.role='nurse')));
$$;
create function public.sms_require_manager(p_type text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.sms_may_manage(p_type,auth.uid()) then
  raise exception 'Not authorized for this notification.' using errcode='42501';
 end if;
end; $$;
create function public.sms_source_content(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_table text; v_row jsonb;
begin
 v_table:=case p_type when 'announcement' then 'announcements' when 'event' then 'events'
  when 'health_event' then 'health_events' when 'medical_program' then 'medical_programs' end;
 if v_table is null then raise exception 'Unsupported notification source'; end if;
 execute pg_catalog.format('select to_jsonb(s) from public.%I s where s.id::text=$1',v_table) into v_row using p_id;
 if v_row is null then raise exception 'Published content unavailable'; end if;
 return v_row;
end; $$;
create function public.sms_validate_audience(p_audience jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_type text:=p_audience->>'type'; v_min integer; v_max integer;
begin
 if p_audience is null or jsonb_typeof(p_audience)<>'object' then raise exception 'Choose an audience'; end if;
 if v_type='all_residents' then return jsonb_build_object('type',v_type); end if;
 if v_type='senior_citizens' then return jsonb_build_object('type',v_type); end if;
 if v_type='purok' and nullif(btrim(p_audience->>'value'),'') is not null and length(p_audience->>'value')<=100 then
  return jsonb_build_object('type',v_type,'value',p_audience->>'value');
 end if;
 if v_type='age_range' and (p_audience->>'min_age') ~ '^[0-9]{1,3}$' and (p_audience->>'max_age') ~ '^[0-9]{1,3}$' then
  v_min:=(p_audience->>'min_age')::integer; v_max:=(p_audience->>'max_age')::integer;
  if v_min<=v_max and v_max<=150 then return jsonb_build_object('type',v_type,'min_age',v_min,'max_age',v_max); end if;
 end if;
 raise exception 'Unsupported or invalid audience';
end; $$;
create function public.sms_normalize_phone(p_phone text)
returns text language sql immutable set search_path='' as $$
 select case when clean ~ '^09[0-9]{9}$' then '63'||substr(clean,2)
  when clean ~ '^[+]639[0-9]{9}$' then substr(clean,2)
  when clean ~ '^639[0-9]{9}$' then clean else null end
 from (select regexp_replace(p_phone,'[[:space:]()-]','','g') clean) s;
$$;
create function public.sms_message(p_type text,p_content jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_text text;
begin
 if nullif(btrim(p_content->>'title'),'') is null then raise exception 'A title is required'; end if;
 v_text:=case p_type
  when 'announcement' then concat_ws('. ',p_content->>'title',nullif(p_content->>'description',''))
  when 'event' then concat_ws(' ',p_content->>'title',case when nullif(p_content->>'event_date','') is not null then 'on '||(p_content->>'event_date') end,case when nullif(p_content->>'location','') is not null then 'at '||(p_content->>'location') end)
  when 'health_event' then concat_ws(' ',p_content->>'title',case when nullif(p_content->>'event_date','') is not null then 'on '||(p_content->>'event_date') end,case when nullif(p_content->>'location','') is not null then 'at '||(p_content->>'location') end)
  when 'medical_program' then concat_ws(' ',p_content->>'title',p_content->>'schedule_label',p_content->>'time_label') end;
 if v_text is null then raise exception 'Unsupported source'; end if;
 -- Source text is already public content. No diagnosis, recipient name, notes or cases are read.
 return left(regexp_replace(btrim(v_text),'[[:space:]]+',' ','g'),260)||'. Please check the barangay website for details.';
end; $$;
create function public.sms_snapshot(p_type text,p_content jsonb,p_audience jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_a jsonb:=public.sms_validate_audience(p_audience); v_day date:=(now() at time zone 'Asia/Manila')::date;
 v_message text:=public.sms_message(p_type,p_content); v_rows jsonb; v_missing_dob integer;
begin
 with eligible as (
  select r.id,r.mobile_number,public.sms_normalize_phone(r.mobile_number) phone
  from public.barangay_residents r where r.resident_status='active'
   and case v_a->>'type'
    when 'all_residents' then true
    when 'purok' then r.purok=v_a->>'value'
    when 'senior_citizens' then r.birth_date<=v_day and extract(year from age(v_day,r.birth_date))>=60
    when 'age_range' then r.birth_date<=v_day and extract(year from age(v_day,r.birth_date)) between (v_a->>'min_age')::int and (v_a->>'max_age')::int
    else false end
 ), ranked as (
  select *,row_number() over(partition by phone order by id) rank from eligible
 )
 select coalesce(jsonb_agg(jsonb_build_object('resident_id',id,
  'phone',case when rank=1 then phone else null end,
  'reason',case when nullif(btrim(mobile_number),'') is null then 'missing_phone'
    when phone is null then 'invalid_phone' when rank>1 then 'duplicate_phone' else null end) order by id),'[]'::jsonb)
 into v_rows from ranked;
 if jsonb_array_length(v_rows)>2000 then raise exception 'Audience exceeds the 2000-resident per-broadcast limit; use a narrower audience.'; end if;
 select count(*) into v_missing_dob from public.barangay_residents r where r.resident_status='active' and
  (r.birth_date is null or r.birth_date>v_day) and v_a->>'type' in ('senior_citizens','age_range');
 return jsonb_build_object('audience',v_a,'as_of',v_day,'message',v_message,'_recipients',v_rows,
  'eligible',jsonb_array_length(v_rows),
  'recipients',(select count(*) from jsonb_array_elements(v_rows) r where r->>'reason' is null),
  'skipped',(select count(*) from jsonb_array_elements(v_rows) r where r->>'reason' is not null),
  'missing_dob',v_missing_dob,
  'skipped_missing',(select count(*) from jsonb_array_elements(v_rows) r where r->>'reason'='missing_phone'),
  'skipped_invalid',(select count(*) from jsonb_array_elements(v_rows) r where r->>'reason'='invalid_phone'),
  'skipped_duplicate',(select count(*) from jsonb_array_elements(v_rows) r where r->>'reason'='duplicate_phone'),
  'preview_token',md5(jsonb_build_array(v_a,v_day,v_message,v_rows)::text));
end; $$;
create function public.sms_audience_options(p_source_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.sms_require_manager(p_source_type);
 return coalesce((select jsonb_agg(p order by p) from (select distinct purok p from public.barangay_residents where resident_status='active' and nullif(btrim(purok),'') is not null) s),'[]'::jsonb);
end; $$;
create function public.sms_preview(p_source_type text,p_source_id text,p_draft jsonb,p_audience jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.sms_require_manager(p_source_type);
 return public.sms_snapshot(p_source_type,case when p_source_id is null then p_draft else public.sms_source_content(p_source_type,p_source_id) end,p_audience)-'_recipients';
end; $$;
create function public.sms_save_rule(p_source_type text,p_source_id text,p_audience jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.sms_require_manager(p_source_type);
 perform public.sms_source_content(p_source_type,p_source_id);
 insert into public.sms_source_rules values(p_source_type,p_source_id,public.sms_validate_audience(p_audience),auth.uid(),now())
 on conflict(source_type,source_id) do update set audience=excluded.audience,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end; $$;
create function public.sms_prepare_broadcast(p_source_type text,p_source_id text,p_kind text,p_audience jsonb,p_preview_token text,p_request_key uuid,p_dry_run boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb; v_b public.sms_broadcasts%rowtype; v_id uuid; v_type text;
begin
 perform public.sms_require_manager(p_source_type);
 if p_request_key is null or p_dry_run is null then raise exception 'Request identity and mode are required'; end if;
 if p_kind not in ('initial','update','reminder','schedule_update') or p_kind is null
  or (p_kind='schedule_update' and p_source_type<>'medical_program')
  or (p_kind='reminder' and p_source_type not in ('event','health_event','medical_program')) then raise exception 'Invalid notification action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into v_b from public.sms_broadcasts where request_key=p_request_key;
 if found then
  if v_b.requested_by<>auth.uid() or v_b.source_type<>p_source_type or v_b.source_id<>p_source_id or v_b.broadcast_kind<>p_kind
   or v_b.audience<>public.sms_validate_audience(p_audience) or v_b.dry_run<>p_dry_run or v_b.preview_token is distinct from p_preview_token then
   raise exception 'Request identity already used'; end if;
  return v_b.id;
 end if;
 v_snapshot:=public.sms_snapshot(p_source_type,public.sms_source_content(p_source_type,p_source_id),p_audience);
 if v_snapshot->>'preview_token' is distinct from p_preview_token then raise exception 'Audience or content changed. Preview and confirm again.'; end if;
 insert into public.sms_broadcasts(request_key,source_type,source_id,broadcast_kind,audience,message_text,preview_token,requested_by,dry_run)
 values(p_request_key,p_source_type,p_source_id,p_kind,v_snapshot->'audience',v_snapshot->>'message',p_preview_token,auth.uid(),p_dry_run) returning id into v_id;
 insert into public.sms_broadcast_recipients(broadcast_id,resident_id,normalized_phone,status,reason,completed_at)
 select v_id,(r->>'resident_id')::uuid,r->>'phone',
  case when r->>'reason' is not null then 'skipped' when p_dry_run then 'dry_run' else 'pending' end,
  case when r->>'reason' is not null then r->>'reason' when p_dry_run then 'dry_run' end,
  case when r->>'reason' is not null or p_dry_run then now() end
 from jsonb_array_elements(v_snapshot->'_recipients') r;
 perform public.sms_save_rule(p_source_type,p_source_id,v_snapshot->'audience');
 v_type:=p_source_type;
 insert into public.activity_log(action,entity_type,entity_id,subject)
 values('edited',v_type,null,case when p_dry_run then 'SMS audience dry run - no SMS sent' else 'SMS broadcast initiated' end);
 return v_id;
end; $$;
create function public.sms_broadcast_state(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_b public.sms_broadcasts%rowtype; v_counts jsonb;
begin
 select * into v_b from public.sms_broadcasts where id=p_id;
 if not found then raise exception 'Notification unavailable'; end if;
 perform public.sms_require_manager(v_b.source_type);
 select jsonb_build_object('eligible',count(*),'pending',count(*) filter(where status='pending'),
  'accepted',count(*) filter(where status='accepted'),'failed',count(*) filter(where status='failed'),
  'unknown',count(*) filter(where status in ('unknown','attempting')),
  'skipped',count(*) filter(where status='skipped'),'dry_run',count(*) filter(where status='dry_run')) into v_counts
 from public.sms_broadcast_recipients where broadcast_id=p_id;
 return jsonb_build_object('id',v_b.id,'kind',v_b.broadcast_kind,'audience',v_b.audience,'message',v_b.message_text,
  'created_at',v_b.created_at,'is_dry_run',v_b.dry_run,'can_resume',v_b.requested_by=auth.uid() and not v_b.dry_run and (v_counts->>'pending')::int>0,'counts',v_counts);
end; $$;
create function public.sms_source_history(p_source_type text,p_source_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.sms_require_manager(p_source_type);
 return jsonb_build_object('audience',(select audience from public.sms_source_rules where source_type=p_source_type and source_id=p_source_id),
  'broadcasts',coalesce((select jsonb_agg(public.sms_broadcast_state(s.id) order by s.created_at desc) from
   (select id,created_at from public.sms_broadcasts where source_type=p_source_type and source_id=p_source_id order by created_at desc limit 20) s),'[]'::jsonb));
end; $$;
create function public.sms_send_context(p_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_b public.sms_broadcasts%rowtype;
begin
 select * into v_b from public.sms_broadcasts where id=p_id and requested_by=auth.uid();
 if not found or v_b.dry_run then raise exception 'Not authorized to send this broadcast' using errcode='42501'; end if;
 perform public.sms_require_manager(v_b.source_type);
end; $$;
-- Worker RPCs are service-role-only, rechecking the verified initiating actor.
-- A claim commits before the provider call. Attempting/unknown rows are NEVER auto-retried.
create function public.sms_claim_batch(p_id uuid,p_actor uuid)
returns table(recipient_id uuid,phone text,message text)
language plpgsql security definer set search_path='' as $$
declare v_b public.sms_broadcasts%rowtype; v_now jsonb;
begin
 select * into v_b from public.sms_broadcasts where id=p_id and requested_by=p_actor and not dry_run;
 if not found or not public.sms_may_manage(v_b.source_type,p_actor) then raise exception 'Not authorized' using errcode='42501'; end if;
 v_now:=public.sms_snapshot(v_b.source_type,public.sms_source_content(v_b.source_type,v_b.source_id),v_b.audience);
 if v_now->>'message' is distinct from v_b.message_text then raise exception 'Content changed; queued notification needs review'; end if;
 -- Never expand a confirmed snapshot. Exclude residents whose eligibility or number changed before a later batch/resume.
 update public.sms_broadcast_recipients r set status='skipped',reason='eligibility_changed',normalized_phone=null,completed_at=now()
 where r.broadcast_id=p_id and r.status='pending' and not exists(
  select 1 from jsonb_array_elements(v_now->'_recipients') x
  where x->>'resident_id'=r.resident_id::text and x->>'reason' is null and x->>'phone'=r.normalized_phone);
 return query with batch as (
  select r.id from public.sms_broadcast_recipients r where r.broadcast_id=p_id and r.status='pending'
  order by r.id for update skip locked limit 5
 ), claimed as (
  update public.sms_broadcast_recipients r set status='attempting',attempted_at=now()
  from batch where r.id=batch.id returning r.id,r.normalized_phone
 ) select c.id,c.normalized_phone,v_b.message_text from claimed c;
end; $$;
create function public.sms_finish_attempt(p_id uuid,p_actor uuid,p_status text,p_reason text,p_provider_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_b public.sms_broadcasts%rowtype; v_rec public.sms_broadcast_recipients%rowtype;
begin
 select * into v_rec from public.sms_broadcast_recipients where id=p_id for update;
 select * into v_b from public.sms_broadcasts where id=v_rec.broadcast_id and requested_by=p_actor;
 if v_b.id is null or not public.sms_may_manage(v_b.source_type,p_actor) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_status not in ('accepted','failed','unknown') or p_status is null then raise exception 'Invalid provider outcome'; end if;
 if (p_status='accepted' and (nullif(p_provider_id,'') is null or p_reason is not null))
  or (p_status='failed' and p_reason is distinct from 'provider_rejected')
  or (p_status='unknown' and (p_reason is null or p_reason not in ('provider_unknown','transport_unknown'))) then raise exception 'Invalid outcome details'; end if;
 if v_rec.status<>'attempting' then return; end if;
 update public.sms_broadcast_recipients set status=p_status,reason=p_reason,provider_message_id=left(p_provider_id,128),completed_at=now() where id=p_id;
 -- Serialize terminal logging so concurrent workers cannot duplicate completion events.
 perform 1 from public.sms_broadcasts where id=v_b.id for update;
 if not exists(select 1 from public.sms_broadcast_recipients where broadcast_id=v_b.id and status in ('pending','attempting')) then
  insert into public.activity_log(action,entity_type,entity_id,subject,actor_id,actor_name)
  select 'edited',v_b.source_type,null,'SMS broadcast finished - provider acceptance is not delivery',p_actor,p.full_name
  from public.profiles p where p.id=p_actor;
 end if;
end; $$;
-- All helpers are private. Only narrow count/history/config RPCs are client-callable.
revoke all on function public.sms_may_manage(text,uuid),public.sms_require_manager(text),public.sms_source_content(text,text),
 public.sms_validate_audience(jsonb),public.sms_normalize_phone(text),public.sms_message(text,jsonb),public.sms_snapshot(text,jsonb,jsonb),
 public.sms_audience_options(text),public.sms_preview(text,text,jsonb,jsonb),public.sms_save_rule(text,text,jsonb),
 public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean),public.sms_broadcast_state(uuid),public.sms_source_history(text,text),
 public.sms_send_context(uuid),public.sms_claim_batch(uuid,uuid),public.sms_finish_attempt(uuid,uuid,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.sms_audience_options(text),public.sms_preview(text,text,jsonb,jsonb),public.sms_save_rule(text,text,jsonb),
 public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean),public.sms_broadcast_state(uuid),public.sms_source_history(text,text),public.sms_send_context(uuid) to authenticated;
grant execute on function public.sms_claim_batch(uuid,uuid),public.sms_finish_attempt(uuid,uuid,text,text,text) to service_role;
commit;
