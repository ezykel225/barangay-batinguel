# Final full-branch main deployment review — 2026-11-05

## Decision: NO-GO for merging the full branch now

This is a read-only deployment review. No merge, push, deployment, migration, production data/settings change or branch change was performed. Only this report and the two inventory text files were written locally; they are uncommitted and are not part of the reviewed candidate.

- Candidate branch: `release/existing-schema-frontend-20261105`.
- Candidate: **`a302b92a1aa6e40068f5d3ea04bbf109a553db9e`**.
- Remote main freshly read with `git ls-remote`: **`739e8879a273c8b82f6d7a06ff66222169976aae`**, matching local `origin/main`.
- Full handoff branch remains at `da47a83be76d8a4a5ff432abb9afa3ceb6a53ed8`.
- Main is an ancestor of this candidate. The merge would bring **45 reachable commits** and **181 net changed paths: 95 added, 73 modified, 13 deleted**. These are not merely the last checkpoint's 15 files. A squash would change commit history but deliver the same net file changes.
- Exact net paths/statuses: `docs/final-main-review-files-20261105.txt`.
- Exact additional full commit SHAs/subjects in topological order: `docs/final-main-review-commits-20261105.txt`.

## What the full merge changes

The full stack integrates scope cleanup, person linking, Auth/session recovery, role/navigation retirement, dashboard KPIs, Unified Resident Profile, analytics/charts, Community Credit V2 implementation, responsive/shared-component fixes and later QA gates. It includes the 13 planned draft-PR integrations plus local checkpoints; PR numbers and SQL migration numbers are different. In particular PR #64 is not migration 064. The stack contains merge ancestry incorporating #58 through later work; do not cherry-pick/replay every listed commit blindly.

### SQL files newly entering main

| File | Reported installation / purpose | Does committing execute it? |
| --- | --- | --- |
| 061_person_matter_linking.sql | Reported already present in production; adds external identities, incident parties, stable complaint identity links, history and associated RPCs. Its file is new relative to Git main. | No. Do not replay merely because the file is new in Git. Actual catalog/grants still need confirmation. |
| 062_analytics_insights.sql | Pending; descriptive analytics/index/RPCs. | No checked-in execution path. |
| 063_retire_legacy_module_access.sql | Pending; closes retired module privileges/policies, preserving records. | No checked-in execution path. |
| 065_retire_nurse_sms_permissions.sql | Pending; removes Nurse health-source SMS management authority. | No checked-in execution path. |
| 066_person_history_privacy.sql | Pending; private-history/analytics restrictions and verified identity handling. | No checked-in execution path. |
| 067_community_credit_v2.sql | Pending; private V2 workflows and versioned credit schema; installation alone does not activate V2. | No checked-in execution path. |

**Migration 064 is absent.** No `supabase/functions`, Supabase config, package manifest or dependency-lock changes are in the main-to-candidate diff. No production migrations or Edge Function deployment are part of this review or approved for a frontend merge.

`package.json` build is `react-scripts build`; there are no prebuild/postbuild migration hooks. The only checked-in Actions workflow runs static checks, Jest and a production build with loopback placeholder credentials. It has a read-only GitHub token and no production SQL/deployment step. SQL/test files would enter Git, but would not become installed database behavior through these checked-in scripts. Do not describe backend protections in those files as active after a frontend release.

External Supabase/Vercel integrations and project-level Build Command overrides are not fully inspectable with available credentials. Previous owner verification says Supabase automatic branching is unavailable/disabled and production branch is main. No tracked auto-migration mechanism was found; that is not a fresh administrative guarantee about every external integration.

### Enabled frontend dependencies and behavior

