# Stage 10A Phase 7 — Vercel maintenance and migration runbook

Prepared November 11, 2026. This document authorizes nothing by itself. Target Vercel project: `ezequels-projects/barangay-batinguel-e-processing`; target domain: `barangay-batinguel-e-processing.vercel.app`; target Supabase project: `mpcyqwasurhtdztzobwg`.

## Decision and current evidence

Use a temporary, isolated maintenance deployment and promote it through the Vercel dashboard. This is the smallest mechanism that supplies a public barangay-specific message and can be reversed by routing the domain back to the immediately previous production deployment. The prepared overlay is under `ops/vercel-maintenance/`; it does not affect normal builds in that location.

Locally confirmed: this is CRA 5 with React Router `BrowserRouter`; no root `vercel.json` or local `.vercel` linkage exists; `public/_redirects` is documented as Netlify-only; the normal Vercel deployment therefore depends on Vercel's CRA preset and build-time `REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY` values. No secret is present in the maintenance page.

Phase 8 owner verification confirmed the correct project/domain, `main` as Production Branch, current deployment `c1cc57f`, Preview promotion availability, Hobby Instant Rollback availability, and current rollback target `eb8652e`. After maintenance promotion, the operator must verify that `c1cc57f` becomes the displayed rollback target before any database migration. Vercel Authentication remains only a possible supplemental containment control because it gives an access gate rather than the required public maintenance message.

## Timestamped operator record

Record in private operational notes; do not put resident data or credentials here.

| Item | Value to record |
|---|---|
| Window start/end (Asia/Singapore) | ____ / ____ |
| Owner approver / SQL operator / incident owner | ____ / ____ / ____ |
| Vercel project, production branch, current deployment ID | ____ / ____ / ____ |
| Production domain before change | ____ |
| Supabase project reference | ____ |
| Backup checksum record and second-copy confirmation | ____ |
| Untested-restore risk accepted by | ____ |
| 068 hash verified at | ____ |
| 069 hash verified at | ____ |
| Maintenance promoted / verified at | ____ / ____ |
| Traffic restored / verified at | ____ / ____ |

## Prepare and stage the maintenance deployment

These Git/deployment actions require separate future approval; do not perform them as part of this preparation.

1. In Vercel, open team `ezequels-projects`, project `barangay-batinguel-e-processing`. In **Settings → Environments → Production → Branch Tracking**, confirm the Production Branch is `main`. In **Deployments**, record the deployment currently marked Current and confirm the production domain points to it.
2. Confirm the dashboard offers **Promote to Production** for a preview and **Instant Rollback** for the current production deployment. Confirm the prior normal deployment is eligible. Stop if rollback eligibility is unclear.
3. From the exact current production source commit, create a dedicated temporary branch such as `ops/maintenance-20261111`. Copy `ops/vercel-maintenance/vercel.json` and `ops/vercel-maintenance/maintenance.html` to the repository root. The explicit Vercel static-build allowlist must leave these as the branch's only changes. Do not merge this overlay into `main`.
4. After separate commit/push approval, allow Vercel to build the branch as Preview. Do not promote it yet.
5. Require the Preview build log to show a static maintenance artifact and no CRA build. Open the Preview URL in a private browser. Test `/`, `/official`, `/resident`, `/index.html`, a static bundle-looking path, and a random path. Every request must show only the maintenance page. DevTools Network must show no Supabase requests. Confirm the page has no resident data, keys, environment values, or internal details.
6. If preview protection prevents this test, use an owner-authorized Vercel session or a temporary dashboard-generated sharing mechanism. Do not weaken production database controls.

## Enter maintenance and pause writes

1. Reconfirm project/domain/deployment identifiers, operators, approved window, backups/checksums, untested-restore acceptance, and migration file hashes.
2. Notify staff to finish or abandon in-progress work, sign out, and close all application tabs. Explicitly stop verification, signup, profile editing, directory changes, notifications, and Community Credit activity. A Vercel page cannot terminate already-loaded sessions.
3. In Vercel **Deployments**, open the tested maintenance Preview deployment's menu, choose **Promote to Production**, verify the listed project and domain, and confirm. Record the deployment ID and time.
4. From a fresh private browser with cache disabled, open the production domain and the route set used in preview. Require the maintenance page everywhere and no Supabase network calls. Ask a second observer to confirm independently.
5. If any normal route remains usable, an old page reloads, the wrong domain moved, or rollback is unavailable, stop. Do not run a migration. Restore the previously recorded production deployment if safe, then diagnose routing.
6. Treat direct Supabase clients, old immutable deployment URLs, service-role integrations, and already-open tabs as outside the Vercel pause. The operational staff stop is mandatory. Do not disable Auth, RLS, triggers, policies, API keys, or scheduled infrastructure as a substitute.

