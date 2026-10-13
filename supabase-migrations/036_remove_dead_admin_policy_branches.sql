-- =============================================================================
-- 036  Remove the dead `admin` branches from the last eight RLS policies
-- =============================================================================
-- MASTER-B step B3.  APPLIED 2026-10-13 through the Supabase connector.
--
-- Eight RLS policies across four tables still read
--     profiles.role = ANY (ARRAY['admin', '<real role>'])
-- for a role that this system does not have.  There is no `admin` role in the
-- product, there is no `admin` row in `profiles`, and -- the part that settles
-- it -- `admin` is not a value `profiles.role` can even hold.  Each of the
-- eight disjuncts is therefore unreachable, and its removal changes the answer
-- for nobody.
--
-- This migration changes POLICY BOOLEAN EXPRESSIONS AND NOTHING ELSE.  No
-- policy is renamed, dropped or recreated; no policy's command or role
-- targeting changes; no table privilege, no function, no trigger, no
-- SECURITY DEFINER EXECUTE grant and no application file is touched.
--
-- -----------------------------------------------------------------------------
-- WHY `admin` IS DEAD -- six checks, not one
-- -----------------------------------------------------------------------------
-- "There are currently zero admin rows" is NOT sufficient on its own: a role
-- with no holders today can still be part of a product's authorization model.
-- So this was established six ways before anything was altered.
--
--   1. THE CHECK CONSTRAINT FORBIDS IT -- the decisive one.
--      profiles_role_check  ::  CHECK (role = ANY (ARRAY['official',
--                                                        'nurse',
--                                                        'resident']))
--      `admin` is not a storable value.  Measured, in TRUSTED SQL, with RLS
--      and the role-change trigger's API-caller branch both out of the way,
--      so that only the constraint could refuse it:
--          update profiles set role = 'admin'  ->  23514
--              new row for relation "profiles" violates check constraint
--              "profiles_role_check"
--      The brief anticipated this case and said to report it as additional
--      evidence rather than weaken the constraint to get a live admin caller.
--      The constraint was NOT dropped, relaxed or recreated.
--
--   2. No live holder.  28 profiles: official 11, nurse 1, resident 16,
--      admin 0.  `profiles.role` is plain `text` with NO default and there is
--      no enum type behind it, so the CHECK is the whole vocabulary.
--
--   3. Signup cannot create one.  `handle_new_resident_signup()` fires only
--      when the signup metadata says `role = 'resident'` and then writes the
--      literal `'resident'`.  Metadata claiming any other role creates no
--      profile at all.
--
--   4. No client self-promotion.  The `profiles` INSERT policy is
--      WITH CHECK ((auth.uid() = id) AND (role = 'resident')), and
--      `prevent_role_self_change()` raises on ANY role change by an API
--      caller.  Measured as that resident over the API:
--          update profiles set role = 'admin'  ->  P0001
--              "You cannot change your own account role."
--      The one UPDATE policy an official holds on `profiles` is
--      USING (is_official(auth.uid()) AND role = 'resident') with no
--      WITH CHECK, so USING governs the new row too -- an official cannot
--      move a row off 'resident' either.
--
--   5. No route expects one.  `ProtectedRoute` dispatches official / nurse /
--      resident and sends everything ELSE to `/login`; `Login.jsx`'s
--      post-auth ternary has official and nurse arms and treats the rest as a
--      resident.  Every role comparison in the whole frontend -- 25 of them --
--      names one of exactly three values.  There is no admin surface to reach.
--
--   6. No function, view, default, index or database role uses it.  Searched
--      `public`, `auth` and `storage` function bodies, view definitions,
--      CHECK constraints, column defaults and index definitions.
--      ⚠️ Two hits came back and BOTH are substring coincidences:
--        - `reservations_activity_type_check` contains 'Badminton';
--        - `protect_reservation_status()` contains the COMMENT
--          "-- migrations and admin tasks. Neither is restricted here.",
--          which is about a direct database connection, not about a role.
--      There is also no database role named `admin` (that is a separate
--      namespace from `profiles.role`, and it is empty too).
--
-- -----------------------------------------------------------------------------
-- WHY THE REWRITE IS SEMANTICALLY IDENTICAL
-- -----------------------------------------------------------------------------
-- `role = ANY (ARRAY['admin','official'])` and `role = 'official'` are NOT
-- equivalent in general -- they differ on exactly one input, role = 'admin'.
-- Check 1 is what makes them equivalent HERE: that input cannot occur.
--
-- Proven over every storable value and over NULL, so the equality holds in
-- three-valued logic and not merely on the happy path:
--
--     role          official-pair           nurse-pair
--                   old      new            old      new
--     'official'    true     true           false    false
--     'nurse'       false    false          true     true
--     'resident'    false    false          false    false
--     NULL          NULL     NULL           NULL     NULL
--
-- And row-for-row across all 28 live profiles: 0 rows where the old and new
-- expressions disagree, for either pair.
--
-- -----------------------------------------------------------------------------
-- ALTER POLICY, NOT DROP + CREATE
-- -----------------------------------------------------------------------------
-- Same two reasons migration 031 gave.  The connector gates destructive
-- statements, and `DROP POLICY` is not worth discovering at 60 seconds a try.
-- More importantly a drop-and-recreate has a window: between the two
-- statements the table has no policy of that name, so a failed CREATE would
-- leave the Official Portal unable to post an announcement with nothing
-- obviously wrong.  `ALTER POLICY` is one atomic catalog update.
--
-- ⚠️ ALTER POLICY ALSO PRESERVES THE CLAUSE PLACEMENT, which matters here:
-- the four UPDATE policies carry a USING expression and a NULL WITH CHECK
-- (so USING governs the new row too), and the four INSERT policies carry a
-- WITH CHECK and a NULL USING.  Naming only the one clause that exists leaves
-- the other NULL.  MEASURED in a rolled-back block before this was written:
--     UPDATE policy: using changed, with_check stayed <NULL>, roles stayed public
--     INSERT policy: with_check changed, using stayed <NULL>
-- A DROP + CREATE would have had to restate the placement from scratch, and
-- adding a WITH CHECK to an UPDATE policy that did not have one is a semantic
-- change dressed up as tidying.
--
-- -----------------------------------------------------------------------------
-- THE POLICY NAMES ARE DELIBERATELY NOT CHANGED
-- -----------------------------------------------------------------------------
-- All eight are still called "Admin and ... can ...".  Renaming them would be
-- a bigger diff than the fix, and the names are referenced:
-- `OfficialDashboard.jsx` carries a comment naming
-- "Admin and official can update announcements" as the policy that already
-- permits an edit.  Leaving the name correct keeps that comment true.
-- Nothing in the application reads a policy name at runtime.
-- A rename is available later as a cosmetic change of its own; it is not part
-- of removing a dead branch.
--
-- -----------------------------------------------------------------------------
-- WHAT WAS LEFT ALONE, AND WHY
-- -----------------------------------------------------------------------------
-- ⚠️ A NINTH POLICY HAS "Admin" IN ITS NAME AND NO ADMIN BRANCH IN ITS BODY:
--     reservations :: "Admin and official can view reservations"  (SELECT)
--     USING (EXISTS (SELECT 1 FROM profiles
--                     WHERE profiles.id = auth.uid()
--                       AND profiles.role = 'official'))
-- Its expression is ALREADY clean -- only the historical name survives.  It is
-- not touched at all: there is no dead branch in it to remove, and renaming it
-- is the cosmetic change this phase is not making.  Recorded so the next
-- reader who greps for "Admin" and finds nine names knows why only eight
-- expressions moved.
--
-- The two kapitan UPDATE policies used to be a ninth and tenth dead disjunct.
-- Migration 031 rewrote both onto `current_official_holds_position('Punong
-- Barangay')` and the `admin` half went with that rewrite -- which is why the
-- count here is eight and not ten.  031's header records what was true on its
-- own day and is not edited.
--
-- -----------------------------------------------------------------------------
-- MEASURED: THE SAME ANSWER FOR EVERY REAL CALLER, BEFORE AND AFTER
-- -----------------------------------------------------------------------------
-- Eight operations x seven callers, each probe attempted for real as that
-- account with its own JWT claims, inside a block that always ends in
-- RAISE EXCEPTION.  A number is rows affected; 42501 is RLS refusing the
-- INSERT (⚠️ an INSERT blocked by RLS RAISES, where a blocked UPDATE merely
-- returns zero rows -- two shapes of the same refusal, and a harness that
-- expected only one of them would have read half the matrix as a crash).
--
--   caller          | annINS annUPD | evtINS evtUPD | hevINS hevUPD | navINS navUPD
--   ----------------+---------------+---------------+---------------+---------------
--   Punong Barangay |      1      1 |      1      1 |  42501      0 |  42501      0
--   Secretary       |      1      1 |      1      1 |  42501      0 |  42501      0
--   Treasurer       |      1      1 |      1      1 |  42501      0 |  42501      0
--   Kagawad         |      1      1 |      1      1 |  42501      0 |  42501      0
--   nurse           |  42501      0 |  42501      0 |      1      1 |      1      1
--   resident        |  42501      0 |  42501      0 |  42501      0 |  42501      0
--   anon            |  42501      0 |  42501      0 |  42501      0 |  42501      0
--
-- ⚠️ IDENTICAL BEFORE AND AFTER, all 56 cells.  That is the whole claim of
-- this migration: the announcements and events pair is any official's, the
-- health events and clinic hours pair is the nurse's, and residents and
-- anonymous visitors write none of the four -- exactly as before.
--
-- =============================================================================

