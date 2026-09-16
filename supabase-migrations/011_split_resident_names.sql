-- ============================================================
-- Barangay Batinguel E-System
-- 011 — separate name parts on profiles
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-16 as migration `split_resident_names`.
--
-- Verified, each case in a transaction that was rolled back:
--   backfill recomposes all 3 residents to a byte-identical
--     full_name, so no name changed                        PASS
--   officials and the nurse keep NULL parts and an untouched
--     full_name, so the barangay_officials join is intact   PASS
--   a VERIFIED resident editing only first_name (no full_name
--     sent at all) -> full_name recomposed AND the account
--     dropped to 'pending' with a note                      PASS
--   full My Details payload (parts, no full_name) round-trips
--     under RLS as that resident                            PASS
--   clearing the middle name and suffix leaves "Juan Dela Cruz",
--     14 characters -- no double space                      PASS
--
-- The third case is the one worth keeping: it only passes because
-- trg_compose_full_name sorts before trg_prevent_role_self_change.
-- Rename either trigger and a verified account silently keeps its
-- verification under a new name.
--
-- WHY
-- Signup collected one "Full Name" box. Barangay paperwork is filled
-- in as first / middle / last / suffix, so an official comparing an
-- account against an ID or the registry was reading a single string
-- and splitting it in their head. Middle names in particular are a
-- mother's maiden surname here, and whether one was given at all was
-- impossible to tell from "Juan Dela Cruz".
--
-- WHY full_name STAYS
-- It is read all over: the registry cross-reference, document
-- requests, reservations, every greeting, and -- for officials -- the
-- full_name string that joins profiles to barangay_officials and
-- decides who may approve what. Replacing it would mean touching all
-- of that at once.
--
-- So the parts are added alongside it and full_name becomes the
-- composed value, maintained by a trigger. Everything that reads
-- full_name keeps working and cannot drift from the parts.
--
-- WHY NOT A GENERATED COLUMN
-- That was the first instinct and it is wrong here. Officials and
-- nurses were created by hand and have no name parts, so a generated
-- column would compute NULL for them and silently break the
-- barangay_officials join -- the exact failure already flagged in
-- CLAUDE.md, where an official loses their permissions with no error
-- anywhere. The trigger below only recomposes when at least one part
-- is present, so rows without parts are left exactly as they are.
--
-- TRIGGER ORDER MATTERS
-- Postgres fires same-timing triggers in alphabetical order, so
-- `trg_compose_full_name` runs before `trg_prevent_role_self_change`.
-- That is deliberate and load-bearing: when a resident edits only
-- their first name, the client sends no full_name at all, so the
-- guard would compare OLD.full_name against itself, see no change,
-- and leave a verified account verified under a new name. Composing
-- first means the guard sees the real new value and sends them back
-- for re-verification, which is what migration 007 promises.
--
-- BACKFILL
-- Residents only, and only where full_name has content. First word is
-- the first name, last word the last name, anything between is the
-- middle. Checked against all three existing residents beforehand:
-- each one recomposes to a string identical to what it already had,
-- so the backfill changes no full_name. Officials and nurses are
-- deliberately skipped -- see above.
-- ============================================================


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name  text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name   text,
  ADD COLUMN IF NOT EXISTS suffix      text;


-- Keeps full_name equal to the parts whenever parts exist.
-- concat_ws drops NULLs, and nullif(btrim(...), '') turns an empty
-- box into a NULL so a missing middle name does not leave a double
-- space in the middle of somebody's name.
CREATE OR REPLACE FUNCTION public.compose_full_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.first_name IS NOT NULL
     OR NEW.middle_name IS NOT NULL
     OR NEW.last_name IS NOT NULL
     OR NEW.suffix IS NOT NULL
  THEN
    NEW.full_name := concat_ws(
      ' ',
      nullif(btrim(NEW.first_name),  ''),
      nullif(btrim(NEW.middle_name), ''),
      nullif(btrim(NEW.last_name),   ''),
      nullif(btrim(NEW.suffix),      '')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compose_full_name ON public.profiles;
CREATE TRIGGER trg_compose_full_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.compose_full_name();


-- ── Backfill: residents only ─────────────────────────────────
WITH parts AS (
  SELECT id,
         string_to_array(regexp_replace(btrim(full_name), '\s+', ' ', 'g'), ' ') AS w
  FROM public.profiles
  WHERE role = 'resident'
    AND full_name IS NOT NULL
    AND btrim(full_name) <> ''
    AND first_name IS NULL
)
UPDATE public.profiles p
SET first_name  = parts.w[1],
    middle_name = CASE WHEN array_length(parts.w, 1) > 2
                       THEN array_to_string(parts.w[2:array_length(parts.w, 1) - 1], ' ') END,
    last_name   = CASE WHEN array_length(parts.w, 1) > 1
                       THEN parts.w[array_length(parts.w, 1)] END
FROM parts
WHERE p.id = parts.id;


-- ── Signup trigger now carries the parts through ─────────────
-- full_name is still written here so a signup that somehow arrives
-- without parts still produces a usable row; trg_compose_full_name
-- overwrites it from the parts whenever they are present.
CREATE OR REPLACE FUNCTION public.handle_new_resident_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'resident' THEN
    INSERT INTO public.profiles (
      id, full_name, first_name, middle_name, last_name, suffix,
      role, contact_number, purok
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'middle_name',
      NEW.raw_user_meta_data->>'last_name',
      NEW.raw_user_meta_data->>'suffix',
      'resident',
      NEW.raw_user_meta_data->>'contact_number',
      NEW.raw_user_meta_data->>'purok'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
