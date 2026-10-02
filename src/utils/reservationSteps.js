// The covered court booking flow: which step a field belongs to, and
// what is said when one is missing.
//
// ─── WHY THIS IS A MODULE AND NOT PART OF Reservation.jsx ─────────────
//
// The same reason `reservationWindow.js` and `residentGroups.js` are:
// `Reservation.jsx` imports the Supabase client, which throws at import
// time without the env vars, so nothing in it can be unit-tested on a
// checkout that has no `.env`. The rules below are pure.
//
// ─── THE RULE THESE EXIST TO HOLD ─────────────────────────────────────
//
// ⚠️ A field is validated by the step that ASKS for it, and by no other.
// The flow's whole point is that somebody choosing a date is never told
// their NAME is missing -- which is what one long form does, because a
// single submit handler checks everything at once. So:
//
//   step 1  what and when   TIME_FIELDS
//   step 2  who             DETAIL_FIELDS
//   step 3  review          nothing of its own
//
// `reservationSteps.test.js` asserts the two sets are DISJOINT and that
// together they cover every value `create_court_reservation` requires.
// Adding a required field to the form without putting it in one of the
// two lists fails there rather than at the database.
//
// What is deliberately NOT here: the booking window, the duration caps,
// the overlap check and the office-hours rule. Those are
// `reservationWindow.js` and the database's own triggers (020, 021), and
// restating any of them would give one rule two homes that can drift --
// the mistake migration 021 avoided by not repeating the 8.

export const RESERVATION_STEPS = [
  { key: 'when', label: 'Date & Time' },
  { key: 'who', label: 'Your Details' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

// Step 1. `duration_hours` is here rather than in step 2 because it is
// part of choosing when: it decides which start times can still fit.
export const TIME_FIELDS = [
  { name: 'preferred_date', message: 'Please select a date.' },
  { name: 'preferred_time', message: 'Please select a start time.' },
  { name: 'duration_hours', message: 'Please choose how long you need the court.' },
]

// Step 2. One message per field rather than one for the group: "Please
// fill in all your contact details" does not say which of five is
// blank, and on a form somebody has already spent two steps on, that is
// the difference between a correction and a hunt.
export const DETAIL_FIELDS = [
  { name: 'full_name', message: 'Please enter your full name.' },
  { name: 'purok', message: 'Please select your purok.' },
  { name: 'contact_number', message: 'Please enter a contact number.' },
  { name: 'email', message: 'Please enter an email address.' },
  { name: 'residency_status', message: 'Please select your residency status.' },
  { name: 'activity_type', message: 'Please choose what the court will be used for.' },
  { name: 'purpose', message: 'Please tell us the purpose of your reservation.' },
]

// Blank is '', null, undefined, or whitespace only. ⚠️ NOT falsy:
// `duration_hours` is a number, and `0` is a value the form cannot
// produce but a crafted state could -- treating it as "present" here
// would let it through to the database's own CHECK, which is a raw
// 23514 rather than a sentence. So zero counts as missing.
const isBlank = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return !Number.isFinite(value) || value <= 0
  return String(value).trim() === ''
}

// The FIRST missing field's message, or null when the step is complete.
// First rather than all of them: the fields are in the order they are
// rendered, so the message names the one the person reaches next.
export const firstMissingMessage = (formData, fields) => {
  const found = fields.find((field) => isBlank(formData?.[field.name]))
  return found ? found.message : null
}

export const missingTimeMessage = (formData) =>
  firstMissingMessage(formData, TIME_FIELDS)

export const missingDetailMessage = (formData) =>
  firstMissingMessage(formData, DETAIL_FIELDS)
