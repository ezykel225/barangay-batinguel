-- ============================================================
-- Barangay Batinguel E-System
-- 019 — previous term officials: database foundation (019A)
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-30 as migration `previous_term_officials`, via the Supabase
-- connector. All 44 verification checks pass; results at the foot of this
-- file.
--
-- 019A is the DATABASE FOUNDATION ONLY. No roster is seeded, and the
-- Previous Term Officials frontend does not exist. Both tables hold
-- ZERO rows. 019B is not started.
--
-- ─── SCOPE: 019A IS SCHEMA ONLY ───────────────────────────────────────
-- This migration creates the structure for preserving past barangay terms
-- and NOTHING ELSE. It deliberately does NOT:
--
--   - seed the 2018–2023 roster. The two sources available are
--     third-party directory listings that already disagree with each
--     other on one name, so the roster is not established yet. Seeding
--     waits for the barangay to confirm it (019B).
--   - insert the SK Chairperson. One source gives the middle name
--     `Danielle`, another `Daiella`. Neither is chosen, and omitting the
--     middle name would itself assert a third version of the name.
--   - insert a Barangay Treasurer for 2018–2023. Neither source lists
--     one. The post is appointed rather than elected, so its absence
--     from directory listings is expected and is NOT evidence the post
--     was vacant. `record_status = 'unknown'` exists to record exactly
--     this once the term is seeded -- a row that says "not established"
--     is far better than no row, because an absent row cannot tell a
--     reader apart from "there was none".
--   - create a row for the CURRENT term. See "FUTURE TERMS" below.
--   - touch `barangay_officials`, migration 018, or any frontend file.
--
-- PRE-CHECKS taken from the live database immediately before writing
-- this file (2026-09-30):
--   is_official() fingerprint ....... 538df896e6da689516a89a09f45440e5
--   barangay_officials .............. 11 active, 0 archived
--   roster fingerprint .............. 3603ae5b940825f8478eecdfc245ad84
--   barangay_terms / _members ....... 0  (nothing to collide with)
--   term_is_confirmed() ............. 0  (nothing to collide with)
--   tables in public ................ 15  (16 and 17 after this migration)
--
--
-- ─── WHY A SEPARATE PAIR OF TABLES ────────────────────────────────────
-- Migration 018 gave `barangay_officials` an operational archive:
-- `archived_at` / `archived_by`, stamped server-side, with Restore in the
-- dashboard and `archived` / `restored` entries in the audit trail.
--
-- Historical term rosters are NOT that, and must never be stored as if
-- they were. Putting them in `barangay_officials` as archived rows would:
--
--   1. Offer Restore buttons that can never work. Two members of the
--      2018–2023 roster are ALSO current officials (Arnulfo Abol Catalan
--      and Caroline Catan Amparado), so restoring either would hit 23505
--      on `barangay_officials_one_active_per_name` every single time.
--   2. Make the audit trail contradict the UI -- ten "archived" officials
--      with zero `archived` entries in `activity_log`. The unforgeable
--      audit trail is one of this project's strongest guarantees; a panel
--      that disagrees with it undermines precisely that.
--   3. Require fabricating `archived_at` and `archived_by` for people
--      nobody archived.
--   4. Destroy the meaning of "archived", which today is exactly: this
--      system archived this record, and here is who did it and when.
--
-- So: separate tables, no foreign key to `barangay_officials`, no shared
-- column, and no policy on either side that references the other.
--
--
-- ─── NO NAME MATCHING, ANYWHERE ───────────────────────────────────────
-- `barangay_term_members` stores names as plain text per term. There is
-- NO link to `barangay_officials`, NO link to `profiles`, and NO link
-- between terms.
--
-- That is deliberate, because the only identity key this system has is
-- the name string -- the fragility documented in CLAUDE.md, and the
-- reason the `profile_id` foreign key remains unbuilt. Name matching
-- across terms would get all three interesting cases wrong:
--
--   `Frankie Sia Credo` (2018–2023) vs `Hon. Frankie Credo` (current)
--       -> almost certainly one person, but the strings differ, so a
--          matcher would MISS it.
--   `Catherine Lacson Tan` (2018–2023 Secretary) vs
--   `Alexis Theress P. Tan` (current Secretary)
--       -> different people who share a surname AND an office, so a
--          matcher would WRONGLY link them. This is the dangerous one.
--   `Arnulfo Abol Catalan`, `Caroline Catan Amparado`
--       -> exact matches, and the only ones a matcher would get right.
--
-- A roster that quietly asserts a false identity is worse than one that
-- asserts none. A reader may conclude two records are the same person;
-- the system does not.
--
-- The consequence is all upside: archiving, restoring, renaming or
-- reordering a current official has ZERO effect on any historical
-- roster, and a historical row can never collide with
-- `barangay_officials_one_active_per_name`, which is on another table.
--
--
-- ─── ⚠️ RLS IS ENABLED AUTOMATICALLY, AND THAT IS LOAD-BEARING ────────
-- This project carries an event trigger named `ensure_rls`
-- (`public.rls_auto_enable()`), armed on CREATE TABLE / CREATE TABLE AS /
-- SELECT INTO in the `public` schema, which runs
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every new table.
--
-- So both tables below have RLS enabled from the moment they exist, and
-- RLS-enabled-with-no-policies denies everything. There is no window in
-- which these tables are world-readable. Good -- but note the trigger
-- swallows its own failures into RAISE LOG, so a failure would be
-- SILENT. The verification block at the foot of this file therefore
-- reads `pg_class.relrowsecurity` directly rather than assuming.
--
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is written explicitly below
-- anyway. It is a no-op if the trigger already did it, and it means this
-- file is correct even if the trigger is ever removed.
-- ============================================================


