# Stage 8C — Community Credit V2 functional specification and test design

November 10, 2026. Defense November 16/18. **DESIGN ONLY — not implemented, approved for activation, database-tested or deployed. Deployment NO-GO.** Existing V1 and security migrations 068/069 remain unchanged.

## 1. Requirements and approval status

**G = group-provided requirement for this design, not proof of formal barangay/policy approval.** **P = explicitly proposed rule awaiting group/official approval.** **D = additional recommended design choice, also awaiting approval.** No P/D choice may silently become an active rule. Earlier proposed70-point models and historical067 designs are not this specification.

### G: required model

- Unverified residents: **Unrated**, represented as a state with no current numeric score/classification, not0/25. Verified eligible V2 residents start100, score bounds25–100, integer points.
- Excellent90–100; Good80–89; Fair70–79; Poor60–69; Very Poor25–59. Unrated/unavailable/out-of-range input is not classified by guessing/clamping in the frontend.
- Verified activities: clean-up drive+3; volunteering+5; barangay programs/events+2; seminars/orientations+2; disaster preparedness+3. At most10 qualifying points per calendar month. No duplicate resident/event awards.
- Verified violations: minor−2..−5; moderate−6..−10; serious−11..−20. No deduction from pending or unsubstantiated complaints. A filed/disputed complaint or incident-party label is not a finding of wrongdoing.
- Complaint disputes online or in person; appeals of applied deductions requested **in person**. Only authorized officials approve adjustments. Immutable audit history and in-system notifications.
- No automatic document approval/rejection/denial; credit priority disabled pending separate policy/fairness approval. Unrated/low score never automatically restricts essential services.

### P1–P7: pending decisions supplied by the group

| ID | Proposed rule | Consequence if approved |
|---|---|---|
| P1 | Activity points count toward monthly quota even at score100 | Award credit and displayed score movement are different; ceiling-lost points still consume quota |
| P2 | Partial awards allowed near cap | Remaining1 on nominal+3 grants1; both values and reason recorded |
| P3 | Cap month = approval date in Asia/Manila | Server approval instant determines month; event occurrence remains evidence, not the accounting month |
| P4 | Corrections append-only and reference originals | No event/audit edits/deletes; effective state derived from immutable revision chain |
| P5 | Never reset/rewrite existing V1 score/ledger | Separate policy/version identity and explicit transition required |
| P6 | Prospective V2 after approved activation | No automatic historical deductions or reclassification of old records |
| P7 | No banked points above100 | Clip at each effective event, not once after summing all history |

**Additional approvals D:** authorization/recusal and independent review; monthly-cap correction treatment; no hidden debt below25; rating suspension/reverification; finality/dispute/appeal deadlines and stays; V1 transition eligibility. These are defined provisionally below for testability, not represented as settled policy.

## 2. Eligibility, lifecycle and V1 preservation

Proposed policy lifecycle: draft → reviewed → approved/inactive → scheduled → active → retired. Each transition needs an authorized actor/reason, immutable version and effective timestamp; activation is a separate privileged action, not implied by saving rules.

Enrollment: one immutable opening record per resident/policy version. Backend derives verified eligibility from authoritative resident/account state and exact UUID link; directory active, enrollment exists and account verified are distinct facts. Unlinked/manual directory resident verification needs a separately approved authoritative evidence rule; names are not identity.

**D:** pending/rejected/ineligible or suspended verification makes the current V2 rating Unrated; existing ledger remains accessible within privacy rights as historical information. Reverification resumes the existing V2 history, never creates a fresh100 opening. Pending adjustments remain queued for eligibility review, not automatically posted against an Unrated account. Decide any exceptions explicitly.

**Transition gate:** G starting100 and P5 preserving V1 do not authorize changing an existing V1 balance to100. Recommend initially keeping existing V1 residents on V1 until an explicit transition policy is approved; newly eligible V2 cohorts can have separate prospective100 openings after activation. If existing residents are later offered V2 openings, maintain V1 separately and obtain explicit approval for the resulting new rating—not an invisible balance migration. Carrying V1 balances, especially values below25, requires another explicit decision; no silent floor uplift/reset. Reverification is not a transition/reset mechanism.

