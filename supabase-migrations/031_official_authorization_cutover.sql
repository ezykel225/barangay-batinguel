-- ============================================================
-- Barangay Batinguel E-System
-- 031 — authorization moves onto official_account_links (MASTER-A A3)
-- ============================================================
-- STATUS: see the APPLIED block at the foot of this file.
--
-- ⚠️ THIS IS THE CUTOVER. Migration 030 (A2) created the private
-- `official_account_links` mapping, backfilled all 11 links and proved
-- them -- and deliberately changed nothing, so that the mapping and the
-- switch would be two separately diagnosable steps. This file is the
-- switch.
--
-- After this migration, EVERY position-specific permission in the
-- database resolves through `official_account_links.profile_id`:
--
--     auth.uid()  ->  profiles.id
--                 ->  official_account_links.profile_id
--                 ->  official_account_links.official_id
--                 ->  barangay_officials.id  (archived_at IS NULL)
--                 ->  barangay_officials.position
--
-- `profiles.full_name = barangay_officials.full_name` is NO LONGER read
-- by any authorization path rewritten here. 028's header says the key
-- "still resolves through the `full_name` string join"; that was true of
-- A1 and is SUPERSEDED by this file. Its own prose is left as the record
-- of what A1 did, exactly as `activity_log` rows are left alone.
--
-- ─── WHY THE JOIN HAD TO GO ──────────────────────────────────────────
--
-- The string join was never an identity. It was a coincidence of
-- spelling that the Secretary and Treasurer RLS policies trusted:
--
--   * 2026-10-01 it cost a real outage -- `Jeffrey Feria Duran` was
--     renamed to `Jeffrey Cataylo Lastimoso` in the directory only, and
--     his account silently stopped matching ANY active row. He lost his
--     position permissions and his portrait, with no error anywhere.
--     Corrected by migration 027, one row, one column.
--   * MASTER-A A1b proved it was also an ESCALATION path: rename your
--     own row, archive the real Secretary, insert a row carrying your
--     own name with `position = 'Barangay Secretary'`. Three ordinary
--     form actions. Migration 029 froze both ends of that so the app
--     can no longer move the key -- but the key was still a string.
--
-- A frozen string is not an identity; it is a string nobody is allowed
-- to touch. 030 built the identity. This file is where authorization
-- stops matching names and starts following a reference.
--
-- ─── ONE PREDICATE, NOT FOUR COPIES OF A JOIN ────────────────────────
--
-- Before this migration the same identity question was asked in FOUR
-- places, each spelling the join out itself:
--
--   * `document_requests` "Secretary can update document requests"
--   * `reservations`      "Treasurer can update reservations"
--   * `can_see_audience()`  -- twice, once per powered audience
--   * `official_id_for_current_user()`
--
-- Four copies of a rule is four places for it to drift, which is the
-- same objection this project already makes to a second status
-- vocabulary and a second definition of unread. So A3 introduces
-- `current_official_holds_position(text)` and every one of the four
-- calls it. The join now exists in exactly one function body.
--
-- ─── ⚠️ IT FAILS CLOSED, AND THERE IS NO FALLBACK ────────────────────
--
-- An official with no link resolves to NOTHING. There is deliberately
-- no `OR bo.full_name = p.full_name` rescue clause: a fallback would
-- re-open the exact path A1b closed, and it would do so invisibly --
-- the system would look link-based while still being name-based for
-- whoever happened to be unlinked.
--
-- The precondition for that mattering was measured immediately before
-- this file was written, not assumed: 11 official profiles, 11 active
-- directory rows, 11 links, and all three powered positions
-- (Punong Barangay, Barangay Secretary, Barangay Treasurer) linked
-- one-to-one. Had any of the three been missing or ambiguous this
-- migration would not have been written at all.
--
-- ⚠️ THE CONSEQUENCE TO KNOW: a NEW official is now powerless until
-- somebody inserts their link. That is the correct direction for a
-- fail-closed identity -- an unlinked account can never hold the
-- Secretary's approval rights by accident of spelling -- but it means
-- appointing an official is a TWO-row operation in SQL: the directory
-- row, and the link. The old failure mode (a rename silently stripping
-- permissions) is replaced by a loud one (no link, no powers, from the
-- first attempt).
--
-- ─── ⚠️ WHY SECURITY DEFINER, AND WHY NOT AN INLINE EXISTS ───────────
--
-- `official_account_links` is PRIVATE: `anon` and `authenticated` hold
-- no privilege on it and it carries ZERO policies (030). That is
-- deliberate -- it is a list of which auth account belongs to which
-- named person, with no in-app consumer.
--
-- So an inline `EXISTS (select 1 from official_account_links ...)` in a
-- policy would be evaluated as the caller and return nothing, and
-- granting the caller SELECT to make it work would publish the whole
-- mapping. A SECURITY DEFINER function runs as its owner, reads the
-- mapping, and answers ONE QUESTION ABOUT THE CALLER.
--
-- ⚠️ IT RETURNS A BOOLEAN ABOUT auth.uid() AND NOTHING ELSE. It does
-- not take a uid parameter, it does not return a row, and there is
-- still no RPC anywhere that returns the mapping. A function that
-- answered "who is linked to whom" would be the exposure 030 exists to
-- prevent, wearing a function's clothes.
--
-- This is also the reason `term_is_confirmed()` and `can_see_audience()`
-- are SECURITY DEFINER: an inline subquery inherits the caller's view of
-- the tables it reads, so changing those tables' policies later would
-- silently change what the policy decides.
--
-- ─── ⚠️ ALTER POLICY, NOT DROP + CREATE ──────────────────────────────
--
-- Two reasons, and the first is a measured property of this project's
-- tooling: the Supabase connector gates destructive statements
-- (`DROP TRIGGER`, `DROP FUNCTION`, plain `DELETE`) by waiting for a
-- confirmation that never arrives, and `DROP POLICY` is not worth
-- discovering at 60 seconds a try. `ALTER POLICY ... USING (...)`
-- replaces the expression in place.
--
-- The second is that a drop-and-recreate has a window. Between the DROP
-- and the CREATE the table has NO policy of that name -- which for a
-- permissive UPDATE policy means nobody can write, and for a moment
-- inside a transaction that is harmless, but a failed CREATE would
-- leave the queue un-approvable with nothing obviously wrong.
--
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. The one place the identity question is answered
-- ─────────────────────────────────────────────────────────────
--
-- `p_position` is matched exactly against `barangay_officials.position`.
-- The caller must be:
--   * a signed-in account (auth.uid() is not null),
--   * whose profile still carries `role = 'official'`,
--   * which holds a link in `official_account_links`,
--   * whose linked directory row is ACTIVE (`archived_at IS NULL`),
--   * and whose position is exactly `p_position`.
--
-- ⚠️ `role = 'official'` is carried over from the OLD
-- `official_id_for_current_user()`, which already required it. It is a
-- narrowing, never a widening: an account demoted out of `official`
-- loses its position powers at the database, which is the behaviour the
-- role column is for. The two rewritten RLS policies did NOT check the
-- role before this migration -- they joined on the name alone -- so this
-- closes a gap rather than opening one.
--
-- ⚠️ ARCHIVING STILL REVOKES, which migration 018 established and the
-- notification audience design depends on: an archived Treasurer loses
-- the treasurer queue the same instant they lose approval rights,
-- because both now read this one predicate. 030 deliberately does NOT
-- delete a link on archive -- a link is an identity fact, not a
-- visibility state -- so `archived_at IS NULL` has to be tested HERE.
-- It is, in the only copy of the join that exists.
--
-- ⚠️ `search_path = ''` with every name fully qualified, so no schema
-- ahead of `public` on anybody's path can substitute a table.
CREATE OR REPLACE FUNCTION public.current_official_holds_position(p_position text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.official_account_links l
    JOIN public.profiles p
      ON p.id = l.profile_id
    JOIN public.barangay_officials bo
      ON bo.id = l.official_id
    WHERE p.id = auth.uid()
      AND p.role = 'official'
      AND bo.archived_at IS NULL
      AND bo."position" = p_position
  );
