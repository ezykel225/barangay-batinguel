-- ROLLBACK CONTINGENCY for migration 063. NOT A MIGRATION. NOT APPLIED. LOCAL ONLY.
--
-- ⚠️ This file exists so that a failed 063 cutover can be undone exactly. It is NOT an
-- authorization to reopen the retired services. Applying it to production requires the
-- project owner's explicit approval for that specific incident.
--
-- Generated from the private post-061 production schema snapshot (sha256 f2bb1189...5f94):
-- every policy below is the snapshot's CREATE POLICY statement verbatim, including the
-- dashboard-created ones, and every grant is the snapshot's pre-063 privilege set.
--
-- Restores ONLY what 063 changed:
--   * the 13 policies 063 drops. (063 GUARDS 14; the 14th, "Officials can manage
--     residents registry", is never dropped and so is not recreated here.)
--   * client privileges on 7 tables exactly as they were before 063 -- no more. TRUNCATE
--     is NOT re-granted: no client held it (migration 035).
--   * client EXECUTE on 5 functions, including PUBLIC on generate_reservation_reference,
--     which held PUBLIC EXECUTE by default before 063.
-- Touches no row. Historical data is unaffected either way.
--
-- Fail-closed: aborts unless the database is in the state 063 leaves behind, and refuses
-- to commit unless the restored privileges and policies equal the snapshot.
begin;

do $guard$
declare v_bad text;
begin
  select string_agg(t||'|'||p,', ') into v_bad from (values
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
    ('waste_schedule','Officials can manage waste schedule')) q(t,p)
  where exists (select 1 from pg_policies where schemaname='public' and tablename=q.t and policyname=q.p);
  if v_bad is not null then raise exception '063 rollback guard: policy already present (state is not post-063): %', v_bad; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='residents_registry'
                  and policyname='Officials can manage residents registry') then
    raise exception '063 rollback guard: the kept residents_registry policy is missing; investigate first';
  end if;
  if has_function_privilege('anon','public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE')
     or has_table_privilege('anon','public.reservations','INSERT')
     or has_table_privilege('authenticated','public.health_events','INSERT') then
    raise exception '063 rollback guard: 063 does not appear to be applied';
  end if;
end $guard$;

-- 1. Function EXECUTE, as before 063.
grant execute on function public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text) to anon, authenticated;
grant execute on function public.track_court_reservation(text,text) to anon, authenticated;
grant execute on function public.get_reservation_slots(date) to anon, authenticated;
grant execute on function public.get_reservation_slots_range(date,date) to anon, authenticated;
grant execute on function public.generate_reservation_reference(integer) to public, anon, authenticated;

-- 2. Table privileges, as before 063 (never more).
grant select, insert, references, trigger, maintain, update on table public.reservations to anon;
grant select, insert, references, trigger, maintain, update on table public.reservations to authenticated;
grant insert, references, delete, trigger, maintain, update on table public.health_events to anon;
grant insert, references, delete, trigger, maintain, update on table public.health_events to authenticated;
grant insert, references, delete, trigger, maintain, update on table public.nurse_availability to anon;
grant insert, references, delete, trigger, maintain, update on table public.nurse_availability to authenticated;
grant insert, references, delete, trigger, maintain, update on table public.medicine_stock to anon;
grant insert, references, delete, trigger, maintain, update on table public.medicine_stock to authenticated;
grant insert, references, delete, trigger, maintain, update on table public.medical_programs to anon;
grant insert, references, delete, trigger, maintain, update on table public.medical_programs to authenticated;
grant insert, references, delete, trigger, maintain, update on table public.waste_schedule to anon;
grant insert, references, delete, trigger, maintain, update on table public.waste_schedule to authenticated;
grant select, insert, references, delete, trigger, maintain, update on table public.residents_registry to anon;
grant insert, references, delete, trigger, maintain, update on table public.residents_registry to authenticated;

