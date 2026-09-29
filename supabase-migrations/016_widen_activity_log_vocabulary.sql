-- ============================================================
-- Barangay Batinguel E-System
-- 016 — widen the activity_log vocabulary
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-29 as migration `widen_activity_log_vocabulary`.
--
-- Verified, both directions, per the CLAUDE.md rule that a one-sided
-- test proves nothing:
--
--   - Both CHECK definitions re-read from pg_constraint: 14 actions,
--     11 entity types, exactly as written below.
--   - All 9 existing rows still satisfy both constraints (0 violations
--     of either). Widening cannot invalidate a row, and this confirms it.
--   - POSITIVE: all 12 new action/entity combinations inserted inside a
--     plpgsql savepoint, then rolled back by a deliberate RAISE. A 23514
--     would not have matched SQLSTATE P0001 and would have surfaced.
--     Included 'ready_for_pickup'/'document_request' (the live bug) and
--     'archived'/'official' (reserved for migration 017).
--   - NEGATIVE: 'bogus_action' and 'bogus_entity' were both still
--     REJECTED with 23514, proving the widened constraint still
--     constrains rather than permitting anything.
--   - No test rows left behind: count is still 9, zero rows match
--     subject LIKE 'verify 016%', and the newest row predates the run.
--   - Policies and trigger unchanged: md5 fingerprints of both policy
--     expressions and of pg_get_constraintdef for stamp_activity_actor
--     captured before and after are identical.
--   - get_advisors (security) run afterwards: no new finding. The pre-
--     existing warnings are btree_gist in public (migration 010), the
--     SECURITY DEFINER RPC-exposure lints, and the known Pro-only
--     leaked-password gap.
--
-- ─── WHAT THIS FIXES (a live bug, not only a new feature) ────────────
-- Migration 015 closed the vocabulary of activity_log with two CHECK
-- constraints:
--
--   action      IN (approved, declined, verified, rejected,
--                   marked ineligible, cancelled)
--   entity_type IN (reservation, document_request, resident_account)
--
-- That was right for what existed then. But the document-request
-- handler logs the NEW STATUS as the action:
--
--   OfficialDashboard.jsx  ->  logActivity({ action: status, ... })
--
-- and two of the statuses an official can set are 'ready_for_pickup'
-- and 'claimed'. Neither is in the list. So those inserts raised 23514,
-- the old logActivity swallowed the error into console.error, and the
-- entry vanished with nothing shown to anyone.
--
-- Verified against the live database before writing this file:
--
--   action            | entity_type      | rows
--   ------------------+------------------+-----
--   cancelled         | reservation      |   3
--   verified          | resident_account |   3
--   approved          | reservation      |   1
--   marked ineligible | resident_account |   1
--   rejected          | resident_account |   1
--   (none)            | document_request |   0   <-- the bug
--
-- Zero document_request rows, despite one request sitting at
-- ready_for_pickup, so somebody did mark it. The dashboard even
-- contains display code for 'claimed' actions that could never exist.
--
-- ─── WHAT ELSE IT ENABLES ────────────────────────────────────────────
-- The barangay's IT/ISO evaluator asked for logs covering
-- administrative changes. Officials add, edit and delete announcements,
-- events, waste schedule rows, registry entries and directory records;
-- the nurse manages medicines, health events and medical programmes.
-- None of it could be logged, because neither the actions nor the
-- entity types were permitted. 'archived', 'restored' and 'reopened'
-- are included now so that migration 017 (officials archive) and the
-- resident Reopen-for-review flow do not each need another migration.
--
-- Deliberately NOT logged, and therefore not given vocabulary here:
--   - routine medicine stock/status changes (Available / Low / Out).
--     These change daily by design; logging them would bury everything
--     else in the table.
--   - kapitan_status. It is an operational presence indicator, not an
--     administrative record.
--   - routine nurse availability edits.
--   - page views, searches, filters, menu opens, login/logout.
--
-- ─── WHY THIS IS SAFE ────────────────────────────────────────────────
-- Widening a CHECK constraint cannot invalidate an existing row: every
-- value currently stored is still permitted. No row is read, written or
-- deleted by this migration. Both constraints are dropped IF EXISTS
-- first so this is re-runnable.
--
-- ─── WHAT IS DELIBERATELY NOT TOUCHED ────────────────────────────────
-- No policy and no trigger changes. In particular:
--
--   - activity_log still has ONLY an INSERT and a SELECT policy. No
--     UPDATE, no DELETE. An audit trail that can be edited is not an
--     audit trail.
--   - stamp_activity_actor still takes actor_id and actor_name from the
--     caller's own token and profile and discards whatever the client
--     sent. It restricts NON-officials to recording 'cancelled' on a
--     'reservation' that is their own; officials are unrestricted by
--     it, which is why widening the CHECK is sufficient here and no
--     trigger edit is required. (Confirmed by reading the function body
--     in migration 015, lines 132-152.)
--
-- Consequence worth stating: a resident still cannot write any of the
-- new values, because the trigger allows them 'cancelled'/'reservation'
-- only. The new vocabulary is reachable by officials and the nurse.
-- ============================================================


-- ── action ───────────────────────────────────────────────────────────
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_action_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_action_check
  CHECK (action IN (
    -- unchanged, from migration 015
    'approved',
    'declined',
    'verified',
    'rejected',
    'marked ineligible',
    'cancelled',
    -- new: administrative changes
    'added',
    'edited',
    'deleted',
    -- new: officials lifecycle (migration 017)
    'archived',
    'restored',
    -- new: resident Reopen for review
    'reopened',
    -- new: document workflow steps that were silently failing
    'ready_for_pickup',
    'claimed'
  ));


-- ── entity_type ──────────────────────────────────────────────────────
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    -- unchanged, from migration 015
    'reservation',
    'document_request',
    'resident_account',
    -- new: managed by officials
    'official',
    'announcement',
    'event',
    'waste_schedule',
    'registry_entry',
    -- new: managed by the health centre nurse
    'medicine',
    'health_event',
    'medical_program'
  ));


-- ── verification to run after applying ───────────────────────────────
-- Paste and run these separately. The first two show the stored
-- definitions; the third proves a previously-rejected value is now
-- accepted, inside a transaction that is rolled back so nothing is
-- actually written.
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conrelid = 'public.activity_log'::regclass AND contype = 'c';
--
--   -- Should return 0: no existing row is invalidated.
--   SELECT count(*) FROM public.activity_log
--   WHERE  action NOT IN ('approved','declined','verified','rejected',
--                         'marked ineligible','cancelled','added','edited',
--                         'deleted','archived','restored','reopened',
--                         'ready_for_pickup','claimed');
--
--   BEGIN;
--     INSERT INTO public.activity_log (action, entity_type, subject)
--     VALUES ('ready_for_pickup', 'document_request', 'constraint check');
--     INSERT INTO public.activity_log (action, entity_type, subject)
--     VALUES ('archived', 'official', 'constraint check');
--   ROLLBACK;
