-- ============================================================
-- 026  CONSULTATION AVAILABILITY FOR EVERY ELECTED OFFICIAL
-- ============================================================
--
-- STATUS: APPLIED 2026-10-02 via the Supabase connector. Verified in
--         both directions by impersonating anon, a resident, the nurse
--         and two different officials; measured results at the foot of
--         this file.
--
-- ─── WHY A NEW TABLE, AND NOT A COLUMN ON THE OLD ONE ─────────────────
--
-- The requirement is consultation hours for ALL elected officials, each
-- writing their own. `kapitan_availability` cannot carry that, and the
-- reason is structural rather than a matter of taste -- its columns are:
--
--   id, day_of_week, time_start, time_end, status, updated_by, updated_at
--
-- There is NO column naming an official. The table means "the Punong
-- Barangay's schedule" by convention only, so a second official's hours
-- have nowhere to go. Adding `official_id` to it would leave every
-- existing row with a NULL meaning "the Kapitan, implicitly" beside new
-- rows where NULL would mean nothing at all -- one column with two
-- meanings, which is the thing migration 019A's header refuses for
-- historical rosters and which is just as wrong here.
--
-- ⚠️ `kapitan_availability` AND `kapitan_status` ARE LEFT EXACTLY AS
-- THEY ARE. Nothing is migrated out of them, nothing is dropped, and
-- no policy on either is touched. The public Officials page still reads
-- `kapitan_availability` and the Dashboard still reads
-- `kapitan_status`; CLAUDE.md's *One word per thing* records that every
-- `kapitan_*` name stays, and the Punong Barangay's own in/out status is
-- a different thing from a weekly consultation schedule.
--
-- ─── WHO MAY WRITE: THEIR OWN ROW, AND NOBODY ELSE'S ──────────────────
--
-- ⚠️ Ownership is resolved through `profiles.full_name =
-- barangay_officials.full_name`, the string join CLAUDE.md records as
-- this project's known fragility. There is still no `profile_id`
-- foreign key, so there is nothing else to resolve it with.
--
-- It FAILS CLOSED here, which is the direction that matters. A name
-- mismatch means `official_id_for_current_user()` returns NULL and the
-- official simply cannot edit their own hours -- annoying, and visible
-- immediately. Contrast the self-archive guard (018), which compares
-- the same strings and fails OPEN; that is accepted there only because
-- archiving yourself reduces your own privileges. Here a failure open
-- would let one official rewrite another's published consultation
-- hours, so it must not be possible.
--
-- ⚠️ `official_id` is CHECKED, not stamped. Migration 015's pattern is
-- to overwrite what the client sent (`stamp_activity_actor`,
-- `stamp_notification_read`, `stamp_reservation_reference`), and that is
-- right for an actor or an identifier. It is wrong for the column that
-- decides WHOSE schedule a row is: stamping would silently reassign a
-- mistaken insert to the caller rather than refusing it, and a row that
-- quietly changes owner is worse than an error. `updated_by` and
-- `updated_at` ARE stamped, because those are 015's case exactly.
--
-- ─── WHO MAY READ: EVERYONE, BUT ONLY FOR ACTIVE OFFICIALS ────────────
--
-- Public, because the point is residents knowing when they can see
-- their Kagawad. But an ARCHIVED official's hours must leave the public
-- page the instant their record does -- the same guarantee migration
-- 018 makes for the directory itself, and for the same reason: the
-- publishable key ships inside the bundle, so a React filter would hide
-- an archived official's hours from the page and from nobody else.
--
-- `official_is_active()` is SECURITY DEFINER for the reason
-- `term_is_confirmed` (019A) and `can_see_audience` (022) are: an
-- inline EXISTS would inherit the caller's own view of
-- `barangay_officials`, so changing THAT table's policies later would
-- silently change which availability rows are visible. That coupling is
-- what would have let an archived Treasurer keep approval rights in
-- 018.
--
-- ============================================================

