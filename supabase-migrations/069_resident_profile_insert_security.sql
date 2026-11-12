-- PREPARED ONLY. NOT EXECUTED. Complements the reviewed 068 UPDATE correction.
-- Apply only after current cloud INSERT policies/grants/defaults and Auth signup
-- trigger bodies have been privately reviewed and isolated validation passes.
-- No Docker/local PostgreSQL dependency. No backfill or Auth trigger replacement.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regclass('public.profiles') is null then
    raise exception '069 requires the existing profiles table';
  end if;
  if not exists(select 1 from pg_class where oid='public.profiles'::regclass and relrowsecurity) then
    raise exception '069 requires profiles RLS';
  end if;
  if to_regprocedure('public.prevent_role_self_change()') is null then
    raise exception '069 requires reviewed migration 068 first';
  end if;
  -- Dependency marker only, not a replacement for private definition/hash review.
  if position('Verification decisions and metadata require authorized records staff'
      in pg_get_functiondef('public.prevent_role_self_change()'::regprocedure))=0 then
    raise exception '069 requires reviewed migration 068 first';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles'
      and column_name in ('id','role','verification_status','verified_by','verified_at','verification_notes'))<>6 then
    raise exception '069 profile verification columns require review';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='profiles'
      and cmd='INSERT' and policyname='Users can insert their own resident profile')<>1
    or exists(select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and cmd in ('INSERT','ALL') and policyname<>'Users can insert their own resident profile') then
    raise exception '069 unexpected profile INSERT/ALL policies; stop and review';
  end if;
end;
$preflight$;

-- Preserve the policy's existing roles/permissiveness and legitimate pending
-- registration. Defaults alone never constrain an explicit client INSERT.
alter policy "Users can insert their own resident profile" on public.profiles
  with check (
    auth.uid() is not null and auth.uid()=id and role='resident'
    and verification_status='pending'
    and verified_by is null and verified_at is null and verification_notes is null
  );

-- INSERT ... ON CONFLICT DO UPDATE is not a bypass: INSERT candidates must pass
-- INSERT RLS, while conflict updates remain subject to UPDATE RLS/068's guard.
-- Actual PostgREST upsert behavior must be exercised in the isolated JWT matrix.
-- Trusted signup/service SQL can bypass RLS by design; audit those writers and
-- ensure their pending defaults explicitly. This patch does not constrain them.
commit;
