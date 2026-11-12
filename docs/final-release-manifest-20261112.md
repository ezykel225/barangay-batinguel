# Barangay Batinguel final release manifest

Prepared November 12, 2026. Baseline `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`; source branch `defense/scope-cleanup-20261106`. This manifest describes a local, uncommitted release candidate. It does not authorize a commit, push, database migration, Vercel change or deployment.

## Release boundaries

The application release overlay contains categories **A + B** below. Category **C** is copied into the candidate repository for review and controlled manual execution, but it is not run by the CRA build or Vercel deployment. Nine current release documents are retained with the candidate. Historical documentation, the maintenance-only overlay and generated diagnostics remain preserved in the source workspace but are excluded from the candidate working tree.

Inventory after adding this manifest: **495 changed/untracked paths** relative to `c1cc57f`: A 55, B 50, C 14, D 49, E 3, F 324, G 0. Intended candidate overlay: **129 files** (55 A + 50 B + 14 C + 10 selected D). Excluded from the candidate: **366 files** (39 historical D + 3 E + 324 F). Unknown requiring owner review: **0**.

## A — intended application release content (55)

```text
README.md
public/index.html
src/App.js
src/analytics/AnalyticsCharts.jsx
src/analytics/analyticsPeriods.js
src/analytics/DescriptiveInterpretation.css
src/analytics/DescriptiveInterpretation.jsx
src/analytics/descriptiveStatistics.js
src/analytics/incidentAnalytics.js
src/analytics/SupportedAnalytics.css
src/analytics/SupportedAnalytics.jsx
src/analytics/supportedAnalyticsApi.js
src/communityCredit/CommunityCredit.css
src/communityCredit/CreditGauge.jsx
src/communityCredit/CreditManagement.jsx
src/communityCredit/CreditProfile.jsx
src/complaints/OfficialComplaints.jsx
src/components/Footer.jsx
src/components/Navbar.jsx
src/components/Sidebar.jsx
src/constants/eServices.js
src/dashboards/OfficialDashboard.jsx
src/dashboards/OfficialOperations.css
src/dashboards/OfficialPeople.css
src/dashboards/OfficialPublishing.css
src/dashboards/OfficialPublishingUI.jsx
src/dashboards/OfficialRemaining.css
src/dashboards/OfficialRequests.css
src/dashboards/OfficialServices.css
src/dashboards/OperationsOverview.css
src/dashboards/OperationsOverview.jsx
src/dashboards/reportingPresentation.js
src/dashboards/ResidentDashboard.jsx
src/incidents/IncidentsPanel.jsx
src/pages/CommunitySafety.jsx
src/pages/EServices.jsx
src/pages/Home.jsx
src/pages/Login.jsx
src/pages/Officials.jsx
src/pages/ResidentSignup.jsx
src/residents/ResidentDirectory.css
src/residents/ResidentDirectory.jsx
src/residents/residentPresentation.js
src/residents/ResidentProfileDialog.css
src/residents/ResidentProfileDialog.jsx
src/residents/ResidentsWorkspace.jsx
src/safetymap/IncidentMap.jsx
src/safetymap/OfficialSafetyMap.css
src/safetymap/SafetyMap.css
src/safetymap/SafetyMapPanel.jsx
src/tanod/TanodPanel.jsx
src/utils/authRoles.js
src/utils/dashboardNavigation.js
src/utils/residentTabs.js
src/utils/returnTo.js
```

## B — required automated tests (50)

