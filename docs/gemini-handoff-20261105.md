# Gemini handoff — Barangay Batinguel E-Services

Prepared 2026-11-05. Final-defense target: **2026-11-11**.

## Repository, immutable payload and branch

Repository: https://github.com/ezykel225/barangay-batinguel

Exact application/validated-QA checkpoint:
**`37652980bb5526356ebedd291e1731faa8199ddf`**.
Parent integrated release candidate:
`7b47bebdcf8219f20cb1c7d8126ff8dea162528e`.

Prepared branch: **`handoff/gemini-final-defense-20261105`**, LOCAL ONLY.
This report is a documentation-only follow-up to the exact payload above. The
owner receives the final branch-tip SHA after its commit; verify that SHA with
`git rev-parse handoff/gemini-final-defense-20261105` before further work. Do not
mistake the parent application checkpoint for a later documentation commit.

The branch was **NOT PUSHED**. Gemini cannot fetch this candidate from GitHub
until the hosting blocker below is resolved and a safe push is authorized.
Do not import main and assume it contains the candidate. Main was not changed.
The release branch remains at the application checkpoint. Earlier checkpoints
828ea52, d73fb89, aea275c and 38aab13 remain preserved in ancestry.

## Why remote handoff is blocked

Read-only GitHub checks on 2026-11-05 found recent **Vercel Preview deployments**
created by `vercel[bot]`, including candidate-stack commits 59289af and 989e99b.
No verified Vercel branch-specific deployment suppression or provider settings
were available. Empty repository webhook results do not exclude GitHub App
integrations. No local Vercel/Netlify project link was available to prove a safe
first push. Other hosting consequences cannot be conclusively ruled out.

Therefore the conditional push authorization was NOT exercised. No push attempt,
preview deployment, hosting setting change or provider disconnection was made.
Obtain owner-reviewed suppression of all automatic deployment for this branch
BEFORE its first push; then recheck integrations and explicitly resume the safe
push. Do not add a guessed deploy-suppression configuration to make this appear
safe. A branch name or absence of local hosting config is not a deployment gate.

GitHub main inspection returned **Branch not protected (404)** and repository
rulesets returned an empty list. Settings were not modified. Do not rely on
GitHub protection to prevent an accidental main push or merge.

Candidate GitHub Actions workflow: `.github/workflows/analytics-062-ci.yml`.
It runs on applicable pull requests, pushes to main and workflow_dispatch;
an ordinary new-branch push alone does not establish CI coverage. It performs
static checks/Jest/build, NOT the PostgreSQL behavioral or concurrency harnesses.
GitHub also lists a legacy analytics PostgreSQL workflow as active metadata;
do not dispatch it blindly or replay 001–061 on an empty database. Inspect the
exact workflow/ref before any separately authorized remote run. No PR was
created, retargeted, merged, closed or modified for this handoff.

## Architecture

- React 19 with react-scripts/CRA 5, React Router 6, shared CSS and role portals.
- Supabase JS client for Auth, PostgREST tables/RPCs and Storage contracts.
- PostgreSQL is the authorization and factual/scoring source of truth: stable
  UUID identities, RLS, narrow SECURITY DEFINER RPCs and audit history.
- Leaflet renders precise protected incident maps; public safety uses aggregate
  privacy-shaped RPCs. Never expose official detail APIs as public map data.
- iProgSMS orchestration is an Edge Function. Provider token is server-side;
  live sends stay disabled. No live sending/deployment is authorized.

Important source groups: src/dashboards, residents, complaints, screening,
kpcases, incidents, people, analytics, safetymap, tanod, communityCredit, sms,
context/AuthContext and components/ProtectedRoute. Read existing APIs/tests
before adding queries. Do not replace server authorization with UI checks.

## Retained and retired scope

Retained public: Home, About, Officials, announcements/events, E-Services,
complaint tracking, aggregate Community Safety, login/signup/reset.

Resident: document requests, complaints, Community Credit, settings/account
verification. Official: documents, complaint/KP review, incidents/blotter,
UUID person linking/history, residents/Unified Resident Profile, safety and
analytics, credit policy/activity management, Tanod operations, content,
officials and activity log. Tanod has its retained role-specific portal.

