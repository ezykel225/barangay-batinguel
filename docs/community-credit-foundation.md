# Community Credit Foundation

## Purpose

Phase 1 establishes a configurable Community Credit policy, immutable resident credit ledger, server-calculated score, Resident 360 credit view, resident self-service view, and guarded policy/rule administration. It does not create any automatic public-safety scoring workflow.

## Identity model

The authoritative person identifier is `public.barangay_residents.id` (UUID). Every credit event references that UUID. A resident account can read its own credit information only through the explicit `barangay_residents.profile_id = auth.uid()` link. Officials are authorized through the existing UUID-based `official_account_links` chain and active `barangay_officials` record. Names are display values, never identity keys.

## Policy and rules

`community_credit_policies` stores draft, active, and retired configurations. A partial unique index permits at most one active policy, and activation is a separate, deliberate RPC. The installation creates no policy and invents no score range or standing label.

`community_credit_rules` belongs to a policy and stores the approved category, known source domain, and non-zero point delta. Sign constraints require negative rules to subtract and positive/repair rules to add. Correction is represented in the schema for later controlled reversal work, but is not exposed in Phase 1 administration. Rules describe future verified events; an official cannot type an arbitrary point value into a resident profile.

## Immutable ledger and score calculation

`community_credit_events` is append-only. Its insert guard copies the rule code, title, category, source domain, and points into immutable snapshots. Updates and deletes are rejected. A reversal must reference one original event, must not reverse another reversal, and must use an equal opposite correction rule. Phase 1 exposes no general application RPC for creating events.

`community_credit_profile(uuid)` calculates the profile on the server: active-policy base score plus that policy's ledger deltas, clamped to the policy minimum and maximum. It returns counts, last activity, and ledger rows. With no active policy it explicitly returns “Community credit policy is not configured.”

## Authorization and privacy

All three tables have RLS enabled and all direct privileges are revoked from public, anonymous, authenticated, and service-role API roles. Narrow `SECURITY DEFINER` RPCs use an empty search path.

- Anonymous users cannot read policies, rules, scores, or ledger rows.
- A linked resident can use the no-argument self RPC and view only their linked record.
- An active linked official can view resident profiles for legitimate barangay use.
- Policy and rule mutation reuses `current_official_may_administer_records()`, restricting it to the established Secretary/Punong authority. Nurses, Tanod accounts, unlinked officials, and archived officials do not satisfy that helper.
- High-level policy/rule administration is logged. Resident ledger content and public-safety narratives are not copied into `activity_log`.

## Public-safety boundary

**A report, complaint, incident or blotter entry is NOT by itself a credit-impacting event.** Phase 1 does not modify complaints, Katarungang Pambarangay, incidents, blotter, Tanod, Safety Map, SMS, health, reservations, or document workflows. It performs no text-name matching and creates no complaint/incident triggers.

Phase 2 or later may add stable incident-party/resident links, verified outcome review, explicit human Credit Impact Review, controlled event creation, appeals, and repair/community-activity workflows. Those integrations must preserve the chain: verified outcome → explicit human review → approved rule → immutable event.

## Current limitations

- No production event-creation UI or RPC exists.
- No appeals or community-service repair workflow exists.
- No incident/KP analytics are inferred; Resident 360 shows a restrained placeholder.
- Policy thresholds, standing labels, and real rules remain barangay business decisions.
- Migration 059 must be reviewed and applied manually; development work does not apply it.
