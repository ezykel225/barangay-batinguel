# Defense notes — architecture and security evidence

Prepared November 7, 2026, for the November 11 capstone defense. These notes do not authorize deployment or access to either existing Supabase project.

## Architecture

Barangay Batinguel E-Services uses React 19/Create React App and React Router for its public, Resident, Official and Tanod interfaces. The existing Vercel project hosts compiled frontend assets. Supabase provides managed PostgreSQL, Auth, Storage and server-side functions/integrations. There is no Docker or local PostgreSQL requirement for running the frontend.

Supabase centralizes identity, records, relationships and database access policies. The browser uses a publishable/anon key plus the signed user session; a publishable key is not an administrative credential. Service-role secrets must remain server-side and must never be used to represent an ordinary user in testing.

## Intended security layers

- Supabase Auth establishes identity and sessions; the application reads the trusted profile role for navigation.
- Frontend route/action checks improve usability. They are not the database authorization boundary.
- RLS is intended to constrain rows by identity/role. PostgreSQL grants also matter.
- Server-side helpers resolve Secretary/Punong permissions through official account links and directory positions, rather than names or editable committee text.
- Triggers are intended to protect sensitive fields, verification metadata, synchronization and history.
- Community Credit V1 displays the server-returned score and ledger. Recorded complaints or incidents alone do not establish wrongdoing or automatically create deductions.

## What can be claimed

The repository contains these controls and their regression contracts. Local Jest tests and normal/strict builds pass as recorded in Stage 7X. Earlier browser evidence is explicitly offline/mock evidence. Real cloud definitions may differ from repository files; current deployed authorization was not inspected in this stage.

Migrations **068 and 069 are prepared and unexecuted**. 068 targets overbroad verification UPDATE access and protected metadata. 069 targets ordinary self-profile INSERTs that would otherwise evade an UPDATE guard. Their static tests check intended source conditions, not whether PostgreSQL actually enforces them.

Suggested explanation:

> We identified verification authorization gaps, prepared database corrections and tested frontend/source contracts. We have not applied or verified those corrections in a real database. We are therefore withholding deployment approval rather than presenting static tests as proof of database security.

## Demonstration boundaries

Use the existing TEST ONLY screenshots and isolated component-test evidence to explain workflows, responsive layouts and intended role restrictions. Label them as offline fixtures. Keep normal production components connected to their real adapters; do not introduce mock authentication or fake persistence to simulate successful cloud behavior. Do not show resident identities, ID documents, passwords or tokens.

The two existing Supabase projects remain untouched. There is no approved disposable database under current constraints. Live registration, verification, notification writes, SMS and hosted permission tests are not part of this stage. A normal-looking page is not proof of authorized backend access; some dashboard navigation itself writes read/view metadata.

## Before deployment can be recommended

Current effective policies/grants/triggers/defaults and privileged writers must be reviewed under future separate approval. A legitimately authorized disposable environment must then validate migration order, real signed-JWT role tests, normal signup, negative INSERT/UPDATE/UPSERT/RPC cases, downstream effects and cleanup. Backup/restoration and forward-repair plans plus explicit production authorization are separate gates. No existing project should be paused, deleted or repurposed simply to obtain testing capacity.

**Current decision: NO-GO for production deployment/security sign-off.** An honest account of implemented controls, known weaknesses and evidence limits is the appropriate defense position.
