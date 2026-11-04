# Migration 067 local validation

Production deployment is not approved by these results. Never use production
credentials, apply 064, or upload the private schema baseline to run these tests.

## Negative control

This is a **function mutation control**, not a complete V1 database restoration.
It replaces the five shared functions with their historical 059/060 definitions
from the rollback contingency while deliberately retaining V2 constraints,
triggers, private grants and public RPCs. Removing the entire V2 installation
would make the V2 fixture setup impossible rather than test individual contracts.

The old expected list predated the revised starting score of 100 and was not
supported by the actual functions restored. Each function was restored alone in
PostgreSQL before the combined expectation was corrected:

| Restored function | Failing contracts | Cause |
| --- | --- | --- |
| `community_credit_may_view_resident` | 3 | V1 allows ordinary active officials to read individual scores. |
| `community_credit_enroll_resident` | none | V1 already enrolls at 100; it accepts the revised V2 score bounds. |
| `community_credit_enroll_active_residents` | none | Same starting-score compatibility; V2 transition still performs its own enrollment. |
| `community_credit_guard_event` | 17,18,19,20,21 | V1 rejects V2 reversal semantics; dependent correction fixtures fail, and trusted direct insertion no longer requires the V2 writer guard. |
| `community_credit_profile` | 1,2,11,15,16,26 | V1 lacks the new status/model/gauge/history response fields, including when displaying V1 policies. Some compound cap/reversal contracts also inspect that response. |

Combined failures must therefore be exactly
`1,2,3,11,15,16,17,18,19,20,21,26`.
Combined passes are `4,5,6,7,8,9,10,12,13,14,22,23,24,25,27,28`.
The combined result equals the union of the independently observed mutation sets;
no extra ordering/isolation failure appears. Every run rolls back.

Differences from the old expected list:

- **Added 1,2:** response-contract differences in the old profile, not broken V1 scores.
- **Added 21:** the old event guard permits trusted insertion without the V2 writer workflow.
- **Removed 7:** vacancy/self-approval checks are in retained V2 RPCs and existing identity helpers.
- **Removed 14:** ordinary positive awards and request idempotency still work with the V1 event guard.
- **Removed 22:** V1 enrollment at 100 is now compatible; the former zero-point distinction is gone.
- **Removed 23:** the aggregate reader is unchanged by these five mutations.
- **Removed 28:** retained workflow RPCs still stamp audit identities correctly.

No behavioral assertion was weakened. The report now also requires all 28 IDs
and raises an exception on any unexpected negative-control result, rather than
merely printing a list that could be ignored.

Generate current runners from the repository root:

```text
node supabase-tests/067_build_test_runner.mjs <local-output-directory>
```

Run positive and combined negative files in separate empty post-067 disposable
databases with `psql -X -v ON_ERROR_STOP=1`. The five generated
`067-control-*.sql` files independently enforce the causal sets above.
Run installation safety on a pre-067 disposable database; it rolls back.

## Separate-session concurrency

```text
node supabase-tests/067_concurrency_runner.mjs validation067_<empty_post_067_template>
```

The runner accepts only a local database name, fixes the container to `pg067test`,
requires its existing memory/CPU bounds, and creates a new timestamped clone.
It accepts no URL/password. It preserves the clone for inspection and does not
modify its template. Synthetic setup reuses the actual authenticated RPC fixture
sequence from the behavioral harness through contract 11.

Each race uses independent `docker exec -i ... psql` sessions. A coordinator holds
a real row/table lock; the runner requires both workers to appear blocked in
`pg_stat_activity` with nonempty `pg_blocking_pids` before releasing it. Polling
and time limits bound the test; arbitrary sleeps do not establish concurrency.
The intentional deadlock uses two sessions each holding one row before requesting
the other's row. Exactly one `40P01` is required. Business races reject `40P01`.

Checks cover identical request replay, distinct requests for one participation,
annual-cap contention, reversal versus the same and different participations,
`55P03` lock timeout and exact-request retry, trusted-writer primary-key rejection,
intentional deadlock detection, and final ledger/participation/cap invariants.
Fixture data is committed only in the disposable race clone so separate sessions
can see it; it is intentionally retained there, not claimed to have rolled back.

The historical private schema needs the verified modern Auth schema and
`btree_gist` extension. Do not invent Auth columns or application table stubs.
