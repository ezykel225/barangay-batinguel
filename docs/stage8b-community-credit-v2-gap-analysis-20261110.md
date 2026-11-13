# Stage 8B — Community Credit V2 gap analysis and safe plan

November 10, 2026. Defense November 16/18. **Proposal only; V1 unchanged; V2 not implemented or active. Deployment remains NO-GO.** The current proposed model is starting 100/minimum 25/maximum 100; it supersedes earlier proposed 70-point V2 concepts for planning, not for installed behavior.

## Inspected foundation

Current CreditGauge/CreditProfile/CreditManagement, communityCreditApi, V1 059/060 definitions and migration/enrollment/gauge/component tests. 059 provides policies/rules and immutable snapshot event ledger; 060 adds resident/policy enrollment at 100 and server profile calculation clamped to **0–100**. Management/profile/rule RPC contracts exist; no current frontend award, monthly-cap, complaint-dispute or deduction-appeal workflow was established. Historical 067 is absent from this checkout and must not be restored as an assumed match to this new specification.

V1 tests are static/mocked component evidence. Stage 8A's 2,661 passing tests/builds are historical frontend results, not live V2 or database-authorization proof. Some component fixtures use arbitrary server-returned score/base values to test presentation; these do not define active policy or prove a 70-point model. No hosted requests, records or credentials used in this review.

## Requirement matrix

| New requirement | Existing support | Gap / minimum enforcement |
|---|---|---|
| Unverified residents Unrated | Unlinked/not-enrolled/unconfigured states and gauge unavailable handling | No explicit server `rated/unrated` contract. Own-profile resolver checks resident role/link, not necessarily current verification. Verified→pending can leave directory/enrollment intact. Must distinguish verification, directory active, enrollment and account-link states without erasing history |
| Verified start 100 | V1 enrollments start 100, directory verification sync supports enrollment | V1 also enrolls active directory residents without necessarily having a verified linked account; define eligibility for unlinked/manual directory residents. Do not reinterpret historical enrollments |
| Minimum 25/max 100 | Server max100; gauge uses RPC score/maximum | V1 minimum is0. Frontend clamp25 would falsify server score. Gauge currently labels lower endpoint0; future lower-bound label needs versioned server metadata and an explicit scale decision |
| Excellent90–100/Good80–89/Fair70–79/Poor60–69/VeryPoor25–59 | Numeric gauge/score and policy title | Classification mapping absent. New labels must be V2/version-scoped, not attached to legacy scores0–24 or missing scores |
| Activity +3/+5/+2/+2/+3 | Generic positive rule category/source/points supported | No guaranteed installed five-rule catalog, event identity/attendance/evidence/verification workflow or award RPC. Existing generic rules are not proof these rules are configured |
| Max10 qualifying points/calendar month | No current cap | Server ledger/cap accounting, authoritative date/timezone, transactional serialization and boundary/retry tests required |
| No resident/event duplicate | Enrollment unique by resident/policy; reversal target unique | Neither prevents duplicate activity awards. Stable event ID + resident identity with database uniqueness, idempotency and version/reversal semantics required |
| Minor−2..−5, Moderate−6..−10, Serious−11..−20 | Negative rules and immutable snapshots exist | No severity taxonomy/range authorization, reviewed outcome/evidence gate or protected deduction RPC. Generic configurable negative rules do not enforce this proposal |
| No deductions from filed/disputed complaints | Existing 059/060 do not automatically create such credit events | Preserve invariant; final decision/identity/dispute state must gate future deductions. Complaint status alone or name match is not proof of responsibility |
| Complaint disputes online/in person | Complaint submission/tracking/KP exists | Filing a complaint is not disputing one. Need authorized respondent/party identity, private submission/history, offline intake recording, status/deadlines and review rights; do not broaden complaint visibility |
| Deduction appeals requested in person | Read-only ledger and schema-level reversal/correction concepts | No complete intake/appeal decision workflow. Define protected official encoding/receipt/outcome, no resident online appeal submission falsely enabled |
| Authorized adjustment approval/audit | Secretary/Punong records-admin helpers; audited policy/rule management; event actor/time fields | Event snapshots are not a complete adjustment audit transaction. Dedicated approved adjustment workflow must atomically write ledger, audit and authorized in-system notification. Define eligible positions/conflicts and whether independent approval is required |
| In-system notifications only | Existing notification tables/writers | Credit-specific recipient/event vocabulary/permissions and exactly-once/retry behavior need review/extension; no SMS/Edge/email trigger for adjustments |
| No automatic document decisions/priority | Document workflow separate | Preserve separation. No query sorting/permission dependency on credit, no automatic denial; priority remains disabled pending separate fairness/policy approval |

## Safe frontend boundary

Possible later frontend-only work, separately authorized: a clearly labeled **proposal/inactive policy explainer**, reusable pure classification helpers with boundary tests, policy-version-aware presentation scaffolding and accessible offline design previews. Any fixture must be visibly synthetic and separate from live profile screens. Existing gauge, metrics, ledger and honest unavailable states can be reused.

Not safe as frontend-only enforcement: Unrated eligibility, score floor, activity/severity points, monthly cap, deduplication, official approval, deductions, appeals, audit or dispute privacy. Do not classify actual V1 residents under new V2 labels or hardcode new score bounds/rules in the live UI. Do not provide working-looking forms with no authorized backend or use localStorage/mock persistence. No UI change made in this stage.

## Unresolved policy decisions — approve before schema design