Do not retire/reconfigure the active V1 policy automatically. Current global one-active-policy constraint and V1 fixed100/0/100 RPCs require reviewed version/cohort compatibility changes before coexistence. Exactly one awarding engine applies to a resident/event at a time; no duplicate V1+V2 credit. V1 APIs/history remain readable and behavior preserved until separately approved cutover.

## 3. Proposed authorization matrix (D)

All ordinary API actors use real Auth JWTs. Secretary/Punong resolve through official profile + explicit account link + exact position + non-archived appointment. An ordinary official title does not authorize adjustments. Current trusted maintenance privileges are not ordinary actor permissions.

| Operation | Resident | Other Official | Secretary | Punong |
|---|---|---|---|---|
| Own rating/history/receipts | Own verified identity scope only | Authorized operational scope only, no new private-party rights | Authorized records scope | Authorized records scope |
| Activity participation submission | Own evidence request if separately approved; never approval | Draft/intake only if explicit delegation approved | Draft/verify per approved scope | Draft/verify per approved scope |
| Approve activity/adjustment | Deny | Deny | Allow within exact approved authority | Allow within exact approved authority |
| Establish violation finding | Deny | No automatic power from credit role | Only if separately designated competent decision role | Only if separately designated competent decision role |
| Approve deduction | Deny | Deny | Only after authorized final finding, verified target and conflict checks | Same; credit role does not replace substantive due process |
| Lodge complaint dispute | Own authorized party/case online; in-person intake available | Encode only if separately delegated | Authorized private intake/review | Authorized private intake/review |
| Request deduction appeal online | Deny; show in-person instructions/own receipt | No bypass | No resident impersonation | No resident impersonation |
| Encode/decide in-person appeal | No staff rights | No default right | Intake; decision only under approved authority/recusal | Same |
| Correct/reverse posted adjustment | Deny | Deny | Reviewed authorized correction, no conflicts | Same |
| Activate policy/change approved rules | Deny | Deny | Prepare/review only by default | Final activation proposed; exact governance pending approval |
| Edit/delete ledger/audit; direct cap mutation | Deny | Deny | Deny through ordinary API | Deny through ordinary API |
| Automatic document priority/decision | Disabled | Disabled | Disabled | Disabled |

Anonymous and Tanod have no private rating/adjustment authority by default. Preserve public service access and existing unrelated Tanod workflows. **D:** maker cannot approve own submission; original decision-maker cannot solely decide its appeal; official cannot approve an adjustment benefiting/penalizing their own verified identity. If independent qualified reviewer is unavailable, mark pending conflict review—never fall back to another role or silently skip approval. Two-person approval is a recommendation needing explicit adoption, not a currently implemented rule.

Every RPC validates actor, target scope, policy version, workflow state and optimistic version; frontend gating is UX only. Service keys never enter React. Privileged maintenance is separately audited and cannot be used to demonstrate ordinary-role test success.

## 4. Event, ledger and audit model (conceptual, no DDL)

| Entity | Required information / invariants |
|---|---|
| Policy/rule version | Immutable100/25/100 model, classification bands, five activity rule values, severity ranges, eligibility/date/correction semantics, approval/activation records |
| Canonical activity event | Stable event UUID, organizer/type, occurrence times, state and evidence references. Renaming/duplicating a title must not create a new award entitlement |
| Participation | Verified resident UUID + event UUID, evidence/attendance, submitter/verifier, state/revision. No name-based identity linkage |
| Adjustment decision | Kind activity/violation; policy/rule snapshot, nominal integer delta, adjudicated outcome reference where relevant, reason/evidence, requester/approver/server time, conflict checks and idempotency key |
| Immutable ledger stream | Resident/policy sequence, decision ID, nominal delta, cap-granted delta, ceiling/floor effective delta, original approval/month, before/after projection-at-posting, actor/reason/source, revision/reversal links |
| Correction/reversal | Own ID/approval/time/reason and exact original/root plus expected previous revision; records invalidation or replacement facts. No unrestricted arbitrary “set score” action |
| Cap projection | Resident + Manila approval-month, approved qualifying-point consumption, revision; derived/rebuildable, transaction-locked, not a resident-editable ledger |
| Rating projection | Rated-state, version, current score/classification, last stream sequence/replay revision; derived, rebuildable and never authoritative without ledger/version |
| Dispute/appeal | Distinct case/adjustment reference, identity/receipt/channel, lifecycle, evidence, notices/decision/recusal history; private attachments |
| Audit/outbox | Immutable actor/action/target/request/reason/version/result plus notification intent keyed by decision/recipient/event; no secret or unnecessary personal payload |

