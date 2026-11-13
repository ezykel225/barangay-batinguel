# Stage 14B — Owner-controlled authenticated browser verification

Date: November 12, 2026  
Candidate: `release/candidate-20261112` at `d869b3cc6c9975982adf52b45279774076d2f37f`  
Verified origin: `http://localhost:3014`  
Supabase project reference: `mpcyqwasurhtdztzobwg`

## Safety and method

The candidate working tree was clean before testing. The environment contained the public anon-key variable and no service-role variable. The in-app browser host was unavailable, so the previously approved installed local Playwright fallback opened a separate fresh Chrome context for each role. Each session asserted the exact localhost origin before and after the owner-controlled login.

The owner entered every credential directly into the visible browser. No password, OTP, recovery code, token, cookie, Authorization header, session-storage value or resident record was requested, printed, saved, screenshotted or added to this report. Auth login necessarily created normal hosted Auth traffic/audit activity; this was not represented as zero hosted activity.

After login, the harness allowed localhost traffic, ordinary read requests and an exact allowlist of reviewed read-only Supabase RPCs. Supabase transports these `STABLE`/reader functions using HTTP POST. All mutation RPC names remained absent and would have been aborted. Navigation never clicked action menus, row actions, notification items, exports, form submissions or settings controls.

Sanitized structural evidence is stored outside the candidate at:

- `supabase-tests/runners-out/stage14b-authenticated-browser/resident.json`
- `supabase-tests/runners-out/stage14b-authenticated-browser/official.json`
- `supabase-tests/runners-out/stage14b-authenticated-browser/tanod.json`

No authenticated screenshots were captured because the dashboards contain private resident/account information.

## Login results

| Role | Result | Evidence |
|---|---|---|
| Resident | PASS on final isolated context | Final URL was exactly local `/resident`. An earlier owner attempt remained at `/login` and was not counted as a pass. |
| Official | PASS on final isolated context | Final URL was exactly local `/official`. The first run was discarded for data-workflow conclusions because the initial safety interceptor blocked read-only RPC POST transport. |
| Tanod | PASS | Final URL was exactly local `/tanod`. |

## Resident read-only workflow matrix

| Workflow | Result | Observation |
|---|---|---|
| Resident dashboard | PASS | Dashboard navigation succeeded, main content was visible and no generic load error or horizontal overflow appeared. |
| Profile/settings page | PASS (structural) | Settings navigation succeeded at desktop and remained inside `/resident`; no save/edit control was used. |
| Exact verification-status display | BLOCKED | Settings rendered without a generic error, but the harness did not positively identify the exact `ID Verification` label/status value. No private value was captured. |
| Existing document request/history view | PASS (structural) | Document Requests opened without a generic load error. No request was created, canceled or changed; individual history rows were not recorded. |
| Existing tracking/status details | BLOCKED | No existing row/detail was opened because that could expose personal request data in evidence. |
| Community Credit V1 page | PASS (structural) | Community Credit opened through the reviewed `my_community_credit_profile` reader without a generic load error. |
| Exact score, gauge and ledger contents | BLOCKED | Values were deliberately not captured. Presence and correctness of particular ledger entries were not asserted. |
| Existing notifications | BLOCKED | Notification items were not opened to avoid changing read state; unread/read behavior was not inferred. |
| Role navigation | PASS | Resident-only navigation checks remained in `/resident`. Requests for `/official` and `/tanod` redirected back to `/resident`. |
| Mobile 375×812 | PASS | Main content visible; menu opened, Escape closed it and restored focus; no horizontal overflow. |
| Desktop 1024×900 | PASS | Four requested read-only views rendered without horizontal overflow or generic load errors. |

## Official read-only workflow matrix

