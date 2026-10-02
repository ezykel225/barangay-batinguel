-- ============================================================
-- 024  A PUBLIC REFERENCE NUMBER FOR COURT RESERVATIONS
-- ============================================================
--
-- STATUS: APPLIED 2026-10-02 via the Supabase connector, in five
--         pieces (see APPLYING, below). Backfilled, NOT NULL set, and
--         verified in both directions; measured results at the foot of
--         this file.
--
-- ⚠️ APPLYING: `DROP TRIGGER` could not be sent through the connector
--    in this environment -- it is treated as a destructive statement
--    and the call times out waiting for a confirmation that never
--    arrives, through BOTH apply_migration and execute_sql. Measured
--    three times; the identical statement WITHOUT the DROP applied
--    instantly, and `pg_locks` on `reservations` was empty throughout,
--    so it was never a database lock. If you re-run this file by hand
--    in the SQL Editor the DROP is fine; through the connector, send
--    the CREATE TRIGGER on its own.
--
-- ─── WHY ──────────────────────────────────────────────────────────────
--
-- A guest may book the covered court without an account (008), and now
-- needs to be able to check what happened to that booking. Before this
-- migration `reservations` had NO public identifier: the only key was
-- `id uuid`.
--
-- A uuid is unusable for this. It cannot be read down a phone or
-- written on a slip at the barangay hall, and putting the actual row id
-- in a public URL is a thing to avoid rather than a thing to do.
--
-- ─── THE FORMAT ───────────────────────────────────────────────────────
--
--     BCR-2026-AB12CD
--
-- `BCR` = Barangay Court Reservation. Then the year the booking was
-- filed, then six characters of Crockford base32.
--
-- ⚠️ IT IS RANDOM, NOT SEQUENTIAL. A sequential public number
-- (BCR-2026-000017) tells anybody holding one that 000016 and 000018
-- exist, which turns the tracking page into a directory of other
-- people's bookings. 32^6 is ~1.07 billion per year, so guessing one is
-- not a practical attack even before the second factor below.
--
-- ⚠️ THE REFERENCE ALONE IS NOT ENOUGH TO READ A BOOKING. The tracking
-- function added in 025 requires the reference AND the contact number
-- the booking was made with. This column is an identifier, never a
-- credential, and nothing here grants any read access -- `reservations`
-- still has no anonymous SELECT policy at all.
--
-- ─── CROCKFORD BASE32, AND WHY NORMALISATION MATTERS ──────────────────
--
-- Alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ -- 32 characters with I, L,
-- O and U removed. I and L look like 1, O looks like 0, and U is left
-- out so a random string cannot spell something unfortunate.
--
-- `normalize_reservation_reference()` then maps the look-alikes BACK on
-- lookup: O -> 0, I -> 1, L -> 1, case folded, and every character that
-- is not a letter or digit dropped. So a resident who writes down
-- "bcr 2026 abl2cd" or reads an O for a 0 still finds their booking.
-- Generation never emits the ambiguous characters; lookup forgives
-- them. That asymmetry is deliberate.
--
-- ─── THE VALUE IS STAMPED, NEVER ACCEPTED FROM THE CLIENT ─────────────
--
-- `stamp_reservation_reference` is a BEFORE INSERT trigger that
-- OVERWRITES whatever the client sent, the same pattern
-- `stamp_activity_actor` (015) and `stamp_notification_read` (022) use.
-- Without it an anonymous caller could choose their own reference --
-- or, worse, choose one that collides with somebody else's and find
-- out whose it was from the error.
--
-- ⚠️ It must NOT be a DEFAULT. A default is only applied when the
-- column is omitted, so `insert ... (reference) values ('BCR-2026-AAAAAA')`
-- would sail straight past it. Verified below.
--
-- ============================================================

-- ─── 1. The column ────────────────────────────────────────────────────
-- Nullable at first so the backfill can run; the NOT NULL is added in
-- 024b once every existing row has one.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reference text;

-- UNIQUE gives us the index the lookup needs as well as the guarantee.
-- There is no separate index: a unique constraint is backed by one.
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_reference_key;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_reference_key UNIQUE (reference);

