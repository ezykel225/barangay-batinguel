# Stage 7T — Final security review and authenticated QA status

November 7, 2026. Branch `defense/scope-cleanup-20261106`; HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08` unchanged. **Deployment recommendation: NO-GO.** Passing frontend tests/builds does not resolve the verification authorization issue or certify hosted functionality.

## Evidence boundaries

- Source reviewed in this stage: profile migrations 002/007/011/012/022/031/044/055/056/068, V1 059/060, prepared 068 test scripts, Stage 7I/7K reports, Auth/route handling, verification handlers, notification read effects, Resident/Tanod dashboards, directory summaries and Reports data flow.
- Existing owner-reported production metadata, recorded in Stage 7I/7K, confirms the broad profile UPDATE policy/guard weakness. This stage did **not** independently refresh cloud catalogs or execute production SQL/API calls.
- Local `.env` was inspected privately in memory: URL targets the existing `mpcyqwasurhtdztzobwg.supabase.co` host; expected anon key is present and its decoded role field says `anon`. Decoding is not signature validation. No key/token/password was printed; no connection/request was made. These facts do not prove hosted schema compatibility or running-server configuration.
- Browser inventory returned **“The browser access host is unavailable”**, with no browser-connector tabs. Native Chrome windows exist, but no legitimate role/session was established through an authorized browser connection. No native account screen, credential note, browser profile storage or session tokens were inspected. No authenticated workflow passed in this stage.

## 1. Resident verification authorization

### Actual frontend paths

| Decision | Current implementation | Intended frontend permission |
|---|---|---|
| Verify | `profiles` UPDATE to `verified`, client verifier/time, clear notes | Secretary/Punong |
| Reject | `profiles` UPDATE to `rejected`, client verifier/time and reason | Secretary/Punong |
| Not a Resident | `profiles` UPDATE to `ineligible`; checks returned ID, then may remove ID file/clear path and add audit entry | Secretary/Punong |
| Reinstate | For a linked directory record, reads `barangay_resident_directory()` and invokes `set_barangay_resident_eligibility(uuid,boolean)`; otherwise direct profile verification UPDATE | Secretary/Punong |

Sources: `OfficialDashboard.jsx` handlers `handleVerifyResident`, `handleConfirmReject`, `handleConfirmIneligible`; `ResidentDirectory.jsx`; migration 056. The Requests menu introduced in 7R.1 still calls these same handlers. There is no dedicated universal verification-decision RPC in the current client.

Migration 056's eligibility RPC is SECURITY DEFINER, has authenticated EXECUTE, and checks a non-null caller plus `current_official_may_administer_records()`. That helper (044) checks Secretary or Punong via `current_official_holds_position(text)` (031): official profile, explicit `official_account_links` link, matching directory position and non-archived directory row. A directory RPC's restrictive check does **not** secure a separate direct profile UPDATE path.

### Existing production findings versus intended authorization

Historical owner-confirmed findings: profiles RLS enabled; authenticated UPDATE on all 18 columns; permissive staff policy `is_official(auth.uid()) AND role='resident'`; own policy `auth.uid()=id`; both have null explicit WITH CHECK. **Null WITH CHECK normally reuses USING; it does not mean unrestricted new-row access.** Permissive policies combine by OR.

Migration 007's guard independently prevents API role changes and non-official self-verification/status decisions, allowing legitimate returns to pending and name-change re-verification. It explicitly permits status changes by any caller recognized by `is_official`, and does not independently protect verifier/time/notes or all account identifiers.

Consequences, conditional on the historically confirmed definitions still being installed:

- Secretary/Punong and **other callers recognized as officials** can reach the broad resident UPDATE path; hiding buttons does not stop direct requests.
- Ordinary officials are not constrained to Secretary/Punong decisions by the old guard. The exact current `is_official` definition and archived/unlinked-account behavior require fresh cloud inspection; do not infer those denials from the newer position helper.
- Residents cannot simply set themselves verified/rejected/ineligible through the documented old guard, and cannot promote their role. Their own-row path nevertheless lacks independent protection for decision metadata. The old guard permits metadata-only tampering when other protected transitions are not triggered.
- Other account fields such as email/system ID/creation time lack the proposed independent column guard. Actual exploitability depends on current column constraints, other triggers and policy checks; this stage did not attempt it. In particular, own-row RLS checks can still reject changing the profile UUID, so all-column grants alone are not proof that every identifier change succeeds.
- Tanod/anonymous callers must not receive staff decision access. Current production grants, `is_official` behavior and all policy paths were not reverified for them. Service-role maintenance is a separate trusted path, not an account to use for ordinary QA.

### Severity

| Severity | Finding | Evidence/status |
|---|---|---|
| P1 — release blocker | Verification decisions are broader than intended records-administrator authorization; metadata integrity is under-protected | Historical production findings plus matching repository guard; current catalogs not independently refreshed |
| P1 — release gate | Migration 068 has no executed PostgreSQL or real JWT-backed authorization proof | Stage 7K and test scripts explicitly prepared-only; static tests cannot fill this gap |
| P2 | Verify/Reject treat error-free direct UPDATE as success without requiring a returned affected row | Source verified; unlike Not a Resident, no zero-row check. RLS filtering can yield false success/audit attempts. Not executed against accounts |
| P2 | Hosted role/privacy/workflow compatibility remains uncertified | No authenticated cloud tests this stage |

No new P0 defect was established; that is not an exhaustive assurance that none exists.

## 2. Migration 068 assessment

**Unchanged, unapplied, ready for isolated review/rehearsal only; not production-validated.** SHA256: `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