1. **Cap versus score ceiling:** verified residents start100, so immediate positive awards may not increase displayed scores. At score100, do +3 points consume monthly quota? Are they recorded but discarded, banked, or later offset against deductions? V1's clamp(100 + sum(events)) can create a hidden positive balance; chronological per-adjustment clipping yields different later scores. Neither behavior is selected here.
2. **Month and award timing:** specify calendar timezone (recommend considering Asia/Manila, not assumed adopted), event occurrence vs verification month, delayed encoding/backdating, late corrections and cross-month duplicates. Define “qualifying” rules and global cap across activities/policies.
3. **Partial cap awards:** at +9 monthly total, does a +3 award grant1, reject/defer, or wait? No carryover/partial award implied by the proposal. Distinguish nominal rule points, cap-counted points and effective score delta for audit.
4. **Floor/corrections:** at score26, how is a −20 decision recorded with floor25? Does later reversal restore nominal/effective points or recompute later chronological outcomes? Preserve immutable original evidence and append authorized correction/reversal, never edit/delete ledger rows.
5. **Duplicate/reversal scope:** stable event IDs across aliases/multiple sessions, one event with several activity types, cancelled awards, re-awards, rule/version changes and reset policy. Unique request keys alone do not prevent the same event under a different key.
6. **Eligibility:** meaning of “verified resident” for active directory-only residents, pending re-verification, rejected/ineligible/inactive status; visible history versus current rating, reinstatement baseline, duplicate accounts and no name-based merges. Unrated is not0/25 and must not restrict essential services.
7. **Deductions/due process:** who determines minor/moderate/serious and exact points, evidence standard, notice/response period, finality, disputed cases, repeat penalties, no double deduction from linked complaint/incident/KP. No role of guilt inferred from being a named party.
8. **Dispute vs appeal:** online/in-person complaint dispute is distinct from an in-person appeal of an applied deduction. Define deadlines, receipt, who encodes/decides, recusal/self-approval, suspension/reversal during review, resident-visible reasons and sensitive evidence boundaries.
9. **Authority/transition:** existing records-admin scope is Secretary/Punong; do not extend all officials by implication. Decide independent approvals and conflicts explicitly. Define future policy effective date and treatment of V1 balances/history; no automatic reset/floor uplift or retroactive deductions.

## Future backend work packages — identified, not written

Use additive, versioned migrations only after policy decisions, security validation and complete baseline reconstruction. Assign migration numbers only after inventory/review; do not overload or modify 068/069 and do not blindly reuse historical067.

- Versioned policy/enrollment/rule contracts: eligibility/rated-state, 100/25/100, classification source/version, effective date and explicit V1 history preservation. Existing one-active-policy constraint and V1 fixed-model save/activate/profile functions require a deliberate compatibility design; generic rule creation alone cannot activate this specification safely.
- Event/participation/evidence/verification records with stable identities, resident/event uniqueness, controlled official workflow and immutable snapshots. Use server timestamps, actor checks and idempotent RPCs; no resident ability to directly award points.
- Monthly cap accounting and score evaluation in one authoritative transaction, locking/uniqueness sufficient under concurrent approvals, retries, reversals and late awards. Server validates severity points and final authorized outcome, not client-supplied deltas/approval flags.
- Separate privacy-shaped complaint dispute and in-person deduction appeal/correction records, secure attachment paths, decision/audit history and restricted resident/official RPCs. Account verification security is prerequisite to trusting “verified” eligibility, but does not alone solve complaint-party identity or adjustment permissions.
- Atomic adjustment/audit/in-system notification contract, reviewed vocabulary/grants and explicit failure/retry policy. Existing notification writer may catch failures; decide whether durable outbox/retry is needed rather than claiming every adjustment notified because the ledger committed. No SMS or document-service coupling.

No direct client INSERT/UPDATE/DELETE grants on protected ledger/cap/approval data merely to make forms work. Each SECURITY DEFINER RPC must validate JWT identity, active linked authority, target scope and workflow state; RLS/execute grants/privileged alternate writers reviewed independently. Recovery must preserve append-only evidence, not erase prior adjustments.

## Minimal defense-ready sequence

1. Sign off the new proposal and unresolved decisions; explicitly supersede old70-point proposals in future work without rewriting historical reports. Freeze active V1 behavior and document security/testing limits.
2. If approved, implement presentation-only proposal/help and pure boundary calculators in a visibly inactive/offline scope. Test Unrated separately, all classification boundaries25/59/60/69/70/79/80/89/90/100, invalid/fractional values and version labels; no live reclassification.
3. Resolve 068/069 authorization testing, missing baseline/disposable hosted capacity, recovery and fixture/delivery controls. Neither important existing project is a controlled-write sandbox. Deployment remains NO-GO.
4. Separately design/review additive contracts and exact migration plan; preserve V1 enrollment scores/events and ownership; no automatic carry/reset. Build activity approval/dedup/cap first, then due-process-gated deductions and dispute/in-person appeal handling, all inactive until backend tests pass.
5. Execute real JWT role negatives, concurrency cap/dedup/reversal tests, immutable audit/notification delivery/retry, month-boundary/ceiling/floor/transition and V1 preservation tests in approved isolation. Then build real integrated forms against verified RPCs and perform responsive/authenticated QA.
6. Independent policy/security/fairness review and explicit migration/activation/deployment approval. Never use defense urgency to enable an untested scoring policy; demonstrate existing V1 and clearly labeled proposal instead.

## Limits and verification

Only this report created; no V1/UI/API/database/security migration/package changes, hosted SQL/RPC, Docker/PostgreSQL, commits/push/deployment. No live rules, scores or enrollments read/changed. Tests inspected, not rerun for gap-analysis-only work. Stage8A results remain historical. `git diff --check` passed (exit 0; existing line-ending warnings); migrations 068/069 retain their preserved SHA-256 hashes.
