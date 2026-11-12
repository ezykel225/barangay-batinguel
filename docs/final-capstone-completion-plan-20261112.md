# Barangay Batinguel — final capstone completion plan

Prepared November 12, 2026 for branch `defense/scope-cleanup-20261106`, Supabase project `mpcyqwasurhtdztzobwg`, normal production commit `c1cc57f`, and accepted maintenance Preview commit `0451e38`. This plan uses current implementation and Stage 9A/10A evidence only. It authorizes no hosted change, SQL, commit, push or deployment.

## Executive decision

The retained application is substantially implemented and locally test-backed. The latest supplied Phase 1 result is **2,672 Jest tests passing**, with normal and strict production builds passing; the preceding Stage 9A evidence recorded 2,668 tests/123 suites, 1,008 focused tests/39 suites, both builds and `git diff --check` passing. Phase 1 added four focused regressions and fixed the three previously confirmed frontend issues: verification/rejection now require exactly one returned target row, resident profile read errors have an accessible retry state without erasing prior data, and the voter-reference registry query is field-minimized.

There is no remaining confirmed P0/P1 frontend defect in the reviewed evidence. The primary confirmed security defect is in production database authorization: the overbroad profile UPDATE path and insufficiently constrained self-INSERT remain until exact migrations **068 then 069** are applied. The other major gap is evidence, not necessarily code: the current candidate has not completed authenticated Resident, Official and Tanod browser verification against production after those fixes.

Defense-critical completion is realistic in **20–34 hands-on hours across 3–5 focused days**, plus owner/availability delays and any live-regression contingency. A full backup restoration rehearsal and Community Credit V2 are not realistic prerequisites for the November 16/18 defense under the current no-Docker/no-new-project constraints. The owner must either explicitly accept the documented restore limitation for the narrow migrations or retain NO-GO. V2 stays visibly specification-only; Community Credit V1 remains the demonstrated system.

## Completed and locally passing

- Public scope, navigation, authentication guards and role-specific Resident/Official/Tanod shells.
- Resident dashboard/profile/settings, request submission/tracking, complaints and V1 credit presentation, including explicit request/profile read-error recovery.
- Official Residents/Voter Reference, single-row verification UI behavior, documents, complaints, incidents/blotter, KP, reports/analytics, Community Safety/map and Tanod operations interfaces.
- Tanod portal, profile/settings, duty, schedules, reports/follow-ups and source-level role restrictions.
- Community Credit V1 score/gauge/history and guarded administration; existing records and ledger remain preserved.
- Responsive component/offline fixtures across 33 states and eight widths; charts, maps, empty/loading/denied/error states have broad local coverage.
- Maintenance Preview branch builds successfully as a standalone static deployment; promotion has not occurred.
- Two byte-identical private database archives verified at 921,123 bytes and SHA-256 `746856261D8470176C8AC3EA2066C0EF668619A652839919E5FCEDE858DDCF3D`; archive TOC is readable, but restoration is untested.

## Actual incompleteness versus unverified behavior

### Confirmed defects or incomplete scope

- **P0:** production verification UPDATE and self-profile INSERT authorization remain insecure until 068/069.
- **P2:** Tanod name/form-reset wording is a known presentation follow-up; reproduce before changing it.
- Resident request history has no newly proven complete-read/pagination contract for arbitrarily large histories. Treat displayed totals as accessible rows unless a real limit is observed.
- Printable documents are prototypes, not legally certified issued documents or printer-tested originals.
- Resident-specific linked History/Analytics is intentionally unavailable pending authoritative identity-linked data.
- Community Credit V2, disputes/deduction appeals and activation governance are specification-only and excluded from defense-critical implementation.

### Missing authenticated verification, not established code defects

- Real login, refresh/session persistence and logout for Resident, Secretary/Punong/ordinary Official and Tanod on the release candidate.
- Real RLS enforcement and cross-role denial after 068/069.
- Approved verification/rejection/resubmission side effects: exactly one profile, server actor/time, notification, directory, audit and unchanged V1 history.
- Real document, complaint, incident/KP and Tanod read/write transitions; existing tests are primarily mocked/component evidence.
- Live map tiles/markers, analytics completeness, Storage upload/download and mobile browser behavior.
- Hosted maintenance content/headers behind Vercel Authentication; the Preview built, but authenticated manual route acceptance remains required.

## Ordered completion table

