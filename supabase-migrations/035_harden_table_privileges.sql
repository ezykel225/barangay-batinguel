-- =============================================================================
-- 035_harden_table_privileges.sql
-- MASTER-B step B2 - remove table privileges the application never uses
-- =============================================================================
--
-- STATUS: APPLIED 2026-10-11 via the Supabase connector.
--
-- WHAT THIS DOES
--   Revokes, table by table and grantee by grantee, privileges that NO
--   application workflow uses and NO RLS policy backs:
--     - TRUNCATE on all sixteen tables that still granted it
--     - activity_log UPDATE and DELETE  (the table is append-only)
--     - profiles DELETE                 (nothing is ever deleted here)
--     - document_requests DELETE        (the workflow is a status, not a delete)
--     - reservations DELETE             (same)
--     - kapitan_status INSERT + DELETE and kapitan_availability INSERT + DELETE
--   service_role and postgres keep everything. No RLS policy, no function, no
--   trigger, no SECURITY DEFINER EXECUTE grant (B1) and no application code is
--   touched.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - It does not remove the eight remaining dead `admin` policy disjuncts. B3.
--   - It does not move btree_gist out of `public`.
--   - It does not change any privilege B1 (migration 034) settled.
--   - It does not revoke SELECT, INSERT or UPDATE anywhere a policy backs them.
--   - It does not touch barangay_officials DELETE, and that is a decision - see
--     DEFERRED below.
--
-- =============================================================================
-- ⚠️ TABLE PRIVILEGES AND RLS ARE TWO SEPARATE LAYERS
-- =============================================================================
--
-- Every privilege removed here was, before this migration, a privilege the role
-- HELD while RLS happened to filter the rows away. That is not the same thing
-- as being safe:
--
--   * RLS filters rows. It returns "0 rows affected", not an error. A privilege
--     with no policy behind it is a loaded gun with the safety on - the safety
--     being a policy somebody could widen later, by accident, in a phase that
--     is not thinking about DELETE at all.
--   * TRUNCATE is worse: PostgreSQL RLS DOES NOT COVER TRUNCATE AT ALL. There
--     is no row filtering to fall back on. The only reason a client could not
--     empty sixteen tables is that PostgREST exposes no TRUNCATE verb, and no
--     project function runs dynamic SQL. That is an accident of the transport,
--     not a control in this database.
--
-- So B2 is not "RLS already blocked it, therefore this is cosmetic". It is
-- removing authority the application should never have held.
--
-- =============================================================================
-- ⚠️ PUBLIC HOLDS NOTHING ON ANY TABLE - THE OPPOSITE OF B1
-- =============================================================================
--
-- B1's load-bearing finding was that every FUNCTION carried a bare `=X/postgres`
-- ACL entry, i.e. PUBLIC EXECUTE, so revoking from anon and authenticated alone
-- would have changed nothing measurable. The reflex is to assume the same here.
--
-- MEASURED, and it is not the case:
--
--   select count(*) from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'PUBLIC';   -->  0
--
-- PUBLIC holds ZERO privileges on ZERO public tables. Supabase's default grants
-- go to `anon`, `authenticated` and `service_role` by name, never through
-- PUBLIC. So every REVOKE below names the roles that actually hold the
-- privilege, and a `FROM PUBLIC` clause would be a no-op this file does not
-- pretend to need. ⚠️ Do not copy B1's PUBLIC reasoning onto tables; check.
--
-- =============================================================================
-- HOW EACH PRIVILEGE WAS CLASSIFIED
-- =============================================================================
--
-- 21 tables in `public`. Every grant to PUBLIC / anon / authenticated /
-- service_role was read from the catalog across all seven privilege types, and
-- then reconciled against:
--
--   * every .select( / .insert( / .update( / .delete( / .upsert( in src/,
--     comment-stripped and attributed to its own .from('<table>') chain;
--   * every RLS policy on every table, INCLUDING cmd='ALL', which also covers
--     DELETE - six tables carry an explicit DELETE policy and three more are
--     covered by a FOR ALL policy, and all nine keep their DELETE;
--   * every function body in public, auth and storage, for an internal
--     DELETE / UPDATE / TRUNCATE against these tables;
--   * foreign keys pointing INTO the affected tables.
--
-- The frontend calls `.delete()` at exactly EIGHT sites, on eight tables:
-- health_events, nurse_availability, medicine_stock, medical_programs,
-- residents_registry, waste_schedule, announcements, events. All eight are
-- policy-backed and all eight keep DELETE. Nothing else in the application
-- deletes anything.
--
-- No function in public, auth or storage deletes from activity_log, profiles,
-- document_requests or reservations; none updates activity_log; and NOT ONE
-- function in any of those schemas so much as mentions TRUNCATE.
--
-- ⚠️ TWO SCAN RESULTS WERE WRONG AND WERE CHECKED RATHER THAN TRUSTED:
--
--   * A scan reported a DELETE on notification_reads. It is
--     `next.delete(notification.id)` in useNotifications.js - a JavaScript
--     Set.delete(), swallowed by the scan's lookahead window. notification_reads
--     is SELECT + INSERT + UPSERT only, which is why `authenticated` already
--     holds nothing else on it. No privilege was changed there.
--   * pg_get_functiondef() RAISES 42809 on an aggregate, so any scan over
--     auth/storage must filter prokind='f'. Three queries failed on that before
--     the cause was found, and the error text names array_agg rather than
--     anything about aggregates in general.
--
-- =============================================================================
-- TRUNCATE - 16 TABLES, AND THE GRANTEES ARE NOT UNIFORM
-- =============================================================================
--
-- ⚠️ The historical audit recorded "approximately 14 tables". MEASURED: it is
-- SIXTEEN, and the two roles differ:
--
--   anon holds TRUNCATE on          15 tables
--   authenticated holds TRUNCATE on 16 tables
--   union                           16 tables
--
-- The sixteenth is `official_availability`, where migration 026 granted
-- `authenticated` full DML for an official to publish their own hours but gave
-- `anon` SELECT only. So its TRUNCATE revoke names `authenticated` alone -
-- revoking from a role that never held it would be noise in the record.
--
-- =============================================================================
-- activity_log - APPEND-ONLY, NOW AT THE PRIVILEGE LAYER TOO
-- =============================================================================
--
-- The table has exactly two policies: INSERT ("Users can insert their own
-- activity entries") and SELECT ("Officials can view activity log"). There is
-- no UPDATE policy and no DELETE policy, and there never was - migration 015's
-- whole design is that an entry cannot be forged, and 016/017 widened only the
-- vocabulary. Yet `anon` and `authenticated` both held UPDATE, DELETE and
-- TRUNCATE on it.
--
-- SELECT and INSERT are KEPT. INSERT is what `logActivity()` needs and what
-- stamp_activity_actor() then makes truthful; SELECT is the Activity Log tab.
--
-- =============================================================================
-- profiles / document_requests / reservations - DELETE WAS NEVER A WORKFLOW
-- =============================================================================
--
--   profiles           policies: INSERT, SELECT x3, UPDATE x2   - no DELETE
--   document_requests  policies: INSERT, SELECT x2, UPDATE x2   - no DELETE
--   reservations       policies: INSERT x2, SELECT x2, UPDATE x2 - no DELETE
--
-- None of the three has a DELETE policy or a FOR ALL policy, the frontend never
-- calls .delete() on any of them, and no function deletes from them. "Nothing
-- is ever deleted" is this project's stated rule for profiles; the two queues
-- move through statuses (pending -> approved -> ready_for_pickup -> claimed,
-- and pending -> approved/declined/cancelled) and never through a row removal.
--
-- ⚠️ INSERT IS KEPT ON ALL THREE, and on reservations that is deliberate even
-- though the booking form uses the create_court_reservation RPC. Migration 008's
-- two INSERT policies - "Anyone can request a reservation" (anon) and
-- "Signed-in users can request a reservation" (authenticated) - are live and
-- deliberate, and profiles has "Users can insert their own resident profile".
-- Revoking INSERT would be a behaviour change dressed as a privilege cleanup.
--
-- =============================================================================
-- kapitan_status / kapitan_availability - INSERT AND DELETE, FOUND IN B2
-- =============================================================================
--
-- Not in the brief's target list; found by reconciling the whole matrix. Both
-- tables carry SELECT and UPDATE policies and NOTHING ELSE - migration 031's
-- header says so explicitly ("Neither table has an INSERT or DELETE policy,
-- before or after") - while both roles held INSERT, DELETE and TRUNCATE.
--
-- The frontend reads kapitan_status and UPDATEs it (the Punong Barangay's own
-- control) and only reads kapitan_availability. Both tables are maintained in
-- SQL, where a direct connection is the table owner and bypasses privileges and
-- RLS alike, so nothing a maintainer does depends on a client grant.
--
-- SELECT stays (both are on the PUBLIC Officials page) and UPDATE stays (031
-- narrowed it to current_official_holds_position('Punong Barangay'), which is
-- the control and is untouched here).
--
-- =============================================================================
-- DEFERRED, WITH REASONS - NOT REVOKED HERE
-- =============================================================================
--
-- * barangay_officials DELETE (anon + authenticated). There IS a deliberate
--   DELETE policy, "Officials can delete archived directory records", which
--   matches only rows already archived - migration 018's design, so that an
--   active official can never be deleted in one step. No UI calls it. Revoking
--   the privilege would make a policy the barangay deliberately wrote
--   unreachable, which is a design decision and not a privilege cleanup.
--   Reported, not taken.
-- * REFERENCES and TRIGGER on all 16 tables, both roles. Default grants, never
--   used. Exploiting either needs CREATE on schema public to make the
--   referencing table or the trigger, and B1 measured CREATE as false for both
--   anon and authenticated. Latent, and not functionally testable without
--   creating objects, so it fails this phase's own bar for inclusion.
-- * reservations INSERT / profiles INSERT - policy-backed, see above. Keep.
--
-- =============================================================================
-- VERIFICATION AFTER APPLYING (see CLAUDE.md for the full matrices)
-- =============================================================================
--
--   Every revoked operation attempted as anon AND as authenticated   42501
--   TRUNCATE attempted on all 16 tables, both roles                  42501
--   Signup -> profile row created; profile UPDATE still works
--   Document request: resident INSERT, Secretary UPDATE through all
--     four statuses, generation gates unchanged
--   Reservation: guest RPC creation + reference, tracking, Treasurer
--     approve/deny, resident cancel, resident_viewed_at
--   activity_log: INSERT still works and is still actor-stamped;
--     officials still SELECT it
--   kapitan_status / kapitan_availability: Punong Barangay UPDATE still
--     works, every other official still refused
--   MASTER-A (028/029/031/032/033) and B1 (034) regression matrices
--
-- =============================================================================

-- --- TRUNCATE: the 15 tables where BOTH roles hold it ------------------------
revoke truncate on table public.activity_log          from anon, authenticated;
revoke truncate on table public.announcements         from anon, authenticated;
revoke truncate on table public.barangay_officials    from anon, authenticated;
revoke truncate on table public.document_requests     from anon, authenticated;
revoke truncate on table public.events                from anon, authenticated;
revoke truncate on table public.health_events         from anon, authenticated;
revoke truncate on table public.kapitan_availability  from anon, authenticated;
revoke truncate on table public.kapitan_status        from anon, authenticated;
revoke truncate on table public.medical_programs      from anon, authenticated;
revoke truncate on table public.medicine_stock        from anon, authenticated;
revoke truncate on table public.nurse_availability    from anon, authenticated;
revoke truncate on table public.profiles              from anon, authenticated;
revoke truncate on table public.reservations          from anon, authenticated;
revoke truncate on table public.residents_registry    from anon, authenticated;
revoke truncate on table public.waste_schedule        from anon, authenticated;

-- --- TRUNCATE: the 16th, authenticated only (026 never granted anon) --------
revoke truncate on table public.official_availability from authenticated;

-- --- activity_log is append-only --------------------------------------------
revoke update, delete on table public.activity_log    from anon, authenticated;

-- --- nothing is ever deleted from profiles ----------------------------------
revoke delete on table public.profiles                from anon, authenticated;

-- --- the two queues move through statuses, never through a delete -----------
revoke delete on table public.document_requests       from anon, authenticated;
revoke delete on table public.reservations            from anon, authenticated;

-- --- the kapitan tables are SELECT + UPDATE only ----------------------------
revoke insert, delete on table public.kapitan_status       from anon, authenticated;
revoke insert, delete on table public.kapitan_availability from anon, authenticated;
