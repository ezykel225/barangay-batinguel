// What a month of court reservations looks like on a calendar.
//
// The reservation-specific half of the calendar work: occupancy, which
// statuses hold a slot, covered hours, and how a day should be toned.
// `MonthCalendar.jsx` knows none of it, and this module knows nothing
// about grids or React.
//
// ⚠️ THE DEFINITION OF "HELD" IS NOT A CHOICE MADE HERE.
//
// It is `status IN ('pending', 'approved')`, and it is the same
// definition in three other places that must not disagree:
//
//   - `reservations_no_overlapping_slots`, the exclusion constraint,
//     whose partial WHERE is exactly that;
//   - `get_reservation_slots` / `get_reservation_slots_range`, the
//     public RPCs, which filter on the same two;
//   - the public booking form, which marks a slot taken on the same
//     basis.
//
// Slots are held on SUBMISSION, not on approval -- otherwise two people
// could book the same hour while the first sat unreviewed -- and
// `declined` and `cancelled` free the slot again. So a declined booking
// must never make a date look occupied.
//
// ⚠️ Extent comes from `coveredHours()`, never from walking slot labels.
// A booking runs continuously, including through noon for an
// office-hours exception, and the label list has no 12:00 NN entry. The
// old walk stopped dead there and under-reported a 10:00 AM / 3-hour
// booking that exists in the data.

import { ALL_SLOTS, coveredHours, isExceptionRequest } from './reservationWindow'
import { groupByDateKey, toDateKey } from './monthGrid'

// The two statuses that occupy the court.
export const HOLDING_STATUSES = ['pending', 'approved']

export const holdsSlot = (reservation) =>
  HOLDING_STATUSES.includes(reservation?.status)

// How many distinct start times the court offers in a day. Used as the
// denominator for "how full is this date", so it tracks the slot list
// rather than being a number typed here.
export const SLOTS_PER_DAY = ALL_SLOTS.length

// ── A month, indexed by date ─────────────────────────────────────
//
// Returns Map<'YYYY-MM-DD', {
//   held,        // Set of occupied clock hours, from coveredHours
//   rows,        // every reservation on that date, whatever its status
//   holding,     // just the ones that occupy the court
//   exceptions,  // office-hours requests among them
//   pending,     // awaiting a decision
// }>
//
// Every reservation on the date is kept in `rows` even when it holds
// nothing: an official looking at a day wants to see that two bookings
// were declined, not an empty panel.
export const buildReservationCalendar = (reservations) => {
  const byDate = groupByDateKey(reservations || [], (r) => r.preferred_date)
  const calendar = new Map()

  byDate.forEach((rows, key) => {
    const held = new Set()
    const holding = []
    rows.forEach((row) => {
      if (!holdsSlot(row)) return
      holding.push(row)
      coveredHours(row.preferred_time, row.duration_hours).forEach((hour) => held.add(hour))
    })
    calendar.set(key, {
      held,
      rows,
      holding,
      exceptions: holding.filter(isExceptionRequest),
      pending: holding.filter((r) => r.status === 'pending'),
    })
  })

  return calendar
}

// ── How one day should look ──────────────────────────────────────
//
// Returned in the shape `MonthCalendar`'s `renderDay` expects, so the
// mapping from reservation state to tone lives here rather than inside
// the shared component.
//
// `count` is the number of bookings that hold the court, not the number
// of hours: an official scanning a month wants "how many bookings", and
// the hours are in the selected-day panel.
export const describeReservationDay = (cell, calendar) => {
  const day = calendar.get(cell.key)
  if (!day || day.holding.length === 0) {
    return { tone: cell.isPast ? 'muted' : 'default', count: 0, label: 'no bookings' }
  }

  const bookings = day.holding.length
  const hours = day.held.size
  const parts = [
    `${bookings} ${bookings === 1 ? 'booking' : 'bookings'}`,
    `${hours} ${hours === 1 ? 'hour' : 'hours'} held`,
  ]
  if (day.pending.length > 0) {
    parts.push(`${day.pending.length} awaiting a decision`)
  }
  if (day.exceptions.length > 0) {
    parts.push(
      `${day.exceptions.length} office-hours ${day.exceptions.length === 1 ? 'request' : 'requests'}`
    )
  }

  return {
    // Amber while something still needs an official, green once every
    // booking on the day has been decided. Past days stay grey, but a
    // past day with bookings still shows its count -- the record of what
    // happened is not nothing.
    tone: cell.isPast ? 'muted' : (day.pending.length > 0 ? 'warn' : 'has'),
    count: bookings,
    label: parts.join(', '),
  }
}

// Reservations on one date, newest-decided-last so the panel reads in
// clock order rather than in submission order.
export const reservationsOnDate = (calendar, dateKeyValue) => {
  const key = toDateKey(dateKeyValue)
  if (!key) return []
  const day = calendar.get(key)
  if (!day) return []
  return [...day.rows].sort((a, b) => {
    const ah = coveredHours(a.preferred_time, 1)[0]
    const bh = coveredHours(b.preferred_time, 1)[0]
    if (ah === undefined && bh === undefined) return 0
    if (ah === undefined) return 1
    if (bh === undefined) return -1
    return ah - bh
  })
}