| Order | Remaining task | Priority | Dependencies | Estimate | Definition of done | Production approval required? |
|---:|---|---|---|---:|---|---|
| 1 | Freeze a clean local release candidate and manifest the intended dirty-worktree changes | P0 | Current branch and preserved user changes | 2–4 h | Exact intended source/tests/docs listed; generated logs/private artifacts excluded; no unrelated or maintenance-overlay files enter the app candidate | No, while local only; commit/push later requires approval |
| 2 | Re-run release gates on the frozen candidate | P0 | Task 1 | 1.5–2.5 h | Phase 1 focused tests, full Jest, normal build, strict `CI=true` build and `git diff --check` pass; failures are triaged before any hosted work | No |
| 3 | Complete only confirmed local UI defects | P2 | Task 2; reproduce Tanod wording/reset issue | 1–2 h | Tanod form/reset language is unambiguous and regression-tested, or documented as not reproducible; no redesign. Re-run affected suites/build | No |
| 4 | Prepare role-based authenticated test script and approved actors/targets | P0/P1 | Existing Phase 6 matrix; owner identifies accounts and genuine targets | 1–2 h | Each navigation/write side effect is labeled; Resident, Secretary, Punong/ordinary Official and Tanod accounts named privately; every production write has target, expected result and cleanup/reconciliation rule | Approval needed for accounts and every write attempt |
| 5 | Resolve recovery/maintenance GO gate | P0 | Two verified copies; Phase 11A report; accepted Preview | 0.5–1 h owner work | Owner accepts untested-restore limitation or supplies a compliant rehearsal; names operator/window/incident owner; approves fresh backup, maintenance promotion, exact 068→069 and resumption criteria | Yes |
| 6 | Authenticated maintenance Preview acceptance | P0 | Vercel owner session; commit `0451e38` | 0.5–1 h | `/`, `/index.html`, role routes, asset-looking and missing paths all show only maintenance; expected headers present; no React/Supabase requests; Production still normal | Read-only Preview test no DB approval; promotion separately requires approval |
| 7 | Fresh maintenance-window backup and invariant baseline | P0 | Task 5; approved window | 0.5–1 h | Fresh private archive/readability/hash/second copy verified; profile/status, directory, notification, audit and V1 counts/invariants captured without personal-data export | Yes |
| 8 | Promote maintenance and prove rollback safety | P0 | Tasks 5–7 | 0.5 h | Production domain shows maintenance; staff sessions closed/writes paused; Hobby Instant Rollback immediately offers `c1cc57f`. Stop before SQL if not | Yes |
| 9 | Final corrected read-only preflight | P0 | Task 8 | 0.5 h | Intended project confirmed; five trigger mappings/enabled states, functions, defaults and policy inventory match reviewed evidence; no unexplained drift | Yes, hosted read-only execution |
| 10 | Apply 068, verify, then apply 069 and verify | P0 | Task 9; exact hashes and operator approval | 1–2 h | Exact unchanged 068 commits once and targeted post-check passes; exact unchanged 069 commits once and its post-check passes; any error invokes stop/forward-repair procedure | **Yes — explicit migration approval** |
| 11 | JWT-backed security validation | P0 | Task 10; approved accounts/targets | 2–4 h | Residents/Tanod/ordinary officials cannot change protected fields; linked active Secretary/Punong authority works on approved genuine cases; exactly-one-row and all side effects/invariants independently observed. Unavailable cases recorded, not invented | Yes; every write/denial attempt explicitly approved |
| 12 | Authenticated core workflow browser pass | P1 | Tasks 10–11; release candidate available | 3–5 h | Resident, Official and Tanod matrix below passes on desktop and one phone width; session/route/privacy/error behavior confirmed; live defects logged with reproduction | Read-only navigation may still write notification/view markers; owner approval required |
| 13 | Fix only confirmed release-blocking live regressions and rerun gates | P0/P1 contingency | Task 12 findings | 2–6 h | Each observed P0/P1 failure gets smallest local fix plus regression test; full tests/builds pass. No speculative feature work | Local fixes no; later commit/push/deploy yes |
| 14 | Review and publish the application release candidate | P1 | Tasks 1–13 | 3–5 h | Exact small release diff reviewed; secrets/backups/logs excluded; approved commit pushed; Vercel Preview passes smoke/responsive checks; owner approves Production deployment | Yes for commit/push/deployment |
| 15 | Production deployment and smoke verification | P0/P1 | Task 14; database checks pass; rollback plan | 1–2 h | Intended deployment becomes Current; Resident/Official/Tanod login and representative reads pass; no console-breaking errors; Supabase target correct; prior deployment remains recoverable | Yes |
| 16 | Defense rehearsal, evidence pack and fallback | P2 | Stable Production | 3–4 h | Timed script rehearsed twice; accounts/data ready; screenshots/video/local build fallback available; limitations stated accurately; no dependence on creating records during defense | Read-only rehearsal approval; any demo writes separately approved |

