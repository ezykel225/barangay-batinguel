-- 065 -- Retire the nurse role's SMS broadcast permission.
--
-- NOT APPLIED. LOCAL DRAFT. Requires migrations 001-063 applied, and 063 in particular.
-- It does NOT depend on 064 and may be applied before it, after it, or without it:
-- 064 deletes rows from the retired modules' tables, 065 changes one function, and
-- neither touches an object the other changes.
--
-- WHY
--   The Health Center and the Nurse Dashboard are retired (PR #52), and 063 closes the
--   nurse's write paths on the health tables. But public.sms_may_manage(), from 058,
--   still answers TRUE for a profile whose role is 'nurse' on the 'health_event' and
--   'medical_program' source types. Every SMS function goes through it:
--
--     client RPCs (granted to authenticated): sms_audience_options, sms_preview,
--       sms_save_rule, sms_prepare_broadcast, sms_broadcast_state, sms_source_history,
--       sms_send_context -- each via sms_require_manager()
--     worker RPCs (granted to service_role only, called by the send-sms-broadcast Edge
--       Function with the VERIFIED caller's id): sms_claim_batch, sms_finish_attempt --
--       each calling sms_may_manage(source_type, actor) directly
--
--   The app signs a nurse out after sign-in, but Supabase has already issued a token by
--   then, so a nurse with valid credentials could preview resident counts, create a
--   live health-source broadcast and have the Edge Function send it. Nothing else
--   grants SMS: the three SMS tables carry no client privilege at all (058), so the
--   functions above are the only route, and they all resolve through this one check.
--
-- WHAT IT CHANGES -- one function, and nothing else
--   public.sms_may_manage(text, uuid): the nurse branch is removed. The function now
--   answers TRUE only for an 'announcement' or 'event' source and a profile whose role
--   is 'official' and who holds a link to an ACTIVE directory row -- the official branch
--   exactly as 058 wrote it. 'health_event' and 'medical_program' answer FALSE for
--   every account.
--
--   Same name, arguments, return type, language (sql), volatility (STABLE), SECURITY
--   DEFINER and search_path ('') as 058. CREATE OR REPLACE keeps the owner and the
--   ACL; the REVOKE below only re-asserts what 058 set (no direct EXECUTE for PUBLIC,
--   anon, authenticated or service_role). The callers keep working without a grant on
--   it because a nested call inside a SECURITY DEFINER function is checked as the
--   function's owner (the fact migration 034 relies on).
--
-- WHAT IT DOES NOT CHANGE
--   * No SMS row is deleted or edited. Historical broadcasts, recipients, rules,
--     requested_by / updated_by attribution and activity_log rows are untouched; the
--     source_type CHECK constraints still accept the health types, so old rows stay
--     valid. (After 065 no app account can READ a health-source history through the
--     RPCs either; the rows remain in the tables. On 2026-11-01 production held zero
--     health-source broadcasts and zero health-source rules.)
--   * No other function, no policy, no table privilege, no Auth account, no Edge
--     Function, no health table.
--   * 'nurse' stays a storable profiles.role value (one account still exists).
--
-- HOW IT PROTECTS ITSELF -- one transaction; any failure changes nothing
--   1. Direct database connection only (auth.role() is null), as for 064.
--   2. 063 is applied -- the same two checks 064 makes.
--   3. sms_may_manage has the expected shape, and its body (whitespace-normalised) is
--      EITHER exactly 058's -- proceed -- OR exactly 065's -- already applied, so the
--      definition is left as it is and only the verification runs. Any other body is
--      refused rather than overwritten: somebody changed it, and that change must be
--      reviewed first.
--   4. The three SMS tables are locked against writes, and no health-source live
--      broadcast may have a recipient still 'pending' or 'attempting'. Removing the
--      permission mid-send would leave a claimed message recorded nowhere.
--   Before commit it verifies: the shape and owner unchanged, the new body exact and
--   free of 'nurse', no direct EXECUTE for PUBLIC/anon/authenticated/service_role, the
--   ten caller functions present with unchanged ACLs, every official's announcement
--   and event answer identical to before, every health answer false, every nurse
--   profile false for all four types, and the three SMS tables byte-identical.
--
-- ROLLBACK
--   Emergency only, separately authorized: supabase-tests/065_rollback_contingency.sql.
--   It restores 058's definition and therefore REOPENS the nurse SMS permission.
--
-- DEFENCE IN DEPTH
--   Ban the nurse account in Supabase Auth and sign out its sessions as well. 065
--   closes SMS; it does not remove the account's other signed-in surfaces.
--
-- TESTS
--   supabase-tests/065_retire_nurse_sms_behavioral.sql, built by
--   supabase-tests/065_build_test_runner.mjs from THIS file's DO body.
begin;

do $m065$
declare
  c_fn constant text := 'public.sms_may_manage(text,uuid)';
  -- 058's body, verbatim. Compared whitespace-normalised, so line endings and
  -- indentation introduced by an editor do not matter but every token does.
  c_058 constant text := btrim(regexp_replace($b058$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  ((p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null)) or
   (p_type in ('health_event','medical_program') and p.role='nurse')));
$b058$, '\s+', ' ', 'g'));
  -- 065's body. Must be identical to the body in the CREATE OR REPLACE below; the
  -- verification step compares them, so a drift between the two copies is refused.
  c_065 constant text := btrim(regexp_replace($b065$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null));
