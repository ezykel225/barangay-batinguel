-- Not applied. Extends private evidence; withdrawal retains the original for review.
begin;
-- Validate 041 before any DDL or bucket changes. Do not substitute policies.
do $prerequisites$
declare
  v_objects oid := pg_catalog.to_regclass('storage.objects');
  v_authenticated oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
  v_policy record;
  v_expression text;
begin
  if pg_catalog.to_regclass('storage.buckets') is null or v_objects is null then
    raise exception '050 prerequisite missing: Storage tables from migration 041 are required.';
  end if;
  if (select count(*) from storage.buckets where id = 'complaint-evidence') <> 1 then
    raise exception '050 prerequisite missing: exactly one complaint-evidence bucket from migration 041 is required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class where oid = v_objects and relrowsecurity) then
    raise exception '050 prerequisite invalid: Storage objects must have RLS enabled.';
  end if;
  for v_policy in
    select * from (values
      ('Complaint evidence is readable by its filer, the Secretary and the Punong Barangay', 'r'),
      ('Complaint evidence is uploadable by its filer, the Secretary and the Punong Barangay', 'a')
    ) as required(policy_name, command)
  loop
    select pg_catalog.pg_get_expr(case when p.polcmd = 'r' then p.polqual else p.polwithcheck end, p.polrelid)
      into v_expression
    from pg_catalog.pg_policy p
    -- Policy identifiers in 041 exceed PostgreSQL's 63-byte identifier limit.
    where p.polrelid = v_objects and p.polname = v_policy.policy_name::name
      and p.polcmd::text = v_policy.command and p.polpermissive
      and p.polroles = array[v_authenticated]
      and ((p.polcmd = 'r' and p.polwithcheck is null) or (p.polcmd = 'a' and p.polqual is null))
      and exists (select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_policy'::regclass and d.objid = p.oid
          and d.refclassid = 'pg_catalog.pg_proc'::regclass
          and d.refobjid = pg_catalog.to_regprocedure('public.complaint_evidence_is_visible(text)'));
    -- pg_get_expr can add parentheses, whitespace, public qualification and text casts.
    if v_expression is null or pg_catalog.regexp_replace(
      pg_catalog.replace(pg_catalog.replace(v_expression, 'public.', ''), '::text', ''),
      '[[:space:]()]', '', 'g') <> 'bucket_id=''complaint-evidence''ANDcomplaint_evidence_is_visiblename' then
      raise exception '050 prerequisite missing or invalid: authenticated Storage policy "%" must match migration 041.', v_policy.policy_name;
    end if;
  end loop;
end;
$prerequisites$;

alter table public.complaint_attachments
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references public.profiles(id),
  add column withdrawal_reason text,
  drop constraint complaint_attachments_media_kind_check,
  drop constraint complaint_attachments_mime_check,
  drop constraint complaint_attachments_byte_size_check,
  drop constraint complaint_attachments_kind_matches_mime,
  add constraint complaint_attachments_media_kind_check check (media_kind in ('photo','document','video')),
  add constraint complaint_attachments_mime_check check (mime_type in
    ('image/jpeg','image/png','image/webp','application/pdf','text/plain','video/mp4','video/webm')),
  add constraint complaint_attachments_byte_size_check check (byte_size > 0 and byte_size <= 26214400),
  add constraint complaint_attachments_kind_matches_mime check (
    (media_kind = 'photo' and mime_type in ('image/jpeg','image/png','image/webp')) or
    (media_kind = 'document' and mime_type in ('application/pdf','text/plain')) or
    (media_kind = 'video' and mime_type in ('video/mp4','video/webm')));

update storage.buckets set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','text/plain','video/mp4','video/webm']
where id = 'complaint-evidence';

