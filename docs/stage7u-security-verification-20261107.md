# Stage 7U — Migration 068 and resident authorization verification

November 7, 2026. Branch `defense/scope-cleanup-20261106`; HEAD remains `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`. **NO-GO for deployment/security sign-off. Migration 068 is not database-tested.**

## Evidence and environment

Reviewed Stage 7T, Stage 7I/7K reports, migration 068, profile foundations 002/007/011/012, identity helper 031, notification 022, records helper 044, directory sync 055, eligibility RPC 056, frontend signup/resubmission/verification handlers and prepared 068 authorization tests.

Current cloud policy/function/grant definitions were **not retrieved**: no authorized database connection/catalog export is available in this task. Earlier owner-confirmed production findings remain historical evidence, not a refreshed catalog snapshot. No production credentials or session tokens were read or used.

Local inspection found PostgreSQL **18.6 client binaries** under Program Files, but no PostgreSQL process, Windows PostgreSQL service, default `18/data` directory, or listener on the documented 5432/5455 ports. `psql --version` ran; no database connection was attempted. No approved disposable instance/provenance/attestation was established. No Docker, service startup, database creation, restoration, migration execution or environment installation occurred. Client binaries do not provide a database authorization test or server-side SQL syntax validation.

## Repository verification-status entry points

| Entry | Current behavior/evidence | 068 effect |
|---|---|---|
| Direct `profiles` UPDATE through PostgREST | Official Verify/Reject/Not a Resident and fallback reinstatement; existing broad staff and own-row RLS paths | Both UPDATE policy paths and the BEFORE UPDATE guard are narrowed |
| `set_barangay_resident_eligibility(uuid,boolean)` | SECURITY DEFINER authenticated RPC, records-helper check, profile then directory locks, sets verified/ineligible and server metadata; used for linked reinstatement/directory eligibility | Trigger still runs with caller JWT; authorized records staff pass, other callers should fail |
| Resident profile/name editing and ID resubmission | Own-row updates can return a verified/rejected resident to pending; signup can set an uploaded ID path | Defined pending/resubmission/re-verification remains; protected stamps/identifiers guarded |
| `prevent_role_self_change()` | Existing UPDATE trigger can rewrite status to pending after identity changes | Replaced guard covers structured/display name and ID path changes, protected fields and metadata |
| Auth `handle_new_resident_signup()` | 011 inserts a resident profile conditionally on signup metadata, relying on schema defaults for initial status | INSERT behavior is not changed |
| Direct self-profile INSERT; UPSERT insert branch | 002 policy checks own UUID and resident role, not initial verification status | **Not covered by 068**; UPSERT UPDATE branch is covered but insert branch remains a separate question |
| Trusted service-role/direct privileged maintenance | Privileged profile writes outside ordinary user workflows | Explicit service-role and constrained direct maintenance exceptions remain |
| Unrepresented/private cloud functions/triggers | Original baseline and private integrations may include additional writers | Unknown until effective catalogs and definitions are privately reviewed |

Notification and directory-sync triggers consume verification transitions and can create downstream records; they do not themselves prove that the originating decision was authorized. The reviewed Edge source did not reveal an additional verification decision endpoint. Repository scanning cannot prove absence of private/dynamic cloud writers.

## Critical additional finding: INSERT coverage

**Conditional P1 bypass / release blocker requiring investigation.** Migration 002's self-profile INSERT policy is:

```sql
WITH CHECK (auth.uid() = id AND role = 'resident')
```

It does not constrain `verification_status`, `verified_by`, `verified_at` or notes. Migration 068 only alters UPDATE policies and an UPDATE guard. Migration 011's Auth trigger is conditional on resident role metadata; the repository explicitly documents a historical path where an Auth user can exist without an automatically inserted profile. Migration 055 has an AFTER INSERT directory-sync path, so accepting an initially verified profile could also reach synchronization.

If authenticated callers still have suitable INSERT privileges, a profile-less Auth identity can exist, and no other effective insert trigger/constraint rejects it, an own resident profile might be inserted already verified. This was **not attempted**, and current production exploitability is unverified. Defaults alone do not constrain explicitly supplied INSERT values. The prior UPDATE-focused tests do not close this question.

Before claiming a complete correction, privately review all INSERT/ALL policies, column grants, Auth signup trigger bindings and profile INSERT triggers. In an approved isolated environment, test signed-JWT self-inserts/upserts with forged status/stamps and legitimate pending signup. If exposed, prepare a separately reviewed insertion correction (for example, restricting ordinary self-inserts to pending with empty decision metadata while preserving trusted signup/maintenance). **068 was not modified here.** Do not patch production or silently expand 068's scope without review.

## Current and expected permission matrix

The current column/policy findings below are from the owner's earlier inspection: profiles RLS enabled, authenticated UPDATE across all 18 columns, permissive staff `is_official(auth.uid()) AND role='resident'`, own-row `auth.uid()=id`, null explicit WITH CHECK. Null WITH CHECK normally reuses USING; it does not mean unrestricted new rows.

