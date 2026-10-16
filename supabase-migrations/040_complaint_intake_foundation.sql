-- ============================================================================
-- 040_complaint_intake_foundation.sql
-- ============================================================================
-- P3-A. COMPLAINT INTAKE FOUNDATION -- data model, public reference, role
-- matrix, read surfaces and the guest tracking RPC.
--
-- STATUS: APPLIED 2026-10-16 through the Supabase connector.
--
-- PURPOSE
-- -------
-- The first implementation phase of the Complaint / Incident / KP expansion.
-- It creates the four intake tables, a non-sequential public reference, two
-- creation RPCs (resident-online and Secretary-walk-in), three narrow detail
-- read RPCs, a safe queue RPC for ordinary officials, and a guest tracking
-- RPC. Storage for evidence is migration 041; it is split off because a
-- bucket plus its policies is independently reviewable.
--
-- ⚠️ THIS MIGRATION BUILDS NO SCREENING, NO KP CASE, NO HEARING, NO SUMMONS,
-- NO SETTLEMENT, NO INCIDENT, NO BLOTTER, NO TANOD TABLE, NO CAPABILITY
-- TABLE, NO PUROK TABLE AND NO NOTIFICATIONS. Each belongs to a later phase.
--
-- SECURITY ASSUMPTIONS
-- --------------------
-- 1. The publishable key ships inside the JS bundle, so a React check is not
--    a control. Every rule below is enforced in the database.
-- 2. RLS filters ROWS. It cannot restrict COLUMNS. Ordinary officials must
--    see a queue but must NOT see the narrative or anybody's contact number,
--    so the queue is a SECURITY DEFINER function returning a fixed narrow
--    column list -- NOT a SELECT policy on the base table. Widening a row
--    policy to serve a column need is the mistake this avoids.
-- 3. Identity resolves through the MASTER-A chain and nothing else:
--      auth.uid() -> profiles.id -> official_account_links.profile_id
--                 -> barangay_officials.id -> barangay_officials.position
--    ⚠️ NO authorization here reads full_name. NO authorization here reads
--    barangay_officials.committee. See the committee note below.
-- 4. ⚠️ COMMITTEE IS DESCRIPTIVE DATA, NOT AUTHORIZATION DATA. P2.5 measured
--    that `barangay_officials.committee` is free text with no CHECK, is sent
--    by the Edit Official form for any row, is permitted by the directory
--    UPDATE policy for ANY official, and is NOT guarded by
--    protect_official_record() -- which guards only `position`, `created_at`
--    and `created_by`. A real "Peace and Order and Appropriation" value
--    exists. Authorizing on it would reproduce migration 028's escalation on
--    a column nobody has protected, so this migration does not read it and
--    neither may any later one until it is guarded and given a closed
--    vocabulary. The Peace and Order Kagawad therefore gets NO special
--    authorization in P3-A; that is a capability-table phase, not this one.
-- 5. Creation is RPC-only. The four tables carry NO INSERT, UPDATE or DELETE
--    policy and no client DML privilege, so a forged row is refused at the
--    privilege layer (42501) before RLS is consulted -- migration 019A's
--    two-barrier pattern. A caller cannot supply reference, status,
--    filed_by_profile_id, encoded_by, created_at or the history actor,
--    because they are not parameters of either creation RPC.
--
-- ROLE MATRIX (what this migration establishes)
-- --------------------------------------------
--   role                | queue | full detail | create online | create walk-in
--   --------------------+-------+-------------+---------------+---------------
--   anon                |  no   |     no      |      no       |      no
--   resident            |  no   |  OWN only   |     YES       |      no
--   nurse               |  no   |     no      |      no       |      no
--   Kagawad / SK        | YES   |     no      |      no       |      no
--   Barangay Treasurer  | YES   |     no      |      no       |      no
--   Barangay Secretary  | YES   |    YES      |      no       |     YES
--   Punong Barangay     | YES   |    YES      |      no       |      no
--   service_role        | bypasses RLS (administrative access preserved)
--
--   anon additionally reaches track_complaint(reference, contact) and nothing
--   else. The nurse reaches nothing at all.
--
-- ⚠️ The Treasurer is deliberately an ORDINARY official here. No existing
-- proven position requirement gives the Treasurer anything on complaints;
-- her exclusive write is `reservations` (migration 031) and that is unchanged.
--
-- HOW THE LIVE APPLICATION WAS VERIFIED
-- -------------------------------------
-- Role impersonation against the live database, each probe as the real
-- account with its own JWT claims inside a block that always ends in
-- RAISE EXCEPTION, so Postgres undoes every statement. The matrix, the
-- forgery attempts, the tracking-oracle checks and the MASTER-A / MASTER-B
-- regression are recorded in the PR body and in CLAUDE.md. Live counts
-- before and after: complaints 0 -> 0, parties 0 -> 0, attachments 0 -> 0,
-- history 0 -> 0. No probe row persisted.
-- ============================================================================


