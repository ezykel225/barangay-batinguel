# Stage 7Y.3 ? Production migration history reconciliation

November 10, 2026. Preparation only. Branch `defense/scope-cleanup-20261106`; HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`. No hosted connection or SQL execution in this stage. Existing work preserved.

## Evidence and limits

The owner reports a successful read-only production ledger query: **88 version rows**, earliest `20260701073425`, latest `20261017164617`. The owner also reports **64 RLS policy rows** from the previous inventory. These are user-reported summaries, not exports independently examined here. The full version list and actual policy rows remain outstanding.

Local `supabase-migrations/` contains **62 SQL files: 001?060, 068 and 069**. Names use a three-digit local sequence plus descriptive suffix. Files 061?067, including 064, are absent from this checkout. Both security corrections are prepared and remain unexecuted according to prior reports; no new hosted confirmation was obtained. No timestamp-prefixed migration files or verified timestamp-to-number mapping was established in the inspected migration directory.

Production versions have a 14-digit timestamp-shaped convention, unlike local numbers. The reported bounds have the shape July 1 through October 17, 2026; these identifiers do not establish application time, timezone, creation time, execution success of every statement or current schema correctness. A ledger version can differ from a local filename. One-to-one correspondence is not established: SQL changes can be split, combined, manually applied or registered separately. These are possible explanations, not findings about this project.

**88 is not evidence that local migration 088 exists, that all files through 069 are applied, or that 26 migrations are missing locally.** The 64-policy count establishes neither policy correctness nor full table/RLS coverage. Earlier inventory can expose only the final result set in the editor, so policy output alone is not the missing relation/function output.

Even the full version list will identify exact ledger identifiers, duplicates/gaps and support comparison to timestamped deployment artifacts if available; it will not by itself map numeric files to those identifiers. Exact matching needs trustworthy migration names/history/deployment evidence and semantic comparison of current object definitions, bindings and fingerprints to local SQL. No migration statement arrays, raw function bodies or sensitive records should be posted publicly. Do not mark versions applied, replay local files or repair the ledger merely to align numbering.

## Prepared focused inventory files

1. `supabase-tests/production_required_relations_readonly.sql`: same 45 unique expected public relation names and LEFT JOIN/name-resolution structure as section 3 of the existing inventory. Returns `required_relation`, `relkind` and `PRESENT`/`MISSING`. A PRESENT view or unexpected relation kind is not a table-compatibility pass. Columns, policies, defaults and privileges still need reconciliation.
2. `supabase-tests/production_required_functions_readonly.sql`: same 104 unique expected public function/helper names and catalog aggregation as section 4. Returns `required_function`, `status` (`PRESENT`/`MISSING`) and `overload_count`. Counts only ordinary functions (`prokind=f`), not procedures/aggregates. Correct overloads, named arguments, return fields, grants, schema exposure/cache and backend authorization remain unverified.

Both are standalone, one-result-set scripts with `BEGIN READ ONLY`, transaction-local 30-second statement timeout, 3-second lock timeout, `search_path=pg_catalog`, and `ROLLBACK`. Only the earlier detailed PRESENT labels were simplified. The source inventory is unchanged.

## Statement safety review

- BEGIN READ ONLY changes transaction mode; no persistent changes.
- SET LOCAL statements affect only that transaction, not persistent session/project configuration.
- WITH ... VALUES defines an in-memory query input, not a table or DML operation.
- Relation query reads pg_class and resolves names using the PostgreSQL catalog built-in to_regclass. It never selects from the named application tables. Missing relations normally produce MISSING; schema permission errors can still abort the query.
- Function query reads pg_namespace/pg_proc and counts matches. It does not resolve or execute the listed RPCs, even ones named save, approve, prepare or send.
- ROLLBACK ends the transaction/settings. No DDL, writes, grants, role impersonation, Auth changes, application function calls or external notifications occur.

Use the normal authorized SQL Editor role, usually postgres, with catalog visibility and schema access; no service key or credential needs to appear in the SQL. Do not grant additional permissions to bypass an error. Read-only queries may consume resources, acquire ordinary locks and create platform query logs. SQL/database execution was not tested here.

## Collection and next reconciliation

After owner approval, confirm the intended existing production project privately and run each complete focused script separately. Collect all **45 relation rows** and **104 function rows**, not only missing entries. Save CSV/text privately with date and role. These scripts expose schema names/counts only, no resident names, UUIDs, complaint details, tokens, bodies, defaults or application rows. Review metadata before sharing privately.

Supply separately: the full version-only export (88 rows as reported), both focused outputs, and the 64-policy metadata export. Do not supply passwords, keys, connection strings or migration statement arrays. Preserve exact errors and empty results; permission errors are not proof of absence or authorization correctness. If a transaction is left aborted/open, issue ROLLBACK; do not create stubs or change policies.

Reconcile by object rather than assuming numeric/timestamp equivalence. Categorize required-present, required-missing, historical/potentially obsolete, and unresolved. Any missing item requires dependency/definition review, not an automatic migration. Extra/retired objects and records remain preserved. Security order remains 068 ? 069 only after prerequisite, authorization and recovery validation plus separate approval. No 064 or automatic bulk replay.

## Validation and status

Offline extraction checks confirmed 45/104 unique names and unchanged query structures apart from the PRESENT labels. No application source changed; Jest/build were not rerun for these query/document-only artifacts. `git diff --check` passed (exit 0; existing LF/CRLF warnings). Existing security migrations remain unchanged. **Deployment remains NO-GO**: ledger bounds and policy counts do not close schema compatibility or real database/JWT authorization gaps.
