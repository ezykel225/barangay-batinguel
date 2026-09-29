// Display labels — the single place where a database value becomes text
// a resident or an official reads.
//
// ⚠️ NOTHING IMPORTS THIS YET, AND THAT IS DELIBERATE.
//
// It is created in this phase so that the phases which change visible
// wording have one module to extend rather than three dashboards to keep
// in sync. Wiring it into the UI is Phase 4 (verification terminology),
// Phase 6 (badges) and Phase 7 (purok display). Until then the existing
// STATUS_LABELS maps inside ResidentDashboard keep rendering exactly what
// they render today — this phase changes no user-visible word.
//
// The shape follows the STATUS_LABELS idiom already in
// ResidentDashboard.jsx: { label, className } per value, so a badge can
// take its text and its colour class from one lookup.
//
// ─── RULES THIS FILE FOLLOWS ──────────────────────────────────────────
//   - No raw database value is ever shown to a user.
//   - Sentence case, not Title Case.
//   - English only. The barangay's forms and signage are in English, and
//     a half-translated interface reads worse than a consistent one.
//   - No database value is renamed to suit a label. `rejected` and
//     `ineligible` stay distinct values with distinct meanings; only
//     their wording is decided here.
//   - Unrecognised input is returned as-is rather than replaced with a
//     guess or an empty string. A value nobody anticipated should look
//     odd on screen, not disappear.

// ── Account verification (profiles.verification_status) ───────────────
// The four states, and why the words differ from the database:
//
//   pending     -> "Awaiting review"  — says who is waiting on whom.
//   verified    -> "Resident"         — the outcome, not the process.
//   rejected    -> "Needs correction" — fixable, and the resident may
//                                      resubmit. Not a refusal.
//   ineligible  -> "Not a resident"   — terminal, and only an official
//                                      can set or lift it.
//
// "Rejected" was doing both of the last two jobs and reading as a
// judgement on the person. These two labels separate a form problem from
// a residency finding.
export const VERIFICATION_STATUS_LABELS = {
  pending: { label: 'Awaiting review', className: 'badge-pending' },
  verified: { label: 'Resident', className: 'badge-approved' },
  rejected: { label: 'Needs correction', className: 'badge-declined' },
  ineligible: { label: 'Not a resident', className: 'badge-unavailable' },
}

// ── Official actions on an account ────────────────────────────────────
// Buttons name the outcome the official is creating, not an internal
// verb. Keyed by the action, not by a status, because two of them are
// reached from more than one state.
export const VERIFICATION_ACTION_LABELS = {
  verify: 'Confirm resident',
  reject: 'Return for correction',
  markIneligible: 'Mark as not a resident',
  reopen: 'Reopen for review',
}

// ── Document requests (document_requests.status) ───────────────────────
// Deliberately NOT unified with the reservation wording below. A
// document that is "Pending review" is waiting on the Secretary; a
// reservation that is "Pending" is waiting on the Treasurer and is
// already holding its slot. Collapsing both into one word would hide
// that difference from the official who has to act on it.
export const DOCUMENT_STATUS_LABELS = {
  pending: { label: 'Pending review', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  ready_for_pickup: { label: 'Ready for pickup', className: 'badge-ready' },
  claimed: { label: 'Claimed', className: 'badge-claimed' },
}

// ── Court reservations (reservations.status) ───────────────────────────
export const RESERVATION_STATUS_LABELS = {
  pending: { label: 'Pending', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  cancelled: { label: 'Cancelled', className: 'badge-claimed' },
}

// ── Residency status on a booking (reservations.residency_status) ──────
// ⚠️ This is NOT the account verification status above, and the two must
// never be read as evidence of each other in either direction. A
// walk-in with no account may book the court and tick "resident"; a
// verified resident may book as a non-resident guest of someone else.
// Nothing infers one from the other.
export const RESIDENCY_STATUS_LABELS = {
  resident: { label: 'Resident of Batinguel', className: 'badge-approved' },
  'non-resident': { label: 'Not from Batinguel', className: 'badge-unavailable' },
}

// Looks up a label map and falls back to the raw value.
//
// The fallback matters: if a new status is added to the database and
// nobody updates this file, the screen shows the raw value — visibly
// wrong, and therefore noticed and fixed. Returning '' or 'Unknown'
// would hide it.
const lookUp = (map, value) => {
  if (value === null || value === undefined || value === '') return ''
  return map[value]?.label ?? String(value)
}

const lookUpClass = (map, value) => map[value]?.className ?? ''

export const verificationStatusLabel = (v) => lookUp(VERIFICATION_STATUS_LABELS, v)
export const verificationStatusClass = (v) => lookUpClass(VERIFICATION_STATUS_LABELS, v)

export const documentStatusLabel = (v) => lookUp(DOCUMENT_STATUS_LABELS, v)
export const documentStatusClass = (v) => lookUpClass(DOCUMENT_STATUS_LABELS, v)

export const reservationStatusLabel = (v) => lookUp(RESERVATION_STATUS_LABELS, v)
export const reservationStatusClass = (v) => lookUpClass(RESERVATION_STATUS_LABELS, v)

export const residencyStatusLabel = (v) => lookUp(RESIDENCY_STATUS_LABELS, v)
export const residencyStatusClass = (v) => lookUpClass(RESIDENCY_STATUS_LABELS, v)

// ── Purok ─────────────────────────────────────────────────────────────
// The database holds the same place written several ways: '4',
// 'Purok 4', 'PUROK 4' — plus 'purol 5', 'asd' and 'testing', which a
// free-text box produced before the dropdown replaced it.
//
// These helpers are TOLERANT AND NON-DESTRUCTIVE. They normalise only
// unambiguous format variants of a number, and return anything else
// exactly as stored. They never guess what somebody meant: 'purol 5'
// is probably Purok 5, but 'probably' is not good enough to reshape a
// resident's record, and it is not this module's decision to make.
// Cleaning the stored values is a separate, optional migration.
//
// 'All Purok' is preserved verbatim — the waste collection schedule uses
// it to mean a barangay-wide collection day, and it is not a typo.

// Pulls a purok number out of the recognised formats, or null.
const purokDigits = (value) => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  // Bare number: '4'
  if (/^\d{1,2}$/.test(s)) return s
  // 'Purok 4', 'PUROK 4', 'purok4' — the word, then the number, and
  // nothing else. Anything with extra words or a misspelling falls
  // through on purpose.
  const m = s.match(/^purok\s*(\d{1,2})$/i)
  return m ? m[1] : null
}

// Full form, for prose, headings, form fields and dropdowns:
// 'Purok 4'. Unrecognised values come back untouched.
export const purokLabel = (value) => {
  const n = purokDigits(value)
  if (n !== null) return `Purok ${n}`
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// Number only, for a table column already headed "Purok" — repeating
// the word in all 40 rows of a column called Purok wastes the width a
// narrow phone screen does not have.
//
// Anything that is not a recognised number keeps its full text, because
// a cell reading 'asd' under a Purok column is information: somebody
// needs to fix that record.
export const purokNumber = (value) => {
  const n = purokDigits(value)
  if (n !== null) return n
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// True only for values this module recognises as a purok. Useful for
// flagging the records that still need a human to look at them; not
// used to reject or rewrite anything.
export const isRecognisedPurok = (value) => purokDigits(value) !== null