$function$;

COMMENT ON FUNCTION public.current_official_holds_position(text) IS
  'MASTER-A A3. Does the CALLER hold this barangay_officials.position, '
  'resolved through the private official_account_links mapping and an '
  'ACTIVE directory row? Answers one boolean about auth.uid() and never '
  'returns the mapping. Fails closed: no link, no powers, and there is '
  'deliberately no full_name fallback.';

-- ─────────────────────────────────────────────────────────────
-- 2. The caller's own directory row id
-- ─────────────────────────────────────────────────────────────
--
-- Used by `official_availability`'s INSERT/UPDATE/DELETE policies, which
-- is how an official publishes THEIR OWN consultation hours and nobody
-- else's. Migration 026's header records that this lookup "FAILS CLOSED"
-- -- a mismatch meant an official could not publish their own hours,
-- never that they could edit somebody else's. That property is kept, and
-- the mismatch it was guarding against can no longer happen.
--
-- ⚠️ `LIMIT 1` is now belt and braces rather than load-bearing. Under
-- the name join it was genuinely needed: two rows could share a name
-- until migration 018's partial unique index, and `.single()` lookups
-- broke when they did. The mapping makes the result at most one row by
-- construction -- `official_id` is the PRIMARY KEY and `profile_id` is
-- UNIQUE, so one account cannot hold two directory records. The LIMIT
-- stays because a lookup that silently returns an arbitrary row is
-- worse than one that cannot.
CREATE OR REPLACE FUNCTION public.official_id_for_current_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT l.official_id
  FROM public.official_account_links l
  JOIN public.profiles p
    ON p.id = l.profile_id
  JOIN public.barangay_officials bo
    ON bo.id = l.official_id
  WHERE p.id = auth.uid()
    AND p.role = 'official'
    AND bo.archived_at IS NULL
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.official_id_for_current_user() IS
  'MASTER-A A3. The CALLER''s own barangay_officials.id, resolved through '
  'official_account_links, or NULL. Fails closed; no full_name fallback.';