Retired: Nurse portal/health-service modules, court reservations and other
removed scope such as waste/voter service UI. Do not restore them from older
branches. Retaining historical tables or migration files does not authorize
restoring retired client/write access. Only resident, official and Tanod portal
roles remain supported; account/token retirement is a separate controlled action.

## Integration and migration state

All reviewed PR work was reconciled locally in dependency order:
**#52 → #55 → #56 → #53 → #57 → #58 → #59 → #60 → #61 → #62 → #63 → #64 → #65**,
followed by Community Credit 067/frontend/responsive and QA checkpoints.
See release-candidate-step5.md for exact PR SHAs and ancestry.
#62 already contains #58; no cherry-pick/replay of 065. Prefer ancestry-preserving
merges after a fresh remote review; do not blindly squash/rebase/retarget a stack.

**#54 / migration 064 is blocked and absent from the candidate. Never apply it.**
Pending production sequence is **062 → 063 → 065 → 066 → 067**:

- 062_analytics_insights.sql
- 063_retire_legacy_module_access.sql
- 065_retire_nurse_sms_permissions.sql
- 066_person_history_privacy.sql
- 067_community_credit_v2.sql

Historical 059–061 applied-status comments record earlier verification, not
permission to inspect or mutate production now. No fresh production state was
queried for this handoff. Prior isolated migration, installation, rollback,
behavioral and concurrency rehearsals passed; do not repeat them without need.
The pending blobs are unchanged from that validated candidate.

001–061 are historical records and require a pre-001 baseline; 001 expects
existing tables. Do not invent schema stubs or assume an empty-db replay works.
Private recovered baselines/backups are intentionally NOT in Git or CI. Never
upload them to AI Studio/GitHub or copy production records to make a demo work.

## Community Credit and identity safety

- Starting score is 100, server-calculated. Preserve V1 scores/enrollments and
  distinguish legacy_v1 versus participation_v2 labels and missing-RPC versus
  permission failures. Inactive/missing V2 must not imply missing active V1.
- Installing 067 does not activate V2. Production V2 activation requires separate
  explicit authorization. A local synthetic fixture already has V2 active.
- V2 positive awards require approved rules, verified participation, annual caps,
  idempotent request IDs and database atomicity. Score remains capped at 100;
  the ledger can record a positive award while the displayed score stays 100.
- Independent policy/rule approval and award-correction review restrictions must
  remain server-enforced. Correction approval itself does not change points.
- Complaints, reports, blotters and incident involvement do not establish guilt
  or automatically deduct credit. Essential service eligibility is not gated
  by the score. Never infer identity or responsibility from a name match.
- Person links use resident/external UUIDs, factual roles and recorded outcomes.
  A witness with not_determined outcome is not a responsibility finding.
- Secretary/Punong records permissions derive from stable linked active official
  identities. Ordinary officials and residents retain privacy restrictions.
- Keep `SMS_BROADCASTS_LIVE_ENABLED` unset/false; keep
  `IPROG_SMS_API_TOKEN` server-only. No real SMS or token disclosure.

## Validated fixes and QA evidence

Kapitan optional-row query uses maybeSingle: absent row is HTTP 200/null,
“Status not published”, with the empty Punong update control disabled. Returned
permission/schema/duplicate errors remain distinct. No fake status row added.

Latest Resident Settings fix: password-visibility targets measured 15×15px;
changed to 44×44px with input padding that avoids text overlap. Keyboard/value/
focus regression added. No password save, permission or scoring behavior changed.

Latest final validation:

- **2,685 Jest tests / 120 suites passed**.
- **206 focused tests / 8 suites passed**.
- Production build and **48 migration static checks passed**.
- git diff --check passed.
- Earlier 68 authenticated API assertions and 8 synthetic map/identity checks
  passed; integrated candidate read-only API smoke 9/9 passed.
