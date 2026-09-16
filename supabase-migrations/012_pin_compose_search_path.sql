-- ============================================================
-- Barangay Batinguel E-System
-- 012 — pin search_path on compose_full_name
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-16 as migration `pin_compose_full_name_search_path`.
-- Re-tested afterwards: a resident editing first_name still
-- recomposes full_name correctly.
--
-- WHY
-- compose_full_name, added in 011, was created without a pinned
-- search_path -- the only function in this project that lacks one.
-- The Supabase security advisor flagged it within minutes:
--
--   function_search_path_mutable — WARN
--   "Function `public.compose_full_name` has a role mutable search_path"
--
-- It is not SECURITY DEFINER, so it runs as whoever triggered it and
-- the practical risk is small. But a function whose search_path
-- follows the caller can resolve an unqualified name to something it
-- did not mean, and being the one exception in a codebase is its own
-- cost: the next person has to work out whether it was deliberate.
--
-- Worth noting how this was caught. The advisor is cheap to run and
-- picks up things a passing read does not -- worth running after any
-- migration that adds a function, not only when hunting for problems.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compose_full_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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
