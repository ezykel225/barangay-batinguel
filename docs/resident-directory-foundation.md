# Barangay Resident Directory foundation

Migration: `supabase-migrations/054_barangay_resident_directory.sql` (NOT APPLIED).

## Architecture and scope

The existing Official Residents view manages online profiles and verification.
`residents_registry` is the Voter Reference List, not an authoritative resident roll.
Document requests keep submitted identity snapshots. Complaint parties have their
own explicit profile/registry references; neither establishes a general directory.
No suitable resident directory or reliable DOB column was found in the repository.
This foundation does not change those existing workflows or link historical data.

`barangay_residents` holds structured names, optional calendar birth date, optional
resident-provided mobile, optional free-text purok, active/inactive directory status,
optional unique profile UUID, and timestamps. It stores no permanent age/senior flag.
The project's Purok list is explicitly unconfirmed, so it is not a DB allowlist.
No structured street-address pattern was established; no new address scheme is added.
Active/inactive is directory inclusion, not an account-verification decision.

## Access and account links

RLS is enabled and all client table privileges are revoked, with no browse policies.
Only authenticated Secretary/Punong Barangay identities passing the existing
`current_official_may_administer_records()` helper can use list/save RPCs.
Other officials, anonymous visitors, residents, nurses and Tanod cannot browse/manage.
No delete endpoint is provided; edit status to inactive instead of deleting identity.

The optional profile FK is unique, nullable and accepts resident-role profiles only.
Residents without online accounts are valid. No name matching, voter import or seed
rows exist. Manual account-link selection UI is deferred; save RPC cannot write links.
No account links should be populated ad hoc: a future authorized explicit linking RPC
must also log link changes and enforce current identity eligibility atomically.

Saves atomically append `added`/`edited` activity entries using the existing actor
stamp and append-only log. The new entity label is Barangay resident. Subjects do
not contain names, DOBs or phone numbers. Deactivation is an audited record edit.

## Future targeting

`barangay_resident_candidates(date,date,text)` is private (no client EXECUTE grant).
It returns active resident UUIDs, raw mobile, DOB, purok and optional profile UUID.
DOB bounds are inclusive and missing DOBs fail a specified bound; no bounds includes
records with unknown DOB. Purok uses exact stored text. Phones remain optional and
are not converted to provider format. A later trusted targeting service can validate
and normalize phones; the private helper includes missing phones for skipped counts.
No senior threshold, SMS consent policy, broadcast tables or SMS calls are introduced.

## Manual application

1. Review 054 and confirm migrations through 053 exist on the intended project.
2. Apply the complete 054 transaction manually in Supabase SQL Editor. It creates
   schema only; do not rerun it after success. It does not update historical migrations.
3. Run Supabase security advisors and inspect function ACLs/search_path after applying.
4. In a controlled environment, verify Secretary/Punong list/save succeeds and all
   other roles fail; verify direct table reads/writes fail for authenticated and anon.
5. Verify optional DOB/mobile/account, unique resident-only profile FK, future DOB
   rejection, and save+audit rollback together on failure. Do not use production data
   for these checks. Refresh the Official Residents view after installation.

No migration was applied or live SQL executed during implementation. Jest verifies
UI behavior and migration security contracts by source inspection; these are not
executed PostgreSQL/RLS integration tests. No local PostgreSQL runtime was available.
Browser QA uses only synthetic data and mocked RPCs, at 1440/768/375 pixels.


## Controlled demo seed and future verification (not applied)

The owner explicitly confirmed that all currently verified resident accounts in
this capstone/demo database are intended demo accounts. The separate script
`supabase-seeds/seed_demo_barangay_residents.sql` resolves their profile UUIDs at
execution; no hard-coded count, name matching, email matching or voter lookup.
It copies name parts/contact/purok, creates active linked records, and uses fixed
synthetic DOBs for new demo records only. The first three UUIDs receive 1950/1958/
1965 DOBs; remaining adults receive 1980-2000 DOBs. This is not real DOB evidence.
`ON CONFLICT (profile_id) DO NOTHING` preserves existing IDs, DOBs, status and fields.
Run only in this demo database. Invalid source values abort rather than fabricate
replacements. Runtime notices and scoped SELECTs show eligible/inserted/preserved,
DOB/mobile/active/linked counts, purok groups and age-60+ examples as of CURRENT_DATE.
Exact counts cannot be reported before execution; no SQL has been run by the agent.

Migration `055_verified_resident_directory_sync.sql` is separate schema work for
the owner's NEW request for automatic future verification linking. It is not demo
seed data and contains no backfill. Apply manually after 054; seed current demo
records before 055 if synthetic DOB examples are desired. The AFTER profile trigger
uses the established verification/RLS guards, synchronizing only transitions into
verified resident status (or verified resident insertion). Pending/rejected/
ineligible and nonresident accounts are skipped. Ordinary verified profile updates
do not continuously mirror into the authoritative directory. Re-verification
upserts safe profile fields by UUID while preserving directory DOB and status.
New records always have null DOB until legitimately supplied. Historical existing
verified accounts are not silently copied by this migration.

Source values incompatible with 054 (including missing name parts or malformed
nonempty phone numbers) cause the verification transaction to roll back atomically.
The official must correct that source data before retrying. No silent fallback,
DOB guessing, name splitting or source-profile modification is performed by sync.
Activity logs contain a high-level action without DOB/phone/name values. Manual
link editing remains deferred; verification now establishes its own UUID link.
Test authorization and trigger behavior in a controlled PostgreSQL environment and
run security advisors after applying 055. Jest checks SQL source contracts only;
these are not executed database integration tests. No migration or seed is applied
by this implementation, and no SMS is sent.

Owner subsequently reported migration 054 was manually applied successfully.
Migration 055 and the demo seed remain unapplied by the agent. No unlinked
resident is merged by name; only an existing matching profile UUID is upserted.
