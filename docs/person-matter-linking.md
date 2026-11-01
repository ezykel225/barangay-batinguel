# Person and matter linking

Migration 061 adds UUID-based identities for people named in incident and complaint records. It is additive and is intentionally not applied by this change set.

## Identity model

- Barangay residents use `barangay_residents.id`.
- People who are not verified residents use `external_persons.id`.
- A reviewed transition from external person to resident is recorded in `external_person_resident_links`; historical party rows are not rewritten.
- Names are search hints and immutable display snapshots, never matching keys.

## Matter model

`incident_parties` links exactly one resident or external-person UUID to an incident and records a factual role. `complaint_parties` gains optional resident and external-person UUIDs while preserving legacy snapshot-only rows. Existing `blotter_entries.incident_id`, `kp_cases.complaint_id`, and `incident_case_links` remain the authoritative matter links.

Roles and outcome labels describe what was recorded. A respondent or subject is not presumed responsible, and the default outcome is `not_determined`.
`closed` means procedural record closure only. It is not substantiation, proof of responsibility, or an adverse analytics result.

## Matter-counting contract

- An incident and its linked blotter entry are one incident matter (`incident:<uuid>`).
- A complaint and its KP case are one complaint/KP matter chain (`complaint:<uuid>`).
- `incident_case_links` records an explicit relationship between those chains; similar names or text never do.
- Timeline rows are presentation events, not analytics matter counts. Future analytics must use stable matter keys and qualifying UUID-linked roles rather than counting joined rows.
- Multiple incidents linked to one KP case are returned as related incident references on one complaint history record.

## Access and privacy

Active officials may search and view person history. Existing records administrators may create identities and links. Tables are RLS-enabled with direct client privileges revoked; authenticated clients use narrow security-definer RPCs. Activity logs contain administrative actions, not copied person histories.

## Community Credit boundary

Person-history records do not create Community Credit events, change scores, or infer conclusions. External people are explicitly marked not applicable. The existing resident 100 / 0 / 100 model is unchanged.

An explicitly mapped external identity remains available for historical review and is labelled with its linked current resident. Records are not auto-merged. A future history-unification phase may present the old external history in Resident 360, but it must preserve both UUIDs and must not create retroactive Community Credit activity.

Normal external-to-resident linking is insert-once and idempotent for the same target. It cannot remap an identity. Genuine corrections use a separate administrator-only RPC with a mandatory reason and immutable old/new mapping history. Incident identity, role, and outcome corrections likewise preserve narrow immutable before/after history without copying narratives, addresses, or involvement notes.

## Applying later

Apply migrations in numeric order only after review: 001 through 060, then `061_person_matter_linking.sql`. After application, verify official search, explicit UUID linking, resident and external-person history views, and denial for unsupported roles.
