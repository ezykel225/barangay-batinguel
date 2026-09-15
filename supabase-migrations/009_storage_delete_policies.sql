-- ============================================================
-- Barangay Batinguel E-System
-- 009 — let officials and residents delete their own uploads
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-15 as migration `storage_delete_policies`.
--
-- Verified, each case in a transaction that was rolled back, with
-- storage.allow_delete_query set so RLS was the only thing deciding:
--
--   official deletes an ID, BEFORE this migration -> 0 rows   (the bug)
--   official deletes an ID, AFTER                  -> 1 row   PASS
--   resident deletes SOMEONE ELSE's ID             -> 0 rows  PASS
--   resident deletes their OWN old ID              -> 1 row   PASS
--
-- The before/after pair is the point: 0 -> 1 on the same statement,
-- with nothing changed but the policy.
--
-- WHY
-- storage.objects had INSERT, SELECT and UPDATE policies for all
-- three buckets and NO DELETE policy for anyone. Nothing could ever
-- be removed through the app.
--
-- Two consequences, both live:
--
-- 1. The "Not a Resident" action (migration 007) promises to delete
--    the applicant's ID. It called storage.remove(), which matched
--    zero rows and did nothing. The account was marked ineligible and
--    the government ID stayed. The handler reports this honestly --
--    "Account marked ineligible, but the ID file could not be
--    deleted" -- so it failed loudly rather than silently, but the
--    retention promise was not being kept.
--
-- 2. Every re-upload orphans its predecessor. All three upload paths
--    build a fresh timestamped name -- `<uid>/<epoch>.<ext>` for IDs
--    and resident photos, `<id>-<epoch>.<ext>` for official photos --
--    then point the database row at the new file. The old object is
--    left behind referenced by nothing, so it is invisible to any
--    cleanup, including the ineligible flow above, which only removes
--    the path currently held in id_document_url.
--
-- A private bucket quietly accumulating photographs of government IDs
-- that no record points to is the kind of retention RA 10173 is meant
-- to prevent: personal data kept past the purpose it was collected
-- for, and in this case past anyone's ability to find it.
--
-- WHAT THIS DOES
-- Mirrors each existing INSERT policy with a matching DELETE, so a
-- caller may delete exactly what they were allowed to upload:
--   - residents: their own folder in id-verification and
--     resident-photos (path must start with their own uid)
--   - officials: any ID, for the ineligible flow
--   - officials: official-photos, which they collectively maintain
--
-- Nobody gains read access they did not already have.
--
-- NOTE ON TESTING THIS
-- storage.objects carries Supabase's own `protect_objects_delete`
-- trigger, which rejects any DELETE issued over a plain SQL
-- connection and tells you to use the Storage API. It is
-- statement-level, so it fires before row filtering and hides
-- whatever RLS would have done. To see RLS on its own, set
-- `storage.allow_delete_query = 'true'` inside a transaction first;
-- that satisfies the trigger and leaves the policies as the only
-- thing deciding. Rolled back, this is a safe way to check a storage
-- policy without touching a real file.
-- ============================================================


-- ── ID documents ─────────────────────────────────────────────
-- Officials: needed by the ineligible flow, which deletes the ID
-- once someone is established not to be a resident.
CREATE POLICY "Officials can delete any ID"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'id-verification'
    AND public.is_official(auth.uid())
  );

-- Residents: so replacing an ID can remove the one it replaces
-- instead of leaving it behind forever.
CREATE POLICY "Residents can delete their own ID"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'id-verification'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );


-- ── Profile photos ───────────────────────────────────────────
CREATE POLICY "Residents can delete their own photo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'resident-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- official-photos is not foldered per user -- names are
-- `<barangay_officials.id>-<epoch>.<ext>` -- and the directory is
-- maintained by officials as a group, matching the existing INSERT
-- and UPDATE policies on this bucket.
CREATE POLICY "Officials can delete official photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'official-photos'
    AND public.is_official(auth.uid())
  );
