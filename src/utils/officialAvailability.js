// An elected official's weekly consultation hours, as they are READ.
//
// Pure, for the reason the rest of `utils/` is: both the public
// Officials page and the Official Dashboard import the Supabase client.
//
// ─── IT DEFINES NO STATUS WORD OF ITS OWN ─────────────────────────────
//
// The words come from `AVAILABILITY_STATUS_LABELS` in
// `displayLabels.js`, the map the nurse's schedule already reads, so an
// official and a resident cannot be shown different words for one
// stored value. `officialAvailability.test.js` asserts no second
// vocabulary grows back here, the same guard notificationLabels and
// reservationTracking carry.
//
// ─── ⚠️ ONE ROW PER OFFICIAL PER DAY, GUARANTEED BY THE DATABASE ──────
//
// `official_availability_one_row_per_day` (migration 026) is a UNIQUE
// constraint, which is deliberately the OPPOSITE of
// `nurse_availability` -- and the reason that table has two Friday rows
// and the Health Center page listed Friday twice. A consultation slot
// is one block; a clinic day may legitimately be split. So this module
// can assume one row per day, and `buildOfficialWeek` still keeps the
// LAST row rather than throwing if that assumption is ever broken by a
// direct database edit, because a page that renders is better than a
// page that does not.

import { AVAILABILITY_STATUS_LABELS } from './displayLabels'
import { DAY_ORDER } from './clinicSchedule'
import { formatTime } from './clinicHours'

export { DAY_ORDER }

// What a form may offer. ⚠️ A SUBSET of the shared map, and it must
// stay inside migration 026's CHECK constraint -- a word offered here
// that the database refuses produces a bare 23514 rather than a
// sentence. A test walks both.
export const OFFICIAL_AVAILABILITY_STATUSES = [
  'available',
  'by-appointment',
  'on-leave',
  'unavailable',
]

export const availabilityLabel = (status) =>
  AVAILABILITY_STATUS_LABELS[status]?.label ?? (status ?? '')

export const availabilityClass = (status) =>
  AVAILABILITY_STATUS_LABELS[status]?.className ?? 'badge-claimed'

// The hours as a reader sees them, or null when the status does not
// have any. ⚠️ Only `available` carries hours -- migration 026's
// `official_availability_hours_present` CHECK refuses an `available`
// row without them, and nothing else is required to have them.
export const hoursLabel = (row) => {
  if (!row || row.status !== 'available') return null
  if (!row.time_start || !row.time_end) return null
  return `${formatTime(row.time_start)} – ${formatTime(row.time_end)}`
}

// Seven entries in weekday order for one official, each marked with
// whether anything is recorded for it.
//
// ⚠️ A day with no row is PRESENT and marked, never omitted: a day
// missing from a list cannot be told apart from a page that failed to
// load.
export const buildOfficialWeek = (rows = []) => {
  const byDay = new Map()
  ;(rows || []).forEach((row) => {
    if (!row || !DAY_ORDER.includes(row.day_of_week)) return
    byDay.set(row.day_of_week, row)
  })

  return DAY_ORDER.map((day) => {
    const row = byDay.get(day) || null
    return {
      day,
      row,
      hasEntry: Boolean(row),
      status: row?.status ?? null,
      label: row ? availabilityLabel(row.status) : null,
      className: row ? availabilityClass(row.status) : null,
      hours: hoursLabel(row),
      note: row?.note || null,
    }
  })
}

// Group every official's rows by `official_id`, so one query over the
// whole table feeds a directory of cards.
//
// ⚠️ ONE QUERY, not one per official. A page with eleven officials
// would otherwise make eleven requests through the shared Supabase
// client -- which is the shape of the `getSession()` lock problem
// CLAUDE.md records as having hung public pages that had nothing to do
// with auth.
export const groupByOfficial = (rows = []) => {
  const map = new Map()
  ;(rows || []).forEach((row) => {
    if (!row?.official_id) return
    if (!map.has(row.official_id)) map.set(row.official_id, [])
    map.get(row.official_id).push(row)
  })
  return map
}

// The compact line a directory card shows: what is true TODAY.
//
// ⚠️ "Today" is the Manila weekday, passed in by the caller rather than
// read here, so this stays pure and so the page uses the one
// `manilaWeekday()` everything else uses. Never the browser's day: a
// resident whose phone is set to another timezone must still be told
// whether their Kagawad is in today.
export const todayLine = (rows, today) => {
  const week = buildOfficialWeek(rows)
  const entry = week.find((e) => e.day === today)

  // Nothing recorded for this official at all -- say so plainly rather
  // than implying they are unavailable. An absent schedule is not a
  // closed door; it means nobody has published one.
  if (!week.some((e) => e.hasEntry)) {
    return { kind: 'none', text: 'No consultation hours published yet.' }
  }

  if (!entry || !entry.hasEntry) {
    return { kind: 'closed', text: 'No consultation hours today.' }
  }

  return {
    kind: 'entry',
    status: entry.status,
    label: entry.label,
    className: entry.className,
    hours: entry.hours,
    note: entry.note,
    text: entry.hours ? `${entry.label} · ${entry.hours}` : entry.label,
  }
}