```text
src/analytics/AnalyticsCharts.test.jsx
src/analytics/analyticsPeriods.test.js
src/analytics/DescriptiveInterpretation.test.jsx
src/analytics/descriptiveStatistics.test.js
src/analytics/incidentAnalytics.test.js
src/analytics/SupportedAnalytics.test.jsx
src/analytics/supportedAnalyticsApi.test.js
src/communityCredit/CommunityCredit.test.jsx
src/communityCredit/CreditGauge.test.jsx
src/complaints/complaintExperience.test.js
src/complaints/officialComplaints.test.js
src/components/EServicesMenu.test.js
src/components/Navbar.test.js
src/components/Sidebar.test.js
src/context/AuthContext.test.js
src/dashboards/officialDirectoryForm.test.js
src/dashboards/officialIdentity.test.js
src/dashboards/OfficialOperations.test.jsx
src/dashboards/OfficialPeople.test.jsx
src/dashboards/OfficialPublishing.test.jsx
src/dashboards/OfficialRemaining.test.jsx
src/dashboards/OfficialRequests.test.jsx
src/dashboards/OfficialServices.test.jsx
src/dashboards/OperationsOverview.test.jsx
src/dashboards/reportingPresentation.test.js
src/dashboards/ResidentSettingsAccessibility.test.jsx
src/dashboards/ResidentWorkflowQA.test.jsx
src/dashboards/Stage10AFrontendFixes.test.js
src/defensePolish.test.js
src/incidents/incidentMigration.test.js
src/kpcases/kpCaseMigration.test.js
src/pages/CommunitySafety.test.js
src/publicScopeCleanup.test.jsx
src/publicScopeReferences.test.jsx
src/residents/cloudSecurityPreflight.test.js
src/residents/officialResidentsViews.test.js
src/residents/offlineAuthorizationContracts.test.js
src/residents/residentDirectory.test.js
src/residents/residentEligibility.test.js
src/residents/ResidentProfileDialog.test.js
src/residents/residentProfileInsertSecurityMigration.test.js
src/residents/ResidentsWorkspace.test.js
src/residents/residentVerificationSecurityMigration.test.js
src/safetymap/OfficialSafetyMap.test.jsx
src/safetymap/safetyMapPanel.test.js
src/tanod/tanodAuth.test.js
src/utils/dashboardNavigation.test.js
src/utils/residentTabs.test.js
src/utils/returnTo.test.js
src/utils/rowActions.test.js
```

## C — controlled database migrations and validation (14)

These files are retained for separate owner-controlled database work. They are not application deployment steps.

```text
supabase-migrations/068_resident_verification_security.sql
supabase-migrations/069_resident_profile_insert_security.sql
supabase-tests/068_069_cloud_preflight_readonly.sql
supabase-tests/068_resident_verification_security.sql
supabase-tests/068_verification_cleanup_check.sql
supabase-tests/068_verification_precontrol.sql
supabase-tests/068_verification_test_support.sql
supabase-tests/production_authorization_definitions_readonly.sql
supabase-tests/production_contract_compatibility_readonly.sql
supabase-tests/production_domain_authorization_readonly.sql
supabase-tests/production_migration_versions_readonly.sql
supabase-tests/production_required_functions_readonly.sql
supabase-tests/production_required_relations_readonly.sql
supabase-tests/production_schema_reconciliation_readonly.sql
```

Migration dependency/order: existing production definitions from 007/011/012/022/031/044/055/056 and reviewed profile schema must be present. Run the corrected read-only preflight first. If separately approved, apply exact 068, verify it, then exact 069, verify it. Do not bulk-run 061–067, do not run destructive 064, and do not infer database execution from a frontend build/deployment.

## D — documentation

Selected release/test documents included in the candidate (10):

```text
docs/final-release-manifest-20261112.md
docs/final-capstone-completion-plan-20261112.md
docs/stage9a-defense-critical-workflow-verification-20261110.md
docs/stage10a-phase3-database-security-fix-preparation-20261111.md
docs/stage10a-phase6-production-security-migration-runbook-20261111.md
docs/stage10a-phase7-vercel-maintenance-migration-runbook-20261111.md
docs/stage10a-phase9-maintenance-preview-branch-preparation-20261111.md
docs/stage10a-phase11a-recovery-readiness-20261112.md
docs/stage7w-supabase-cloud-security-preflight-20261107.md
docs/supabase-only-development.md
```

Excluded historical/preservation documentation (39), preserved in the source workspace:

