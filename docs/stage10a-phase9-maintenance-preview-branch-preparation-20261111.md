# Stage 10A Phase 9 — maintenance Preview branch preparation

Prepared November 11, 2026. No branch, commit, push, deployment, promotion, hosted configuration change, or SQL execution is authorized by this document.

## Readiness result

The corrected overlay is a standalone Vercel static deployment. Its root `vercel.json` explicitly allowlists only root `maintenance.html` through `@vercel/static`; Vercel documents that when `builds` is specified, only declared build outputs are included. The React build, static bundles, migrations, local reports, environment files, backups, and other repository content are therefore not deployment outputs. Because the maintenance file is the only filesystem output, the catch-all rewrite maps `/`, `/index.html`, nested application routes, old static-asset paths, and arbitrary paths to that page; catch-all headers add no-store/noindex controls.

Confirmed by the owner: project `ezequels-projects/barangay-batinguel-e-processing`, production branch `main`, current deployment `c1cc57f`, Preview promotion available, Hobby Instant Rollback available, and current rollback target `eb8652e`. Both abbreviated commits exist locally. The maintenance branch must start at `c1cc57f`, not at the dirty current branch.

## Exact isolated branch procedure — run only after approval

Use a separate worktree so the existing dirty workspace is neither switched nor copied. In PowerShell:

```powershell
$MaintenanceWorktree = 'C:\Users\Ezequel\Documents\barangay-batinguel-maintenance-20261111'
$MaintenanceBranch = 'ops/maintenance-20261111'
$SourceWorkspace = 'C:\Users\Ezequel\Documents\barangay-batinguel'

git worktree add -b $MaintenanceBranch $MaintenanceWorktree c1cc57f
Copy-Item -LiteralPath "$SourceWorkspace\ops\vercel-maintenance\maintenance.html" -Destination "$MaintenanceWorktree\maintenance.html"
Copy-Item -LiteralPath "$SourceWorkspace\ops\vercel-maintenance\vercel.json" -Destination "$MaintenanceWorktree\vercel.json"
git -C $MaintenanceWorktree status --short
git -C $MaintenanceWorktree diff --check
git -C $MaintenanceWorktree diff -- maintenance.html vercel.json
```

Stop unless `git status --short` shows exactly:

```text
?? maintenance.html
?? vercel.json
```

Validate locally before staging:

```powershell
Get-Content "$MaintenanceWorktree\vercel.json" -Raw | ConvertFrom-Json | Out-Null
Select-String -Path "$MaintenanceWorktree\maintenance.html","$MaintenanceWorktree\vercel.json" -Pattern 'service_role|SUPABASE_|REACT_APP_|postgres(ql)?://|BEGIN [A-Z ]*PRIVATE KEY' -CaseSensitive:$false
git -C $MaintenanceWorktree ls-files --others --exclude-standard
git -C $MaintenanceWorktree diff --check
```

The secret-pattern command must return no matches, and the untracked-file list must contain only the two root files. Local parsing cannot reproduce Vercel's hosted builder/routing pipeline; Preview acceptance remains mandatory.

After the owner separately approves branch creation, commit, push, and Preview deployment:

```powershell
git -C $MaintenanceWorktree add -- maintenance.html vercel.json
git -C $MaintenanceWorktree diff --cached --name-status
git -C $MaintenanceWorktree diff --cached --check
git -C $MaintenanceWorktree commit -m "chore: prepare temporary maintenance page"
git -C $MaintenanceWorktree push -u origin $MaintenanceBranch
```

Stop before commit unless the staged name-status contains exactly two additions: `maintenance.html` and `vercel.json`. Do not stage with `git add .` or `git add -A`. Do not merge the branch into `main`.

## Preview acceptance

1. Confirm Vercel associates the deployment with the named project and branch, and labels it Preview—not Production.
2. Build logs must show the static builder for `maintenance.html`, no `react-scripts build`, and no application/migration artifact publication.
3. In a private browser with DevTools open, test `/`, `/index.html`, `/official`, `/resident`, `/static/js/main.js`, and `/this-path-must-not-exist`.
4. Every path must return the same maintenance content. No React UI, login form, JavaScript bundle, Supabase request, resident data, configuration value, or key may appear.
5. Responses must include `Cache-Control: no-store, max-age=0, must-revalidate` and `X-Robots-Tag: noindex, nofollow, noarchive`.
6. Refresh and direct navigation must behave identically. Test a query string as well.
7. Record the Preview deployment ID/URL and obtain a second observer's confirmation. Do not promote on any failure.

## Promotion and rollback gates

Immediately before promotion, verify production still serves `c1cc57f`. Promote only the accepted maintenance Preview. Immediately afterward, verify the production domain serves maintenance for the full acceptance route set and then open Instant Rollback without confirming it. On Hobby, require the displayed rollback target to be `c1cc57f`; if it remains `eb8652e`, is blank, or differs, do not run database migrations and investigate.

After database validation and owner approval, Instant Rollback must target `c1cc57f`. Verify normal public routes and authorized login/read workflows in a private browser before resuming writes. Record that Vercel disables automatic production-domain assignment after rollback; restore it later only through an owner-approved Undo Rollback/promotion of an approved normal deployment, never the maintenance deployment.

## Approval and blockers

The owner must explicitly approve all four future actions: (1) creating the separate worktree and branch from `c1cc57f`; (2) staging and committing exactly the two maintenance files; (3) pushing that temporary branch to the connected remote, which triggers a Preview deployment; and (4) testing that Preview. Promotion remains a later, separate approval.

Current blocker: hosted builder and route behavior cannot be established locally with finality. The Preview must pass every acceptance criterion, and after promotion `c1cc57f` must appear as the new Hobby rollback target, before migration execution can be considered.