| Actor/path | Legacy evidence | Expected UPDATE behavior after 068 — not executed |
|---|---|---|
| Active linked Secretary/Punong | Recognized official can decide | Verify/reject/ineligible/reinstate resident targets; verifier/time stamped by server |
| Other recognized official | Old guard allows official status decisions | Denied through direct UPDATE and eligibility RPC; own ordinary editing remains where allowed |
| Archived/unlinked official | Effective `is_official` behavior not refreshed | Cannot pass position-linked records helper; decision denied |
| Resident owner | Status self-approval blocked by old guard; metadata independently under-protected | No decisions/forged stamps or protected identifiers; legitimate contact edits and defined pending resubmission allowed |
| Resident targeting another account | Intended own-row RLS denial | Denied; existing staff path not available |
| Anonymous | Current effective grants not refreshed | No ordinary decisions; guard rejects missing actor if an UPDATE reaches it |
| Service/direct trusted maintenance | Separate privileged path | Explicit controlled bypass retained; never use this credential to represent ordinary account QA |
| Self-profile INSERT | Effective cloud grants/insert protections unverified | Not changed by 068; must be assessed separately |

044's helper checks Secretary or Punong using 031's official-profile/account-link/non-archived directory-position predicate. This is stronger than the old generic official test. Frontend Secretary/Punong gating and the 7R.1 menu are unchanged and are not database security proof.

## Static migration assessment

Reviewed transaction boundaries, 3-second lock/30-second statement timeouts, dependencies, explicit UPDATE USING/WITH CHECK, protected-field allowlist, auth actor handling, definer-safe maintenance checks and function EXECUTE revocation. Trigger type checks match unconditional compose/guard ordering and existing notification/sync bindings. No evident static defect was found in those reviewed UPDATE protections, but PostgreSQL parsing/execution and effective-role behavior remain unproven.

Expected compatibility: existing staff payloads may still send verifier/time, but the guard overwrites them; rejected/verified owners may resubmit to pending under defined rules; verified name/ID changes clear stale decision stamps; ineligible owners cannot reopen themselves; notifications and UUID-based directory synchronization remain AFTER-trigger behavior. Eligibility RPC locks, audit and directory snapshot restoration are unchanged.

Risks requiring rehearsal: helper EXECUTE/ownership and schema resolution, effective policy roles, exact trigger inventory, private Auth writers, unknown columns/constraints, service maintenance, affected-row/RLS behavior and authorized ID-file cleanup. 068's preflight intentionally aborts on unexpected prerequisites rather than creating stubs. It does not validate the full INSERT surface.

Prepared harness cases cover actual baseline privileges, legacy vulnerable controls, exact guard-origin denials versus unrelated 42501 errors, allowed row counts, Secretary/Punong decisions, ordinary/archived/unlinked/resident/anonymous cases, protected/mixed updates, resubmission, metadata, maintenance, notifications, directory/audit effects and rollback fingerprints. These are **prepared tests, not executed PostgreSQL results**. Add the INSERT/upsert cases above before complete authorization sign-off. Real JWT-backed Auth/PostgREST verification remains separate from SQL role impersonation.

## Safe application and verification plan — not executed

1. Obtain fresh metadata through an owner-authorized read-only connection to the existing project. Store full old function/policy/grant definitions privately for recovery; hashes alone cannot restore definitions. Never store private schema/credentials in Git.
2. Resolve the INSERT question and review any correction separately. Confirm 068's exact prerequisite/schema/helper/trigger inventory and current migration state. Do not auto-apply 061–067 or migration 064.
3. Obtain explicit approval for use of an appropriate existing disposable synthetic environment, or provision one only under a separate future authorization. Verify exact endpoint/cluster, schema provenance, fictional accounts, existing attestation and outbound delivery containment per Stage 7K. This task did not authorize creating that environment.
4. Run the prepared legacy control with `psql -X -v ON_ERROR_STOP=1` and protected local credentials, under the documented explicit environment gates. Require real baseline allowed operations and vulnerable controls to distinguish actual guard protection from unrelated denial.
5. Under separate approval, apply only the reviewed correction in that environment, run the post-patch SQL matrix and cleanup checks, and compare schema/data fingerprints. Extend and execute INSERT/upsert cases.
6. Run legitimate JWT-backed isolated API cases with the same actors, one returned affected row for allowed changes, unchanged data for denied changes and verified downstream stamps/notifications/directory/audit effects. Do not count an empty UPDATE response, expired token or missing function as proof of the intended denial. API mutations require synthetic cleanup approval.
7. Before any production request: obtain tested backup/recovery evidence, private old definitions, a maintenance plan and **explicit production migration authorization**. Fresh read-only metadata is not authorization to apply SQL.
8. Post-change metadata and role/workflow checks must be separately approved. Browser navigation can mark notification/document-view metadata as seen; do not call it read-only without an explicit plan.

### Exact read-only metadata queries for review

Not run here. Run only in the authorized project, output metadata without application records or credentials. Review any embedded policy identifiers privately before sharing.

