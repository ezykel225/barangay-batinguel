-- ============================================================
-- Barangay Batinguel E-System
-- 013 — medicine availability at the health center
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-16 as migration `medicine_availability`, seeded with 13
-- sample medicines.
--
-- RLS verified, each case in a transaction that was rolled back:
--   anonymous visitor reads the list -> 13 rows      PASS
--   signed-in RESIDENT edits a status -> 0 rows      PASS
--   the NURSE edits a status          -> 1 row       PASS
--
-- WHY
-- The barangay agreed the system may show which medicines the health
-- center currently has. Residents walk to the health center, queue,
-- and find out at the counter that the medicine ran out yesterday.
-- Publishing it is the same idea as the announcements board, for
-- medicine: the nurse updates it, everyone reads it.
--
-- STATUS, NOT QUANTITY -- the main design decision here
-- This stores "Available / Low stock / Out of stock", not a number.
-- That is deliberate, and it is the part worth being able to defend.
--
-- A public count is a promise. Publish "50 tablets" and a resident
-- who arrives to none has been told something untrue by the barangay,
-- and the nurse has to explain a number rather than a situation.
--
-- Keeping a count truthful means recording every tablet dispensed --
-- that is a pharmacy inventory system, and it is wrong within hours
-- of anyone forgetting to log a transaction. A nurse can keep three
-- states honest at the end of each day. Nobody can keep a live count
-- honest by hand.
--
-- So the precision of the data matches the precision of the process
-- that maintains it. Residents get the answer they actually need --
-- is it worth the walk today -- and the barangay does not publish a
-- figure it cannot stand behind.
--
-- WHO MAY WRITE
-- The nurse, matching medical_programs and nurse_availability. The
-- health center is theirs; officials read it like everyone else.
--
-- WHY updated_at MATTERS MORE THAN USUAL
-- Stale stock information is worse than none: a resident who trusts
-- it and walks for nothing stops trusting the whole site. The public
-- page shows when the list was last touched, so a resident can judge
-- for themselves whether to rely on it.
-- ============================================================


CREATE TABLE IF NOT EXISTS public.medicine_stock (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name          text NOT NULL,
  -- RA 6675 (Generics Act) -- the generic name is the one that lets a
  -- resident tell whether what is here is what they were prescribed.
  generic_name  text,
  form          text,
  category      text,

  status        text NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'low', 'unavailable')),
  -- Free text for the nurse: "children's dose only", "bring your
  -- prescription", "restock expected Monday".
  notes         text,

  display_order integer DEFAULT 0,
  updated_by    uuid REFERENCES public.profiles(id),
  updated_at    timestamptz DEFAULT timezone('utc', now()),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.medicine_stock ENABLE ROW LEVEL SECURITY;

-- Public, like the announcements it is modelled on. Nothing here is
-- personal data: it is a list of what the health center stocks.
CREATE POLICY "Anyone can view medicine availability"
  ON public.medicine_stock FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Nurses can manage medicine availability"
  ON public.medicine_stock FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'nurse')
  );

CREATE INDEX IF NOT EXISTS idx_medicine_stock_order
  ON public.medicine_stock (display_order, name);


-- ── Sample stock ─────────────────────────────────────────────
-- Medicines a barangay health center in the Philippines typically
-- carries, chosen to line up with the programs already on the nurse's
-- dashboard: NCD Screening (maintenance), Child Immunization and
-- Maternal Care (paediatric doses, ferrous sulfate + folic acid).
--
-- The barangay should replace this with what they actually hold.
INSERT INTO public.medicine_stock
  (name, generic_name, form, category, status, notes, display_order)
VALUES
  ('Paracetamol 500mg',        'Paracetamol',              'Tablet',  'Pain & Fever',        'available',   NULL,                                   1),
  ('Paracetamol 250mg/5ml',    'Paracetamol',              'Syrup',   'Children''s Medicine','available',   'Children''s dose.',                    2),
  ('Mefenamic Acid 500mg',     'Mefenamic Acid',           'Capsule', 'Pain & Fever',        'low',         NULL,                                   3),
  ('Amoxicillin 500mg',        'Amoxicillin',              'Capsule', 'Antibiotics',         'available',   'Bring your prescription.',             4),
  ('Cotrimoxazole 400/80mg',   'Sulfamethoxazole + Trimethoprim', 'Tablet', 'Antibiotics',   'unavailable', 'Restock expected next delivery.',      5),
  ('Amlodipine 5mg',           'Amlodipine',               'Tablet',  'Maintenance',         'available',   'For enrolled hypertension patients.',  6),
  ('Losartan 50mg',            'Losartan Potassium',       'Tablet',  'Maintenance',         'low',         'For enrolled hypertension patients.',  7),
  ('Metformin 500mg',          'Metformin Hydrochloride',  'Tablet',  'Maintenance',         'available',   'For enrolled diabetes patients.',      8),
  ('Cetirizine 10mg',          'Cetirizine',               'Tablet',  'Allergy & Cough',     'available',   NULL,                                   9),
  ('Ascorbic Acid 500mg',      'Ascorbic Acid',            'Tablet',  'Vitamins',            'available',   NULL,                                  10),
  ('Ferrous Sulfate + Folic Acid', 'Ferrous Sulfate + Folic Acid', 'Tablet', 'Vitamins',     'available',   'For pregnant women.',                 11),
  ('Oral Rehydration Salts',   'Oral Rehydration Salts',   'Sachet',  'Other',               'available',   NULL,                                  12),
  ('Albendazole 400mg',        'Albendazole',              'Tablet',  'Other',               'low',         'Deworming.',                          13);
