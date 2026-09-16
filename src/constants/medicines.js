// Shared by the nurse's Medicines tab and the public Health Center
// page, so the two can never disagree about what a status means.

// Fixed list rather than a free-text box. The purok column is the
// cautionary tale: free text there produced '4', 'Purok 4', 'PUROK 4'
// and 'purol 5' -- four spellings of one place, ungroupable.
export const MEDICINE_CATEGORIES = [
  'Pain & Fever',
  'Antibiotics',
  'Maintenance',
  'Allergy & Cough',
  'Vitamins',
  "Children's Medicine",
  'Other',
]

export const MEDICINE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Sachet',
  'Ointment',
  'Drops',
  'Other',
]

// Three states, not a quantity. A published count is a promise the
// barangay cannot keep without logging every tablet dispensed; three
// states are something a nurse can keep honest at the end of a day.
//
// `hint` is what the resident reads. It answers the only question
// they actually have -- is it worth the walk today.
export const MEDICINE_STATUS = {
  available: {
    label: 'Available',
    hint: 'In stock today.',
    className: 'medicine-available',
  },
  low: {
    label: 'Low stock',
    hint: 'Running out — come early, and bring an alternative if you can.',
    className: 'medicine-low',
  },
  unavailable: {
    label: 'Out of stock',
    hint: 'None today. Please ask the health center when it is expected.',
    className: 'medicine-unavailable',
  },
}

// Guards against a row written before a status existed, or by hand in
// the SQL editor, rendering as a blank badge.
export const statusOf = (status) =>
  MEDICINE_STATUS[status] || MEDICINE_STATUS.unavailable
