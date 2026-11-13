# Stage 7N - Official publishing pages consistency

Branch: `defense/scope-cleanup-20261106`; HEAD remains `c1cc57f`. Scope: Official Announcements and Events only. No Stage 7O work.

## Audit and conventions

The portal uses hand-written component CSS, design tokens, shared Sidebar table-to-card styles, ActionMenu with portal positioning, MonthCalendar, modal focus handling and existing SMS components. The two publishing pages had inconsistent inline toolbar layouts, unlabeled filters, raw category text, title/SMS controls sharing cells, and dates formatted differently. The Events date filter appeared usable in Calendar even though it affected the table only.

Stage 7M conventions are applied through `.official-content-page` and `.official-publishing-modal`: consistent title/subtitle spacing, white cards, subtle blue-gray borders, 12px radii, light shadows, compact headers/rows, blue primary actions, 44px toolbar/menu targets, focus-visible outlines and reduced-motion rules. Styles are scoped; Sidebar and other portal pages were not redesigned. Existing ActionMenu, MonthCalendar, SmsHistory, SmsComposer and modal handlers remain.

## Exact files changed in Stage 7N

1. `src/dashboards/OfficialDashboard.jsx`
2. `src/dashboards/OfficialPublishing.css`
3. `src/dashboards/OfficialPublishingUI.jsx`
4. `src/dashboards/OfficialPublishing.test.jsx`
5. This report.

Earlier changes remain in the working tree. Generated `supabase-tests/runners-out/stage7n-*` logs/scripts and private browser evidence are not release artifacts. No files were staged, committed or pushed.

## Announcements before / after

- A wrapping, labeled toolbar now provides title search, existing category filtering, reset and the existing Add action.
- Search is a trimmed, case-insensitive substring match on titles already fetched. It combines with the existing badge/category filter and does not issue a query. Results are explicitly labeled as matching **loaded** records.
- Title text is visually clamped but remains complete in the DOM/title attribute; keyboard focus expands the full title. Category pills have consistent neutral-blue styling and an explicit Uncategorized fallback.
- SMS is a separate table/card cell with the same source type/ID and unchanged component, not appended to the title.
- Posted dates use a shared calendar-safe/Manila formatter; no invented date is substituted for missing or invalid input.
- Existing Edit/Delete menus, confirmation, Add/Edit state, save behavior, permissions and SMS wiring remain. Tests open/cancel forms and delete confirmation without submitting writes.

## Events before / after

- Table/Calendar controls and the date filter use the same toolbar and form conventions. The date filter is explicitly table-only and disabled in Calendar; its selected value survives switching back. The calendar still uses its selected month and the original rows/day selection.
- Dates are formatted consistently; existing valid `event_time` uses the shared `eventTimeLabel`. Missing time/location/date are stated explicitly. Location text is never parsed as a time. No new time-entry field or database dependency was added.
- Upcoming includes today in Asia/Manila; Past is before today. Missing/invalid dates display Unscheduled rather than implying a real date. A small UI correction excludes missing/invalid dates from the Past filter; All Dates retains them. These are display/filter categories, not database status changes.
- SMS has a separate cell. Calendar day details reuse the same date/time presentation; existing Add/Edit/Delete and SMS handlers remain unchanged.
- Shared mobile table cards remain, with locally reduced padding and horizontal SMS/action rows rather than oversized stacked controls.

## Read and feedback states

The pages reuse Stage 7L's existing read-state metadata. Loading/denied/error/incomplete reads have explicit notices; an unconfirmed empty response is not called an empty service. Loaded rows may remain visible with a notice when completeness or refresh fails. Confirmed empty collections and filter-empty results remain distinct. Existing save/delete success/error toasts and saving-disabled controls are unchanged; no save or real SMS operation was performed during this task.

No Supabase query, RPC, RLS, permission, schema, Edge Function, authentication, dependency or environment file was changed. The four underlying overview/publishing reads retain their existing projection/filter/order/count metadata. No new backend requirement was identified. Community Credit V1, resident verification, 068 and Stage 7K files were not edited; migration 068 SHA256 remains `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

## Tests

- Focused publishing/identity/directory/menu/calendar run: **133 tests / 5 suites passed** (`stage7n-focused-verified.log`).
- Publishing suite rerun with long-title layout fixtures: **12 tests passed** (`stage7n-visual-fixture.log`).
- Normal production build: **passed without warnings**, exit 0 (`stage7n-build-normal.log`).
- Strict `CI=true` production build: **passed without warnings**, exit 0 (`stage7n-build-strict.log`).
- `git diff --check`: passed with existing line-ending advisories.
- Full Jest: **2,580 tests / 110 suites passed**, 146.165 seconds (`stage7n-full.log`).

Initial focused failures were test expectations for preexisting accessible names: **More actions for ...** and **New Announcement**. Tests were corrected to use the actual unchanged labels; the application controls were not renamed to satisfy tests.

New tests exercise combined filtering without extra reads, reset, SMS-cell separation, complete title availability, menu ArrowDown/Escape/focus return, editing original values, add/edit Cancel, delete-confirmation Cancel, event date/time/missing data, table/calendar switching, denied/read states and Manila date boundaries. Query mocks throw on insert/update/delete/upsert so these interaction tests cannot silently submit a write. SMS components are inert unit mocks; existing integration coverage remains separate.

## Browser evidence

Existing Chrome/Playwright measured actual React-rendered page/menu/modal markup captured from the Jest fixture environment. Auth, Supabase and SMS were mocked **only in tests**, not in application code. All browser network requests were blocked. This is offline component/layout QA, not a signed-in cloud session.

Six states at all eight widths (**48 observations**): Announcements, Events table, announcement menu, announcement edit modal, Events calendar, event edit modal. Widths: **320, 375, 414, 768, 1024, 1280, 1440, 1920px**. No measured page overflow, horizontally out-of-bounds controls or dialog outside the viewport. Screenshots at 375/1024px were inspected. Long-title fixtures retain wrapping; real menu and modal interactions are Jest evidence, not hydrated Chrome evidence. Portal positioning measured in jsdom is not a live anchor-position certification.

Private evidence: `%LOCALAPPDATA%\Temp\barangay-stage7n-responsive-20261106` (markup, `results.json`, screenshots); local runner/results in `supabase-tests/runners-out/stage7n-responsive.cjs` and `stage7n-responsive-final.log`. The standalone content layout omits the real Sidebar shell, which is unchanged.

## Remaining risks / limits

Authenticated live Announcements/Events QA, full shell layouts, real menu anchor placement, screen-reader/contrast audit, live save success/error paths and SMS preview/send behavior were not exercised. No SMS, actual record write or production credential was used. Existing backend authorization concerns and pending 068 isolated rehearsal remain unchanged; this UI stage does not repair or certify them. Validate with authorized accounts before deployment, without sending external notifications during read-only QA.

No Docker, SQL, production writes, commits, pushes, merges or deployment occurred. Stop before Stage 7O.
