# Stage 7D — Official Residents information restoration

Branch `defense/scope-cleanup-20261106`; HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08` unchanged. All earlier scope, credit-gauge and analytics work remains uncommitted and preserved.

## History and current differences

Reviewed the current ResidentsWorkspace, ResidentDirectory, presentation/data helpers, account-review section in OfficialDashboard, profile modal, styles/tests, local branches/reflog history, and resident-related commits including `e6b64a2`, `df1f4eb` and `aea275c`. The latest compatible preserved workspace had two views (Barangay Residents and Account Verification), a five-column table and a three-dot directory menu. The form still used free-text Purok. No complete historical Batinguel Residents / Non-Residents / Requests implementation was found by local-history string searches; the three-view arrangement here composes existing supported directory/account groups rather than claiming such a version was recovered verbatim.

## Restored architecture and classification limits

- **Batinguel Residents:** authoritative directory, initially filtered to stored `resident_status='active'`. All-status/inactive filters retain access to historical directory records. Inactive is not relabeled as non-resident.
- **Non-Residents:** only online accounts explicitly stored as `verification_status='ineligible'`, using the existing `notResidents` group. This is not a complete list of every non-resident person or every inactive directory row.
- **Requests:** existing account-review group: pending review, rejected/return-for-correction and unknown verification states. Verified accounts and explicit ineligible decisions do not enter Requests. An unlinked directory record is never made a request merely because it lacks an account.
- The workspace buttons select the existing parent account group directly. Removed the duplicate internal account-group selector; filters and loaded directory data stay mounted/preserved across switches.
- Directory/account eligibility disagreements are displayed for review, not automatically reconciled or reclassified.

A complete non-resident classification for unlinked inactive directory records cannot be established from these fields. That portion remains a data-model/provenance limitation; no reason or classification is invented. The UI explains the distinction.

## Table, forms and existing actions

- Compact five-column directory retains name/profile opener, Purok, stored active/inactive status, explicit online linkage/verification and the existing three-dot action menu.
- Numeric Purok table labels use existing `purokShortLabel`; raw values remain in the cell title. Unrecognized place labels are preserved instead of reduced to guessed numbers.
- Action column reduced from 180px to 64px, compact cell padding retained with wrapping and existing mobile stacked-card layout.
- Explicit linkage and account verification are separate indicators. If the read-only source supplies only `account_linked`, verification reads unavailable rather than being inferred. The unavailable mobile-number summary is omitted for the narrower read-only reader. Linked summary counts respect either explicit profile ID or the reader's explicit linked boolean.
- Directory form now uses the existing `PUROKS` constant, with blank and current legacy-value options. Opening/canceling does not rewrite stored values. The constants' geographic completeness remains unconfirmed; this work adds no new Purok values or claims.
- Existing profile modal fields/history were not changed. Form edit/eligibility actions are supplied only for authorized frontend managers; unspecified management permission now fails closed.

### Precise action meanings — handlers unchanged

| Existing action | Existing behavior |
|---|---|
| Verify (the existing confirm/accept-account action) | Sets account verification to verified through the existing profile update path; migration 055 may synchronize a newly verified directory record. It is not merely account linkage. |
| Reject | Stores rejected verification with its existing reason workflow; resubmission is possible. It does not mean Not a Resident. |
| Not a Resident account decision | Existing ineligible-account workflow; not inferred from a missing link or missing voter reference. |
| Directory Mark as Not Resident | Existing `set_barangay_resident_eligibility(..., false)`: directory inactive and any linked account ineligible, with existing audit behavior. |
| Directory Reactivate / linked account reinstatement | Existing eligibility RPC with true sets active and linked verification verified; the existing confirmation describes the coupling. |

No new Accept/Resident endpoint, status transition, account-linking algorithm or decision handler was added. Existing labels/confirmations and backend side effects remain deliberate operations; none were executed on live records.

## Backend compatibility and authorization findings

No backend configuration, database objects, RLS, Auth, migrations or records changed. Existing readers/mutation contracts remain:

- `barangay_resident_directory` (054), existing create/edit `save_barangay_resident` (054/056).
- `community_credit_resident_directory` (059), the existing narrower reader for other active officials.
- `set_barangay_resident_eligibility` (056).
- Existing profile verification updates, account status grouping and synchronization (007/055).

The repository definition of `current_official_may_administer_records` (044) is Secretary or Punong Barangay; 054/056 use that helper for directory editing/eligibility. The frontend continues passing exactly those management flags. Other officials have view-only directory actions; Requests/Non-Residents decision buttons now follow the same frontend matrix.

**Release blocker:** repository account-verification evidence is broader than the requested matrix. Migration 007's verification guard permits officials generally, and migration 036 documents the resident-profile update policy using `is_official(auth.uid())`, not Secretary/Punong position. No effective cloud-policy catalog inspection or mutation probe was performed. Frontend controls do not prove backend enforcement. Do not certify the complete role matrix until effective cloud policies/triggers are reviewed read-only and any necessary backend correction is separately authorized. No permission migration was attempted.

Existing legacy account-verification reference metadata remains; the retired Voter Reference List/Cross-check tabs were not restored.

## Exact files changed this stage

- `src/dashboards/OfficialDashboard.jsx` — Residents workspace/group wiring and resident decision-control gating only.
- `src/residents/ResidentsWorkspace.jsx`
- `src/residents/ResidentDirectory.jsx`
- `src/residents/ResidentDirectory.css`
- `src/residents/residentPresentation.js`
- `src/residents/ResidentsWorkspace.test.js`
- `src/residents/officialResidentsViews.test.js`
- `src/residents/residentDirectory.test.js`
- `src/residents/residentEligibility.test.js` — explicit manager context in existing tests.
- `src/residents/ResidentProfileDialog.test.js` — explicit manager context in existing tests; modal implementation unchanged.
- This report. Generated Stage 7D scripts/logs remain untracked under `supabase-tests/runners-out/`.

Resident Dashboard, credit scoring/gauge, analytics, IncidentMap, Tanod Portal, dependencies and environment files were not edited in this stage.

## Validation and evidence

- Focused Residents validation: **60 passed / 7 suites**.
- Final full suite: **2,530 passed / 107 suites** (130.01 seconds). Final focused tests and production build also passed; logs are `stage7d-full-accepted.log`, `stage7d-focused-accepted.log`, `stage7d-build-accepted.log`.
- Production build passed; `git diff --check` passed (line-ending advisories only).
- The initial ordinary-official regression caught a misplaced permission wrapper in a different table. That wrapper was removed and applied only to the Residents account actions; the role test then passed. No unrelated table restriction remains.
- Real Chrome offline component-layout checks at 320, 375, 414, 768, 1024, 1280, 1440 and 1920px: no measured page overflow or clipped controls. The first pass found filters below 44px; minimum height was corrected and the rerun found all checked controls at least 44px.
- Browser scope: actual read-only workspace loading controls and application styles, no backend effects or login. These are not authenticated populated-table, menu-portal or form browser certifications. Tests of table structure, group separation, menu actions and role rendering are Jest evidence using unit fixtures, not live records.
- Private local evidence: `%LOCALAPPDATA%\Temp\barangay-stage7d-responsive-20261106`; generated logs/scripts under `supabase-tests/runners-out/stage7d-*`.

Authenticated Official desktop/mobile checks remain pending. No live record, profile decision, eligibility update or upload was executed. No Docker, commit, push, merge or deployment occurred. Stop after reporting.
