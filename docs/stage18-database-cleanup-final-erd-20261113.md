# Stage 18 — Database Cleanup and Final ERD

Date: 2026-11-13  
Production project: `mpcyqwasurhtdztzobwg`  
Result: **READY FOR OWNER REVIEW, NOT READY TO EXECUTE**

## Inspection boundary and result

The production catalog was inspected through PostgreSQL 17 over the previously verified session-pooler target. The inventory ran inside `BEGIN READ ONLY` with short statement/lock timeouts and ended with `ROLLBACK` (exit code 0). It selected catalog metadata, aggregate table counts, and bucket counts; it did not select resident, Auth, complaint, incident, or document row contents.

Production contains 56 application tables in `public`, all with RLS enabled and none with forced RLS. It contains 172 public functions, 64 public RLS policies, 42 non-internal triggers across `public`/direct Auth bindings, no public views or materialized views, no public sequences, no public enums, and no public tables in logical publications.

The six retired-feature tables contain 64 rows in total. No reservation-payment table or retired-feature Storage bucket exists. The four application Storage buckets are retained: `complaint-evidence` (1 object), `id-verification` (1), `official-photos` (0), and `resident-photos` (2), protected by 15 Storage object policies.

## Actual public-table inventory

### KEEP (50 tables)

The number in parentheses is the exact production row count observed on 2026-11-13.

```text
activity_log (79)                         announcements (5)
barangay_officials (11)                   barangay_residents (43)
barangay_term_members (0)                 barangay_terms (0)
blotter_entries (41)                      blotter_entry_history (42)
case_support_events (1)                   community_credit_enrollments (43)
community_credit_events (0)               community_credit_policies (1)
community_credit_rules (0)                complaint_attachments (1)
complaint_parties (11)                    complaint_screenings (6)
complaint_status_history (20)             complaints (8)
document_requests (10)                    events (6)
external_person_resident_link_history (0) external_person_resident_links (0)
external_persons (0)                      incident_case_links (0)
incident_parties (0)                      incident_party_history (0)
incident_tanod (1)                        incidents (41)
kapitan_availability (5)                  kapitan_status (1)
kp_case_followups (0)                     kp_case_panel (0)
kp_cases (3)                              kp_hearing_attendance (0)
kp_hearings (3)                           notification_reads (73)
notifications (52)                        official_account_links (11)
official_availability (1)                 profiles (39)
residents_registry (5)                    sms_broadcast_recipients (0)
sms_broadcasts (0)                        sms_source_rules (0)
tanod_account_links (10)                  tanod_assignments (48)
tanod_attendance (1)                      tanod_incident_notes (0)
tanod_members (10)                        tanod_operation_events (12)
```

These tables support retained registration, verification, official/Tanod identity, documents, complaints/KP cases, incidents/blotters, safety analytics, Community Credit V1, publishing, notifications, SMS, and audit/history. `residents_registry` remains referenced by `complaint_parties`; the external-person and incident-party tables are retained complaint/incident identity support, not legacy reservation data.

KEEP also includes the retained policies/triggers/functions attached to these tables, the shared functions named under REVIEW below, and the four Storage buckets and their policies. Supabase-managed `auth.users` is not an application table and is shown in the ERD only as an external parent.

### REMOVE CANDIDATES (3 tables)

| Object | Purpose / rows | Dependencies | Deployed-code finding | Removal impact and order |
|---|---|---|---|---|
| `public.waste_schedule` (table) | Retired waste scheduling; **2 rows** | Outgoing FK `waste_schedule_created_by_fkey` → `auth.users(id)`; policies `Officials can manage waste schedule`, `Anyone can view waste schedule`; PK index only; no inbound FK, trigger, view, or public-function reference | No reachable deployed route performs a table read/write. Remaining references are dormant styling/label utilities. | Permanently removes two schedule rows and the PostgREST surface. Drop the two policies, then the table. |
| `public.nurse_availability` (table) | Retired Nurse/Health Center availability; **6 rows** | Outgoing FK `nurse_availability_updated_by_fkey` → `public.profiles(id)`; four nurse availability policies; PK index only; no inbound FK, trigger, view, or public-function reference | Referenced only by dormant `HealthCenter`/`NurseDashboard` source files that are not imported by the deployed route graph; `/health-center` and `/nurse` render the unavailable-service page. | Permanently removes six availability rows. Drop the four policies, then the table. |
| `public.medicine_stock` (table) | Retired medicine availability; **14 rows** | Outgoing FK `medicine_stock_updated_by_fkey` → `public.profiles(id)`; policies `Nurses can manage medicine availability`, `Anyone can view medicine availability`; PK plus `idx_medicine_stock_order`; no inbound FK, trigger, view, or public-function reference | Referenced only by dormant `HealthCenter`/`NurseDashboard` source files outside the deployed route graph. | Permanently removes fourteen medicine rows. Drop the two policies, then the table. |

