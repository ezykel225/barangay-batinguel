# Step 6 — candidate integrity and defense readiness

Review date: 2026-11-04. Defense target: 2026-11-11.
Branch: `release/final-defense-local-20261104`.
Reviewed HEAD: `7b47bebdcf8219f20cb1c7d8126ff8dea162528e`.
This is a readiness review, not production or remote-change authorization.

## Candidate findings

- The Step 5 inventory matches the actual main-to-HEAD diff: 171 paths.
- All reviewed checkpoints remain ancestors. Step 5 records the exact 13 PR
  heads; #62 includes #58 through b344659. No duplicate 065 replay is needed.
- Required pending files are present: 062 → 063 → 065 → 066 → 067. No 064
  migration file is in HEAD; blocked #54 is not a candidate ancestor.
- Public Home/About/Officials/E-Services/announcements/events, complaint
  tracking, public aggregate safety, login/signup/reset routes are retained.
  Resident, Official and Tanod routes remain role-protected. Official navigation
  includes documents, complaints/KP, incidents/person linking, residents, credit,
  Tanod management, safety/analytics, content, officials and activity log.
- Retired Nurse, health and reservation pages remain removed from the route
  imports and retained scope. Keeping historical database tables/migrations is
  not restoration of retired portal functionality. Public aggregate safety and
  protected precise incident map remain separate data surfaces.
- Against QA checkpoint 828ea52, changes are only historical 059–061 status
  comments and matching tests. Runtime frontend/RPC, auth, privacy, V1/V2,
  responsive, map-lifecycle and Kapitan fixes are unchanged. The five pending
  migration blobs are identical to the validated checkpoint.
- Existing Step 5 evidence: 2,684 Jest tests / 120 suites, production build,
  48 static checks, nine read-only authenticated local API checks passed.
  Previous SQL/API/fixture rehearsals were not repeated for this review.
- Candidate-history patch scan (verified main..HEAD) found zero private-key,
  password-bearing PostgreSQL URL, access-token or JWT literals. No raw/restore
  schema dump, private env, temporary fixture runner, runners-out, Supabase temp
  metadata or SMS seed is tracked. `.env.example` is an intentional placeholder
  template, not a credential file. Reviewed fixtures are fictional SQL/tests;
  no production resident export was introduced. This scoped pattern/source
  review is not a forensic guarantee about pre-existing repository history.

No confirmed new P0 implementation defect was found. No code changes were made.
Do not infer production configuration or security state from these local checks.

## Remaining P0/P1 gates

P0 production go/no-go gates are still unfulfilled: explicit cutover approval,
hosting deployment controls, required remote checks/approvals, fresh authorized
production prerequisite review, private recoverable backup and verified restore,
and approved failure/recovery ownership. These are release prerequisites, not
newly discovered code defects. Production release is NO-GO until satisfied.

P1 functional/readiness gaps: browser completion of document processing,
complaint/KP transitions, full auth lifecycle, person/profile role boundaries,
official credit approvals, Tanod-user workflows and critical responsive states.
No additional API-only test can certify these rendered interactions.

## Exact browser evidence and gaps

Browser discovery in this review returned “The browser access host is
unavailable.” **No new browser interactions or screenshots were performed.**
No dependency installation or alternate production fallback was attempted.

Preserved user-reported Chrome evidence on isolated port 3001:

- 1024px Official Dashboard refresh: status HTTP 200 / “Status not published”.
- 1024px Resident credit: correction submitted and displayed as submitted.
- TEST ONLY incident marker and fictional popup opened; viewport unspecified.
- 375px Record Incident fits; required validation prevents incomplete submission
  and incident count remains unchanged.
- Mobile Escape closes navigation; exact width/focus return unspecified.
- Resident credit visual layout: 320, 375, 414, 768, 1024, 1280, 1440, 1920px.
- Selected Official credit, incidents, map, analytics and patrol views: visual
  checks at 375/1024px only.

Screenshots were reviewed in conversation per the user-provided QA record but
are not repository artifacts. Full application-wide certification is incomplete.
The matrix in responsive-audit.md remains authoritative for untested cells.

### Next manual session — isolated synthetic backend only

Use http://127.0.0.1:3001/login after checking service health and local backend
port 55421. Read fictional credentials privately from manual-login.txt under
the RC3 temp directory; do not paste credentials into reports. Never use port
3000 or a production account. Capture screen/width/height/role, screenshot,
expected/actual result, request status, console errors and any new record refs.

