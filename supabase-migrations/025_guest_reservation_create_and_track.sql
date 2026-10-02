-- ============================================================
-- 025  GUEST RESERVATION: CREATE (returning the reference) AND TRACK
-- ============================================================
--
-- STATUS: APPLIED 2026-10-02 via the Supabase connector. Verified as
--         `anon`, `authenticated` and as the table owner; measured
--         results at the foot of this file.
--
-- ─── WHY create_court_reservation() EXISTS ────────────────────────────
--
-- The booking form now ends on a success step showing the reference, so
-- the guest has something to track with. The client cannot get it.
--
-- MEASURED, as `anon`:
--   plain INSERT                      -> ACCEPTED
--   INSERT ... RETURNING reference    -> 42501, "new row violates
--                                        row-level security policy"
--
-- The insert is allowed; it is the RETURNING that is refused, because
-- `reservations` has no SELECT policy for `anon` and PostgREST's
-- `.insert().select()` is INSERT ... RETURNING. CLAUDE.md already
-- records this exact trap in Working style -- "an insert that was
-- actually allowed reported as blocked" -- and it is the reason the
-- isolation above was run before believing the first result.
--
-- ⚠️ THE FIX IS NOT AN ANONYMOUS SELECT POLICY. Granting `anon` SELECT
-- on `reservations` to solve a success screen would publish every
-- resident's name, email, phone number and free-text purpose. The
-- function below returns ONE value -- the reference of the row it just
-- created -- and nothing else.
--
-- ─── IT IS STRICTER THAN THE RLS POLICY IT REPLACES ───────────────────
--
-- SECURITY DEFINER bypasses RLS, so this function owns the constraints
-- migration 008 put in the INSERT policies. It does not re-state them;
-- it makes them unreachable:
--
--   status       hardcoded 'pending'      -- not a parameter
--   reviewed_by  never written            -- not a parameter
--   resident_id  auth.uid(), or NULL      -- not a parameter
--
-- 008 had to allow `resident_id = auth.uid() OR NULL` because the
-- client supplied it. Here the caller cannot supply it at all, so a
-- booking cannot be attributed to somebody else and cannot arrive
-- pre-approved. Every trigger still runs: the window guard (020/021),
-- the reference stamp (024), the exclusion constraint (010) and the
-- Treasurer notification (022).
--
-- ─── TRACKING: TWO FACTORS, NOT ONE ───────────────────────────────────
--
-- `track_court_reservation` requires the reference AND the contact
-- number the booking was made with. The reference alone is not enough.
--
-- Threat model, and what answers each:
--
--   Enumeration          references are random, 32^6 per year (024),
--                        and are not sequential.
--   Reference guessing   a correct guess still fails without the
--                        matching contact number.
--   Contact guessing     a correct phone number is useless without the
--                        reference; there is no "list my bookings by
--                        phone" path.
--   Oracle via errors    a wrong reference and a wrong contact number
--                        return the SAME empty result. The function
--                        never says which half was wrong, so it cannot
--                        confirm that a reference exists.
--   Broad exposure       no anonymous SELECT policy was added. This
--                        function is the only anonymous read path and
--                        it returns at most ONE row.
--   PII leakage          the SELECT list is fixed and narrow -- see
--                        below. Internal notes, the audit trail, the
--                        resident's email and other people's bookings
--                        are not reachable through it.
--   Transcription        the reference is normalised on both sides, so
--                        an O read for a zero still matches (024).
--
-- ⚠️ WHAT IT DELIBERATELY DOES NOT RETURN:
--   purpose            free text a resident wrote about their own
--                      activity -- officials only, the same rule that
--                      keeps it out of get_reservation_slots.
--   exception_reason   same, and explicitly excluded by 020's header.
--   additional_notes   same.
--   email              not needed to show a booking's status.
--   id, resident_id    database identifiers have no business in a
--                      public response.
--   reviewed_by        who decided is internal.
--
-- `full_name` and `contact_number` ARE returned, but masked, so the
-- person can confirm they are looking at their own booking without the
-- response becoming a way to read somebody's full details out of a
-- lucky guess. Masking happens IN THE DATABASE, not in the client --
-- a client-side mask ships the real value to the browser and hides it
-- with CSS.
--
-- ============================================================