-- Private append-only audit; never publish these events in the shared activity log.
create table public.case_support_events (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  event_kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.case_support_events enable row level security;
revoke all on public.case_support_events from public, anon, authenticated;

create or replace function public.record_complaint_attachment(
  p_complaint_id uuid, p_object_path text, p_display_filename text, p_mime_type text, p_byte_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_kind text;
begin
  if auth.uid() is null or not public.complaint_is_visible_to_caller(p_complaint_id) then
    raise exception 'Evidence access denied';
  end if;
  if split_part(coalesce(p_object_path,''), '/', 1) <> p_complaint_id::text then
    raise exception 'Invalid complaint folder';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'complaint-evidence' and o.name = p_object_path) then
    raise exception 'Upload the evidence before registering it';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'complaint-evidence' and o.name = p_object_path
    and o.metadata->>'mimetype' = p_mime_type and (o.metadata->>'size')::bigint = p_byte_size) then
    raise exception 'Evidence metadata does not match the stored object';
  end if;
  v_kind := case when p_mime_type in ('image/jpeg','image/png','image/webp') then 'photo'
    when p_mime_type in ('application/pdf','text/plain') then 'document'
    when p_mime_type in ('video/mp4','video/webm') then 'video' end;
  if v_kind is null then raise exception 'Unsupported evidence type'; end if;
  insert into public.complaint_attachments(complaint_id,object_path,display_filename,media_kind,mime_type,byte_size,uploaded_by)
  values(p_complaint_id,p_object_path,coalesce(nullif(btrim(p_display_filename),''),'evidence'),v_kind,p_mime_type,p_byte_size,auth.uid())
  returning id into v_id;
  insert into public.case_support_events(complaint_id,event_kind,detail,actor_id)
  values(p_complaint_id,'evidence_uploaded',jsonb_build_object('attachment_id',v_id),auth.uid());
  return v_id;
end; $$;

create or replace function public.withdraw_complaint_evidence(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_complaint uuid;
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A withdrawal reason is required'; end if;
  update public.complaint_attachments set withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawal_reason = btrim(p_reason)
  where id = p_attachment_id and withdrawn_at is null returning complaint_id into v_complaint;
  if v_complaint is null then raise exception 'Evidence unavailable'; end if;
  insert into public.case_support_events(complaint_id,event_kind,detail,actor_id)
  values(v_complaint,'evidence_withdrawn',jsonb_build_object('attachment_id',p_attachment_id,'reason',btrim(p_reason)),auth.uid());
end; $$;

create or replace function public.complaint_evidence_is_visible(p_object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_folder text := split_part(p_object_name,'/',1);
begin
  if v_folder is null or v_folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  return public.complaint_is_visible_to_caller(v_folder::uuid)
    and not exists(select 1 from public.complaint_attachments a where a.object_path = p_object_name and a.withdrawn_at is not null);
end; $$;

create or replace function public.complaint_attachments_for(p_complaint_id uuid)
returns table(id uuid,object_path text,display_filename text,media_kind text,mime_type text,byte_size bigint,uploaded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id,a.object_path,a.display_filename,a.media_kind,a.mime_type,a.byte_size,a.uploaded_at
  from public.complaint_attachments a where a.complaint_id = p_complaint_id
    and public.complaint_is_visible_to_caller(p_complaint_id) and a.withdrawn_at is null order by a.uploaded_at;
$$;

create function public.case_support_history(p_complaint_id uuid)
returns table(id uuid,event_kind text,detail jsonb,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id,e.event_kind,e.detail,e.created_at from public.case_support_events e
  where e.complaint_id = p_complaint_id and public.current_official_may_administer_records()
  order by e.created_at,e.id;
$$;
revoke all on function public.record_complaint_attachment(uuid,text,text,text,bigint) from public, anon;
revoke all on function public.withdraw_complaint_evidence(uuid,text) from public, anon;
revoke all on function public.complaint_evidence_is_visible(text) from public, anon;
revoke all on function public.complaint_attachments_for(uuid) from public, anon;
revoke all on function public.case_support_history(uuid) from public, anon;
grant execute on function public.record_complaint_attachment(uuid,text,text,text,bigint),
  public.withdraw_complaint_evidence(uuid,text),public.complaint_evidence_is_visible(text),
  public.complaint_attachments_for(uuid),public.case_support_history(uuid) to authenticated;
commit;