| Surface | Production behavior after this full merge |
| --- | --- |
| Existing public/documents/complaints/KP/Tanod | Existing services remain in source, with responsive/navigation/Auth changes. Core synthetic browser submissions/approval passed; full production lifecycle and all roles not freshly certified. |
| V1 credit | Gauge, server score/ledger, policy/rule/enrollment management and records-staff selector retain 059/060 RPCs. No client score calculation, automatic deductions or V2 activation added. |
| 062 analytics | Production capability gate shows deferred text; analytics API guard rejects locally before missing readers are called. |
| V2 | V2 panel/correction form not mounted in production; V2 API guard rejects locally. This is not backend installation or security enforcement. |
| Linked history | People panel and profile history/analytics deferred. `person_history`/`person_analytics` guarded before network calls to avoid fetching the old privacy-shaped payload. |
| Stable complaint identity linking | **Still enabled:** PartyLink replaces `search_case_residents` / `link_complaint_party` with 061 `search_people` / `link_complaint_party_identity`. Same-name matching is not automatic. This is a real backend-contract/write-behavior change despite the 062/067 gates. |
| Incident parties | **Still enabled:** new detail editor calls 061 `incident_parties_for`, `search_people`, `save_external_person`, `save_incident_party`. Records-admin controls are conditional, but SQL authorization must be verified. |
| Auth/navigation | New role lookup/retry/session handling uses existing `profiles.role`; supported frontend roles are official/resident/tanod. Nurse route and dashboard removed, with no Auth account ban or session revocation. |
| Retired services | Removes public reservation/tracking/Health routes, Nurse dashboard and related official/resident menus. Historical DB rows are not deleted; existing users lose those frontend surfaces. Future reservation closure/communication has not been verified. |
| SMS | Existing official SMS publishing remains; the main diff includes a preview-label separator correction, not worker/Edge changes. 065's server-side retirement remains unapplied. |

## Confirmed remaining gaps

1. **Partially deferred identity workflow:** `IncidentParties` still offers **View history**, but the capability guard always rejects its history call in production mode. It results in generic “Person history is unavailable,” not a clearly disabled control. Earlier browser checks opened incident creation/map, not this linked-party action.
2. **Misleading external-person instructions:** complaint PartyLink says to create an external person in “Incidents & Blotter → People & identity records,” but that panel is deferred. External creation exists inside the incident-party editor, but that does not make the stated route functional or appropriate for a complaint-only person. Do not invent an incident to work around this gap.
3. **Unverified active 061 contracts:** reported production application and anonymous `person_history` refusal do not certify every enabled 061 signature, role grant or write guard. The existing isolated browser backend already contains 067 and therefore stronger permissions than pre-062 production. V1-mode local testing is not an exact pre-062 backend security test.
4. **Backend privacy remains open:** 061's older history reader and V1 individual-credit visibility remain server-side. Blocking this UI's calls does not stop a token holder calling old RPCs directly. 066/067 protections are not deployed by the frontend merge.
5. **Retired role/API mismatch:** Nurse sign-in/navigation removal does not revoke an existing token's retired endpoints or health-source SMS authority. 063/065 are not installed by this merge. Auth/session retirement needs a separate approved operational decision.
6. **Reservation retirement gate incomplete:** no complete preflight output establishes whether pending/approved future reservations exist. Losing public tracking/management before resolving them is an operational compatibility risk, even without deleting rows.
7. **Production group-testing boundaries:** the existing site points to genuine production records. “Group review” is not an isolation boundary. Permitted accounts, roles, records and write actions must be agreed; no privileged access to genuine resident data should be granted merely for testing.

The first two gaps are source-confirmed and were not covered by the successful grouped browser suite. No code was changed in this review. They are reasons not to extrapolate 28/28 targeted browser checks into full feature certification.

## Production verification evidence and limits

Previous fresh public-key GETs returned PGRST202 for new analytics/activity/correction readers and 42501 for resolved protected existing readers. Only account-role totals have been supplied from the production SQL preflight so far. Current catalog, exact function bodies/ACLs/RLS, current V1 policy/enrollment/score invariants, future reservations and active health-source SMS remain uncertified. No production credentials, authenticated reads or writes were used in this review.

