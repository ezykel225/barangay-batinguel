// Events on a calendar, and which of them are still to come.
//
// The event-specific half: placement by date, the labels, and the
// upcoming/past split. `MonthCalendar.jsx` knows none of it. Serves the
// public Events page, the Official Events tab and the Nurse's Health
// Events tab, so `events` and `health_events` cannot drift into two
// different ideas of which day an event falls on.
//
// ⚠️ `event_date` IS THE DATE. `event_month` and `event_day` are not.
//
// Those two are denormalised display copies, written by the client as
// `new Date(dateString)` then `.getDate()` / `.toLocaleString()`. The
// string parses as UTC midnight and both methods read it back in the
// BROWSER's zone, so west of UTC they describe the previous day. They
// happen to be correct today because every row was written from the
// Philippines, but nothing enforces that, and a calendar built on them
// would inherit the hazard. Everything here reads `event_date` through
// `toDateKey`, which never constructs a Date at all.

import { groupByDateKey, toDateKey } from './monthGrid'
import { formatTime, toMinutes } from './clinicHours'
import { manilaToday } from './displayLabels'

// ── A month of events, indexed by date ───────────────────────────
//
// Map<'YYYY-MM-DD', event[]>. A row with no usable `event_date` is left
// out rather than placed on a guessed day -- see `groupByDateKey`.
export const buildEventCalendar = (events) =>
  groupByDateKey(events || [], (e) => e.event_date)

// ── How one day should look ──────────────────────────────────────
//
// `MonthCalendar`'s renderDay shape. Past days with events keep their
// count: an event that happened is still a fact about that date.
export const describeEventDay = (cell, calendar) => {
  const onDay = calendar.get(cell.key) || []
  if (onDay.length === 0) {
    return { tone: cell.isPast ? 'muted' : 'default', count: 0, label: 'no events' }
  }
  return {
    tone: cell.isPast ? 'muted' : 'has',
    count: onDay.length,
    label: `${onDay.length} ${onDay.length === 1 ? 'event' : 'events'}`,
  }
}

// Events on one date, in a stable order. `event_time` is a `time`
// column and may be null, so a timed event sorts before an untimed one
// and ties fall back to the title -- otherwise two events on a day
// could swap places between renders.
export const eventsOnDate = (calendar, dateKeyValue) => {
  const key = toDateKey(dateKeyValue)
  if (!key) return []
  return [...(calendar.get(key) || [])].sort((a, b) => {
    const at = a.event_time || ''
    const bt = b.event_time || ''
    if (at && bt && at !== bt) return at < bt ? -1 : 1
    if (at && !bt) return -1
    if (!at && bt) return 1
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}

// ── Upcoming, properly ───────────────────────────────────────────
//
// ⚠️ Filter THEN limit. The homepage's "Upcoming Events" section used
// `.order('event_date').limit(4)` with no date filter, so on live data
// it showed three events from 2024 first and the single genuinely
// upcoming one last, under a heading promising the opposite. Sorting
// everything and taking the first four is exactly the bug.
//
// `today` is injectable so a test can pin it; it defaults to the
// Manila date, which is the project's one answer to "what day is it".
export const upcomingEvents = (events, { limit = 0, today = manilaToday() } = {}) => {
  if (!Array.isArray(events)) return []

  const future = events
    .map((event) => ({ event, key: toDateKey(event.event_date) }))
    // A row with no usable date is not "upcoming" -- it is unscheduled,
    // and putting it in a list headed Upcoming would assert a date it
    // does not have.
    .filter(({ key }) => key !== '' && key >= today)
    // String comparison, correct for zero-padded ISO dates.
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ event }) => event)

  return limit > 0 ? future.slice(0, limit) : future
}

// The complement, for an official or the nurse looking back.
export const pastEvents = (events, { today = manilaToday() } = {}) => {
  if (!Array.isArray(events)) return []
  return events
    .map((event) => ({ event, key: toDateKey(event.event_date) }))
    .filter(({ key }) => key !== '' && key < today)
    .sort((a, b) => (a.key > b.key ? -1 : a.key < b.key ? 1 : 0))
    .map(({ event }) => event)
}

// ─── The time, when there IS one ──────────────────────────────────────
//
// ⚠️ `events.event_time` is a `time` column and is NULL on every row in
// the live table. So this returns '' far more often than not, and the
// caller must render nothing at all rather than a label with a blank
// after it -- "Time:" followed by white space reads as a value that
// failed to load.
//
// PostgREST hands a `time` back as `HH:MM:SS`, which `formatTime` does
// not recognise (its pattern allows one optional `:MM` group, not two).
// Trimming the seconds first is the whole job; the 12-hour rendering
// stays in `clinicHours`, so the clinic, the officials' consultation
// hours and an event all print a time the same way.
//
// ⚠️ It does NOT dig a time out of `location`. Three legacy rows store
// one there -- "2:00 PM - Main Covered Court" -- and splitting that
// string would be guessing at a format nothing guarantees, on a column
// whose job is the place. Those rows show the time as part of their
// location, exactly as somebody typed it.
export const eventTimeLabel = (value) => {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  const trimmed = text.replace(/^(\d{1,2}:\d{2}):\d{2}(\.\d+)?$/, '$1')

  // ⚠️ `formatTime` returns its input UNTOUCHED when it cannot parse
  // it, which is right for the clinic's hand-typed display strings and
  // wrong here: it would print "2:00 PM - Main Covered Court" as though
  // it were a time. `toMinutes` is the parse check and it is the SAME
  // authority `formatTime` uses internally, so the two cannot disagree
  // about what counts as a time.
  if (toMinutes(trimmed) === null) return ''
  return formatTime(trimmed)
}
