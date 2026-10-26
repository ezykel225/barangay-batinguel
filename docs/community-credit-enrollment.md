# Community Credit Enrollment

Migration 060 adds a durable UUID-based enrollment for each barangay resident and policy. The approved model starts at 100 and is clamped from 0 to 100. Enrollment belongs to `barangay_residents.id`; online account creation, deletion, or relinking cannot reset it.

Existing active residents are enrolled through an explicit Secretary/Punong RPC. The operation is transactional and idempotent. A resident inserted as active or reactivated while a valid active policy exists is enrolled in the same database transaction. Existing enrollment rows are never overwritten.

The score RPC uses the enrollment starting score plus post-enrollment ledger deltas. It returns an explicit not-enrolled state rather than inventing a frontend score.

`verified_at` is the authoritative date on which a verified credit decision became valid and determines score eligibility. `created_at` is only the database record-creation time. Events and reversal targets verified before enrollment cannot affect the score.

Historical review remains unavailable until verified UUID-based incident-party linking exists. Migration 060 does not scan complaints, incidents, blotters, KP cases, or free text; it creates no historical deductions and no generic credit-event writer. The approved future review threshold is strictly more than five qualifying underlying matters.
