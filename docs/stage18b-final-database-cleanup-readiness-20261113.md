# Stage 18B — Final Database Cleanup Readiness

Date: 2026-11-13
Mode: analysis and preparation only
Production project: `mpcyqwasurhtdztzobwg`

## Decision

All six retired-feature tables are supported for removal by the consolidated draft. No table remains database-blocked. **The cleanup is ready for explicit owner review, but is NOT authorized or ready to execute until a fresh post-069 backup and the execution checklist are approved.**

## Six-table dependency result

| Table | Rows at Stage 18 inventory | Result | Evidence and required handling |
|---|---:|---|---|
| `public.reservations` | 27 | SAFE IN DRAFT | No inbound FK or dependent view. Drop 6 policies, 4 triggers, 10 reservation-only routines and the table. Preserve `normalize_reservation_reference(text)` because retained `track_complaint(text,text)` calls it. Replace the reservation branch in `stamp_activity_actor()`. |
| `public.health_events` | 13 | SAFE IN DRAFT | No inbound FK, trigger or view. Drop 4 policies and the table after removing health-event branches from retained SMS functions and the nurse branch from the activity trigger function. |
| `public.medical_programs` | 3 | SAFE IN DRAFT | No inbound FK, trigger or view. Drop 2 policies and the table after removing medical-program branches from retained SMS functions and the nurse branch from the activity trigger function. |
| `public.waste_schedule` | 2 | SAFE IN DRAFT | No inbound FK, trigger, view or function reference. Drop 2 policies and the table. |
| `public.nurse_availability` | 6 | SAFE IN DRAFT | No inbound FK, trigger, view or function reference. Drop 4 policies and the table. |
| `public.medicine_stock` | 14 | SAFE IN DRAFT | No inbound FK, trigger, view or function reference. Drop 2 policies and the table. |

All six tables have only outgoing references to retained Auth/profile parents. Ordinary schema-qualified drops therefore do not delete parent data. The proposed cleanup removes 64 retired rows in total.

## Five branch-preserving shared-function replacements

| Function | Preserved contract | Removed branch only |
|---|---|---|
| `stamp_activity_actor()` | `trigger`, volatile, `SECURITY DEFINER`, owner/ACL, `search_path=public`, direct/service maintenance behavior, server actor stamping, official activity writes | Nurse health/medicine/program logging and resident reservation-cancellation logging. No routed retained UI invokes those branches. |
| `sms_may_manage(text,uuid)` | Boolean, stable, `SECURITY DEFINER`, empty search path, linked active-official authorization for announcements/events | Nurse authorization for health events and medical programs. |
| `sms_source_content(text,text)` | JSONB, stable, `SECURITY DEFINER`, empty search path, dynamic lookup for retained announcements/events | Dynamic table routing to `health_events` and `medical_programs`. |
| `sms_message(text,jsonb)` | Text, immutable, security invoker, empty search path, announcement/event message formatting | Health-event and medical-program message formatting. |
| `sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)` | UUID signature, volatile, `SECURITY DEFINER`, empty search path, idempotency, preview-token check, audience snapshot, recipient creation, rule save and activity logging | `schedule_update` and retired health/medical reminder paths; event reminders remain supported. |

`CREATE OR REPLACE FUNCTION` keeps each existing function OID, owner and ACL. Captured production execute privileges therefore remain unchanged: only `authenticated` can directly execute `sms_prepare_broadcast`; only `service_role` can directly execute `stamp_activity_actor`; the other three replacements have no direct execute privilege for `anon`, `authenticated`, or `service_role` and remain internal helpers.

The production fingerprints are preconditions in the draft, so unexpected live function drift aborts before any drop. The production signatures, return types, volatility and `SECURITY DEFINER` flags match the replacement declarations.

## Retained dependencies and history

- `normalize_reservation_reference(text)` is retained despite its historical name because `track_complaint(text,text)` depends on it. A targeted signature-only production check found no retained caller of any of the ten reservation routines proposed for removal; only doomed-to-doomed calls remained (`stamp_reservation_reference` → `generate_reservation_reference`, `enforce_reservation_window` → `reservation_slot_hour`).
- `activity_log` and `notifications` tables, their historical reservation/health entity values, constraints and rows remain unchanged.
- Retained SMS tables currently contain zero rows. Their source/broadcast constraints are narrowed to announcements/events only after a precondition proves no retired-source or `schedule_update` rows exist.
- Retained complaint tracking, official audit logging, notification history, announcements/events SMS, profiles, Auth, and all other retained workflows remain in the intended schema.
- Dormant Reservation/Health/Nurse React source files are not imported by the deployed route graph. The deployed routes render the unavailable-service page.
- The repository contains a retired `notify-reservation-sms` Edge Function source that is not invoked by the deployed frontend. The SQL draft cannot delete hosted Edge Functions; it should be separately disabled/removed as retired operational cleanup so it is not left as a dead endpoint after the table drop.

## Artifacts

- Consolidated migration: `supabase-migrations/070_retired_feature_cleanup_FINAL_DRAFT_NOT_EXECUTED.sql`
- Revised intended post-cleanup ERD: `docs/stage18b-final-erd-post-cleanup-DRAFT.mmd`
- Earlier three-table draft remains preserved and is superseded for review; it was not overwritten.

The revised ERD contains 50 retained application tables plus `auth_users` as an explicitly external Supabase-managed parent. It has 118 FK relationship lines and no dangling entity references. It is a proposed post-cleanup diagram, not the current production schema.

## Validation

- Exact drop list: 6/6 retired tables; no retained table.
- Shared replacements: exactly 5, with matching signatures/security attributes.
- Reservation-only routines dropped: 10; retained complaint normalizer not dropped.
- `DROP ... CASCADE`: absent.
- Broad schema drops, ledger insertion, `DELETE`, `TRUNCATE`, and retained-data cleanup: absent.
- Historical `activity_log`/`notifications` constraints: untouched.
- Preconditions: current 56-table count, exact table presence, no inbound FK/view dependency, trigger/policy counts, five function fingerprints, retained complaint dependency, and zero retired SMS rows.
- Postconditions: six tables absent, 50 application tables remain, five shared functions and complaint normalizer remain, ten retired routines are absent.
- `git diff --check`: passed for the draft and ERD.
- SQL parser/execution validation: no local PostgreSQL or standalone SQL parser is available, and production execution is prohibited. The draft received static delimiter, signature, ordering and catalog-name review only; an approved pre-execution SQL Editor review remains required.

## Recovery requirements

Immediately before any destructive execution:

1. Create a fresh post-069 PostgreSQL 17 custom-format production backup.
2. Create an independent private byte-for-byte copy.
3. Verify both files have identical nonzero sizes and SHA-256 hashes.
4. Run PostgreSQL 17 `pg_restore --list` successfully against both copies and record TOC counts.
5. Create focused schema-and-data exports of all six proposed tables, including their owned constraints/indexes, plus the five pre-change shared-function definitions and SMS constraint definitions.
6. Record the active Vercel deployment and database maintenance/write pause.

Full restoration remains unrehearsed. The backup does not independently preserve Storage object bytes or hosted Edge Function configuration. No cleanup should proceed without accepting those recovery limitations.

## Approval status

**READY for owner review of the exact migration; NOT READY for execution.** Separate approval must cover all six table names, removal of 64 rows, five function replacements, three retained SMS constraint changes, ten routine drops, fresh-backup evidence, and retirement of the unused reservation Edge Function. No production change was made in Stage 18B.
