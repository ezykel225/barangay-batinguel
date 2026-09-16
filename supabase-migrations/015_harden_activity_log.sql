-- ============================================================
-- Barangay Batinguel E-System
-- 015 — stop the audit trail accepting forged entries
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-16 as migration `harden_activity_log`.
--
-- Verified, each case in a transaction that was rolled back:
--   resident files "Barangay Secretary / verified / Someone Else"
--     -> "Only officials can record that kind of activity."   PASS
--   resident cancels their OWN booking, sending actor_name
--     "Punong Barangay" -> accepted, name replaced with their
--     real one                                                PASS
--   resident logs a cancellation of SOMEONE ELSE's booking
--     -> "You can only record activity on your own reservation." PASS
--   Treasurer logs an approval, sending the client's generic
--     "Official" -> accepted, stored as "Adelina Fabillar Remata" PASS
--
-- The third case needed two attempts. The first used INSERT ... SELECT
-- against reservations, which returned no rows -- a resident's SELECT
-- policy only shows their own bookings, so the subquery found nothing,
-- nothing was inserted and the trigger never fired. An empty result
-- looked like a refusal. Re-run with a literal id belonging to another
-- resident, it raised properly. A negative result is only worth
-- something once you know which step produced it.
--
-- WHY
-- The INSERT policy on activity_log was:
--
--   WITH CHECK (actor_id = auth.uid())
--
-- which pins who the row belongs to and nothing else. actor_name,
-- action, entity_type, subject and details were all free text from the
-- client. Demonstrated against the live database by inserting, as an
-- ordinary resident:
--
--   actor_name: "Barangay Secretary"
--   action:     "verified"
--   subject:    "Someone Else"
--
-- It was accepted. The resident could not read the log back -- SELECT
-- is officials-only -- but they could fill it with entries that read as
-- official actions.
--
-- CLAUDE.md already says an audit trail that can be edited is not an
-- audit trail. The same is true of one that can be written into.
--
-- WHY NOT SIMPLY RESTRICT INSERTS TO OFFICIALS
-- Residents write to it legitimately: cancelling a booking frees a
-- slot, and officials need to see who did that. So the fix is to stop
-- trusting the *contents*, not to stop residents appending.
--
-- WHAT THIS DOES
--
-- 1. actor_name is derived from profiles, server side, and whatever
--    the client sent is discarded. This is the change that matters:
--    an entry can no longer claim to be from someone it is not.
--
-- 2. actor_id is forced to auth.uid() rather than merely checked
--    against it, so the column cannot be left null or set to another
--    user by a caller that skips the policy's assumptions.
--
-- 3. action and entity_type are constrained to the vocabulary the
--    application actually uses. Free text in an audit trail cannot be
--    grouped, counted or trusted, and it is where an injected entry
--    would hide.
--
-- 4. A non-official may only record `cancelled` on a `reservation`,
--    and only on one that is their own. That is the single thing a
--    resident legitimately does here. Loosening this later is easy;
--    discovering it was too loose is not.
--
-- Direct database connections (SQL Editor, psql, a migration) bypass
-- all of it, the same way the other protect triggers do -- auth.role()
-- is NULL there and non-NULL on every PostgREST request.
--
-- NOT ADDRESSED
-- `subject` and `details` stay free text. They are descriptive fields
-- with no fixed vocabulary, and with actor_name and action pinned, a
-- misleading subject is attached to a truthful actor performing a real
-- action -- annoying, not deceptive.
-- ============================================================


-- ── 3. A fixed vocabulary ────────────────────────────────────
-- Checked against the live table first: every existing row already
-- uses these values.
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_action_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_action_check
  CHECK (action IN (
    'approved', 'declined', 'verified', 'rejected',
    'marked ineligible', 'cancelled'
  ));

ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'reservation', 'document_request', 'resident_account'
  ));


-- ── 1, 2 and 4. Stamp the actor; restrict what a resident may say ──
-- SECURITY DEFINER so the profiles lookup is deterministic rather than
-- dependent on the caller's own read policy, and search_path pinned
-- because migration 012 had to come back and add exactly that.
CREATE OR REPLACE FUNCTION public.stamp_activity_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_api_caller boolean := auth.role() IS NOT NULL
                           AND auth.role() <> 'service_role';
  caller_is_official boolean;
BEGIN
  IF NOT is_api_caller THEN
    RETURN NEW;
  END IF;

  caller_is_official := public.is_official(auth.uid());

  -- Identity is taken, never accepted.
  NEW.actor_id := auth.uid();
  NEW.actor_name := COALESCE(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    'Unknown'
  );

  IF NOT caller_is_official THEN
    IF NEW.action <> 'cancelled' OR NEW.entity_type <> 'reservation' THEN
      RAISE EXCEPTION
        'Only officials can record that kind of activity.';
    END IF;

    -- And only their own booking. Without this a resident could log a
    -- truthful-looking cancellation of somebody else's reservation.
    IF NEW.entity_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.reservations r
         WHERE r.id = NEW.entity_id AND r.resident_id = auth.uid()
       )
    THEN
      RAISE EXCEPTION
        'You can only record activity on your own reservation.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_activity_actor ON public.activity_log;
CREATE TRIGGER trg_stamp_activity_actor
  BEFORE INSERT ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.stamp_activity_actor();
