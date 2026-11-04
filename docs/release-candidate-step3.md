# Step 3 — authenticated isolated API rehearsal

Date: 2026-11-04. Branch: `claude/community-credit-v2-schema`.
HEAD remains `d73fb89886dac986060378847611c132d9b9d54d`.
No commit, push, PR, merge, deployment, production connection or migration 064.

## Environment and provenance

Used a NEW local database, `validation067_rc3_api_20261104`, cloned from
Step 2's disposable synthetic V2 workflow database
`validation067_race_1793769623851`. The source already contained the complete
062 → 063 → 065 → 066 → 067 candidate. No migration tests were repeated.
V2 was already active in this synthetic template; this is not evidence of
production activation. The private baseline and original databases were preserved.

Existing `pg067test`: Supabase PostgreSQL 17.6, 1 GiB / 1 CPU. Cached official
GoTrue v2.197.0 image reused; official PostgREST v14.18 downloaded (small image,
not a complete new Supabase stack). New Auth and REST containers were limited to
128 MiB / 0.5 CPU and 192 MiB / 0.5 CPU respectively. Initial free RAM was about
2.54 GiB and disk about 10.45 GB; before React compilation, free RAM was about
2.93 GiB. No large dependency installation.

New service ports bound ONLY to loopback:

- Auth: `127.0.0.1:55499`.
- REST: `127.0.0.1:55430`.
- Local gateway: `127.0.0.1:55421`, forwarding only `/auth/v1` and `/rest/v1`.
- Separate React development instance: `127.0.0.1:3001`.

The pre-existing port-3000 frontend was not used for writes. The new React
process received explicit local URL/key environment overrides; repository env
files were not edited. Both `/resident` and `/official` served HTTP 200 React
shells. The compiled bundle contained the isolated API URL and local anonymous
key, and none of the generated service key or local database/user passwords.
Compilation succeeded. This is a dev compile/shell check, NOT browser rendering
or a new production-build claim.

Configuration, generated credentials, account IDs and sanitized HTTP evidence
are private under `%LOCALAPPDATA%\Temp\barangay-rc3-local`, restricted to the
current Windows user and SYSTEM. No credentials appear in this report. Local
Auth role inherits `supabase_auth_admin`; local REST role can assume only
`anon`/`authenticated`, not `service_role`. The admin key was used only for local
synthetic Auth provisioning. All tested application requests used authenticated
user sessions or the anonymous key as appropriate.

## Setup findings

The schema-only local snapshot had an empty Auth migration-history table.
Restored its 82 verified version markers from the existing local validation
container, using the cached matching Auth version. The donor container was
stopped again. No schema stubs or production access were used.

The new Auth login role initially lacked the required `auth` search path,
causing startup to attempt its metadata table in `public`. Set this dedicated
role's search path to `auth` for the new database; did not grant public DDL.
Auth and REST subsequently returned healthy HTTP 200 responses.

Old SQL-only Auth fixture rows were not usable as GoTrue login accounts. Created
six fresh, confirmed accounts through the local GoTrue admin API instead:
resident A, resident B, Secretary, Punong Barangay, ordinary Kagawad and retired
Nurse role. All emails use `synthetic-test.invalid`. Added explicit synthetic
profiles, verified the two resident profiles, and linked the three officials to
the existing fictional official-directory identities. No names were used as
identity keys; UUID links determine access. No phone numbers or real identities.

## Authenticated API results

**68 / 68 assertions passed**: 53 functional/error checks and 15 additional
security/rule-workflow checks. Evidence comprises 97 traced requests plus
explicit invalid-password/JWT checks. Traces store method/path/status/code only,
not headers, passwords, sessions or response records.

The runner executes the real `communityCreditApi`, `analyticsApi`, `peopleApi`,
`incidentApi`, `complaintApi` and `tanodApi` modules, injecting a real isolated
Supabase JS client at the client dependency boundary. HTTP responses and auth
were not mocked. Direct SDK document requests mirror ResidentDashboard's
submission payload. This proves application API-adapter compatibility, not
rendered React event handlers or browser session persistence.

