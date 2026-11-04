# Retained-system responsive audit and manual verification

Status: source-level audit and focused fixes; **not browser-certified**.
Browser automation reported its access host unavailable, and the user authorized
continuing static inspection. No viewport is marked passed from Jest, CSS
inspection, HTTP response, or the user's earlier Community Credit observation.

## Scope and evidence

Reviewed the route inventory in App.js, active tab inventories in Sidebar and the
three dashboards, retained page styles, and shared layout/interaction sources.
The structural scan covered every src CSS file for fixed/minimum sizes, grid
floors, nowrap, overflow, media rules and dialog bounds. Targeted review included
Document Requests/Preview, Complaints/Screening/KP, Incidents/person links, Tanod,
Residents/Unified Profile, Community Credit and Safety Map/Analytics. This is a
source audit, not proof that every runtime data state fits. Retired modules
remain excluded.

## Confirmed source defects and focused changes

| Area | Source evidence | Fix | Rendered status |
|---|---|---|---|
| About | 300px grid floor exceeds the 280px content width at a 320px viewport with 40px padding | Bound the floor by 100% | Pending |
| People search | 240px grid floor cannot shrink inside narrow padded dialogs/cards | Bound the floor; allow long labels to wrap; remove fieldset min-content floor | Pending |
| Public navigation | Open class was visible even on desktop; no Escape or resize cleanup; dense 32px-gap desktop menu below tablet width | Tablet disclosure through 1024px, desktop reset, Escape focus return, 44px toggle, shrinkable brand | Lifecycle tests passed; rendered pending |
| Footer dialogs | No maximum height or internal scrolling on long legal text | Viewport/dynamic-viewport height bound and internal scrolling | Pending |
| Document/KP preview | At 320px, 0.40 A4 scale is about 318px inside a 288px dialog before stage padding | Match sheet and wrapper scale at 0.33 through 360px; print CSS unchanged | Pending |
| Announcement/Event details | Dynamic title/description/location had no long-token wrapping | Wrap unbreakable content within the card | Pending |
| Analytics data tables | Scroll region had no keyboard focus target | Named, focusable region using existing global focus indicator | DOM interaction test passed; rendered pending |
| Public/internal Leaflet | Neither observed its container changing size after initialization | Shared ResizeObserver/window fallback, skip hidden/detached containers, disconnect before existing teardown | Lifecycle tests passed; rendered pending |
| Community Credit | Mobile stacked spacing and long policy title; disclaimer omitted two categories | Compact spacing and bounded gauge without reducing SVG score font; explicit title wrapping and comprehensive disclaimer | RPC/model tests passed; rendered pending |

## Safe manual setup

Use an isolated local fixture backend or a controlled mocked client. Use synthetic
Resident, linked Secretary/Punong, ordinary official and Tanod identities. Block
production Supabase requests; do not reuse production credentials or real records.
Use both active V1 and active V2 fixture states without activating production V2.
Exercise empty, populated, loading, denied, unavailable and long-content states.

## Viewport matrix

P = pending real browser verification. Enter PASS/FAIL only after rendering and
interaction at that width; record browser, height, fixture state, screenshots and
any issue. All entries below are P intentionally.