-- ============================================================
-- 1. barangay_terms — one row per barangay term
-- ============================================================
CREATE TABLE public.barangay_terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display label exactly as the barangay words it: '2018–2023', with an
  -- EN DASH (U+2013), not a hyphen. Recorded here because the committee
  -- wording in Phase 3A taught us that silently normalising somebody
  -- else's punctuation is a decision, not a tidy-up.
  label         text NOT NULL,

  -- YEARS, NOT DATES, and this is a deliberate choice rather than
  -- laziness. The term is known as "2018–2023"; the day either term began
  -- is not established. A `date` column would force inventing a day and
  -- month -- the same fabrication this migration refuses for the
  -- Treasurer and the SK middle name. Years sort correctly, which is all
  -- the ordering needs.
  start_year    smallint NOT NULL,
  end_year      smallint,              -- NULL = ongoing or not yet ended

  -- THE VISIBILITY GATE. A draft term is invisible to anonymous callers
  -- at the RLS layer (section 5), so a roster can be entered, reviewed in
  -- the Official Portal and checked against its sources while remaining
  -- completely unreachable from the public API.
  status        text NOT NULL DEFAULT 'draft',

  -- Marks the serving term IF this model is ever used for it. No such row
  -- is created by this migration; see "FUTURE TERMS".
  is_current    boolean NOT NULL DEFAULT false,

  -- Provenance travels with the data. Where the roster came from, and who
  -- confirmed it. For 2018–2023 this will record that the listings came
  -- from third-party directory sites that disagreed on one name.
  source_note   text,
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES public.profiles(id),

  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by    uuid REFERENCES public.profiles(id),

  CONSTRAINT barangay_terms_status_check
    CHECK (status IN ('draft', 'confirmed')),

  CONSTRAINT barangay_terms_label_not_blank
    CHECK (btrim(label) <> ''),

  CONSTRAINT barangay_terms_years_ordered
    CHECK (end_year IS NULL OR end_year >= start_year),

  CONSTRAINT barangay_terms_year_range
    CHECK (start_year BETWEEN 1900 AND 2200),

  -- A term cannot claim to be confirmed without recording when. Without
  -- this, `status` could be flipped and the provenance left empty, which
  -- is the state that made the missing Kagawad unexplainable.
  CONSTRAINT barangay_terms_confirmed_has_timestamp
    CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

ALTER TABLE public.barangay_terms ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.barangay_terms IS
  'One row per barangay term, for preserving historical leadership '
  'rosters. Entirely separate from barangay_officials and from migration '
  '018''s operational archive: nothing here was archived by this system. '
  'Read-only to application clients -- no write policies and no write '
  'privileges. status = draft keeps a roster invisible to anonymous '
  'callers until the barangay confirms it.';

