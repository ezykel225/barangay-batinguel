-- OPTIONAL PHASE 2. PREPARED ONLY, NOT EXECUTED.
-- Run ONLY after the inventory confirms the ledger and its version column.
-- If absent/inaccessible, STOP: do not create a ledger or grant privileges.
-- This reads migration-version metadata, never names or statement arrays.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local search_path = pg_catalog;
select version from supabase_migrations.schema_migrations order by version;
rollback;
