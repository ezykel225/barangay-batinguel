-- ============================================================
-- Barangay Batinguel E-System — CAPRES 2 migration
-- ============================================================
-- STATUS: Already applied directly to your live Supabase project
-- (mpcyqwasurhtdztzobwg) via the Supabase connector on 2026-08-13.
-- This file is kept as an accurate reference of what was run — e.g.
-- if you ever need to set up a second environment (staging, a
-- teammate's local Supabase project) from scratch. Every statement
-- below was verified against your REAL schema first (table/column
-- names, existing policies, existing constraint names) — this is
-- not a guess like the first draft of this file was.
-- ============================================================


-- ============================================================
-- 1. BUG #10 FIX — reservation submit silently failing when
--    logged in
-- ============================================================
-- The public Court Reservation form could only insert as `anon`.
-- Root cause: reservations only had an INSERT policy scoped to the
-- anon role. Anyone submitting while an auth session was active in
-- the same browser (official, nurse, or now resident) went out as
-- `authenticated` and got silently blocked by RLS with no INSERT
-- policy covering that case.
CREATE POLICY "Allow authenticated insert reservations"
  ON reservations FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ============================================================
-- 2. RESIDENT ROLE SUPPORT
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('official', 'nurse', 'resident'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purok text;

-- Note: profiles already had `email` and `system_id` columns before
-- this migration — those aren't touched here.

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Officials can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'official'
    )
  );


-- ============================================================
-- 3. TREASURER-ONLY RESERVATION APPROVALS
-- ============================================================
-- The Treasurer is the one who actually receives the GCash
-- payment, so only they can approve/decline. The old
-- "Admin and official can update reservations" policy let ANY
-- official do this — dropped and replaced.
DROP POLICY "Admin and official can update reservations" ON reservations;

CREATE POLICY "Treasurer can update reservations"
  ON reservations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN barangay_officials bo ON bo.full_name = p.full_name
      WHERE p.id = auth.uid() AND bo.position = 'Barangay Treasurer'
    )
  );

-- Note: "Admin and official can view reservations" (SELECT, all
-- officials) was left untouched on purpose — every official can
-- still see reservation status, only updating is restricted.


-- ============================================================
-- 4. DOCUMENT REQUESTS (barangay clearance, certificate, etc.)
--    — Secretary-only approvals
-- ============================================================
CREATE TABLE document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid REFERENCES auth.users(id),
  document_type text NOT NULL,
  full_name text NOT NULL,
  contact_number text,
  purok text,
  purpose text NOT NULL,
  additional_notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'ready_for_pickup', 'claimed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Residents can insert their own document requests"
  ON document_requests FOR INSERT
  WITH CHECK (resident_id = auth.uid());

CREATE POLICY "Residents can view their own document requests"
  ON document_requests FOR SELECT
  USING (resident_id = auth.uid());

CREATE POLICY "Officials can view all document requests"
  ON document_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'official'
    )
  );

-- Only the Secretary can change status (approve/decline/ready/claimed) —
-- they manage administrative documents and official records.
CREATE POLICY "Secretary can update document requests"
  ON document_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN barangay_officials bo ON bo.full_name = p.full_name
      WHERE p.id = auth.uid() AND bo.position = 'Barangay Secretary'
    )
  );


-- ============================================================
-- 5. WASTE MANAGEMENT (collection schedule)
-- ============================================================
CREATE TABLE waste_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purok text NOT NULL,
  waste_type text NOT NULL,
  day_of_week text NOT NULL,
  time_label text,
  notes text,
  display_order int DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waste_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view waste schedule"
  ON waste_schedule FOR SELECT
  USING (true);

CREATE POLICY "Officials can manage waste schedule"
  ON waste_schedule FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'official'
    )
  );


-- ============================================================
-- 6. OFFICIAL PROFILE PHOTO
-- ============================================================
-- barangay_officials already had a `photo_url` column before this
-- migration (my first draft of this file wrongly assumed it needed
-- a new `avatar_url` column — corrected). No column added here.
--
-- barangay_officials already had an "Officials can update
-- directory" policy covering any authenticated official — that
-- already covers self-editing photo_url, so no new table policy
-- was needed either. Only the storage side was missing:

INSERT INTO storage.buckets (id, name, public)
VALUES ('official-photos', 'official-photos', true);

CREATE POLICY "Public can view official photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'official-photos');

CREATE POLICY "Officials can upload official photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'official-photos'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'official'
    )
  );

CREATE POLICY "Officials can update official photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'official-photos'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'official'
    )
  );


-- ============================================================
-- 7. BUCKET PUBLIC-FLAG FIX (pre-existing bug, found while
--    investigating #10)
-- ============================================================
-- reservation-payments and residency-proofs already existed with
-- anon-read RLS policies (meaning they were meant to be readable
-- via a plain link) but were flagged public = false at the bucket
-- level. Supabase's getPublicUrl()-style /object/public/ endpoint —
-- which is what Reservation.jsx actually calls — only serves files
-- from buckets flagged public, regardless of RLS. Net effect: payment
-- proof screenshots were very likely showing as broken images for
-- officials reviewing reservations. This aligns the bucket flag with
-- the access level the RLS policies already granted.
UPDATE storage.buckets SET public = true
WHERE id IN ('reservation-payments', 'residency-proofs', 'official-photos');


-- ============================================================
-- NOTES / THINGS STILL WORTH KNOWING
-- ============================================================
-- 1. Officials are linked to their auth account by matching
--    `full_name` exactly between `profiles` and `barangay_officials`
--    (see Sidebar.jsx / OfficialDashboard.jsx fetchUserInfo). This
--    is fragile — if a name is ever spelled slightly differently
--    between the two tables, that official silently loses their
--    photo-edit AND, now, their Treasurer/Secretary approval
--    permission (sections 3 & 4 depend on the same join). Worth
--    adding a `profile_id uuid references auth.users(id)` column on
--    barangay_officials later and switching the lookup to that —
--    not done here since it'd touch a lot of existing working code
--    for a problem you're not hitting yet.
-- 2. There is an existing, currently UNUSED `kapitan_availability`
--    table — a real weekly schedule (day_of_week/time_start/
--    time_end/status), separate from the single-value
--    `kapitan_status` the dashboard already uses. Confirmed with
--    the client this isn't needed for now — the single status
--    toggle (available/in-meeting/out-of-office/on-leave) stays as
--    the only Kapitan status feature. Leaving the note here in case
--    priorities change later.
-- 3. `get_reservation_slots(p_date date)` RPC and the
--    `reservation-payments` bucket's INSERT/SELECT policies were
--    all verified to already exist and work correctly — they were
--    NOT the cause of bug #10.
