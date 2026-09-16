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

// ── Contact details ──────────────────────────────────────────
// One place, because the same numbers appear on the Health Center
// page twice and in the footer. Placeholders ("912 345 6789") sat on
// the live site until now precisely because they were duplicated.
export const BARANGAY_CONTACT = {
  landline: '(035) 226-2931',
  // Given as "(+63) 0919 8962 588". Written out as the local form:
  // +63 and a leading 0 are two ways of saying the same thing, so
  // together they are redundant, and 0919 896 2588 is how the number
  // is actually dialled from a Philippine phone.
  mobile: '0919 896 2588',
  mobileIntl: '+63 919 896 2588',
  address: 'Barangay Hall, Batinguel, Dumaguete City',
}

// tel: links want digits only, no spaces or brackets.
export const telHref = (number) => `tel:${number.replace(/[^\d+]/g, '')}`

// ── Barangay Hall office hours ───────────────────────────────
// Distinct from the health centre's clinic hours, which the nurse
// maintains in the database because they change with her shifts and
// leave. The hall keeps fixed hours, so they live here.
//
// The lunch hour is assumed to be the same 12:00-1:00 as the clinic,
// which is the standard for Philippine government offices. If the
// hall differs, this is the only place to change it.
export const BARANGAY_OFFICE_HOURS = {
  days: 'Monday – Friday',
  morning: '8:00 AM – 12:00 NN',
  afternoon: '1:00 PM – 5:00 PM',
  breakNote: 'Lunch break 12:00 NN – 1:00 PM',
  closedNote: 'Closed on weekends & holidays',
}