-- 3. The 13 policies 063 dropped, verbatim from the snapshot.
CREATE POLICY "Anyone can request a reservation" ON public.reservations FOR INSERT TO anon WITH CHECK (((status = 'pending'::text) AND (resident_id IS NULL) AND (reviewed_by IS NULL)));
CREATE POLICY "Signed-in users can request a reservation" ON public.reservations FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (reviewed_by IS NULL) AND ((resident_id IS NULL) OR (resident_id = auth.uid()))));
CREATE POLICY "Residents can mark their own reservations viewed" ON public.reservations FOR UPDATE USING ((resident_id = auth.uid()));
CREATE POLICY "Treasurer can update reservations" ON public.reservations FOR UPDATE USING (public.current_official_holds_position('Barangay Treasurer'::text));
CREATE POLICY "Admin and nurse can insert health events" ON public.health_events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Admin and nurse can update health events" ON public.health_events FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Nurse can delete health events" ON public.health_events FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Admin and nurse can insert availability" ON public.nurse_availability FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Admin and nurse can update availability" ON public.nurse_availability FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Nurse can delete availability" ON public.nurse_availability FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Nurses can manage medicine availability" ON public.medicine_stock TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'nurse'::text)))));
CREATE POLICY "Nurses can manage medical programs" ON public.medical_programs TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'nurse'::text)))));
CREATE POLICY "Officials can manage waste schedule" ON public.waste_schedule USING ((EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'official'::text)))));

