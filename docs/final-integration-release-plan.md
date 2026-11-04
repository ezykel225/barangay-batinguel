# Final integration and safe release preparation

Prepared 2026-11-04 (Asia/Singapore). Target: 2026-11-11.

**HOLD: this is a review plan, not authorization to apply SQL, activate V2,
merge, push, retarget PRs, change Auth accounts or deploy. Migration 064 and
PR #54 are excluded.** No production database was queried for this review.

## 1. Git state and work to preserve

Current branch: `claude/community-credit-v2-schema`.
HEAD and preserved `codex-067-checkpoint`:
`38aab1393c2d24df26f752118b5ec5e868103568`.
The local HEAD descends from PR #65's consolidation commit. The checkpoint is
the original draft, not a checkpoint of the current revised working tree.

The full tracked/untracked inventory is in the companion
`final-integration-working-tree.txt`. No files were staged, removed or reset.

Preserve and eventually review together:

- Revised migration 067; its behavioral harness, builder, concurrency runner and
  validation rationale; migration-order guard and corresponding test changes.
- Community Credit profile/gauge, V2 workflow and corrections components, API,
  responsive styling, integration changes and tests.
- Public navigation, footer, About/detail-page and people-search layout fixes;
  document-preview scaling, analytics scroll accessibility, map resize helper and
  lifecycle tests; corresponding profile and navigation tests.
- Community Credit and responsive audit documentation, including its pending
  manual browser matrix.

Keep `supabase-seeds/seed_sms_demo_residents.sql` excluded from the release
unless separately reviewed as a project test seed. `supabase-tests/runners-out/`
contains generated runners and diagnostics (including an acknowledged rollback
runner); do not indiscriminately stage it. Preserve it locally. Keep private
schema snapshots/backups outside Git, previews and CI artifacts.

## 2. Exact database sequence and dependencies

Production 059–061 applied and 062 onward pending is **user-reported**, not a
fresh production observation. Verify actual object definitions under separate
production-read authorization before cutover; manual application history may not
be recorded in the Supabase migration ledger.

| Order | File | Objects/compatibility | Security effect |
|---|---|---|---|
| 1 | `062_analytics_insights.sql` | Requires post-061 schema; adds complaints date index, private `analytics_person_matters`, `person_analytics`, `barangay_safety_analytics`, `repeated_dispute_analytics` | Empty search paths/definer readers; only three client readers granted to authenticated; active official required, repeated disputes require records administration |
| 2 | `063_retire_legacy_module_access.sql` | Requires existing legacy objects/policies; independent of 062 but follows it in this release | Revokes retired reservation RPCs and client write/table privileges; removes legacy write policies; preserves retained reference readers and historical rows |
| 3 | `065_retire_nurse_sms_permissions.sql` | Requires 063; replaces `sms_may_manage(text,uuid)` with stable linked active official-only Announcement/Event authorization | Removes all health-source SMS management; helper remains private; no SMS/history deletion |
| 4 | `066_person_history_privacy.sql` | Requires 061/062 plus reviewed 063/065 order; replaces `person_history(text,uuid)` and `person_analytics(text,uuid,date,date,text)`; adds two private identity/record helpers | Preserves existing RPC grants; withholds complaint/KP material from ordinary officials; canonical verified identity handling |
| 5 | `067_community_credit_v2.sql` | Core dependencies are 044, 059, 060; independent of analytics, but installed last for one validated release order | Adds RLS-protected workflow tables, immutable history guards, private helpers and guarded authenticated RPCs; replaces five V1 functions in place; does not activate V2 |

Run only **062 → 063 → 065 → 066 → 067**, from a reviewed immutable file/hash
manifest. Never glob all numbered migrations or run a general production reset/
automatic migration runner. These repository files are an incremental record,
not a complete initialization schema. Do not replay 001–061.

The sequence guard permits only the reviewed names after 060 and explicitly
allows 064 to be absent when 065 is present. It also permits an authorized 064
file in other branches; that does not authorize including it in this release.
The actual release manifest must explicitly exclude 064 and PR #54.

Each pending SQL file has its own transaction. Do not combine the files by
wrapping their BEGIN/COMMIT statements in an assumed global transaction.
063 and 065 contain installation guards; never bypass one to force installation.

## 3. Frontend/backend contract findings

The inspected client contracts match the final pending definitions:

