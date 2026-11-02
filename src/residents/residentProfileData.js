// What the Resident Profile shows, computed from what the database already
// returned. Pure: no Supabase import, so every rule here is unit-tested.
//
// ⚠️ NOTHING HERE WIDENS ACCESS, AND NOTHING HERE IS A SECURITY CONTROL.
// person_history() and person_analytics() (migrations 061/062) return linked
// COMPLAINT categories and party roles to every active official, while the
// Complaints module shows complaint detail only to the Barangay Secretary and
// the Punong Barangay. The profile therefore leaves complaint material out of
// what it RENDERS for anybody else -- so it never shows more than the
// Complaints module does -- but the RPC still returns it. The real fix is a
// database change (an additive migration), recorded in the PR, not this file.

import { MONTH_NAMES } from '../utils/monthGrid'
import { manilaToday } from '../utils/displayLabels'

// ── Manila calendar parts of a timestamp ─────────────────────────────────
// Recorded times are timestamptz; the barangay's day, weekday and hour are
// Manila's, whatever the browser's zone.
const MANILA_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', hourCycle: 'h23',
})
const WEEKDAY_NUMBER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
export const WEEKDAY_NAMES = Object.freeze(['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])

export const manilaParts = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  const parts = Object.fromEntries(MANILA_PARTS.formatToParts(new Date(value)).map((p) => [p.type, p.value]))
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_NUMBER[parts.weekday],
    hour: Number(parts.hour) % 24,
  }
}

// The six four-hour periods person_analytics() already uses (migration 062),
// with its own labels, so the profile and the database speak one vocabulary.
export const TIME_PERIODS = Object.freeze([
  '12 AM–3:59 AM', '4 AM–7:59 AM', '8 AM–11:59 AM', '12 PM–3:59 PM', '4 PM–7:59 PM', '8 PM–11:59 PM',
])
export const timePeriodOf = (hour) => Math.floor(hour / 4)

// ── Date presets, Asia/Manila ────────────────────────────────────────────
export const PERIOD_PRESETS = Object.freeze([
  ['all', 'All linked records'],
  ['this_week', 'This week'],
  ['this_month', 'This month'],
  ['this_year', 'This year'],
  ['custom', 'Custom range'],
])

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
// A Date built from explicit numbers, never parsed from a string.
const shiftDays = (dateKey, days) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

// Inclusive { from, to } date keys, or null for "all". Weeks run Monday to
// Sunday (ISO). A custom range uses whichever ends were given.
export const periodRange = (preset, { today = manilaToday(), from = '', to = '' } = {}) => {
  const [y, m, d] = today.split('-').map(Number)
  if (preset === 'this_week') {
    const iso = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) // Monday 0
    return { from: shiftDays(today, -iso), to: shiftDays(today, 6 - iso) }
  }
  if (preset === 'this_month') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { from: keyOf(y, m, 1), to: keyOf(y, m, last) }
  }
  if (preset === 'this_year') return { from: keyOf(y, 1, 1), to: keyOf(y, 12, 31) }
  if (preset === 'custom') return { from: from || '', to: to || '' }
  return null
}

export const customPeriodProblem = (preset, from, to) => {
  if (preset !== 'custom') return ''
  if (!from && !to) return 'Choose a start date, an end date, or both to apply a custom range.'
  if (from && to && from > to) return 'The start date must be on or before the end date.'
  return ''
}

const inRange = (day, range) => !range || (Boolean(day) && (!range.from || day >= range.from) && (!range.to || day <= range.to))

// ── Summary cards (from person_history, migration 061) ───────────────────
// person_history returns one incident row per PARTY row, so a resident listed
// as both victim and witness on one incident appears twice. Records are counted
// once per incident id. Incident and complaint counts are NEVER added together:
// a complaint and the incident behind its KP case would be one matter counted
// twice, and no verified de-duplication exists for that yet.
export const RESOLVED_INCIDENT_STATUSES = Object.freeze(['resolved', 'closed'])

export const uniqueIncidents = (history) => {
  const seen = new Map()
  for (const row of history?.incidents || []) {
    const key = row.incident_id ?? row.matter_id
    const existing = seen.get(key)
    if (!existing) seen.set(key, { ...row, roles: row.role ? [row.role] : [] })
    else if (row.role && !existing.roles.includes(row.role)) existing.roles.push(row.role)
  }
  return [...seen.values()]
}