| Workflow | Result | Observation |
|---|---|---|
| Official dashboard | PASS | Dashboard rendered with no generic load error. |
| Resident directory | PASS (structural) | Residents view loaded through the reviewed directory reader without a generic load error. No row details or personal fields were recorded. |
| Resident verification-status display | BLOCKED | No resident row/action menu was opened. Authorization to decide verification was not inferred from navigation. |
| Document-processing queue | PASS (structural) | Document Requests view rendered without a generic load error. No approve, decline, ready, claim or other action was used. |
| Reports/document statistics | PASS (structural) | Reports view rendered without a generic load error. No export was triggered and no statistic values were copied. |
| Safety map and analytics | PASS | View rendered through reviewed read-only incident/coverage RPCs with no application or HTTP error. Map-tile cancellations occurred only after navigating away. |
| Community Credit V1 management view | PASS (structural) | The read-only administration state loaded without a generic error. No score, policy, rule or enrollment action was used. |
| Verification controls restricted to Secretary/Punong | BLOCKED | UI presence and backend authorization were not tested against multiple official positions. This needs separately approved JWT-backed role testing. |
| Role navigation | PASS | Official navigation remained in `/official`; `/resident` and `/tanod` redirected back to `/official`. |
| Mobile 375×812 | PASS | Main content visible; menu opened, Escape closed it and restored focus; no horizontal overflow. |
| Desktop 1024×900 | PASS | Six requested read-only views rendered without horizontal overflow or generic load errors. |

## Tanod read-only workflow matrix

| Workflow | Result | Observation |
|---|---|---|
| Tanod dashboard/overview | PASS | Overview rendered without a generic load error. |
| Duty information | PASS (structural) | My Duty opened through reviewed Tanod readers; no check-in or check-out action was used. |
| Existing incident/report view | PASS (structural) | My Reports rendered without a generic load error. No report or follow-up was created or changed. |
| Safety map/analytics | BLOCKED | The tested Tanod navigation did not expose a Safety Map & Analytics destination. No Official-only reader was invoked from the Tanod context. |
| Settings | PASS (structural) | Settings rendered; no profile, photo or password control was used. |
| Role navigation | PASS | Tanod navigation remained in `/tanod`; `/resident` and `/official` redirected back to `/tanod`. |
| Mobile 375×812 | PASS | Main content visible; menu opened, Escape closed it and restored focus; no horizontal overflow. |
| Desktop 1024×900 | PASS | Four read-only views rendered without horizontal overflow or generic load errors. |

## Console and network summary

| Role | Console observations | Failed requests | HTTP ≥400 | Blocked mutation requests |
|---|---:|---:|---:|---:|
| Resident | 1 earlier login timeout message | 0 | 0 | 0 |
| Official | 0 | 13 canceled OpenStreetMap tile GETs after navigation | 0 | 0 |
| Tanod | 6 messages from two transient login-time Auth DNS failures | 2 login-time Auth token requests | 0 | 0 |

The final Resident, Official and Tanod sessions authenticated successfully despite the earlier login-attempt errors. Official map tiles were `net::ERR_ABORTED` because the test navigated away; no map application error was shown. Endpoint evidence contains no query strings, request bodies, tokens or identifiers.

## Security observations and limitations

- PASS: signed-in cross-role UI routes redirected each role back to its own portal.
- PASS: each tested role received its expected navigation structure at desktop/mobile.
- PASS: no mutation RPC was invoked or blocked during the final role runs.
- BLOCKED: UI route protection does not prove Supabase RLS, policy predicates or function authorization.
- BLOCKED: resident attempts to change protected profile/verification fields were not performed.
- BLOCKED: ordinary Official/Tanod attempts to invoke verification or management operations were not performed.
- BLOCKED: Secretary/Punong positive verification authority was not tested.
- BLOCKED: notifications were not opened, so unchanged read-state was preserved but notification display was not verified.
- BLOCKED: write-dependent workflows including document submission/processing, resident verification decisions, incident creation/resolution, Community Credit adjustments, uploads, exports and password/profile changes.

## Demonstrated defects

- **P0:** none demonstrated by these read-only browser checks.
- **P1:** none conclusively demonstrated. The transient Auth DNS/timeout failures should be monitored during the next controlled run; all three final sessions succeeded.
- **P2:** none demonstrated in the authenticated responsive layouts checked here.

## Exact next recommended action

Prepare a separate owner-approved JWT-backed authorization test window after migrations 068 and 069 are safely applied. Use pre-approved existing actors and controlled non-personal targets to prove denial for Resident/Tanod/ordinary Official protected-field changes and positive verification authority only for linked active Secretary/Punong accounts. Until then, backend authorization remains BLOCKED even though authenticated UI navigation passed.

Do not proceed from this report directly to migrations or deployment; those remain separate owner-controlled operations.
