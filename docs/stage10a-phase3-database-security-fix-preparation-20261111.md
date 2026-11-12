# Stage 10A Phase 3 — database security fix preparation

November 11, 2026. Production target: `mpcyqwasurhtdztzobwg`. Preparation only: migrations 068/069 remain unchanged and unapplied.

## Decision

The confirmed security defects remain the overbroad resident-verification UPDATE paths and insufficiently constrained ordinary self-INSERT. The minimum correction is unchanged migration **068 followed by 069**. Production execution is **NO-GO until the owner reruns the corrected read-only trigger mapping output, approves the maintenance window and confirms the JWT test actors/procedure**.

The earlier trigger failures were display-comparison false negatives. `regprocedure::text` may render `function()` or `public.function()` depending on `search_path`. The corrected preflight compares `pg_trigger.tgfoid` directly with `to_regprocedure(...)`; migrations 068/069 already use OID comparisons and require no edit.

## Compatibility conclusion

- Auth signup remains a trusted INSERT writer and is not blocked by 068. Migration 069 changes the ordinary self-INSERT policy only; the reviewed signup trigger supplies Auth UUID, literal resident role and pending/null verification state.
- Residents retain ordinary name/contact/Purok/photo/ID edits and the defined pending resubmission paths. They cannot decide verification, forge decision metadata or edit id/role/email/system_id/created_at.
- Active explicitly linked Secretary/Punong accounts remain records administrators through `current_official_may_administer_records()`. Ordinary officials, Tanod, residents and archived/unlinked staff cannot make verification decisions.
- Direct verification clients may still send actor/time fields, but 068 replaces them with `auth.uid()` and server time.
- `set_barangay_resident_eligibility` remains compatible: it checks records authority and the 068 guard sees the original JWT actor inside the definer RPC.
- Service-role maintenance remains allowed. Direct `postgres`/`supabase_admin` maintenance is allowed only for the narrow no-impersonated-role session condition in 068.
- No additional repository runtime writer of verification fields was found. Unknown deployed private writers remain a runtime-review risk, not a confirmed defect.
- Directory synchronization, notifications and Community Credit V1 enrollment remain installed side effects; 068/069 contain no backfill and do not rewrite scores, rules, enrollments or ledger events.

## Exact production order — requires separate approval

1. Select Supabase project `mpcyqwasurhtdztzobwg` and verify the reference, not only the display name.
2. Reconfirm both private backup copies are readable and match the recorded SHA-256. Record that restoration is untested.
3. Run the corrected `supabase-tests/068_069_cloud_preflight_readonly.sql` only. Require all five `expected_function_matches` values to be true, all triggers enabled `O`, and no unexpected profile BEFORE UPDATE trigger or INSERT/UPDATE/ALL policy.
4. Compare current affected policy/function/default fingerprints with the privately reviewed Stage 7Y.6B evidence. Stop on unexplained drift.
5. Name the operator and maintenance window. Pause ordinary application writes as operationally agreed; prevent simultaneous verification/signup activity.
6. Open a fresh SQL Editor query. Paste the exact unchanged 068 file. Confirm its SHA-256 is `9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44`.
7. Execute 068 once. On any precondition, lock or statement error, stop, inspect transaction state and do not weaken/retry the file. Confirm the two UPDATE policies and guard definition changed as intended while compose/notification/directory triggers remain enabled.
8. Without reopening normal traffic, open a fresh query for exact unchanged 069. Confirm SHA-256 `F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F`.
9. Execute 069 once. Stop on any error. Confirm the sole ordinary self-INSERT policy requires own UUID, resident role, pending status and null decision metadata.
10. Execute the approved JWT matrix below. Observe persisted results independently; HTTP success or zero returned rows is not enough.
11. Verify notifications, directory state, audit evidence and V1 enrollment/ledger invariants. Resume traffic only after required tests pass or an approved forward repair contains the failure.
12. Deployment approval is separate. Do not push or deploy merely because the database migration succeeds.

## JWT-backed test matrix

Use genuine Auth-issued JWTs and approved synthetic records only. Never use service credentials for ordinary-role tests.

| Actor / case | Operation | Expected result |
|---|---|---|
| Anonymous | INSERT/PATCH profile; eligibility RPC | Denied; no row or side effects |
| Profile-less resident | Safe own pending INSERT | Exactly one own pending row with null verifier/time/notes |
| Profile-less resident | Verified/rejected/ineligible INSERT; forged stamps/role/other UUID | Denied; no row or side effects |
| Resident pending/rejected/verified | Contact/Purok/photo and supported resubmission | Allowed exactly as defined; protected fields unchanged |
| Resident | Self-approval; verifier/time/notes; id/role/email/system_id/created_at; mixed allowed+protected update | Denied atomically |
| Resident ineligible | Identity change or self-reentry | Denied |
| Resident INSERT conflict/UPSERT | Safe and forged candidates | Safe behavior separately established; forged candidate/conflict denied by INSERT plus UPDATE rules |
| Ordinary Official | Direct resident verification and eligibility RPC | Denied; baseline permitted reads still work |
| Tanod | Direct resident verification and eligibility RPC | Denied; own operational scope still works |
| Archived/unlinked Secretary or Punong | Verification decision | Denied; display title/name grants nothing |
| Active linked Secretary | Verify, reject, ineligible, reinstate | Exactly one intended row; server actor/time; expected notes and side effects |
| Active linked Punong | Same independent cases | Exactly one intended row; server actor/time; expected side effects |
| Approved service maintenance | Explicit intended maintenance path | Allowed only under the named trusted path |
| Untrusted null-JWT/session role | Protected update | Denied |

For every denial, independently confirm unchanged profile, notification, directory, audit and V1 state. For allowed decisions, confirm notification outcome, directory snapshot/reactivation and that V1 existing scores/events are unchanged. A newly eligible resident may enroll at 100 only under the existing compatible active V1 policy; no ledger event or V2 state may be fabricated.

## Recovery readiness and blockers

The custom-format backup was exported, inspected and copied; both private copies have matching SHA-256 checksums. This is a strong recovery artifact, but recovery is not verified because no full restore has been rehearsed. A database archive also does not independently restore Storage objects or external Auth/SMTP/Edge/Vercel settings.

After a migration commits, SQL `ROLLBACK` cannot undo it. Restoring the legacy broad verification policies would reopen the confirmed flaw, so the primary response to a post-change defect is stop/containment plus a separately reviewed forward repair. A full database restore is last resort and may discard transactions after the backup.

Remaining blockers before execution:

1. Corrected current preflight output has not yet been captured after this local fix.
2. Stage 7Y.6B fingerprint comparison must show no unexplained drift.
3. Full restore remains untested and this limitation must be accepted explicitly.
4. Named operator/window/write-pause and forward-repair ownership are not yet recorded.
5. Genuine JWT actors, synthetic fixture ownership, side-effect observation and cleanup authority must be ready.
6. Separate explicit approval to apply exact 068 then 069 is still required.

No Community Credit V2 work is authorized or included.
