# Hosted Supabase development workflow

The CRA application requires Node/npm and its **existing hosted Supabase project**. Docker, a local PostgreSQL server, Supabase CLI and database restoration are not startup requirements. Supabase itself uses PostgreSQL; its migrations, policies/functions and SQL tests remain essential source.

## Run locally

1. Keep the existing `.env` private and unchanged. The app reads `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` at build/start time. Never put a service-role key in React. Do not copy values into chat, Git or logs.
2. Use the installed dependency tree. On a fresh checkout, install the locked Node dependencies with `npm ci`; review failures instead of using forced dependency upgrades.
3. Run `npm start` (`npm.cmd start` in PowerShell if script execution policy blocks npm.ps1). Reuse/inspect an existing dev server before starting another. Restart CRA after separately approved environment changes; this workflow does not require changing `.env`.
4. The existing URL points at hosted data. Do not treat localhost as an isolated database. Resident/Official navigation can mark notifications read, and Resident Documents can update viewed timestamps. Obtain explicit approval for those metadata writes or use an approved testing environment.

## Local checks, without backend mutations

```powershell
$env:CI='true'
npm.cmd test -- --watchAll=false --runInBand
npm.cmd run build
git diff --check
```

For a normal build set process-local `CI=false`; for strict build use `CI=true`. Do not disable ESLint. These commands do not certify hosted SQL authorization. Keep generated logs/screenshots/fixtures out of release commits unless specifically reviewed.

## Read-only Supabase inspection

Use the existing project's Dashboard/SQL Editor under the owner's authorized account. Confirm the project before any SQL. Use `begin read only`, short timeouts, metadata-only SELECTs, and `rollback`. Stage 7U contains exact inspection queries for policies, grants, triggers, defaults and function hashes. Do not run behavioral authorization harnesses against production; they contain writes even if rolled back. Never share raw resident/Auth rows, ID paths, tokens or credential-bearing function bodies.

## Security migration preparation

068 (UPDATE guard/policies) and 069 (self-profile INSERT policy) are **prepared, not approved for execution**. Review current cloud definitions, all privileged profile writers and backups first. Preserve SQL harnesses; they can support an authorized Supabase-based rehearsal, but their current psql/session setup is not automatically runnable in SQL Editor. PostgreSQL syntax, RLS and real JWT-backed API tests remain separate from Jest/static checks.

A separate hosted Supabase test project is optional **only after explicit authorization** for resources, schema-only transfer, fictional Auth accounts, outbound SMS/email/webhook containment and cleanup. Do not create it automatically or populate it with production records. Use separately approved private test configuration; do not replace the app's `.env` or assume the old local-fixture scripts target a new project safely.

After successful isolated testing, obtain separate approval for production backup/recovery checks, exact migrations and deployment. Do not bulk-apply numeric migrations; 064 remains excluded.

## Historical local QA artifacts

`supabase-tests/runners-out/rc3-setup.mjs`, `rc3-accounts.cjs`, `compat-clone.cjs`, the rc2 orchestrators and `qa_isolated_map_fixture.cjs` belong to prior local rehearsals. They are **not current development setup instructions**. Some create accounts/databases or read private local manifests; do not run them against hosted Supabase. Preserve them and private archives until separately reviewed for disposal/adaptation. Never delete SQL based on a filename containing `compose`: migration 012 pins the name-composition function's search path and has nothing to do with Docker Compose.
