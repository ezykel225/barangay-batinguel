# Stage 4A — targeted mobile fix and read-only QA recovery

Branch `defense/scope-cleanup-20261106`; unchanged HEAD `c1cc57f06fc73d990717b14b6a50c68aaad6eb08`.

## Mobile fix

Only application/test files changed this stage:

- `src/components/Navbar.jsx`: reference to the existing mobile trigger; keydown listener only while its menu is open; Escape closes the menu and focuses that trigger; listener removed on close/unmount. No styling or navigation change.
- `src/components/Navbar.test.js`: three new regressions for Escape/focus restoration, closed-menu Escape not stealing focus, and existing navigation-link closure.

Compared against the Stage 4 preservation manifest, these are the only pre-existing files whose hashes changed. All other prior changes, handover and diagnostics remain preserved. Generated Stage 4A scripts/logs and this report are additional untracked files.

## Verification

- Focused Navbar Jest: **17/17**, 1 suite, exit 0.
- Full Jest: **2,464/2,464**, 101 suites, exit 0; 110.168 seconds. Existing React test warnings remain.
- Production build: **passed**, exit 0, compiled successfully.
- `git diff --check`: **passed**; pre-existing LF/CRLF advisory only.
- Real headless Chrome 156.0.8078.80 / installed Playwright, **375 × 900**: Escape closure and trigger focus passed twice; explicit close button passed; Officials link navigation and drawer closure passed; no page-level overflow; zero uncaught page errors.
- The served local bundle was checked for Stage 4 loopback/placeholder configuration and absence of the known production backend URL. Browser requests outside the local frontend were blocked. This verifies the mobile interaction, not authenticated backend behavior.
- Evidence: `%LOCALAPPDATA%\Temp\barangay-stage4a-evidence-20261106\results.json` and `375-menu-closed.png`. Generated scripts/logs: `supabase-tests/runners-out/stage4a-*`.

## Read-only environment findings

Reviewed the Stage 4 report and existing `rc3-setup.mjs`, `rc3-react.cjs` and gateway infrastructure. The previously referenced `docs/release-candidate-step3.md` is absent in this checkout; available runner sources are the reconstruction evidence. **Do not rerun the setup script blindly**: it creates databases/roles, credentials and containers and therefore exceeds this investigation's approval.

- Docker CLI exists; active context is `desktop-linux`.
- User-installed Docker Desktop executable exists under `%LOCALAPPDATA%\Programs\DockerDesktop`.
- No Docker process was returned. Engine access failed because `//./pipe/dockerDesktopLinuxEngine` does not exist. This supports a stopped/unavailable Docker Desktop engine; it does not diagnose why Desktop stopped or prove containers/data are lost.
- Of the inspected ports, only frontend **3001** was listening; PostgreSQL 5455, gateway 55421, PostgREST 55430/55530 and Auth 55499 were not.
- Private local `config.json`, `accounts.json`, `auth.env` and `rest.env` exist. Secret values were not displayed or changed.
- Boolean metadata checks confirmed expected synthetic database configuration and synthetic email domains for all saved accounts. Saved roles include two residents, three officials and one nurse; **no Tanod account appears in this manifest**. This does not prove no Tanod fixture exists in the unavailable database.
- The saved local anonymous JWT is **expired**. Recovery needs secure local renewal and consistent frontend configuration after engine/database inspection; no token was renewed in this stage.
- Database existence, contents, schema state and synthetic-only data cannot be confirmed while the engine is unavailable. No authenticated login/API workflow was attempted.

## Recovery options, safest first

1. **Reuse the existing local synthetic infrastructure**, after separate approval to start Docker Desktop and inspect existing containers/volumes read-only. Check actual database identity and synthetic-only inventory, resource limits, migration state and V1 compatibility before starting only the known test services. Review service configuration privately; renew the local anon token securely; point the frontend exclusively at the verified isolated gateway. Use saved fictional accounts privately. Locate an existing fictional Tanod account, or request separate fixture approval if none exists. Do not create/restore databases or execute migrations as part of an unreviewed startup.
2. **User-operated browser QA against that same verified local backend** if automation has a later limitation. Automation currently works, so manual testing is an alternative, not a requirement. After isolation is proven, use the checklist below and the full Stage 4 width checklist.
3. **Separately approved disposable local recovery** only if existing test containers/data are unusable. Review private baseline provenance, restore process and resource limits before any database creation/restore. This is not currently authorized.

Do not substitute mock authentication or production accounts for missing local services. A production-connected frontend is unsuitable for fictional workflow writes. No new hosted environment or installation is needed on current evidence.

## Authenticated checklist still blocked

After safe recovery, at 375 and 1024 px initially:

1. Resident: login, refresh, logout; fictional document/complaint submission and status; V1 score/ledger; profile/settings and dialog validation/focus.
2. Secretary/ordinary official: document transitions; complaints/KP; resident verification; incidents/blotter; Tanod administration; V1 permitted actions; SMS interface without sending; Reports and historical Activity Log.
3. Tanod: login, schedules, fictional incident reporting and blocked Official access.
4. Existing Nurse fixture: explicit refusal/sign-out with no loop or privilege escalation.
5. Resident-to-resident privacy and role restrictions through both UI and isolated API; historical reservation notification fallback, preserved audit labels and stale return paths after login.
6. Populated tables/dialogs/maps/charts at all eight required widths. Earlier offline/component passes must not be relabeled as authenticated passes.

## Risks and stop state

- **P0:** none demonstrated by this limited verification; production/backend security remains unverified, not certified safe.
- **P1:** authenticated retained workflows and role/privacy boundaries remain a defense/release verification gate. Engine recovery, expired local token and Tanod fixture identification are prerequisites.
- **P2:** confirmed public mobile Escape/focus defect is resolved at 375 px. Comprehensive authenticated accessibility and all-width populated-layout verification remain outstanding.

No production access, migration, configuration/Auth/RLS change, database creation/restore, installation, infrastructure startup, commit, push, merge or deployment occurred. No Stage 5 work. Await separate recovery approval.
