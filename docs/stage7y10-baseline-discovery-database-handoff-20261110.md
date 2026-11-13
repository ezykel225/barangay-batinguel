# Stage 7Y.10 — Baseline discovery and database handoff

November 10, 2026. Defense November 16 and 18. **No complete usable baseline located in this focused search. Staging reconstruction BLOCKED; deployment NO-GO.** No invented baseline generated.

## Focused search and classification

Inspected repository SQL/backup filenames, PROJECT_HANDOVER and existing recovery/compatibility reports, locally available Git-history SQL/dump/backup path names, and the documented private baseline location. A bounded content scan of **93 current SQL files** under migrations/tests/seeds found no CREATE TABLE for the original profiles/reservations/officials baseline and no PostgreSQL-dump marker/COPY-public candidate. This is a targeted discovery check, not an exhaustive forensic scan or proof that no backup exists anywhere on the computer.

| Candidate / evidence | Classification | Result / sensitivity |
|---|---|---|
| `supabase-migrations/001_capres2_features.sql` through 060 | Historical incremental migrations / partial schema | 001 first assumes reservations/profiles and existing policy/constraint names. Not an empty-project bootstrap; historical corrections/backfills cannot be blindly replayed |
| Prepared 068 and 069 | Additive security corrections, not baseline | Unchanged; no historical-data bootstrap; runtime tests still pending |
| Git history paths for 061–067 | Historical migrations, not initial schema | Not present in current migration folder; do not restore/replay to fill numeric gaps; 064 excluded |
| `supabase-tests/` and generated runners | Partial test/install/diagnostic SQL | Not a complete authoritative baseline. May contain synthetic fixture writes or prior setup references; not approved production/staging installers |
| `supabase-seeds/seed_demo_barangay_residents.sql` and preserved SMS seed | Data-bearing synthetic seed scripts | Not Auth/bootstrap schema; preserve unchanged. Synthetic labeling is not permission to run them; account/links/constraints need separate fixture review |
| Private `docs/production-audit-evidence/` exports | Partial catalog/security evidence | Strong structural comparison evidence, no full schema bodies/policy/default/check definitions; cannot restore a database. Keep ignored/private |
| PROJECT_HANDOVER and production-compatibility report references to a recovered schema-only snapshot | Unverified historical artifact reference | Documents establish prior use, not current file existence/completeness/provenance. They do not authorize restoration |
| `%LOCALAPPDATA%\Temp\barangay-analytics-062-baseline\schema.raw.sql` | Documented schema-only export candidate, currently unavailable | Containing directory absent during this search; no content inspected or copied |
| Documented temp `barangay-rc3-local` and `bb067-preservation-20261106` locations | Recovery-reference locations | No discoverable SQL/dump/archive baseline candidate found by bounded filename inspection. Historical Docker snapshot/writable-layer references would be potentially data-bearing recovery artifacts, not clean hosted schema definitions; no Docker used or binary unpacked |

No original complete baseline path was found in the locally available Git-history filename search. No credential files, environment values, raw resident records or backup payloads were printed. No new secret-free certification is possible for an unavailable snapshot. SQL migrations can contain historical real official names and data corrections; do not treat repository text as a synthetic seed.

## Sensitive-content disposition

No complete dump candidate was available to inspect for data or secrets. **Do not infer that a missing/unreviewed backup is safe.** Any future recovered candidate needs private classification before use:

- Detect INSERT/COPY data, Auth records/password hashes, storage data, sequences and mixed schema/data payloads without publishing values.
- Review function bodies, defaults, policy literals, URLs/settings, scheduled jobs and outbound automation for secrets/personally identifying literals.
- Verify source/checksum/date, database version, required extensions, owner/grant assumptions and the schema boundary already represented. Do not import production data or managed Supabase Auth/Storage internals into a new project.
- Keep raw candidates outside Git/private; sanitized application DDL is a separately reviewed derivative, not an automatic export. Do not execute a candidate merely to discover its contents.

## Exact reconstruction dependencies still unresolved

Required missing authoritative foundations include original profiles/role/default/identity/FK definitions; is_official(uuid) implementation; reservations and the exact policies/constraints required by 001; original officials/reference/audit/public-content/availability objects and any old triggers/grants used by historical files. Existing metadata verifies many object shapes, not complete expressions or all private writers. An empty managed Supabase project supplies managed platform schemas but not these custom application objects.

