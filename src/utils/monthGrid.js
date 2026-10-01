// Date-only arithmetic, and the month grid every calendar in this app
// is drawn from.
//
// ─── WHY THIS EXISTS ──────────────────────────────────────────────────
//
// Four surfaces need a month grid: the Official court schedule, the
// public Events page, the Official Events tab and the Nurse's Health
// Events tab. The public court-reservation calendar already had one,
// written inline. Four more copies would be four places for the same
// off-by-one to appear, so the grid and the date arithmetic live here
// and `MonthCalendar.jsx` draws them.
//
// ⚠️ NOTHING HERE CONSTRUCTS A Date FROM A 'YYYY-MM-DD' STRING.
//
// That is the whole point. `new Date('2026-10-01')` is parsed as
// **UTC midnight** by specification, and every subsequent `getDate()`,
// `getMonth()` or `toLocaleDateString()` reads it back in the browser's
// zone -- so west of UTC the date silently becomes the previous day.
// Verified: the same instant renders "Sep 30" in New York and "Oct 1"
// in Manila.
//
// This already bit the project twice. `event_month`/`event_day` are
// written with exactly that pattern, and the Official and Nurse event
// filters compared against `new Date().toISOString().slice(0, 10)` --
// the UTC date -- so for the first eight hours of every Philippine day
// an event dated today was filed under "past". X1 fixed the filters by
// routing them through `manilaToday()`.
//
// So a stored date is treated as **three integers and a label**, never
// as an instant. `parseDateKey` splits the string; `dateKey` reassembles
// it; comparisons are string comparisons, which sort correctly for
// zero-padded ISO dates. The only place a real `Date` appears is
// `daysInMonth` and the weekday of the 1st, both built from explicit
// (year, month, day) numbers in local time, where no parsing is
// involved and the day-of-month cannot shift.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Full names for the accessible labels. "Mo" is fine to look at and
// useless to listen to.
export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

const pad2 = (n) => String(n).padStart(2, '0')

// ── A date as a key ──────────────────────────────────────────────
//
// `month` is 0-based throughout this module, matching JavaScript's own
// convention, and is converted on the way into the string.
export const dateKey = (year, month, day) =>
  `${year}-${pad2(month + 1)}-${pad2(day)}`

// 'YYYY-MM-DD' -> { year, month, day } with a 0-based month, or null.
//
// Accepts a timestamp too, by taking the date part only: a value stored
// as `timestamptz` and one stored as `date` should land on the same day
// in a calendar.
export const parseDateKey = (value) => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  // Reject a day the month does not have -- '2026-02-30' is not a date,
  // and silently sliding it to March 2nd is how bad data hides.
  if (day > daysInMonth(year, month)) return null
  return { year, month, day }
}

// Normalises anything date-like to a plain 'YYYY-MM-DD', or ''.
export const toDateKey = (value) => {
  const parsed = parseDateKey(value)
  return parsed ? dateKey(parsed.year, parsed.month, parsed.day) : ''
}

// Which month a date key belongs to, for opening a calendar on it.
// Falls back to the runtime's current month when the key is unusable --
// a calendar has to open on something, and the local month is a better
// guess than January 1970.
export const monthOf = (dateKeyValue) => {
  const parsed = parseDateKey(dateKeyValue)
  if (parsed) return { year: parsed.year, month: parsed.month }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export const isLeapYear = (year) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

export const daysInMonth = (year, month) => {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month]
}

// ── Moving between months ────────────────────────────────────────
//
// Returns a new { year, month }. Handles a delta of any size, so
// "back twelve months" is one call rather than a loop that has to get
// the December/January wrap right twelve times.
export const shiftMonth = (year, month, delta) => {
  const absolute = year * 12 + month + delta
  return {
    year: Math.floor(absolute / 12),
    // JavaScript's % keeps the sign of the dividend, so a negative
    // absolute month would give a negative index.
    month: ((absolute % 12) + 12) % 12,
  }
}

// ── The grid ─────────────────────────────────────────────────────
//
// Leading blanks for the weekday the 1st falls on, then one cell per
// day. Trailing blanks are NOT padded: the public court calendar has
// always rendered a short final row and CSS grid handles it, so adding
// them now would change a layout nobody asked to change.
//
// A blank is `null`, which is what the existing calendar's map already
// expects, and each day cell carries its own `dateKey` so a caller
// never has to rebuild one.
export const buildMonthGrid = (year, month, { today = '' } = {}) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return []
  }
  // Built from numbers, not from a parsed string: `new Date(y, m, 1)` is
  // local time by construction, so the weekday cannot shift.
  const firstWeekday = new Date(year, month, 1).getDay()
  const total = daysInMonth(year, month)

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= total; day++) {
    const key = dateKey(year, month, day)
    cells.push({
      key,
      day,
      year,
      month,
      weekday: (firstWeekday + day - 1) % 7,
      isToday: today !== '' && key === today,
      // String comparison, which is correct for zero-padded ISO dates
      // and needs no Date at all.
      isPast: today !== '' && key < today,
    })
  }
  return cells
}

// ── Grouping records by their date ───────────────────────────────
//
// Shared by the event calendars and the court calendar's row lookup.
// `getDate` pulls the stored date off a row; rows whose date is absent
// or malformed are skipped rather than bucketed under a guessed day --
// a record with no usable date must not appear on an arbitrary one.
export const groupByDateKey = (rows, getDate) => {
  const map = new Map()
  if (!Array.isArray(rows)) return map
  rows.forEach((row) => {
    const key = toDateKey(getDate(row))
    if (!key) return
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  })
  return map
}
