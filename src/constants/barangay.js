// Facts about Barangay Batinguel that the forms depend on.
// Kept in one file so a correction is a single edit rather than a
// hunt through three components.

export const BARANGAY_NAME = 'Barangay Batinguel'

// ⚠️ CONFIRM THIS LIST WITH THE BARANGAY BEFORE THE DEFENSE.
//
// It was inferred from the puroks already present in the data
// (1 through 6) because the real list was never written down
// anywhere in this project. If Batinguel has more puroks, or names
// them rather than numbers them, a resident from a missing purok
// cannot complete signup at all -- which is worse than the free-text
// box this replaces. Add them here and nothing else needs to change.
//
// Free text is what produced the values now sitting in the database:
// '4', 'Purok 4', 'PUROK 4', 'purol 5', 'asd' and 'testing'. Five
// different spellings of the same place cannot be grouped, counted or
// matched against the registry, which is why this is a fixed list.
export const PUROKS = [
  'Purok 1',
  'Purok 2',
  'Purok 3',
  'Purok 4',
  'Purok 5',
  'Purok 6',
]