| Surface | RPC arguments sent |
|---|---|
| Safety analytics | `barangay_safety_analytics(p_from,p_to,p_category,p_area,p_window)` |
| Repeated disputes | `repeated_dispute_analytics(p_from,p_to,p_window)` |
| Person analytics | `person_analytics(p_person_kind,p_person_id,p_from,p_to,p_window)`; final definition comes from 066 |
| Person history | `person_history(p_person_kind,p_person_id)`; final definition comes from 066 |
| Resident credit | `my_community_credit_profile()` → `{linked,profile}`; administrator `community_credit_profile(p_resident_id)` → profile object |
| Credit lists | `community_credit_activities_list(p_year:null)`, `community_credit_correction_requests_admin(p_status:null)`, `my_community_credit_correction_requests()` |
| V2 policy/rules | Save policy `(p_id,p_name,p_description)`; save rule `(p_id,p_policy_id,p_rule_code,p_title,p_description,p_points,p_annual_points_cap,p_evidence_requirement)`; approvals use `p_id` |
| Activities/awards | Create `(p_request_id,p_rule_id,p_title,p_starts_at,p_ends_at,p_location_note,p_evidence_reference)`; verify `(p_request_id,p_activity_id,p_resident_id,p_mode,p_note)`; award `(p_request_id,p_activity_id,p_resident_id)` |
| Review workflows | Reverse `(p_request_id,p_event_id,p_reason)`; re-award `(p_request_id,p_activity_id,p_resident_id,p_reason)`; submit correction `(p_request_id,p_kind,p_event_id,p_activity_reference,p_message)`; resolve `(p_id,p_decision,p_reason)` |

The client reads server `current_score`, ledger and participation arrays and
labels V2 only for `policy_model='participation_v2'`. Legacy 059/060 output can
still render the V1 gauge. Missing/denied functions produce unavailable states,
not fabricated analytics or sample scores. Reported 404s are consistent with the
stated pre-062 backend; distinguish absent functions, stale API schema cache,
wrong project/configuration and authorization errors during authorized cutover.

066 removes complaint data rather than merely masking it for ordinary officials;
the restricted-history UI and Unified Profile must be tested against those final
responses. Do not deploy 062 alone and leave its older person readers exposed
while waiting indefinitely for 066. Treat this as a coordinated maintenance window.

**Confirmed frontend issues to resolve before a V2 workflow demonstration:**

1. `CreditManagement` filters its `active` variable to legacy policies and uses
   that value for the generic Policy heading. When V2 is active, that legacy
   summary can say the policy is not configured, despite the V2 panel being correct.
2. The legacy rules table offers Edit for every inactive rule, including V2.
   That action opens the legacy rule form, whose policy options now exclude V2.
   Use the correct V2 editing flow or withhold that action; do not bypass SQL guards.
3. V2 transition/activation is intentionally not exposed by the new frontend.
   Installing 067 leaves V1 active. A V2 demonstration needs an isolated fixture
   policy or a separately approved two-person activation procedure; absence of
   production activation is not an installation defect.

No application fixes were made during this review. No incompatible inspected RPC
name/parameter set was found; this is source compatibility, not production proof.

## 4. Deployment blockers

### P0: stop deployment/cutover until resolved

- Current frontend requires functions missing from the user-reported backend.
- The final revised 067/frontend/responsiveness work is uncommitted and not covered
  by the existing remote PR checks. Preserve and review the exact release artifact.
- Fresh authorized schema/privilege preflight, backup, recovery rehearsal and
  production SQL approval are outstanding. The private schema-only export is
  **not** a backup of application/Auth data and cannot recover changed records.
- 063/065 security retirement must accompany the retired-module frontend; hiding
  pages or rejecting the nurse role in React does not revoke existing API access.
- Vercel statuses show existing preview deployment integration. There is no tracked
  `vercel.json` deployment gate in this working tree. Prevent automatic production
  and preview deployments before any authorized push/merge; verify other hosting
  integrations too. Merging main must not accidentally perform the cutover.
- Required approvals and branch-protection requirements must be checked before
  integration; green optional checks do not establish required-check compliance.

### P1: defense functionality/readiness

- Resolve the two V2 UI inconsistencies above before presenting V2 management.
- Complete isolated end-to-end RPC/UI smoke tests, including real auth sessions;
  passing mocked Jest tests is not that evidence.
- Full responsive certification remains pending. Earlier user-reported selected
  373–375px checks do not certify all retained screens or all eight widths.
- Rehearse login recovery, restricted person history and map reveal/resize on the
  final artifact; do not show missing-function errors as successful empty datasets.

## 5. Verified PR stack and safest future integration order

Read from GitHub on 2026-11-04. All #52–#65 remain OPEN and DRAFT.