## Controlled database sequence

Follow `docs/stage10a-phase6-production-security-migration-runbook-20261111.md`; the condensed order is authoritative only when combined with its stop conditions and test approvals.

1. Confirm Supabase reference `mpcyqwasurhtdztzobwg`, both private backup copies/readability/matching checksums, and owner acceptance that restore is untested.
2. Capture the approved non-identifying preservation aggregates and Community Credit V1 invariants.
3. Run the corrected read-only preflight: `supabase-tests/068_069_cloud_preflight_readonly.sql`. Stop on unexplained policy/function/trigger/default drift.
4. Verify `supabase-migrations/068_resident_verification_security.sql` SHA-256 is `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`. In a fresh SQL Editor query, apply that exact file once. Do not alter guards or timeouts.
5. Run targeted read-only post-068 checks: profile UPDATE policy inventory/expressions; `prevent_role_self_change()` fingerprint/configuration and revoked client execute; unchanged enabled compose, notification, and directory trigger bindings. Stop unless all match the reviewed intent.
6. Verify `supabase-migrations/069_resident_profile_insert_security.sql` SHA-256 is `F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F`. In a fresh query, apply that exact file once.
7. Run targeted read-only post-069 checks: the sole profile self-INSERT policy requires own non-null UUID, resident role, pending status, and null verifier/time/notes; signup and all five required trigger mappings remain enabled.
8. Run the owner-approved read-only JWT matrix first. Run write/denial cases only for specifically named existing accounts, targets, and acceptable business outcomes. A denied write is still a production write test. Record unavailable cases as not executed.
9. Compare resident/directory/notification/audit aggregates and all Community Credit V1 invariants. Neither migration contains application-row DML or Community Credit changes; any unexplained difference is an incident.

## Incident and forward-repair rules

- Unexpected drift, wrong hash/project, disabled/missing object, maintenance failure, lock/timeout/error, or uncertain transaction outcome: stop, retain the write pause, preserve screenshots/query results, and inspect current fingerprints in a new read-only transaction. Never blindly rerun.
- 068 succeeds and 069 fails: retain 068, keep signup/write traffic paused, diagnose 069 and prepare a separately reviewed forward correction or safe re-execution. Do not restore the broad UPDATE policies.
- Unauthorized verification/protected-field write succeeds: keep maintenance active, preserve evidence and use the narrowest separately approved containment while preparing a forward policy/guard correction.
- Legitimate resident/Secretary/Punong workflow is blocked: verify JWT, active account link, position, role, and exact transition. Prepare a narrow forward amendment only for a confirmed defect; do not add a blanket bypass.
- Record counts, directory/notification/audit side effects, or V1 invariants change unexpectedly: stop and identify the source. Preserve ledger/audit history; do not delete or rewrite data to make checks pass.
- Restore from backup only for severe unrecoverable corruption after a separate owner decision on downtime and possible data loss. Restore remains unverified and may not cover Storage objects, Auth/project settings, Vercel configuration, or activity after the dump.

## Resume production traffic

1. Require documented pass results for structural checks, approved JWT tests, preservation aggregates, V1 invariants, and owner review of all unexecuted tests/incidents.
2. In Vercel, use **Instant Rollback** from the maintenance production deployment to the recorded immediately previous normal production deployment. Verify all domains listed in the confirmation. On plans limited to the immediately previous deployment, stop if it is not the intended normal build.
3. In a fresh private browser, verify public pages, Resident/Official login, representative authorized reads, and absence of the maintenance route response. Confirm production still targets Supabase `mpcyqwasurhtdztzobwg` without exposing keys.
4. Ask the second observer and selected staff to verify baseline access before announcing completion. Keep write activity paused until the owner approves resumption.
5. Record that Instant Rollback disables automatic production-domain assignment. Leave it disabled during observation. When the owner is ready, use **Undo Rollback**, deliberately select an approved normal deployment (never the maintenance deployment), and confirm to restore normal branch auto-assignment. Reverify the domain afterward.
6. Retain the maintenance deployment and operational evidence for incident review, but do not merge its overlay into `main`. Remove it later only under a separate cleanup approval.

## Final go/no-go gates

Preparation is **GO**. Production execution is **NO-GO** until the owner explicitly approves: the window and named operators; untested-restore risk; future temporary branch commit/push and Preview deployment; promotion/rollback actions; exact 068 then 069 execution; every JWT-backed write case; unexecuted-test acceptance; incident authority; and traffic resumption criteria. It is also NO-GO until dashboard verification confirms the project, branch, current deployment/domain, preview promotion, and rollback eligibility.