COMMENT ON COLUMN public.barangay_terms.status IS
  'draft = invisible to anon/resident/nurse at the RLS layer, visible to '
  'officials. confirmed = publicly visible. The gate is the policy, not '
  'the UI.';

COMMENT ON COLUMN public.barangay_terms.start_year IS
  'Year, not a date. The day a term began is not established, and a date '
  'column would require inventing one.';

-- At most ONE current term, enforced rather than hoped for. Same partial
-- index idiom migration 018 uses for one-active-official-per-name. The
-- predicate means only is_current = true rows are indexed, so uniqueness
-- on the column permits exactly one of them and any number of false rows.
CREATE UNIQUE INDEX barangay_terms_one_current
  ON public.barangay_terms (is_current)
  WHERE is_current;

-- Every UI lists terms newest first.
CREATE INDEX barangay_terms_by_start_year
  ON public.barangay_terms (start_year DESC);


-- ============================================================
-- 2. barangay_term_members — who served in a term
-- ============================================================
CREATE TABLE public.barangay_term_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE RESTRICT, not CASCADE. See the note below the table.
  term_id       uuid NOT NULL
                REFERENCES public.barangay_terms(id) ON DELETE RESTRICT,

  -- NULLABLE ON PURPOSE. A NULL name with record_status = 'unknown'
  -- records that the office existed in this term and its holder is not
  -- established -- the 2018–2023 Treasurer. Omitting the row instead
  -- would make the gap INVISIBLE, and an invisible gap is exactly what
  -- the missing Kagawad was: nobody could tell "there was none" apart
  -- from "we do not know".
  full_name     text,

  -- Preserved as the source words it: 'Barangay Chairperson',
  -- 'Barangay Kagawad'. Deliberately NO CHECK constraint -- a closed
  -- vocabulary would either force normalisation into the current
  -- system's 'Punong Barangay' / 'Kagawad' (which the agreed design
  -- forbids) or need widening for every historical variant.
  --
  -- ⚠️ Consequence worth knowing: the PUBLIC officials page groups
  -- current officials by five hard-coded position strings, and
  -- 'Barangay Chairperson' / 'Barangay Kagawad' are not among them. The
  -- historical UI (019B) must therefore render this roster through its
  -- own path and must NOT be routed through that grouping, or these rows
  -- would silently render nowhere.
  position      text NOT NULL,

  -- 'named'   -> full name established
  -- 'partial' -> part established, part disputed or missing. The SK
  --              Chairperson, once seeded: one source says the middle
  --              name is `Danielle`, another `Daiella`.
  -- 'unknown' -> office known, holder not established. The Treasurer.
  record_status text NOT NULL DEFAULT 'named',

  -- Row-level provenance: the specific dispute or gap, in words. Made
  -- mandatory for anything other than a plain confirmed name by the
  -- constraint below, so uncertainty cannot be recorded silently.
  source_note   text,

  -- Explicit, because `position` is free text and must not be sorted
  -- alphabetically -- 'Barangay Chairperson' would fall after
  -- 'Barangay Kagawad'.
  display_order smallint NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT term_members_record_status_check
    CHECK (record_status IN ('named', 'partial', 'unknown')),

  CONSTRAINT term_members_position_not_blank
    CHECK (btrim(position) <> ''),

  CONSTRAINT term_members_display_order_positive
    CHECK (display_order > 0),

  -- The heart of the honesty guarantee. A row cannot carry a name while
  -- claiming the holder is unknown, and cannot omit a name without
  -- saying so. Both directions are closed.
  CONSTRAINT term_members_name_matches_status CHECK (
    (record_status IN ('named','partial')
       AND full_name IS NOT NULL AND btrim(full_name) <> '')
    OR
    (record_status = 'unknown' AND full_name IS NULL)
  ),

  -- A partial or unknown record must explain itself. Without this,
  -- "unknown" could be stored with no indication of why, and the reason
  -- would live only in somebody's memory.
  CONSTRAINT term_members_uncertainty_is_explained
    CHECK (record_status = 'named'
           OR (source_note IS NOT NULL AND btrim(source_note) <> ''))
);