It addresses both permissive UPDATE paths: staff policy uses the records-administrator helper with explicit new-row check; own policy retains identity checks; the replacement trigger protects role/account identifiers and all verification metadata across either path. Staff decision stamps use the actual actor and server clock. Owner resubmission and name/ID changes return to pending under defined conditions. Ineligible-owner re-entry is blocked. Service-role and tightly constrained direct maintenance paths remain explicit. Notifications and directory-sync AFTER triggers are not replaced.

Reviewed compatibility safeguards: transaction/short timeouts; required columns/helpers/RLS; expected policies; enabled/unconditional compose/guard trigger ordering and notification/sync bindings; no backfill or score changes. Dependencies are the installed profile/directory foundations, not pending 061–067. Do not apply 064 or numeric predecessors automatically.

Remaining assumptions: fresh effective helper definitions/ownership/grants, complete UPDATE/ALL policy inventory and roles, column types/constraints, undocumented Auth/profile writers and storage cleanup permissions. The preflight does not substitute for a complete catalog review. Do not apply blindly because its file parses in a static test.

Prepared SQL coverage includes baseline permissions and actual allowed operations, legacy vulnerable controls, exact denial origin/error or zero-row distinctions, authorized decisions, resident resubmission/forgery, ordinary/archived/unlinked/anonymous denial, protected/mixed updates, service/maintenance paths, notification/directory/audit effects and rollback fingerprints. None of these SQL scripts ran in Stage 7T. Real JWT-backed API testing and full schema/provenance/egress checks remain required; rollback cannot undo external delivery, sequence increments or already observed events.

Follow `docs/stage7k-068-isolated-validation-20261106.md`: separately approve a disposable schema-matched synthetic environment, verify outbound isolation and attestation, run the legacy control, apply only reviewed 068 there, run authorization/cleanup assertions, then test actual isolated Auth/PostgREST requests. No Docker, provisioning or migration execution was performed here.

## 3. Authenticated QA — performed and blocked

**Performed:** browser-capability inventory; source-side effect audit; private local configuration classification; local Jest/build checks. **No live login, logout, session refresh, role dashboard, RPC result, modal, filtering or responsive workflow was verified.** Prior offline screenshots are not new hosted QA evidence.

Two independent barriers prevent claiming read-only end-to-end success:

1. Browser connector host unavailable; no owner-confirmed test accounts/sessions connected through an available authorized method. No credentials were requested in chat or extracted from files/windows. No Supabase database connector is available in the enabled tool inventory.
2. Ordinary navigation can write records. Resident Documents invokes `markRequestsViewed()` updating `document_requests.resident_viewed_at`. Resident and Official tab effects mark matching notifications read, and `useNotifications.markRead()` inserts into `notification_reads`. Opening a page without pressing Save is therefore not necessarily read-only.

| Requested workflow | Stage 7T result |
|---|---|
| Resident login/dashboard, documents, complaints, V1 credit | Blocked/unperformed; connector/session unavailable and navigation effects need an approved safe path |
| Official Residents/Requests/documents/complaints/incidents/map/reports/log/settings | Blocked/unperformed; no verified live session, tab notification effects |
| Tanod login/dashboard/schedules/role restrictions | Blocked/unperformed; no authorized connected session. Source has active identity/duty/report readers; check-in/out/reporting are writes and were not invoked |
| Unauthorized routes/privacy | Repository/component tests only; hosted RLS not proven |
| Live modals/filtering/pagination/responsiveness | Unperformed; preserve prior explicitly offline evidence |

