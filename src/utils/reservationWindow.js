// The covered court's booking window, and the office-hours exception.
//
// ─── THE RULE ─────────────────────────────────────────────────────────
//
// Ordinary bookings run 5:00 PM - 10:00 PM, up to 4 hours. The court is
// made available for booking after office hours, so the window
// describes when the FACILITY is open: a booking must FINISH by
// 10:00 PM, not merely start before it. The latest ordinary start for a
// full 4 hours is 6:00 PM.
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
// ─── NOON IS NOT A CLOSURE FOR AN EXCEPTION ───────────────────────────
//
// The barangay's decision, 2026-09-30: an exception MAY run continuously
// across 12:00 NN - 1:00 PM, because an ayuda or distribution activity
// can take most or all of the day. The old lunch discontinuity applied
// to ordinary daytime bookings under the previous rule and is gone from
// the booking path entirely.
//
// ⚠️ So a booking's extent is computed in HOURS, never by walking the
// slot-label list. `SLOT_HOURS` has no 12:00 NN entry -- there is no
// such value in `reservation_slot_hour()` either, so noon is not a
// startable time -- and the old walk stopped dead at that gap. That was
// not only the wrong rule, it silently under-reported a booking that
// was already in the data: an approved 10:00 AM / 3-hour row occupies
// hours 10, 11 and 12 in the database's exclusion constraint, while the
// walk returned two labels and the form printed "Ends At: 12:00 PM"
// instead of 1:00 PM.
//
// `coveredHours()` is now the single source of a booking's extent, and
// it matches the database's `int4range(slot_hour, slot_hour + hours)`
// exactly -- continuous, noon included.
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

// What an ordinary resident booking may run for. Unchanged.
export const MAX_DURATION_HOURS = 4

// What an exception request may run for. ⚠️ 8 is not a number chosen
// here -- it is the ceiling of `reservations_duration_hours_check`,
// which has read `duration_hours BETWEEN 1 AND 8` since the table was
// created. So client and database agree exactly, and supporting a
// long ayuda activity needed no schema change. Going past 8 would need
// that CHECK altered, which is a migration and a decision, not a
// constant bumped here.
export const MAX_EXCEPTION_DURATION_HOURS = 8

// ── Every time the court offers as a START, in clock order ───────
//
// ⚠️ This mirrors `reservation_slot_hour()` in migration 020 label for
// label. 12:00 NN is absent from BOTH: noon is not a startable time,
// and the INSERT guard rejects it (`P0001`) rather than storing a row
// the overlap constraint cannot see. A booking may still RUN THROUGH
// noon -- see `coveredHours`.
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

// What an exception request may choose as a start. An exception may run
// on into the evening -- 4 PM for 3 hours ends at 7 PM and is allowed --
// so this is the start times only, not the hours a request may occupy.
export const OFFICE_HOUR_SLOTS = ALL_SLOTS.filter(
  (slot) => SLOT_HOURS[slot] < COURT_OPENS_HOUR
)

export const slotHour = (label) => (
  Object.prototype.hasOwnProperty.call(SLOT_HOURS, label) ? SLOT_HOURS[label] : null
)

// ── Naming an hour ───────────────────────────────────────────────
//
// For DISPLAY only -- the covered-slots line, the end time. Hour 12 has
// a name here and no entry in SLOT_HOURS, which is the whole point:
// a booking can be shown occupying noon without noon becoming a value
// this app would ever write to `preferred_time`.
export const hourLabel = (hour) => {
  if (!Number.isInteger(hour)) return ''
  if (hour === 12) return '12:00 NN'
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:00 ${suffix}`
}

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
// How long a booking starting here may run: never more than its cap,
// and never past closing. Ordinary at 9:00 PM is one hour; an exception
// at 8:00 AM is the full eight. Returns 0 for a label the court does
// not offer, so a caller cannot offer a duration for a time that does
// not exist.
//
// `exception` is passed explicitly rather than inferred from the hour.
// The two agree today -- an office-hours start is exactly what needs a
// reason -- but a caller deciding "is this an exception?" should read
// `isExceptionRequest`/`isOfficeHourSlot` at its own level, not have a
// cap silently change under it.
export const maxDurationForSlot = (label, { exception = false } = {}) => {
  const hour = slotHour(label)
  if (hour === null) return 0
  const cap = exception ? MAX_EXCEPTION_DURATION_HOURS : MAX_DURATION_HOURS
  return Math.max(0, Math.min(cap, COURT_CLOSES_HOUR - hour))
}

export const durationOptionsForSlot = (label, options = {}) => {
  const max = maxDurationForSlot(label, options)
  return Array.from({ length: max }, (_, index) => index + 1)
}

export const endsWithinWindow = (label, duration) => {
  const hour = slotHour(label)
  if (hour === null) return false
  const hours = Math.max(1, Number(duration) || 1)
  return hour + hours <= COURT_CLOSES_HOUR
}

// ── What a booking occupies ──────────────────────────────────────
//
// The hours themselves, continuous, exactly as the database's
// `int4range(slot_hour, slot_hour + GREATEST(COALESCE(duration_hours,
// 1), 1))`. Noon is included when the span reaches it. Nothing here
// stops at a gap, because there is no gap any more.
//
// Empty for a start the court does not offer -- every caller reads that
// as "does not fit" rather than silently shortening the booking.
export const coveredHours = (startSlot, duration) => {
  const hour = slotHour(startSlot)
  if (hour === null) return []
  const hours = Math.max(1, Number(duration) || 1)
  return Array.from({ length: hours }, (_, index) => hour + index)
}

// The same extent, named for display and for matching against the slot
// grid. An hour with no startable label of its own -- noon -- still
// appears, so "Covered Slots" reads 10:00 AM, 11:00 AM, 12:00 NN rather
// than stopping short of what the court is actually being held for.
export const getCoveredSlots = (startSlot, duration) =>
  coveredHours(startSlot, duration).map(hourLabel)

export const canFitDuration = (startSlot, duration, { exception = false } = {}) => {
  const hours = Math.max(1, Number(duration) || 1)
  return hours <= maxDurationForSlot(startSlot, { exception })
}

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