One database transaction commits decision, ledger, cap/projection revision, audit and notification intent. Snapshot rule values at approval; later rule edits do not reinterpret history. Mutable drafts/projections may be updated under controlled RPCs, but canonical accepted decisions/ledger/audit are append-only. Historical posted before/after values remain as-was; current replayed projection is separately versioned, not written back into old rows.

## 5. Duplicate and monthly-cap algorithm (P1/P2/P3 plus D)

Use database-enforced uniqueness on the canonical resident/event entitlement, not on event title, button state, timestamp or request key alone. Keep a permanent entitlement root across corrections/policy changes; reversal does not free a second normal award. Any re-award is an authorized revision of that root. Multiple sessions/types within one program require an explicit canonical-event policy; no caller may mint aliases to bypass uniqueness.

For an approved activity with nominal N, under one transaction and a consistent lock order:

1. Validate actor/conflicts, resident eligibility, active applicable version, verified participation and unique canonical entitlement. Lock resident stream then resident/month accounting; cross-resident operations use a deterministic order.
2. Assign authoritative server approval instant at the serialized decision point; derive the calendar month in Asia/Manila. Ignore client-provided approval timestamps. Do not assume transaction-start `now()` still describes approval after a month-boundary lock wait.
3. Read qualifying granted points C for the month. Remaining = max(0,10−C); grant = min(N,remaining) if P2 approved. Record nominal N, granted amount, cap reason and actual score movement separately.
4. **D:** if remaining0, leave a cap-exhausted/no-award decision with audit, no score event; do not consume the participation entitlement permanently. A retry is controlled/idempotent; do not promise next-month carryover. Whether a verified request may be approved next month is a separate approved timing/defer policy.
5. Apply the granted delta sequentially, clipped to score25–100; consume granted points even if effective score movement0 at ceiling (P1). Persist audit/outbox; identical request retry returns the original result. Same key/different payload is a conflict; different key/same resident/event cannot duplicate an award.

No resident-wide time-of-check/time-of-use cap read outside the locked transaction; enforce invariants under concurrent distinct events. Test real uniqueness, serialization, timeouts, deadlock handling and bounded retries, not arbitrary sleeps or sequential calls called “concurrent.”

## 6. Scoring and correction/replay semantics (recommended D)

For rated V2 history, opening S0=100. For ordered effective decisions: **Si = min(100,max(25,Si−1 + di))**. Activity di is cap-granted points; violation di is the approved negative value. **No bank above100 (P7); proposed no hidden debt below25 (D).** This is deliberately different from V1's clamp-after-sum; never apply this evaluator to old V1 events.

All server-accepted score decisions get a monotonic resident/policy sequence; timestamps alone are insufficient. Occurrence date is evidence, not permission to reorder a deduction into historical score periods. Ordinary adjustments post prospectively. Corrections remain new audit entries but define an explicit historical-restatement view of the referenced V2 decision, not an ordinary additive positive award.

**D: recomputation protocol**

- Correcting authority appends a reversal (effective source decision becomes zero) or replacement revision, with evidence, reason, parent/root revision and authority. No reversal-of-reversal chain with ambiguous double compensation; one accepted current revision per root, concurrency checked.
- Replay effective original decisions in their original immutable sequence from opening100 using clipping at each step. A reversal is not blindly appended as `−original delta` at the current end. Original ledger/audit snapshots and receipts remain unchanged; save a new projection/replay revision with old/new current score and correction reason.
- Original approval-month anchor remains fixed for correction cap accounting; correction approval instant is separately recorded. **D:** released activity quota returns only to the original month, not the correction's month. Do not automatically top up other previously partial awards. New same-month approvals may use released capacity only if that month is still current and the event's approval-timing policy allows it; no closed-month banking.
- A replacement activity grant is bounded by the original month's10 minus other surviving fixed grants; no revision may exceed the cap or change month to bypass it. Existing partial grants stay fixed unless independently corrected. Global policy switches cannot create a fresh entitlement for the same resident/event.
- Corrected violations and resulting score restoration do not consume activity quota. This must not be used as an unreasoned administrative positive adjustment. Appeal-driven reversals need the original outcome/decision reference and approval.