```sql
begin read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select current_setting('server_version'), current_setting('transaction_read_only');
select relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner
from pg_class where oid='public.profiles'::regclass;
select policyname,roles,cmd,permissive,qual,with_check
from pg_policies where schemaname='public' and tablename='profiles';
select grantee,column_name,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='profiles'
and privilege_type in ('INSERT','UPDATE');
select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig,
 pg_get_userbyid(p.proowner) owner,md5(pg_get_functiondef(p.oid)) fingerprint,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in
 ('is_official','current_official_holds_position','current_official_may_administer_records',
 'prevent_role_self_change','compose_full_name','handle_new_resident_signup',
 'notify_verification','sync_verified_resident_directory',
 'set_barangay_resident_eligibility','save_barangay_resident');
select tgrelid::regclass::text target,tgname,tgfoid::regprocedure::text function_signature,
 tgtype,tgenabled,md5(pg_get_triggerdef(oid)) definition_fingerprint
from pg_trigger where tgrelid in ('public.profiles'::regclass,'auth.users'::regclass)
and not tgisinternal;
select column_name,data_type,is_nullable,md5(coalesce(column_default,'')) default_fingerprint,
 has_column_privilege('authenticated','public.profiles',column_name,'INSERT') authenticated_insert,
 has_column_privilege('authenticated','public.profiles',column_name,'UPDATE') authenticated_update
from information_schema.columns where table_schema='public' and table_name='profiles';
select conname,contype,convalidated,md5(pg_get_constraintdef(oid)) definition_fingerprint
from pg_constraint where conrelid='public.profiles'::regclass;
rollback;
```

For complete entry-point discovery, privately inventory every effective SECURITY DEFINER function and all Auth/profile trigger bodies, including writers absent from repository history. Fingerprints/signatures alone cannot prove absence of dynamic SQL bypasses. Do not invoke those functions merely to discover their behavior.

### Rollback and recovery

068 has no backfill and is atomic; a failed migration transaction should roll back its DDL, subject to verified deployment tooling. A committed change still requires a reviewed recovery/forward-repair procedure. Restoring the old broad policy/guard reintroduces the known vulnerability and is not a safe automatic rollback. Prefer a reviewed forward repair or separately authorized server-side containment; hiding frontend buttons is insufficient. Never broadly restore production data as a casual permission rollback. Successful subsequent decisions/notifications cannot be undone by restoring function definitions; preserve audit evidence and review affected records individually. External delivery, sequence increments and consumed notifications are not reversed by ordinary test rollback.

## Low-risk frontend reporting fixes implemented

- Renamed **Verified Residents → Verified Resident Accounts**, reflecting the existing account-status grouping. Linked Online Accounts still counts directory rows with explicit link state; it is intentionally a different measure.
- Reports now uses existing source readiness metadata. Loading/denied/error/incomplete reads show Loading/Restricted/Unavailable instead of zero or stale partial totals. Monthly charts and document ranking are withheld until a complete authorized document read is confirmed. No query, pagination, backend count or record collection changed; capped data is not silently treated as complete.
- Six-month report buckets now use **Asia/Manila**, including UTC month/year boundary cases. Audit timestamps also display Manila time with an explicit label; stored timestamps/order are untouched. Invalid timestamps display Not recorded.
- Added regression coverage for legitimate zero versus unavailable counts, capped/denied/error report data, account-link semantics and month/year/timezone boundaries. One existing fixture now supplies the exact-count metadata its real query already requests; authorization assertions remain intact.

Files changed by this stage:

1. `src/dashboards/OfficialDashboard.jsx`
2. `src/dashboards/reportingPresentation.js` (new)
3. `src/dashboards/reportingPresentation.test.js` (new)
4. `src/dashboards/OfficialRemaining.test.jsx`
5. `src/residents/officialResidentsViews.test.js`
6. This report.

Migration 068, SQL harnesses, verification handlers, Community Credit and earlier UI implementations were not modified. Existing source changes remain uncommitted. Migration SHA256 remains `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

## Validation and decision

- Focused regression/static contracts: **35 tests / five suites passed**.
- Full Jest: **2,619 tests / 117 suites passed**, exit 0, 124.995 seconds. Existing React act/router and expected mocked API diagnostics remain; this does not certify a live browser console or real SQL.
- Normal production build: **passed**, exit 0, compiled successfully.
- Strict `CI=true` production build: **passed**, exit 0, compiled successfully.
- `git diff --check`: **passed**, including the final implementation review.
- Executed SQL authorization tests: **none**. No server-side SQL syntax execution, migrations, catalog requests or production API tests occurred. Frontend/Jest results cannot prove PostgreSQL RLS correctness.

**Updated decision: NO-GO for deployment/security approval.** The UPDATE correction is a reasonable static candidate for isolated rehearsal, not a validated complete authorization closure. The newly identified INSERT coverage question, missing current cloud metadata and unexecuted SQL/JWT matrix are blocking. Reporting fixes improve accuracy but do not mitigate the verification security issue. No production operation, SMS, Docker, commit, push or deployment occurred.