-- ─────────────────────────────────────────────────────────────
-- 3. Notification audiences
-- ─────────────────────────────────────────────────────────────
--
-- ⚠️ EVERY AUDIENCE SEMANTIC IS PRESERVED EXACTLY. This is a change of
-- how the two powered branches resolve the caller, and nothing else:
--
--   'officials'  -> any official, via `is_official(auth.uid())`.
--                   UNCHANGED -- `is_official` reads `profiles.role` and
--                   has never used a name join, so A3 does not touch it.
--   'secretary'  -> the linked, active Barangay Secretary.
--   'treasurer'  -> the linked, active Barangay Treasurer.
--   anything else (including 'resident') -> FALSE.
--
-- ⚠️ `'resident'` MUST STAY FALSE. A resident notification is reached by
-- `recipient_id`, never by audience; returning true here would hand every
-- resident notification to every resident. Migration 022's header records
-- that, and `notification_is_visible()` -- which both the SELECT policy
-- and `stamp_notification_read` consult, so "I can read it" and "I may
-- mark it read" cannot drift -- is left untouched.
--
-- ⚠️ AUDIENCE IS STILL RESOLVED AT READ TIME, NOT FANNED OUT. That is
-- what makes archiving an official revoke their queue the same instant
-- it revokes their approval rights, and it is now the same instant for a
-- third reason too: both answers come from one predicate.
CREATE OR REPLACE FUNCTION public.can_see_audience(p_audience text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  select case p_audience
    when 'officials' then public.is_official(auth.uid())
    when 'secretary' then public.current_official_holds_position('Barangay Secretary')
    when 'treasurer' then public.current_official_holds_position('Barangay Treasurer')
    else false
  end;
$function$;

COMMENT ON FUNCTION public.can_see_audience(text) IS
  'MASTER-A A3. Which notification audience may the CALLER see. The two '
  'powered audiences resolve through official_account_links; ''officials'' '
  'is still profiles.role; everything else -- ''resident'' included -- is '
  'false, because a resident notification is reached by recipient_id.';

-- ─────────────────────────────────────────────────────────────
-- 4. The Barangay Secretary's write on the document queue
-- ─────────────────────────────────────────────────────────────
--
-- The only path by which a document request moves pending -> approved ->
-- ready_for_pickup -> claimed, or pending -> declined. Unchanged in every
-- respect except how the Secretary is identified.
--
-- ⚠️ THE READ POLICY IS NOT TOUCHED. "Officials can view all document
-- requests" stays `profiles.role = 'official'`: any official SEES the
-- queue, only the Secretary decides it. That transparency is deliberate
-- (the dashboard shows a "Secretary only" note where the buttons would
-- be) and narrowing the read would be broadening nothing and breaking
-- a documented behaviour.
ALTER POLICY "Secretary can update document requests"
  ON public.document_requests
  USING (public.current_official_holds_position('Barangay Secretary'));

-- ─────────────────────────────────────────────────────────────
-- 5. The Barangay Treasurer's write on the reservation queue
-- ─────────────────────────────────────────────────────────────
--
-- ⚠️ `protect_reservation_status` IS NOT TOUCHED and still does the
-- column-level work: RLS decides WHICH ROWS a caller may update, and only
-- a trigger can decide WHICH COLUMNS. A resident may still write
-- `resident_viewed_at` and cancel their own pending or approved booking
-- for a date that has not passed (Asia/Manila), through their own
-- separate policy; everything else is still rejected by the allowlist,
-- `slot_hour` subtraction and all (migration 023).
ALTER POLICY "Treasurer can update reservations"
  ON public.reservations
  USING (public.current_official_holds_position('Barangay Treasurer'));

-- ─────────────────────────────────────────────────────────────
-- 6. The Punong Barangay's own two tables — enforced in the DATABASE
--    for the first time
-- ─────────────────────────────────────────────────────────────
--
-- ⚠️ THIS IS A REAL CLOSURE, NOT A REFACTOR. Both policies read
-- `profiles.role = ANY (ARRAY['admin','official'])` -- so ANY official
-- could write the Punong Barangay's status and weekly consultation
-- schedule over the API. The only thing restricting it to the Punong
-- Barangay was `isKapitan` in React, and the publishable key ships
-- inside the bundle. Found in the MASTER-A checkpoint, narrowed but not
-- closed by 028 and 029 (an official can no longer promote themselves
-- INTO the position), and closed here.
--
-- ⚠️ THE DEAD `admin` DISJUNCT GOES WITH IT, on these two policies only.
-- There is no admin role -- it was considered and dropped -- and ten old
-- policies across six tables still name it. The condition is dead (no row
-- has `role = 'admin'`), so it has always been the `'official'` half
-- doing the work. These two are rewritten wholesale by this migration, so
-- carrying the dead branch across into the new expression would be
-- writing it fresh. ⚠️ THE OTHER EIGHT ARE DELIBERATELY LEFT: cleaning
-- them is not this migration's subject, and a security cutover is the
-- wrong place to touch policies nothing here is changing.
--
-- ⚠️ SELECT IS UNTOUCHED ON BOTH. `USING (true)` -- the Kapitan's status
-- and consultation hours are shown on the PUBLIC Officials page, read by
-- `anon`. Narrowing the read would break the public page; this is about
-- who may WRITE.
--
-- ⚠️ NEITHER TABLE HAS AN INSERT OR DELETE POLICY, before or after. The
-- single `kapitan_status` row and the five `kapitan_availability` rows
-- are maintained in place. `kapitan_availability` has no administrative
-- UI at all (recorded as a known gap), so it is edited in SQL -- which
-- still works, because a direct connection is the table owner and
-- bypasses RLS entirely.
ALTER POLICY "Admin and official can update kapitan status"
  ON public.kapitan_status
  USING (public.current_official_holds_position('Punong Barangay'));

ALTER POLICY "Admin and official can update kapitan availability"
  ON public.kapitan_availability
  USING (public.current_official_holds_position('Punong Barangay'));

-- The names said "Admin and official", which is now wrong twice over.
-- ⚠️ A RENAME, NOT A DROP -- the policy keeps its identity, and nothing
-- in the application reads a policy name.
ALTER POLICY "Admin and official can update kapitan status"
  ON public.kapitan_status
  RENAME TO "Punong Barangay can update kapitan status";

ALTER POLICY "Admin and official can update kapitan availability"
  ON public.kapitan_availability
  RENAME TO "Punong Barangay can update kapitan availability";

-- ============================================================
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================
--
-- A3 is the DATABASE cutover. Three things that look adjacent are A4/A5
-- and are left exactly as they are:
--
-- 1. ⚠️ `full_name` IS STILL READ-ONLY IN THE EDIT OFFICIAL FORM, and
--    `protect_official_record()` still refuses an API caller's
--    `full_name` change (029). That branch exists because the name was
--    the authorization key -- and after this migration it is not -- but
--    removing it is a FRONTEND change (the input comes back, and
--    `portraitWillBeLost()` becomes reachable again, which is why it was
--    kept). Doing it here would mix a database cutover with a UI change
--    in one diff.
--
-- 2. ⚠️ `stamp_official_archive()` IS UNTOUCHED. Its self-archive guard
--    still compares `profiles.full_name` to the row's `full_name` and
--    still FAILS OPEN on a mismatch. It is accepted today because
--    archiving yourself only REDUCES your own privileges. Rewriting it
--    onto the mapping is a separate, testable change with its own
--    failure mode (fail closed, and every official loses the ability to
--    archive anybody if it is got wrong).
--
-- 3. ⚠️ THE FRONTEND `officialInfo` LOOKUP STILL MATCHES ON THE NAME.
--    The dashboard resolves the signed-in official's directory row by
--    name to decide what to RENDER -- `isSecretary`, `isTreasurer`,
--    `isKapitan`. That is a display decision and it was never the
--    control; after this migration the database refuses a write the UI
--    wrongly offered. Pointing it at the mapping needs an RPC that
--    answers one question about the caller, which is A4.
--
-- And one that is not A4/A5 at all, just out of scope: the other eight
-- dead `admin` disjuncts, and the TRUNCATE grants under MASTER-B.
--
-- ⚠️ MASTER-A IS NOT COMPLETE. A3 moves the database onto the mapping.
-- A4 and A5 move the application and the archive guard.
--
-- ============================================================
-- APPLIED
-- ============================================================
-- Applied: 2026-10-08, through the Supabase connector, as five
-- migrations in this order:
--   031_a3_identity_predicate            (section 1)
--   031_a3_official_id_for_current_user  (section 2)
--   031_a3_can_see_audience              (section 3)
--   031_a3_queue_authorization           (sections 4-5)
--   031_a3_kapitan_authorization         (section 6)
--
-- `ALTER POLICY` and `ALTER POLICY ... RENAME TO` both went through the
-- connector without complaint, so the gated set shrinks again -- 030's
-- header already recorded that `REVOKE` no longer gates, while plain
-- `DELETE` still does. Measure it per session rather than trusting a
-- list.
--
-- ─── PRECONDITIONS, MEASURED BEFORE WRITING THIS FILE ────────────────
--
--   official profiles                                11
--   active directory rows                            11
--   links                                            11, all carrying
--                                                    'migration-030 backfill'
--   powered active rows WITHOUT a link               (none)
--   links whose profile role is not 'official'       (none)
--   links with a missing profile or official row     (none)
--   duplicate profile_id / official_id               (none)
--   link disagreeing with the name it came from      (none)
--
--   Punong Barangay    Hon. Frankie Credo        bo a3f1156f / p 08b8ac11
--   Barangay Secretary Alexis Theress P. Tan     bo 2f21e1b6 / p 33307940
--   Barangay Treasurer Adelina Fabillar Remata   bo 5e91a9e4 / p 668df8f6
--
-- ─── VERIFICATION ────────────────────────────────────────────────────
--
-- Every probe ran as the real role, with that account's own JWT claims,
-- inside a `DO` block that always ends in `RAISE EXCEPTION` -- so
-- Postgres undoes every statement and there is no code path through any
-- of them that commits. Live state was re-read afterwards.
--
-- 1. PREDICATES, HELPER AND AUDIENCES, all seven callers
--
--   caller      PB    SEC   TRE   officialId  aud: officials/sec/tre/resident/bogus  mapRead
--   punong      true  false false a3f1156f    true  / false / false / false / false  42501
--   secretary   false true  false 2f21e1b6    true  / true  / false / false / false  42501
--   treasurer   false false true  5e91a9e4    true  / false / true  / false / false  42501
--   kagawad     false false false 1e0d3ac9    true  / false / false / false / false  42501
--   resident    false false false NULL        false / false / false / false / false  42501
--   nurse       false false false NULL        false / false / false / false / false  42501
--   anon        false false false NULL        false / false / false / false / false  42501
--
--   -- every audience semantic preserved: 'officials' still any official,
--   -- the two powered audiences now the linked holder, 'resident' and an
--   -- unrecognised value both false. And the mapping stays unreadable by
--   -- every client, including an official who holds a link of his own --
--   -- 42501, the PRIVILEGE layer, not RLS's indistinguishable empty set.
--
-- 2. WRITES, all seven callers
--
--   caller      doc_requests  reservations  kapitan_status  kapitan_avail  docSelect
--   punong      0             0             1               5              1
--   secretary   1             0             0               0              1
--   treasurer   0             1             0               0              1
--   kagawad     0             0             0               0              1
--   resident    0             0             0               0              0
--   nurse       0             0             0               0              0
--   anon        0             0             0               0              0
--
--   -- exactly one caller can write each powered table, and the read
--   -- policy is untouched: every official still SEES the queue.
--
-- 3. ⚠️ THE PUNONG BARANGAY CLOSURE, MEASURED IN BOTH DIRECTIONS.
--    The pre-031 expression both kapitan policies carried was evaluated
--    verbatim as each caller, beside the new predicate:
--
--   caller      pre-031 kapitan rule   post-031
--   punong      true                   true
--   secretary   true                   FALSE
--   treasurer   true                   FALSE
--   kagawad     true                   FALSE
--   resident    false                  false
--   nurse       false                  false
--
--    So ANY official could write the Punong Barangay's status and weekly
--    consultation schedule at the database before this file. That is the
--    P1 gap, and it is closed.
--
-- 4. OWN CONSULTATION HOURS (`official_availability`, which resolves
--    through `official_id_for_current_user()`)
--
--   caller      insert own row   insert naming the Treasurer's official_id
--   punong      1                42501
--   secretary   1                42501
--   treasurer   1                1
--   kagawad     1                42501
--   resident    42501            42501
--   nurse       42501            42501
--   anon        42501            42501
--
--    and an UPDATE of the Treasurer's one live row succeeded for her
--    alone (rows=1) and returned 0 for every other official.
--
-- 5. ARCHIVED POWERED OFFICIALS -- all three archived in a rolled-back
--    block, links deliberately left in place (030: a link is an identity
--    fact, not a visibility state). All three then read:
--
--      PB/SEC/TRE = false/false/false, officialId = NULL,
--      can_see_audience('secretary')/('treasurer') = false/false,
--      doc=0 res=0 kstatus=0 kavail=0
--
--    and the table still held 11 links throughout. Archiving revokes the
--    position, the queue and the audience together, which is what 018
--    and 022 require.
--
-- 6. ⚠️ UNLINKED OFFICIALS -- FAIL CLOSED. The three powered links were
--    repointed at three unrelated resident profiles, leaving every
--    directory row, every name and every profile untouched:
--
--      unlinked punong / secretary / treasurer:
--        PB/SEC/TRE = false, officialId = NULL,
--        aud(secretary)/(treasurer) = false, doc=0 res=0 kstatus=0
--        -- while aud('officials') stayed TRUE, because that one reads
--           profiles.role and is deliberately unchanged
--      the still-linked Kagawad:  officialId = 1e0d3ac9, nothing powered
--      the three resident accounts the links were repointed AT:
--        PB/SEC/TRE = false, officialId = NULL
--        -- the predicate also requires profiles.role = 'official', so
--           holding a link is not by itself a position
--
--    Their names still matched their directory rows perfectly. It bought
--    them nothing, which is the whole claim of this migration.
--
-- ─── ATTACK REGRESSION ───────────────────────────────────────────────
--
-- 7. ⚠️ THE NAME COLLISION, RUN AGAINST BOTH MODELS AT ONCE. In trusted
--    SQL (the app is refused this by 029): the Kagawad's own directory
--    row archived to vacate the name -- 018's unique index refuses two
--    ACTIVE rows sharing one, and did, which is why the attack needs the
--    extra step -- then the ACTIVE Barangay Secretary row renamed to
--    `Harold Katada Baroy`.
--
--   caller      pre-031 name join   post-031 predicate   doc UPDATE
--   kagawad     TRUE                false                0
--   secretary   FALSE               true                 1
--
--    Read both rows. The old join would have handed the Kagawad the
--    Secretary's approval rights AND stripped them from the real
--    Secretary -- one rename doing both. That second half is exactly the
--    2026-10-01 outage mechanism (migration 027). Under the mapping the
--    rename moves nothing: the attacker gains nothing and the incumbent
--    loses nothing.
--
-- 8. THE FRESH POWERED ROW. Real Secretary archived, Kagawad's row
--    archived, then a BRAND NEW active `Barangay Secretary` row inserted
--    carrying the attacker's own name -- in trusted SQL, so 029's INSERT
--    guard was not even in the way, and no link was created for it:
--
--      kagawad: SEC=false, officialId=NULL, aud(secretary)=false, doc=0
--
--    Authority follows the private profile_id <-> official_id link and
--    nothing else.
--
-- 9. A1 / A1b NOT WEAKENED, over the API as the Kagawad, with the
--    positive controls included so an over-block would show up too:
--
--      028  change own position                      P0001
--      029  change own full_name                     P0001
--      029  client INSERT a powered position         P0001
--      029  client INSERT `Kagawad`                  rows=1  (allowed)
--           ordinary edit (committee)                rows=1  (allowed)
--
-- ─── LIVE STATE AFTER ALL TESTING ────────────────────────────────────
--
--   links 11 (all 11 'migration-030 backfill')   directory rows 11
--   active 11   archived 0   official profiles 11
--   rows named 'A3 Probe%' or carrying the probe committee: 0
--   official_availability 1   kapitan_status 1   kapitan_availability 5
--   powered holders: Secretary = Alexis Theress P. Tan,
--                    Treasurer = Adelina Fabillar Remata,
--                    Punong Barangay = Hon. Frankie Credo
--
-- Nothing persisted.
--
-- ─── ADVISORS ────────────────────────────────────────────────────────
--
-- ⚠️ ONE NEW FINDING, AND IT IS THE INTENDED DESIGN:
-- `current_official_holds_position` joins the SECURITY DEFINER advisory,
-- taking it from 23 functions to 24. It MUST stay executable by `anon`
-- and `authenticated` -- an RLS policy is evaluated as the querying role,
-- so revoking EXECUTE would break the four policies that call it, which
-- is precisely why CLAUDE.md says the identity predicates are not to be
-- revoked without proving a policy can still call them first. It answers
-- one boolean about the caller's own account and returns no row, so an
-- RPC call against it tells the caller nothing they did not already know.
--
-- Everything else pre-dates A3: `rls_enabled_no_policy` on
-- `official_account_links` (what a private table looks like -- A2),
-- `extension_in_public` for `btree_gist` (load-bearing for the
-- reservations overlap constraint), and leaked-password protection
-- (Pro-only on this project).
