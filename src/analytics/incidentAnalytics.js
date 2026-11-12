// Incident analytics computed from incident RECORDS. Pure: no Supabase import.
//
// The records come from incident_queue() (044): one row per incident, every
// incident in the date range, no narrative and no person. Each statistic here
// is a count of those rows, so every chart, total and drill-down list on the
// page is computed from the same set and they cannot disagree.
//
// COUNTING DEFINITIONS
//   incident record   one row of incident_queue; counted once whatever its
//                     parties, Tanod or blotter entry.
//   category count    incident records per incident_type.
//   status count      incident records per current status.
//   area              the 062 rule: the area note when it is not blank, else
//                     the location text, else "Not recorded"; trimmed and
//                     otherwise EXACT. Two spellings stay two areas.
//   weekday / time    the incident's own Asia/Manila calendar day and hour;
//                     weeks start Monday; time is 062's six 4-hour bands.
// Nothing here links an incident to a person, and nothing adds complaint
// counts to incident counts.
import { INCIDENT_STATUS_KEYS, INCIDENT_TYPE_KEYS, incidentStatusLabel, incidentTypeLabel } from '../incidents/incidentLabels'
import { incidentDay } from '../safetymap/officialIncidentAnalytics'
import { bucketKeys, bucketLabel, bucketOf, granularityFor, isoWeekday } from './analyticsPeriods'

export const NOT_RECORDED = 'Not recorded'
export const areaOf = (row) => {
  const note = String(row?.area_note ?? '').trim()
  if (note) return note
  const text = String(row?.location_text ?? '').trim()
  return text || NOT_RECORDED
}

export const WEEKDAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
// The bands barangay_safety_analytics (062) groups by: hour / 4.
export const TIME_BANDS = Object.freeze(['12 AM–3:59 AM', '4 AM–7:59 AM', '8 AM–11:59 AM', '12 PM–3:59 PM', '4 PM–7:59 PM', '8 PM–11:59 PM'])

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' })
export const manilaHour = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return Number(hourFormat.format(new Date(value)))
}

// Category and area narrowing, applied to records the date range already chose.
// An empty filter means "all". The area comparison is exact, as in 062.
export const filterRecords = (rows, { category = '', area = '' } = {}) => (rows || []).filter((row) =>
  (!category || row.incident_type === category) && (!area || areaOf(row) === area))

const tally = (rows, keyOf) => {
  const counts = new Map()
  rows.forEach((row) => { const key = keyOf(row); counts.set(key, (counts.get(key) || 0) + 1) })
  return counts
}
// Known keys first in their defined order (zeros included), then any value the
// vocabulary does not know, exactly as stored -- never dropped from a total.
const ordered = (counts, knownKeys, label) => {
  const rows = knownKeys.map((key) => ({ key, label: label(key), total: counts.get(key) || 0 }))
  ;[...counts.keys()].filter((key) => !knownKeys.includes(key)).sort()
    .forEach((key) => rows.push({ key, label: label(key) || String(key), total: counts.get(key) }))
  return rows
}

export const incidentSummary = (rows, { from = '', to = '' } = {}) => {
  const records = rows || []
  const days = records.map((row) => incidentDay(row.occurred_at))
  const dated = days.filter(Boolean).sort()
  // "All records" has no bounds: the series runs over the data actually present.
  const start = from || dated[0] || '', end = to || dated[dated.length - 1] || ''
  const granularity = granularityFor(start, end)
  const series = tally(dated.map((day) => ({ day })), ({ day }) => bucketOf(day, granularity))
  const areas = tally(records, areaOf)
  return {
    total: records.length,
    granularity,
    series: bucketKeys(start, end, granularity).map((key) => ({ key, label: bucketLabel(key, granularity, end), total: series.get(key) || 0 })),
    categories: ordered(tally(records, (r) => r.incident_type), INCIDENT_TYPE_KEYS, incidentTypeLabel),
    statuses: ordered(tally(records, (r) => r.status), INCIDENT_STATUS_KEYS, incidentStatusLabel),
    weekdays: WEEKDAYS.map((label, i) => ({ key: String(i + 1), label, total: days.filter((d) => d && isoWeekday(d) === i + 1).length })),
    timeBands: TIME_BANDS.map((label, i) => ({ key: String(i), label, total: records.filter((r) => { const h = manilaHour(r.occurred_at); return h !== null && Math.floor(h / 4) === i }).length })),
    areas: [...areas].map(([key, total]) => ({ key, label: key, total })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    undated: records.length - dated.length,
  }
}

// The area choices for the period and category: every area actually recorded,
// so the filter cannot be typed into something no record holds.
export const areaOptions = (rows, category = '') => [...new Set(filterRecords(rows, { category }).map(areaOf))]
  .sort((a, b) => (a === NOT_RECORDED) - (b === NOT_RECORDED) || a.localeCompare(b))

// The queue is complete only when it returned as many records as the database
// counted for the same days and category (incident_counts_by_type, 044). A
// shorter list -- PostgREST caps the rows one request returns -- must not be
// charted as if it were everything.
export const completeness = (rows, typeCounts, category = '') => {
  if (!Array.isArray(typeCounts)) return { known: false, complete: true, expected: null, received: (rows || []).length }
  const expected = typeCounts.filter((row) => !category || row.incident_type === category)
    .reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const received = (rows || []).length
  return { known: true, complete: received === expected, expected, received }
}

// One sentence a screen reader (or anybody) can read instead of the picture.
export const seriesSummary = (series, unit = 'incident') => {
  const total = series.reduce((sum, row) => sum + row.total, 0)
  if (!series.length) return 'No dates in this period.'
  const plural = (n) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (!total) return `No ${unit}s recorded from ${series[0].label} to ${series[series.length - 1].label}.`
  const peak = series.reduce((best, row) => (row.total > best.total ? row : best), series[0])
  return `${plural(total)} from ${series[0].label} to ${series[series.length - 1].label}. Highest: ${peak.label}, ${plural(peak.total)}.`
}
