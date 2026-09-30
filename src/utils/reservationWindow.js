// The covered court's booking window, and the office-hours exception.
//
// ─── THE RULE ─────────────────────────────────────────────────────────
//
// Ordinary bookings run 5:00 PM - 10:00 PM. The court is made available
// for booking after office hours, so the window describes when the
// FACILITY is open: a booking must FINISH by 10:00 PM, not merely start
// before it. Maximum duration stays 4 hours, so the latest ordinary
// start for a full 4 hours is 6:00 PM.
//
// An office-hours booking is an EXCEPTION the barangay decides one at a
// time. A resident asks for one deliberately and has to explain the
// activity. Ayuda distributions, health activities and city or
// government activities are the examples the barangay gave.
//
// ⚠️ THOSE EXAMPLES ARE NOT APPROVAL CATEGORIES. Nothing here reads
// `activity_type`, and nothing should: whether an event can be
// accommodated depends on the day and on which officials are available.
// An official decides every exception. Do not add logic that approves
// one because a category was selected.
//
// The daytime slots are INHERITED SYSTEM BEHAVIOUR -- the range this app
// has always offered -- not a documented statement that the barangay's
// office hours are 8 to 5. User-facing wording says "office hours"
// without claiming a span.
//
// ─── WHY THIS IS A MODULE ─────────────────────────────────────────────
//
// The same rules are needed by the public booking form (which slots to
// offer, which durations fit), the Official queue (which requests are
// exceptions) and the Resident portal (what to call a pending
// exception). Pure, so it is unit-testable without the Supabase
// environment variables.
//
// ⚠️ These hours exist TWICE by necessity: here, and in
// `reservation_slot_hour()` in migration 020, which the generated
// `slot_hour` column and the INSERT guard both use. A client constant
// cannot cross into the database, so the two are one fact in two places.
// Changing the offered times means changing both, and migration 010's
// header explains what goes wrong when they drift: an unrecognised label
// yields a NULL `slot_hour`, and the overlap guard's partial WHERE
// silently stops covering those rows.

// ── The window ───────────────────────────────────────────────────
export const COURT_OPENS_HOUR = 17   // 5:00 PM
export const COURT_CLOSES_HOUR = 22  // 10:00 PM
export const MAX_DURATION_HOURS = 4

// ── Every slot the court offers, in clock order ──────────────────
//
// 12:00 NN is absent because the court closes for lunch. 11:00 AM and
// 1:00 PM therefore sit next to each other in this list while being two
// hours apart on the clock, and everything that walks the list has to
// know it -- otherwise a 2-hour booking at 11 AM quietly holds 11-12 and
// 1-2 while telling the resident they have the court from 11 to 1.
export const SLOT_HOURS = {
  '8:00 AM': 8,
  '9:00 AM': 9,
  '10:00 AM': 10,
  '11:00 AM': 11,
  '1:00 PM': 13,
  '2:00 PM': 14,
  '3:00 PM': 15,
  '4:00 PM': 16,
  '5:00 PM': 17,
  '6:00 PM': 18,
  '7:00 PM': 19,
  '8:00 PM': 20,
  '9:00 PM': 21,
}

export const ALL_SLOTS = Object.keys(SLOT_HOURS)

// What an ordinary booking may choose.
export const EVENING_SLOTS = ALL_SLOTS.filter(
  (slot) => SLOT_HOURS[slot] >= COURT_OPENS_HOUR
)

// What an exception request may choose. An exception may run on into the
// evening -- 4 PM for 3 hours ends at 7 PM and is allowed -- so this is
// the start times only, not the hours a request may occupy.
export const OFFICE_HOUR_SLOTS = ALL_SLOTS.filter(
  (slot) => SLOT_HOURS[slot] < COURT_OPENS_HOUR
)

export const slotHour = (label) => (
  Object.prototype.hasOwnProperty.call(SLOT_HOURS, label) ? SLOT_HOURS[label] : null
)

