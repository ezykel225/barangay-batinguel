# Stage 7V — Hosted Supabase workflow and INSERT security preparation

November 7, 2026. Branch `defense/scope-cleanup-20261106`; HEAD unchanged at `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.

## Inventory and proposed cleanup

Git status was reviewed before changes; earlier work, private handover material, diagnostics, SQL harnesses and seeds remain. No reset, clean, branch change or bulk staging occurred.

**Proposed deletion list, reported before implementation: empty. Files removed: none.** No active Dockerfile, Compose configuration, local-server package script or PostgreSQL Node dependency was found. `package.json` runs CRA start/build/test/eject and uses the existing Supabase client. The app already does not require local database software. No obsolete Docker startup command was found in README or `docs/SETUP.md` to remove. Historical rehearsal instructions are retained as evidence, not presented as current setup.

| Classification | Files or locations | Decision |
|---|---|---|
| Historical local database setup/clone tools, unnecessary for current app startup | `supabase-tests/runners-out/rc3-setup.mjs`, `compat-clone.cjs`, `rc2-orchestrate.mjs`, `rc2-resume.mjs` | Preserve: generated rehearsal/recovery provenance; deletion would discard prior work of uncertain future value |
| Historical synthetic account/contract/fixture tools | `rc3-accounts.cjs`, `rc2-contracts.mjs`, `rc2-correction-smoke.mjs`, `rc4-preflight.cjs`, `qa-kapitan-probe.cjs` under runners-out; `supabase-tests/qa_isolated_map_fixture.cjs` | Preserve: some use private manifests, create synthetic accounts or perform fixture writes; never run against hosted production |
| Supabase-required PostgreSQL code | All existing `supabase-migrations/*.sql`, including 068; Edge Functions; policies/functions/storage SQL | Preserve. PostgreSQL SQL is required by Supabase even though a local server is not |
| Security tests | `068_resident_verification_security.sql`, `068_verification_precontrol.sql`, `068_verification_test_support.sql`, `068_verification_cleanup_check.sql` and static tests | Preserve. Useful for approved hosted test adaptation; psql meta-commands/session setup are not automatically SQL Editor compatible |
| Apparent Compose filename | `012_pin_compose_search_path.sql` | Preserve: name-composition function security, unrelated to Docker Compose |
| Runtime-integrated test scripts | Existing scripts under `scripts/` for incident location, eligibility and SMS | Preserve; their names do not establish safe read-only behavior and they are not app startup dependencies |
| Local metadata/generated output | `supabase/.temp`, `supabase-tests/runners-out/`, `build/` | Preserve; purpose/data-retention not fully established, no blanket deletion |
| Private/unrelated | `.env`, private archives/backups, SMS seed, prior browser evidence, original checkpoints and Windows Docker/PostgreSQL installation | Preserve; no deletion, settings change or uninstall |

Ten historical local-QA scripts containing Docker/PostgreSQL startup references were identified by filename/content classification, without printing private manifests or credentials. No scripts were executed. No files outside the repository or Docker images/containers/volumes were modified. The task's restriction against deleting uncertain artifacts takes precedence over making the change count look like a cleanup.

## Hosted-only development instructions

Added `docs/supabase-only-development.md` and a README link. The current workflow is Node/CRA locally, existing `.env`, existing hosted Supabase Auth/REST/Storage, and the existing Vercel deployment workflow only after approval. Docker, local PostgreSQL, Supabase CLI and restores are not startup prerequisites. No dependency, package script, lockfile, `.env`, authentication, storage or API change was needed.

The guide explains local start/build/tests; protected Dashboard/SQL Editor read-only metadata transactions; prepared migration review; and optional separate Supabase test-project approval. It distinguishes localhost frontend from an isolated database: Resident/Official navigation can write notification/read metadata. It expressly warns against running old fixture/setup tools on hosted Supabase. No new Supabase project was created or requested automatically.

## INSERT bypass review

Evidence retained from Stage 7U:

- Migration 002's self-profile INSERT check is own UUID plus resident role. Initial verification status and decision metadata are not constrained there.
- Migration 011's Auth trigger inserts resident profiles conditionally on signup metadata and uses database defaults for verification fields. Existing React signup uses that Auth path, then optionally updates an ID-file path; it does not directly pre-approve a profile.
- Migration 068 restricts UPDATE policies and the UPDATE guard, including staff decisions, metadata and resubmission. It does not secure ordinary INSERT candidates.
- Migration 056's eligibility RPC uses the records-administrator helper. Direct official profile UPDATE handlers still depend on 068's separate protection. Notification/directory synchronization consumes accepted transitions; it is not an authorization boundary.
- Trusted SECURITY DEFINER signup, service-role and direct maintenance can bypass RLS. Their effective code/defaults must be privately reviewed; restricting one policy does not secure a privileged writer that copies untrusted metadata.

The potential bypass remains **conditional on current cloud INSERT grants, reachable profile-less Auth identities and effective trigger/constraint definitions**. No production catalog/session was accessed and no exploit or live decision was attempted.

### Proposed complementary migration

`supabase-migrations/069_resident_profile_insert_security.sql` — **PREPARED ONLY, NOT EXECUTED**.

It narrows the existing self-profile INSERT policy to a non-null authenticated own UUID, `role='resident'`, `verification_status='pending'` and null verifier/time/notes. Existing policy roles/permissiveness are retained. It does not replace the Auth signup function, change defaults/grants, create profiles, backfill data or modify 068. Staff make verification decisions via authorized UPDATE paths, not by inserting pre-approved profiles through an ordinary client policy.

Preflight requires profiles RLS and verification columns, the expected sole INSERT policy, no unexpected INSERT/ALL policy, and a marker from the reviewed 068 guard. The marker is a dependency accident guard, **not cryptographic proof of the effective 068 definition**; private fingerprints/body review remain required. Unknown policy paths abort rather than being silently deleted. The DDL runs in one transaction with short lock/statement timeouts.

UPSERT is not an exemption: PostgreSQL applies INSERT policy checks to proposed conflict candidates, and the update branch also has UPDATE checks. This is documented behavior, not an executed test of this project's SQL/API. See [PostgreSQL CREATE POLICY documentation](https://www.postgresql.org/docs/18/sql-createpolicy.html). Existing verified profiles may reject a generic UPSERT that proposes verified metadata; ordinary profile PATCH and the current signup path need separate compatibility tests. An UPSERT proposing pending values may cause re-verification under 068. No current frontend workflow was rewritten around this behavior.

Legitimate registration remains expected to work through the existing trusted Auth trigger with safe pending defaults, and permitted direct pending self-inserts remain possible. **Neither expectation is production-validated.** If the actual cloud uses different legitimate insert policies, defaults, forced-RLS behavior or privileged writers, stop and revise the reviewed plan before execution. Current cloud definitions remain unavailable here.

## Validation required before application

Use Stage 7U's read-only catalog queries to inspect every INSERT/UPDATE/ALL policy, effective column privileges, Auth/profile trigger bindings/defaults and function fingerprints. Privately review all SECURITY DEFINER writers and full function bodies; do not publish secrets embedded in definitions.

Under separate hosted-test authorization, verify synthetic-only provenance and disabled external delivery. Apply only reviewed 068 then 069 in that approved test project. Required real database/JWT cases include:

1. Normal resident Auth signup with and without email confirmation produces pending profile and null decision stamps; optional ID-path update works.
2. A designated fictional profile-less Auth account can insert its own legitimate pending resident profile, if that path is intended.
3. Explicit verified/rejected/ineligible initial status, forged verifier/time/notes, another UUID and elevated role are denied without committed profile/directory/notification side effects.
4. New-row and conflict-row UPSERT, including DO NOTHING and mixed permitted/protected fields; prove baseline INSERT/SELECT/UPDATE permissions before attributing denial to the correction.
5. Secretary/Punong decisions and reinstatement work through existing flows; ordinary/archived/unlinked officials, resident self-decisions and anonymous callers are denied. Resident resubmission and own contact edits remain permitted as specified by 068.
6. Trusted signup/service maintenance stays legitimate without using privileged credentials for ordinary-role tests. Check server stamps, directory sync, notification/audit effects and cleanup.

No approved hosted test project/session or disposable database was available/created in this stage. No SQL harness was executed or adapted automatically to production. Existing SQL tests remain preserved. Current production authorization, SQL syntax execution, signup defaults and JWT-backed behavior remain unverified.

Keep private old policy/function definitions and tested backup/recovery evidence. Transaction failure should roll back DDL, but sequence changes/external deliveries and later account decisions are not undone by a schema rollback. Restoring broad old policies reintroduces the weakness; prefer reviewed forward repair rather than an automatic insecure rollback. Any production migration, resource creation, schema transfer, synthetic account setup, test writes or deployment needs separate explicit authorization.

## Files changed

1. `README.md` — current-workflow pointer only.
2. `docs/supabase-only-development.md` — hosted-only instructions.
3. `supabase-migrations/069_resident_profile_insert_security.sql` — prepared additive correction.
4. `src/residents/residentProfileInsertSecurityMigration.test.js` — five static contracts, not PostgreSQL authorization tests.
5. `src/incidents/incidentMigration.test.js`
6. `src/kpcases/kpCaseMigration.test.js`
7. `src/complaints/officialComplaints.test.js`
8. This report.

The three inventory tests now require exactly the additional 069 filename and 62 SQL files; existing historical filename assertions were preserved. No assertion was removed to tolerate arbitrary migrations. No application component changed in Stage 7V.

Migration 068 remains byte-for-byte unchanged: SHA256 `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`. Existing SQL harnesses, seeds, environment configuration and earlier changes remain untouched.

## Results and release status

- Focused: **243 tests / five suites passed**. New contracts check atomic policy-only scope, own/pending/null-metadata conditions, dependency/inventory guards, unchanged 068 and approval-bound hosted instructions.
- Full Jest: **2,624 tests / 118 suites passed**, exit 0, 114.042 seconds. Existing React act/router and expected mocked API diagnostics remain in the suite logs; this is not live browser/SQL evidence.
- Normal production build: **passed**, exit 0, compiled successfully.
- Strict `CI=true` production build: **passed**, exit 0, compiled successfully.
- `git diff --check`: **passed**, including the final review.
- Real SQL/database/JWT authorization tests: **not executed**. Static string contracts and documented PostgreSQL semantics do not prove that the proposed migration executes correctly in the effective Supabase schema.

**Deployment remains NO-GO.** Outstanding blockers are current cloud metadata/private writer review, the known UPDATE issue, the conditional INSERT bypass, unexecuted 068/069 database/API compatibility testing and blocked authenticated application QA. No live database writes, migrations, SMS, software installation/uninstallation, commits, pushes or deployment occurred. Stop here for review.
