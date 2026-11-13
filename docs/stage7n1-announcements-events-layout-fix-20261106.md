# Stage 7N.1 - Announcements and Events layout corrections

Branch `defense/scope-cleanup-20261106`, HEAD `c1cc57f`. Earlier work remains preserved. No Stage 7O work.

## Root causes

1. Both tables inherited the same 35% title rule, leaving other descriptive columns to share unspecified space. This did not reflect the different announcement/event content priorities.
2. The shared `.action-cell` has `display:flex`, which is inappropriate for a desktop `td` when normal table-cell geometry is required. It is still appropriate for the existing mobile card layout.
3. The narrow SMS allocation competed with cell padding, while the publishing page's secondary-button rule allowed wrapping. There was no explicit non-shrinking SMS control contract.
4. Toolbar wrapping/width rules were not coordinated with headings. Date/time used three stacked lines and repeatedly emphasized a missing time.

An intermediate mixed percentage/pixel `calc()` colgroup approach did not produce the intended Chrome widths. Screenshot review caught it; the final solution uses supported direct percentage columns and an automatic remainder. Final browser checks now verify actual width ratios as well as alignment, rather than merely the presence of a colgroup.

## Exact files changed in this stage

1. `src/dashboards/OfficialDashboard.jsx`: explicit announcement/event table classes and five-column groups only.
2. `src/dashboards/OfficialPublishing.css`: column sizing, table-cell restoration, compact controls/toolbars and date layout.
3. `src/dashboards/OfficialPublishingUI.jsx`: subtle missing-time presentation only.
4. `src/dashboards/OfficialPublishing.test.jsx`: colgroup/SMS constraints and unchanged legacy-location assertions.
5. This report.

Generated `supabase-tests/runners-out/stage7n1-*` scripts/logs and private screenshots are not release artifacts. Migration 068 and Stage 7K files were not edited; 068 SHA256 remains `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.

## Final layout

- Announcements: title 50% (48% at narrower desktop widths), category 20% (18% narrower), date uses the remainder after the two fixed utility columns.
- Events: title 30%, date/time 23%, location uses the remaining flexible space.
- Both: SMS column 76px; action column 64px. Desktop action cells are restored to `table-cell`; headings and controls align centrally in utility columns. Other text stays left aligned and cells vertically centered with compact padding.
- SMS buttons are 52px wide and 44px tall, `inline-flex`, centered, non-shrinking, with explicit nowrap/normal word breaking. Handlers and permissions were not changed.
- The card heading and toolbar form a two-column header when space permits; narrower screens get a clean heading/control-row arrangement. Search is flexible but capped at 220px. No spacers or fixed artificial row heights.
- Existing mobile table cards remain at 768px and below; colgroups do not constrain those cards. A 560px table floor at desktop-sized viewports protects column readability within the existing table scroll wrapper if the surrounding portal shell leaves insufficient space. It does not impose unreadable columns or a page-wide overflow on mobile.
- Event date is followed by a compact metadata line for genuine time and Upcoming/Past/Unscheduled badge. Missing time displays a subtle **Time —**, with an explicit accessible label **Event time not recorded**. Labels/counts/data are not hidden to solve layout problems.

Measured desktop column shares (title/category/date/SMS/action for announcements; title/date/location/SMS/action for events):

| Width | Announcements | Events |
|---|---|---|
| 1024 | 48 / 18 / 19.3 / 8 / 6.7% | 30 / 23 / 32.3 / 8 / 6.7% |
| 1280 | 50 / 20 / 18.4 / 6.3 / 5.3% | 30 / 23 / 35.4 / 6.3 / 5.3% |
| 1440 | 50 / 20 / 19.8 / 5.6 / 4.7% | 30 / 23 / 36.8 / 5.6 / 4.7% |

These measurements describe the standalone offline content layout, not the live Sidebar shell.

## Date/time data-quality assessment

The existing frontend reads genuine optional `event_time` through the existing Events read and formats it with `eventTimeLabel`. Existing edit forms do not expose a time field. `CLAUDE.md` records historical observations of null event_time values and legacy locations beginning with manually typed times. That is historical repository evidence, not a fresh cloud inventory.

A guarded, read-only public Events request was attempted with the configured project's anon client key, projecting only `event_time,location` and intended to output aggregate counts only. It failed with a network `fetch failed` error; no cloud records were returned or printed. Current structured-time/legacy-location prevalence therefore remains unverified. No credential, token, URL containing a key, resident identity or actual location value was logged.

Location text remains verbatim. A time-looking location does not become a verified schedule time. No time was parsed, rewritten, inferred or added to a database field. Existing scheduling/filter logic, queries, RPCs, Auth, RLS and SMS delivery logic are unchanged.

## Tests and browser evidence

- Focused publishing/menu/calendar/official identity: **92 tests / 4 suites passed** (`stage7n1-focused.log`).
- Full Jest: **2,581 tests / 110 suites passed**, 171.885 seconds (`stage7n1-full.log`).
- Final normal and strict `CI=true` builds: **passed without warnings**, exit 0 (`stage7n1-build-normal-final.log`, `stage7n1-build-strict-final.log`).
- `git diff --check` passed with existing line-ending advisories.

New regressions require the five-column structures, distinct location/SMS classes, nowrap/non-shrinking SMS dimensions and normal desktop table-cell behavior. Legacy time-like locations remain unchanged and are never rendered as a fabricated event time. Existing filters, menu keyboard/Escape/focus behavior and modal cancel/delete-confirmation cancel tests continue passing without writes.

Installed Chrome/Playwright checked six states across **375, 390, 768, 1024, 1280 and 1440px**, plus 320/414/1920: **54 observations**. Scenes: Announcements, Events, announcement menu, announcement edit, Events calendar and event edit. All measured SMS labels stayed on one line at 52x44px; controls did not cross viewport edges; desktop headings/cells aligned within 1px; title-width ratios matched the intended ranges; no measured page overflow or off-viewport dialog. Desktop/mobile screenshots were visually reviewed.

This is **offline browser QA**: actual React DOM captured from Jest fixtures with Auth/Supabase/SMS test mocks, then rendered with application CSS and all browser network blocked. Interactive filter/menu/modal behavior is Jest evidence, not hydrated/live Chrome certification. Actual authenticated cloud pages, live portal shell constraints, real menu anchor placement and save/send behavior remain unverified. No business-record write or SMS delivery was performed.

## Before / after screenshots

Private evidence folder: `%LOCALAPPDATA%\Temp\barangay-stage7n1-responsive-20261106`.

- `before/announcements-1024.png` and `before/announcements-375.png`: preserved Stage 7N offline captures.
- `before/events-1024.png` and `before/events-375.png`: preserved Stage 7N offline captures.
- `announcements-1024.png`, `announcements-1280.png`, `announcements-1440.png`, `announcements-375.png`, `announcements-390.png`, `announcements-768.png`: final layout.
- Equivalent `events-<width>.png`: final Events layout.
- Menu, calendar and edit-modal screenshots; `results.json` contains measured SMS dimensions, line counts, alignment and column ratios.

No before captures at 1280/1440 were available; none were reconstructed or presented as historical evidence. The user-reported authenticated screenshots are not repository artifacts.

## Remaining limitations / release gates

Review the final layout in the actual signed-in portal before deployment. Resolve legacy time entry only through a separately authorized data-quality process; this visual patch deliberately does not repair records. Existing authorization and 068 isolated-rehearsal gates remain. No Docker, migration, database write, commit, push, merge or deployment occurred. Stop and await review before Stage 7O.