If an actual complete application-schema snapshot is later recovered, first determine whether it represents pre-001, post-060 or another boundary. **Do not apply 001–060 over objects already represented.** Compare exact definitions, all dependencies, ownership/grants/RLS and trigger bindings; review 030 link backfill assumptions and historical data corrections. Then demonstrate a clean, repeatable hosted reconstruction with synthetic-only fixtures and separately approved capacity/recovery. This validation has not happened. No finite exact missing-object list can be certified from an unavailable snapshot.

## Database handoff — established evidence and blockers

Established from provided metadata: 45 required ordinary tables; 104 required function names; 103 locally declared contracts and 227 explicit role-grant expectations matched; 322 extracted CREATE-column declarations and 44 named indexes matched within their stated bounds; Q5 complete at 1,245 unique keys, 28 identical overlaps, zero conflicts/gaps. Five profile/Auth trigger bindings structurally match; Q6 is transcribed evidence. Policies: 64 metadata rows. Version history: 88 entries reported, machine-readable version CSV missing. These are not proof of every predicate/body or live runtime behavior.

Owner-confirmed definition summaries establish current broad official verification authorization, insufficient independent metadata protection, own INSERT constrained only by own id/resident role, and pending/null verification defaults. 068 proposes linked active Secretary/Punong decision authorization, stable-field/metadata guard and server stamps; 069 adds safe pending/null initial INSERT. Both remain unchanged and unexecuted. Trusted Auth/service/private writers and actual patched JWT enforcement require independent validation.

Hard blockers: complete sanitized reconstruction baseline; approved disposable hosted capacity (both existing projects protected); real synthetic account/link manifest; outbound delivery containment; hosted-compatible test adapter; proven recreation/recovery; executed authorization/side-effect tests. See Stage 7Y.8 for tests and Stage 7Y.9 for setup feasibility. Missing timestamp CSV is separate provenance work, not a substitute for any blocker.

Future real JWT tests need Resident A/B, Secretary, Punong, other Official and Tanod plus archived/unlinked staff and profile-less INSERT case if reachable; actual Auth-issued sessions, exact synthetic ownership/position links and controlled fixtures. Verify direct INSERT/PATCH/UPSERT, allowed editing/resubmission, unauthorized decisions/metadata/role changes, legitimate admin decisions, independent notification/directory/audit state, and unchanged V1 ledger/model with expected enrollment at 100. No mock Auth, production mutation probes or privilege escalation to make tests pass.

## Defense-ready architecture and security statement

“Barangay Batinguel E-Services uses React/Create React App for the interface, Supabase Auth for identity, PostgreSQL with RLS and server-side RPCs for data access and business rules, Storage for protected files, and Vercel for frontend hosting. Retained modules cover residents, documents, complaints/KP, incidents/blotter, Tanod, public safety/analytics, announcements/events/officials, SMS/audit/reports and Community Credit V1.

“Frontend permissions guide navigation; database policies and RPC checks must enforce access. Our metadata reconciliation confirms required structures and many interface contracts. It does not prove every authenticated workflow or authorization path. We identified verification authorization and profile initialization gaps and prepared migrations 068/069, which have not been applied or runtime-tested. Community Credit remains V1 with server-calculated scores and its 100-point starting model; complaints or incident involvement alone do not automatically deduct points. No V2 policy is claimed active.

“We are withholding deployment approval until safe isolated database reconstruction, real JWT-backed authorization tests and recovery checks are complete. The two existing cloud databases remain protected.”

This describes source implementation and evidence status, not a claim that every feature has passed current authenticated cloud QA. Do not substitute screenshots/static tests for runtime security evidence or imply a schema-only baseline would restore production records/files/configuration.

## Final decision and next action

**BLOCKED.** One focused search did not locate a complete usable baseline; do not invent one or repeat broad discovery loops. The next meaningful input is an owner-identified existing private schema-only artifact or separate authorization to collect the missing authoritative definitions, plus disposable capacity approval. Neither is authorized by this report. Until then prepare the honest retained-feature defense and preserve both existing projects, historical data and all development work.

Only this report created. No hosted operation, export, SQL/migration execution, application/config changes, Docker/PostgreSQL, commit/push/deployment. Private evidence exclusion retained. No tests/build rerun for documentation-only work. `git diff --check` passed (exit 0; existing line-ending warnings); SHA-256 hashes of 068/069 remain unchanged.
