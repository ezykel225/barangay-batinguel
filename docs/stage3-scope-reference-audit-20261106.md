# Stage 3 — frontend reference audit

Date: November 6, 2026. Branch: `defense/scope-cleanup-20261106`. HEAD remains `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.

Stage 1/2 changes, the untracked `PROJECT_HANDOVER.md` and prior diagnostic logs were preserved. No commit, push, merge, deployment, production request, migration or database write was performed. This is Stage 3 only; browser verification remains Stage 4.

## Stage 3 changes

| File | Change |
| --- | --- |
| `src/components/Footer.jsx` | Replace reservation/payment collection and service-approval promises with retained service-request wording. Preserve contact, modal behavior and all data/history. |
| `src/pages/EServices.jsx` | Replace obsolete reservation/Treasurer help text with retained document/complaint assistance. |
| `src/dashboards/OfficialDashboard.jsx` | Two position-permission help paragraphs now describe retained protected services without advertising court reservation approval. Authorization code is unchanged in Stage 3. |
| `src/pages/Officials.jsx` | Remove active Health Department/Nurse card, dedicated availability read and state/renderer. Preserve actual officials, previous-term display, consultation schedules, Kapitan data and shared Manila weekday helper. |
| `src/utils/returnTo.js` | Remove retired reservation/tracking/Health Center return destinations. Preserve strict allowlist/decode behavior, retained services and caller fallbacks. Nurse was already excluded. |
| `src/utils/returnTo.test.js` | Use retained paths for positive cases; add stale, encoded and whitespace-wrapped retired path rejection, including old resident reservation deep links. |
| `src/tanod/tanodAuth.test.js` | Verify resident login with retired `next` paths reaches the retained resident portal without sign-out/loop. Existing Stage 2 Nurse refusal remains covered. |
| `src/publicScopeReferences.test.jsx` | New Footer/E-Services/Officials/historical-label component regressions, including no Nurse availability query. |
| This report | Reference classification, scope and verification evidence. |

Login, signup, Reset Password, Home and public metadata were reviewed. Stage 1/2 already removed their retired-service promotions; no further Stage 3 implementation changes were necessary there. The explicit Nurse-login refusal is intentional handling, not a Nurse Portal entry point. No authentication implementation was replaced or mocked in the application. Jest mocks are test-only.

## Remaining reference classification

A static local-import traversal from `src/App.js` inspected **139 reachable JavaScript/JSX modules**. It inspected literal UI text/strings and imports without evaluating application/database code. It is source evidence, not proof of every runtime rendering or dynamically supplied record. A separate text search covered retired terms throughout the relevant frontend surfaces.

| Category | Files/examples | Disposition |
| --- | --- | --- |
| Intentionally preserved historical reference | `utils/notificationLabels.js`, `displayLabels.js`, `activityLog.js`; reservation status/type/audit labels and notification subjects | Preserve meaningful old notification text, timestamps and audit entity rendering. These labels do not make a reservation workflow active. |
| Intentionally preserved legacy reference metadata | Official account-verification voter matches and warnings; complaint `PartyLink`/walk-in wording; `residentGroups.js` | Preserve existing RPC/reference contracts and warnings that voter-list absence is never proof of nonresidency. No Voter Reference List management interface is restored. |
| Explicit retirement handling | Four retired routes in `App.js`; Nurse refusal in Login; `dashboardNavigation.js` retired-tab recognition | Preserve unavailable-service page and safe dashboard fallback. These are not active service links. |
| Unmounted legacy source | `Reservation.jsx`, `TrackReservation.jsx`, `HealthCenter.jsx`, `MedicalProgramsPublic.jsx`, `NurseDashboard.jsx`, their dedicated styles/tests and medicine constants/filtering | Preserved as requested. The active App no longer imports/mounts the retired page/dashboard components. Unit tests can still exercise legacy components directly. |
| Shared dependency | `clinicHours.js` used by `eventCalendar.js`, `officialAvailability.js`, `Officials.jsx`; `reservationTracking.js` used by `TrackComplaint.jsx`; `homeSections.js` used by Announcements/Home | Files and exports untouched. Keep their shared format/date/tracking/excerpt behavior. A clinic/reservation name in an import is not a retired workflow. |
| Shared compatibility | `SmsComposer.jsx` retains medical-source branches; barangay constants retain Nurse labels; existing audit vocabularies retain retired types | No active health publishing screen was found in the reachable application. Preserve SMS/API vocabulary and legacy callers without changing backend contracts. |
| Historical developer commentary | Comments describing former reservation, Nurse or waste screens in retained files | Non-rendered implementation history, not a user-facing promotion. Not mass-deleted as part of this bounded cleanup. |
| Remaining active issue | None found advertising or linking to retired workflows in the audited active frontend after this patch | Requires Stage 4 browser confirmation; static analysis cannot certify all dynamic content or third-party/data-driven links. |

`Footer`, E-Services and Officials were the confirmed remaining active issues and are fixed by this stage. Official verification still reads `residents_registry` as before, while its management UI stays removed. This is a preserved dependency, not a reintroduced module.

## Validation

Focused run: **324 tests / 12 suites passed**, covering Stage 3 components, strict return-path security, resident stale-next login, retained public routes, Nurse retirement handling, historical labels and shared event/official/tracking/excerpt helpers.

Production build: **compiled successfully** with `CI=true`, loopback placeholder URL and nonsecret placeholder client key. No production credentials/requests were used. Build verifies retained imports resolve; runtime RLS/API functionality still needs the existing independent verification process.

Full Jest: **2,461 tests / 101 suites passed**. Final `git diff --check`: **passed**. These results were executed for this stage, not inferred from the previous stage. Test warnings from React act/Router future flags remain; no failed suites. No browser checks were run in this stage.

Generated evidence remains untracked under `supabase-tests/runners-out/stage3-*`; existing diagnostics were not overwritten. The handover SHA256 remains `0BEAEA94879CB7705270B35694A098BBF8111A7F8781B2A28CCE3339BB78C27B`.

## Release limits and next gate

- Frontend retirement does not revoke existing Supabase tokens/roles, table grants, RPCs or historical data. Backend retirement/privacy work remains a separate authorized task; none is claimed active here.
- Retained document, complaint/KP, resident verification, V1 credit, incident, Tanod, map, SMS, Reports and audit behavior must be browser-checked against isolated synthetic data before release. Do not use production records for write tests.
- Old routes intentionally show unavailable-service content. Existing users with historical reservations must use Barangay Hall assistance; records have not been erased or migrated.
- No new feature, framework/dependency/configuration change, V2 activation or database fallback was added.

Stage 4 can begin after explicit approval if final tests pass, using the existing isolated synthetic environment and real-browser checks. Nothing in this report authorizes committing, pushing or deploying the accumulated cleanup.
