// Analytics periods, as Asia/Manila calendar dates. Pure: no Supabase import.
//
// Every period resolves to an inclusive pair of date keys ('YYYY-MM-DD'), or
// to no bounds at all for "All available records". The same pair is sent to
// every source (incident_queue, incident_counts_by_type and, when installed,
// barangay_safety_analytics / repeated_dispute_analytics as a custom range), so
// every section on the page counts the same days. All three read a date as
// (occurred_at AT TIME ZONE 'Asia/Manila')::date, inclusive at both ends.
//
// Dates are handled as integers through Date.UTC and never parsed from a
// string, so the browser's own timezone cannot move a day.
import { daysInMonth, parseDateKey } from '../utils/monthGrid'
import { manilaToday } from '../utils/displayLabels'

// monthGrid works with 0-BASED months; this module uses calendar months (1-12).
const parts = (key) => { const p = parseDateKey(key); return p ? { year: p.year, month: p.month + 1, day: p.day } : null }

export const PERIODS = Object.freeze([
  ['this_week', 'This week'],
  ['this_month', 'This month'],
  ['this_year', 'This year'],
  ['last_30_days', 'Last 30 days'],
  ['last_90_days', 'Last 90 days'],
  ['last_12_months', 'Last 12 months'],
  ['previous_12_months', 'Previous 12 months'],
  ['custom', 'Custom range'],
  ['all', 'All available records'],
])
export const PERIOD_KEYS = Object.freeze(PERIODS.map(([key]) => key))
export const periodLabel = (key) => (PERIODS.find(([k]) => k === key) || ['', ''])[1]

const pad = (n) => String(n).padStart(2, '0')
const fromParts = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const toUtc = (key) => { const p = parts(key); return p ? Date.UTC(p.year, p.month - 1, p.day) : NaN }
const fromUtc = (ms) => { const d = new Date(ms); return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) }

export const addDays = (key, days) => fromUtc(toUtc(key) + days * 86400000)
export const daysBetween = (fromKey, toKey) => Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000)
// ISO weekday, Monday = 1 ... Sunday = 7.
export const isoWeekday = (key) => { const d = new Date(toUtc(key)).getUTCDay(); return d === 0 ? 7 : d }
export const mondayOf = (key) => addDays(key, 1 - isoWeekday(key))

// Calendar months back, with the day clamped to the target month's length --
// what PostgreSQL's `date - interval 'N months'` does (29 Feb 2024 - 12 months
// is 28 Feb 2023), so this matches 062's own preset boundaries.
export const minusMonths = (key, months) => {
  const p = parts(key)
  const index = p.year * 12 + (p.month - 1) - months
  const year = Math.floor(index / 12), month = (index % 12) + 1
  return fromParts(year, month, Math.min(p.day, daysInMonth(year, month - 1)))
}

// { from, to } date keys (either may be '' for an open end), or both '' for all.
export const periodRange = (period, today = manilaToday(), custom = {}) => {
  const t = parts(today)
  switch (period) {
    case 'this_week': return { from: mondayOf(today), to: today }
    case 'this_month': return { from: fromParts(t.year, t.month, 1), to: today }
    case 'this_year': return { from: fromParts(t.year, 1, 1), to: today }
    case 'last_30_days': return { from: addDays(today, -29), to: today }
    case 'last_90_days': return { from: addDays(today, -89), to: today }
    case 'last_12_months': return { from: minusMonths(today, 12), to: today }
    case 'previous_12_months': return { from: minusMonths(today, 24), to: addDays(minusMonths(today, 12), -1) }
    case 'custom': return { from: custom.from || '', to: custom.to || '' }
    default: return { from: '', to: '' }
  }
}

// Time-series grouping. Daily for up to 31 days, Monday-start weeks for up to
// 92 days, calendar months beyond. Grouping is computed from each record's own
// Manila date, so a daily or weekly series is exact, never split out of a
// monthly total.
export const granularityFor = (from, to) => {
  if (!from || !to) return 'month'
  const span = daysBetween(from, to) + 1
  if (span <= 31) return 'day'
  if (span <= 92) return 'week'
  return 'month'
}
export const GRANULARITY_LABELS = Object.freeze({ day: 'Daily counts', week: 'Weekly counts (weeks start Monday)', month: 'Monthly counts' })

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dayLabel = (key) => { const p = parts(key); return p ? `${MONTH_SHORT[p.month - 1]} ${p.day}` : key }
export const monthLabel = (monthKey) => { const [y, m] = monthKey.split('-').map(Number); return `${MONTH_SHORT[m - 1]} ${y}` }

// Every bucket key between two date keys, inclusive.
export const bucketKeys = (from, to, granularity) => {
  const keys = []
  if (!from || !to || from > to) return keys
  if (granularity === 'day') { for (let k = from; k <= to; k = addDays(k, 1)) keys.push(k) }
  else if (granularity === 'week') { for (let k = mondayOf(from); k <= to; k = addDays(k, 7)) keys.push(k) }
  else {
    let [y, m] = from.split('-').map(Number)
    const end = to.slice(0, 7)
    for (let k = `${y}-${pad(m)}`; k <= end; k = `${y}-${pad(m)}`) { keys.push(k); m += 1; if (m > 12) { m = 1; y += 1 } }
  }
  return keys
}
export const bucketOf = (dateKey, granularity) => (
  granularity === 'day' ? dateKey : granularity === 'week' ? mondayOf(dateKey) : dateKey.slice(0, 7)
)
export const bucketLabel = (key, granularity, rangeTo = '') => {
  if (granularity === 'month') return monthLabel(key)
  if (granularity === 'day') return dayLabel(key)
  const end = addDays(key, 6)
  return `${dayLabel(key)}–${dayLabel(rangeTo && end > rangeTo ? rangeTo : end)}`
}
