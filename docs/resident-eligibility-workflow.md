# Resident eligibility workflow (migration 056)

Migration 054, migration 055 and the demo seed are unchanged. The owner reports
those are already applied. **056 has not been applied to Supabase.** No SMS work.

## Manual application

Review and manually apply the complete transaction in
`supabase-migrations/056_resident_eligibility.sql` in the intended Supabase SQL
Editor after 054/055. Do not rerun old migrations or the demo seed. Run security
advisors afterward and refresh the Official Portal. Deploy the UI and 056 together:
the new eligibility controls require the new RPC. Before applying, a missing RPC
is shown as a failure and no local status change is assumed.

## Exact database changes

`set_barangay_resident_eligibility(p_resident_id uuid, p_active boolean)` is an
empty-search-path SECURITY DEFINER RPC. Its authenticated callers must resolve
through the existing Secretary/Punong Barangay records-management helper. Public
and anonymous EXECUTE are revoked. No table privileges or RLS policies are added.
No extra table or demographic fields are created.

The operation locks a linked profile first, then the directory row, matching
055's lock order. A changed UUID link causes a retry error. Ineligible/missing
linked profile identities cannot be substituted by name. Deactivation sets the
directory inactive and linked resident profile ineligible. Reactivation sets them
active/verified. Unlinked directory residents can change status without creating
accounts. Existing verification actor/time/notes reflect the authorized decision.
No profile, auth user, government ID file, directory row, history or assignment is
deleted. A confirmation is required in the UI before invoking either transition.

055's existing re-verification trigger still executes. Its copied profile fields
are restored from the locked directory snapshot before commit, preserving reviewed
name parts, DOB, mobile, purok and the stable link. Existing 055 notifications/audit
behavior remains. An additional high-level eligibility audit uses the existing
entity_id relationship, with no DOB, phone, name or raw identifier in its subject.
Any failed update, trigger or audit insert aborts the entire call. Identical retries
perform no writes, duplicate logs, notifications or timestamp changes.

056 also replaces the existing `save_barangay_resident` function body with its
existing implementation plus one guard: metadata edits cannot change an existing
record's status. A stale form carrying a different status is rejected and must be
reloaded. This prevents the prior Edit RPC from bypassing atomic eligibility.
Its signature, existing authorization, privileges and other edits are retained.

This migration does not bulk reconcile historical inconsistencies. The explicit
eligibility action can bring a selected linked pair to the requested consistent
state. Account-verification Requests retain Verify/Reject/Not a Resident behavior;
linked account reinstatement is routed through 056 by UUID, while an unlinked
account's existing reinstatement lets 055 create its directory row. Hard delete is
intentionally omitted for all directory residents.

## UI and photos

Residents has three internal views: Barangay Residents, Account Verification,
Voter Reference List. The standalone voter sidebar destination and Cross-check UI
are removed; voter CRUD/filter state remains the existing implementation. Verified
accounts are no longer duplicated in Account Verification, which keeps Requests
(including returned/rejected cases) and Not Residents, and unchanged badge counts.

Resident names open the shared accessible profile dialog. Linked photo and account
verification data come only from the loaded profile with the exact profile UUID.
A valid HTTP(S) photo URL is reused; absent/failed photos fall back to initials.
No portrait generation, bucket, upload or raw UUID display is introduced. The
three-dot menu reuses the project's keyboard-accessible ActionMenu. Edit status is
read-only; eligibility uses confirmed actions. Summary totals remain unfiltered,
and filtered list counts explicitly show the filtered and full counts.

## Validation/reproduction

`src/residents/residentEligibility.test.js` covers UI, UUID/photo/fallback behavior,
confirmations, errors and RPC wiring. Existing workspace/account/sidebar tests are
updated. Browser checks use synthetic records and mocked APIs at 1440/768/375;
no browser call reaches Supabase or iProgSMS.

`scripts/test-resident-eligibility.cjs` runs actual 054/055/056 SQL in an isolated,
in-memory PGlite PostgreSQL instance. It uses minimal profile/auth/audit fixtures
and the existing records-permission helper's Secretary/Punong contract; it is not
a live PostgREST or production-RLS deployment test. It checks role denial, direct
access denial, linked/unlinked transitions, identical retries, snapshot/history
preservation, stale Edit rejection and injected profile/audit failures rolling
back both records. No .env or network database is used.

Test runtime used: `@electric-sql/pglite@0.5.10`, installed under TEMP, not added to
application dependencies. Example PowerShell reproduction:

```powershell
npm.cmd install --prefix "$env:TEMP\batinguel-sql-test-runtime" --no-audit --no-fund @electric-sql/pglite@0.5.10
$env:PGLITE_TEST_MODULE="$env:TEMP\batinguel-sql-test-runtime\node_modules\@electric-sql\pglite"
node scripts/test-resident-eligibility.cjs
```

After manual deployment, test authorization using controlled nonproduction role
sessions and confirm existing profile triggers/policies match the reviewed schema.
No live migration, SQL test, commit, push or merge was performed by the agent.


## Final validation and files from this pass

- Focused Jest: 176 tests / 9 suites passed.
- Full Jest: 2,309 tests / 87 suites passed.
- Isolated PostgreSQL: 10 tests passed.
- Production build: compiled successfully without warnings.
- Browser: 33 mocked states across 1440/768/375, no runtime errors or overflow.
- git diff --check: passed.

Exact files changed in this pass (earlier uncommitted foundation files remain):

```
supabase-migrations/056_resident_eligibility.sql
scripts/test-resident-eligibility.cjs
docs/resident-eligibility-workflow.md
src/dashboards/OfficialDashboard.jsx
src/components/Sidebar.jsx
src/components/Sidebar.test.js
src/residents/ResidentDirectory.jsx
src/residents/ResidentDirectory.css
src/residents/ResidentProfileDialog.jsx
src/residents/ResidentsWorkspace.jsx
src/residents/residentDirectory.test.js
src/residents/ResidentsWorkspace.test.js
src/residents/officialResidentsViews.test.js
src/residents/residentEligibility.test.js
src/complaints/officialComplaints.test.js
src/incidents/incidentMigration.test.js
src/kpcases/kpCaseMigration.test.js
```

The last three files only update migration-order/count expectations for 056;
no Complaint/Incident/KP behavior changed. Migrations 054/055 and the demo seed
were not edited. No live data or SMS changes, no commit, push or merge.

Final working-tree status (includes prior uncommitted work):

```
 M src/complaints/officialComplaints.test.js
 M src/components/Sidebar.jsx
 M src/components/Sidebar.test.js
 M src/dashboards/OfficialDashboard.jsx
 M src/incidents/incidentMigration.test.js
 M src/kpcases/kpCaseMigration.test.js
 M src/tanod/tanodAccessMigration.test.js
 M src/utils/activityLog.js
 M src/utils/displayLabels.js
?? docs/resident-directory-foundation.md
?? docs/resident-eligibility-workflow.md
?? scripts/
?? src/residents/
?? supabase-migrations/054_barangay_resident_directory.sql
?? supabase-migrations/055_verified_resident_directory_sync.sql
?? supabase-migrations/056_resident_eligibility.sql
?? supabase-seeds/
```