| PR | Current base | Subject |
|---|---|---|
| #52 | main | Scope cleanup |
| #55 | community-credit-scope-cleanup | Applied 061 record and person frontend |
| #56 | person-matter-linking | 062 analytics |
| #53 | claude/analytics-insights-062 | 063 retirement |
| #57 | claude/retire-legacy-modules-063 | System/navigation fixes |
| #58 | claude/system-fixes-phase1 | 065 nurse SMS retirement |
| #59 | claude/system-fixes-phase1 | Auth/session stability |
| #60 | claude/auth-session-stability | Official KPIs |
| #61 | claude/official-dashboard-kpi-fix | Unified Resident Profile |
| #62 | claude/unified-resident-profile | 066 privacy; already merges #58 |
| #63 | claude/person-history-privacy-066 | Person workflow navigation |
| #64 | claude/person-workflow-navigation | Interactive analytics |
| #65 | claude/interactive-analytics-insights | Consolidated Safety/Analytics |
| #54 — EXCLUDED | claude/retire-legacy-modules-063 | Destructive database migration 064 |

Future order, only after integration authorization and hosting gates:

**#52 → #55 → #56 → #53 → #57 → #58 → #59 → #60 → #61 → #62 → #63 → #64 → #65 → reviewed local 067/frontend/responsive follow-up.**

Use merge commits to preserve ancestry (repository settings permit them). Retarget
each next PR to `main` only after its parent has merged there; inspect the new diff,
resolve/review conflicts and require successful checks on the resulting integration.
Keep branch deletion off until the stack is reconciled. Do not squash/rebase the
stack blindly: #58 and #59 share a parent, and #62 already contains #58 through
merge `b344659a418fbe0a3a5470593e62bfc7da8c8602`. Verified #58 tip
`1c20619f0933cd25abd871e5961fb9405bdc8648` appears in #62's GitHub commit list.
Do not cherry-pick or replay 065 a second time when #62 lands.

Current GitHub `main` is `739e8879a273c8b82f6d7a06ff66222169976aae`.
Re-check all tips/bases before acting; this plan is not a substitute for detecting
changes made after review. Prefer a separately authorized integration branch for
the full candidate and CI before main changes, with all hosting deploys gated.

Existing Actions: both static and Jest/build checks succeeded for #53–#54 and
#56–#65; #52 and #55 expose no checks in their current rollups. #54 being green
does not remove its block. Supabase Preview was skipped where listed; no backend
test coverage follows from that status. Existing CI explicitly does not run the
local PostgreSQL harnesses or 067 concurrency suite. Example latest #65 run:
https://github.com/ezykel225/barangay-batinguel/actions/runs/41662991125

## 6. Cutover, backup and partial-failure checklist

- [ ] Approve the immutable candidate/file hashes, deployment gates, maintenance
  window, responsible database owner, recovery owner and go/no-go authority.
- [ ] Obtain explicit authorization for fresh production read-only preflight.
  Verify project identity, 059–061 objects, owners, exact function signatures,
  RLS/ACLs, extensions and 063/065 guard prerequisites. Do not weaken guards.
- [ ] Take an approved encrypted/private recoverable backup covering database
  schema and records, required Auth state and relevant storage objects/configuration.
  Verify retention and recovery access. Keep all data/secrets out of Git and CI.
- [ ] Restore that backup in a protected isolated environment and rehearse recovery
  with agreed recovery point/time. Schema-only restore evidence is insufficient.
- [ ] Rehearse the exact candidate's five SQL files and security smoke tests locally.
  Existing evidence: 067 28 contracts, five causal mutation controls, 11 separate-
  session concurrency checks, installation safety and rollback rehearsal; frontend
  2,660 tests/118 suites, production build and diff check passed in the prior phase.
- [ ] Freeze application writes/access as separately authorized for the coordinated
  security maintenance window. Preserve existing V1 scores/enrollments and audit
  fingerprints. Do not include seed SQL or activate V2.
- [ ] Database owner applies 062, 063, 065, 066, 067 individually with stop-on-error,
  approved hashes, per-file transaction result and a durable application record.
- [ ] After every successful commit verify the intended objects/privileges; after
  all five verify API discovery/cache and request signatures with approved identities.
  Do not deploy around unresolved RPC discovery failures.
- [ ] Verify current V1 policy/scores/history unchanged and no V2 policy activation
  or participation rows created by installation.
- [ ] Complete database/security smoke tests before releasing the reviewed frontend
  artifact. Then perform frontend/auth/responsive smoke tests and monitor errors.
- [ ] Resume access only on an explicit go decision. Keep independent production
  V2 activation approval outside this cutover.

**Failure procedure:** stop on the first error. If the file transaction is still
open/aborted, the operator must roll it back; if connection/commit outcome is
uncertain, inspect actual state under authorization before retrying. Earlier
successful files remain committed. Never rerun a CREATE-based migration blindly,
continue to the next file after a failed guard, or run 064 to fill the numeric gap.
Maintain the cutover restriction and either apply a reviewed forward correction
or execute the explicitly approved recovery plan. Record the last verified commit.

