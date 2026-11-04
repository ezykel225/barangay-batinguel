# Final QA defect fixes — resumed 2026-11-04

Branch: `claude/community-credit-v2-schema`. Preserved committed checkpoint:
`d73fb89886dac986060378847611c132d9b9d54d`. No new commit or staging.

## Kapitan status 406: confirmed cause and preserved fix

The interrupted session reproduced the query as the isolated synthetic
Secretary: `.single()` returned HTTP 406 / `PGRST116`, with details
`The result contains 0 rows`. A local owner query also counted zero rows.
The table has the expected id/status/status_message/updated_by/updated_at
columns. Its SELECT policy permits reads (`true`); UPDATE remains restricted
to `current_official_holds_position('Punong Barangay')`. This was an absent
optional availability record, not an RLS denial or missing table.

`readKapitanStatus` selects only `status` and uses `.maybeSingle()`. The earlier
isolated API check returned HTTP 200 with null data. Dashboard and public
Officials page show “Status not published” rather than inventing “Available”.
Loading and error states remain distinct; returned permission, duplicate-row
and backend errors propagate to the caller and are logged, with “Status
unavailable” displayed. No broad error suppression or query limit was added.
The Punong control is disabled when status is absent/loading/error, and its
existing update handler still refuses a missing row. No status row was inserted.
The existing stable official identity, `isKapitan` check and database permissions
are unchanged. Existing valid status reads and updates retain their behavior.

Actual preserved application/test files exceed the three listed in the resume
request. None was discarded or rewritten during resume:

- `src/dashboards/OfficialDashboard.jsx`
- `src/pages/Officials.jsx` (same optional-row defect on the public page)
- `src/utils/kapitanStatus.js` (new shared nullable reader)
- `src/utils/kapitanStatus.test.js` (four result-contract cases)
- `src/dashboards/officialDashboardKpis.test.js` (four rendered status cases)

Regression coverage checks null/published/denied/duplicate query results;
unpublished/published/error display; and a disabled empty Punong control.

## Completed synthetic fixture coverage — not rerun on resume

Reproducible runner: `supabase-tests/qa_isolated_map_fixture.cjs`.
It refuses a database other than `validation067_rc3_api_20261104`, uses a fixed
loopback URL, checks synthetic resident provenance, authenticates a fictional
Secretary, and writes through existing RPCs. A private manifest makes reruns
reuse its own IDs. It does not edit existing genuine records or the SMS seed.

The previous session ran the fixture twice successfully. Saved private evidence:
`%LOCALAPPDATA%\Temp\barangay-rc3-local\qa-map-results.json`.
Resume inspected that evidence without recreating records: **8/8 passed**.

1. Synthetic-only resident provenance guard.
2. Fictional incident at latitude 9.31 / longitude 123.29 appears in map points;
   a second incident without coordinates does not become a marker.
3. Map point projection excludes narrative and person identity.
4. The unlocated incident remains in the accessible queue data.
5. Both incidents link the resident as `witness` and a distinct fictional external
   person as `subject`; all outcomes remain `not_determined`.
6. Both incident references appear in the resident's factual person analytics.
7. External repeat involvement totals two, both not determined; resident witness
   is excluded from the responsibility-role repeat list. This is not a finding
   of guilt or responsibility.
8. Complete resident credit profile is unchanged by incident/identity writes.

Map marker/popup input data was verified through the map RPC. Actual Leaflet
marker rendering, popup content, zoom and focus were NOT browser-verified.
No scoring, privacy, analytics or database implementation was modified.

## Browser and local environment limitations

On resume, `cua.listBrowsers()` again returned “The browser access host is
unavailable”. No browser interaction, screenshot or viewport passed this turn.
The selected visual checks reported by the user remain user-reported evidence,
not additional automation results from this resume.

Attempted a read using the synthetic Secretary against the documented loopback
gateway. It failed with `ECONNREFUSED 127.0.0.1:55421`. Docker inventory also failed:
the Docker Desktop Linux engine pipe is unavailable. Reviewed the Step 4 startup
documentation; did not start new infrastructure or fall back to production.
Consequently, the current API/browser recheck is BLOCKED, not passed. The
earlier successful API proof remains the evidence for the query correction.

Pending interactive checks apply at 320, 375, 414, 768, 1024, 1280, 1440, 1920px:

| Workflow | Exact manual checks after safe local restart |
| --- | --- |
| Navigation | Tab to menu toggle, Enter to open, tab through links, Escape to close and return focus; repeat backdrop/route-close and mobile-to-desktop resize. |
| Record Incident | Open “Record Incident”; scroll to bottom and Cancel; reopen and submit blank/invalid fields; confirm validation retains values, paired coordinates, reachable close/save controls and focus return. |
| Resident correction | Credit → Correction requests; choose Missing activity or an own award; fill “Reason for review”; submit; check submitted status, busy protection and independent approved status. |
| Official credit | Select a fictional resident; inspect correct profile/ledger; prepare draft policy/rule/activity; use separate Secretary/Punong accounts for approvals; confirm self-approval refusal. Do not activate another policy. |
| Analytics | Change Time window, custom From/To, Incident category and Recorded area; test Reset, drilldowns and keyboard scrolling of named data-table regions. |
| Map | Locate TEST ONLY mapped reference; open popup, zoom and resize/tab away; verify unlocated record remains in the incident list, with no false marker; test keyboard access and rapid navigation during zoom. |
| Documents/Complaints | Open forms, test required validation and Cancel, submit fictional values, inspect owner history and other-resident denial; attachment workflow remains limited by missing local Storage service. |
| Unified profile | Open a fictional resident; switch each displayed tab; verify history/analytics/credit identity consistency, overflow, focus and ordinary-official privacy. |

