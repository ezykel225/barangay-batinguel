-- NOT APPLIED. Requires applied migrations 001-061. Independent of 062: neither
-- migration touches an object the other creates or alters, so 063 may be applied
-- before 062 at the PR #52 cutover; see "Order of application" below.
--
-- Retires CLIENT access to the modules the application no longer offers (scope
-- cleanup, PR #52): Court Reservations and reservation tracking, the Nurse
-- Dashboard / Health Center, Waste Management and the Voter Reference List UI.
--
-- ⚠️ PRIVILEGES AND WRITE POLICIES ONLY. This migration deletes no row and drops no
-- table, column, function, trigger, constraint or index. Every historical record
-- stays readable to the table owner (SQL Editor) and service_role.
--
-- What was verified before writing it (post-061 production schema, read locally):
--   * create_court_reservation(13 args), track_court_reservation(text,text),
--     get_reservation_slots(date) and get_reservation_slots_range(date,date) are
--     SECURITY DEFINER and EXECUTE-granted to anon AND authenticated (025, 038).
--   * reservations also accepts DIRECT inserts: policies "Anyone can request a
--     reservation" (anon) and "Signed-in users can request a reservation"
--     (authenticated), backed by client INSERT privileges. Revoking the RPCs alone
--     would leave this second creation path open.
--   * The health tables, waste_schedule and residents_registry carry broad client
--     privileges (including PostgreSQL 17's MAINTAIN) and write policies, several
--     created in the dashboard and recorded in no earlier migration.
--   * No sequence or view depends on these tables. One foreign key points INTO
--     residents_registry (complaint_parties.registry_entry_id); foreign-key checks
--     run as the table owner, so revoking client privileges does not affect it.
--   * Functions still in use that READ these tables are all SECURITY DEFINER and are
--     therefore unaffected by client privileges: link_complaint_party and
--     search_case_residents (residents_registry), sms_source_content
--     (health_events, medical_programs), plus the reservation triggers.
--
-- KEPT, deliberately:
--   * normalize_reservation_reference(text) -- used by track_complaint().
--   * reservation_slot_hour(text) -- the reservations.slot_hour generated column.
--   * Public SELECT on the health tables and waste_schedule (public information,
--     now unread by the application; retiring it is a separate decision).
--   * Official SELECT on residents_registry -- the Residents verification table
--     still shows a "Voter List Match" column. The "Officials can manage residents
--     registry" policy is kept because it is that SELECT path; its write half is
--     closed at the privilege layer instead.
--   * The SELECT policies on reservations (inert: no client SELECT privilege remains).
--   * kapitan_availability, kapitan_status and every retained service's objects.
--   * service_role and the table owner (maintenance) are not revoked from anything.
--
-- Order of application: the live site uses the reservation endpoints until PR #52
-- deploys, so apply this AFTER that deployment completes, immediately, in one
-- transaction. Rolling the frontend back does NOT restore any privilege revoked
-- here; restoring retired API access requires its own reviewed migration.
--
-- Fail-closed: a guard block below stops the whole migration if any object it names
-- is missing or different, and a verification block refuses to commit unless the
-- resulting privileges are exactly as intended.
begin;

do $guard$
declare v_missing text;
begin
  select string_agg(x,', ') into v_missing from (values
    ('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)'),
    ('public.track_court_reservation(text,text)'),
    ('public.get_reservation_slots(date)'),
    ('public.get_reservation_slots_range(date,date)'),
    ('public.generate_reservation_reference(integer)'),
    ('public.normalize_reservation_reference(text)'),
    ('public.reservation_slot_hour(text)')) f(x)
  where to_regprocedure(x) is null;
  if v_missing is not null then raise exception '063 guard: function(s) not found: %', v_missing; end if;

  select string_agg(t||'.'||p,', ') into v_missing from (values
    ('reservations','Anyone can request a reservation'),
    ('reservations','Signed-in users can request a reservation'),
    ('reservations','Residents can mark their own reservations viewed'),
    ('reservations','Treasurer can update reservations'),
    ('health_events','Admin and nurse can insert health events'),
    ('health_events','Admin and nurse can update health events'),
    ('health_events','Nurse can delete health events'),
    ('nurse_availability','Admin and nurse can insert availability'),
    ('nurse_availability','Admin and nurse can update availability'),
    ('nurse_availability','Nurse can delete availability'),
    ('medicine_stock','Nurses can manage medicine availability'),
    ('medical_programs','Nurses can manage medical programs'),
    ('waste_schedule','Officials can manage waste schedule'),
    ('residents_registry','Officials can manage residents registry')) q(t,p)
  where not exists (select 1 from pg_policies where schemaname='public' and tablename=q.t and policyname=q.p);
  if v_missing is not null then raise exception '063 guard: policy(ies) not found: %', v_missing; end if;
end $guard$;

-- 1. Court reservations: the four retired RPCs and the reference generator. -------
-- generate_reservation_reference is only called by the stamp trigger, and a trigger
-- does not need the caller to hold EXECUTE (verified in migration 034).
revoke execute on function public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.track_court_reservation(text,text) from public, anon, authenticated;
revoke execute on function public.get_reservation_slots(date) from public, anon, authenticated;
revoke execute on function public.get_reservation_slots_range(date,date) from public, anon, authenticated;
revoke execute on function public.generate_reservation_reference(integer) from public, anon, authenticated;

-- 2. Court reservations: every direct client path. -------------------------------
revoke all on table public.reservations from public, anon, authenticated;
drop policy "Anyone can request a reservation" on public.reservations;
drop policy "Signed-in users can request a reservation" on public.reservations;
drop policy "Residents can mark their own reservations viewed" on public.reservations;
drop policy "Treasurer can update reservations" on public.reservations;

-- 3. Nurse / Health Center: writes closed; public SELECT kept. ---------------------
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.health_events, public.nurse_availability, public.medicine_stock, public.medical_programs
  from public, anon, authenticated;
drop policy "Admin and nurse can insert health events" on public.health_events;
drop policy "Admin and nurse can update health events" on public.health_events;
drop policy "Nurse can delete health events" on public.health_events;
drop policy "Admin and nurse can insert availability" on public.nurse_availability;
drop policy "Admin and nurse can update availability" on public.nurse_availability;
drop policy "Nurse can delete availability" on public.nurse_availability;
drop policy "Nurses can manage medicine availability" on public.medicine_stock;
drop policy "Nurses can manage medical programs" on public.medical_programs;

-- 4. Waste Management: writes closed; public SELECT kept. --------------------------
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.waste_schedule from public, anon, authenticated;
drop policy "Officials can manage waste schedule" on public.waste_schedule;

-- 5. Voter Reference List: writes closed; official SELECT kept (Voter List Match). -
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.residents_registry from public, anon, authenticated;
revoke select on table public.residents_registry from public, anon;

-- 6. Verify the result before committing. -----------------------------------------
do $verify$
declare v_bad text;
begin
  -- Retired functions: no client role may execute them; service_role still may.
  select string_agg(f,', ') into v_bad from (values
    ('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)'),
    ('public.track_court_reservation(text,text)'),('public.get_reservation_slots(date)'),
    ('public.get_reservation_slots_range(date,date)'),('public.generate_reservation_reference(integer)')) x(f)
  where has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')
     or not has_function_privilege('service_role',f,'EXECUTE');
  if v_bad is not null then raise exception '063 verify: retired function access wrong: %', v_bad; end if;

  -- Kept functions remain executable by the clients that use them.
  if not (has_function_privilege('anon','public.normalize_reservation_reference(text)','EXECUTE')
      and has_function_privilege('authenticated','public.normalize_reservation_reference(text)','EXECUTE')
      and has_function_privilege('anon','public.track_complaint(text,text)','EXECUTE')) then
    raise exception '063 verify: complaint tracking dependencies lost EXECUTE';
  end if;

  -- reservations: no client privilege of any kind; owner and service_role untouched.
  select string_agg(r||':'||p,', ') into v_bad from (values ('anon'),('authenticated')) r(r)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(p)
  where has_table_privilege(r,'public.reservations',p);
  if v_bad is not null then raise exception '063 verify: reservations still grants %', v_bad; end if;
  if not has_table_privilege('service_role','public.reservations','SELECT') then
    raise exception '063 verify: service_role lost reservations SELECT'; end if;

  -- Health, waste and registry: no client write of any kind.
  select string_agg(t||' '||r||':'||p,', ') into v_bad
  from (values ('health_events'),('nurse_availability'),('medicine_stock'),('medical_programs'),('waste_schedule'),('residents_registry')) t(t)
  cross join (values ('anon'),('authenticated')) r(r)
  cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('MAINTAIN')) p(p)
  where has_table_privilege(r,'public.'||t,p);
  if v_bad is not null then raise exception '063 verify: client write remains: %', v_bad; end if;

  -- Kept reads.
  if not (has_table_privilege('anon','public.health_events','SELECT')
      and has_table_privilege('anon','public.waste_schedule','SELECT')
      and has_table_privilege('authenticated','public.residents_registry','SELECT')
      and not has_table_privilege('anon','public.residents_registry','SELECT')
      and has_table_privilege('anon','public.kapitan_availability','SELECT')) then
    raise exception '063 verify: a preserved SELECT path changed';
  end if;

  -- No policy that could write these tables survives; the kept SELECT paths do.
  if exists (select 1 from pg_policies where schemaname='public'
              and tablename in ('reservations','health_events','nurse_availability','medicine_stock','medical_programs','waste_schedule')
              and cmd in ('INSERT','UPDATE','DELETE','ALL')) then
    raise exception '063 verify: a write policy remains on a retired table';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='residents_registry'
                  and policyname='Officials can manage residents registry') then
    raise exception '063 verify: the official residents_registry SELECT path is gone';
  end if;
end $verify$;

commit;
