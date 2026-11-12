-- PREPARED ONLY. NOT EXECUTED. Forward security correction; no data backfill.
-- Requires installed 007/011/012/022/031/044/055/056 and reviewed profile schema.
-- Independent of pending 061-067; never requires or executes 064.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regprocedure('public.current_official_may_administer_records()') is null
    or to_regprocedure('public.prevent_role_self_change()') is null
    or to_regprocedure('public.compose_full_name()') is null
    or to_regprocedure('public.sync_verified_resident_directory()') is null then
    raise exception '068 prerequisites missing; stop and inspect';
  end if;
  if not exists(select 1 from pg_class where oid='public.profiles'::regclass and relrowsecurity) then
    raise exception '068 requires profiles RLS';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles'
    and column_name=any(array['id','role','email','system_id','created_at','full_name','first_name','middle_name',
      'last_name','suffix','contact_number','purok','photo_url','id_document_url','verification_status',
      'verified_by','verified_at','verification_notes'])) <> 18 then
    raise exception '068 expected profile columns missing; inspect schema';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname='trg_notify_verification' and tgfoid='public.notify_verification()'::regprocedure
      and tgtype=21 and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname='trg_sync_verified_resident_directory' and tgfoid='public.sync_verified_resident_directory()'::regprocedure
      and tgtype=21 and tgenabled='O') then
    raise exception '068 notification/directory AFTER triggers require review';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='profiles'
      and cmd='UPDATE' and policyname in ('Officials can verify resident accounts','Users can update their own profile')) <> 2
    or exists(select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and cmd in ('UPDATE','ALL') and policyname not in ('Officials can verify resident accounts','Users can update their own profile')) then
    raise exception '068 unexpected profile UPDATE policy inventory; review before retry';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname='trg_prevent_role_self_change' and tgfoid='public.prevent_role_self_change()'::regprocedure
      and tgtype=19 and tgenabled='O' and tgattr=''::int2vector and tgqual is null)
    or not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname='trg_compose_full_name' and tgfoid='public.compose_full_name()'::regprocedure
      and tgtype=23 and tgenabled='O' and tgattr=''::int2vector and tgqual is null)
    or exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal
      and (tgtype & 2)=2 and (tgtype & 16)=16
      and tgname not in ('trg_compose_full_name','trg_prevent_role_self_change')) then
    raise exception '068 expected compose/guard trigger ordering not established';
  end if;
end;
$preflight$;

-- UPDATE policies are permissive ORs: narrow the staff policy AND give the own
-- policy an explicit new-row check. The trigger protects columns on BOTH paths.
alter policy "Officials can verify resident accounts" on public.profiles
  using (public.current_official_may_administer_records() and role='resident')
  with check (public.current_official_may_administer_records() and role='resident');
alter policy "Users can update their own profile" on public.profiles
  using (auth.uid()=id) with check (auth.uid()=id);

create or replace function public.prevent_role_self_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_owner boolean;
  v_admin boolean;
  v_name_changed boolean;
  v_identity_changed boolean;
  v_verification_changed boolean;
  v_resubmit boolean;
begin
  -- Explicit trusted maintenance paths, NOT a blanket null-JWT bypass.
  -- current_user is intentionally NOT used: this function is SECURITY DEFINER.
  if auth.role()='service_role' then return new; end if;
  if auth.role() is null and session_user in ('postgres','supabase_admin')
    and coalesce(current_setting('role',true),'none') in ('none','postgres','supabase_admin') then
    return new;
  end if;
  if v_actor is null then raise exception 'Authenticated profile update required' using errcode='42501'; end if;
  v_owner := v_actor=old.id;
  v_admin := old.role='resident' and coalesce(public.current_official_may_administer_records(),false);
  if not v_owner and not v_admin then raise exception 'Profile update not authorized' using errcode='42501'; end if;

  -- Fail closed for unknown future columns. Stable identity, role, email,
  -- system_id and creation fields are not ordinary profile-edit fields.
  if (to_jsonb(new)-array['full_name','first_name','middle_name','last_name','suffix',
      'contact_number','purok','photo_url','id_document_url','verification_status',
      'verified_by','verified_at','verification_notes']) is distinct from
     (to_jsonb(old)-array['full_name','first_name','middle_name','last_name','suffix',
      'contact_number','purok','photo_url','id_document_url','verification_status',
      'verified_by','verified_at','verification_notes']) then
    raise exception 'Protected account fields cannot be edited' using errcode='42501';
  end if;
  v_name_changed := row(new.full_name,new.first_name,new.middle_name,new.last_name,new.suffix)
    is distinct from row(old.full_name,old.first_name,old.middle_name,old.last_name,old.suffix);
  v_identity_changed := v_name_changed or new.id_document_url is distinct from old.id_document_url;
  v_verification_changed := row(new.verification_status,new.verified_by,new.verified_at,new.verification_notes)
    is distinct from row(old.verification_status,old.verified_by,old.verified_at,old.verification_notes);

  if v_admin then
    if new.verification_status not in ('pending','verified','rejected','ineligible') or new.verification_status is null then
      raise exception 'Unsupported verification status' using errcode='22023';
    end if;
    if v_verification_changed then
      -- Existing clients may send stamps; never trust their actor or clock.
      new.verified_by := case when new.verification_status='pending' then null else v_actor end;
      new.verified_at := case when new.verification_status='pending' then null else now() end;
    end if;
    return new;
  end if;

  v_resubmit := v_owner and old.role='resident' and new.verification_status='pending'
    and old.verification_status in ('pending','rejected','verified')
    and (old.verification_status<>'pending' or v_name_changed or new.id_document_url is distinct from old.id_document_url)
    and new.verified_by is not distinct from old.verified_by
    and new.verified_at is not distinct from old.verified_at
    and (new.verification_notes is not distinct from old.verification_notes or new.verification_notes is null);
  if v_verification_changed and not coalesce(v_resubmit,false) then
    raise exception 'Verification decisions and metadata require authorized records staff' using errcode='42501';
  end if;
  if old.role='resident' and v_identity_changed and old.verification_status='ineligible' then
    raise exception 'Ineligible identity changes require records staff review' using errcode='42501';
  end if;
  if coalesce(v_resubmit,false) or (old.role='resident' and v_identity_changed and old.verification_status='verified') then
    new.verification_status := 'pending';
    new.verified_by := null;
    new.verified_at := null;
    new.verification_notes := case when v_name_changed and old.verification_status='verified'
      then 'The name on this account was changed after it was verified. Please re-check it against the resident''s ID.'
      else null end;
  end if;
  return new;
end;
$$;
-- Trigger execution does not need a client EXECUTE grant.
revoke all on function public.prevent_role_self_change() from public,anon,authenticated,service_role;
commit;
