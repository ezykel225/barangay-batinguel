# Supabase behavioral SQL tests

These scripts are manual acceptance harnesses for a disposable Supabase preview/test database. They are not migrations and must never be run against production.

## Migration 062

1. Create or select an isolated preview/test database. Do not use production.
2. Apply migrations 001–061 there.
3. Apply `supabase-migrations/062_analytics_insights.sql` there. Migrations 001–062 are the only data/schema prerequisite; no existing application, production-like, seed, or demo rows are required.
4. Run `supabase-tests/062_analytics_behavioral.sql` as a database owner capable of creating transaction-local helper functions and setting local roles.
5. Confirm the final `PASS` row appears and the script reaches `ROLLBACK`.
6. If any numbered assertion raises an exception, do not apply or merge migration 062 for production.

The harness creates synthetic auth users, profiles, officials, account links, residents, people, matters, and Community Credit rows, and contains every fixture change in one transaction. It can run against a schema-only isolated database. A successful run and any assertion failure both leave no committed fixture data; clients that stop automatically on the first error should issue `ROLLBACK` before disconnecting.

## Migration 066

Migration 066 replaces 061's `person_history` and 062's `person_analytics`, so 062 must be applied first. It is independent of 064.

1. Use a disposable, schema-only database. Do not use production.
2. Apply 001–063 and 065 there, then `supabase-migrations/066_person_history_privacy.sql`.
3. From the repository root, run `node supabase-tests/066_build_test_runner.mjs <output-dir>`. It writes `066-run.sql` and `066-negctrl.sql`.
4. Run `066-run.sql`. It must end with the notice `PASS: all N migration-066 contracts passed` and then roll back. Any failure is raised as one message listing every failing TEST number.
5. Run `066-negctrl.sql`. It restores the 061/062 bodies inside its own transaction and reports `NEGATIVE CONTROL failing tests: ...`. The list must equal `EXPECTED_NEGCTRL_FAILURES` in the builder exactly. A shorter list means an assertion cannot detect the disclosure or identity defect it exists for.
6. Repeat steps 2–5 on a second disposable database with 064 also applied before 066, to show 066 does not depend on whether 064 runs.
7. Regression: on 001–065 without 066, `062_analytics_behavioral.sql` and the 063 and 065 harnesses must still pass. After 066, these 062 assertions are SUPERSEDED BY DESIGN and are expected to fail: TESTS 9–12, 20–27 and 35 (the historical-review fields 066 removes), and TESTS 77–78 (ordinary officials no longer receive complaint matters at all, rather than receiving them with a masked location). TEST 5 still holds: `distinct_linked_matters` keeps its 062 meaning. Each superseded assertion is mapped to the 066 contract that replaces it in `SUPERSEDED_062` (in the builder); a Jest guard checks that every one exists. `062_analytics_behavioral.sql` is not edited: it remains the record of the pre-066 contract.
8. Rollback rehearsal: apply `supabase-tests/066_rollback_contingency.sql` to a database that has 066. Confirm both RPCs match their 061/062 definitions and both helpers are gone, then re-apply 066 and run step 4 again.

The rollback contingency re-opens the complaint disclosure that 066 closes. It is for an emergency only, and needs separate approval.