| Priority workflow | Steps and pass condition still required |
| --- | --- |
| Resident session | Login A, refresh, logout, Back/reload, then login B. Verify logout protection, no stale A records or cached role; test expired/transient-session recovery locally. |
| Document lifecycle | A opens Document Requests; validate required fields, submit TEST ONLY purpose, retain reference. Secretary processes that exact request using supported actions; A sees updated status. Test forbidden ordinary-role action; never change roles to bypass it. Printing/claiming requires its own displayed eligibility checks. |
| Complaint/KP | A files a fictional complaint and sees reference/status. Secretary opens it, completes factual screening and permitted disposition, and opens KP only when the actual workflow permits. Confirm audit/history and A's updated status; B must not see A's private detail. Do not fabricate legal eligibility or findings. |
| Unified profile/linking | Secretary opens the fictional resident's Information, History, Analytics, Community Credit tabs; switch rapidly and keyboard-navigate tabs. Confirm the same UUID, neutral witness role and recorded outcome. Ordinary official must see restricted complaint data and blocked protected credit. This is an official profile dialog, not a resident-accessible private-history entitlement. |
| Credit official actions | Select fictional resident, inspect active model label, history and remaining annual cap. Verify activity through existing RPC-backed UI; award once, check ledger, retry safety and ceiling. Use a distinct authorized reviewer for policy/rule/correction approval; verify self-review refusal. Do not activate a policy. |
| Tanod | Secretary checks roster/schedule. A dedicated fictional Tanod login is not yet provisioned by the six-account RC3 setup; provision it through approved local identity/link workflow before claiming check-in/out, incident reporting or My Duty UI passed. |
| Mobile interaction | At 375px, test menu open/backdrop/route close and Escape focus return, keyboard order, long dialog scroll, Cancel, save validation and nested profile/dialog focus. Repeat primary desktop actions at 1024px. |
| Map/analytics | Use existing mapped/unmapped TEST ONLY records; test zoom, keyboard popup/list access, sidebar reveal/resize, rapid navigation during zoom; change time/category/area, reset, drill down, keyboard-scroll data tables. |

The isolated gateway currently provides Auth/REST only. Storage uploads, password
recovery email delivery, Realtime and Edge Functions are not validated by it.
Report those as environment-limited until a safe local service exists; do not
turn unavailable service errors into successful empty states.

### High-risk responsive states to finish

At all eight widths retain the existing visual evidence and add only missing
state evidence: long titles/names and dense tables, open action menus at viewport
edges, document/KP previews, validation errors, nested/short-height dialogs,
mobile drawer focus return, profile tab transitions, chart tables/drilldowns and
map resize/zoom teardown. Test 320px forms carefully; 375px incident fit alone
does not certify 320px or all dialogs. Test desktop navigation across 1024px to
1280px and full 1440/1920px views. All untested public/portal matrix rows remain
pending; a visual credit gauge pass does not certify an entire portal.

## Go/no-go release checklist — no actions executed here

- [ ] Freeze/review exact candidate SHA, cumulative file inventory and pending
  SQL hashes. Preserve excluded files and recovery checkpoints.
- [ ] After separate authorization, re-read live PR tips/bases and required
  approvals/checks. Dependency order: #52 → #55 → #56 → #53 → #57 → #58 → #59 →
  #60 → #61 → #62 → #63 → #64 → #65 → local 067/responsive/QA follow-up.
  Preserve shared #58/#62 ancestry, keep #54 blocked. Do not blindly replay or
  retarget all PRs at once.
- [ ] Verify Vercel and any other hosting automatic deployment controls BEFORE
  any future push/PR/main change; remote CI preparation must not trigger cutover.
  Existing workflow runs static/Jest/build on PRs and main pushes, or dispatch;
  merely pushing an integration branch is not proof CI ran. It does not execute
  PostgreSQL behavioral/concurrency harnesses. No private baseline goes to CI.
- [ ] Run remote CI for the approved exact candidate; review results rather than
  reusing parent-PR green status. Finish the critical manual QA matrix.
- [ ] Obtain separate authorization for production read-only prerequisite/state
  review; confirm correct project, installed migrations, grants, owners,
  extensions, API discovery and current V1 policy. No inspection occurred here.
- [ ] Privately back up schema/data, required Auth state, storage and config;
  prove restore in a protected isolated environment, with recovery owner,
  RPO/RTO and treatment of post-backup writes. Schema-only evidence is insufficient.
- [ ] Approve maintenance/access restriction, application rollback artifact and
  database forward-repair/recovery plan. Record last verified migration commit.
- [ ] Authorized database owner applies only 062 → 063 → 065 → 066 → 067 with
  per-file stop-on-error and post-commit checks. Never fill the 064 gap. Do not
  rerun an uncertain CREATE-based migration without inspecting authorized state.
- [ ] Verify V1 score/enrollment/history preservation and no automatic V2
  activation. Verify Auth/API privileges and RPC discovery before frontend rollout.
- [ ] Under separate authorization retire obsolete Nurse sign-in/refresh sessions
  and account access; verify behavior of already-issued access tokens. UI denial
  is not token revocation. Preserve historical attribution, do not delete linked
  profiles or grant official roles as a workaround.
- [ ] Keep SMS_BROADCASTS_LIVE_ENABLED unset/false. No real SMS is authorized.
- [ ] Obtain explicit production frontend deployment and go-live authorization.
- [ ] Perform authorized post-release smoke: public routes, login/session switch,
  role denials, document/complaint data boundaries, maps/analytics, V1/V2 labels,
  profile/credit RPCs, audit events, console/network monitoring. Production writes
  require a separately approved identity/data plan; no real-record demo.

