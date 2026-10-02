// The clinic's weekly schedule, as it is READ rather than as it is
// stored.
//
// Pure, for the reason the rest of `utils/` is: both the public Health
// Center page and the nurse's dashboard import the Supabase client.
//
// ─── ⚠️ A DAY CAN HAVE MORE THAN ONE ROW, AND FRIDAY HAS TWO ──────────
//
// `nurse_availability` has no uniqueness on `day_of_week`, and the live
// table holds:
//
//   Monday    8:00 AM - 5:00 PM   break 12:00 PM - 1:00 PM
//   ...
//   Friday    08:00 - 12:00       break 12:00 - 13:00
//   Friday    13:00 - 17:00       break 12:00 PM - 1:00 PM
//
// So the public page listed Friday twice, once above the other, which
// reads as a rendering fault rather than as two sessions. Both Friday
// rows are also stored in 24-hour form while every other row is stored
// as a display string -- `clinicHours.toMinutes` accepts both, which is
// why nothing broke outright and why nobody noticed.
//
// ⚠️ THE TWO ROWS ARE NOT MERGED INTO ONE. 08:00-12:00 plus 13:00-17:00
// looks exactly like the standard day with a lunch break, and writing
// that down as a single 8:00 AM - 5:00 PM row would be INFERRING what
// the barangay meant and then storing the inference. They are shown as
// what they are: two sessions on one day, in one Friday row. If Friday
// really is an ordinary day, the barangay can say so and the two rows
// become one -- a data correction, made deliberately, not a guess made
// by a display function.
//
// ⚠️ And nothing here deletes or rewrites a row. This module only
// decides what a reader sees.

import { formatTime, toMinutes } from './clinicHours'

export const DAY_ORDER = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]

// A break only means something when it falls INSIDE the session it is
// attached to. The second Friday row carries a 12:00 PM - 1:00 PM
// break against a session that starts at 1:00 PM, which is a leftover
// rather than a closure, and printing it would tell a resident the
// clinic shuts an hour before it opens.
export const breakFallsWithin = (session, breakStart, breakEnd) => {
  const start = toMinutes(session?.start)
  const end = toMinutes(session?.end)
  const bStart = toMinutes(breakStart)
  const bEnd = toMinutes(breakEnd)
  if ([start, end, bStart, bEnd].some((v) => v === null)) return false
  if (bEnd <= bStart) return false
  return bStart >= start && bEnd <= end
}

// One entry per weekday, in weekday order, each carrying every session
// recorded for it.
//
// ⚠️ Days with NO row are included, marked `hasHours: false`. A day
// that is simply absent from the list cannot be told apart from a day
// the page failed to load -- the same reasoning the reconciliation
// panel and the notification bell's empty state follow.
export const buildWeekSchedule = (rows = []) => {
  const byDay = new Map(DAY_ORDER.map((day) => [day, []]))

  rows.forEach((row) => {
    if (!row || !byDay.has(row.day_of_week)) return
    byDay.get(row.day_of_week).push(row)
  })

  return DAY_ORDER.map((day) => {
    const dayRows = byDay.get(day)

    const sessions = dayRows
      .map((row) => ({
        start: row.time_start,
        end: row.time_end,
        startMinutes: toMinutes(row.time_start),
        label: `${formatTime(row.time_start)} – ${formatTime(row.time_end)}`,
        // Carried per session, because the break belongs to the row it
        // was stored on and only applies when it falls inside it.
        breakLabel: breakFallsWithin(
          { start: row.time_start, end: row.time_end },
          row.break_start,
          row.break_end,
        )
          ? `${formatTime(row.break_start)} – ${formatTime(row.break_end)}`
          : null,
      }))
      // Earliest first, so two sessions read in the order they happen.
      // An unparseable time sorts last rather than throwing the order.
      .sort((a, b) => (a.startMinutes ?? Infinity) - (b.startMinutes ?? Infinity))

    // ⚠️ The status is taken from the FIRST row of the day, and when
    // the day's rows disagree that is recorded rather than hidden.
    // Silently picking one of two contradictory values is how a
    // schedule starts lying.
    const statuses = [...new Set(dayRows.map((row) => row.status).filter(Boolean))]

    return {
      day,
      hasHours: sessions.length > 0,
      sessions,
      // True when the day genuinely runs in more than one block, which
      // is a fact about the clinic -- not a duplicate to be collapsed.
      isSplit: sessions.length > 1,
      status: statuses[0] || null,
      statusConflict: statuses.length > 1,
      rowCount: dayRows.length,
    }
  })
}

// The entry for one weekday, or null. Used by the "today" card.
export const scheduleForDay = (week = [], day) =>
  week.find((entry) => entry.day === day) || null
