# Stage 7R.1 — Residents Requests actions

November 7, 2026. Branch/HEAD remain `defense/scope-cleanup-20261106` / `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.

## Changes

- `src/dashboards/OfficialDashboard.jsx`: Requests-only portaled `ActionMenu`, conditional column definitions and scoped classes. Other account groups retain their existing buttons.
- `src/dashboards/OfficialRequests.css`: Requests-only column proportions, centered 44px menu triggers, readable badges and responsive action-cell styling.
- `src/dashboards/OfficialRequests.test.jsx`: four new integration tests (including both authorized positions).
- `src/residents/officialResidentsViews.test.js`: existing permission/confirmation tests updated to open the menu before choosing actions; ordinary-official absence assertion strengthened.
- This report.

Before: three visible verification buttons widened the action column and increased row height. After: one compact three-dot control, with Verify, Reject and Not a Resident inside the existing reusable menu. Existing status-dependent availability is retained, including suppression of Reject for returned/rejected requests. Processing rows show a noninteractive processing state instead of an actionable menu. All seven information columns, search, Purok filter, verification badges and responsive labeled records remain.

Menu item callbacks call the exact existing `handleVerifyResident`, `handleOpenReject` and `handleOpenIneligible` handlers. Their definitions, confirmations, business rules and backend calls are unchanged. Secretary/Punong frontend gating and ordinary-official read-only text are unchanged. Portaling, keyboard navigation, Escape/focus return and outside dismissal reuse the unmodified ActionMenu component. No other Residents tab or profile styling changed.

## Validation

- Focused: **55 tests / five suites passed**. New tests cover portaling, Arrow navigation, Escape/focus restoration, outside dismissal, both authorized positions' existing confirmation flows and ordinary-official denial. Confirmation dialogs were canceled; no decisions submitted. Mock write methods throw. Two older tests initially expected visible buttons; adapting their selectors to the menu preserved all confirmation/permission assertions.
- Full Jest: **2,603 tests / 115 suites passed**, exit 0, 123.461 seconds. Existing act/router and expected mocked API diagnostics remain in the suite logs.
- Normal and strict `CI=true` builds: **passed**, exit 0, compiled successfully.
- `git diff --check`: **passed**.
- Offline static Chrome: **36 observations** (Requests, menu, read-only and confirmation captures) at **320, 375, 390, 414, 768, 1024, 1280, 1440 and 1920px**. No measured page overflow, clipped controls or out-of-bounds dialogs. No static page errors.
- Actual hydrated ActionMenu browser probe at **375, 768, 1024 and 1440px**: portaled menu within viewport, Arrow focus movement, Escape dismissal/focus return, outside dismissal and all three callback selections passed; no page errors. This probe uses the real shared component in captured fictional markup, with callbacks that only record selections. Dashboard handler/confirmation wiring is verified by Jest, not by live browser account decisions.

The offline probe initially needed its standalone React injection configuration and complete shared styles corrected. It also waits for scroll layout frames before opening because the existing menu intentionally dismisses on scroll. These were fixture corrections, not production component changes.

## Before/after evidence

Private directory: `%LOCALAPPDATA%\Temp\barangay-stage7r1-responsive-20261107\`.

- `requests-before-375.png`, `requests-before-1024.png`: preserved copies of Stage 7R screenshots showing the original three buttons.
- `requests-after-375.png`, `requests-after-1024.png`: static component captures.
- `requests-after-live-menu-375.png`, `requests-after-live-menu-1024.png`: actual hydrated menu trigger in the offline fixture.
- `requests-dropdown-375.png`, `requests-dropdown-1024.png`: real open menu positioning/focus.
- `results.json`, `menu-interactions.json`: reproducible measurement/interaction results.

Before/after mobile and desktop screenshots were visually reviewed. Generated runners, webpack probe bundle and logs remain local diagnostics, not proposed release files. Reproduction scripts are under `supabase-tests/runners-out/stage7r1-*`; no new dependencies were installed.

## Safety and limitations

No Supabase access/writes, policy/query/RPC changes, migrations, credentials, SMS, Docker, commits, pushes or deployment. Previous stages remain preserved. Migration 068 is unchanged and unapplied; SHA256 `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

Authenticated live decisions and database authorization remain unverified. The known backend verification-permission issue is still a release blocker requiring separate isolated PostgreSQL/authenticated API validation of migration 068. Frontend gating does not resolve it. Stage 7S has not started.