-- ── 1. The reference generator ───────────────────────────────────────────────
--
-- CMP-2026-AB12CD. Deliberately mirrors generate_reservation_reference()
-- (migration 024) rather than generalizing it: generalizing would mean
-- replacing an applied, verified function that the reservation reference
-- trigger depends on, which is a change to a working security surface for no
-- behavioural gain -- the same reasoning migration 021 used when it declined
-- to restate the 8-hour cap.
--
-- ⚠️ RANDOM, NEVER SEQUENTIAL. A sequential public number tells anybody
-- holding one that the neighbouring numbers exist, which turns the tracking
-- page into a directory of other people's complaints. For a complaint that
-- is worse than for a booking: the neighbouring record names a neighbour.
--
-- Crockford base32 with I, L, O and U removed, so there is no character a
-- reader can confuse; normalize_reservation_reference() maps the look-alikes
-- back on lookup, so an O read for a zero still finds the complaint.
--
-- ⚠️ The prefix is CMP-, not BC-anything. BCR- is the court reservation, and
-- two references sharing a two-character prefix is a hazard when somebody
-- reads one out over the phone.
create or replace function public.generate_complaint_reference(p_year int)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
DECLARE
  k_alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_body text; v_bytes bytea; i int;
BEGIN
  v_body := '';
  v_bytes := extensions.gen_random_bytes(6);
  FOR i IN 0..5 LOOP
    v_body := v_body || substr(k_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN 'CMP-' || p_year::text || '-' || v_body;
END;
$$;

comment on function public.generate_complaint_reference(int) is
  'P3-A. Random CMP-YYYY-XXXXXX public complaint reference. Never sequential. '
  'Internal: no client EXECUTE -- reached only through the stamping trigger.';


-- ── 2. The stamping trigger ──────────────────────────────────────────────────
--
-- ⚠️ SERVER-SIDE, AND NEVER TRUSTED FROM THE CLIENT. The reference is not a
-- parameter of either creation RPC and this trigger overwrites whatever is in
-- the row -- 015's pattern, where what the client sent is discarded rather
-- than validated. Collision is handled by retry against the UNIQUE index, ten
-- attempts, then a raise rather than a silent duplicate.
create or replace function public.stamp_complaint_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_year int; v_candidate text; v_attempt int := 0;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_complaint_reference(v_year);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.complaints c WHERE c.reference = v_candidate
    );
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Could not allocate a unique complaint reference after % attempts', v_attempt
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  NEW.reference := v_candidate;
  RETURN NEW;
END;
$$;

comment on function public.stamp_complaint_reference() is
  'P3-A. BEFORE INSERT on complaints. Discards any client-supplied reference '
  'and stamps a random one, retrying on collision.';


-- ── 3. complaints ────────────────────────────────────────────────────────────
create table if not exists public.complaints (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null,

  -- online  = an authenticated resident filed it themselves
  -- walk_in = the Barangay Secretary encoded it at the hall
  intake_channel       text not null,

  category             text not null,
  narrative            text not null,
  status               text not null default 'received',

  -- ⚠️ A FREE-TEXT SNAPSHOT, NOT A PUROK FOREIGN KEY. P2 established that
  -- the official Barangay Batinguel purok list is not confirmed -- no entry
  -- in the current constant has a documentary source, Purok 7's only
  -- evidence post-dates the commit that added it to the dropdown, and 17
  -- off-list values sit in the live data. Until the barangay confirms the
  -- list there is nothing canonical to reference, so this column holds
  -- whatever was recorded and asserts nothing. It is deliberately NOT named
  -- `purok`, so nobody later mistakes it for one.
  location_note        text,

  -- The account that filed it, when one did. NULL for a walk-in.
  filed_by_profile_id  uuid references public.profiles(id) on delete restrict,
  -- The official who encoded it. NULL for an online filing.
  encoded_by           uuid references public.profiles(id) on delete restrict,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint complaints_reference_unique unique (reference),

  -- ⚠️ CLOSED VOCABULARIES, the convention every other status column in this
  -- schema follows (profiles_role_check, document_requests_status_check,
  -- activity_log_action_check). A category table was considered and rejected
  -- for the same reason complaint_categories is not in this phase: a lookup
  -- table for eight words is the inconsistent choice here.
  constraint complaints_intake_channel_check
    check (intake_channel = any (array['online','walk_in'])),

  -- The professor's initial eight.
  constraint complaints_category_check
    check (category = any (array[
      'noise','unpaid_debt','boundary_dispute','physical_altercation',
      'theft','threats','family_dispute','other'])),

  -- ⚠️ ONE VALUE, DELIBERATELY. P3-A is intake: a complaint is received and
  -- nothing in this migration can move it. Screening, referral and case
  -- stages are P4, and each will widen this CHECK -- widening is safe, and
  -- a CHECK is revalidated on every UPDATE so NARROWING it later would make
  -- history un-editable. Adding values nothing can reach would be the
  -- displayLabels mistake: a vocabulary written ahead of its consumers.
  constraint complaints_status_check
    check (status = any (array['received'])),

  -- Exactly one of the two provenance columns, matching the channel. This is
  -- what makes "who filed this" answerable from the row rather than inferred.
  constraint complaints_channel_matches_source
    check (
      (intake_channel = 'online'  and filed_by_profile_id is not null and encoded_by is null)
      or
      (intake_channel = 'walk_in' and encoded_by is not null)
    ),

  constraint complaints_narrative_present check (btrim(narrative) <> '')
);

create index if not exists complaints_status_created_idx
  on public.complaints (status, created_at desc);
create index if not exists complaints_filed_by_idx
  on public.complaints (filed_by_profile_id);

comment on table public.complaints is
  'P3-A complaint intake. Reference is server-stamped and random. '
  'location_note is a free-text snapshot, NOT a purok reference -- the '
  'official purok list is unconfirmed (see P2).';

