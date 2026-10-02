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
// ─── ⚠️ TWO SESSIONS READ AS ONE DAY ONLY WHEN THE DATA SAYS SO ───
//
// The first cut of this module refused to join the two Friday rows,
// on the grounds that 08:00-12:00 plus 13:00-17:00 only LOOKS like an
// ordinary day with a lunch break, and that turning the resemblance
// into a single 8:00 AM - 5:00 PM row would be inferring what the
// barangay meant. The page therefore printed two blocks and the line
// "Two sessions — closed in between", which readers took to mean the
// clinic keeps unusual Friday hours.
//
// It is not an inference, and the rows themselves are what settle it:
// BOTH Friday rows record a break of 12:00-13:00, which is exactly the
// gap between the two sessions. The barangay has already written down
// that the closure between them is the lunch break. So `bridgingBreak`
// joins two sessions into one span if and ONLY if a break recorded on
// one of that day's own rows starts precisely where the first session
// ends and ends precisely where the second begins.
//
// ⚠️ The rule is derived, not hard-coded to a weekday. Nothing here
// names Friday, and a day whose gap is NOT covered by a recorded break
// still renders as separate sessions -- so a genuine morning-only /
// late-afternoon clinic day could never be flattened into one span.
// Friday is the only day in the live table with two rows, which is why
// it is the only day this changes.
//
// ⚠️ And nothing here deletes or rewrites a row. The database still
// holds two Friday rows; `sessions` still reports both of them. This
// module only decides what a reader sees.

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

// ⚠️ The one thing that lets two rows become one day, and it reads
// the answer out of the rows rather than guessing it.
//
// Returns the break that exactly FILLS the gap between two sessions --
// starting where the first ends, ending where the second begins -- or
// null. Friday's two rows both carry 12:00-13:00 against a gap of
// 12:00-13:00, so the barangay has already recorded that the closure
// between the sessions is the lunch break.
//
// Deliberately strict on both edges. A break of 12:00-12:30 against a
// gap to 1:00 PM would leave half an hour unaccounted for, and a span
// claiming to run 8 to 5 would then be a half-hour wrong; a day whose
// gap no recorded break covers is left as two sessions, which is the
// honest reading of a clinic that really does close in between.
export const bridgingBreak = (dayRows = [], sessions = []) => {
  if (sessions.length !== 2) return null

  const gapStart = toMinutes(sessions[0]?.end)
  const gapEnd = toMinutes(sessions[1]?.start)
  if (gapStart === null || gapEnd === null || gapEnd <= gapStart) return null

  const match = (dayRows || []).find((row) => {
    const bStart = toMinutes(row?.break_start)
    const bEnd = toMinutes(row?.break_end)
    return bStart === gapStart && bEnd === gapEnd
  })
  if (!match) return null

  return { start: match.break_start, end: match.break_end }
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

    // ⚠️ What the page RENDERS, which is not always one block per
    // stored row. See the header: two sessions whose gap is exactly a
    // break recorded on one of the day's own rows are one span with
    // that break printed under it. `sessions` above is left alone, so
    // nothing loses sight of what the table actually holds.
    const bridge = bridgingBreak(dayRows, sessions)
    const displaySessions = bridge
      ? [{
        start: sessions[0].start,
        end: sessions[sessions.length - 1].end,
        startMinutes: sessions[0].startMinutes,
        label: `${formatTime(sessions[0].start)} – ${formatTime(sessions[sessions.length - 1].end)}`,
        breakLabel: `${formatTime(bridge.start)} – ${formatTime(bridge.end)}`,
      }]
      : sessions

    // ⚠️ The status is taken from the FIRST row of the day, and when
    // the day's rows disagree that is recorded rather than hidden.
    // Silently picking one of two contradictory values is how a
    // schedule starts lying.
    const statuses = [...new Set(dayRows.map((row) => row.status).filter(Boolean))]

    return {
      day,
      hasHours: sessions.length > 0,
      sessions,
      displaySessions,
      // True when a recorded break bridged the gap, so the two stored
      // rows are presented as one day. Kept so a caller can tell this
      // apart from a day that only ever had one row.
      isBridged: Boolean(bridge),
      // True when the day READS as more than one block -- a genuinely
      // split day the data does not explain as a lunch closure.
      isSplit: displaySessions.length > 1,
      status: statuses[0] || null,
      statusConflict: statuses.length > 1,
      rowCount: dayRows.length,
    }
  })
}

// The entry for one weekday, or null. Used by the "today" card.
export const scheduleForDay = (week = [], day) =>
  week.find((entry) => entry.day === day) || null
