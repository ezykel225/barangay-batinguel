# Stage 15 Gate A — Production Backup and Security Preflight

Date: 2026-11-12  
Result: **NO-GO / stopped before hosted connection**

## Safety result

- Intended production project reference: `mpcyqwasurhtdztzobwg`.
- The previously used connection method was identified from local evidence as PostgreSQL 17 over the Supabase session pooler, with the endpoint and project-qualified database user tied to the expected project reference, port 5432, SSL, and interactive password entry.
- The database password was intentionally not persisted. No standard `pgpass` file, relevant database credential environment variable, or other protected local credential source is currently available.
- Because Gate A requires reuse of secure credential handling and forbids guessed credentials, execution stopped before `pg_dump`, `psql`, or any hosted connection was attempted.
- No production SQL, migration, RPC, application write, Vercel change, deployment, or hosted configuration change occurred.

## Gate A evidence

| Check | Result |
|---|---|
| Production project reference | Confirmed locally as `mpcyqwasurhtdztzobwg` |
| PostgreSQL clients | PostgreSQL 17.11 (`pg_dump`, `pg_restore`, and `psql`) |
| Fresh backup created | **NO — not attempted after credential stop condition** |
| Original fresh-backup path | None |
| Original size / SHA-256 | Not applicable |
| Verified second-copy path | None |
| Second-copy size / SHA-256 | Not applicable |
| `pg_restore --list` | Not applicable; no fresh archive exists |
| Fresh archive TOC count | Not applicable |
| Read-only security preflight | **NOT RUN** |
| Schema or policy drift | **UNKNOWN for this Gate A attempt** |
| Migration 068 SHA-256 | **PASS** — `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44` |
| Migration 069 SHA-256 | **PASS** — `F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F` |

The migrations were hashed locally only. Neither migration was edited or executed.

## Git integrity

- Source repository: branch `defense/scope-cleanup-20261106`, HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.
- The source working tree already contained 436 status entries before this report. They were preserved; this report is the only intentional Gate A repository change.
- Frozen release candidate: branch `release/candidate-20261112`, HEAD `d869b3cc6c9975982adf52b45279774076d2f37f`, clean working tree.
- The release-candidate working tree was not modified.

## Required owner action

Before Gate A can be retried, the owner must make the existing production database password available through a protected, temporary PostgreSQL credential mechanism for the already verified session-pooler endpoint—preferably a tightly ACL-protected temporary `pgpass.conf`—without placing the password in chat, command arguments, Git, logs, or project files. The credential file should be removed by the owner after the backup and read-only preflight complete.

After that secure prerequisite is available, Gate A must restart at the connection/identity check, then perform the fresh custom-format backup, archive listing, independent second-copy verification, and reviewed read-only preflight. Separate approval is still required for Gate B.

## Recommendation

**NO-GO for requesting Gate B approval.** Gate A is incomplete because no fresh backup or current production preflight was produced. Existing November 11 backups remain preserved, but their untested full-restoration limitation is unchanged.
