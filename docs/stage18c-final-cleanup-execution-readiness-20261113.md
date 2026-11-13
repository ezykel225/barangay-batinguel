# Stage 18C — Final Cleanup Execution Readiness

Date: 2026-11-13
Production project: `mpcyqwasurhtdztzobwg`
Mode: backup and read-only validation only

## Migration identity

- File: `supabase-migrations/070_retired_feature_cleanup_FINAL_DRAFT_NOT_EXECUTED.sql`
- Size: 16,817 bytes
- SHA-256: `F2700947B3D1681F024A62390DAB83CDD4E830EAD3B3E33F16D4BB0C9403995F`
- Git state: untracked local draft; no commit or push

## SQL review

Result: **PASS for requesting explicit execution authorization**.

- Explicit transaction, 3-second lock timeout and 30-second statement timeout.
- Fail-closed checks cover the 56-table baseline, six table identities, inbound FKs, view dependencies, trigger/policy counts, five original function fingerprints, SMS retired-source emptiness and the retained complaint-normalizer dependency.
- Exactly five `CREATE OR REPLACE FUNCTION` statements preserve signatures, return types, volatility, `SECURITY DEFINER`/invoker behavior and search paths. Replacing the same signatures preserves owner and ACL.
- Exactly six schema-qualified retired tables, twenty policies, four reservation triggers and ten reservation-only routines are removed.
- `normalize_reservation_reference(text)` remains because retained `track_complaint(text,text)` uses it.
- Historical `activity_log` and `notifications` tables, constraints and rows remain unchanged.
- The retained announcement/event SMS path, official activity logging, complaint tracking and notification history remain intact.
- Three retained SMS constraints are narrowed only after confirming there are no retired-source or `schedule_update` rows.
- No `DROP ... CASCADE`, `DELETE`, `TRUNCATE`, broad schema drop or migration-ledger insertion.
- Postconditions require all six tables absent, exactly 50 application tables remaining, five replacements and complaint functions present, and ten retired routines absent.
- Dollar-quoted blocks are balanced and `git diff --check` passes.

No local PostgreSQL parser is installed, and production execution is prohibited in Stage 18C. Execution must use PostgreSQL 17 `psql -X --no-password --set=ON_ERROR_STOP=1 --file=...`; any error must stop without retry. PostgreSQL transactional DDL and the absence of `CASCADE` make unexpected dependencies fail the transaction rather than expand the removal scope.

## Shared-function preservation

| Function | Preserved |
|---|---|
| `stamp_activity_actor()` | Trigger signature, volatile `SECURITY DEFINER`, `search_path=public`, service/direct maintenance behavior, server actor stamping and official writes. |
| `sms_may_manage(text,uuid)` | Stable boolean `SECURITY DEFINER`, empty search path and linked active-official authorization for announcements/events. |
| `sms_source_content(text,text)` | Stable JSONB `SECURITY DEFINER`, empty search path and announcement/event lookup. |
| `sms_message(text,jsonb)` | Immutable, security-invoker text function, empty search path and announcement/event formatting. |
| `sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)` | Volatile UUID `SECURITY DEFINER`, idempotency, preview-token validation, audience snapshot, recipient creation, source-rule persistence and audit entry. |

Captured direct-execute privileges remain unchanged because the functions are replaced in place: `authenticated` retains `sms_prepare_broadcast`; `service_role` retains `stamp_activity_actor`; the other three remain internal helpers without direct `anon`/`authenticated`/`service_role` execution.

A targeted read-only dependency check found no retained caller of the ten routines being removed. The only routine-to-routine references were within the retired set: `stamp_reservation_reference()` → `generate_reservation_reference(integer)` and `enforce_reservation_window()` → `reservation_slot_hour(text)`. Drop ordering handles both.

## Fresh recovery checkpoint

Private directory:

`C:\Users\Ezequel\BarangayBatinguel-PrivateBackups\Stage18C-PreCleanup-20261113-143542`

The directory and all ten contained files were restricted to Ezequel, SYSTEM and local Administrators. ACL verification found zero additional allowed principals.

### Full PostgreSQL 17 archives

| Copy | Path | Size | SHA-256 | `pg_restore --list` |
|---|---|---:|---|---|
| Original | `C:\Users\Ezequel\BarangayBatinguel-PrivateBackups\Stage18C-PreCleanup-20261113-143542\barangay-batinguel-pre-cleanup-20261113-143542.dump` | 1,196,038 bytes | `B4D2B5ECA36FC5E49D6C75885E4440E31F5C9B6E099C736A6F5000E476E761FC` | Exit 0; 1,772 TOC entries |
| Independent copy | `C:\Users\Ezequel\BarangayBatinguel-PrivateBackups\Stage18C-PreCleanup-20261113-143542\VerifiedSecondCopy\barangay-batinguel-pre-cleanup-20261113-143542.dump` | 1,196,038 bytes | `B4D2B5ECA36FC5E49D6C75885E4440E31F5C9B6E099C736A6F5000E476E761FC` | Exit 0; 1,772 TOC entries |

The copies match byte-for-byte. Full restoration remains unrehearsed.

### Focused recovery exports

- Six-table custom archive: `retired-six-tables-focused.dump`
  - 36,269 bytes
  - SHA-256 `2448444AC28763CC22A2B877EC2686F83CE6B168FB1ACA9CF8AA80143FCEC73E`
  - `pg_restore --list`: exit 0; 66 TOC entries
  - Confirmed schema and table-data entries for all six tables
- Five original functions: `five-original-shared-functions.sql`
  - 8,084 bytes
  - SHA-256 `05EC0DB1481527AB9725D1731D91D64BA654EF712A1CC151C0140F36A1311587`
  - All five definitions present; no credential/secret assignment pattern detected
- Redacted security manifest: `five-original-shared-functions-security-manifest.txt`
  - 462 bytes; five rows
  - SHA-256 `2F8F0DA41FBBF74CBCD2F344D4DF3372BA2018BAB56D99C46CE6A72A10814CBC`

## Final read-only production precheck

The compact precondition mirror ran successfully in `BEGIN READ ONLY` and ended with `ROLLBACK`. All checks returned true:

- 56 current application tables
- all six targets present
- no inbound FKs
- expected trigger and policy counts
- all five original function hashes match
- no retired SMS rows
- complaint normalizer and tracking function present

## Approved removal scope represented by the draft

Tables:

1. `public.reservations`
2. `public.health_events`
3. `public.medical_programs`
4. `public.waste_schedule`
5. `public.nurse_availability`
6. `public.medicine_stock`

The draft also removes their twenty policies, four reservation triggers, ten reservation-only routines and table-owned constraints/indexes/FKs. It replaces only the five shared branches and three SMS check constraints required to remove retired functionality safely.

## Remaining limitations and decision

- Full database restoration has not been rehearsed.
- Database archives do not independently preserve Storage object bytes or hosted Edge Function configuration.
- The retired `notify-reservation-sms` Edge Function should be separately disabled or removed; it is not invoked by the deployed frontend and cannot be removed by SQL migration 070.
- A maintenance/write pause and fresh confirmation of the active production target are still required immediately before execution.

**GO for requesting explicit owner execution authorization.** This is not execution authorization. No migration, production write, deployment, commit, push or merge occurred in Stage 18C.
