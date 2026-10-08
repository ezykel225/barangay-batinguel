-- ============================================================
-- Barangay Batinguel E-System
-- 030 — the private official ↔ account identity mapping (MASTER-A A2)
-- ============================================================
-- STATUS: see the APPLIED block at the foot of this file.
--
-- ⚠️ THIS MIGRATION IS DELIBERATELY INERT. It creates the permanent
-- identity mapping and backfills it. It changes NO policy, NO function
-- and NO frontend. `profiles.full_name = barangay_officials.full_name`
-- is STILL what resolves every position-specific permission after this
-- runs, exactly as before.
--
-- A3 is the cutover. Until A3 lands, this table is a correct answer
-- that nothing asks. That is the point: the mapping is created and
-- proven in one step, and authorization is switched in another, so a
-- mistake in either is diagnosable on its own.
--
-- ─── WHY A SEPARATE TABLE, NOT A COLUMN ──────────────────────────────
--
-- The obvious design is `barangay_officials.profile_id uuid`. It was
-- considered at the MASTER-A architecture checkpoint and REJECTED, for
-- one measured reason:
--
--   `barangay_officials` is read by `anon` with `select('*')` on the
--   public Officials page.
--
-- A `profile_id` column there would publish every official's auth
-- identifier to anybody who loads the public site -- the same class of
-- mistake as putting `exception_reason` into `get_reservation_slots`.
-- Narrowing the public select to a column list is not a defence either:
-- the publishable key ships inside the bundle, so `anon` can ask for
-- the column directly whatever the React code requests.
--
-- A separate table can be made unreadable by every application role.
-- A column on a publicly-read table cannot.
--
-- ⚠️ DO NOT ADD `profile_id` TO `barangay_officials` LATER EITHER.
--
-- ─── WHAT THIS REPLACES, EVENTUALLY ──────────────────────────────────
--
-- The string join documented in CLAUDE.md's *Known fragility*: rename
-- an official in one table and not the other and they silently lose
-- their position permissions. That cost this project a real outage on
-- 2026-10-01 (migration 027). 029 froze the key so the app can no
-- longer move it; this table is what finally makes the key irrelevant.
--
-- ============================================================
-- 1. THE TABLE
-- ============================================================
--
-- ⚠️ `official_id` IS THE PRIMARY KEY, and `profile_id` IS UNIQUE.
-- Together those two constraints are what make the relationship
-- one-to-one in the database rather than by convention: one directory
-- record cannot be claimed by two accounts, and one account cannot
-- hold two directory records. A3 relies on that -- a lookup that can
-- return two rows is not an identity.
--
-- ⚠️ BOTH SIDES ARE `ON DELETE RESTRICT`, and that is a decision with
-- a consequence worth stating plainly.
--
--   `profiles.id` is `REFERENCES auth.users(id) ON DELETE CASCADE`.
--   So deleting an auth user currently deletes their profile row
--   silently. With a link in place that cascade is BLOCKED (23503)
--   instead.
--
-- That is wanted. This project's rule is that nothing is ever deleted
-- -- there is no DELETE policy on `profiles` at all, and officials are
-- archived rather than removed. An account that quietly evaporates and
-- takes an official's identity mapping with it is precisely the failure
-- mode the missing Kagawad of 2026-09-30 was. Unlinking is a deliberate
-- act, and RESTRICT is what makes it one.
create table if not exists public.official_account_links (
  official_id uuid primary key
    references public.barangay_officials(id) on delete restrict,
  profile_id  uuid not null unique
    references public.profiles(id) on delete restrict,
  linked_at   timestamptz not null default now(),
  linked_by   text not null
);

comment on table public.official_account_links is
  'MASTER-A A2. Private, one-to-one mapping between an authenticated '
  'profile and a barangay_officials directory record. Replaces the '
  'full_name string join as the authorization identity source from A3 '
  'onward. NOT readable or writable by anon or authenticated -- see the '
  'revokes in migration 030. Do not expose through an RPC.';

comment on column public.official_account_links.linked_by is
  'Provenance of the link, free text. Backfilled rows read '
  '"migration-030 backfill". Not an actor id: only a trusted caller '
  '(direct SQL / service_role) can write this table at all.';

-- ⚠️ THE LINK IS AN IDENTITY FACT, NOT A VISIBILITY STATE.
--
-- Archiving an official must NOT delete their link, and restoring must
-- return the SAME link. `archived_at` says whether a record is in the
-- current directory; it says nothing about who that record is. Tying
-- the mapping lifecycle to `archived_at` would mean an official loses
-- their identity on archive and is re-identified on restore -- which is
-- exactly the kind of implicit re-identification the Previous Term
-- tables exist to refuse.
--
-- There is deliberately NO trigger on `barangay_officials` touching
-- this table, and nothing here reads `archived_at`.