The draft deliberately relies on ordinary `DROP TABLE` behavior for each table's owned PK/index/outgoing FK after explicitly removing policies. It does not use `CASCADE`.

### REVIEW (3 retired tables and their dependent objects)

| Object | Rows | Why it is not in the executable draft |
|---|---:|---|
| `public.reservations` | 27 | Four enabled triggers, six policies, three indexes, and eleven reservation routines remain. Retained shared routines `stamp_activity_actor()` and `protect_official_record()` also contain reservation branches. Dropping the table alone could leave retained audit/official workflows with broken code paths. |
| `public.health_events` | 13 | Four policies and retained shared SMS routine `sms_source_content(text,text)` still recognizes/reads health-event sources. Historical health-event data also exists. |
| `public.medical_programs` | 3 | Two policies and retained shared SMS routine `sms_source_content(text,text)` still recognizes/reads medical-program sources. Historical program data exists. |

Reservation-only routines under REVIEW are:

```text
create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)
enforce_reservation_window()
generate_reservation_reference(integer)
get_reservation_slots(date)
get_reservation_slots_range(date,date)
normalize_reservation_reference(text)
notify_reservation()
protect_reservation_status()
reservation_slot_hour(text)
stamp_reservation_reference()
track_court_reservation(text,text)
```

Their four triggers are `trg_enforce_reservation_window`, `trg_notify_reservation`, `trg_protect_reservation_status`, and `trg_stamp_reservation_reference`. A later proposal must first provide reviewed replacements for the shared retained functions, preserve any audit/notification semantics still needed by retained features, and explicitly decide how the 43 historical reservation/health/program rows are archived. Until then these objects are provisional and must not be dropped.

## Dependency findings

- The three REMOVE CANDIDATE tables have no retained inbound foreign keys, no non-internal triggers, no dependent views, and no public routine definitions referencing their names.
- Their only FKs point outward to retained Auth/profile parents; dropping the candidate tables does not delete parent records.
- Current deployed routes do not import the retired Reservation, Health Center, or Nurse components. Dormant source files still contain old Supabase calls, so restoring those components after cleanup would require a new database design/migration.
- `notifications`, `activity_log`, `sms_*`, `residents_registry`, and all complaint/incident identity tables remain KEEP because retained workflows or historical/audit relationships use them.
- The production migration ledger has no exact 068/069 rows; those migrations were owner-applied through the reviewed SQL procedure rather than ledger insertion. This does not make their installed security definitions cleanup candidates.
- No public views, enums, standalone sequences, or retired Storage buckets require cleanup.

## Final ERD

The catalog-derived Mermaid source is [stage18-final-erd-20261113.mmd](stage18-final-erd-20261113.mmd). It contains the exact production primary-key and foreign-key columns for all 50 confirmed KEEP tables and shows `auth_users` separately as Supabase-managed infrastructure. Relationship labels are the exact production FK constraint names.

The three REVIEW tables are explicitly noted as provisional omissions in the source. The three confirmed REMOVE CANDIDATE tables are excluded from the retained ERD. No table or relationship was invented. A rendered image was not generated because no local Mermaid renderer is installed; the `.mmd` source renders directly in Mermaid-compatible Markdown/editor tooling.

## Cleanup migration draft

Draft: [070_retired_feature_cleanup_DRAFT_NOT_EXECUTED.sql](../supabase-migrations/070_retired_feature_cleanup_DRAFT_NOT_EXECUTED.sql)

The draft:

- starts an explicit transaction;
- sets 3-second lock and 30-second statement timeouts;
- checks exact table presence, inbound FKs, application triggers, dependent view rules, and public-function references;
- names every policy and table explicitly;
- removes only `waste_schedule`, `nurse_availability`, and `medicine_stock`;
- contains no `CASCADE`, broad schema drop, ledger insertion, or data-manipulation statement.

It has not been executed and is not execution authorization.

## Recovery requirements

The existing pre-069 and post-068 backups are **not sufficient** for destructive cleanup: restoring either would lose migration 069 and any subsequent production state. Immediately before any approved cleanup execution, create a fresh post-069 PostgreSQL 17 custom-format production backup, a second private byte-for-byte copy, matching SHA-256/size verification, and successful `pg_restore --list` evidence. Also take a small schema-and-data export of the three exact candidate tables for quicker selective recovery.

Full restoration remains unrehearsed. Because the candidate tables do not own Storage objects, bucket-byte backup is not a prerequisite for this narrow table cleanup, but Storage remains outside the recovery coverage of the database archive generally.

## Readiness decision

**Ready for owner review of the exact three-object list; NO-GO for execution.** Required before execution: explicit owner approval of the three tables and permanent loss of 22 rows, a fresh post-069 verified backup, a maintenance/write pause, re-running the draft's read-only-equivalent dependency checks, and separate authorization to execute the exact frozen migration hash. The three REVIEW tables and all shared functions remain out of scope.