**Worked hypothetical tests, not live data:**

| Sequence | Expected under proposed semantics |
|---|---|
| 100, activity+3, violation−5 | Activity grants/consumes3 but moves score0; then score95, not98/100; no bank |
| Monthly consumption9, nominal+3 at score80 | Granted1, consumption10, score81; audit nominal3/granted1/effective1 |
| 100, −20, +5, −10; then reverse first−20 | Original score75. Replay without first deduction:100 →100 →90. New current90, not naïve95; correction projection difference+15 is not a+20 activity |
| Score30 reached through earlier valid history, then−20,+3; reverse−20 | Original suffix ends28; replay ends33, not48; no hidden floor debt |
| Month grants3,5,2; reverse5 | Surviving consumption5; no automatic top-up of the other awards and no quota transfer into a new month |

These replay/cap choices need group/official approval. If approved instead as prospective compensation, specify a different consistent accounting model and rerun examples; do not combine both models accidentally.

## 7. Violation, dispute and in-person appeal workflows

Activity: draft event → participation/evidence recorded → independently verified → approval pending → approved/partial/cap-exhausted/rejected → audited/notified. No points for self-attestation alone.

Violation: reported allegation → private evidence/identity review → notice/response opportunity → authorized substantiated final finding → credit decision pending → authorized severity/points approval → ledger/audit/notification. Pending/unsubstantiated/referred/procedurally closed status alone never implies guilt. Define the competent finding authority and grounds for severity/exact points; credit approvers must not manufacture substantive findings from complaints counts. Prevent duplicate deductions for one finding echoed in complaint, incident, blotter and KP systems.

Complaint dispute: verified own party/case access → online submission or authorized in-person encoding with resident receipt → acknowledged → review/response → reasoned resolution → resident notice and immutable history. Protect other parties' identities/evidence; no general complaint lookup by name. **D:** open dispute blocks approval of a new related deduction until its outcome is settled. Do not allow online dispute to silently change another person's case or score.

Deduction appeal: resident receives applied deduction reason/reference and **in-person instructions**, attends authorized office, staff records the request/channel/date/receipt and evidence → independent review/recusal → upheld/partially corrected/reversed → authorized correction/replay → in-system notice. Resident may view own appeal receipt/status but cannot submit an in-person-only appeal through a hidden API. **D:** applied deduction stays pending review unless an authorized explicit temporary stay is approved and recorded; no automatic restoration or further penalty for appealing. A later complaint dispute may trigger review but is not silently an appeal or score reversal.

Set actual offices, deadlines, evidence retention, reviewer authority, escalation and appeal/stay rules before implementation; do not invent them in UI. In-person access needs no smartphone; notifications supplement, not replace, a durable receipt. Adjustment notifications contain safe own-account explanations, not third-party allegations. Transactional outbox intent plus idempotent in-system delivery retries is recommended; record pending/failed delivery separately. No SMS/email delivery for credit adjustment notices.

## 8. Planned automated acceptance cases — none executed

| IDs | Cases / required assertion |
|---|---|
| EL01–04 | Unverified/Unrated has no score/classification; verified first V2 opening100; re-verification resumes rather than resets; unlinked/inactive/manual-directory eligibility follows explicitly approved rule |
| CL01–05 | 25/59 Very Poor;60/69 Poor;70/79 Fair;80/89 Good;90/100 Excellent. Reject null/NaN/out-of-range/fractional values; never relabel V1 without V2 version |
| AC01–05 | Each of the five activity values accepted only after verified participation and authorized approval; tampered client rule/delta/actor/time denied |
| CAP01–05 | Cap0/9/10 boundary, partial1 on nominal3, ceiling100 still consumes quota, all activity types share cap, no automatic carry/banking |
| DT01–04 | Manila end/start month including UTC-date difference, delayed verification, client backdate denied, lock wait crossing midnight assigned actual serialized approval month |
| DU01–05 | Identical request retry unchanged; same key/different payload rejected; different keys/same event only one entitlement; aliases/resident duplicate identity review; correction does not permit normal duplicate re-award |
| VI01–05 | All severity endpoints; out-of-range/nonnegative/decimal deduction rejected; pending/unsubstantiated/open-dispute denied; final finding+verified target required; linked-source double deduction denied |
| SC01–04 | Every step stays25–100; +3 at100 then−5 gives95; floor example/no hidden debt; no clamp-after-total or historical V1 reinterpretation |
| CO01–06 | Replay example75→90; floor reversal28→33; original-month quota release; no automatic partial top-ups; replacement cap bound; concurrent correction stale-head/duplicate reversal rejected |
| AU01–06 | Real JWT Resident, Other Official, Tanod, anonymous deny decisions/direct ledger/cap writes; active linked Secretary/Punong authorized within scope; archived/unlinked and conflict/self-approval denied |
| DP01–04 | Own dispute online/in-person receipt, other-party privacy, open dispute blocks new deduction, exact finding/case identity no name matches |
| AP01–04 | In-person intake only, online creation denied, recusal/upheld/partial/reversal history, stay not assumed without approved decision |
| AT01–04 | Decision+ledger+audit+outbox atomic rollback on forced internal failure; one notification intent on retry; failed delivery observable/retried; no SMS/email dispatch |
| CX01–04 | Simultaneous distinct awards near cap cannot exceed10; same-event race unique; award vs correction/eligibility transition serializes safely; deterministic locks/timeouts and bounded retry, no unexpected deadlocks |
| PR01–05 | V1 scores/events/enrollments byte/semantic invariants preserved, no reset/replay; version transition explicit; no retrospective deductions; document order/approval/denial unchanged; no new private data access |

