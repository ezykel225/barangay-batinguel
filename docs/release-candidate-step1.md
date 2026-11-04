# Release candidate preparation ? Step 1

Local-only preservation checkpoint: `aea275c43b825f6cb7f52da1e184a46d34a85037`.
Original `codex-067-checkpoint` remains at `38aab1393c2d24df26f752118b5ec5e868103568`.
No push or PR was performed. The checkpoint precedes the UI fixes below.

## Exact checkpoint contents (36 files)

- `docs/community-credit-frontend.md`
- `docs/final-integration-release-plan.md`
- `docs/final-integration-working-tree.txt`
- `docs/responsive-audit.md`
- `scripts/ci/migrationSequence.mjs`
- `src/analytics/AnalyticsCharts.accessibility.test.jsx`
- `src/analytics/AnalyticsCharts.jsx`
- `src/communityCredit/CommunityCredit.css`
- `src/communityCredit/CommunityCredit.test.jsx`
- `src/communityCredit/CommunityCreditV2.test.jsx`
- `src/communityCredit/CreditCorrections.jsx`
- `src/communityCredit/CreditGauge.jsx`
- `src/communityCredit/CreditManagement.jsx`
- `src/communityCredit/CreditProfile.jsx`
- `src/communityCredit/CreditV2Management.jsx`
- `src/communityCredit/communityCreditApi.js`
- `src/components/Footer.css`
- `src/components/Navbar.css`
- `src/components/Navbar.jsx`
- `src/components/Navbar.test.js`
- `src/documents/DocumentPreview.css`
- `src/migrationSequence.test.js`
- `src/pages/About.css`
- `src/pages/AnnouncementDetails.css`
- `src/pages/EventDetails.css`
- `src/people/PeopleHistory.css`
- `src/residents/ResidentProfileDialog.test.js`
- `src/safetymap/IncidentMap.jsx`
- `src/safetymap/PublicSafetyMap.jsx`
- `src/safetymap/observeMapSize.js`
- `src/safetymap/observeMapSize.test.js`
- `supabase-migrations/067_community_credit_v2.sql`
- `supabase-tests/067_build_test_runner.mjs`
- `supabase-tests/067_community_credit_v2_behavioral.sql`
- `supabase-tests/067_concurrency_runner.mjs`
- `supabase-tests/067_validation.md`

## Intentionally excluded and preserved

- `supabase-seeds/seed_sms_demo_residents.sql`
- `supabase-tests/runners-out/` (generated runners, probes and diagnostics)
- No private backup, environment file or credential file was staged.

Reviewed filename/diff scope and scanned the selected files for private keys,
JWT/GitHub tokens, password-bearing database URLs, literal credential assignments
and non-fixture email addresses. No findings required exclusion or clarification.
Synthetic test data remains explicitly synthetic. This scan is not a general
claim that arbitrary files elsewhere in the workspace are free of secrets.

## Subsequent UI correction (left uncommitted for review)

- Policy summary uses actual active policy regardless of V2 workflow availability.
  Legacy metadata without a policy model remains V1. Draft/retired-only, absent
  configuration, and failed policy lookup have distinct states.
- V2 reads distinguish missing functions/API-schema entries (PGRST202/42883),
  authorization/session refusal, and generic transport failure. None means V1
  is automatically unconfigured.
- Inactive V1 rules retain the V1 editor for non-retired policies. V2 rules never
  enter that editor. Existing V2 editing is explicitly unsupported here; approved
  rules are immutable and need a replacement workflow. Only approved V2 rules
  on non-retired policies can use the existing guarded enable/disable RPC.
- Independent approval is still the server's decision. Refusal is displayed with
  no optimistic approval or fallback to a legacy mutation. Retired/unknown policy
  rules are read-only. SQL scoring and all migrations remain unchanged.

Files: `src/communityCredit/CreditManagement.jsx`,
`src/communityCredit/CreditV2Management.jsx`,
`src/communityCredit/creditUiState.js`,
`src/communityCredit/CreditReleaseState.test.jsx`, and this report.

## Responsive scope and remaining rehearsal

Only source-level review and DOM tests are available. The existing wrapping
`.credit-row-actions`, min-width bounds, mobile table cards, and inline message
wrapping remain in effect. No viewport is claimed browser-tested. Retain
`docs/responsive-audit.md` for 320,375,414,768,1024,1280,1440,1920px.

Next: review/checkpoint the UI corrections, then rehearse this exact candidate
against an isolated synthetic post-061 baseline, applying only the authorized
local sequence 062 ? 063 ? 065 ? 066 ? 067. Verify V1 state before/after install,
RPC availability, role/self-access boundaries and independent approvals. V2
activity demonstrations require an explicitly approved isolated fixture state;
no production activation is implied. Complete the manual viewport matrix before
release. Do not run 064, use production credentials or automatically deploy.

## Final validation results

- Focused Community Credit regression/migration tests: 72 passed / 5 suites.
- Full Jest: 2,676 passed / 119 suites (including 16 new regression cases).
- Production build: compiled successfully with CI=true.
- Migration static checks: 48 passed / 0 failed (source checks, no database execution).
- git diff --check: passed.
- Real-browser verification: not performed; eight-width checklist remains pending.
- UI corrections and this report remain uncommitted after the preservation checkpoint.