Safest next options: restore authorized browser access and confirm designated accounts; for strictly read-only hosted checks, use separately authorized minimal authenticated GET/read-only RPC requests after reviewing function bodies for side effects. For normal browser navigation, obtain explicit approval for the bounded notification/document-view metadata updates or use a separately approved isolated backend. Do not intercept/pretend successful backend writes and call that live verification. Do not use a service-role key for role QA. Opening read-only metadata in SQL Editor is separate from business-record testing.

## 4. Data/reporting consistency

- Migration 060 defines enrollment starting score **100**, fixed range **0–100**, and server calculation `greatest(0,least(100,starting_score + event_total))`. `CreditProfile` passes returned `current_score`/`maximum_score` to the gauge. V1 management retains policy/rule adapters; no V2 activation occurred. These are repository contracts, **not a current cloud-policy/score check**.
- Reports “Verified Residents” counts resident **accounts** in the verified status group. Directory “Linked Online Accounts” counts **directory rows** with `profile_id` or `account_linked`, irrespective of verification. Neither is a population count, and they need not match. Recommendation: clarify the Reports label as verified resident accounts after review; no label changed here.
- Reports charts count the actual `documentRequests` array retrieved for the caller: six device-local calendar-month buckets based on `created_at`, and document-type counts/ranking. No fabricated series. Completeness depends on the accessible response, not the entire barangay database.
- **P2 confirmed:** `readOverviewRows()` records denied/error/incomplete states, but Reports computes and displays arrays without checking those states. A failed initial read can look like zero; a capped successful response can produce partial totals; failed refreshes can leave stale totals. Overview itself has readiness handling, so that protection must not be assumed to extend to Reports.
- **P2 confirmed:** Reports month buckets and Activity Log timestamps use browser-local dates; dedicated analytics uses Manila semantics. Boundary results can differ on a device in another timezone. No date logic changed in this audit.
- **P2 confirmed:** Activity Log fetches newest 200 entries; failure preserves old/empty data without a dedicated error state in that section. Do not present the view as proof of complete immutable database audit coverage.

## 5. Validation executed

- Focused: **121 tests / eight suites passed**: 068 static contracts, resident permission/group/directory behavior, Requests confirmations/menu, retained reports/settings, V1 presentation and Tanod Auth contracts.
- Full Jest: **2,608 tests / 116 suites passed**, exit 0, 117.618 seconds.
- Normal production build: **passed**, exit 0.
- Strict `CI=true` production build: **passed**, exit 0.
- `git diff --check`: **passed**.

Existing React act/router and expected mocked API diagnostics remain in test logs. No tests executed PostgreSQL migration 068, production RLS, real role JWTs or hosted business mutations. Logs: `supabase-tests/runners-out/stage7t-*` (untracked diagnostics).

## 6. Optional fresh catalog evidence — owner-executed read-only SQL

Not executed by this stage. Run only in the authorized existing project's SQL Editor; return metadata only, no account rows, tokens, email addresses or ID documents. Function hashes do not prove behavior; body/owner review remains private if hashes differ.

```sql
begin read only;
set local statement_timeout='30s';
select current_setting('server_version'), current_setting('transaction_read_only');
select tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies where schemaname='public' and tablename='profiles';
select grantee,column_name,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='profiles' and privilege_type='UPDATE';
select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig,
 pg_get_userbyid(p.proowner) owner,md5(pg_get_functiondef(p.oid)) fingerprint,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in
 ('is_official','prevent_role_self_change','current_official_holds_position',
 'current_official_may_administer_records','compose_full_name',
 'notify_verification','sync_verified_resident_directory',
 'set_barangay_resident_eligibility');
select tgname,tgfoid::regprocedure::text,tgtype,tgenabled,
 md5(pg_get_triggerdef(oid)) definition_fingerprint
from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;
rollback;
```

This is not authorization to execute a migration or impersonate production roles. Full current schema compatibility still requires private column/type/default/constraint and additional policy/trigger review.

## 7. Decision and next action

**NO-GO for deployment/security sign-off.** Blocking reasons: known verification authorization gap, unexecuted 068 database/API rehearsal, unrefreshed production catalog evidence and absent authenticated role QA. Local UI/automated checks pass, but cannot override those gates. Read-only/offline defense demonstrations may continue within their documented limits; do not claim backend authorization passed.

Recommended sequence: collect fresh metadata safely; separately authorize the isolated 068 validation environment/rehearsal; review and resolve failures; establish legitimate browser sessions with an explicit plan for navigation-side-effect writes; complete role/privacy QA; review production backup/recovery and deployment authorization separately. Reporting correctness improvements should be reviewed as focused follow-up fixes.

**Application changes in Stage 7T: none.** Only this report was added, plus generated local diagnostic logs. No production access/changes, migrations, SMS, commits, pushes, branch switches or deployment. Earlier work and migration 068 remain preserved.
