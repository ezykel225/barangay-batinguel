// Display labels — the single place where a stored status becomes text a
// resident or an official reads.
//
// ─── WHAT CHANGED, AND WHY IT MATTERS ─────────────────────────────────
//
// This file used to be dead. It was written ahead of the phases that
// would need it, nothing ever imported it, and by the time those phases
// arrived the wording had been decided elsewhere. So it sat in the repo
// holding a SECOND, DIFFERENT vocabulary for statuses the app was
// already rendering: `verified` as "Resident", `rejected` as "Needs
// correction". Neither is what shipped.
//
// It is now wired in, and it holds only what it is actually the
// authority for. Two rules keep it that way:
//
//   1. **Account verification lives in `residentGroups.js`, not here.**
//      That module's VERIFICATION_STATES is the reviewed and approved
//      wording ("Verified", "Rejected — can resubmit", "Not a resident"),
//      and it also owns the Requests / Residents / Not Residents
//      grouping, so the labels and the grouping cannot drift apart. The
//      maps this file used to carry for verification are gone rather than
//      left to contradict it.
//   2. **The purok helpers are gone too.** `isKnownPurok` in
//      `residentGroups.js` does that job and is the one the forms use.
//
// What remains is the statuses no other module owns: document requests,
// reservations, and clinic/consultation availability.
//
// ─── RULES THIS FILE FOLLOWS ──────────────────────────────────────────
//   - No raw database value is ever shown to a user. An official used to
//     read `pending` and `ready for pickup` in the same table where the
//     resident read "Pending Review" and "Ready for Pickup".
//   - Sentence case, not Title Case.
//   - No database value is renamed to suit a label.
//   - Every value a column can hold has an entry, INCLUDING the ones
//     that are neither good nor bad. `cancelled` had no style at all and
//     rendered as an unstyled pill; `on-break` was coloured like a
//     failure.
//   - Unrecognised input is returned as-is rather than replaced with a
//     guess or an empty string. A value nobody anticipated should look
//     odd on screen, not disappear.

// ── Document requests (document_requests.status) ───────────────────────
//
// The five states of the Secretary's workflow. Title Case here is
// deliberate and not a house-style slip: these are the words the
// resident portal already shipped, and changing them would be a visible
// change for no reason.
export const DOCUMENT_STATUS_LABELS = {
  pending: { label: 'Pending Review', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  ready_for_pickup: { label: 'Ready for Pickup', className: 'badge-ready' },
  claimed: { label: 'Claimed', className: 'badge-claimed' },
}

// ── Court reservations (reservations.status) ───────────────────────────
//
// `cancelled` is grey rather than red on purpose. A resident releasing
// their own slot is not a refusal, and it is the one status an official
// never caused.
export const RESERVATION_STATUS_LABELS = {
  pending: { label: 'Pending', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  cancelled: { label: 'Cancelled', className: 'badge-cancelled' },
}

// ── Availability (nurse_availability.status, kapitan_availability.status)
//
// Both tables use the same vocabulary, so one map serves the clinic's
// weekly schedule, the nurse's own day status and the Punong Barangay's
// consultation schedule.
//
// ⚠️ None of these is an error state. The nurse's weekly schedule used
// to colour anything that was not `available` red, which presented a
// lunch break and a scheduled field day as faults. Amber for "here, but
// not right now", grey for "away", red only for "not available at all".
export const AVAILABILITY_STATUS_LABELS = {
  available: { label: 'Available', className: 'badge-approved' },
  'on-break': { label: 'On break', className: 'badge-pending' },
  'on-field': { label: 'On field', className: 'badge-pending' },
  'on-leave': { label: 'On leave', className: 'badge-claimed' },
  unavailable: { label: 'Not available', className: 'badge-declined' },
}

// ── Residency declared on a booking (reservations.residency_status) ────
//
// The column is still written by the reservation form and is not
// displayed anywhere yet, so this map is the wording for when it is
// rather than something in use today. Kept, unlike the maps removed
// above, because it contradicts nothing.
export const RESIDENCY_STATUS_LABELS = {
  resident: { label: 'Resident of Batinguel', className: 'badge-approved' },
  'non-resident': { label: 'Not from Batinguel', className: 'badge-unavailable' },
}

// ── Lookups ───────────────────────────────────────────────────────────
//
// An unknown value keeps its stored text and gets no badge class, so it
// is visible as something unexpected instead of silently blank.
const lookUp = (map, value) => map[value]?.label ?? (value ?? '')
const lookUpClass = (map, value) => map[value]?.className ?? ''

export const documentStatusLabel = (v) => lookUp(DOCUMENT_STATUS_LABELS, v)
export const documentStatusClass = (v) => lookUpClass(DOCUMENT_STATUS_LABELS, v)

export const reservationStatusLabel = (v) => lookUp(RESERVATION_STATUS_LABELS, v)
export const reservationStatusClass = (v) => lookUpClass(RESERVATION_STATUS_LABELS, v)

export const availabilityStatusLabel = (v) => lookUp(AVAILABILITY_STATUS_LABELS, v)
export const availabilityStatusClass = (v) => lookUpClass(AVAILABILITY_STATUS_LABELS, v)

export const residencyStatusLabel = (v) => lookUp(RESIDENCY_STATUS_LABELS, v)
export const residencyStatusClass = (v) => lookUpClass(RESIDENCY_STATUS_LABELS, v)

// ── Counting what is actually upcoming ────────────────────────────────
//
// A card labelled "Upcoming Events" was rendering every event ever
// created, so a barangay with three events last year and none planned
// still read "3 upcoming". A label that says upcoming has to mean it.
//
// Compared as plain ISO date strings, which sort correctly, against
// today in Manila rather than in the browser's zone -- the same reason
// the reservation cancel rule uses Manila: an official in another
// timezone must not see a different day's total.
export const manilaToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

export const isUpcoming = (dateString, today = manilaToday()) => {
  if (!dateString) return false
  // Tolerates a timestamp as well as a date: compare the date part only,
  // so an event at 9am today still counts as upcoming all day.
  const datePart = String(dateString).slice(0, 10)
  return datePart >= today
}

export const countUpcoming = (rows = [], field = 'event_date') =>
  rows.filter((row) => isUpcoming(row?.[field])).length
