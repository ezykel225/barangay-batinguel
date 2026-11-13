# Stage 7R — Officials Directory and Residents UI

Implemented November 7, 2026 (the report filename follows the requested Stage 7R path). Branch remains `defense/scope-cleanup-20261106`; HEAD remains `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.

## Files changed in this stage

- `src/dashboards/OfficialDashboard.jsx`: scoped workspace classes and stylesheet import; a class for the existing Official form overlay.
- `src/residents/ResidentsWorkspace.jsx`: scoped stylesheet import and native disclosure retaining the complete directory/account explanation.
- `src/residents/ResidentProfileDialog.jsx`: scoped stylesheet import and a presentation-only root class, ensuring refinements take precedence regardless of shared stylesheet import order.
- `src/dashboards/OfficialPeople.css`: new scoped visual refinements.
- `src/dashboards/OfficialPeople.test.jsx`: four new isolated component regression tests and optional offline capture helper.
- This report.

Earlier work is preserved. The complete diff against HEAD contains earlier stages and is not this stage's changed-file inventory. Generated logs/runners under `supabase-tests/runners-out/` remain local diagnostics, not proposed release source.

## Before and after

### Officials Directory

Applied the established page heading, white cards, navy controls, subtle borders and compact table typography. Kept all seven columns and original sorting/display order. Circular portrait/fallback containers are 42px; long names and committee descriptions wrap. Utility columns and portal action triggers are aligned, and the self-archive explanation remains visible.

Screenshot review found the Order header wrapping in its narrow column; the final stylesheet widens this utility column without forcing long record text onto one line. Add/Edit forms retain their current fields, position restrictions, validation, storage behavior and handlers; styling now matches the shared controls and uses bounded viewport scrolling. Portaled menus remain outside table clipping containers.

### Residents: Batinguel Residents

Refined existing directory summary cards with equal grid-row heights, white surfaces, consistent values and spacing. Search/status/Purok controls, Clear filters and Add Resident retain existing behavior. Directory names, numeric Purok display, status, account linkage and action columns remain intact. Purok form dropdowns are unchanged. Inactive records are not reclassified by styling.

### Residents: Non-Residents and Requests

Kept all three existing native-button views with clear pressed/focus states. Non-Residents continues to show only explicit classifications. Requests retains the existing group/status logic, pending/returned explanations, decision notes, ID viewing and permitted decision controls. Existing decision button tones remain; their minimum height is now 44px. No new decisions/statuses were invented, and accounts were not moved into the confirmed resident directory.

The longer directory/inactivity/non-residency/account distinction is retained verbatim inside an accessible native disclosure. Legacy voter-match metadata already present in the account queue is unchanged; no Voter Reference List interface or retired service was restored.

### Resident Profile

Inspection confirmed that Stage 7G already renders the resident name once, with status and Purok in the header and separate Personal/Account Information groups. This stage preserves that structure instead of duplicating identity fields or adding unavailable address data. Reduced avatar/header spacing, balanced existing groups, refined labels/values and retained the conditional Edit Resident action. Restricted fields still display the existing unavailable wording.

The V1 gauge keeps the existing `community_credit_profile` adapter and real returned score/range; this stage changes only its maximum visual width (260px), section headings and spacing. Metrics, ledger, policy, loading behavior and all four profile tabs remain. History/Analytics stay explicitly unavailable. The shared dialog still owns focus management, close behavior and body scrolling; no handler was rewritten.

## Preservation and release gates

No query, API contract, calculation, role check, verification/directory synchronization, Auth, account-linking or backend logic changes. No database access/writes, SMS, Docker, environment changes, commits, pushes or deployment. Mock data exists only in isolated tests/offline captures.

Migration 068 is unchanged and unapplied by this stage. SHA256 remains `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`. Earlier source and Stage 7K files were not edited by this stage.

**Release blocker:** the previously confirmed overbroad backend resident-verification permissions remain unresolved until migration 068 completes its separate isolated PostgreSQL and authenticated API validation/review. Preserving frontend Secretary/Punong restrictions is not proof of database enforcement. This UI stage must not be used to approve security deployment.

## Tests and builds

- Focused: **86 tests / six suites passed**, covering new workspace tests plus existing profile, workspace, directory, role/view and Official form contracts.
- Four new tests cover Official menu/edit fields, separation of Residents views, Add Resident display, identity shown once, absent edit permissions, deferred History, V1 adapter/score display, close callbacks and directory loading/empty/error states. Mocked backend write methods throw; no decision or save was submitted.
- Initial new test used the visible Edit label instead of the existing accessible name including its subject; correcting the test selector resolved it without changing production actions.
- Full Jest: **2,599 tests / 114 suites passed**, exit 0, 129.256 seconds in the final rerun. Existing React act/router and expected mocked backend diagnostics remain; this is not a claim of an error-free live browser console.
- Normal production build: **passed**, exit 0, compiled successfully.
- Strict `CI=true` production build: **passed**, exit 0, compiled successfully. Both were rerun after final presentation changes.
- `git diff --check`: passed; existing LF/CRLF conversion notices are not whitespace failures.

## Offline browser evidence

Installed Playwright-core/headless Chrome rendered actual component DOM captured with Jest Auth/Supabase mocks; all browser network requests were blocked. The snapshot helper preserves actual selected filter options. These are layout measurements, not hydrated/authenticated application verification.

**108 observations** across **320, 375, 390, 414, 768, 1024, 1280, 1440 and 1920px**. Twelve captured states: Officials table/menu/edit form, resident directory, Non-Residents, Requests, Add Resident, profile Information, profile V1 credit, directory loading/empty/error. No measured page overflow, clipped controls or out-of-bounds dialogs. Static pages emitted no JavaScript page errors. Native tables, forms, badges and modal fit were visually reviewed in mobile/desktop screenshots; the generic automated column-alignment check is not a complete layout certification for these tables.

Private evidence: `%LOCALAPPDATA%\Temp\barangay-stage7r-responsive-20261107\`.

- `results.json`: full measurement matrix.
- `officials-1440.png`, `official-edit-375.png`.
- `residents-1024.png`, `requests-375.png`, `nonresidents-1024.png`.
- `resident-profile-375.png`, `resident-credit-375.png`, `resident-add-375.png`.

Reproduction runner/log: `supabase-tests/runners-out/stage7r-responsive.cjs` and `stage7r-responsive.log`. Screenshots and captured fictional records remain private local evidence, not release data.

## Remaining limitations

Authenticated live verification, full application sidebar integration, actual browser React focus/menu positioning, storage uploads, save/archive actions and credit ledger access against Supabase were not performed. Existing Jest suites cover permissions and focus behavior with mocks; they do not establish backend security. Officials populated/edit/archive-empty, all three resident views and directory load/error/empty states were captured; not every possible form/error state was browser-tested. No Stage 7S work started.
