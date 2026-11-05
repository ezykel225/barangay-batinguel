# Automated isolated browser QA — 2026-11-05

Branch: `release/final-defense-local-20261104`.
Committed candidate remains `7b47bebdcf8219f20cb1c7d8126ff8dea162528e`.
One targeted accessibility fix and its regression test remain uncommitted.

## Browser and isolation

Used real headless installed Chrome **156.0.8078.80** through **playwright-core
1.64.1**, installed privately in `%LOCALAPPDATA%\Temp\barangay-browser-qa-tools`.
One lightweight npm package; no Chromium download, project dependency change,
new production service or large infrastructure installation. Existing Docker
PostgreSQL/Auth/REST and the React frontend were restored. Initial resources:
about 3.16 GiB free RAM and 19.38 GiB free disk.

Frontend: `http://127.0.0.1:3001`; backend: `http://127.0.0.1:55421`; database:
`validation067_rc3_api_20261104`. Local health and served-bundle checks passed:
no configured production Supabase URL, service-role JWT or generated server/user
password in the frontend. Private configuration was not printed. Browser request
interception permitted only these loopback services and public OpenStreetMap
tiles; other network destinations were aborted. No production Supabase traffic.
The About page's Google Maps embed was therefore intentionally blocked and is
not certified as rendered. Login sessions used existing fictional RC3 accounts.

The initial Auth container exited during database startup; restarted it only
after PostgreSQL readiness and confirmed health before successful browser writes.
The integrated browser host is not needed for this automation.

## Functional results actually performed

The final core runner passed **14/14 workflows**:

1. Resident password login and session reload.
2. Empty document purpose blocked by actual toast validation, followed by a
   fictional submission and Pending status in the resident table.
3. Fictional complaint submission, returned reference and resident listing.
4. Resident missing-activity correction submission and submitted history.
5. Resident drawer Escape/closed state/focus return at 375px.
6. Resident logout and protected-route redirect to login.
7. Secretary login and “Status not published” on the dashboard.
8. Secretary approval of the exact fictional request: PATCH 200, nonempty
   affected-row result and Approved in the actual dialog. Clicking alone was
   not treated as success.
9. Official complaint detail loaded, including factual KP screening questions
   and case-review surface. No legal screening answers or final KP disposition
   were invented; case creation/hearings/final transitions remain untested.
10. Official resident selection and Information/History/Analytics/Credit tabs.
11. Record Incident at 375px: dialog width fits; required validation blocks an
    incomplete submission; Cancel closes it.
12. Tanod management screen rendering (not the Tanod-user portal).
13. Official credit resident selection and enabled activity workflow controls.
14. Analytics date filters/reset and analytics screen rendering.

Four additional UI checks passed: resident sees the Secretary's Approved status;
residentB's document and complaint lists do not expose the new residentA record;
ordinary official has the restricted credit-management message and no workflow
submission control. The cross-resident checks prove the exercised list boundary,
not exhaustive enumeration resistance for every endpoint (previous API tests
provide separate evidence).

A continuation also passed Approved → Ready for Pickup through the Secretary
UI (nonempty affected-row response), then verified the resident sees Ready for
Pickup. No physical claim/receipt action was simulated.

Real V2 UI operations verified across the saved workflow runs:

- Secretary prepares a new draft policy without activation.
- Same-actor approval is refused (expected HTTP 400 / business refusal).
- Separate synthetic Punong approves the draft; no policy activation.
- Secretary creates a fictional activity using an approved enabled rule.
- Secretary verifies residentB participation using accessible-alternative mode.
- Secretary awards the verified participation; server returns `awarded`.
- Separate Punong approves a submitted resident correction; server explicitly
  returns `points_changed=false`.

Post-create parent refresh/remount made early harness actions stale. These
selection failures were superseded by fresh-page verification/award passes;
do not count the earlier failed runner as 6/6. `summary.json` consolidates only
the verified operations and retains all original result files. No policy was
activated, scoring rule changed, password saved or real SMS sent.

Clearly labeled local records created across attempts: **3 document requests,
3 complaints, 3 correction requests, 4 draft policies, 3 activities**. Existing
fixtures were preserved. Only one of those new activities was verified/awarded
in the successful participation continuation. New requests use TEST ONLY labels;
their IDs and synthetic accounts are private local fixture data, not production.

## Exact responsive coverage

Final settled-state runner: **280 captures/measurements**, all at height 900px,
at widths **320, 375, 414, 768, 1024, 1280, 1440, 1920px**:

| Surface | States at each width | Captures |
| --- | --- | --- |
| Public | Home, About, Officials, E-Services, Track Complaint, Community Safety, Announcements list, absent/invalid announcement detail, Events list, absent/invalid event detail, Login, Signup first step, Reset Password initial state | 104 |
| Resident | Dashboard, Document Requests, Complaints, Community Credit, Settings, open document-request dialog | 48 |
| Secretary | All 13 retained sidebar tabs, open Record Incident dialog, Analytics & Insights and Patrol Coverage inner tabs | 128 |