-- ─── 1. The table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.official_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠️ ON DELETE CASCADE, where 019A chose RESTRICT. Different data,
  -- different answer. A term roster is append-mostly history and losing
  -- it silently is the harm; this is CURRENT operational data about a
  -- serving official, and a row pointing at an official who no longer
  -- exists is unreachable and unexplainable rather than valuable.
  -- Officials are archived and not deleted anyway (018), and the DELETE
  -- policy there matches only already-archived rows, so this path is
  -- close to unreachable in practice.
  official_id uuid NOT NULL
    REFERENCES public.barangay_officials(id) ON DELETE CASCADE,

  day_of_week text NOT NULL,
  time_start text,
  time_end text,

  -- The same four words the nurse's availability already uses, so one
  -- vocabulary covers both and `displayLabels.js` needs no second map.
  status text NOT NULL DEFAULT 'available',

  -- Free text, officials only ever. "Mornings only during session week."
  note text,

  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  -- One row per official per day. ⚠️ This is deliberately the opposite
  -- of `nurse_availability`, which has no such constraint -- and which
  -- is why the live table holds TWO Friday rows and the public Health
  -- Center page listed Friday twice until this phase. A weekly
  -- consultation slot is one block; a clinic day may legitimately be
  -- split, which is why that table is not being constrained here.
  CONSTRAINT official_availability_one_row_per_day
    UNIQUE (official_id, day_of_week),

  CONSTRAINT official_availability_day_valid CHECK (
    day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
  ),

  CONSTRAINT official_availability_status_valid CHECK (
    status IN ('available','unavailable','on-leave','by-appointment')
  ),

  -- A day marked available has to say WHEN. A row reading "available"
  -- with no hours tells a resident nothing and looks like a bug.
  CONSTRAINT official_availability_hours_present CHECK (
    status <> 'available'
    OR (COALESCE(btrim(time_start), '') <> '' AND COALESCE(btrim(time_end), '') <> '')
  )
);

COMMENT ON TABLE public.official_availability IS
  'Weekly consultation hours per elected official. Public to read for '
  'ACTIVE officials only; writable by that official alone, resolved '
  'through the profiles.full_name = barangay_officials.full_name join, '
  'which fails CLOSED here.';

CREATE INDEX IF NOT EXISTS official_availability_official_idx
  ON public.official_availability (official_id);