export const profileSummary = (history, { canViewComplaints = false } = {}) => {
  const incidents = uniqueIncidents(history)
  return {
    incidents: incidents.length,
    resolvedIncidents: incidents.filter((row) => RESOLVED_INCIDENT_STATUSES.includes(row.status)).length,
    // null means "not shown to this account", which the card omits -- never 0.
    complaints: canViewComplaints ? (history?.complaints || []).length : null,
  }
}

export const visibleTimeline = (history, { canViewComplaints = false } = {}) =>
  (history?.timeline || []).filter((entry) => canViewComplaints || entry.kind !== 'complaint')

// ── Descriptive analytics (from person_analytics, migration 062) ──────────
// contributing_matters for window 'all' is every verified linked matter for the
// person, so filtering it by date here is filtering a complete list, not an
// extrapolation. Each matter counts once however many roles the person held.
const countBy = (rows, keyOf_) => {
  const counts = new Map()
  for (const row of rows) {
    const key = keyOf_(row)
    if (key == null || key === '') continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts].map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)))
}

const distinctMatters = (rows) => {
  const byKey = new Map()
  for (const row of rows) {
    const existing = byKey.get(row.matter_key)
    if (!existing) byKey.set(row.matter_key, { ...row, outcomes: new Set([row.outcome]), roles: new Set([row.role]) })
    else { existing.outcomes.add(row.outcome); existing.roles.add(row.role) }
  }
  return [...byKey.values()]
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const countWord = (n) => NUMBER_WORDS[n] || String(n)

export const residentAnalytics = (data, { canViewComplaints = false, range = null } = {}) => {
  const all = distinctMatters((data?.contributing_matters || [])
    .filter((row) => row && row.matter_key && (row.kind === 'incident' || (canViewComplaints && row.kind === 'complaint'))))
    .map((row) => ({ ...row, parts: manilaParts(row.occurred_at) }))
  const rows = all.filter((row) => inRange(row.parts?.day, range))
  const incidents = rows.filter((row) => row.kind === 'incident')
  const complaints = rows.filter((row) => row.kind === 'complaint')
  const timed = incidents.filter((row) => row.parts)

  const outcomeRows = []
  for (const row of incidents) for (const outcome of row.outcomes) outcomeRows.push({ outcome })

  const combos = countBy(timed, (row) => `${row.parts.weekday}|${timePeriodOf(row.parts.hour)}`)
  let pattern = ''
  if (combos.length && combos[0].total >= 2 && (combos.length === 1 || combos[1].total < combos[0].total)) {
    const [weekday, period] = combos[0].key.split('|').map(Number)
    const n = combos[0].total
    pattern = `${countWord(n)} linked incidents were recorded on ${WEEKDAY_NAMES[weekday]}s between ${TIME_PERIODS[period].replace('–', ' and ')} during the selected period.`
  }

  const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${y}` }
  return {
    linkedMatters: all.length,
    incidentCount: incidents.length,
    complaintCount: canViewComplaints ? complaints.length : null,
    incidentCategories: countBy(incidents, (row) => row.category),
    complaintCategories: canViewComplaints ? countBy(complaints, (row) => row.category) : null,
    outcomes: countBy(outcomeRows, (row) => row.outcome),
    weekdays: countBy(timed, (row) => row.parts.weekday).sort((a, b) => a.key - b.key)
      .map(({ key, total }) => ({ key: WEEKDAY_NAMES[key], total })),
    timePeriods: countBy(timed, (row) => timePeriodOf(row.parts.hour)).sort((a, b) => a.key - b.key)
      .map(({ key, total }) => ({ key: TIME_PERIODS[key], total })),
    monthly: countBy(timed, (row) => row.parts.day.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key))
      .map(({ key, total }) => ({ key: monthLabel(key), total })),
    incidentLocations: countBy(incidents, (row) => row.area),
    complaintLocations: canViewComplaints ? countBy(complaints, (row) => row.area) : null,
    pattern,
    rows,
  }
}

// person_analytics is created by migration 062, which is not yet applied in
// production. PostgREST answers a missing function with PGRST202 (or the
// database with 42883); that reads as "not installed", not as an outage.
export const analyticsUnavailableReason = (error) => {
  if (!error) return 'failed'
  if (error.code === 'PGRST202' || error.code === '42883') return 'not_installed'
  if (error.code === '42501') return 'not_permitted'
  return 'failed'
}