All **280 settled states had zero page-level horizontal overflow**, zero runner
failures and zero page-level JavaScript errors. Map marker popups opened at all
eight widths. Zoom followed by navigation exercised map teardown without page
errors. This is not proof that every overlay/data/interaction state is accessible
or visually perfect: screenshots cover the current synthetic populated/empty
states, not all long content or every scroll position.

Initial captures that still showed Loading were discovered during screenshot
review. The final evidence is `responsive-final.json` / `final-*` screenshots,
whose stricter readiness check excludes loading labels (but not the static word
“uploading”). Earlier `responsive.json` and `responsive-settled.json` captures
are superseded, not certification evidence. Initial twelve mobile selector misses were due
to badges in accessible names; retried successfully, with original results kept.
Do not cite initial loading-state screenshots as populated-screen evidence.

Additional keyboard/browser checks:

- Public menu Escape and focus return: 320, 375, 414, 768, 1024px.
- Record Incident Cancel and trigger focus return: all eight widths.
- **10 actually loaded analytics data-table regions** accepted keyboard focus
  and ArrowRight. An initial zero-table attempt was not counted as coverage.
- Password visibility controls: both targets, keyboard Enter/Space, pressed
  state, focus retention, containment and no page overflow at all eight widths.

## Confirmed defect and smallest fix

Resident Settings' two visibility buttons measured **15×15px** in Chrome because
their inline styles supplied only the 15px icon and zero padding. The small
target was present regardless of viewport, although below-fold mobile controls
were missed by the initial visible-only metric scan.

`src/dashboards/ResidentDashboard.jsx`: give both buttons **44×44px** centered hit
areas and increase input right padding from 40 to 64px to prevent text overlap.
No password/auth behavior or unrelated styling changed. Browser retest passed
all eight widths. `src/retainedScopeCoverage.test.js` adds keyboard regression:
Enter/Space toggles only the intended field, preserves value and focus and makes
no database write. No other confirmed product defect required a source change.

Expected HTTP business refusals and duplicate notification-read 409 responses
were observed separately from runtime errors. Existing code explicitly treats
duplicate `23505` notification reads as already-read success; this was not hidden
or misclassified as a new authorization defect. No page-level JS error occurred
in the final exercised flows. This is not a claim that Network/Console has no
warnings or expected rejected requests.

## Final regression validation

- Focused Jest: **206 tests / 8 suites passed**.
- Full Jest after the fix: **2,685 tests / 120 suites passed**, no skipped tests.
- Production build: **compiled successfully** after the fix.
- Migration static checks: **48 passed / 0 failed**.
- `git diff --check`: passed.
- SQL rehearsals were not repeated; no migration/permission/scoring SQL changed.

Jest/build/static logs remain in `supabase-tests/runners-out/browser-qa-*.log`.
Browser scripts are generated local runners in the same untracked directory;
functional reruns create more TEST ONLY local records and are not read-only.
Do not run them against another environment or include them in a release without
review. `browser-common.cjs` has fixed local destinations and a database guard.

## Local evidence and remaining gaps

Evidence directory:
`%LOCALAPPDATA%\Temp\barangay-browser-qa-evidence-20261105`.

Start with `summary.json`, `responsive-final.json`, `functional.json`,
`privacy.json`, `credit-workflows.json`, `credit-participation.json`,
`correction-and-tables.json`, `keyboard-dialogs.json`,
`password-target-regression.json`, `document-ready.json`. Final screenshots use `final-*`,
`final-map-popup-*`, `password-target-before.png`, `password-target-fixed-*`,
`independent-approval.png`, `participation-award.png`, and
`analytics-keyboard-tables.png`. Over 600 local artifacts retain initial failures
and superseded captures as well as the final evidence. No HAR, storageState or
authentication-bearing trace was exported; credentials remain in the existing
private configuration outside Git. No generated screenshot/evidence is staged.

Unverified: populated public announcement/event detail, signup later steps,
email/reset delivery, Storage/upload/download flows, full print output,
final document claimed/receipt lifecycle, KP final disposition/hearings/closure,
Tanod-user duty/check-in/reporting (no dedicated synthetic login provisioned),
every role/data-state/short-height combination, assistive-technology assessment,
and the blocked Google embed. Ordinary-role detail privacy has API/component
evidence plus the exercised UI restrictions, not all possible browser attacks.
No full WCAG compliance or application-wide exhaustive browser certification.

**Sufficient for remote CI preparation/review: YES**, with these gaps and the
targeted uncommitted fix explicitly included in the next candidate review.
**Production release approval: NO.** Remaining release cutover, recovery,
hosting/CI and authorization gates in Step 6 still apply. No push, PR mutation,
merge, deployment, production access, migration 064, V2 production activation or
destructive Git operation. Checkpoints, SMS seed and private backups preserved.