| Surface | Screen/state | 320 | 375 | 414 | 768 | 1024 | 1280 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|---|---|
| Public | Home / | P | P | P | P | P | P | P | P |
| Public | About /about, including profile cards and embedded map | P | P | P | P | P | P | P | P |
| Public | Officials /officials, featured cards and availability | P | P | P | P | P | P | P | P |
| Public | E-Services /e-services | P | P | P | P | P | P | P | P |
| Public | Track Complaint /track-complaint: empty, validation, synthetic result | P | P | P | P | P | P | P | P |
| Public | Community Safety /community-safety: filters, aggregate map, legend, list | P | P | P | P | P | P | P | P |
| Public | Announcements /announcements: listing, filters, long titles | P | P | P | P | P | P | P | P |
| Public | Announcement /announcements/:id: long title, long URL, description | P | P | P | P | P | P | P | P |
| Public | Events /events: calendar/list, date popovers | P | P | P | P | P | P | P | P |
| Public | Event /events/:id: long title, location and description | P | P | P | P | P | P | P | P |
| Public | Login /login: normal, errors, recovery dialog | P | P | P | P | P | P | P | P |
| Public | Signup /signup: every step and review | P | P | P | P | P | P | P | P |
| Public | Reset password /reset-password: validation and errors | P | P | P | P | P | P | P | P |
| Resident /resident | Dashboard | P | P | P | P | P | P | P | P |
| Resident /resident | Document Requests | P | P | P | P | P | P | P | P |
| Resident /resident | Complaints: filing, evidence, details, timeline | P | P | P | P | P | P | P | P |
| Resident /resident | Community Credit: V1, V2, unlinked, unenrolled, correction form | P | P | P | P | P | P | P | P |
| Resident /resident | Settings: details, ID, photo, password | P | P | P | P | P | P | P | P |
| Official /official | Dashboard: summaries and charts | P | P | P | P | P | P | P | P |
| Official /official | Announcements: table, editor, details, archive | P | P | P | P | P | P | P | P |
| Official /official | Events: list/calendar, editor, archive | P | P | P | P | P | P | P | P |
| Official /official | Document Requests: filters, details, processing | P | P | P | P | P | P | P | P |
| Official /official | Complaints: intake, screening, disposition and linked KP workflow | P | P | P | P | P | P | P | P |
| Official /official | Incidents & Blotter: table, details, location picker, person linking | P | P | P | P | P | P | P | P |
| Official /official | Tanod Operations: rosters, schedules, duty, reports and management dialogs | P | P | P | P | P | P | P | P |
| Official /official | Safety Map & Analytics: both sections, filters, chart tables and drilldowns | P | P | P | P | P | P | P | P |
| Official /official | Residents: directory, filters, verification and forms | P | P | P | P | P | P | P | P |
| Official /official | Community Credit: resident overview, V1 controls and V2 workflow forms | P | P | P | P | P | P | P | P |
| Official /official | Officials Directory: editing, photos, linking and archives | P | P | P | P | P | P | P | P |
| Official /official | Activity Log: filters, pagination and long content | P | P | P | P | P | P | P | P |
| Official /official | Settings: account and shared administration controls | P | P | P | P | P | P | P | P |
| Tanod /tanod | Overview | P | P | P | P | P | P | P | P |
| Tanod /tanod | My Duty: upcoming, current, check-in/out states | P | P | P | P | P | P | P | P |
| Tanod /tanod | Report Incident: all fields, validation, submission result | P | P | P | P | P | P | P | P |
| Tanod /tanod | My Reports: cards, filters and details | P | P | P | P | P | P | P | P |
| Tanod /tanod | Settings: details, password, photo | P | P | P | P | P | P | P | P |
| Unified Resident Profile | Information and summary | P | P | P | P | P | P | P | P |
| Unified Resident Profile | Complaint/KP history and timeline | P | P | P | P | P | P | P | P |
| Unified Resident Profile | Incident history and timeline | P | P | P | P | P | P | P | P |
| Unified Resident Profile | Analytics periods, charts and drilldowns | P | P | P | P | P | P | P | P |
| Unified Resident Profile | Community Credit gauge, ledger and denial state | P | P | P | P | P | P | P | P |
| Shared | Public menu: open, close, Escape, route change and desktop resize | P | P | P | P | P | P | P | P |
| Shared | Portal drawer: focus trap, Escape, backdrop, tab selection and resize | P | P | P | P | P | P | P | P |
| Shared | Notifications: unread, long titles, empty and error states | P | P | P | P | P | P | P | P |
| Shared | Action menu: first/last table row, bottom-edge popup, scroll close | P | P | P | P | P | P | P | P |
| Shared | Confirmation, edit, details, archive and nested dialogs | P | P | P | P | P | P | P | P |
| Shared | Document and KP print previews, toolbar, stage and print output | P | P | P | P | P | P | P | P |
| Shared | Footer Privacy/Terms dialogs, keyboard close and long text | P | P | P | P | P | P | P | P |
| Shared | Calendar controls, selected-day list and public date popovers | P | P | P | P | P | P | P | P |

## Checks at each matrix cell