ALTER TABLE public.barangay_term_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.barangay_term_members IS
  'Who served in a barangay term. Plain text names with NO link to '
  'barangay_officials or profiles, deliberately: the only identity key '
  'this system has is the name string, and matching on it would wrongly '
  'link two different officials who share a surname while missing a '
  'genuine same-person case. Read-only to application clients.';

COMMENT ON COLUMN public.barangay_term_members.full_name IS
  'NULL only when record_status = ''unknown'', meaning the office is '
  'known and its holder is not established. Enforced by '
  'term_members_name_matches_status.';

COMMENT ON COLUMN public.barangay_term_members.position IS
  'Preserved as the source words it. Not normalised to the current '
  'system''s vocabulary, so 019B must not route this through the public '
  'page''s five hard-coded position strings.';

-- ⚠️ ON DELETE RESTRICT RATHER THAN CASCADE — A DELIBERATE REVISION
-- The approved design sketch said CASCADE. RESTRICT is safer here and is
-- what this file implements.
--
-- With CASCADE, a single `DELETE FROM barangay_terms WHERE ...` issued
-- from the SQL Editor silently takes every member row with it. This is
-- append-mostly historical data whose whole purpose is not being lost,
-- in a project that has already lost one official's record without
-- explanation. RESTRICT forces the deletion to be two deliberate
-- statements instead of one accidental one.
--
-- The cost is that the rollback script must delete members first; it
-- does. DROP TABLE is unaffected either way.
--
-- If you would rather have CASCADE, say so -- it is a one-word change,
-- and this comment should then be removed rather than left contradicting
-- the schema.

-- One position slot per number per term.
--
-- Note this is the OPPOSITE conclusion from `barangay_officials`, where
-- migration 018 deliberately did NOT add a unique display_order, and the
-- difference is real rather than inconsistent: that table is edited one
-- row at a time through a form, where swapping two officials' order
-- would collide midway and a partial unique index cannot be DEFERRABLE.
-- This table is seeded and corrected by SQL, where a reorder is a single
-- multi-row statement and a temporary value is trivial. Same constraint,
-- different context, different answer.
CREATE UNIQUE INDEX term_members_one_slot_per_term
  ON public.barangay_term_members (term_id, display_order);

-- Every read is "the members of this term, in order".
CREATE INDEX term_members_by_term
  ON public.barangay_term_members (term_id, display_order);