```text
PROJECT_HANDOVER.md
docs/defense-security-evidence-notes-20261107.md
docs/stage3-scope-reference-audit-20261106.md
docs/stage4-browser-defense-readiness-20261106.md
docs/stage4a-mobile-auth-recovery-20261106.md
docs/stage7b-safety-tabs-20261106.md
docs/stage7c-supported-analytics-20261106.md
docs/stage7d-official-residents-20261106.md
docs/stage7e-analytics-presentation-20261110.md
docs/stage7g-resident-profile-20261106.md
docs/stage7i-verification-security-20261106.md
docs/stage7k-068-isolated-validation-20261106.md
docs/stage7l-official-dashboard-redesign-20261106.md
docs/stage7m-official-dashboard-polish-20261106.md
docs/stage7n-official-portal-consistency-20261106.md
docs/stage7n1-announcements-events-layout-fix-20261106.md
docs/stage7o-document-complaints-ui-20261106.md
docs/stage7p-incidents-tanod-ui-20261106.md
docs/stage7q-safety-map-analytics-ui-20261106.md
docs/stage7r-officials-residents-ui-20261106.md
docs/stage7r1-resident-requests-actions-20261107.md
docs/stage7s-official-remaining-sections-ui-20261107.md
docs/stage7t-final-security-authenticated-qa-20261107.md
docs/stage7u-security-verification-20261107.md
docs/stage7v-supabase-only-security-cleanup-20261107.md
docs/stage7x-offline-security-defense-readiness-20261107.md
docs/stage7y1-supabase-reconciliation-audit-20261110.md
docs/stage7y3-production-migration-reconciliation-20261110.md
docs/stage7y4-local-rpc-contracts-20261110.md
docs/stage7y4-production-compatibility-security-20261110.md
docs/stage7y5-production-compatibility-triage-20261110.md
docs/stage7y6-focused-authorization-readiness-20261110.md
docs/stage7y7-security-migration-compatibility-20261110.md
docs/stage7y8-controlled-authorization-test-procedure-20261110.md
docs/stage7y9-disposable-supabase-feasibility-20261110.md
docs/stage7y10-baseline-discovery-database-handoff-20261110.md
docs/stage8a-analytics-descriptive-interpretation-20261110.md
docs/stage8b-community-credit-v2-gap-analysis-20261110.md
docs/stage8c-community-credit-v2-specification-tests-20261110.md
```

These exclusions prevent historical/stale findings from being mistaken for release state. They are not deleted or declared valueless.

## E/F/G — excluded operational material

- **E maintenance-only (3):** `ops/vercel-maintenance/maintenance.html`, `ops/vercel-maintenance/README.md`, `ops/vercel-maintenance/vercel.json`. These belong only to the separate maintenance branch/Preview and must never enter the normal CRA release.
- **F generated diagnostics/temporary (324):** every changed/untracked path under `supabase-tests/runners-out/`. This includes logs, screenshots, captured HTML/JSON, temporary runners and prior fixture scripts. Preserve in the source workspace; do not copy, stage or deploy.
- **G unknown:** none. New paths discovered later stop the release for owner classification.

## Environment and commands

Required build-time variables (names only):

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

Never place service-role credentials or private secrets in CRA variables. Test-only optional output-directory variables such as `STAGE7P_LAYOUT_DIR` are not deployment requirements.

Focused regression command:

```powershell
npm.cmd test -- --watchAll=false src/dashboards/Stage10AFrontendFixes.test.js src/dashboards/ResidentWorkflowQA.test.jsx src/residents/residentVerificationSecurityMigration.test.js src/residents/residentProfileInsertSecurityMigration.test.js
```

Full suite and builds:

```powershell
npm.cmd test -- --watchAll=false
npm.cmd run build
$env:CI='true'; npm.cmd run build
git diff --check
```

## Known limitations and deployment gates

- The candidate is an uncommitted local overlay until the owner separately approves a release commit. A directory/worktree alone is not an immutable freeze.
- Production authorization remains insecure until separately approved 068/069 execution and JWT-backed verification.
- Full restore is unrehearsed; Storage object bytes and external Supabase/Vercel configuration need separate recovery coverage.
- Authenticated Resident/Official/Tanod workflow and responsive production verification remain outstanding.
- Community Credit V2 is specification-only; V1 is the retained implemented system. Printable documents remain prototypes.
- Vercel deployment must use the normal CRA project, not the maintenance overlay. Confirm project, branch, Supabase target, environment-variable names, clean Preview, production approval and rollback deployment before release.

## Rollback considerations

Frontend rollback only changes the served bundle; it cannot undo database migrations or writes. Before promotion, record the current deployment and verify its rollback eligibility. After 068/069 commit, do not restore known insecure policies automatically. Keep maintenance/write pause, preserve evidence and use a narrowly reviewed forward repair. Database restoration is last resort, may lose post-backup transactions, and remains untested.