- [ ] Record exact viewport width and height; retain a screenshot of top and scrolled content.
- [ ] No unintended document-level horizontal scroll; distinguish intentional local table/chart scroll.
- [ ] No clipped/overlapping text, badges, buttons, cards or action menus. Use synthetic long names, titles, URLs and references.
- [ ] Navigate with keyboard only: visible focus, accessible names, Escape, Tab/Shift+Tab, focus return and no trap in ordinary disclosures.
- [ ] Repeatedly open/close mobile navigation; follow links, change tabs and resize across 768/769 and 1024/1025.
- [ ] Open every dialog at short height too; reach close/save controls without the page behind scrolling.
- [ ] Scroll chart data tables with keyboard; inspect dense and empty chart series and drilldown controls.
- [ ] Resize/reveal maps after sidebar collapse/tab change; check tiles, controls, popups and list alternatives; rapidly navigate away during zoom.
- [ ] Verify Community Credit correction controls with local fixtures, own-record selection, validation, request status and retry.
- [ ] Check touch spacing and click/tap each action; verify desktop controls retain behavior.
- [ ] Verify denied roles remain denied and no newly visible control grants data access.
- [ ] Inspect console for runtime errors and network panel for accidental production requests.

## Automated checks and release decision

Jest exercises mocked/DOM interactions and map lifecycle behavior; jsdom does not
lay out a viewport. Production build and diff checks are separate requirements.
Record current totals in the implementation report.

The retained system is **not cleared for final integration** until this manual
matrix is executed and remaining defects are resolved. This does not authorize
production changes, V2 activation, migration 064, pushes, merges or deployment.

## Final automated results for this pass

- Targeted accessibility/lifecycle suites: 163 tests / 9 suites passed.
- Full Jest: 2,660 tests / 118 suites passed.
- Production build: compiled successfully with CI=true.
- git diff --check: passed.
- Real-browser viewport cases executed by this audit: zero.
- No production access, migration execution, pushes, PRs, merges or deployment.

## Files changed in this pass

- `src/components/Navbar.jsx`
- `src/components/Navbar.css`
- `src/components/Navbar.test.js`
- `src/components/Footer.css`
- `src/pages/About.css`
- `src/pages/AnnouncementDetails.css`
- `src/pages/EventDetails.css`
- `src/people/PeopleHistory.css`
- `src/documents/DocumentPreview.css`
- `src/analytics/AnalyticsCharts.jsx`
- `src/analytics/AnalyticsCharts.accessibility.test.jsx`
- `src/safetymap/observeMapSize.js`
- `src/safetymap/observeMapSize.test.js`
- `src/safetymap/IncidentMap.jsx`
- `src/safetymap/PublicSafetyMap.jsx`
- `src/communityCredit/CommunityCredit.css`
- `src/communityCredit/CreditProfile.jsx`
- `src/communityCredit/CommunityCreditV2.test.jsx`
- `docs/responsive-audit.md`

Earlier uncommitted Community Credit and migration-validation changes remain preserved.

## User-reported Chrome evidence — 2026-11-04

The user manually tested the isolated synthetic app at `127.0.0.1:3001` and
reported the following results. These are manual results, not automated browser
passes. Earlier screenshots were reviewed in conversation according to the
supplied QA history; they are not available as repository artifacts and were
not independently re-inspected during this documentation checkpoint.

| Screen | Width | Reported evidence / outcome | Limits |
| --- | --- | --- | --- |
| Official Dashboard | 1024px | Refresh: kapitan_status HTTP 200; “Status not published” displayed | Other widths/error/published states not browser-certified |
| Resident Community Credit | 1024px | Correction submission succeeded and appeared as `submitted` | Independent review/resolution and duplicate-submit UI not certified |
| Incident Map | Not specified | TEST ONLY marker rendered; popup opened with fictional incident details | Do not infer width, zoom/keyboard/resize behavior |
| Incidents & Blotter | 375px | Record Incident dialog fitted; native required validation blocked incomplete submission; count unchanged | Successful submission, Cancel/scroll/focus return remain unverified |
| Mobile navigation | Not specified | Escape closed the menu | Open/backdrop/route close/focus return and exact width unverified |
| Resident Community Credit | 320, 375, 414, 768, 1024, 1280, 1440, 1920px | Earlier screenshot-based visual layout checks reported complete | Does not certify all data states or interactions at each width |
| Selected Official screens: Community Credit, Incidents & Blotter, Incident Map, Analytics & Insights, Patrol Coverage | 375, 1024px | Earlier visual layout checks reported complete | Does not certify every tab/control/workflow |

The original P matrix above covers broader state combinations; these selected
visual/interaction results do not turn its entire rows into PASS. All other
public pages, portal tabs, shared components, data states and widths still need
the recorded browser evidence required by that matrix. Full application-wide
browser certification is **not complete**.
