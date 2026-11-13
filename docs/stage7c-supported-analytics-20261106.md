# Stage 7C — supported incident Analytics & Insights

Date: 2026-11-06. Branch `defense/scope-cleanup-20261106`, HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08` unchanged.

## Historical comparison

Reviewed `59289af`'s `AnalyticsInsights`, `analyticsApi`, `incidentAnalytics`, `analyticsPeriods`, `AnalyticsCharts`, styles and tests. The Stage 7B panel used shared map dates/category and the older monthly/type/status summaries. The historical richer incident charts were already calculated from `incident_queue` (044); migration 062 supplied additional analytical/person/dispute sections separately.

Recovered the pure period/calendar functions, incident transformations and accessible chart components selectively. Did not import the historical 062 API adapter, person-history components or entire Safety Map implementation.

## Restored incident functionality and sources

| Section | Source and counting rule |
|---|---|
| Period/category/recorded-area filters | Own Analytics state retained by the Safety Map parent; independent of map/patrol filters. |
| Incident records | Existing `incident_queue`, one count per incident ID. |
| With a blotter entry | Nonblank `blotter_reference` from that same queue; duplicate joins cannot add incident counts. References themselves are not displayed. |
| Distinct recorded areas | Area note if nonblank, otherwise location text; trim only, otherwise exact. Missing-area bucket excluded from distinct-area count. |
| Incidents over time | `occurred_at` in Asia/Manila; daily up to 31 days, Monday-start weeks up to 92 days, monthly beyond. Zero buckets retained within the period. |
| Categories/statuses/areas | Counts of the same filtered unique incident collection, including unknown stored category/status values. |
| Weekday/time of day | Manila occurrence day and historical six four-hour bands. No creation-date substitution. |
| Chart tables | Accessible disclosure tables with keyboard-focusable scroll regions and explicit values. |

All incident cards/charts use the Analytics period, category and area. Period determines the server read; category and area narrow locally. Period/category changes clear the area selection. Area choices come from the selected period/category. Custom dates support open ends; invalid/reversed/entirely empty custom ranges show validation. Reset affects Analytics only.

Undated records count in unbounded totals, but not time-based charts; bounded periods exclude them. Incidents without coordinates still count. Coordinates are not treated as recorded areas.

## Complete and privacy-conscious reads

`supportedAnalyticsApi.js` calls only the already-used `incident_queue` RPC. It requests exact count metadata and stable ID ordering, paginates up to 10,000 returned rows, checks progress/count consistency and rejects unverifiable or conflicting results rather than charting partial totals. Large periods must be narrowed. A result can change between HTTP pages; this is not a transactional cross-request snapshot. Refresh/narrow the period if data is being edited concurrently.

The adapter immediately projects to incident ID, occurrence, type, status, location text, area note and a blotter-link boolean. It does not expose narratives, actor identities, coordinates or references in its result. Missing area/blotter metadata produces explicit unavailable states. Denied requests show an account/session restriction and no analytical totals. No new anonymous or Resident access was added; existing Official route and server authorization remain the boundaries.

The map-safe eight-field reader is unchanged. No private analytics fields are passed to markers/popups or public Community Safety.

## Patrol review

Kept `tanod_coverage_summary`, existing date-race protection, assignment/area totals, repeated locations, observations and wording-match caveat. The historical implementation uses the same coverage reader and grouping concept. Active assignment counts mean records marked active in the selected assignment-date range, not attendance/live patrol presence. Incident occurrences use the shared map range. Location comparisons normalize case/spacing, whereas Analytics areas use exact trimmed area-note/location semantics. Explanations explicitly reject geographic-containment and causal-effect conclusions.

## Backend-dependent sections not restored

No calls to `barangay_safety_analytics`, `repeated_dispute_analytics` or person-history/analytics RPCs were added. Their live availability and role permissions remain unverified. Repeated-person/dispute analysis, complaint/KP/outcome/credit attribution and related drilldowns are omitted rather than approximated from incident locations.

No live authenticated result was obtained in this stage. The existing queue contract is verified from migration 044 and current application readers. Exact-count metadata, field availability and populated results still require verification within an authorized Official session; runtime guards fail explicitly if those conditions are not met.

## Files changed this stage

- `src/safetymap/SafetyMapPanel.jsx`
- `src/safetymap/safetyMapPanel.test.js`
- New `src/analytics/analyticsPeriods.js` and `analyticsPeriods.test.js`
- New `src/analytics/incidentAnalytics.js` and `incidentAnalytics.test.js`
- New `src/analytics/AnalyticsCharts.jsx` and `AnalyticsCharts.test.jsx`
- New `src/analytics/supportedAnalyticsApi.js` and `supportedAnalyticsApi.test.js`
- New `src/analytics/SupportedAnalytics.jsx`, `SupportedAnalytics.test.jsx`, `SupportedAnalytics.css`
- This report. Generated scripts/logs remain under `supabase-tests/runners-out/stage7c-*`.

Community Credit restoration, IncidentMap implementation, safetyApi, Tanod modules, Auth, environment files, dependencies and migrations were not modified in this stage. Earlier uncommitted changes remain preserved.

## Validation

- Focused Jest: **87 passed / 7 suites**, exit 0.
- Full Jest: **2,522 passed / 107 suites**, exit 0 (140.095 seconds).
- Production build passed. Final build log: `stage7c-build-final.log`.
- `git diff --check` passed, with LF/CRLF advisories only.
- Initial focused run found six old tests tied to the previous summary DOM. Kept map totals on Incident Map, updated assertions for independent Analytics semantics/new labels and used heading-role queries to distinguish chart headings from table captions. Second run and final expanded coverage passed; no assertion was bypassed.
- Unit tests cover calendar boundaries/leap years, period grouping, exact areas, missing dates, chart summaries, pagination/completeness, duplicate joins, blotter-link counts, missing metadata, authorization failure, filter independence and tab persistence. Existing map markers/privacy and patrol tests remain passing. Unit fixtures are test-only and were not inserted into Supabase or used in production runtime.
- Real Chrome checks at **320, 375, 414, 768, 1024, 1280, 1440, 1920px** passed for the real Analytics filter/loading-state component with application styles: no page-level overflow; all controls within viewport and at least 44px high. Evidence: `%LOCALAPPDATA%\Temp\barangay-stage7c-responsive-20261106`. These are offline server-rendered layout checks, not authenticated populated charts or interaction certification.
- Authenticated populated analytics, actual RPC responses and complete mobile/desktop chart interactions remain **unverified**. Existing browser-session access limitations were not bypassed; no mock login or credential extraction was used.

## Next authorized verification

In the owner's existing Official session, select Analytics & Insights and inspect network status for `incident_queue` only. Confirm populated cards/charts, switch category/area/period, compare time-table sums and linked counts, then switch back to Map/Patrol and confirm their filters stayed unchanged. Check partial/missing-date explanations and error states without modifying records. Do not export private responses or tokens into reports.

No Docker, Supabase write, migration, scoring/permission change, Git commit/push/merge or deployment occurred. Stop after implementation and reporting.