If a migration fails, stop; roll back only its still-open failed transaction.
Earlier committed files remain committed. If commit outcome is uncertain, inspect
state before retry. Prefer reviewed forward repair. Frontend rollback does not
restore backend grants. Reversing 063/065 can reopen retired access; reversing
066 can reopen private-history disclosure; 067 uninstall is not safe once V2
records exist. Do not run contingency SQL on real data merely because local
rollback tests passed. Preserve immutable credit history and require recovery
approval before restore or emergency policy operations.

## Defense demonstration — 12–15 minutes, synthetic local environment

Rehearse this script before November 11. Preflight services, private credentials,
references, actor permissions, fixture state and audit read access. Present only
working, rehearsed workflows; stop and disclose a blocker instead of fabricating
a successful result. Use a visible “ISOLATED / SYNTHETIC DEMO” context and TEST
ONLY purpose/narrative labels. Do not change production or enable live SMS.

1. **Public website / E-Services (1 minute).** Show Home, announcements/events,
   services and public safety aggregate. Explain account-required versus public
   access. Do not show retired modules as retained functionality.
2. **Resident documents (2 minutes).** Login as residentA; show fictional profile,
   submit a TEST ONLY clearance request and read its pending status/reference.
   As Secretary process it only after that exact UI flow has passed rehearsal;
   return as A and show the updated status.
3. **Complaints / incidents (2 minutes).** Show the resident's fictional complaint
   reference and factual status, then Secretary's intake/screening view. Show KP
   only if prepared through a valid rehearsed workflow. Open existing mapped
   and unmapped TEST ONLY incidents and their blotter history. Say: “A report,
   complaint, blotter or involvement records information; it is not proof of
   wrongdoing.”
4. **Unified profile / person links (2 minutes).** Open the resident by UUID;
   show Information/History/Analytics/Credit tabs and witness/not_determined
   incident role. Show the distinct external identity, not a name-based merge.
   Explain explicit verification and restricted private-history access.
5. **Safety Map / Analytics (2 minutes).** Open TEST ONLY marker/popup and the
   unlocated list record. Apply a period/category filter and show contributing
   records, not just counts. Repeated involvement is descriptive, not guilt or
   a prediction; witness participation is not a responsibility finding.
6. **Community Credit (3 minutes).** Show server score 100 and the actual policy
   model. Explain V1 compatibility and that this local fixture is active V2;
   production V2 was not activated by this work. Verify fictional participation
   under an approved rule; inspect remaining cap before awarding. Show the
   ledger's real positive event: a score already at 100 remains at 100. If capped,
   explain the cap, do not bypass it. Show the submitted resident correction and
   a separate administrator review; approval itself does not change points.
   Say: “Complaints and incidents never automatically deduct points; credit does
   not determine eligibility for essential barangay services.”
7. **Permissions / audit (1–2 minutes).** Switch to ordinary official or residentB
   and show the rehearsed restricted view, then Secretary's permitted view.
   Show the real audit entry for a synthetic action. Explain independent
   approvals and server-side checks. Do not perform prohibited actions on real data.

## Decision and next action

**Ready for remote CI preparation/review; not cleared for production release.**
This means candidate ancestry/source and existing automated evidence are suitable
for preparing the remote validation process, not that a push is authorized.

Exact next action: finish the priority manual browser session above at 375px and
1024px against the isolated stack and record evidence; in parallel prepare the
reviewed candidate/CI manifest locally. Obtain separate authorization for hosting
deployment-gate verification and any subsequent push/remote CI operation. Keep
remaining eight-width certification and production recovery/cutover approvals
explicitly open.

Only this new report was added in Step 6. Step 5 report/inventory, SMS seed,
temporary synthetic runner, diagnostics and private backups are preserved.
No source edits, tests, SQL rehearsals, production reads/writes, GitHub mutations,
pushes, merges, policy activations or deployments were performed in this review.

## Subsequent local compiler incident

The user reported a Chrome compile overlay after integration. The referenced
files existed and matched Git, but the old port-3001 compiler served a stale
bundle with 29 webpackMissingModule stubs and no readKapitanStatus reader. This
is consistent with the dev server observing intermediate branch/merge trees;
it had not been restarted after integration. The displayed old “Available” state
was not evidence of a new database status row.

Restarted only the isolated React compiler. Fresh compile succeeded; served
bundle has zero missing-module stubs and contains the current nullable reader /
unpublished UI. Local-only URL/key and absence of service credentials were
rechecked; Auth/REST and both portal shells return HTTP 200. A synthetic Secretary
read returned HTTP 200/null again. No source, database or Git checkpoint changes
were needed. User should hard-refresh port 3001; post-refresh rendered browser
confirmation remains pending. Future branch integration must be followed by a
fresh dev compile/bundle check before manual QA resumes.