-- --- announcements: any official, unchanged ---------------------------------
alter policy "Admin and official can insert announcements"
  on public.announcements
  with check (exists (select 1 from public.profiles
                       where profiles.id = auth.uid()
                         and profiles.role = 'official'));

alter policy "Admin and official can update announcements"
  on public.announcements
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role = 'official'));

-- --- events: any official, unchanged ----------------------------------------
alter policy "Admin and official can insert events"
  on public.events
  with check (exists (select 1 from public.profiles
                       where profiles.id = auth.uid()
                         and profiles.role = 'official'));

alter policy "Admin and official can update events"
  on public.events
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role = 'official'));

-- --- health_events: the nurse, unchanged ------------------------------------
alter policy "Admin and nurse can insert health events"
  on public.health_events
  with check (exists (select 1 from public.profiles
                       where profiles.id = auth.uid()
                         and profiles.role = 'nurse'));

alter policy "Admin and nurse can update health events"
  on public.health_events
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role = 'nurse'));

-- --- nurse_availability: the nurse, unchanged -------------------------------
alter policy "Admin and nurse can insert availability"
  on public.nurse_availability
  with check (exists (select 1 from public.profiles
                       where profiles.id = auth.uid()
                         and profiles.role = 'nurse'));

alter policy "Admin and nurse can update availability"
  on public.nurse_availability
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role = 'nurse'));