-- ============================================================
-- 2. TWO BARRIERS, NOT ONE  (019A's pattern)
-- ============================================================
--
-- ⚠️ Supabase grants full DML on a new public table to `anon` and
-- `authenticated` by default. Absent policies alone would therefore be
-- the ONLY thing stopping a read, and a permissive policy added later
-- by mistake would open the table immediately.
--
--   Barrier 1 — PRIVILEGE: every relevant privilege revoked, so a
--               request is refused 42501 before RLS is consulted.
--   Barrier 2 — RLS:      enabled with ZERO policies, so even a caller
--               holding a privilege matches no row.
--
-- ⚠️ THIS INCLUDES ORDINARY OFFICIALS. An official has no business
-- reading the whole mapping: it is a list of which auth account belongs
-- to which named person, which is PII with no in-app consumer. A3's
-- lookups will be SECURITY DEFINER functions answering ONE question
-- about the CALLER, never returning the table.
--
-- ⚠️ AND THERE IS DELIBERATELY NO RPC THAT RETURNS THE MAPPING.
alter table public.official_account_links enable row level security;

-- No policies are created, on purpose. A policy here would be the thing
-- that breaks the design; the table is administered by trusted callers
-- (direct SQL / migrations / service_role), which bypass RLS.

revoke all on public.official_account_links from anon;
revoke all on public.official_account_links from authenticated;
revoke all on public.official_account_links from public;

-- ============================================================
-- 3. BACKFILL — ONE-TIME, FROM THE NAME JOIN, FAIL CLOSED
-- ============================================================
--
-- ⚠️ THE NAME JOIN IS USED EXACTLY ONCE, HERE, AS A BOOTSTRAP.
-- After this runs the link is authoritative and the name is not. This
-- is the only place in the project where it is acceptable to derive
-- identity from a string, and it is acceptable only because every
-- derivation is checked first and the whole statement aborts on any
-- doubt.
--
-- ⚠️ NO FUZZY MATCHING, NO NORMALISATION, NO ABBREVIATION GUESSING, NO
-- SPELLING CORRECTION, AND NO SILENT OMISSION. Exact equality or abort.
-- Lower-casing to "force a match" is how `Alexis Tan` and
-- `Alexis Theress P. Tan` would be declared the same person, and
-- `Catherine Lacson Tan` vs `Alexis Theress P. Tan` is the live case
-- where that reasoning links two DIFFERENT people who share a surname
-- and an office.
--
-- Reconciliation measured immediately before this ran (see §5):
--   official profiles ............ 11
--   active directory rows ........ 11
--   exact one-to-one matches ..... 11
--   unmatched / ambiguous ........ 0 across all six classes
do $$
declare
  official_profiles int;
  active_officials  int;
  offenders         int;
  inserted          int;
begin
  select count(*) into official_profiles from public.profiles where role = 'official';
  select count(*) into active_officials  from public.barangay_officials where archived_at is null;

  -- (a) an official profile that matches NO active directory row
  select count(*) into offenders
    from public.profiles p
   where p.role = 'official'
     and not exists (select 1 from public.barangay_officials bo
                      where bo.full_name = p.full_name and bo.archived_at is null);
  if offenders > 0 then
    raise exception
      'ABORT 030: % official profile(s) match no active directory row. Resolve by hand; do not relax the join.',
      offenders using errcode = 'P0001';
  end if;

  -- (b) an active directory row that matches NO official profile
  select count(*) into offenders
    from public.barangay_officials bo
   where bo.archived_at is null
     and not exists (select 1 from public.profiles p
                      where p.full_name = bo.full_name and p.role = 'official');
  if offenders > 0 then
    raise exception
      'ABORT 030: % active directory row(s) match no official profile.',
      offenders using errcode = 'P0001';
  end if;

  -- (c) one profile matching MORE THAN ONE active directory row
  select count(*) into offenders from (
    select p.id from public.profiles p
      join public.barangay_officials bo
        on bo.full_name = p.full_name and bo.archived_at is null
     where p.role = 'official'
     group by p.id having count(*) > 1) t;
  if offenders > 0 then
    raise exception
      'ABORT 030: % official profile(s) match more than one active directory row.',
      offenders using errcode = 'P0001';
  end if;

  -- (d) one active directory row matching MORE THAN ONE profile
  select count(*) into offenders from (
    select bo.id from public.barangay_officials bo
      join public.profiles p
        on p.full_name = bo.full_name and p.role = 'official'
     where bo.archived_at is null
     group by bo.id having count(*) > 1) t;
  if offenders > 0 then
    raise exception
      'ABORT 030: % active directory row(s) match more than one official profile.',
      offenders using errcode = 'P0001';
  end if;

  -- (e) the two sides must agree in total, or something is unaccounted for
  if official_profiles <> active_officials then
    raise exception
      'ABORT 030: % official profiles but % active directory rows.',
      official_profiles, active_officials using errcode = 'P0001';
  end if;

  insert into public.official_account_links (official_id, profile_id, linked_by)
  select bo.id, p.id, 'migration-030 backfill'
    from public.profiles p
    join public.barangay_officials bo
      on bo.full_name = p.full_name
   where p.role = 'official'
     and bo.archived_at is null;

  get diagnostics inserted = row_count;

  -- (f) the count actually written must equal the count reconciled.
  -- The PK and the UNIQUE would already have raised 23505 on a
  -- duplicate; this catches the quieter failure where fewer rows
  -- arrive than expected.
  if inserted <> official_profiles then
    raise exception
      'ABORT 030: inserted % link(s), expected %.',
      inserted, official_profiles using errcode = 'P0001';
  end if;

  raise notice '030: % official account link(s) created', inserted;
end $$;

-- ============================================================
-- 4. WHAT THIS MIGRATION DOES NOT TOUCH
-- ============================================================
--
-- Verified unchanged after it ran. A2 is inert by construction:
--
--   `document_requests` Secretary policies ....... unchanged
--   `reservations` Treasurer policies ............ unchanged
--   `can_see_audience()` ......................... unchanged
--   `official_id_for_current_user()` ............. unchanged
--   `stamp_official_archive()` ................... unchanged
--   `protect_official_record()` (028 + 029) ...... unchanged
--   `kapitan_status` / `kapitan_availability` .... unchanged
--   every frontend lookup ........................ unchanged
--
-- ⚠️ `full_name` IS STILL THE ACTIVE AUTHORIZATION KEY. Nothing reads
-- this table yet. A3 converts the two RLS policies,
-- `can_see_audience()`, `official_id_for_current_user()` and the
-- dashboard's `officialInfo` lookup, and only then does the name stop
-- deciding anything.
--
-- ⚠️ A1b's Full Name restriction therefore STAYS. The Edit Official
-- form still ships no control for `full_name`, because the name is
-- still load-bearing. A3 is what earns that field back.

-- ============================================================
-- 5. VERIFICATION — see the APPLIED block below
-- ============================================================
--
-- ============================================================
-- APPLIED — 2026-10-07, live project mpcyqwasurhtdztzobwg
-- ============================================================
-- Applied through the Supabase connector in three migrations, split so
-- a failure would be attributable to one step:
--
--   `official_account_links`                      — table + RLS
--   `official_account_links_revoke_client_privileges` — the revokes
--   `official_account_links_backfill`             — the DO block above
--
-- ⚠️ THE REVOKE WENT THROUGH THIS TIME. CLAUDE.md records (from X5)
-- that the connector gates `REVOKE` the way it gates `DROP TRIGGER`.
-- Measured here: `REVOKE` applied without complaint. A plain `DELETE`
-- still times out at 60s -- twice, including when wrapped in
-- `EXECUTE format('delete from ...')`, so the scan reads the whole
-- payload and not just the top-level statement. CLAUDE.md's list is
-- corrected accordingly: DELETE yes, REVOKE no longer.
--
-- ─── RECONCILIATION, measured immediately before the backfill ────────
--
--   official profiles ................................ 11
--   official profiles with a blank name ..............  0
--   active directory rows ............................ 11
--   archived directory rows ..........................  0
--   exact one-to-one matches ......................... 11
--   distinct profiles matched ........................ 11
--   distinct officials matched ....................... 11
--
--   unmatched official profiles ......................  0
--   active rows with no official profile .............  0
--   profiles matching >1 active row ..................  0
--   active rows matching >1 profile ..................  0
--   duplicate names among official profiles ..........  0
--   duplicate names among active directory rows ......  0
--
-- All six ambiguity classes empty, so the backfill ran. Had ANY been
-- non-empty the DO block would have aborted and the table would have
-- been left empty -- it does not insert "the ones that matched".
--
-- ─── BACKFILL RESULT ────────────────────────────────────────────────
--
--   links created .................................... 11
--   rows carrying linked_by = 'migration-030 backfill' 11
--
-- ─── STRUCTURE (§8 T1-T6) ───────────────────────────────────────────
--
--   T1  link count = official profile count .......... 11 = 11   OK
--   T2  links pointing at a missing profile ..........  0        OK
--   T3  links to a profile whose role <> 'official' ..  0        OK
--   T4  links pointing at a missing directory row ....  0        OK
--   T5  duplicate profile_id .........................  0        OK
--   T6  duplicate official_id ........................  0        OK
--       links still agreeing with the name join ...... 11        OK
--
-- ─── CLIENT ACCESS (§8 T7-T15), impersonated, rolled back ───────────
--
-- ⚠️ EVERY ONE IS 42501 -- the PRIVILEGE layer, refused before RLS is
-- even consulted. That is the stronger result: RLS alone would have
-- returned an empty set, which is indistinguishable from "no rows".
--
--   T7  anon          SELECT ........ DENIED 42501
--   T8  resident      SELECT ........ DENIED 42501
--   T9  nurse         SELECT ........ DENIED 42501
--   T10 ordinary official SELECT .... DENIED 42501   <-- he HAS a link
--   T11 anon          INSERT ........ DENIED 42501
--   T12 resident      INSERT ........ DENIED 42501
--   T13 official      INSERT ........ DENIED 42501   <-- tried to claim
--                                                        the Secretary's row
--   T14 official      UPDATE ........ DENIED 42501
--   T15 official      DELETE ........ DENIED 42501
--
-- ─── TRUSTED PATH + LIFECYCLE (§8 T16-T23), rolled back ─────────────
--
--   T16 direct SQL creates a link .... rows=1                OK
--   T17 direct SQL updates a link .... rows=1                OK
--   T18 duplicate profile_id ......... REJECTED 23505        OK
--   T19 duplicate official_id ........ REJECTED 23505        OK
--   T20 archive a LINKED official .... link rows=1           OK
--   T21 link survives the archive .... yes                   OK
--   T22 restore ...................... done                  OK
--   T23 same link after restore ...... BYTE-IDENTICAL        OK
--       incl. `linked_at` 2026-10-07 16:09:18.024668+00 either side
--
-- ─── ON DELETE RESTRICT ─────────────────────────────────────────────
--
-- Verified from the catalog, both sides:
--   official_account_links_official_id_fkey -> barangay_officials  RESTRICT
--   official_account_links_profile_id_fkey  -> profiles            RESTRICT
--
-- ⚠️ THE BEHAVIOURAL DELETE TEST WAS NOT RUN, and is not claimed. The
-- connector gates `DELETE` in any form. To exercise it, paste this into
-- the SQL Editor -- it rolls itself back and asserts nothing persists:
--
--   begin;
--     -- expect 23503 twice: the link holds both parents
--     delete from barangay_officials
--      where id = (select official_id from official_account_links limit 1);
--     delete from profiles
--      where id = (select profile_id  from official_account_links limit 1);
--   rollback;
--
-- ─── A1/A1b STILL HOLDS (§9), impersonated, rolled back ─────────────
--
--   028 official changes own position ...... REFUSED P0001   OK
--   029 official changes own full_name ..... REFUSED P0001   OK
--   029 client INSERT Punong Barangay ...... REFUSED P0001   OK
--   029 client INSERT Barangay Secretary ... REFUSED P0001   OK
--   029 client INSERT Barangay Treasurer ... REFUSED P0001   OK
--   029 client INSERT Kagawad .............. ACCEPTED        OK (not over-blocked)
--   ordinary edit (committee) .............. rows=1          OK
--   the real Secretary writes doc requests . rows=1          OK
--   the real Treasurer writes reservations . rows=1          OK
--
-- ─── INERTNESS (§7) ─────────────────────────────────────────────────
--
-- Searched every function body, policy expression and view definition
-- in `public` for the table name. ONE hit, and it is a COMMENT:
--
--   protect_official_record(), line 39:
--     "-- Remove in A3 once official_account_links carries identity."
--
-- So nothing executable reads this table. The five functions that
-- decide authorization were hashed before and after and are unchanged:
-- `protect_official_record`, `stamp_official_archive`,
-- `can_see_audience`, `official_id_for_current_user`, `is_official`.
--
-- ─── NOTHING PERSISTED FROM TESTING ─────────────────────────────────
--
-- Re-read after every aborted block: 11 links, all 11 carrying the
-- backfill provenance, 0 rows with a test `linked_by`, 11 directory
-- rows, 11 active, 0 archived, 0 'A2 Probe%' rows, 11 official
-- profiles.
