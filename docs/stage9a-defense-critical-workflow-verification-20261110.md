# Stage 9A — Defense-critical workflow verification

November 10, 2026. Defense November 16/18. Branch `defense/scope-cleanup-20261106`. **Frontend rehearsal materially covered; authenticated production workflow certification blocked; deployment remains NO-GO.**

## Results and evidence boundaries

- Focused: **1,008 tests / 39 suites passed**, exit0, 52.028s.
- Full Jest: **2,668 tests / 123 suites passed**, exit0, 138.836s.
- Normal production build and strict CI=true build: **compiled successfully**, exit0.
- `git diff --check`: **passed**, exit0; existing line-ending advisories.
- Offline Chrome: **33 fresh captured states × 8 widths = 264 observations**, final zero page overflow, clipped out-of-table controls, dialog-fit/scrollability failures or page errors in tested fixtures. Widths320/375/414/768/1024/1280/1440/1920; viewport height900.

Jest workflow data, users and APIs are mocks/synthetic. No real Auth login/session, hosted SQL/RPC, production record read/write, SMS or migration occurred. Browser uses fresh Jest-captured DOM with real styles and all network requests aborted. It verifies static layout, not React/browser business interactions or real permissions. Keyboard/menu/modal interactions are component-test evidence, not authenticated E2E.

## Workflow matrix

M = verified through mocks/component tests only. B = offline browser layout only. F = local deterministic functionality tested. A = blocked by missing authorized safe authenticated execution. X = incomplete/outside implemented scope. These categories can coexist; no M/B result is a production authorization pass.

| Workflow | Status | Actual evidence / limitation |
|---|---|---|
| Resident/Official/Tanod navigation, protected routes | M; A live | Sidebar/Navbar/AuthContext/role/retired-route tests in focused/full runs; no live login/logout/token refresh or production cross-role test |
| Resident own document submission | M; B; A live | New ResidentWorkflowQA fills purpose, submits one own pending mocked row, re-renders tracking; failure keeps draft, Cancel adds no row; pending/rejected/ineligible UI cannot open New Request. Backend enforcement not proved |
| Resident request tracking/search/status | M; B | Own payload/status, local no-match/reset, real empty state and read-denial/network-failure retry tested; statuses from fetched rows, not invented success |
| Official document review | M; B; A committed transition | OfficialServices tests search/status/reset, Secretary action menu, Punong read-only processing, details open/close/error; full rowActions/document permission tests pin transitions/handler mapping. No actual backend approval/ready/claimed/decline transaction run |
| Printable document previews | M; X official issuance | Full document suites render existing six prototype templates and gates; watermarks/placeholders mean prototype preview, not issued legal document or verified printer behavior |
| Resident profile/settings/verification status | M; A backend | Resident status gating/password controls; profile dialog information/tabs/link privacy/credit/error/focus tests; official Requests menu/cancel/read-only permissions. Real verification decisions are deliberately not performed |
| Official verify/reject/not-resident/reinstate | M; A security | Authorized UI handlers/confirmations and ordinary-official read-only presentation tested; 068/069 still unapplied, earlier backend verification/INSERT blocker persists |
| Resident complaints/tracking | M; A live | complaintExperience tests own history/empty states, safe tracking, error vs no-match, reference success, evidence partial failure and privacy; no real submission/storage operation |
| Official complaints | M; B; A backend | Reference filters, restricted queue/details, loading/empty/error, no unauthorized intake/private preview, modal Escape/focus/cancel tested |
| Incidents/blotter | M; B; A backend | Queue filters/pagination, no-coordinate note, restricted controls, record dialog and single mocked submission, detail/blotter behavior in incident suites; no real incident/blotter amendments |
| KP screening/cases/hearings/conclusion | M; A backend | Screening/confirmation/case panel/conclusion suites cover intended role UI, errors, hearing/outcome/notice flows and no accidental opening; source SQL checks are static, not runtime PostgreSQL tests |
| Tanod duty/roster/reporting | M; B official layout; A live | Own portal suite/report navigation plus OfficialOperations roster/calendar/list/forms/read-only behavior; no real check-in/out/followup or account-link modification |
| Resident/Official V1 score/gauge/history | M; A live | Gauge numeric validation, server-returned fixture scores,100 start, ledger, policy/unlinked/unconfigured/no-enrollment/error states; no live score calculation certified |
| V1 policy/rule administration | M; B; A writes | Authorized admin state/draft forms and ordinary-official no-admin controls; no rule/policy activation/enrollment change. V1 scoring/model unchanged |
| Official analytics and interpretations | F calculations; M filters/data; B shared chart fixture from Stage8A; A live | Current focused analytics suites rerun filtering, dates, ties/missing/zero, completeness/denied states and interpretation behavior. Stage8A eight-width chart observations retained, not a new full-page live analytics run |
| Document Reports | F helpers; M/B UI; A live | Complete-read requirements, current source totals, distinct account/link concepts, month grouping and interpretation scope tested. Capped/denied/error reads suppress conclusions |
| Public Community Safety | M; Stage8A B chart fixture; A live feed | Public aggregates only, map popup privacy/keyboard fixture, filter and monthly-independent interpretation tests; no live tiles/RPC/marker placement queried |
| Full live browser session and permission enforcement | A | No owner-authorized synthetic hosted test setup; neither important existing project is used for controlled writes. No new account created or existing browser token extracted |
| Resident-specific History/Analytics | X | Intentionally unavailable pending complete authorized identity-linked data; not a broken enabled feature |
| Community Credit V2/disputes/deduction appeals | X | Specification/design only, not active functionality. No fake buttons/workflows enabled |