-- ⚠️ No `DROP TRIGGER IF EXISTS` in front of this. The Supabase connector
-- treats DROP TRIGGER as a destructive statement and the call times out
-- waiting for a confirmation that never arrives (migration 024's header,
-- re-measured in X5 and again in A2). The table is created by this same
-- migration, so the trigger cannot pre-exist and the guard is unnecessary.
create trigger trg_stamp_complaint_reference
  before insert on public.complaints
  for each row execute function public.stamp_complaint_reference();


-- ── 4. complaint_parties ─────────────────────────────────────────────────────
--
-- ⚠️ A PARTY IS NEVER FORCED TO HAVE AN ACCOUNT. Three shapes are supported
-- and the third is the common one:
--   A. an authenticated resident      -> profile_id set
--   B. a voter-reference-only person  -> registry_entry_id set
--   C. a named person with neither    -> snapshot columns only
--
-- ⚠️ NOTHING IS CREATED TO MAKE A LINK EXIST. Being named in a complaint
-- does not create a profile and does not create a residents_registry row --
-- the second would corrupt the one voter dataset the barangay actually has,
-- which is the exact circularity "never add somebody to the voter reference
-- data in order to verify them" already forbids.
--
-- ⚠️ AND NO NAME MATCHING. There is no fuzzy match, no normalised-name
-- lookup and no attempt to resolve a snapshot to a profile. The project's
-- own worked cases say why: `Frankie Sia Credo` vs `Hon. Frankie Credo` is
-- one person a matcher would miss, and `Catherine Lacson Tan` vs
-- `Alexis Theress P. Tan` is two people sharing a surname and an office that
-- a matcher would wrongly join. A complaint that quietly asserts a false
-- identity is worse than one that asserts none.
create table if not exists public.complaint_parties (
  id                      uuid primary key default gen_random_uuid(),
  complaint_id            uuid not null references public.complaints(id) on delete restrict,
  party_role              text not null,

  profile_id              uuid references public.profiles(id) on delete restrict,
  registry_entry_id       uuid references public.residents_registry(id) on delete restrict,

  -- What was recorded AT FILING TIME, kept even when a link exists: the
  -- complaint should still read the way it was taken down if the linked
  -- record is later corrected.
  full_name_snapshot      text not null,
  contact_number_snapshot text,
  address_note            text,

  created_at              timestamptz not null default now(),

  constraint complaint_parties_role_check
    check (party_role = any (array['complainant','respondent','witness'])),
  constraint complaint_parties_name_present
    check (btrim(full_name_snapshot) <> '')
);

-- One complainant per complaint, enforced in the database rather than by
-- convention: "who filed this" must have exactly one answer.
create unique index if not exists complaint_parties_one_complainant_idx
  on public.complaint_parties (complaint_id)
  where party_role = 'complainant';

create index if not exists complaint_parties_complaint_idx
  on public.complaint_parties (complaint_id);

comment on table public.complaint_parties is
  'P3-A. Complainant, respondents and witnesses. Links are optional; '
  'snapshots preserve what was recorded at filing. No name matching.';


-- ── 5. complaint_status_history ──────────────────────────────────────────────
--
-- ⚠️ APPEND-ONLY AT BOTH LAYERS, which is what activity_log took until
-- migration 035 to achieve: no UPDATE or DELETE policy AND no client UPDATE
-- or DELETE privilege. A client cannot rewrite a historical row, and the
-- refusal is 42501 from the privilege layer rather than RLS's silent zero
-- rows.
--
-- This is the AUTHORITATIVE domain history for a complaint. See the
-- activity_log note at the end of this file for why it is not duplicated
-- there.
create table if not exists public.complaint_status_history (
  id               uuid primary key default gen_random_uuid(),
  complaint_id     uuid not null references public.complaints(id) on delete restrict,

  -- NULL on the initial filing row: the complaint came from no status.
  from_status      text,
  to_status        text not null,

  -- The account that caused the transition. NULL is possible for a future
  -- system-driven transition; nothing in P3-A writes NULL.
  actor_profile_id uuid references public.profiles(id) on delete restrict,

  -- ⚠️ NON-SENSITIVE ONLY. No name, no narrative, no contact number and no
  -- evidence filename goes in here.
  note             text,

  created_at       timestamptz not null default now(),

  constraint complaint_status_history_to_status_check
    check (to_status = any (array['received'])),
  constraint complaint_status_history_from_status_check
    check (from_status is null or from_status = any (array['received']))
);

create index if not exists complaint_status_history_complaint_idx
  on public.complaint_status_history (complaint_id, created_at);

comment on table public.complaint_status_history is
  'P3-A. Append-only complaint transitions. The authoritative domain '
  'history; activity_log is deliberately not widened for it.';


