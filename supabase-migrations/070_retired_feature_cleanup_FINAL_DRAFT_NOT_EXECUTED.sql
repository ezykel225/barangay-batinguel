-- STAGE 18B FINAL DRAFT ONLY. NOT APPROVED OR EXECUTED.
-- Proposed removal of six retired-feature tables after a fresh post-069 backup.
-- Preserves historical activity/notification rows and all retained workflows.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local search_path = pg_catalog;

-- Fail closed if the reviewed production baseline has drifted.
do $stage18b_preconditions$
declare
  target_name text;
  target regclass;
  unexpected_count bigint;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')) <> 56 then
    raise exception 'Stage 18B prerequisite failed: public application-table count drifted';
  end if;

  foreach target_name in array array[
    'public.reservations',
    'public.health_events',
    'public.medical_programs',
    'public.waste_schedule',
    'public.nurse_availability',
    'public.medicine_stock'
  ] loop
    target := to_regclass(target_name);
    if target is null then
      raise exception 'Stage 18B prerequisite failed: % is missing', target_name;
    end if;

    select count(*) into unexpected_count
    from pg_constraint
    where contype = 'f' and confrelid = target and conrelid <> target;
    if unexpected_count <> 0 then
      raise exception 'Stage 18B prerequisite failed: % has % inbound foreign keys',
        target_name, unexpected_count;
    end if;

    select count(*) into unexpected_count
    from pg_rewrite r
    join pg_depend d
      on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
    where d.refclassid = 'pg_class'::regclass and d.refobjid = target
      and r.ev_class <> target;
    if unexpected_count <> 0 then
      raise exception 'Stage 18B prerequisite failed: % has % dependent view rules',
        target_name, unexpected_count;
    end if;
  end loop;

  if (select count(*) from pg_trigger
      where tgrelid = 'public.reservations'::regclass and not tgisinternal) <> 4 then
    raise exception 'Stage 18B prerequisite failed: reservation trigger inventory drifted';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid in (
      'public.health_events'::regclass,
      'public.medical_programs'::regclass,
      'public.waste_schedule'::regclass,
      'public.nurse_availability'::regclass,
      'public.medicine_stock'::regclass
    ) and not tgisinternal
  ) then
    raise exception 'Stage 18B prerequisite failed: an unexpected retired-table trigger exists';
  end if;

  if (select count(*) from pg_policies where schemaname='public' and tablename='reservations') <> 6
     or (select count(*) from pg_policies where schemaname='public' and tablename='health_events') <> 4
     or (select count(*) from pg_policies where schemaname='public' and tablename='medical_programs') <> 2
     or (select count(*) from pg_policies where schemaname='public' and tablename='waste_schedule') <> 2
     or (select count(*) from pg_policies where schemaname='public' and tablename='nurse_availability') <> 4
     or (select count(*) from pg_policies where schemaname='public' and tablename='medicine_stock') <> 2 then
    raise exception 'Stage 18B prerequisite failed: retired-table policy inventory drifted';
  end if;

  if to_regprocedure('public.stamp_activity_actor()') is null
     or to_regprocedure('public.sms_may_manage(text,uuid)') is null
     or to_regprocedure('public.sms_source_content(text,text)') is null
     or to_regprocedure('public.sms_message(text,jsonb)') is null
     or to_regprocedure('public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)') is null
     or md5(pg_get_functiondef(to_regprocedure('public.stamp_activity_actor()')))
       <> '13b418fc01c9095ebcfafb06f4e49912'
     or md5(pg_get_functiondef(to_regprocedure('public.sms_may_manage(text,uuid)')))
       <> '131ae720885ed935ee42297b6895e675'
     or md5(pg_get_functiondef(to_regprocedure('public.sms_source_content(text,text)')))
       <> 'da77d0ab516f409349e141eb87acdb70'
     or md5(pg_get_functiondef(to_regprocedure('public.sms_message(text,jsonb)')))
       <> '0cae8b8100f4a3d9a305c73eca0c6476'
     or md5(pg_get_functiondef(to_regprocedure('public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)')))
       <> '2f0e6cc6aeaac972c68be672aeef0107' then
    raise exception 'Stage 18B prerequisite failed: a shared function definition drifted';
  end if;

  if to_regprocedure('public.normalize_reservation_reference(text)') is null
     or to_regprocedure('public.track_complaint(text,text)') is null then
    raise exception 'Stage 18B prerequisite failed: retained complaint normalizer dependency is missing';
  end if;

  if exists (select 1 from public.sms_source_rules
             where source_type in ('health_event','medical_program'))
     or exists (select 1 from public.sms_broadcasts
                where source_type in ('health_event','medical_program')
                   or broadcast_kind='schedule_update') then
    raise exception 'Stage 18B prerequisite failed: retained SMS tables contain retired-source rows';
  end if;