-- ─── 1. Create ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_court_reservation(
  p_full_name        text,
  p_purok            text,
  p_contact_number   text,
  p_email            text,
  p_residency_status text,
  p_preferred_date   date,
  p_preferred_time   text,
  p_duration_hours   int,
  p_end_time         text,
  p_purpose          text,
  p_activity_type    text,
  p_additional_notes text DEFAULT NULL,
  p_exception_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reference text;
BEGIN
  -- Cheap shape checks so an obviously empty submission fails here
  -- rather than as a constraint violation the resident cannot read.
  -- The REAL rules stay in the triggers and constraints; this is
  -- politeness, not enforcement.
  IF COALESCE(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'A name is required.' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(btrim(p_contact_number), '') = '' THEN
    RAISE EXCEPTION 'A contact number is required so the barangay can reach you.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reservations (
    full_name, purok, contact_number, email, residency_status,
    preferred_date, preferred_time, duration_hours, end_time,
    purpose, activity_type, additional_notes, exception_reason,
    -- ⚠️ The three the caller cannot influence. See the header.
    status, reviewed_by, resident_id
  )
  VALUES (
    btrim(p_full_name), p_purok, btrim(p_contact_number), p_email,
    p_residency_status, p_preferred_date, p_preferred_time,
    p_duration_hours, p_end_time, p_purpose, p_activity_type,
    p_additional_notes,
    NULLIF(btrim(COALESCE(p_exception_reason, '')), ''),
    'pending', NULL, auth.uid()
  )
  RETURNING reference INTO v_reference;

  RETURN v_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.create_court_reservation(
  text, text, text, text, text, date, text, int, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_court_reservation(
  text, text, text, text, text, date, text, int, text, text, text, text, text) TO anon, authenticated;

-- ─── 2. Track ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_court_reservation(
  p_reference text,
  p_contact   text
)
RETURNS TABLE (
  reference      text,
  status         text,
  preferred_date date,
  preferred_time text,
  end_time       text,
  duration_hours int,
  activity_type  text,
  is_exception   boolean,
  requester      text,
  contact_masked text,
  filed_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    r.reference,
    r.status,
    r.preferred_date,
    r.preferred_time,
    r.end_time,
    r.duration_hours,
    r.activity_type,
    -- Whether it was an office-hours request, WITHOUT the reason text.
    -- The same predicate the rest of the system uses: read from
    -- exception_reason, never from the hour (020).
    (r.exception_reason IS NOT NULL) AS is_exception,
    -- "Ezequel B." -- enough to recognise your own booking, not enough
    -- to harvest a name from a lucky guess.
    split_part(btrim(r.full_name), ' ', 1)
      || CASE
           WHEN strpos(btrim(r.full_name), ' ') > 0
           THEN ' ' || upper(substr(split_part(btrim(r.full_name), ' ',
                  array_length(string_to_array(btrim(r.full_name), ' '), 1)), 1, 1)) || '.'
           ELSE ''
         END AS requester,
    -- Masked in the DATABASE. A client-side mask would ship the real
    -- number to the browser and hide it with CSS.
    CASE
      WHEN length(btrim(r.contact_number)) >= 4
      THEN repeat('*', greatest(length(btrim(r.contact_number)) - 4, 0))
           || right(btrim(r.contact_number), 4)
      ELSE '****'
    END AS contact_masked,
    r.created_at AS filed_at
  FROM public.reservations r
  WHERE
    -- Both sides normalised, so a transcription slip still matches.
    public.normalize_reservation_reference(r.reference)
      = public.normalize_reservation_reference(p_reference)
    -- Digits only on both sides: a resident may type 0917 123 4567,
    -- +639171234567 or 09171234567 for the same phone.
    AND regexp_replace(COALESCE(r.contact_number, ''), '[^0-9]', '', 'g')
      = regexp_replace(COALESCE(p_contact, ''), '[^0-9]', '', 'g')
    -- Defence in depth: a blank pair must never match a row.
    AND COALESCE(btrim(p_reference), '') <> ''
    AND regexp_replace(COALESCE(p_contact, ''), '[^0-9]', '', 'g') <> ''
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.track_court_reservation(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_court_reservation(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.track_court_reservation(text, text) IS
  'Public two-factor reservation lookup: reference AND contact number. '
  'Returns at most one row and a fixed narrow column list. A wrong '
  'reference and a wrong contact number give the same empty result, so '
  'it cannot confirm that a reference exists.';

-- ============================================================
-- VERIFICATION  (measured; results recorded)
-- ============================================================
--
-- As `anon` unless stated. Every write rolled back.
--
-- CREATE
--  1. anon can create and GETS THE REFERENCE BACK:
--     MEASURED: returned BCR-2026-...., 6 valid characters.
--  2. The row it wrote is pending, unreviewed, unattributed:
--     MEASURED: status='pending', reviewed_by IS NULL,
--     resident_id IS NULL.
--  3. status/reviewed_by/resident_id are NOT parameters, so there is
--     nothing to pass -- a caller cannot ask for 'approved'.
--  4. The window guard still fires THROUGH the function -- SECURITY
--     DEFINER bypasses RLS, not triggers:
--       9:00 AM start, no reason      MEASURED: refused P0001
--                                     ("An office-hours booking needs
--                                     a reason...")
--       ordinary booking of 5 hours   MEASURED: refused P0001 (021's cap)
--       5:00 PM / 2h                  MEASURED: accepted, BCR-2026-ASN49D
--
--     ⚠️ THE FIRST RUN OF THIS CHECK REPORTED "GUARD BYPASSED" AND WAS
--     WRONG. enforce_reservation_window() opens with
--         IF auth.role() IS NULL OR auth.role() = 'service_role'
--           THEN RETURN NEW;
--     -- the documented direct-connection bypass, so the SQL Editor can
--     correct data. A probe that does `SET LOCAL role anon` WITHOUT
--     setting request.jwt.claims has auth.role() = NULL, so the guard
--     correctly skipped and the probe looked like a security hole.
--     Re-run with set_config('request.jwt.claims','{"role":"anon"}',true)
--     -- which is what PostgREST always sends -- auth.role() reads
--     'anon' and every rule fires. Recorded because the first result
--     was alarming and wrong: always ask which step produced it.
--
--  4b. For the same reason, check 2 first came back NULL: as `anon` the
--     function's own row is not SELECT-able, so reading it back inside
--     the probe returned no row. Re-read as the owner:
--     MEASURED status='pending', reviewed_by IS NULL, resident_id IS NULL.
--
-- TRACK
--  5. Correct reference + correct contact -> 1 row. MEASURED.
--  6. Correct reference + WRONG contact   -> 0 rows. MEASURED.
--  7. WRONG reference + correct contact   -> 0 rows. MEASURED.
--  8. 6 and 7 are indistinguishable: both 0 rows, no error, no hint.
--  9. Reference transcribed with O for 0 / L for 1 still matches.
--     MEASURED.
-- 10. Contact typed as '0917 123 4567' matches '09171234567'.
--     MEASURED.
-- 11. Blank reference + blank contact -> 0 rows (not "first row").
--     MEASURED.
-- 12. Masked payload MEASURED: requester 'Ezequel B.',
--     contact_masked '*********4567'.
-- 12b. The result carries NO purpose, exception_reason,
--     additional_notes, email, id, resident_id or reviewed_by --
--     enforced by the RETURNS TABLE column list, not by the caller.
-- 13. Still no anonymous SELECT policy on reservations: as anon,
--     `select * from reservations` MEASURED 0 rows.