## Confirmed defect fixed

**Resident document read failure looked like empty history and zero requests.** Reproduction before fix: fail document_requests read (42501/network), finish loading; fetchMyRequests ignored error and retained initial empty array; homepage/Documents could claim no requests and zero counters. This was a frontend state-handling defect, not proof the database had no records.

Minimal fix in `src/dashboards/ResidentDashboard.jsx`:

- Same query/ownership filter/order and submission handler retained.
- Track read error, distinguish permission/session message from generic failure and expose Retry document requests.
- Error state takes precedence over empty/no-match display; homepage counters show Unavailable, not false zero. Loading counters explicitly say Loading.
- Failed read does not overwrite prior request state; retry repeats only the existing read. No new backend dependency, auth permission or business mutation introduced.

Added `src/dashboards/ResidentWorkflowQA.test.jsx`: seven regression/workflow cases covering permission/network failure + recovery, mocked successful own submission/status/search/Cancel, failed submission retaining draft and unverified-state UI denial. Existing settings/password/mobile-toast behavior and all preceding work preserved. Full suite passed after the fix.

## Responsive observations

Fresh states captured from current focused tests:

activity; complaint-restricted; complaints-empty/error/loading/list; credit/draft-dialog/read-only; document-detail/menu/error/read-only/list; incident-form/list; Reports; request-confirmation/list/menu/read-only; resident-document-dialog/list/permission-error/network-error; roster/read-only; schedule-calendar/form/list; settings; tanod-add/manage.

These are **33 fixture names**, each checked at all eight widths. Tables may scroll within their intended wrappers; out-of-table controls and page-level overflow checked separately. Visible dialogs fit and support internal scrolling at the tested height. Not every control touch target/contrast, actual map tile/rendering state, sidebar geometry or viewport height was certified.

Initial browser attempt flagged Resident overflow caused by the **mock test navigation occupying the dashboard flex row**; a screenshot confirmed it was not the positioned real sidebar. Corrected the offline harness by excluding that nonrepresentative mock nav, not by hiding real application content or changing CSS. Kept initial results separately. Final screenshot of the375px Request a Document dialog was visually reviewed. Real sidebar interaction/layout remains component/historical evidence, not certified by this fixture correction.

Local evidence under `supabase-tests/runners-out/` (generated, uncommitted; do not stage):

- `stage9a-focused.log`, `stage9a-full.log`, `stage9a-build.log`, `stage9a-strict.log`.
- `stage9a-browser/results.json` — final264 observations; `results-initial-fixture.json` — superseded harness artifact findings.
- `stage9a-browser/markup/` —33 fresh synthetic captured states.
- `stage9a-browser/resident-document-dialog-375.png`, `documents-375.png`, `requests-menu-375.png`, `incident-form-375.png`, `credit-375.png`, `reports-375.png`, `schedule-form-375.png`, and corresponding1024px screenshots.
- `stage9a-responsive.cjs`, `stage9a-responsive-final.log` — offline runner/results. Static screenshots contain no live authenticated records.

## Remaining actual demonstration risks

| Severity | Finding / next action |
|---|---|
| P1 release | Verification UPDATE/self-INSERT authorization remains the confirmed earlier blocker; 068/069 unexecuted and no approved disposable backend. No deployment recommendation from frontend tests |
| P1 live-demo evidence | Real login/session persistence, write acceptance, notification/directory/V1 side effects and role enforcement have not been verified for this candidate. Do not promise a fully certified live demonstration |
| P1 testing safety | Resident opening Documents can UPDATE resident_viewed_at; notification controls can mark reads; status/availability controls write. “Viewing a dashboard” is not automatically read-only. Do not navigate live synthetic tests through those effects without explicit approval |
| P2 presentation, fixed | Resident request failure previously masqueraded as empty/zero; corrected and regression-tested |
| P2 remaining | Resident profile fetch still does not independently surface a query error as a dedicated profile retry state (source finding; not newly fixed/tested as a defect here). Distinguish unavailable profile from genuinely unverified status in future focused work |
| P2 known prior findings | Official verification zero-affected-row success reporting, registry select('*') privacy/minimization and Tanod name-reset wording remain separately scoped, not fixed by this stage |
| Limitation | Resident request reads still use the existing fetched-row length without a new complete-read contract; no claim all arbitrarily large histories fit the hosted response limit |
| Demo scope | Prototype document templates, unavailable person-linked analytics and V2 proposal must be explicitly labeled; do not present them as official issuance or live implemented policy |

No new critical frontend failure remained in the executed tests/final offline fixtures. That does not prove all untested live states are defect-free. Existing router/React act and intentionally mocked failure diagnostics remain in logs; offline Chrome recorded zero uncaught page errors, not a clean live console certification.

## Defense readiness and next action

**Ready for an honestly labeled offline/component-backed rehearsal of retained interfaces. Not ready to certify authenticated production workflows or deploy.** Use existing synthetic captures/tests for UI explanation, preserve active V1, present security/prototype limits. Any future read-only live session needs legitimate owner-authorized accounts plus mount-effect review; any write demonstration needs separately approved safe fixtures/backend, not real resident records. Production migrations and deployment remain separately prohibited.

Only source fix, new regression test, this report and generated local evidence added in this stage. No hosted access, SQL/migration, Supabase project/config/record change, Docker/PostgreSQL, V2, commit/push/deployment. 068/069 hashes unchanged; package/environment files unchanged. Existing source modifications/checkpoints/private evidence preserved.