Use only `http://127.0.0.1:3001` after the documented local stack is restored and
its bundle/backend verified. Private synthetic login instructions are in
`%LOCALAPPDATA%\Temp\barangay-rc3-local\manual-login.txt`. Never use port 3000
for these write tests. Full page/state matrix remains in responsive-audit.md.

## Validation and release decision

Resume reran all requested regression checks on the preserved final code:

- Focused: **30 tests / 2 suites passed** (`qa-resume-focused.log`).
- Full Jest: **2,684 tests / 120 suites passed**, no skipped tests
  (`qa-resume-full.log`).
- Production build: **compiled successfully** (`qa-resume-build.log`).
- Migration source checks: **48 passed / 0 failed** (`qa-resume-static.log`).
- `git diff --check`: **passed**. Git emitted line-ending conversion notices,
  not whitespace errors.

Logs are in the existing untracked `supabase-tests/runners-out/` directory.
No test/build failure required additional implementation changes.
Completed SQL migration rehearsal and 68 API assertions were not repeated.
No migration 064, production access, V2 activation, GitHub action, deployment,
push, PR change, merge or destructive Git operation occurred.

No confirmed new P0 defect was found within tested coverage; this does not
certify untested workflows. P1 release blockers remain: restore the isolated
Docker/API environment and browser access; certify the 406 fix in-browser and
remaining authenticated interactions/accessibility/responsive matrix; complete
local Storage/attachment and missing Tanod-login coverage as required.

Next integration action: restore the existing local stack using Step 4, verify
loopback-only configuration, then perform the pending browser checklist and
retain screenshots/console evidence. No production release approval is given.

All prior reports, private backups, fixture manifest, checkpoint commits,
untracked diagnostics and `supabase-seeds/seed_sms_demo_residents.sql` remain
preserved. Only this report and generated resume logs/helpers were added during
resume; product code was inspected and left intact.

Final Git inventory (all unstaged):

```text
 M src/dashboards/OfficialDashboard.jsx
 M src/dashboards/officialDashboardKpis.test.js
 M src/pages/Officials.jsx
?? docs/final-qa-defect-fixes.md
?? docs/release-candidate-step2.md
?? docs/release-candidate-step3.md
?? docs/release-candidate-step4.md
?? src/utils/kapitanStatus.js
?? src/utils/kapitanStatus.test.js
?? supabase-seeds/seed_sms_demo_residents.sql
?? supabase-tests/qa_isolated_map_fixture.cjs
?? supabase-tests/runners-out/
```

## Subsequent isolated service restoration — 2026-11-04

The environment blocker above was resolved in the following restoration task.
Started the installed Docker Desktop engine, then reused only `pg067test`,
`bb-rc3-auth`, `bb-rc3-rest`, the loopback gateway and isolated React process.
No database rebuild, migration, fixture recreation or application edit occurred.
Before startup: approximately 3.5 GiB free RAM and 18.8 GiB free disk.
PostgreSQL retains its 1 GiB / 1 CPU limits and reports healthy. All six resident
and sixteen Auth rows match the documented synthetic markers.

Manual QA URL: **http://127.0.0.1:3001/login**. Services remain running.
Credentials remain private in
`%LOCALAPPDATA%\Temp\barangay-rc3-local\manual-login.txt`.

Fresh restoration checks passed:

- Auth and REST container bindings are loopback-only and their database URLs
  point to `validation067_rc3_api_20261104` through host.docker.internal.
- Auth health and REST root return HTTP 200.
- Synthetic Secretary login succeeds; `select('status').maybeSingle()` returns
  HTTP 200, null, no error. No availability row was fabricated.
- Development compile succeeds; `/resident` and `/official` shells return 200.
- Served bundle contains the nullable reader, unpublished status and error UI;
  uses the local API/anonymous key; excludes configured production URLs,
  service-role JWTs and generated local passwords/service key.

No new browser interaction is certified by these HTTP/bundle checks. Keep the
complete eight-width checklist; use the manual interaction table above first
at 375px and 1024px. Existing uncommitted product changes and all checkpoints,
private backups and the SMS seed remain preserved. No tests were unnecessarily
repeated during restoration.

## Manual QA evidence and local preservation — 2026-11-04

User-reported Chrome checks now confirm the fixed Dashboard status request/UI
at 1024px, resident correction submission at 1024px, TEST ONLY map marker/popup,
375px incident dialog fit and blocked incomplete submission without count
change, and mobile Escape-close. Widths for map/popup and Escape were not
specified. Earlier visual screenshots cover Resident Community Credit at all
eight widths and selected Official views at 375/1024px. Screenshots were
reviewed in conversation but are not repository artifacts. See the precise
manual evidence table in responsive-audit.md; do not infer full browser QA.

The local preservation checkpoint includes the five reviewed Kapitan source /
test files, this report, release-candidate-step2/step3/step4.md and the updated
responsive-audit.md. Existing successful 30-focused / 2,684-full / 48-static /
production-build results apply: this preservation task changes documentation
only. No tests or production actions were unnecessarily repeated.

Excluded from staging: SMS demo seed, generated runners/logs, test-only map
fixture runner, private credentials/env files and backups. Existing checkpoints
remain ancestors; no push, PR change, retarget, merge or deployment authorized.
Next, after separate authorization, reconcile the existing draft stack's current
tips/bases against final-integration-release-plan.md on an isolated integration
branch, exclude destructive #54/migration 064, review the cumulative diff and
run candidate CI before any main/production action. Browser matrix and release
cutover/recovery gates remain outstanding.