$b065$, '\s+', ' ', 'g'));
  c_callers constant text[] := array[
    'public.sms_require_manager(text)', 'public.sms_audience_options(text)',
    'public.sms_preview(text,text,jsonb,jsonb)', 'public.sms_save_rule(text,text,jsonb)',
    'public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)',
    'public.sms_broadcast_state(uuid)', 'public.sms_source_history(text,text)',
    'public.sms_send_context(uuid)', 'public.sms_claim_batch(uuid,uuid)',
    'public.sms_finish_attempt(uuid,uuid,text,text,text)'];
  c_retired_tables constant text[] := array['reservations','medical_programs','health_events',
    'medicine_stock','nurse_availability','waste_schedule'];
  v_oid oid;
  v_owner oid;
  v_body text;
  v_already boolean;
  v_bad text;
  v_n bigint;
  v_officials_before text;
  v_callers_acl_before text;
  v_sms_before text;
  v_sms_after text;
begin
  -- 1. Direct database connection only. -----------------------------------------------
  if auth.role() is not null then
    raise exception '065 refused: run this from a direct database connection (SQL Editor), not over the API';
  end if;

  -- 2. Migration 063 is applied. ------------------------------------------------------
  select string_agg(f, ', ') into v_bad from unnest(array[
    'public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)',
    'public.track_court_reservation(text,text)','public.get_reservation_slots(date)',
    'public.get_reservation_slots_range(date,date)','public.generate_reservation_reference(integer)']) f
  where to_regprocedure(f) is null
     or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE');
  if v_bad is not null then raise exception '065 refused: migration 063 is not applied (client EXECUTE on %)', v_bad; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = any(c_retired_tables)
              and cmd in ('INSERT','UPDATE','DELETE','ALL'))
     or has_table_privilege('anon','public.reservations','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.reservations','SELECT,INSERT,UPDATE,DELETE') then
    raise exception '065 refused: migration 063 is not applied (client write path on a retired table)';
  end if;

  -- 3. The function is the one 058 created (or 065 has already replaced it). -----------
  v_oid := to_regprocedure(c_fn);
  if v_oid is null then raise exception '065 refused: % does not exist', c_fn; end if;
  select p.proowner, p.prosrc into v_owner, v_body from pg_proc p where p.oid = v_oid;
  if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                  where p.oid = v_oid and l.lanname = 'sql' and p.prosecdef and p.provolatile = 's'
                    and p.prorettype = 'boolean'::regtype and not p.proretset
                    and p.proconfig = array['search_path=""']) then
    raise exception '065 refused: % no longer has 058''s shape (sql, STABLE, SECURITY DEFINER, search_path ''''); review it first', c_fn;
  end if;
  v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));
  if v_body = c_065 then
    v_already := true;
    raise notice '065: sms_may_manage already carries the 065 definition; verifying only';
  elsif v_body = c_058 then
    v_already := false;
  else
    raise exception '065 refused: % has an unexpected definition (neither 058''s nor 065''s); review the change before retiring the nurse branch', c_fn;
  end if;

  -- 4. No health-source broadcast is mid-send. -----------------------------------------
  -- SHARE blocks every concurrent INSERT/UPDATE/DELETE on these tables until commit,
  -- so nothing can be prepared or claimed between this check and the replacement.
  lock table public.sms_broadcasts, public.sms_broadcast_recipients, public.sms_source_rules in share mode;
  select count(*) into v_n
    from public.sms_broadcast_recipients r join public.sms_broadcasts b on b.id = r.broadcast_id
   where b.source_type in ('health_event','medical_program') and not b.dry_run
     and r.status in ('pending','attempting');
  if v_n > 0 then
    raise exception '065 refused: % recipient row(s) of a health-source SMS broadcast are still pending or attempting; resolve them first', v_n;
  end if;

  -- Snapshots for the verification step. -----------------------------------------------
  select coalesce(md5(string_agg(p.id::text || ':' || t, ',' order by p.id, t)), '-')
    into v_officials_before
    from public.profiles p cross join unnest(array['announcement','event']) t
   where public.sms_may_manage(t, p.id);
  select md5(string_agg(f || '=' || coalesce(p.proacl::text, '<default>'), ',' order by f))
    into v_callers_acl_before
    from unnest(c_callers) f left join pg_proc p on p.oid = to_regprocedure(f);
  select md5(string_agg(x, ',' order by x)) into v_sms_before from (
    select 'b:' || md5(t::text) x from public.sms_broadcasts t
    union all select 'r:' || md5(t::text) from public.sms_broadcast_recipients t
    union all select 's:' || md5(t::text) from public.sms_source_rules t) s;

  -- 5. The change. -----------------------------------------------------------------------
  if not v_already then
    execute $ddl$
create or replace function public.sms_may_manage(p_type text,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null));
$fn$
$ddl$;
  end if;
  execute $rv$revoke all on function public.sms_may_manage(text,uuid) from public, anon, authenticated, service_role$rv$;

  -- 6. Verify before commit. ---------------------------------------------------------------
  if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                  where p.oid = v_oid and p.proowner = v_owner and l.lanname = 'sql' and p.prosecdef
                    and p.provolatile = 's' and p.prorettype = 'boolean'::regtype and not p.proretset
                    and p.proconfig = array['search_path=""']) then
    raise exception '065 verify: the function''s identity, owner or security attributes changed';
  end if;
  select btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) into v_body from pg_proc p where p.oid = v_oid;
  if v_body is distinct from c_065 or v_body ~* 'nurse' then
    raise exception '065 verify: the new definition is not the reviewed 065 body';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = v_oid and a.privilege_type = 'EXECUTE' and a.grantee = 0)
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '065 verify: % is directly executable by a client or service role', c_fn;
  end if;
  select string_agg(f, ', ') into v_bad from unnest(c_callers) f where to_regprocedure(f) is null;
  if v_bad is not null then raise exception '065 verify: a caller function is missing: %', v_bad; end if;
  if (select md5(string_agg(f || '=' || coalesce(p.proacl::text, '<default>'), ',' order by f))
        from unnest(c_callers) f left join pg_proc p on p.oid = to_regprocedure(f)) is distinct from v_callers_acl_before then
    raise exception '065 verify: a caller function''s privileges changed';
  end if;
  if (select coalesce(md5(string_agg(p.id::text || ':' || t, ',' order by p.id, t)), '-')
        from public.profiles p cross join unnest(array['announcement','event']) t
       where public.sms_may_manage(t, p.id)) is distinct from v_officials_before then
    raise exception '065 verify: an official''s announcement or event SMS permission changed';
  end if;
  if exists (select 1 from public.profiles p cross join unnest(array['health_event','medical_program']) t
              where public.sms_may_manage(t, p.id)) then
    raise exception '065 verify: some account can still manage a health-source SMS';
  end if;
  if exists (select 1 from public.profiles p cross join unnest(array['announcement','event','health_event','medical_program']) t
              where p.role = 'nurse' and public.sms_may_manage(t, p.id)) then
    raise exception '065 verify: a nurse account can still manage an SMS source';
  end if;
  select md5(string_agg(x, ',' order by x)) into v_sms_after from (
    select 'b:' || md5(t::text) x from public.sms_broadcasts t
    union all select 'r:' || md5(t::text) from public.sms_broadcast_recipients t
    union all select 's:' || md5(t::text) from public.sms_source_rules t) s;
  if v_sms_after is distinct from v_sms_before then
    raise exception '065 verify: SMS history changed';
  end if;

  raise notice '065: nurse SMS permission retired (already applied before this run: %)', v_already;
end
$m065$;

commit;
