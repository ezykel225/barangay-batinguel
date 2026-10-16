-- ============================================================================
-- 041_complaint_evidence_storage.sql
-- ============================================================================
-- P3-A. PRIVATE COMPLAINT EVIDENCE STORAGE -- the bucket, its policies, the
-- one access predicate, and the metadata-recording RPC.
--
-- STATUS: APPLIED 2026-10-16 through the Supabase connector.
--
-- PURPOSE
-- -------
-- Split from migration 040 deliberately: a storage bucket plus its RLS
-- policies is independently reviewable, and keeping it separate means the
-- domain model and the evidence surface can be read and reverted on their
-- own. 040 must be applied first -- this file calls
-- public.complaint_is_visible_to_caller() and references
-- public.complaint_attachments.
--
-- WHAT WAS INSPECTED FIRST
-- ------------------------
-- Every existing bucket on this project, read live before choosing anything:
--
--   bucket            public  limit      allowed MIME
--   id-verification   false   5242880    image/jpeg, image/png, image/webp
--   official-photos   true    5242880    image/jpeg, image/png, image/webp
--   resident-photos   true    5242880    image/jpeg, image/png, image/webp
--
-- ⚠️ THERE IS NO VIDEO MIME TYPE ANYWHERE ON THIS PROJECT, and every bucket
-- is capped at 5 MB. The existing private bucket (id-verification) keys its
-- policies on (storage.foldername(name))[1] = auth.uid()::text for the
-- owner and is_official(auth.uid()) for staff.
--
-- EVIDENCE CLASS DECISION
-- -----------------------
-- ✅ PHOTO and DOCUMENT are supported: image/jpeg, image/png, image/webp and
--    application/pdf, at the project's established 5 MB ceiling.
--
-- ⚠️ VIDEO IS DEFERRED TO P3-B/P3-C, EXPLICITLY, AND IS NOT SILENTLY
--    ACCEPTED. Three measured reasons, not reluctance:
--      1. 5 MB is the ceiling every other bucket on this project uses, and a
--         few seconds of phone video exceeds it. Supporting video means
--         choosing a new, much larger limit -- a storage-cost and
--         upload-reliability decision nobody has made.
--      2. video/quicktime (what an iPhone produces by default) does not play
--         in a browser <video> on every platform. That is the exact reason
--         HEIC was excluded from the image buckets: a file that uploads
--         cleanly and then cannot be displayed during review is worse than a
--         refusal, and evidence that cannot be viewed is not evidence.
--      3. No upload component in this repository handles video, so a video
--         MIME type here would be a permission with no caller -- and could
--         not be tested through its real application path, which this
--         phase's own rule requires of a new surface.
--
-- ⚠️ THERE IS NO */* ALLOWLIST. allowed_mime_types is an explicit four-entry
--    array, and complaint_attachments carries the same four in a CHECK, so
--    the bucket and the metadata cannot disagree about what is storable.
--
-- SECURITY ASSUMPTIONS
-- --------------------
-- 1. PRIVATE BUCKET. public = false, so getPublicUrl() 404s on it even with
--    a permissive policy -- the gotcha CLAUDE.md already records. Access is
--    createSignedUrl() only, which checks the caller's SELECT policy before
--    minting a short-lived URL. ⚠️ The object path is never published: the
--    only surface returning it is complaint_attachments_for(), which is
--    itself gated on the visibility predicate.
-- 2. ⚠️ THE PREDICATE IS SECURITY DEFINER AND THAT IS REQUIRED, NOT
--    STYLISTIC. A storage policy is evaluated as the QUERYING role, so an
--    inline EXISTS against public.complaints would inherit that caller's own
--    view of complaints -- and an ordinary official, who sees zero complaint
--    rows, would then be refused for the wrong reason while a later change
--    to the complaints policy would silently change evidence access. The
--    same reason term_is_confirmed() and can_see_audience() are SECURITY
--    DEFINER.
-- 3. The path convention is '<complaint_id>/<file>', so the folder IS the
--    complaint id. ⚠️ The predicate validates the uuid shape itself rather
--    than casting in the policy: an object whose first folder is not a uuid
--    must evaluate FALSE, not raise 22P02, because a raise inside a policy
--    turns a denial into an error and tells the caller the path was parsed.
--
-- STORAGE AUTHORIZATION MATRIX
-- ----------------------------
--   caller                  | upload | read (signed URL) | update | delete
--   ------------------------+--------+-------------------+--------+--------
--   anon                    |  no    |        no         |  no    |  no
--   resident, own complaint  |  YES   |       YES         |  no    |  no
--   resident, other's        |  no    |        no         |  no    |  no
--   nurse                   |  no    |        no         |  no    |  no
--   Kagawad / SK / Treasurer|  no    |        no         |  no    |  no
--   Barangay Secretary      |  YES   |       YES         |  no    |  no
--   Punong Barangay         |  YES   |       YES         |  no    |  no
--   service_role            | bypasses RLS
--
-- ⚠️ NO UPDATE AND NO DELETE POLICY, DELIBERATELY. Evidence in a complaint
-- is not a profile photo. There is no normal client path that replaces or
-- destroys it, and migration 009's lesson means the consequence is known
-- rather than discovered: with no DELETE policy, storage.remove() matches
-- zero rows and reports success -- which is wrong when a flow promises
-- deletion and right here, because no flow does. A retention or withdrawal
-- process is a decision for the barangay (RA 10173 applies to photographic
-- evidence of real disputes) and is recorded as a deferred item, not
-- improvised.
--
-- ⚠️ NO `withdrawn_at` COLUMN was added to complaint_attachments either.
-- Nothing in P3-A could set it, and a column with no writer is the
-- displayLabels mistake -- a vocabulary written ahead of its consumers that
-- then drifts from the wording that actually shipped.
--
-- HOW THE LIVE APPLICATION WAS VERIFIED
-- -------------------------------------
-- Role impersonation against the live database inside always-aborting
-- blocks, plus a direct read of the bucket row and the policy catalog. The
-- full matrix is in the PR body. No object was uploaded to the bucket: it
-- holds 0 objects before and after.
-- ============================================================================


-- ── 1. The private bucket ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-evidence',
  'complaint-evidence',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;


-- ── 2. The ONE evidence access predicate ─────────────────────────────────────
--
-- Takes the full object name and answers one boolean about the caller. It
-- delegates to public.complaint_is_visible_to_caller(), so evidence access
-- and full-detail access are THE SAME RULE and cannot drift -- an ordinary
-- official who cannot read the narrative cannot read the photograph either,
-- by construction rather than by two policies agreeing.
create or replace function public.complaint_evidence_is_visible(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
DECLARE
  v_folder text;
BEGIN
  IF p_object_name IS NULL THEN
    RETURN false;
  END IF;

  v_folder := split_part(p_object_name, '/', 1);

  -- ⚠️ Shape-check, never a bare cast. A malformed path must be FALSE, not
  -- 22P02: an exception inside a storage policy turns a denial into an
  -- error, and an error that only fires for well-formed paths tells a
  -- prober that their path parsed.
  IF v_folder IS NULL
     OR v_folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN
    RETURN false;
  END IF;

  RETURN public.complaint_is_visible_to_caller(v_folder::uuid);
END;
$$;

comment on function public.complaint_evidence_is_visible(text) is
  'P3-A. Storage policy predicate for complaint-evidence. Delegates to '
  'complaint_is_visible_to_caller so evidence and detail share one rule.';


-- ── 3. Storage policies ──────────────────────────────────────────────────────
--
-- ⚠️ TO authenticated ONLY on both. anon is not named, so an anonymous
-- caller matches no policy on this bucket at all -- a guest tracking a
-- complaint reaches track_complaint() and never an object.
create policy "Complaint evidence is readable by its filer, the Secretary and the Punong Barangay"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'complaint-evidence'
    and public.complaint_evidence_is_visible(name)
  );

create policy "Complaint evidence is uploadable by its filer, the Secretary and the Punong Barangay"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'complaint-evidence'
    and public.complaint_evidence_is_visible(name)
  );


-- ── 4. Recording the metadata ────────────────────────────────────────────────
--
-- ⚠️ WHY THIS EXISTS IN P3-A RATHER THAN P3-B. The INSERT policy above lets
-- an authorized caller upload an object; without a metadata path the object
-- would exist with no row describing it -- an orphan, which is precisely
-- what migration 009 fixed for ID uploads. A surface where upload is
-- possible and recording is not would be incoherent, so the two land
-- together.
--
-- The server stamps uploaded_by and uploaded_at and derives media_kind from
-- the MIME type, so none of the three is forgeable. The caller supplies only
-- what it knows: which complaint, where the object landed, what it was
-- called, its type and its size.
create or replace function public.record_complaint_attachment(
  p_complaint_id     uuid,
  p_object_path      text,
  p_display_filename text,
  p_mime_type        text,
  p_byte_size        bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to attach evidence.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The same predicate as the storage policy and the detail reads. One
  -- rule, so an upload cannot be recorded against a complaint the caller
  -- may not see.
  IF NOT public.complaint_is_visible_to_caller(p_complaint_id) THEN
    RAISE EXCEPTION 'You cannot attach evidence to this complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The path must sit under this complaint's own folder, or a caller could
  -- record somebody else's object against their own complaint and read it
  -- through complaint_attachments_for().
  IF split_part(COALESCE(p_object_path, ''), '/', 1) <> p_complaint_id::text THEN
    RAISE EXCEPTION 'An evidence path must sit inside its own complaint folder.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derived, never supplied. The CHECK on the table enforces the pairing
  -- too, so a future caller cannot slip a mismatched kind past this.
  v_kind := CASE
    WHEN p_mime_type LIKE 'image/%'        THEN 'photo'
    WHEN p_mime_type = 'application/pdf'   THEN 'document'
    ELSE NULL
  END;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'That file type is not accepted as complaint evidence.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.complaint_attachments (
    complaint_id, object_path, display_filename, media_kind,
    mime_type, byte_size, uploaded_by
  ) VALUES (
    p_complaint_id, p_object_path,
    COALESCE(NULLIF(btrim(COALESCE(p_display_filename, '')), ''), 'evidence'),
    v_kind, p_mime_type, p_byte_size, v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

comment on function public.record_complaint_attachment(uuid,text,text,text,bigint) is
  'P3-A. Records evidence metadata after an authorized upload. uploaded_by, '
  'uploaded_at and media_kind are server-derived.';


-- ── 5. EXECUTE grants ────────────────────────────────────────────────────────
--
-- ⚠️ REVOKE FROM PUBLIC AND FROM anon ON BOTH. A new function is executable
-- by every role in the cluster until PUBLIC is revoked, and the default ACL
-- for `postgres in public` additionally names anon -- so revoking PUBLIC
-- alone leaves a surplus named grant, which is the one migration 039 had to
-- come back for. Both storage policies are TO authenticated, so anon has no
-- reason to execute either function.
revoke all on function public.complaint_evidence_is_visible(text) from public, anon;
revoke all on function public.record_complaint_attachment(uuid,text,text,text,bigint) from public, anon;

grant execute on function public.complaint_evidence_is_visible(text) to authenticated, service_role;
grant execute on function public.record_complaint_attachment(uuid,text,text,text,bigint) to authenticated, service_role;


-- ── 6. What this migration deliberately does NOT do ──────────────────────────
--
--   * No UPDATE and no DELETE policy on the bucket -- see the matrix above.
--   * No video MIME type and no raised size limit -- deferred with reasons.
--   * No upload component. P3-B builds the UI against this surface; the
--     policies here are what make that UI safe rather than the other way
--     round.
--   * No change to id-verification, official-photos or resident-photos, or
--     to any of their eleven existing policies.
-- ============================================================================