-- ── 6. complaint_attachments ─────────────────────────────────────────────────
--
-- Metadata only. The bytes live in the private complaint-evidence bucket
-- created by migration 041, and the object path is never published.
create table if not exists public.complaint_attachments (
  id               uuid primary key default gen_random_uuid(),
  complaint_id     uuid not null references public.complaints(id) on delete restrict,

  -- The storage object path, '<complaint_id>/<file>'. UNIQUE so one object
  -- cannot be recorded twice.
  object_path      text not null,
  display_filename text not null,
  media_kind       text not null,
  mime_type        text not null,
  byte_size        bigint not null,

  uploaded_by      uuid references public.profiles(id) on delete restrict,
  uploaded_at      timestamptz not null default now(),

  constraint complaint_attachments_object_path_unique unique (object_path),

  -- ⚠️ NO 'video' YET, AND THAT IS THE DECISION RATHER THAN AN OVERSIGHT.
  -- Every existing bucket on this project is capped at 5 MB and permits only
  -- image/jpeg, image/png and image/webp -- there is no video MIME type
  -- anywhere. A few seconds of phone video exceeds 5 MB, and video/quicktime
  -- does not play in a browser <video> on every platform, which is the exact
  -- reason HEIC was excluded from the image buckets: a file that uploads
  -- cleanly and then cannot be displayed during review is worse than a
  -- refusal. Supporting video needs a larger limit and a codec decision, and
  -- that is reported as a P3-B/P3-C follow-up rather than silently accepting
  -- arbitrary files. ⚠️ There is no */* allowlist anywhere here.
  constraint complaint_attachments_media_kind_check
    check (media_kind = any (array['photo','document'])),
  constraint complaint_attachments_mime_check
    check (mime_type = any (array[
      'image/jpeg','image/png','image/webp','application/pdf'])),
  -- 5 MB, the same ceiling every other bucket on this project uses.
  constraint complaint_attachments_byte_size_check
    check (byte_size > 0 and byte_size <= 5242880),
  constraint complaint_attachments_kind_matches_mime
    check (
      (media_kind = 'photo'    and mime_type like 'image/%')
      or
      (media_kind = 'document' and mime_type = 'application/pdf')
    )
);

create index if not exists complaint_attachments_complaint_idx
  on public.complaint_attachments (complaint_id);

comment on table public.complaint_attachments is
  'P3-A. Evidence metadata. Private bucket only; the object path is never '
  'published and getPublicUrl() does not work on it.';


-- ── 7. The ONE visibility predicate ─────────────────────────────────────────
--
-- ⚠️ EVERY full-detail authorization decision in this subsystem resolves
-- here, and nowhere else. Four copies of a rule is four places for it to
-- drift -- the objection migration 031 made when it replaced four inline
-- name joins with current_official_holds_position(). The `complaints` SELECT
-- policy, all three detail RPCs, the attachment-recording RPC and (in
-- migration 041) the storage policies all call this one function.
--
-- True for exactly three callers:
--   * the resident who filed the complaint;
--   * the Barangay Secretary;
--   * the Punong Barangay.
--
-- ⚠️ ORDINARY OFFICIALS ARE FALSE HERE, INCLUDING THE TREASURER AND THE
-- PEACE AND ORDER KAGAWAD. They reach the queue and nothing else.
--
-- SECURITY DEFINER is required, not stylistic: it is called from an RLS
-- policy and from storage policies, where an inline EXISTS would inherit the
-- caller's own view of complaints, profiles and official_account_links -- so
-- changing one of those policies later would silently change what is
-- visible. The same reason term_is_confirmed() and can_see_audience() are
-- SECURITY DEFINER. It answers ONE boolean about auth.uid() and returns no
-- row, so it leaks nothing about the mapping it reads.
create or replace function public.complaint_is_visible_to_caller(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaints c
    WHERE c.id = p_complaint_id
      AND (
        -- The filing resident, their own complaint only. The role test is a
        -- narrowing: an account that is no longer a resident stops reading
        -- it through this branch.
        (
          c.filed_by_profile_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'resident'
          )
        )
        OR public.current_official_holds_position('Barangay Secretary')
        OR public.current_official_holds_position('Punong Barangay')
      )
  );
$$;

comment on function public.complaint_is_visible_to_caller(uuid) is
  'P3-A. The ONE full-detail authorization predicate: filing resident, '
  'Barangay Secretary, Punong Barangay. Ordinary officials are false.';


-- ── 8. RLS and privileges ────────────────────────────────────────────────────
--
-- ⚠️ TWO BARRIERS, NOT ONE. Supabase grants anon and authenticated full DML
-- on a new public table by default (pg_default_acl for `postgres in public`
-- reads anon=arwdDxtm | authenticated=arwdDxtm), so absent policies alone
-- would be the ONLY thing stopping a write. Revoking as well means a forged
-- row is refused at the privilege layer first -- 42501, not RLS's silent
-- zero rows. 019A's pattern, and the same shape notifications uses.
alter table public.complaints              enable row level security;
alter table public.complaint_parties       enable row level security;
alter table public.complaint_status_history enable row level security;
alter table public.complaint_attachments   enable row level security;

revoke all on table public.complaints               from anon, authenticated;
revoke all on table public.complaint_parties        from anon, authenticated;
revoke all on table public.complaint_status_history from anon, authenticated;
revoke all on table public.complaint_attachments    from anon, authenticated;

-- ⚠️ SELECT on `complaints` ONLY, and only for authenticated. anon holds
-- nothing on any of the four tables and must never: a guest reaches
-- track_complaint() and nothing else.
grant select on table public.complaints to authenticated;

-- ⚠️ The other three tables carry NO client privilege and NO policy at all.
-- Every read of a party, a transition or an attachment goes through a
-- SECURITY DEFINER function with the one predicate in it, so there is no
-- column-level problem to solve with a row-level tool: a resident must see
-- their own contact number but not the respondent's, which no SELECT policy
-- can express.
create policy "Complaint detail is visible to its filer, the Secretary and the Punong Barangay"
  on public.complaints
  for select
  to authenticated
  using (public.complaint_is_visible_to_caller(id));

-- ⚠️ No INSERT, UPDATE or DELETE policy on any of the four, deliberately and
-- permanently for P3-A. Creation is the two RPCs below; nothing in this phase
-- updates or deletes a complaint, a party, a transition or an attachment.


-- ── 9. Online resident filing ────────────────────────────────────────────────
--
-- ⚠️ AN RPC, NOT A TABLE INSERT, AND THE REASON IS MEASURED. PostgREST's
-- .insert().select() is INSERT ... RETURNING, which needs SELECT on the
-- inserted row -- and the row's own visibility predicate is satisfied here,
-- but the parties and history rows have no SELECT policy at all, so a
-- multi-table filing cannot be done over the table API. Migration 024 hit
-- the same wall for guest bookings and reached the same answer. The RPC is
-- also STRICTER than a policy could be: reference, status,
-- filed_by_profile_id, encoded_by, created_at and the history actor are not
-- parameters, so there is nothing to forge.
--
-- Returns the reference and nothing else -- the client needs it to track the
-- complaint and needs nothing further.
create or replace function public.file_complaint_as_resident(
  p_category      text,
  p_narrative     text,
  p_location_note text,
  p_respondents   jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_complaint_id uuid;
  v_reference text;
  v_item jsonb;
  v_name text;
BEGIN
  -- ⚠️ Refuse an unauthenticated caller outright. anon holds no EXECUTE on
  -- this function either, so this is the second barrier rather than the only
  -- one.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to file a complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id, p.role, p.full_name, p.contact_number
    INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No profile is linked to this account.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ Residents only. An official or the nurse filing "as a resident" would
  -- produce a complaint whose complainant is staff, and the Secretary
  -- already has the walk-in path. Refusing is the narrower answer.
  IF v_profile.role <> 'resident' THEN
    RAISE EXCEPTION 'Only a resident account can file an online complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(btrim(p_narrative), '') = '' THEN
    RAISE EXCEPTION 'A complaint needs a description of what happened.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.complaints (
    reference, intake_channel, category, narrative, status,
    location_note, filed_by_profile_id, encoded_by
  ) VALUES (
    -- Overwritten by trg_stamp_complaint_reference. Passed as a placeholder
    -- only because the column is NOT NULL; the client never supplies it.
    'PENDING', 'online', p_category, btrim(p_narrative), 'received',
    NULLIF(btrim(COALESCE(p_location_note, '')), ''), v_uid, NULL
  )
  RETURNING id, reference INTO v_complaint_id, v_reference;

  -- The complainant party, snapshotted from the account rather than from
  -- anything the caller sent: a resident cannot file under another name.
  INSERT INTO public.complaint_parties (
    complaint_id, party_role, profile_id,
    full_name_snapshot, contact_number_snapshot
  ) VALUES (
    v_complaint_id, 'complainant', v_uid,
    COALESCE(NULLIF(btrim(COALESCE(v_profile.full_name, '')), ''), 'Resident'),
    NULLIF(btrim(COALESCE(v_profile.contact_number, '')), '')
  );

  -- Respondents, 0..n. ⚠️ No respondent is REQUIRED: a noise complaint may
  -- not know who is responsible, and demanding a name would push people to
  -- invent one. Each supplied entry must carry a name; a blank one is
  -- refused rather than stored as an empty party.
  IF p_respondents IS NOT NULL AND jsonb_typeof(p_respondents) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_respondents) LOOP
      v_name := btrim(COALESCE(v_item->>'full_name', ''));
      IF v_name = '' THEN
        RAISE EXCEPTION 'A respondent was listed without a name.'
          USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.complaint_parties (
        complaint_id, party_role, full_name_snapshot,
        contact_number_snapshot, address_note
      ) VALUES (
        v_complaint_id, 'respondent', v_name,
        NULLIF(btrim(COALESCE(v_item->>'contact_number', '')), ''),
        NULLIF(btrim(COALESCE(v_item->>'address_note', '')), '')
      );
    END LOOP;
  END IF;

  -- NULL -> received. The actor is the caller's own uid, never a parameter.
  INSERT INTO public.complaint_status_history (
    complaint_id, from_status, to_status, actor_profile_id, note
  ) VALUES (
    v_complaint_id, NULL, 'received', v_uid, 'Filed online by the resident.'
  );

  RETURN v_reference;
END;
$$;

comment on function public.file_complaint_as_resident(text,text,text,jsonb) is
  'P3-A. Authenticated RESIDENT files their own complaint. Identity comes '
  'from auth.uid(); reference, status and actor are server-stamped.';


-- ── 10. Secretary walk-in encoding ───────────────────────────────────────────
--
-- ⚠️ THE DATABASE ENFORCES SECRETARY-ONLY. Not a hidden button: the
-- publishable key ships in the bundle, so the check has to be here. It
-- resolves through current_official_holds_position('Barangay Secretary'),
-- which is the same predicate the document_requests UPDATE policy uses and
-- which migration 031 proved returns false for the Treasurer, the Punong
-- Barangay and every Kagawad.
--
-- ⚠️ The Punong Barangay deliberately has NO second create path. He reads
-- full detail; P3-A gives him nothing to create. Adding a second creation
-- route would be two places for the stamping rules to drift.
create or replace function public.encode_walk_in_complaint(
  p_complainant_name    text,
  p_complainant_contact text,
  p_category            text,
  p_narrative           text,
  p_location_note       text,
  p_respondents         jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_complaint_id uuid;
  v_reference text;
  v_item jsonb;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to encode a walk-in complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.current_official_holds_position('Barangay Secretary') THEN
    RAISE EXCEPTION 'Only the Barangay Secretary can encode a walk-in complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(btrim(p_complainant_name), '') = '' THEN
    RAISE EXCEPTION 'A walk-in complaint needs the complainant''s name.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(btrim(p_narrative), '') = '' THEN
    RAISE EXCEPTION 'A complaint needs a description of what happened.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.complaints (
    reference, intake_channel, category, narrative, status,
    location_note, filed_by_profile_id, encoded_by
  ) VALUES (
    'PENDING', 'walk_in', p_category, btrim(p_narrative), 'received',
    NULLIF(btrim(COALESCE(p_location_note, '')), ''), NULL, v_uid
  )
  RETURNING id, reference INTO v_complaint_id, v_reference;

  -- ⚠️ A SNAPSHOT, AND NO ACCOUNT IS CREATED. A walk-in complainant usually
  -- has no profile, and being named in a complaint must never create one --
  -- nor a voter-reference row, which would corrupt the one dataset the
  -- barangay actually has.
  INSERT INTO public.complaint_parties (
    complaint_id, party_role, full_name_snapshot, contact_number_snapshot
  ) VALUES (
    v_complaint_id, 'complainant', btrim(p_complainant_name),
    NULLIF(btrim(COALESCE(p_complainant_contact, '')), '')
  );

  IF p_respondents IS NOT NULL AND jsonb_typeof(p_respondents) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_respondents) LOOP
      v_name := btrim(COALESCE(v_item->>'full_name', ''));
      IF v_name = '' THEN
        RAISE EXCEPTION 'A respondent was listed without a name.'
          USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.complaint_parties (
        complaint_id, party_role, full_name_snapshot,
        contact_number_snapshot, address_note
      ) VALUES (
        v_complaint_id, 'respondent', v_name,
        NULLIF(btrim(COALESCE(v_item->>'contact_number', '')), ''),
        NULLIF(btrim(COALESCE(v_item->>'address_note', '')), '')
      );
    END LOOP;
  END IF;

  INSERT INTO public.complaint_status_history (
    complaint_id, from_status, to_status, actor_profile_id, note
  ) VALUES (
    v_complaint_id, NULL, 'received', v_uid, 'Encoded at the barangay hall.'
  );

  RETURN v_reference;
END;
$$;

comment on function public.encode_walk_in_complaint(text,text,text,text,text,jsonb) is
  'P3-A. Barangay Secretary ONLY, enforced in the database. Encodes a '
  'walk-in complaint; encoded_by, reference and status are server-stamped.';


-- ── 11. The safe official queue ──────────────────────────────────────────────
--
-- ⚠️ ANY ACTIVE OFFICIAL MAY SEE THIS. It is the one complaint surface an
-- ordinary Kagawad reaches, and it is a function rather than a policy
-- because RLS filters rows and cannot restrict columns: the requirement is
-- "a queue without the narrative", which is a column rule.
--
-- ⚠️ CATEGORY IS DELIBERATELY OMITTED, AND THIS IS THE DECISION THE BRIEF
-- ASKED FOR. A queue row reading `family_dispute` or `threats` beside a date,
-- visible to all eleven officials in a barangay where everybody knows their
-- neighbours, is an accusation about an identifiable household: the date and
-- the channel are enough to work out who was at the hall that morning. The
-- project already draws this line -- reservations.purpose is officials-only
-- because residents write personal things in it, and exception_reason is
-- kept out of the public slot RPCs for the same reason. A coarse
-- "sensitivity band" was considered and rejected: a band that separates
-- interpersonal from property disputes still leaks the thing that matters.
-- An ordinary official needs to know how much work is waiting and how old it
-- is; the subject belongs to whoever handles it. Category is returned on the
-- full-detail path only.
--
-- Returned, and nothing else: id (a React key; useless without the detail
-- path, which checks position), reference, intake channel, status, and the
-- two dates. ⚠️ NO narrative, NO category, NO complainant, NO respondent,
-- NO contact number, NO location note, NO evidence path, NO witness.
create or replace function public.complaint_queue()
returns table (
  id             uuid,
  reference      text,
  intake_channel text,
  status         text,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  SELECT c.id, c.reference, c.intake_channel, c.status, c.created_at, c.updated_at
  FROM public.complaints c
  WHERE public.is_official(auth.uid())
    AND public.official_is_active(public.official_id_for_current_user())
  ORDER BY c.created_at DESC;
$$;

comment on function public.complaint_queue() is
  'P3-A. Safe complaint queue for ANY ACTIVE official. Metadata only -- no '
  'narrative, no category, no party, no contact, no evidence.';


-- ── 12. The three detail read surfaces ───────────────────────────────────────
--
-- All three gate on the ONE predicate, so they cannot drift apart or from
-- the `complaints` SELECT policy.

-- ⚠️ CONTACT IS NULLED PER ROW, NOT HIDDEN PER ROW. A resident may read
-- their OWN party contact and must not read the respondent's -- which is a
-- column rule inside a row the resident is otherwise entitled to see. So the
-- row comes back and the column comes back NULL. Hiding the respondent row
-- entirely would hide a name the complainant themselves supplied.
create or replace function public.complaint_parties_for(p_complaint_id uuid)
returns table (
  id                      uuid,
  party_role              text,
  full_name_snapshot      text,
  contact_number_snapshot text,
  address_note            text,
  has_profile_link        boolean,
  has_registry_link       boolean,
  created_at              timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  SELECT
    p.id, p.party_role, p.full_name_snapshot,
    CASE
      WHEN public.current_official_holds_position('Barangay Secretary')
        OR public.current_official_holds_position('Punong Barangay')
        THEN p.contact_number_snapshot
      WHEN p.profile_id = auth.uid()
        THEN p.contact_number_snapshot
      ELSE NULL
    END AS contact_number_snapshot,
    CASE
      WHEN public.current_official_holds_position('Barangay Secretary')
        OR public.current_official_holds_position('Punong Barangay')
        THEN p.address_note
      WHEN p.profile_id = auth.uid()
        THEN p.address_note
      ELSE NULL
    END AS address_note,
    -- ⚠️ Booleans, never the linked ids. Returning profile_id would hand a
    -- complainant another resident's auth identifier.
    (p.profile_id IS NOT NULL) AS has_profile_link,
    (p.registry_entry_id IS NOT NULL) AS has_registry_link,
    p.created_at
  FROM public.complaint_parties p
  WHERE p.complaint_id = p_complaint_id
    AND public.complaint_is_visible_to_caller(p_complaint_id)
  ORDER BY
    CASE p.party_role WHEN 'complainant' THEN 0 WHEN 'respondent' THEN 1 ELSE 2 END,
    p.created_at;
$$;

comment on function public.complaint_parties_for(uuid) is
  'P3-A. Parties of one complaint. Contact and address are returned only to '
  'the Secretary, the Punong Barangay, or the party themselves.';

create or replace function public.complaint_attachments_for(p_complaint_id uuid)
returns table (
  id               uuid,
  object_path      text,
  display_filename text,
  media_kind       text,
  mime_type        text,
  byte_size        bigint,
  uploaded_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  SELECT a.id, a.object_path, a.display_filename, a.media_kind,
         a.mime_type, a.byte_size, a.uploaded_at
  FROM public.complaint_attachments a
  WHERE a.complaint_id = p_complaint_id
    AND public.complaint_is_visible_to_caller(p_complaint_id)
  ORDER BY a.uploaded_at;
$$;

comment on function public.complaint_attachments_for(uuid) is
  'P3-A. Evidence METADATA for one complaint, to its filer, the Secretary '
  'and the Punong Barangay. The path still only opens via a signed URL.';

create or replace function public.complaint_history_for(p_complaint_id uuid)
returns table (
  id          uuid,
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  SELECT h.id, h.from_status, h.to_status, h.note, h.created_at
  FROM public.complaint_status_history h
  WHERE h.complaint_id = p_complaint_id
    AND public.complaint_is_visible_to_caller(p_complaint_id)
  ORDER BY h.created_at;
$$;

-- ⚠️ actor_profile_id is NOT returned. The transition's actor is recorded for
-- the audit and is read in SQL; handing a resident the uuid of the official
-- who processed their complaint publishes an identifier for no purpose.
comment on function public.complaint_history_for(uuid) is
  'P3-A. Append-only transition history for one complaint. The actor is '
  'stored but deliberately not returned.';


-- ── 13. The guest tracking RPC ───────────────────────────────────────────────
--
-- Modelled on track_court_reservation() (migration 025) and deliberately
-- NARROWER than it. That one returns a masked requester name and a masked
-- contact; a complaint must return neither, because the masked form of a
-- name in a barangay of neighbours is still a strong hint.
--
-- ⚠️ THE REFERENCE IS AN IDENTIFIER, NEVER A CREDENTIAL. Both the reference
-- AND the contact number recorded at intake are required, matched on digits
-- only so formatting cannot defeat it, and the result is at most one row
-- through a fixed narrow column list.
--
-- ⚠️ A WRONG REFERENCE AND A WRONG CONTACT PRODUCE THE SAME EMPTY RESULT.
-- An answer that distinguishes them confirms which guesses are live, which
-- turns this page into an oracle for enumerating references. The two
-- conditions are ANDed in one WHERE; there is no branch that could report
-- which half failed, and the function raises nothing.
--
-- Returned: reference, status, and the two dates. ⚠️ NO narrative, NO
-- category (it is the accusation itself), NO respondent, NO witness, NO
-- evidence, NO complainant contact, NO internal note, NO screening data --
-- there is no screening data to leak yet, and when P4 adds it this list is
-- what keeps it out.
create or replace function public.track_complaint(
  p_reference text,
  p_contact   text
)
returns table (
  reference    text,
  status       text,
  received_on  date,
  last_updated date
)
language sql
stable
security definer
set search_path = ''
as $$
  SELECT
    c.reference,
    c.status,
    (c.created_at AT TIME ZONE 'Asia/Manila')::date AS received_on,
    (c.updated_at AT TIME ZONE 'Asia/Manila')::date AS last_updated
  FROM public.complaints c
  JOIN public.complaint_parties cp
    ON cp.complaint_id = c.id AND cp.party_role = 'complainant'
  WHERE
    -- ⚠️ ONE normalizer, shared with the reservation reference rather than
    -- copied. Both references use the same alphabet and have the same
    -- look-alike problem (O/0, I/1, L/1), so it is the same rule; the
    -- function's name is historical, and a second implementation is how two
    -- copies drift.
    public.normalize_reservation_reference(c.reference)
      = public.normalize_reservation_reference(p_reference)
    AND regexp_replace(COALESCE(cp.contact_number_snapshot, ''), '[^0-9]', '', 'g')
      = regexp_replace(COALESCE(p_contact, ''), '[^0-9]', '', 'g')
    -- Empty input must match nothing, or a complaint recorded without a
    -- contact number would be readable by anybody holding the reference.
    AND COALESCE(btrim(p_reference), '') <> ''
    AND regexp_replace(COALESCE(p_contact, ''), '[^0-9]', '', 'g') <> ''
  LIMIT 1;
$$;

comment on function public.track_complaint(text,text) is
  'P3-A. Public complaint tracking. Requires reference AND the contact '
  'recorded at intake; a wrong either gives the same empty result.';


-- ── 14. EXECUTE grants ───────────────────────────────────────────────────────
--
-- ⚠️ REVOKE FROM PUBLIC ON EVERY ONE, AND THAT IS THE LOAD-BEARING HALF.
-- pg_default_acl for `postgres in public` grants anon, authenticated and
-- service_role EXECUTE by name, and PostgreSQL's own function default adds a
-- bare PUBLIC entry on top -- so a new function is executable by every role
-- in the cluster until PUBLIC is revoked. That is exactly what MASTER-B B5
-- (migration 038) spent a phase removing from nine existing functions, and
-- repeating it here would undo it. Each revoke is followed by the narrowest
-- grant that works.
revoke all on function public.generate_complaint_reference(int) from public, anon, authenticated;
revoke all on function public.stamp_complaint_reference() from public, anon, authenticated;
-- ⚠️ anon as well as PUBLIC. The default ACL for `postgres in public` grants
-- anon EXECUTE by name, so revoking PUBLIC alone leaves it -- which is
-- exactly the one surplus named grant B5 reported and migration 039
-- removed. Caught here by reading the ACL back after applying rather than
-- by trusting the revoke list.
revoke all on function public.complaint_is_visible_to_caller(uuid) from public, anon;
revoke all on function public.file_complaint_as_resident(text,text,text,jsonb) from public, anon;
revoke all on function public.encode_walk_in_complaint(text,text,text,text,text,jsonb) from public, anon;
revoke all on function public.complaint_queue() from public, anon;
revoke all on function public.complaint_parties_for(uuid) from public, anon;
revoke all on function public.complaint_attachments_for(uuid) from public, anon;
revoke all on function public.complaint_history_for(uuid) from public, anon;
revoke all on function public.track_complaint(text,text) from public;

-- ⚠️ The two internal functions get NO client grant at all. The generator is
-- reached only by the trigger, and B1 measured the PostgreSQL fact this
-- depends on: a trigger does NOT consult the caller's EXECUTE privilege, so
-- the stamping still fires for a resident who cannot call it directly.
grant execute on function public.generate_complaint_reference(int) to service_role;
grant execute on function public.stamp_complaint_reference() to service_role;

-- ⚠️ authenticated ONLY, never anon. The `complaints` SELECT policy that
-- calls this is declared TO authenticated, and anon holds no SELECT
-- privilege on the table, so an anon grant would be surplus -- the exact
-- shape of the one grant migration 039 removed.
grant execute on function public.complaint_is_visible_to_caller(uuid) to authenticated, service_role;

grant execute on function public.file_complaint_as_resident(text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.encode_walk_in_complaint(text,text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.complaint_queue() to authenticated, service_role;
grant execute on function public.complaint_parties_for(uuid) to authenticated, service_role;
grant execute on function public.complaint_attachments_for(uuid) to authenticated, service_role;
grant execute on function public.complaint_history_for(uuid) to authenticated, service_role;

-- ⚠️ anon genuinely needs this one: a walk-in complainant has no account and
-- the tracking page is public, exactly as track_court_reservation().
grant execute on function public.track_complaint(text,text) to anon, authenticated, service_role;


-- ── 15. activity_log: DELIBERATELY NOT WIDENED ───────────────────────────────
--
-- ⚠️ A DECISION, NOT AN OVERSIGHT, AND THE REASON IS PRIVACY RATHER THAN
-- EFFORT.
--
-- activity_log.action and .entity_type are closed CHECKs with no complaint
-- value, and stamp_activity_actor() gates who may write each one -- so
-- adding complaint logging is a CHECK change PLUS a trigger change in the
-- same migration, which is migration 016's lesson (it widened the
-- vocabulary alone and that changed nothing for the nurse until 017 added
-- the trigger branch).
--
-- It is not done here because:
--   1. complaint_status_history is the authoritative domain history, it
--      records the actor from the caller's own uid, and it is append-only at
--      BOTH layers -- stronger than activity_log was before migration 035.
--   2. ⚠️ activity_log is readable by EVERY official (its SELECT policy is
--      is_official()). Its `subject` field is free text. The only thing
--      worth logging in P3-A is "a complaint was created", and writing a
--      reference there tells every Kagawad something the safe queue already
--      tells them -- while any more identifying subject would breach the
--      rule that no complainant name, respondent name, narrative or
--      evidence filename may sit in a field all officials can read.
--   3. P3-A contains no official decision. When P4 adds screening,
--      referral and case transitions -- acts an official takes that others
--      may need to audit -- that is the phase to revisit this, with the
--      CHECK and the trigger widened together and a non-identifying subject
--      convention decided first.
--
-- Nothing in this migration touches activity_log, its CHECKs or
-- stamp_activity_actor().


-- ── 16. What this migration deliberately does NOT do ─────────────────────────
--
--   * No notifications. The audience, category, entity_type and event
--     vocabularies are all closed CHECKs with no complaint value, and the
--     wording has to come from a module that owns it (notificationLabels
--     defines no vocabulary of its own). That is its own reviewed change.
--     No SMS. No email.
--   * No capability-assignment table. Its grant path is undesigned -- an
--     official must not be able to grant themselves a capability -- and a
--     private table with no reader is the inert state migration 030 held for
--     exactly one phase.
--   * No puroks table, no purok_id, no purok CHECK, and no normalisation of
--     a single stored purok value. See P2.
--   * No frontend. P3-B builds the UI against this surface.
-- ============================================================================