// ── Classification ───────────────────────────────────────────────
//
// By START hour, matching the database guard exactly. A booking from
// 4 PM to 7 PM is an exception even though most of it is in the evening,
// because it takes the court during office hours.
export const isEveningSlot = (label) => {
  const hour = slotHour(label)
  return hour !== null && hour >= COURT_OPENS_HOUR
}

export const isOfficeHourSlot = (label) => {
  const hour = slotHour(label)
  return hour !== null && hour < COURT_OPENS_HOUR
}

// ── Duration ─────────────────────────────────────────────────────
//
// How long a booking starting here may run: never more than the cap, and
// never past closing. At 9:00 PM that is one hour; at 6:00 PM the full
// four. Returns 0 for a label the court does not offer, so a caller
// cannot accidentally offer a duration for a time that does not exist.
export const maxDurationForSlot = (label) => {
  const hour = slotHour(label)
  if (hour === null) return 0
  return Math.max(0, Math.min(MAX_DURATION_HOURS, COURT_CLOSES_HOUR - hour))
}

export const durationOptionsForSlot = (label) => {
  const max = maxDurationForSlot(label)
  return Array.from({ length: max }, (_, index) => index + 1)
}

export const endsWithinWindow = (label, duration) => {
  const hour = slotHour(label)
  if (hour === null) return false
  const hours = Math.max(1, Number(duration) || 1)
  return hour + hours <= COURT_CLOSES_HOUR
}

// ── Covered slots ────────────────────────────────────────────────
//
// The consecutive labels a booking occupies, stopping at the lunch gap.
// A short return means the duration does not fit, which every caller
// treats as a refusal rather than silently shortening the booking.
export const getCoveredSlots = (startSlot, duration, slots = ALL_SLOTS) => {
  const startIndex = slots.indexOf(startSlot)
  const covered = []
  if (startIndex === -1) return covered

  const wanted = Math.max(1, Number(duration) || 1)
  for (let i = 0; i < wanted; i++) {
    const slot = slots[startIndex + i]
    if (!slot) break
    if (i > 0) {
      const previous = slots[startIndex + i - 1]
      if (SLOT_HOURS[slot] - SLOT_HOURS[previous] !== 1) break
    }
    covered.push(slot)
  }
  return covered
}

export const canFitDuration = (startSlot, duration, slots = ALL_SLOTS) =>
  getCoveredSlots(startSlot, duration, slots).length === Math.max(1, Number(duration) || 1)
  && endsWithinWindow(startSlot, duration)

// ── Is this row an exception request? ────────────────────────────
//
// ⚠️ Read from `exception_reason`, NOT from the hour.
//
// Every reservation that existed before migration 020 starts before 5 PM
// and has no reason, because it was an ordinary booking under the old
// rule. Classifying by hour would relabel all of that history as
// exception requests, put a badge on rows nobody requested an exception
// for, and bury the real ones. The reason column only exists on requests
// made deliberately after the rule.
export const isExceptionRequest = (reservation) =>
  typeof reservation?.exception_reason === 'string'
  && reservation.exception_reason.trim() !== ''

// A daytime booking with no reason: not an exception request, and not
// something to flag. Kept as its own predicate so the distinction is
// stated once rather than re-derived.
export const isLegacyDaytimeBooking = (reservation) =>
  !isExceptionRequest(reservation) && isOfficeHourSlot(reservation?.preferred_time)

// ── Wording ──────────────────────────────────────────────────────
export const EXCEPTION_BADGE_LABEL = 'Office-hours exception'

// What the resident sees for their own booking. A pending exception is
// not the same prospect as a pending evening booking, and saying
// "Pending" for both would imply it is.
export const residentStatusLabel = (reservation) => {
  if (reservation?.status !== 'pending') return null
  return isExceptionRequest(reservation)
    ? 'Office-hours request — awaiting barangay decision'
    : null
}