- Real installed Chrome + Playwright Core: **280 final settled captures** at
  320, 375, 414, 768, 1024, 1280, 1440, 1920px, zero page-level horizontal
  overflow and page-level JS errors in those states. Actual document/complaint/
  correction submissions, Secretary approval/ready transition, resident-visible
  statuses, privacy, profile tabs, independent credit actions, map popups,
  navigation/focus and 10 keyboard data-table regions were exercised.

Read automated-browser-qa-20261105.md for exact passes, failures/retries and limits.
This does NOT certify every data/state combination or full WCAG compliance.
Open gaps: populated public detail pages, signup later steps/email delivery,
Storage/uploads/downloads, print output, document claimed/receipt, KP final
disposition/hearings/closure, Tanod-user duty/report flows, short-height/nested
states, assistive technology and Google map embed (blocked by test network guard).

Raw screenshots, checksums and sanitized browser evidence remain private/local
under `%LOCALAPPDATA%\Temp\barangay-browser-qa-evidence-20261105` and are NOT
uploaded or committed. Generated scripts/logs remain in untracked runners-out.
Do not claim Gemini reran them merely because these reports are in the repo.

## Local setup and commands

Existing isolated services: `pg067test` (PostgreSQL 17.6, 1 GiB/1 CPU),
`bb-rc3-auth` and `bb-rc3-rest`. Target database is
`validation067_rc3_api_20261104`, already migrated; DO NOT reapply CREATE-based
migrations. Only synthetic records/accounts. Start PostgreSQL first and await
readiness, then Auth/REST, verify health, then gateway and a fresh React compiler.

Local frontend **http://127.0.0.1:3001**, API gateway port **55421**;
Auth 55499, REST 55430 (loopback only). Never run write tests on port 3000.
Private RC3 config/account files and synthetic login instructions are outside
Git in the existing local temp folder. Do not request passwords in chat or put
them in code, command history or report. A cloud assistant cannot assume access
to these local files, services, private baseline or untracked runners.

```text
npm ci
npm test -- --watchAll=false --runInBand
npm run build
node scripts/ci/check-analytics-062.mjs
git diff --check
git status --short
```

On Windows PowerShell use npm.cmd if npm.ps1 is blocked, and set CI=true for
noninteractive tests/build. REACT_APP_SUPABASE_URL and the anonymous/publishable
key are BUILD-TIME values. Use .env.example only as a template. Never embed a
service-role/provider key. For isolated QA use explicit local child-process env
overrides, not the production-linked root env. Existing rc3-react/gateway local
runners are not part of Git handoff; read the setup reports before recreating
them. Reuse approved official tooling; do not recreate baseline tables by guess.

After branch checkout/merges, restart the isolated dev compiler and confirm the
served bundle is current: stale resolver caches previously produced false missing
module errors. Do not remove imports or rewrite valid files to mask that issue.
No new test run is implied by this documentation-only handoff task.

## Git/release restrictions and immediate Gemini task

Do not push main, merge/retarget/close existing PRs, deploy, access production,
apply SQL, activate V2, enable SMS, reset/clean the tree or delete private backups.
Preserve all checkpoint ancestors. Do not stage the SMS demo seed, generated
diagnostics/browser evidence, temporary map fixture, env/credentials or backups.

Immediate next task is to resolve the verified hosting auto-deployment blocker
WITH THE OWNER before any remote handoff push. After a safe push is separately
confirmed, fetch the exact named branch and owner-provided SHA, read this report
and the release reports, then finish the narrow remaining synthetic browser QA
(document claim/print, KP final workflow, Storage, Tanod-user fixture) without
redesign or scoring changes. Record actual evidence, not inferred passes.

Before release: fresh reviewed PR/ref manifest, required remote CI/approvals,
complete relevant browser gates, explicitly authorized production preflight,
private full backup with proven restore/recovery, approved maintenance/cutover
and per-file stop-on-error migration execution, post-release smoke and a reviewed
forward-repair/rollback plan. Frontend rollback cannot undo privilege changes;
063/065/066 rollback may reopen retired/private access. 067 uninstall is unsafe
after V2 data exists. No production action is authorized by a green local test.

**Remote branch push: BLOCKED / NOT PERFORMED. Production release: NOT APPROVED.**