**Rollback limits:** prefer forward fixes. Frontend rollback does not restore
revoked backend privileges. 063/065 rollback reopens retired endpoints/nurse SMS;
066 rollback reopens private-history disclosure. 067 uninstall is only for an
empty V2 installation, refuses V2 data and broadens score visibility back to V1.
Once V2 has been used, preserve its immutable history; consider the documented
two-person emergency policy restore only after approval. No contingency SQL is
approved for real data merely because a disposable rehearsal passed. Full backup
recovery loses post-backup writes unless separately accounted for.

## 7. Authentication and role retirement

AuthContext/ProtectedRoute source handles role lookup outside the auth callback,
distinguishes transient errors from definitive revocation, retains a prior role
only for the same identity on transient failures, and blocks unsupported roles.
Only resident, official and Tanod portal roles are retained. This is not an Auth
account disablement or token revocation mechanism.

After separate authorization, inventory obsolete nurse accounts privately, disable
obsolete sign-in and revoke their refresh sessions through approved Auth
administration. Verify how already-issued access tokens expire/remain usable;
063/065 database denial must protect endpoints independently of browser state.
Do not delete referenced Auth/profile rows, rewrite historical attribution, assign
an official role as a workaround, or expose credentials in the release record.
Keep SMS live-send configuration disabled; no real SMS smoke test is authorized.
063 deliberately preserves public SELECT on some published health/waste tables
and maintenance access. Retirement means the specified private/write/SMS paths
are closed, not that a former nurse cannot read information available to everyone.

## 8. Final smoke matrix

All entries below require isolated synthetic fixtures first. Production smoke
access/writes require separate explicit approval and a defined test-data plan.

| Persona/surface | Required checks | Pass gate |
|---|---|---|
| Resident auth | Login, refresh/reload, expired session, transient failure/retry, logout and account switch | No false redirects, stuck spinner or cross-account cached role |
| Resident documents | List/filter/details, eligible request flow, preview, status updates | Correct self-access and reachable mobile actions |
| Resident complaints | File/details/evidence/status with local fixtures | No another-resident data access |
| Resident profile | Own settings; official Unified Profile checked separately with permitted official | No new resident access to official person-history RPCs |
| Resident credit | Actual V1 score/history; unlinked/unenrolled; isolated V2 history and correction request/retry/status | No fabricated values, duplicate writes or false V2 label |
| Official dashboard | KPIs, active resident count, responsive layout | Matches authoritative readers and handles errors honestly |
| Official residents | Search/filter, profile tabs, verification and stable UUID links | Records-admin changes only; no name-based identity inference |
| Incidents/Blotter | List/details/location updates, parties and retained references | Existing privacy and reference identities preserved |
| Complaints/KP | Queue, intake, screening, disposition, hearings, summons/print and history | Ordinary official vs Secretary/Punong restrictions enforced |
| Tanod | Operations, roster/duty/reports; own Tanod portal and recovery states | No unauthorized case narratives or staff-only workflows |
| Safety/Analytics | Map/list, periods, filters, repeated disputes, person drilldowns and unavailable states | No missing RPCs, private leakage, invented empty results or duplicate map init |
| Official credit | V1 administration; V2 draft/independent approval and fixture activities, caps, reversals/corrections | V1 installation unchanged, two-person gates, idempotency; no production activation |
| Announcements/Events | Public lists/details; authorized edit/publish flows with synthetic data | Current linked identity and intended server permission |
| Security | Anonymous, resident A/B, ordinary official, unlinked/archived official, Secretary/Punong, retired nurse | Direct RPC/table attempts rejected as appropriate; self-access isolation |
| Credit safety | Incidents/complaints/KP involvement; cap ceiling; correction review; service eligibility | No automatic negative scoring or essential-service restriction |
| Responsive | 320,375,414,768,1024,1280,1440,1920; menus/dialogs/tables/charts/maps/forms/focus/touch | Execute every retained case in responsive-audit.md; no inferred passes |

The responsive audit has 49 screen/state rows across eight widths, all pending
browser certification in that pass. Preserve it. Selected later user observations
are useful evidence only for the exact screens/widths/states observed.

## 9. Recommended first authorized action

Authorize a **local-only preservation checkpoint** of the reviewed 067 validation,
frontend and responsiveness work, explicitly excluding the demo seed, generated
diagnostics and private backups. No push/deploy is needed for that checkpoint.
Then approve the documented V2 UI corrections and an isolated full-candidate
rehearsal. Do not begin production SQL or main merges as the first step.