| Area | Actual result |
| --- | --- |
| Authentication | All six password logins and profile role reads succeeded; refresh and getUser preserved identity; sign-out cleared session; wrong password refused. |
| Resident profile/credit | Own profile and server-calculated score 100 retrieved; V2 model, ledger and participation reference returned; another resident's credit refused. |
| Documents | Fictional clearance request inserted/read as owner; other resident sees no request; forged owner insert refused. |
| Complaints | Resident submitted fictional noise complaint and resolved its UUID through existing RLS; other resident sees no complaint. No attachment upload attempted. |
| Resident records | Secretary reads synthetic record through the actual `barangay_resident_directory` RPC; direct private-table access is denied. |
| Incidents/Blotter | Secretary recorded fictional incident, resolved its reference from the queue, read detail and blotter history. |
| Person/Matter | Created fictional external identity; linked resident as incident witness; read parties and person analytics; linked an actual synthetic complaint to the stable resident identity. |
| Privacy | Secretary sees linked complaint history. Ordinary official sees incident history but gets empty complaints and `complaints_restricted=true`; protected credit, repeated-dispute and identity-write operations refused. Resident person-history/analytics refused. |
| Analytics | Secretary safety/repeated-dispute/person analytics and Punong repeated disputes succeeded with frontend argument contracts. Retired Nurse safety analytics and credit administration refused. |
| Credit administration | Admin state, resident directory, activity and correction lists returned. Prepared V2 draft policy/rule; same-actor approvals refused; independent Punong approvals succeeded. Draft policy remained draft and existing active policy unchanged. No activation RPC called. |
| Participation | Created fictional activity; verified accessible-alternative participation; awarded 5 points; same-request retries returned same activity/event with `replayed=true`. Resident score remained capped at 100 with award present in ledger. |
| Corrections | Resident submitted own award correction, idempotently retried and read it. Other resident cannot see it. Award recorder cannot resolve their own award correction; independent Punong approval returned `points_changed=false`; resident sees approved status. |
| Tanod | Secretary added fictional member, scheduled assignment and retrieved roster/assignments. Resident administration refused. |
| Credit separation | Complete credit profile unchanged after complaint/incident submissions before participation award. Document submission works without a credit parameter. Low-score service eligibility was not separately exercised; no claim of exhaustive service-gate testing. |

### Error classification through the API

- Installed restricted RPC: SQLSTATE `42501`, HTTP 403 for authenticated caller;
  anonymous protected RPC refused as well.
- Missing probe RPC: `PGRST202`, HTTP 404.
- Existing RPC with missing required argument: also `PGRST202`, HTTP 404. This is
  a signature-binding error, not proof the RPC is uninstalled; known catalog /
  successful calls distinguish it.
- Invalid UUID: `22P02`, HTTP 400.
- Same-actor approval/review business refusals: `P0001`, HTTP 400.
- Malformed JWT: `PGRST301`, HTTP 401; wrong password: `invalid_credentials`.

Initial harness failures were corrected against the real source contracts:
incident creation returns a reference, replay responses add `replayed=true`,
resident ledger exposes activity references rather than internal activity UUIDs,
resident directory requires its RPC, and complaint owner is
`filed_by_profile_id`. No product assertion, permission or migration was weakened.
No genuine application API/backend defect was found in exercised paths.

## Browser verification and manual checklist

Browser tool still returns **“The browser access host is unavailable.”**
No Playwright/Puppeteer browser was already available. No browser dependencies
were installed. **Zero browser viewports passed this step.** All eight widths
remain pending: **320, 375, 414, 768, 1024, 1280, 1440, 1920 px**.

For EACH width, use only the isolated port-3001 app after local services restart
and confirm network requests target port 55421. Obtain synthetic credentials
from private local configuration, never from production or a report.

- Resident login, refresh, logout and session restoration; verify URL/role guards.
- Resident Profile, Community Credit gauge/policy wrapping/history/ledger;
  submit a correction and verify submitted/resolved status without duplication.
- Document request dialog and complaint form without files; verify validation,
  submission feedback and owner-only history.
- Secretary and Punong resident detail, incident creation/detail/blotter,
  person identity selection and factual history, safety/repeated-dispute filters.
- Credit draft policy/rule and independent approval controls, activity creation,
  participation verification/award and correction review; ordinary role must
  lack prohibited controls and server must still refuse direct requests.
- Tanod roster/assignment forms and tables.
- For every screen: no page overflow or clipping; mobile navigation open/close;
  usable table scrolling/chart/map resizing; dialogs within viewport; keyboard
  order/visible focus/Escape behavior; reachable actions and touch spacing;
  empty/error/loading states and no console errors.

## Coverage limits and next task

Not tested: browser UI/route rendering, viewport layouts, browser localStorage
session persistence, map interactions, file Storage/uploads, Realtime, Edge
Functions/SMS, complete document lifecycle, every incident edit action, external
identity correction, low-score service submission, every possible role/workflow.
The local gateway supplies Auth + REST only. SQL signature/grant coverage and V1
preservation remain the successful Step 2 evidence; they were not repeated here.

No application or migration source changed, so Jest/production build/static
migration checks were not rerun. React development compile and API checks are
the new evidence. `git diff --check` passed.

Only new repository work is this report and generated scripts in the existing
untracked `supabase-tests/runners-out/` directory. Step 2 report, SMS demo seed,
private backups and checkpoints remain intact. No files staged or committed.

After validation, stopped the temporary RC3 Auth/REST containers and gateway /
React process trees. `pg067test` remains healthy; the new database, private
configuration and synthetic fixture are preserved for the browser rehearsal.
Port 3001 requires restarting the isolated services before manual use.

Next: restore browser automation and run the critical authenticated UI checklist
against this same isolated stack at all eight widths, then extend Storage and
remaining action coverage if required. API integration is successful for tested
paths; final frontend integration and production release remain blocked on
browser verification and the separate release approval gates.

**Not approved for production deployment or V2 activation.**