Pure unit tests can cover evaluator/classification/date math and examples; property tests should assert score bounds, monthly limit, replay determinism and idempotency. Component tests cover rated/unrated/version labels, forms/receipts/notifications/accessibility at all eight existing widths. **Only actual PostgreSQL constraints/RPC + real Auth/PostgREST JWT tests can prove backend enforcement.** Concurrency requires independent simultaneous sessions and synchronization. No fake JWTs/service-role actor substitution or production synthetic write tests.

Before future test execution require complete sanitized baseline, explicitly approved disposable Supabase capacity, synthetic Auth/link/fixture manifest, external-delivery containment, recovery and hosted adapter. Current staging blocker and pending068/069 remain. Test cleanup preserves append-only history via approved disposable recovery, not bypassing immutable guards or deleting production records.

## 9. Backend and frontend work packages — no implementation

Additive schema/API design is required for version/cohort eligibility, canonical event/participation, approval/final-finding evidence, monthly accounting/locking, immutable decision/revision streams, rating/replay projections, dispute/in-person appeal privacy and audit/outbox. New RPCs must enforce full authorization and prospective applicability; no client direct-write grants to ledger/cap/audit. Review existing global-active-policy constraint and 059/060 save/activate/profile contracts for compatibility rather than mutating V1 semantics. Do not assign migration numbers or restore old067 as a shortcut.

Frontend later consumes server rated-state/version/current score/classification/cap availability and privacy-shaped histories. It may explain nominal/granted/effective differences and in-person appeal instructions, but cannot enforce policy by local clamping. No unsupported live buttons, fake records or client-side persistence fallbacks. Reuse accessible gauge/ledger/design and Stage8A interpretations only where meaningful.

Implementation order: sign off G/P/D and transition → resolve security/baseline/test environment → review versioned backend contracts and tests → implement inactive activity/cap/audit core → due-process deductions/corrections/disputes/appeals → integrated UI/JWT/concurrency/notifications/V1 preservation → separate formal activation/deployment approval. No proposal text is authorization to perform any step.

## 10. Defense explanation

“Our proposed V2 rates only verified eligible residents, starting at100 with bounds25–100. Verified participation can earn points up to a monthly limit, while deductions need a substantiated authorized finding—not simply a filed complaint. Residents can dispute complaints online or in person; appeals of applied deductions are requested in person. Adjustments keep immutable evidence and in-system notices. We are designing partial awards, no banked excess points and auditable corrections, subject to group and official approval. Current V1 records are preserved. V2 is not active, and scores do not automatically approve, deny or prioritize documents.”

## Scope and status

Specification/test design only. No application implementation, migration or SQL/RPC execution, hosted changes, V1 reset, Docker/PostgreSQL, commit/push/deployment. 068/069 unchanged. No automated tests executed for this document; examples are specified expected outcomes, not runtime results. Deployment NO-GO; no policy/governance approval inferred. `git diff --check` passed (exit 0; existing line-ending warnings); 068/069 SHA-256 hashes match preserved values.
