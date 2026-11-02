-- ROLLBACK CONTINGENCY for migration 065. NOT A MIGRATION. NOT APPLIED. LOCAL ONLY.
--
-- ⛔ RUNNING THIS REOPENS THE NURSE SMS PERMISSION. After it commits, any profile whose
-- role is 'nurse' can again preview resident counts for, create, and (through the
-- send-sms-broadcast Edge Function) SEND health_event / medical_program SMS broadcasts
-- to residents. That is the exact hole 065 closes.
--
-- It exists only so that a 065 apply which somehow broke OFFICIAL SMS can be undone
-- exactly. It is NOT an authorization to restore the retired Health Center or the nurse
-- role. Applying it to production requires the project owner's separate, explicit
-- approval for that specific incident, and the nurse account should be BANNED in
-- Supabase Auth (with its sessions signed out) before it is run.
--
-- What it restores: public.sms_may_manage(text, uuid) with 058's body, verbatim. Same
-- signature, language, STABLE, SECURITY DEFINER and search_path; owner and ACL kept by
-- CREATE OR REPLACE; direct EXECUTE re-revoked exactly as 058 left it. No row, no other
-- function, no policy, no privilege, no Auth account and no Edge Function is touched.
--
-- Fail-closed: it refuses unless
--   * it runs on a direct database connection (not over the API),
--   * the acknowledgement below has been set in the SAME transaction, word for word,
--   * sms_may_manage currently holds 065's body (so it never overwrites anything else),
-- and it refuses to commit unless the restored body is exactly 058's.
--
-- To run it, the owner must first add this line immediately after `begin;`:
--   select set_config('barangay.m065_rollback_ack', 'I approve reopening the nurse SMS permission', true);
begin;

do $rollback065$
declare
  c_fn constant text := 'public.sms_may_manage(text,uuid)';
  c_ack constant text := 'I approve reopening the nurse SMS permission';
  c_058 constant text := btrim(regexp_replace($b058$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  ((p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null)) or
   (p_type in ('health_event','medical_program') and p.role='nurse')));
$b058$, '\s+', ' ', 'g'));
  c_065 constant text := btrim(regexp_replace($b065$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null));
$b065$, '\s+', ' ', 'g'));
  v_oid oid := to_regprocedure(c_fn);
  v_owner oid;
  v_body text;
begin
  if auth.role() is not null then
    raise exception '065 rollback refused: run this from a direct database connection, not over the API';
  end if;
  if current_setting('barangay.m065_rollback_ack', true) is distinct from c_ack then
    raise exception '065 rollback refused: it reopens the nurse SMS permission and needs the explicit acknowledgement set in this transaction (see the header)';
  end if;
  if v_oid is null then raise exception '065 rollback refused: % does not exist', c_fn; end if;
  select p.proowner, btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) into v_owner, v_body
    from pg_proc p where p.oid = v_oid;
  if v_body is distinct from c_065 then
    raise exception '065 rollback refused: % does not hold the 065 definition, so there is nothing of 065''s to roll back', c_fn;
  end if;

  execute $ddl$
create or replace function public.sms_may_manage(p_type text,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from public.profiles p where p.id=p_actor and
  ((p_type in ('announcement','event') and p.role='official' and exists(
    select 1 from public.official_account_links l
    join public.barangay_officials bo on bo.id=l.official_id
    where l.profile_id=p.id and bo.archived_at is null)) or
   (p_type in ('health_event','medical_program') and p.role='nurse')));
$fn$
$ddl$;
  execute $rv$revoke all on function public.sms_may_manage(text,uuid) from public, anon, authenticated, service_role$rv$;

  if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                  where p.oid = v_oid and p.proowner = v_owner and l.lanname = 'sql' and p.prosecdef
                    and p.provolatile = 's' and p.proconfig = array['search_path=""']
                    and btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = c_058) then
    raise exception '065 rollback verify: the restored function is not 058''s definition';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_oid, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = v_oid and a.privilege_type = 'EXECUTE' and a.grantee = 0) then
    raise exception '065 rollback verify: the restored function is directly executable by a client';
  end if;
  raise warning '065 ROLLED BACK: sms_may_manage again grants nurse accounts health-source SMS';
end
$rollback065$;

commit;