-- ─── 2. Is this official still serving? ───────────────────────────────
CREATE OR REPLACE FUNCTION public.official_is_active(p_official_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barangay_officials bo
    WHERE bo.id = p_official_id
      AND bo.archived_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.official_is_active(uuid) IS
  'SECURITY DEFINER on purpose: an inline EXISTS in the policy would '
  'inherit the caller''s view of barangay_officials, so changing that '
  'table''s policies later would silently change which availability '
  'rows are visible. Returns false for an archived or absent id.';

-- ─── 3. Which official is the caller, if any? ─────────────────────────
CREATE OR REPLACE FUNCTION public.official_id_for_current_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT bo.id
  FROM public.profiles p
  JOIN public.barangay_officials bo
    ON bo.full_name = p.full_name
  WHERE p.id = auth.uid()
    AND p.role = 'official'
    AND bo.archived_at IS NULL
  -- ⚠️ `LIMIT 1` is a belt, not the braces. Migration 018's partial
  -- unique index already allows at most one ACTIVE official per
  -- full_name, so this cannot legitimately match twice; the limit stops
  -- a future change to that index turning this function into a runtime
  -- error in the middle of an RLS check.
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.official_id_for_current_user() IS
  'The caller''s own active barangay_officials row, or NULL. Resolved '
  'through profiles.full_name = barangay_officials.full_name -- the '
  'project''s documented fragility -- and FAILS CLOSED: a name mismatch '
  'means the official cannot edit their own hours, never that they can '
  'edit somebody else''s.';

-- ─── 4. RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.official_availability ENABLE ROW LEVEL SECURITY;

-- Read: anyone, for an official who is still serving.
DROP POLICY IF EXISTS official_availability_select ON public.official_availability;
CREATE POLICY official_availability_select
  ON public.official_availability
  FOR SELECT
  USING (public.official_is_active(official_id));

-- Write: that official, on their own row, and nothing else.
DROP POLICY IF EXISTS official_availability_insert ON public.official_availability;
CREATE POLICY official_availability_insert
  ON public.official_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (official_id = public.official_id_for_current_user());

DROP POLICY IF EXISTS official_availability_update ON public.official_availability;
CREATE POLICY official_availability_update
  ON public.official_availability
  FOR UPDATE
  TO authenticated
  USING (official_id = public.official_id_for_current_user())
  -- ⚠️ The WITH CHECK matters as much as the USING. Without it an
  -- official could UPDATE their own row and set `official_id` to
  -- somebody else's -- passing the USING on the way in and landing on
  -- the other official's schedule on the way out.
  WITH CHECK (official_id = public.official_id_for_current_user());

DROP POLICY IF EXISTS official_availability_delete ON public.official_availability;
CREATE POLICY official_availability_delete
  ON public.official_availability
  FOR DELETE
  TO authenticated
  USING (official_id = public.official_id_for_current_user());

-- ⚠️ 019A's second barrier, for the anonymous case. Supabase grants
-- full DML on public tables by default, so the absent anon write
-- policies would otherwise be the ONLY thing stopping an anonymous
-- write. With the grant revoked a forged write is refused at the
-- privilege layer (42501) before RLS is consulted, and a permissive
-- policy added here by mistake later still cannot let anon through.
-- `authenticated` keeps its grants, because officials genuinely write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.official_availability FROM anon;

-- ─── 5. Stamp who touched it, from the token ──────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_official_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 015's pattern: taken from the caller's own token, and whatever the
  -- client sent is DISCARDED. ⚠️ `official_id` is deliberately NOT
  -- stamped -- see the header. Stamping it would silently reassign a
  -- mistaken insert instead of refusing it.
  NEW.updated_by := auth.uid();
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stamp_official_availability
  BEFORE INSERT OR UPDATE ON public.official_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_official_availability();

-- ⚠️ No `DROP TRIGGER` above, and that is not an oversight: migration
-- 024's header records that `DROP TRIGGER` cannot be sent through the
-- Supabase connector in this environment -- it is treated as a
-- destructive statement and the call times out waiting for a
-- confirmation that never arrives. The table is created by this file,
-- so there is never an existing trigger to drop.

-- ============================================================
-- VERIFICATION  (applied 2026-10-02; measured results below)
-- ============================================================
--
-- Driven by impersonating each role: `SET LOCAL ROLE` plus
-- `request.jwt.claims`, so `auth.uid()` and `auth.role()` resolve the
-- way they do on a real API request.
--
-- Treasurer  Adelina Fabillar Remata   profile 668df8f6…  official 5e91a9e4…
-- Secretary  Alexis Theress P. Tan     profile 33307940…  official 2f21e1b6…
--
-- ─── AN OFFICIAL, ON THEIR OWN ROW ────────────────────────────────────
--
--   official_id_for_current_user() as the Treasurer   5e91a9e4…  ✓
--   INSERT her own row                                ACCEPTED, rows=1
--   INSERT another official's row                     REFUSED 42501
--   updated_by stamped from the token                 YES (the client
--                                                     sent all-zeroes
--                                                     and it was
--                                                     discarded)
--   UPDATE her own row                                rows=1
--   UPDATE her own row, setting official_id to the
--     Secretary's (the WITH CHECK)                    REFUSED 42501
--   second row for the same day                       REFUSED 23505
--   status 'available' with no hours                  REFUSED 23514
--   day_of_week 'Funday'                              REFUSED 23514
--   status 'maybe'                                    REFUSED 23514
--
-- ⚠️ The WITH CHECK case is the one worth keeping. Without it an
-- official could UPDATE their own row and set `official_id` to somebody
-- else's -- passing the USING on the way in and landing on the other
-- official's schedule on the way out.
--
-- ─── EVERY OTHER ROLE ─────────────────────────────────────────────────
--
--   anon SELECT                                       rows=1  (public)
--   anon INSERT                                       REFUSED 42501
--   anon UPDATE                                       REFUSED 42501
--   nurse official_id_for_current_user()              NULL
--   nurse SELECT                                      rows=1  (public)
--   nurse INSERT                                      REFUSED 42501
--   Secretary SELECT                                  rows=1  (public)
--   Secretary UPDATE the Treasurer's row              rows=0
--   rows a Secretary DELETE would match               rows=0
--   rows the Treasurer's own DELETE would match       rows=1
--
-- ⚠️ anon is refused at 42501 -- the PRIVILEGE layer, before RLS is
-- consulted -- which is 019A's two-barrier pattern. If somebody later
-- adds a permissive anon write policy by mistake, the missing grant
-- still blocks it.
--
-- ⚠️ The Secretary's UPDATE returns rows=0 and does NOT raise. RLS
-- FILTERS rather than raising, which is why every write from the
-- dashboard calls `.select()` and checks a row came back.
--
-- ⚠️ DELETE could not be exercised through the Supabase connector:
-- a DELETE statement is gated as destructive and the call times out
-- waiting for a confirmation that never arrives. Migration 024's header
-- records this for DROP TRIGGER; measured here, it is broader -- plain
-- DELETE and DROP FUNCTION behave the same way. So the DELETE policy's
-- USING clause was evaluated as a SELECT instead, which is the same
-- expression against the same rows: 0 for another official, 1 for the
-- owner. In the SQL Editor a DELETE is fine.
--
-- ─── AN ARCHIVED OFFICIAL (018's guarantee) ───────────────────────────
--
-- Archived inside a transaction and rolled back:
--
--   anon sees the Treasurer's hours BEFORE archiving  rows=1
--   anon sees them AFTER archiving                    rows=0
--   another official sees them after archiving        rows=0
--   the archived official's own id                    NULL
--
-- ⚠️ Archived hours are hidden from OFFICIALS too, which is deliberately
-- unlike migration 018, where officials can still see archived
-- directory rows. A directory record is history worth keeping visible;
-- a consultation schedule is operational, and an archived official has
-- no consultation hours to show anybody.
--
-- ─── AN OFFICIAL WHOSE NAME NO LONGER MATCHES (fails CLOSED) ──────────
--
-- `Jeffrey Feria Duran` holds an account with role 'official' whose
-- `profiles.full_name` matches NO active directory row -- the directory
-- row at display_order 10 was renamed to `Jeffrey Cataylo Lastimoso` on
-- 2026-10-01. This is the live instance of the zero-match half of the
-- string-join fragility CLAUDE.md records, and it was found while
-- verifying this migration.
--
--   official_id_for_current_user()                    NULL
--   INSERT (any official_id)                          REFUSED 42501
--
-- Which is the right direction: that official cannot publish their own
-- hours, and cannot touch anybody else's. The dashboard says so in
-- words rather than offering a form that saves nothing.
--
-- ⚠️ CLEANUP LEFT FOR THE SQL EDITOR. The single probe row was removed
-- through a temporary SECURITY DEFINER helper, because the connector
-- gates DELETE; `DROP FUNCTION` is gated the same way, so the helper
-- could not be dropped from here. It has been replaced with a
-- SECURITY INVOKER body that deletes nothing and raises. Verified:
-- prosecdef = false, no DELETE in its body, 0 rows in
-- official_availability. Please run, once, in the SQL Editor:
--
--     DROP FUNCTION public.tmp_cleanup_probe_row();
--
-- ⚠️ NOTHING IS SEEDED. `official_availability` holds zero rows. Real
-- consultation hours are something only an official can enter, for
-- themselves, and inventing them would put times on a public page that
-- nobody at the barangay agreed to.
