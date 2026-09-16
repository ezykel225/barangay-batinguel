// Facts about Barangay Batinguel that the forms depend on.
// Kept in one file so a correction is a single edit rather than a
// hunt through three components.

export const BARANGAY_NAME = 'Barangay Batinguel'

// ⚠️ STILL NEEDS CONFIRMING WITH THE BARANGAY.
//
// 1 through 6 were inferred from puroks already present in the data.
// 7 was added because it is believed to exist, on purpose despite the
// uncertainty: the two mistakes are not equally bad. Listing a purok
// that does not exist leaves an option nobody picks. Omitting one that
// does means a real resident cannot sign up at all, with no way around
// it -- the dropdown is the whole point, so there is no "other" box to
// fall back on.
//
// So the list errs towards including. That is not a substitute for
// checking it: if Batinguel has an 8th, or names its puroks rather
// than numbering them, add them here and nothing else changes.
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
  'Purok 7',
]