-- ─── 2. Normalisation, shared by generation and lookup ────────────────
--
-- IMMUTABLE: the same input always gives the same output, with no
-- reads. That lets it be used in an index or a constraint later if
-- wanted, and tells the planner it is safe to fold.
CREATE OR REPLACE FUNCTION public.normalize_reservation_reference(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_input IS NULL THEN NULL
    ELSE translate(
           regexp_replace(upper(btrim(p_input)), '[^A-Z0-9]', '', 'g'),
           'OIL',
           '011'
         )
  END;
$$;

COMMENT ON FUNCTION public.normalize_reservation_reference(text) IS
  'Folds a human-typed reference to its canonical form: uppercase, '
  'punctuation removed, Crockford look-alikes mapped (O->0, I/L->1). '
  'Generation never emits O, I, L or U; lookup forgives them.';

-- ─── 3. Generation ────────────────────────────────────────────────────
--
-- gen_random_bytes (pgcrypto, already installed) rather than random():
-- this string is the public handle on somebody's booking, so it should
-- not come from a seedable PRNG.
CREATE OR REPLACE FUNCTION public.generate_reservation_reference(p_year int)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  -- 32 characters. I, L, O and U are absent on purpose -- see header.
  k_alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_body     text;
  v_bytes    bytea;
  i          int;
BEGIN
  v_body := '';
  v_bytes := extensions.gen_random_bytes(6);
  FOR i IN 0..5 LOOP
    -- get_byte is 0..255; 32 divides 256 exactly, so a plain modulo is
    -- uniform here. (It would NOT be for an alphabet whose length does
    -- not divide 256 -- that is why the alphabet is exactly 32.)
    v_body := v_body || substr(k_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN 'BCR-' || p_year::text || '-' || v_body;
END;
$$;

-- ─── 4. The stamp ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_reservation_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year      int;
  v_candidate text;
  v_attempt   int := 0;
BEGIN
  -- ⚠️ Whatever the client sent is DISCARDED. This is the 015 pattern:
  -- an identifier a caller can choose is not an identifier.
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;

  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_reservation_reference(v_year);

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.reference = v_candidate
    );

    -- 32^6 is ~1.07 billion, so reaching this is a sign something is
    -- wrong rather than bad luck. Ten tries then give up loudly: a
    -- booking with no reference cannot be tracked, so failing the
    -- insert is better than writing one.
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION
        'Could not allocate a unique reservation reference after % attempts', v_attempt
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  NEW.reference := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_reservation_reference ON public.reservations;
CREATE TRIGGER trg_stamp_reservation_reference
  BEFORE INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_reservation_reference();

-- ⚠️ TRIGGER ORDER. Postgres fires same-timing triggers in ALPHABETICAL
-- order, which CLAUDE.md records as load-bearing for
-- trg_compose_full_name. Here it does not matter:
-- `trg_enforce_reservation_window` (020) and this one touch disjoint
-- columns -- the window guard reads preferred_time/duration_hours and
-- never looks at `reference`; this one writes `reference` and reads
-- nothing the guard cares about. Either order produces the same row.
-- Recorded so the next person does not have to re-derive it.

-- ============================================================
-- VERIFICATION  (run after applying; results recorded here)
-- ============================================================
--
-- 1. A client-chosen reference is discarded, not honoured. Inserting
--    with reference = 'BCR-2026-AAAAAA':
--    MEASURED: stored 'BCR-2026-DT2JC1'; client_value_honoured = false,
--    format_ok = true. Rolled back.
--    This is the property the whole design rests on -- an identifier a
--    caller can choose is not an identifier.
--
-- 2. Uniqueness holds and the format is right:
--    MEASURED after backfill: total 21, with_reference 21,
--    distinct_references 21, format_ok true.
--
-- 3. No ambiguous character is ever generated:
--      select count(*) from reservations where reference ~ '[ILOU]';
--    MEASURED: 0.
--
-- 4. Normalisation folds what a human would mistype. Both
--    'bcr 2026 abl2cd' (lowercase, spaces, L read for 1) and the
--    canonical 'BCR-2026-AB12CD':
--    MEASURED: both -> 'BCR2026AB12CD', equal = true.
--
-- 5. Nothing about read access changed. `reservations` still has no
--    anonymous SELECT policy; as `anon`,
--      select reference from reservations;
--    MEASURED: 0 rows (RLS filters rather than raising).

-- ─── 5. NOT NULL, once every row has one ──────────────────────────────
-- Applied AFTER the backfill, so it could never fail on legacy data.
ALTER TABLE public.reservations ALTER COLUMN reference SET NOT NULL;

COMMENT ON COLUMN public.reservations.reference IS
  'Public booking reference, BCR-YYYY-XXXXXX. Stamped by '
  'trg_stamp_reservation_reference, which DISCARDS any client-supplied '
  'value. An identifier, never a credential: tracking also requires the '
  'contact number.';

-- MEASURED: is_nullable = NO.
--
-- ─── THE BACKFILL (run once, recorded for the record) ─────────────────
-- Each legacy row was given a reference for the year it was actually
-- FILED rather than the current year, so the number matches the
-- booking's own history. A DO block looping per row, because
-- generate_reservation_reference() is VOLATILE and a set-based UPDATE
-- would not re-evaluate it per row -- which would have handed all 21
-- rows the same reference and then failed the unique constraint.

-- ─── 6. The REST surface (added 2026-10-02, after get_advisors) ───────
--
-- `stamp_reservation_reference` is a TRIGGER function, so calling it
-- over `/rest/v1/rpc/` raises 0A000 and it was inert -- but a trigger
-- function has no business on the REST surface, and `get_advisors`
-- flags it. ⚠️ The role-level revoke alone did nothing: CREATE FUNCTION
-- grants EXECUTE to PUBLIC, and anon and authenticated inherit it.
-- MEASURED -- the ACL still read `=X/postgres` until PUBLIC was
-- revoked too. Verified after: `postgres=X | service_role=X`.
REVOKE EXECUTE ON FUNCTION public.stamp_reservation_reference() FROM PUBLIC, anon, authenticated;