Local checkpoint evidence remains valid for its tested scope: **2,695 Jest tests / 122 suites, production build, 48 static checks, 28 grouped browser checks, 54 captures at 375/1024, two selector continuations**. Three duplicate-notification HTTP 409 console entries were recorded; no page-level JavaScript errors. Full KP dispositions, linked-party View history, all existing-data states, all role boundaries and all eight viewport widths were not certified by that final run. No source changed now, so those suites were not unnecessarily repeated. `git diff --check` passed.

## Vercel/main check

- GitHub's latest recorded Production deployment remains id `7473216023`, main SHA `739e887...`, status **success** on November 1.
- GitHub's Vercel commit status for that main SHA is **success**, linked to the existing `ezequels-projects/barangay-batinguel-e-processing` project.
- Repository webhook list: **empty**. GitHub App integrations can operate without repository webhooks, so this does not mean no integrations exist.
- Candidate adds main-push CI triggers; none disables Vercel or applies migrations.
- Previously owner-verified Ignored Build Step: `if [ "$VERCEL_GIT_COMMIT_REF" = "handoff/gemini-final-defense-20261105" ]; then exit 0; else exit 1; fi`. If unchanged, **main is allowed to build**; only handoff is ignored.
- Fresh Vercel Git/Production Branch/Build Command/Paused state cannot be read with available access. Therefore main deployment remains expected and has historical evidence, but **current enabled status is not freshly administratively certified**. Before any future push, owner must confirm existing repo, Production Branch `main`, project not paused, ignore command unchanged, Build Command `npm run build` (no SQL hook) and existing public-client environment. No settings were changed.

## Smallest safer frontend-only release recommendation

Preserve the full candidate/handoff branches. Prepare a **new local patch directly from remote main `739e887...`**, only after approval of that preparation scope; this task does not create it. Do not cherry-pick `a302b92` alone: its parent/imports assume the whole stack. Do not copy whole candidate dashboards/App/Auth files as a shortcut.

First patch should contain only independently reviewable, existing-contract fixes:

1. Kapitan optional-row helper and focused regression tests (`src/utils/kapitanStatus.js`, `.test.js`), plus **only** its query/empty-state/disabled-control hunks in main's `OfficialDashboard.jsx`.
2. Resident Settings password-button type/pressed state/keyboard/touch-target hunks in main's `ResidentDashboard.jsx` and the needed CSS. Port an isolated regression test from the existing test without importing the broader retained-scope assertions or deleting reservation UI.
3. Mobile toast top-offset hunk in main's `App.js` and four CSS lines; do not replace the App file (that would also delete routes).
4. If the V1 gauge is needed in the first release, add `CreditGauge.jsx` and only its existing-V1 rendering/accessibility/responsive integration in main's `CreditProfile.jsx` / `CommunityCredit.css`; retain main's V1 API/admin contracts, with no V2 imports or correction/participation panels. Test true old 059/060 response shapes, including empty/not-enrolled states.

No new SQL files, workflow changes, 061 person-linking API replacements, module retirement, Auth role retirement, analytics or V2 components should be in that minimum patch. Existing main modules would remain as they are until their separately approved retirement cutover; this does not reintroduce modules into the full development branch. Broader CSS/map/session improvements can follow as individually reviewed patches after dependencies are checked.

Run focused/full Jest, build and targeted browser checks against an existing-schema-compatible synthetic backend, confirm the exact small main diff, then obtain explicit deployment authorization. Preserve backups, fixtures and all development branches. If main advances, re-evaluate rather than force-push.

## Final authorization recommendation

**NO-GO: do not merge/push the full 45-commit branch now.** No automatic SQL installer was found, but scope retirement, active 061 contracts, known incomplete controls and unresolved production security/operational evidence prevent calling it a stable frontend-only main update. Recommended next action is approval to prepare the small main-based patch above, not authorization to deploy or migrate anything.