end
$stage18b_preconditions$;

-- Preserve signature, owner/ACL (CREATE OR REPLACE), SECURITY DEFINER,
-- volatility and search_path. Remove only retired nurse/reservation branches.
create or replace function public.stamp_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  is_api_caller boolean := auth.role() is not null
                           and auth.role() <> 'service_role';
begin
  if not is_api_caller then
    return new;
  end if;

  new.actor_id := auth.uid();
  new.actor_name := coalesce(
    (select full_name from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if public.is_official(auth.uid()) then
    return new;
  end if;

  raise exception 'Only officials can record activity through the application.';
end;
$function$;

create or replace function public.sms_may_manage(p_type text,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $function$
 select exists(
   select 1 from public.profiles p
   where p.id=p_actor and p_type in ('announcement','event')
     and p.role='official' and exists(
       select 1 from public.official_account_links l
       join public.barangay_officials bo on bo.id=l.official_id
       where l.profile_id=p.id and bo.archived_at is null
     )
 );
$function$;

create or replace function public.sms_source_content(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_table text; v_row jsonb;
begin
 v_table:=case p_type when 'announcement' then 'announcements' when 'event' then 'events' end;
 if v_table is null then raise exception 'Unsupported notification source'; end if;
 execute pg_catalog.format('select to_jsonb(s) from public.%I s where s.id::text=$1',v_table) into v_row using p_id;
 if v_row is null then raise exception 'Published content unavailable'; end if;
 return v_row;
end;
$function$;

create or replace function public.sms_message(p_type text,p_content jsonb)
returns text language plpgsql immutable set search_path='' as $function$
declare v_text text;
begin
 if nullif(btrim(p_content->>'title'),'') is null then raise exception 'A title is required'; end if;
 v_text:=case p_type
  when 'announcement' then concat_ws('. ',p_content->>'title',nullif(p_content->>'description',''))
  when 'event' then concat_ws(' ',p_content->>'title',case when nullif(p_content->>'event_date','') is not null then 'on '||(p_content->>'event_date') end,case when nullif(p_content->>'location','') is not null then 'at '||(p_content->>'location') end)
 end;
 if v_text is null then raise exception 'Unsupported source'; end if;
 return left(regexp_replace(btrim(v_text),'[[:space:]]+',' ','g'),260)||'. Please check the barangay website for details.';
end;
$function$;

create or replace function public.sms_prepare_broadcast(p_source_type text,p_source_id text,p_kind text,p_audience jsonb,p_preview_token text,p_request_key uuid,p_dry_run boolean)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_snapshot jsonb; v_b public.sms_broadcasts%rowtype; v_id uuid; v_type text;
begin
 perform public.sms_require_manager(p_source_type);
 if p_request_key is null or p_dry_run is null then raise exception 'Request identity and mode are required'; end if;
 if p_kind not in ('initial','update','reminder') or p_kind is null
  or (p_kind='reminder' and p_source_type<>'event') then raise exception 'Invalid notification action'; end if;
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
end;
$function$;

-- Retained SMS tables currently contain zero rows. Narrow their future source
-- vocabulary without deleting retained data or changing unrelated SMS logic.
alter table public.sms_source_rules
  drop constraint sms_source_rules_source_type_check;
alter table public.sms_source_rules
  add constraint sms_source_rules_source_type_check
  check (source_type = any (array['announcement'::text,'event'::text]));

alter table public.sms_broadcasts
  drop constraint sms_broadcasts_source_type_check;
alter table public.sms_broadcasts
  add constraint sms_broadcasts_source_type_check
  check (source_type = any (array['announcement'::text,'event'::text]));
alter table public.sms_broadcasts
  drop constraint sms_broadcasts_broadcast_kind_check;
alter table public.sms_broadcasts
  add constraint sms_broadcasts_broadcast_kind_check
  check (broadcast_kind = any (array['initial'::text,'update'::text,'reminder'::text]));

-- Reservation policies and trigger bindings.
drop policy "Anyone can request a reservation" on public.reservations;
drop policy "Signed-in users can request a reservation" on public.reservations;
drop policy "Admin and official can view reservations" on public.reservations;
drop policy "Residents can view their own reservations" on public.reservations;
drop policy "Residents can mark their own reservations viewed" on public.reservations;
drop policy "Treasurer can update reservations" on public.reservations;

drop trigger trg_enforce_reservation_window on public.reservations;
drop trigger trg_notify_reservation on public.reservations;
drop trigger trg_protect_reservation_status on public.reservations;
drop trigger trg_stamp_reservation_reference on public.reservations;

drop function public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text);
drop function public.get_reservation_slots(date);
drop function public.get_reservation_slots_range(date,date);
drop function public.notify_reservation();
drop function public.protect_reservation_status();
drop function public.enforce_reservation_window();
drop function public.stamp_reservation_reference();
drop function public.track_court_reservation(text,text);

-- Health, medical, waste, availability and medicine policies.
drop policy "Nurse can delete health events" on public.health_events;
drop policy "Admin and nurse can insert health events" on public.health_events;
drop policy "Health events are viewable by everyone" on public.health_events;
drop policy "Admin and nurse can update health events" on public.health_events;

drop policy "Nurses can manage medical programs" on public.medical_programs;
drop policy "Public can view medical programs" on public.medical_programs;

drop policy "Officials can manage waste schedule" on public.waste_schedule;
drop policy "Anyone can view waste schedule" on public.waste_schedule;

drop policy "Nurse can delete availability" on public.nurse_availability;
drop policy "Admin and nurse can insert availability" on public.nurse_availability;
drop policy "Nurse availability viewable by everyone" on public.nurse_availability;
drop policy "Admin and nurse can update availability" on public.nurse_availability;

drop policy "Nurses can manage medicine availability" on public.medicine_stock;
drop policy "Anyone can view medicine availability" on public.medicine_stock;

-- No CASCADE: an unreviewed dependency aborts the transaction.
drop table public.reservations;
drop table public.health_events;
drop table public.medical_programs;
drop table public.waste_schedule;
drop table public.nurse_availability;
drop table public.medicine_stock;

-- These helpers are reservation-only but cannot be dropped until the generated
-- reservation column/table dependency is gone. Keep normalize_reservation_reference:
-- retained track_complaint(text,text) calls it.
drop function public.reservation_slot_hour(text);
drop function public.generate_reservation_reference(integer);

do $stage18b_postconditions$
begin
  if to_regclass('public.reservations') is not null
     or to_regclass('public.health_events') is not null
     or to_regclass('public.medical_programs') is not null
     or to_regclass('public.waste_schedule') is not null
     or to_regclass('public.nurse_availability') is not null
     or to_regclass('public.medicine_stock') is not null then
    raise exception 'Stage 18B postcondition failed: a retired table remains';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')) <> 50 then
    raise exception 'Stage 18B postcondition failed: expected 50 application tables';
  end if;

  if to_regprocedure('public.normalize_reservation_reference(text)') is null
     or to_regprocedure('public.track_complaint(text,text)') is null
     or to_regprocedure('public.stamp_activity_actor()') is null
     or to_regprocedure('public.sms_may_manage(text,uuid)') is null
     or to_regprocedure('public.sms_source_content(text,text)') is null
     or to_regprocedure('public.sms_message(text,jsonb)') is null
     or to_regprocedure('public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)') is null then
    raise exception 'Stage 18B postcondition failed: a retained function is missing';
  end if;

  if to_regprocedure('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)') is not null
     or to_regprocedure('public.get_reservation_slots(date)') is not null
     or to_regprocedure('public.get_reservation_slots_range(date,date)') is not null
     or to_regprocedure('public.notify_reservation()') is not null
     or to_regprocedure('public.protect_reservation_status()') is not null
     or to_regprocedure('public.enforce_reservation_window()') is not null
     or to_regprocedure('public.stamp_reservation_reference()') is not null
     or to_regprocedure('public.track_court_reservation(text,text)') is not null
     or to_regprocedure('public.reservation_slot_hour(text)') is not null
     or to_regprocedure('public.generate_reservation_reference(integer)') is not null then
    raise exception 'Stage 18B postcondition failed: a retired reservation routine remains';
  end if;
end
$stage18b_postconditions$;

commit;