-- ============================================================
-- 3. term_is_confirmed(uuid) — the visibility helper
-- ============================================================
-- WHY A FUNCTION RATHER THAN AN INLINE SUBQUERY, and this is the
-- migration-018 lesson applied deliberately:
--
-- The obvious way to write the members policy is
--   USING (EXISTS (SELECT 1 FROM barangay_terms t
--                  WHERE t.id = term_id AND t.status = 'confirmed'))
--
-- That works TODAY, but RLS on `barangay_terms` applies inside that
-- subquery, so the members policy would silently inherit whatever the
-- caller can see in `barangay_terms`. Today that happens to give the
-- right answer. Change the term policies later and the members policy
-- changes meaning WITHOUT BEING TOUCHED -- which is exactly how an
-- archived Treasurer would have kept the power to approve reservations
-- in migration 018, and the reason that migration had to put
-- `archived_at IS NULL` explicitly into two policies on other tables.
--
-- Being SECURITY DEFINER, this function answers "is this term
-- confirmed?" identically for every caller, so the members policy means
-- one thing regardless of who asks.
--
-- What it discloses: one boolean, to a caller who must already hold the
-- term's uuid, about information the public page displays anyway. It
-- does not reveal the roster, the label, or that a draft term exists --
-- a draft simply answers false, the same as a uuid that does not exist.
CREATE OR REPLACE FUNCTION public.term_is_confirmed(p_term_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public          -- pinned; see migration 012
AS $$
  SELECT EXISTS (
    SELECT 1 FROM barangay_terms
    WHERE id = p_term_id AND status = 'confirmed'
  );
$$;

COMMENT ON FUNCTION public.term_is_confirmed(uuid) IS
  'True when the given term is confirmed. SECURITY DEFINER so the '
  'barangay_term_members SELECT policy means the same thing for every '
  'caller instead of inheriting the caller''s view of barangay_terms -- '
  'the coupling that migration 018 had to break explicitly. Returns '
  'false for a draft term and for an id that does not exist, so it '
  'reveals nothing about drafts.';

-- Explicit, not relying on the default EXECUTE-to-PUBLIC grant. The
-- anonymous SELECT policy below CALLS this function, so if a future
-- hardening pass ran `REVOKE EXECUTE ... FROM PUBLIC` across the schema,
-- the public officials page would start returning nothing with no error
-- to explain it. Granting the two roles by name makes the dependency
-- visible and survives that.
GRANT EXECUTE ON FUNCTION public.term_is_confirmed(uuid) TO anon, authenticated;


-- ============================================================
-- 4. RLS — SELECT ONLY. NO WRITE POLICIES.
-- ============================================================
-- Permissive policies are OR'd, which gives exactly the split wanted:
--
--   anon / resident / nurse -> confirmed terms only
--   official                -> every term, including drafts
--
-- A DRAFT TERM IS UNREACHABLE FOR ANONYMOUS CALLERS AT THE DATABASE, not
-- hidden in React. That distinction is the whole point: the publishable
-- key ships inside the JavaScript bundle by design, so anyone can call
-- /rest/v1/barangay_terms directly, and a filter written in the frontend
-- would hide an unconfirmed roster from the page and from nobody else.

CREATE POLICY "Confirmed terms are viewable by everyone"
  ON public.barangay_terms FOR SELECT
  TO anon, authenticated
  USING (status = 'confirmed');

CREATE POLICY "Officials can view all terms"
  ON public.barangay_terms FOR SELECT
  TO authenticated
  USING (public.is_official(auth.uid()));

CREATE POLICY "Members of confirmed terms are viewable by everyone"
  ON public.barangay_term_members FOR SELECT
  TO anon, authenticated
  USING (public.term_is_confirmed(term_id));

CREATE POLICY "Officials can view all term members"
  ON public.barangay_term_members FOR SELECT
  TO authenticated
  USING (public.is_official(auth.uid()));

-- NO INSERT POLICY. NO UPDATE POLICY. NO DELETE POLICY. On either table.
-- Not an omission -- the agreed design is that historical records are
-- read-only to every application client, and an absent policy is a
-- stronger guarantee than a hidden button.


-- ============================================================
-- 5. PRIVILEGES — the second, independent barrier
-- ============================================================
-- Supabase's default grants give `anon` and `authenticated` full DML on
-- tables in `public`. Verified on an existing table before writing this:
--
--   anon          : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   authenticated : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- So section 4's absent write policies are, on their own, the ONLY thing
-- stopping a write. Revoking the privilege as well means a write is
-- refused at the privilege layer before RLS is even consulted.
--
-- The value of this is specific and worth stating: if somebody later adds
-- a permissive write policy by mistake, the missing grant still blocks
-- the write. One barrier is a decision; two is a design.
--
-- SELECT is deliberately retained -- section 4's policies need it.
-- `service_role` keeps its grants and is unaffected, as are direct
-- database connections, which is how 019B will seed.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.barangay_terms
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.barangay_term_members
  FROM anon, authenticated;


-- ============================================================
-- FUTURE TERMS — no schema change needed
-- ============================================================
-- Adding a term is one INSERT plus N member INSERTs, from the SQL Editor:
--
--   BEGIN;
--   INSERT INTO barangay_terms (label, start_year, end_year, status, source_note)
--   VALUES ('2023–2028', 2023, 2028, 'draft', '<where this came from>')
--   RETURNING id;                                        -- :term
--
--   INSERT INTO barangay_term_members
--     (term_id, full_name, position, record_status, display_order, source_note)
--   VALUES
--     (:term, 'Name', 'Barangay Chairperson', 'named',   1, NULL),
--     (:term, NULL,   'Barangay Treasurer',   'unknown', 10,
--      'Not listed by either source; the post is appointed, so its '
--      'absence is not evidence of a vacancy.'),
--     … ;
--   COMMIT;
--
--   -- only once the barangay confirms:
--   UPDATE barangay_terms
--      SET status='confirmed', confirmed_at=now(), confirmed_by='<official uuid>'
--    WHERE id = :term;
--
-- Both UIs will order terms by start_year DESC, so a newer term appears
-- first with no code change.
--
-- ─── THE CURRENT TERM ─────────────────────────────────────────────────
-- If the serving term is ever represented here, add a `barangay_terms`
-- row with is_current = true and NO member rows. `barangay_officials`
-- must remain the single source of truth for who is serving.
--
-- Duplicating the serving roster into `barangay_term_members` would give
-- "who is serving now" TWO answers that can drift -- which is the exact
-- class of bug this whole phase has been fixing: the missing Kagawad, the
-- full_name join, the fabricated archive state. Do not do it.
--
-- When a term ends: flip is_current to false, set end_year, and THEN
-- snapshot the outgoing roster into barangay_term_members as a
-- deliberate, human-approved act at the moment the information becomes
-- historical.
--
-- This migration creates no current-term row, because nothing consumes
-- one yet and an unused row is a claim waiting to go stale.


-- ============================================================
-- ROLLBACK
-- ============================================================
-- ⚠️ READ THIS BEFORE ROLLING BACK. Unlike migration 018 -- where
-- rollback removed columns from a table whose ROWS survived -- here the
-- TABLES ARE THE DATA. Dropping them destroys any roster that has been
-- seeded, and there is no other copy in the database.
--
-- So once 019B has seeded anything, DO NOT drop the tables to take the
-- roster off the public page. Use one of these instead, both instantly
-- reversible:
--
--   -- (a) hide every term from the public, keep everything:
--   UPDATE public.barangay_terms SET status = 'draft', confirmed_at = NULL;
--
--   -- (b) or remove public read access entirely, keep official access:
--   DROP POLICY "Members of confirmed terms are viewable by everyone"
--     ON public.barangay_term_members;
--   DROP POLICY "Confirmed terms are viewable by everyone"
--     ON public.barangay_terms;
--
-- FULL ROLLBACK, for use only before any data has been seeded. Order
-- matters: the policies depend on the function, so dropping the function
-- first is REFUSED by Postgres. Members before terms because the foreign
-- key is ON DELETE RESTRICT.
--
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE
--     ON public.barangay_terms, public.barangay_term_members
--     TO anon, authenticated;          -- restore the default grants
--
--   DROP POLICY "Officials can view all term members"                  ON public.barangay_term_members;
--   DROP POLICY "Members of confirmed terms are viewable by everyone"   ON public.barangay_term_members;
--   DROP POLICY "Officials can view all terms"                         ON public.barangay_terms;
--   DROP POLICY "Confirmed terms are viewable by everyone"             ON public.barangay_terms;
--
--   DROP FUNCTION IF EXISTS public.term_is_confirmed(uuid);
--
--   DROP INDEX IF EXISTS public.term_members_by_term;
--   DROP INDEX IF EXISTS public.term_members_one_slot_per_term;
--   DROP INDEX IF EXISTS public.barangay_terms_by_start_year;
--   DROP INDEX IF EXISTS public.barangay_terms_one_current;
--
--   -- If rows exist and you genuinely intend to lose them:
--   -- DELETE FROM public.barangay_term_members;   -- required by RESTRICT
--   DROP TABLE IF EXISTS public.barangay_term_members;
--   DROP TABLE IF EXISTS public.barangay_terms;
--
-- Rolling 019 back touches NOTHING migration 018 depends on: no shared
-- table, no shared column, no policy on either side referencing the
-- other. `is_official()` is read by two policies here and is not
-- modified, so it must still fingerprint
-- 538df896e6da689516a89a09f45440e5 afterwards.
--
-- FRONTEND: 019A ships no frontend at all, so there is nothing to
-- revert. When 019B adds the UI, apply the migration BEFORE deploying
-- it, exactly as 018 required.


-- ============================================================
-- VERIFICATION — RUN 2026-09-30, ALL 44 PASSED
-- ============================================================
-- Both directions for every guard, because a guard test that does not
-- change the value it guards proves nothing, and a negative test can fail
-- for the wrong reason. Every behavioural test ran inside one transaction
-- per group, aborted by a deliberate RAISE that carried the report back.
-- Nothing was committed, and only synthetic 'ZZ...' data was used.
--
-- STRUCTURE
--   [x] both tables exist; public tables 15 -> 17
--   [x] pg_class.relrowsecurity TRUE on both, read DIRECTLY rather than
--       trusting `ensure_rls`, which swallows failures into RAISE LOG
--   [x] relforcerowsecurity false on both (the table owner must still be
--       able to seed in 019B)
--   [x] 4 new indexes + 2 PK indexes:
--         barangay_terms_one_current     UNIQUE (is_current) WHERE is_current
--         barangay_terms_by_start_year          (start_year DESC)
--         term_members_one_slot_per_term  UNIQUE (term_id, display_order)
--         term_members_by_term                  (term_id, display_order)
--   [x] 10 named CHECK constraints, 3 FKs, 2 PKs -- all present
--   [x] FK is ON DELETE RESTRICT, as intended
--   [x] term_is_confirmed: volatile=s (STABLE), secdef=true,
--       config={search_path=public}, owner=postgres
--   [x] BOTH TABLES ALSO OWNED BY postgres, and postgres has BYPASSRLS --
--       which is WHY the SECURITY DEFINER helper can read draft terms.
--       This was a named risk in review: had the function been owned by a
--       role without that, it would have returned false for every term.
--       It fails CLOSED (anon would see less, never more), and A12 below
--       is the test that would have caught it.
--   [x] EXECUTE on term_is_confirmed granted to anon AND authenticated
--   [x] is_official() fingerprint UNCHANGED: 538df896e6da689516a89a09f45440e5
--       term_is_confirmed() fingerprint:    fa2cbb19ed88f08fb305b754abe05101
--
-- POLICIES AND GRANTS
--   [x] exactly 4 SELECT policies; WRITE POLICY COUNT = 0
--         barangay_terms        "Confirmed terms are viewable by everyone"
--                                 SELECT TO {anon,authenticated}
--                                 USING (status = 'confirmed')
--         barangay_terms        "Officials can view all terms"
--                                 SELECT TO {authenticated}
--                                 USING is_official(auth.uid())
--         barangay_term_members "Members of confirmed terms are viewable
--                                by everyone" SELECT TO {anon,authenticated}
--                                 USING term_is_confirmed(term_id)
--         barangay_term_members "Officials can view all term members"
--                                 SELECT TO {authenticated}
--                                 USING is_official(auth.uid())
--   [x] anon and authenticated now hold REFERENCES, SELECT, TRIGGER only --
--       INSERT, UPDATE, DELETE and TRUNCATE are revoked on both tables
--   [x] service_role retains full DML
--   [x] REFERENCES and TRIGGER are deliberately NOT revoked, and are not
--       exploitable: anon and authenticated have CREATE on schema public
--       = FALSE, so neither can create the function a trigger needs nor a
--       table for a foreign key. Verified, and consistent with all 15
--       pre-existing tables.
--
-- GROUP A — VISIBILITY, WRITE REFUSAL, FUNCTION  (21 checks, all PASS)
--   [x] A1   direct SQL seed of a term + 2 members -> works, so 019B CAN seed
--   [x] A2   term_is_confirmed(draft term)   -> false
--   [x] A3   term_is_confirmed(random uuid)  -> false, so a draft is
--            indistinguishable from a non-existent id: reveals nothing
--   [x] A4   DRAFT, anon    -> 0 terms       [x] A5   0 members
--   [x] A6   DRAFT, resident-> 0 terms       [x] A7   0 members
--   [x] A8   DRAFT, nurse   -> 0 terms       [x] A9   0 members
--   [x] A10  DRAFT, official-> 1 term        [x] A11  2 members
--   [x] A12  CONFIRM IT -> anon sees 1 term  [x] A13  and 2 members
--            (the other direction: proves `status` is the filter and not
--             some unrelated accident)
--   [x] A14  BACK TO DRAFT -> anon 0 terms   [x] A15  0 members, reversible
--   [x] A16  anon INSERT terms      -> 42501 permission denied
--   [x] A17  anon UPDATE terms      -> 42501
--   [x] A18  anon DELETE members    -> 42501
--   [x] A19  OFFICIAL INSERT terms  -> 42501
--   [x] A20  OFFICIAL UPDATE members-> 42501
--   [x] A21  OFFICIAL DELETE terms  -> 42501
--
--   WORTH NOTING: every refusal is 42501, the PRIVILEGE error -- not RLS
--   returning zero rows. So barrier 2 (the REVOKE) is what fires first,
--   which is the stronger of the two and confirms it is doing real work
--   rather than sitting behind RLS as decoration.
--
-- GROUP B — CONSTRAINTS, UNIQUENESS, RESTRICT  (23 checks, all PASS)
--   Rejections (23514 CHECK unless noted):
--   [x] B1  record_status 'unknown' WITH a name
--   [x] B2  'named' with a NULL name
--   [x] B3  'named' with a blank name
--   [x] B4  'partial' with NO source_note
--   [x] B5  'unknown' with NO source_note
--   [x] B9  blank position          [x] B10 display_order 0
--   [x] B11 end_year < start_year   [x] B12 'confirmed' with NULL confirmed_at
--   [x] B14 blank label             [x] B15 start_year 1800, out of range
--   [x] B16 status 'published', outside the vocabulary
--   [x] B17 record_status 'retired', outside the vocabulary
--   [x] B18 duplicate (term_id, display_order)            -> 23505
--   [x] B20 a second is_current = true term               -> 23505
--   [x] B22 DELETE a term that still has members          -> 23503 RESTRICT
--
--   Acceptances -- the half that proves the rejections are not false
--   positives, and that the two real cases 019B needs actually work:
--   [x] B6  'named' with no source_note            -> ACCEPTED
--   [x] B7  'unknown' + NULL name + note           -> ACCEPTED
--           This is the 2018-2023 TREASURER case: the office recorded,
--           the holder explicitly not established.
--   [x] B8  'partial' + name + note                -> ACCEPTED
--           This is the SK CHAIRPERSON case: part of the name recorded,
--           the disputed middle name absent, the dispute in the note.
--           NOTE: no real roster was seeded -- this used synthetic data
--           inside the rolled-back transaction to prove the shape works.
--   [x] B13 'confirmed' WITH confirmed_at          -> ACCEPTED
--   [x] B19 the same display_order in a DIFFERENT term -> ACCEPTED
--   [x] B21 several is_current = false terms       -> ACCEPTED
--   [x] B23 delete the members, THEN the term      -> ACCEPTED
--           RESTRICT turns one accidental statement into two deliberate
--           ones, which is the whole reason it was chosen over CASCADE.
--
-- ISOLATION FROM 018 AND FROM PRODUCTION
--   [x] barangay_terms 0 rows, barangay_term_members 0 rows -- every
--       synthetic row rolled back, 0 leftover 'ZZ%' rows in either table
--   [x] barangay_officials: 11 active, 0 archived, unchanged
--   [x] roster fingerprint still 3603ae5b940825f8478eecdfc245ad84
--   [x] activity_log still 23 rows, 1 with entity_type='official'.
--       019A logs nothing BY DESIGN: no application action occurred, and
--       inventing an audit entry for a schema change would be the same
--       fabrication this migration refuses elsewhere.
--   [x] migration 018 intact: 2 columns, 2 indexes, 1 trigger, 3 policies,
--       2 archive-aware position policies
--
-- ADVISORS  get_advisors(security), run after applying:
--   [x] The two SECURITY DEFINER RPC-exposure lints went 10 -> 11, adding
--       term_is_confirmed. PREDICTED IN REVIEW, and the same category as
--       is_official, stamp_activity_actor, stamp_official_archive and the
--       protect_* functions.
--
--       One honest difference from the trigger functions in that list:
--       they raise 0A000 if invoked over RPC, so for them the lint is a
--       pure false positive. This one IS genuinely callable, and returns
--       one boolean about whether a given term is confirmed -- which the
--       public page displays anyway, and which says nothing about drafts
--       (A3 above). Not a leak; recorded rather than waved away.
--   [x] NO `rls_disabled_in_public` finding for either new table
--   [x] Nothing else new. The other three findings are unchanged:
--       btree_gist in public (migration 010) and the Pro-only
--       leaked-password gap.
