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
