# Step 4 — browser QA preparation and blocker

Date: 2026-11-04. Checkpoint remains
`d73fb89886dac986060378847611c132d9b9d54d`.

## Outcome

Browser QA is **NOT COMPLETE**. The supported browser tool returned
`The browser access host is unavailable`. No installed Playwright/Puppeteer
package was found in the project; no browser dependency was installed.
No browser page, interaction or viewport was tested. No screenshots exist for
this step. HTTP shell checks and the earlier 68 API assertions are not browser
evidence and do not certify layouts.

## Safe local handoff

The Step 3 isolated environment was restored for manual QA:

- Frontend: **http://127.0.0.1:3001/login**.
- Resident route after login: http://127.0.0.1:3001/resident.
- Official route after login: http://127.0.0.1:3001/official.
- Backend: http://127.0.0.1:55421, local Auth/REST gateway only.
- Database: `validation067_rc3_api_20261104` in `pg067test`.
- Auth/REST containers: `bb-rc3-auth`, `bb-rc3-rest`.

Do NOT use the pre-existing localhost:3000 app for write tests. Open the exact
127.0.0.1 address; the gateway CORS origin matches port 3001 on that host.

Preflight inspected existing container configuration without printing secrets:
Auth and REST bind only to 127.0.0.1 and connect through host.docker.internal to
the exact isolated database. The React launcher overrides its backend URL and
anonymous key in child-process environment variables, leaving repository env
files untouched. The compiled bundle is checked separately before handoff.

Handoff checks passed: Auth health and REST root HTTP 200; resident and official
React shells HTTP 200; development compilation successful. Served bundle uses
the local API URL/anonymous key, contains no production URL configured in local
env files, no service-role JWT and none of the generated local passwords or
service key. These checks issued no functional write requests. The temporary
services are left running for manual QA; the port-3000 process was untouched.

Local read-only fixture counts: all **6/6 resident rows** match the RC3/f067
synthetic fixture markers; all **16/16 Auth rows** match the fictional domain or
f067 fixture UUID markers. This is consistent with the schema-only baseline and
synthetic-template provenance recorded in Steps 2–3; no production records were
imported. No production connection was opened. Existing local V2 activation is
fixture state, not a production activation.

Before restart, free physical RAM was approximately 3.27 GiB. Existing bounded
containers and cached tooling were reused. No migration or API workflow suite
was repeated and no SQL migration was executed.

## Private login instructions

Open this file locally in an editor (do not paste it into chat or Git):

`%LOCALAPPDATA%\Temp\barangay-rc3-local\manual-login.txt`

It contains only the fictional account emails and shared local test password,
not database passwords or service keys. Its parent directory remains private.
Choose residentA/residentB, secretary, punong or ordinary as appropriate. The
retiredNurse account is for denial checks, not a retained Nurse portal. A
dedicated Tanod portal login is not provisioned by the six-account setup;
Tanod management can be checked as Secretary, but Tanod-user portal coverage
needs a separately provisioned fictional identity. Do not use real accounts.

1. Open the exact isolated login URL and DevTools Network/Console.
2. Confirm application database/Auth requests target port 55421. Abort on a
   production Supabase request. Map tiles or other public assets are not proof
   of database connectivity; record external asset dependencies separately.
3. Sign in as the desired fictional user. Verify role navigation, reload/session
   handling and logout. Do not save test passwords in a shared browser profile.
4. Set each width below with a recorded height, then execute the full matrix in
   [responsive-audit.md](responsive-audit.md). Record screenshot, browser/version,
   role, fixture state, reproduction steps and console/network errors per case.
5. Use only fictional records. No V2 activation, SMS, production writes or real
   attachments. Local Storage/Realtime/Edge Functions are not provided by this
   gateway; document those limits rather than hiding resulting errors.

## Viewport and workflow status

| Width (px) | Browser result |
| --- | --- |
| 320 | Not tested |
| 375 | Not tested |
| 414 | Not tested |
| 768 | Not tested |
| 1024 | Not tested |
| 1280 | Not tested |
| 1440 | Not tested |
| 1920 | Not tested |

Every retained public page, Resident/Official/Tanod tab, Unified Resident Profile
section and shared workflow in responsive-audit.md remains pending browser QA.
Prioritize resident login/logout, document submission, complaint submission,
credit gauge/ledger/correction; then official navigation/KPIs, resident detail,
incident/blotter/person linking, safety/analytics, credit workflows and Tanod.

For each case verify no page overflow/clipping; table/card usability; reachable
dialog actions and internal scrolling; chart/map resizing; menu open/close,
Escape and focus return; keyboard-only operation and visible focus; touch
spacing; mobile/desktop functional results. Use two separate administrator
accounts to exercise independent approvals and denied self-approval.

## Changes and release decision

No verified browser defect was discovered because browser execution is blocked.
No application, scoring, permission or migration code was changed. Added only
this report and a generated local preflight helper under the existing untracked
`supabase-tests/runners-out/` directory; private login instructions remain outside
the repository. Checkpoints, backups and SMS demo seed are preserved.

`git diff --check` passed. Jest and production build were not repeated: no product changes occurred. A
successful isolated development compile/shell/config check is preparation only.
No GitHub push, PR, merge, deployment, production access or migration 064.

**Next:** restore supported browser access or execute the documented manual
matrix against port 3001, retain evidence, and fix only reproduced defects.
**Browser QA remains incomplete; no production release approval.**

## Subsequent manual Chrome results — 2026-11-04

The user has now reported successful checks on isolated `127.0.0.1:3001`:
Official Dashboard refresh/status HTTP 200 and unpublished label at 1024px;
resident correction submission/status `submitted` at 1024px; TEST ONLY map marker
and popup (width unspecified); Record Incident fit/required validation/no count
change at 375px; Escape closes mobile navigation (width unspecified).

Earlier screenshot-based visual checks cover Resident Community Credit at all
eight required widths and selected Official screens at 375/1024px. Screenshots
reviewed in conversation are not repository artifacts. This update records
user-reported evidence, not new automated browser execution. The exact evidence
and remaining limits are recorded in responsive-audit.md's manual evidence
table. The original unavailable-browser outcome above is historical; full QA
remains incomplete, particularly focus return, remaining dialogs/forms, map
keyboard/zoom/resize and untested page/state/width combinations.