Tasks 1–4 and the local parts of 13 and 16 can be completed safely before production maintenance. Tasks 5–12 and 14–15 cross owner/hosted boundaries.

## Minimum UI work by role

Do not redesign dashboards. Run one authenticated responsive pass and fix only demonstrated blockers.

- **Resident:** login/session, dashboard counters, profile error/retry, verification status/resubmission, existing document tracking, complaint tracking, V1 score/history, settings/password, 375 px navigation/dialogs. Confirm errors never masquerade as empty/zero.
- **Official:** role-specific menu, Residents/Voter Reference, exactly-one-row verification outcome, document/request/complaint/incident/KP flows, reports/analytics/map, Tanod operations and V1 administration. Confirm ordinary officials remain read-only where required.
- **Tanod:** login/session, own profile, assignments/duty state, incident/report/follow-up scope, settings and phone layout. Reproduce and correct only the known name/form-reset wording issue; do not expand authority.

Charts and maps need a live loading/empty/error/one-real-result smoke check, not new visual features. Accessibility minimum: keyboard navigation, visible focus, dialog Escape/focus return, labeled controls and no page-level phone overflow on the demonstrated routes.

## Production prerequisites and stop conditions

Required before application release: explicit recovery-risk decision; fresh verified backup; tested maintenance Preview; staff write pause; `c1cc57f` rollback eligibility; clean preflight; exact 068/069 approval; approved JWT test actors/targets; preservation invariants; clean release diff; passing tests/builds; Vercel/Supabase target confirmation; deployment and resumption approvals.

Stop immediately for wrong project/hash, unexpected catalog drift, unavailable rollback target, maintenance leakage, migration error/timeout/uncertain transaction, unauthorized verification success, legitimate role lockout, unexpected record/V1 change, or a failed release gate. Do not restore the known insecure policies automatically; keep containment and prepare a narrow reviewed forward repair.

## Defense demonstration checklist

### Before the session

- Confirm Production URL, deployment ID and Supabase project; sign in privately to pre-approved Resident, Official and Tanod accounts without exposing credentials.
- Use existing representative records; pre-open no page known to mutate unless approved. Confirm network, projector, phone/desktop viewport and backup internet.
- Keep a local production build, selected screenshots and short screen recording as fallback. Preserve the maintenance/rollback runbook offline.
- Clearly label V1 as implemented; V2 as proposal only; printable forms as prototypes; unavailable resident-linked analytics as intentionally gated.

### Suggested 12–15 minute flow

1. **Public (1–2 min):** Home, services, officials, announcements and privacy-shaped Community Safety/map.
2. **Resident (3 min):** login, verified/unverified status, existing requests and complaint tracking, profile/settings and Community Credit V1 score/history. Avoid creating data unless the demonstration write is approved.
3. **Official (5–6 min):** role-aware dashboard, Residents/Voter Reference, one genuine approved verification decision if available, document/complaint/incident/KP views, reports/analytics/map, Tanod operations and V1 administration. Explain server-side authority and exactly-one-row confirmation.
4. **Tanod (2 min):** own assignment/duty/report scope and inability to access Official/Resident private administration.
5. **Security/evidence (1–2 min):** explain RLS/068/069, denied-role tests, immutable V1 preservation, passing Jest/build evidence, backups and rollback. Do not perform destructive denial probes live merely for spectacle.

### Final pass criteria

- No credentials or private resident details projected unnecessarily.
- No feature is described as live if it is prototype/specification-only.
- Every demonstrated write has prior approval and an intended real business outcome.
- A failed live dependency switches immediately to prepared screenshots/local evidence; do not debug production in front of the panel.

## First task to perform immediately

**Start Task 1: freeze the clean local release candidate.** The working tree contains a large set of intended application changes plus generated diagnostics and operational files, while Production is older. Before changing another feature, create an exact release manifest that separates app source/tests/docs from runner output, backups and maintenance-only artifacts. Then Task 2 reruns the 2,672-test/build gates against that frozen candidate. This is the safest local action, unlocks reliable authenticated testing/deployment, and prevents accidental omission or publication of unrelated/private material.

## Brief summary

- **Completed:** retained Resident/Official/Tanod interfaces, public scope, core service modules, analytics/maps, Community Credit V1, Phase 1 frontend security/error/minimization fixes, 2,672-test and build evidence, maintenance Preview and two verified backup copies.
- **Actual blockers:** unapplied 068/069; unaccepted untested-restore risk; no final authenticated role/workflow verification; no clean reviewed release candidate; no approved production deployment.
- **Remaining work:** approximately **20–34 hands-on hours**, plus owner approvals and up to 2–6 hours contingency for confirmed live defects.
- **First actionable task:** freeze and validate the clean local release candidate; do not begin V2 or broad UI redesign.
