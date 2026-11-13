# Stage 14A — Public and signed-out browser verification

Date: November 12, 2026  
Frozen candidate: `release/candidate-20261112` at `12caa37d997610e8426bdec2e331e8e1d9f1e814`  
Test origin: `http://localhost:3014`

## Method and safety boundary

The fresh in-app browser host was unavailable, so no interaction was attempted through that path. The permitted fallback used the already-installed local `playwright-core` package and installed Chrome in a fresh headless browser context. Every navigation independently asserted that `new URL(page.url()).origin` was exactly `http://localhost:3014`; an origin mismatch would have aborted the run.

The browser interceptor allowed localhost resources and external `GET`, `HEAD`, and `OPTIONS` requests only. It aborted any external non-read request. The run recorded **zero attempted non-read requests**. No login, form submission, account creation, SQL, migration, hosted write, configuration change, commit, push, or deployment occurred.

Evidence is stored under `supabase-tests/runners-out/stage14a-public-browser/` in the source workspace, outside the frozen candidate. Machine-readable evidence: `results.json`. Screenshots use `<route>-1024.png` and `<route>-375.png`; 25 PNG files were captured, including the open mobile menu.

## Route matrix

| Route/check | 1024 × 900 | 375 × 812 | Evidence and result |
|---|---|---|---|
| `/` homepage | PASS | PASS | Correct heading, public E-Services, community safety, announcements/events sections and footer. `home-1024.png`, `home-375.png` |
| `/announcements` | PASS | PASS | Announcement cards rendered from the authorized public read surface. `announcements-1024.png`, `announcements-375.png` |
| `/events` | PASS | PASS | Calendar rendered and remained usable without horizontal overflow. `events-1024.png`, `events-375.png` |
| `/e-services` | PASS | PASS | Guest/resident service grouping and access descriptions rendered. `e-services-1024.png`, `e-services-375.png` |
| `/login` Resident view | PASS | PASS | Resident tab and exact “Sign in” heading visible. No credentials entered. `login-1024.png`, `login-375.png` |
| `/login` Barangay Personnel view | PASS | PASS | Personnel tab activated and exact “Personnel sign in” heading appeared, then Resident view was restored. This is the signed-out entry for Official and Tanod accounts. |
| `/reservation` retired service | PASS (functional) | PASS (functional) | Correct unavailable heading/message/link. `reservation-retired-1024.png`, `reservation-retired-375.png` |
| `/track-reservation` retired service | PASS (functional) | PASS (functional) | Correct unavailable heading/message/link. `track-reservation-retired-1024.png`, `track-reservation-retired-375.png` |
| `/health-center` retired service | PASS (functional) | PASS (functional) | Correct unavailable heading/message/link. `health-center-retired-1024.png`, `health-center-retired-375.png` |
| `/nurse` retired service | PASS (functional) | PASS (functional) | Correct unavailable heading/message/link. `nurse-retired-1024.png`, `nurse-retired-375.png` |
| `/resident` while signed out | PASS | PASS | Redirected to local `/login`; dashboard content was not exposed. `resident-signed-out-1024.png`, `resident-signed-out-375.png` |
| `/official` while signed out | PASS | PASS | Redirected to local `/login`; dashboard content was not exposed. `official-signed-out-1024.png`, `official-signed-out-375.png` |
| `/tanod` while signed out | PASS | PASS | Redirected to local `/login`; dashboard content was not exposed. `tanod-signed-out-1024.png`, `tanod-signed-out-375.png` |
| Desktop navigation | PASS | N/A | Primary navigation visible; mobile menu toggle hidden. |
| Mobile menu open | N/A | PASS | Toggle was visible and changed `aria-expanded` to `true`. `mobile-menu-open-375.png` |
| Mobile menu Escape behavior | N/A | PASS | Escape closed the menu, restored `aria-expanded=false`, and returned focus to the menu trigger. |
| Horizontal responsiveness | PASS | PASS | No tested route had document-level horizontal overflow. |

The protected-route redirects intentionally end at `/login` without a `next` query parameter. Route protection passed; return-to preservation was not claimed or required by this check.

## Browser and network evidence

| Signal | Result |
|---|---:|
| JavaScript console errors | 0 |
| Uncaught page errors | 0 |
| Failed requests | 0 |
| HTTP responses ≥ 400 | 0 |
| Attempted external non-read requests | 0 |
| Origin mismatches | 0 |

The 1024 px homepage screenshot caught the announcement/event sections during their normal loading state; the dedicated announcement and event routes completed and rendered records, and the 375 px homepage later displayed the same public data. No console, request, or HTTP error accompanied the transient loading state.

## Demonstrated defects

### P2 — retired-service pages are visually unstyled

All four retired-service routes correctly prevent access to retired functionality, but `UnavailableService` renders only a bare `<main>` with browser-default typography. It has no normal Navbar, Footer, page container or responsive presentation. This is visible at both widths in every `*-retired-*.png` screenshot.

Definition of done for a later approved fix: wrap the existing unavailable message in the normal public-page shell and add minimal responsive styling without restoring any retired route, query, form, or database dependency.

## Priority summary

- **P0:** none demonstrated by public/signed-out browser verification.
- **P1:** none demonstrated by public/signed-out browser verification.
- **P2:** style the shared retired-service unavailable page consistently with the public site.
- **Blocked:** authenticated Resident, Official and Tanod workflows remain outside Stage 14A and require privately approved existing accounts. No authenticated result is inferred from this report.

## Conclusion

Public pages, signed-out route protection, login audience switching, desktop navigation, mobile navigation/Escape focus restoration and both requested viewport widths passed. The only demonstrated defect is the P2 visual inconsistency on retired-service unavailable routes. The frozen candidate itself was not modified.