-- 4. Refuse to commit unless the restored state equals the snapshot.
do $verify$
declare v_bad text;
begin
  select string_agg(t||' '||r||':'||p||'='||want::text,', ') into v_bad from (values
    ('reservations','anon','SELECT',true),
    ('reservations','anon','INSERT',true),
    ('reservations','anon','UPDATE',true),
    ('reservations','anon','DELETE',false),
    ('reservations','anon','TRUNCATE',false),
    ('reservations','anon','REFERENCES',true),
    ('reservations','anon','TRIGGER',true),
    ('reservations','anon','MAINTAIN',true),
    ('reservations','authenticated','SELECT',true),
    ('reservations','authenticated','INSERT',true),
    ('reservations','authenticated','UPDATE',true),
    ('reservations','authenticated','DELETE',false),
    ('reservations','authenticated','TRUNCATE',false),
    ('reservations','authenticated','REFERENCES',true),
    ('reservations','authenticated','TRIGGER',true),
    ('reservations','authenticated','MAINTAIN',true),
    ('health_events','anon','SELECT',true),
    ('health_events','anon','INSERT',true),
    ('health_events','anon','UPDATE',true),
    ('health_events','anon','DELETE',true),
    ('health_events','anon','TRUNCATE',false),
    ('health_events','anon','REFERENCES',true),
    ('health_events','anon','TRIGGER',true),
    ('health_events','anon','MAINTAIN',true),
    ('health_events','authenticated','SELECT',true),
    ('health_events','authenticated','INSERT',true),
    ('health_events','authenticated','UPDATE',true),
    ('health_events','authenticated','DELETE',true),
    ('health_events','authenticated','TRUNCATE',false),
    ('health_events','authenticated','REFERENCES',true),
    ('health_events','authenticated','TRIGGER',true),
    ('health_events','authenticated','MAINTAIN',true),
    ('nurse_availability','anon','SELECT',true),
    ('nurse_availability','anon','INSERT',true),
    ('nurse_availability','anon','UPDATE',true),
    ('nurse_availability','anon','DELETE',true),
    ('nurse_availability','anon','TRUNCATE',false),
    ('nurse_availability','anon','REFERENCES',true),
    ('nurse_availability','anon','TRIGGER',true),
    ('nurse_availability','anon','MAINTAIN',true),
    ('nurse_availability','authenticated','SELECT',true),
    ('nurse_availability','authenticated','INSERT',true),
    ('nurse_availability','authenticated','UPDATE',true),
    ('nurse_availability','authenticated','DELETE',true),
    ('nurse_availability','authenticated','TRUNCATE',false),
    ('nurse_availability','authenticated','REFERENCES',true),
    ('nurse_availability','authenticated','TRIGGER',true),
    ('nurse_availability','authenticated','MAINTAIN',true),
    ('medicine_stock','anon','SELECT',true),
    ('medicine_stock','anon','INSERT',true),
    ('medicine_stock','anon','UPDATE',true),
    ('medicine_stock','anon','DELETE',true),
    ('medicine_stock','anon','TRUNCATE',false),
    ('medicine_stock','anon','REFERENCES',true),
    ('medicine_stock','anon','TRIGGER',true),
    ('medicine_stock','anon','MAINTAIN',true),
    ('medicine_stock','authenticated','SELECT',true),
    ('medicine_stock','authenticated','INSERT',true),
    ('medicine_stock','authenticated','UPDATE',true),
    ('medicine_stock','authenticated','DELETE',true),
    ('medicine_stock','authenticated','TRUNCATE',false),
    ('medicine_stock','authenticated','REFERENCES',true),
    ('medicine_stock','authenticated','TRIGGER',true),
    ('medicine_stock','authenticated','MAINTAIN',true),
    ('medical_programs','anon','SELECT',true),
    ('medical_programs','anon','INSERT',true),
    ('medical_programs','anon','UPDATE',true),
    ('medical_programs','anon','DELETE',true),
    ('medical_programs','anon','TRUNCATE',false),
    ('medical_programs','anon','REFERENCES',true),
    ('medical_programs','anon','TRIGGER',true),
    ('medical_programs','anon','MAINTAIN',true),
    ('medical_programs','authenticated','SELECT',true),
    ('medical_programs','authenticated','INSERT',true),
    ('medical_programs','authenticated','UPDATE',true),
    ('medical_programs','authenticated','DELETE',true),
    ('medical_programs','authenticated','TRUNCATE',false),
    ('medical_programs','authenticated','REFERENCES',true),
    ('medical_programs','authenticated','TRIGGER',true),
    ('medical_programs','authenticated','MAINTAIN',true),
    ('waste_schedule','anon','SELECT',true),
    ('waste_schedule','anon','INSERT',true),
    ('waste_schedule','anon','UPDATE',true),
    ('waste_schedule','anon','DELETE',true),
    ('waste_schedule','anon','TRUNCATE',false),
    ('waste_schedule','anon','REFERENCES',true),
    ('waste_schedule','anon','TRIGGER',true),
    ('waste_schedule','anon','MAINTAIN',true),
    ('waste_schedule','authenticated','SELECT',true),
    ('waste_schedule','authenticated','INSERT',true),
    ('waste_schedule','authenticated','UPDATE',true),
    ('waste_schedule','authenticated','DELETE',true),
    ('waste_schedule','authenticated','TRUNCATE',false),
    ('waste_schedule','authenticated','REFERENCES',true),
    ('waste_schedule','authenticated','TRIGGER',true),
    ('waste_schedule','authenticated','MAINTAIN',true),
    ('residents_registry','anon','SELECT',true),
    ('residents_registry','anon','INSERT',true),
    ('residents_registry','anon','UPDATE',true),
    ('residents_registry','anon','DELETE',true),
    ('residents_registry','anon','TRUNCATE',false),
    ('residents_registry','anon','REFERENCES',true),
    ('residents_registry','anon','TRIGGER',true),
    ('residents_registry','anon','MAINTAIN',true),
    ('residents_registry','authenticated','SELECT',true),
    ('residents_registry','authenticated','INSERT',true),
    ('residents_registry','authenticated','UPDATE',true),
    ('residents_registry','authenticated','DELETE',true),
    ('residents_registry','authenticated','TRUNCATE',false),
    ('residents_registry','authenticated','REFERENCES',true),
    ('residents_registry','authenticated','TRIGGER',true),
    ('residents_registry','authenticated','MAINTAIN',true)) x(t,r,p,want)
  where has_table_privilege(r,'public.'||t,p) is distinct from want;
  if v_bad is not null then raise exception '063 rollback verify: table privileges differ from the snapshot: %', v_bad; end if;

  select string_agg(f||' '||r||'='||want::text,', ') into v_bad from (values
    ('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)','anon',true),
    ('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)','authenticated',true),
    ('public.track_court_reservation(text,text)','anon',true),
    ('public.track_court_reservation(text,text)','authenticated',true),
    ('public.get_reservation_slots(date)','anon',true),
    ('public.get_reservation_slots(date)','authenticated',true),
    ('public.get_reservation_slots_range(date,date)','anon',true),
    ('public.get_reservation_slots_range(date,date)','authenticated',true),
    ('public.generate_reservation_reference(integer)','anon',true),
    ('public.generate_reservation_reference(integer)','authenticated',true)) x(f,r,want)
  where has_function_privilege(r,f,'EXECUTE') is distinct from want;
  if v_bad is not null then raise exception '063 rollback verify: function EXECUTE differs from the snapshot: %', v_bad; end if;

  if (select count(*) from pg_policies where schemaname='public' and (tablename, policyname) in (
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
        ('waste_schedule','Officials can manage waste schedule'))) <> 13 then
    raise exception '063 rollback verify: not every policy was restored';
  end if;
end $verify$;

commit;
