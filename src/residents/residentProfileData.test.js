import fs from 'fs'
import path from 'path'
import {
  TIME_PERIODS, analyticsUnavailableReason, customPeriodProblem, manilaParts, periodRange,
  profileSummary, residentAnalytics, uniqueIncidents, visibleTimeline,
} from './residentProfileData'

// Fridays in October 2026, 9:30 PM in Manila (13:30 UTC).
const friday = (day) => `2026-10-${day}T13:30:00Z`
const incident = (key, at, extra = {}) => ({ matter_key: `incident:${key}`, kind: 'incident', reference: `INC-${key}`, occurred_at: at, category: 'disturbance', area: 'Purok 2', role: 'respondent', outcome: 'not_determined', ...extra })
const complaint = (key, at, extra = {}) => ({ matter_key: `complaint:${key}`, kind: 'complaint', reference: `CMP-${key}`, occurred_at: at, category: 'noise', area: 'Restricted', role: 'respondent', outcome: 'unknown', ...extra })

describe('Manila calendar', () => {
  test('a UTC timestamp lands on the Manila day, weekday and hour', () => {
    expect(manilaParts('2026-10-29T16:30:00Z')).toEqual({ day: '2026-10-30', weekday: 5, hour: 0 })
    expect(manilaParts(friday('02'))).toEqual({ day: '2026-10-02', weekday: 5, hour: 21 })
    expect(manilaParts('not a date')).toBeNull()
    expect(manilaParts(null)).toBeNull()
  })

  test('presets: ISO week (Monday to Sunday), month, year', () => {
    expect(periodRange('this_week', { today: '2026-11-02' })).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(periodRange('this_week', { today: '2026-11-08' })).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(periodRange('this_week', { today: '2027-01-01' })).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(periodRange('this_month', { today: '2024-02-10' })).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(periodRange('this_month', { today: '2026-02-10' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('this_year', { today: '2026-11-02' })).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodRange('custom', { today: '2026-11-02', from: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '' })
    expect(periodRange('all', { today: '2026-11-02' })).toBeNull()
  })

  test('a custom range needs a date, and an end on or after its start', () => {
    expect(customPeriodProblem('custom', '', '')).toMatch(/Choose a start date/)
    expect(customPeriodProblem('custom', '2026-10-05', '2026-10-01')).toMatch(/on or before/)
    expect(customPeriodProblem('custom', '2026-10-01', '')).toBe('')
    expect(customPeriodProblem('this_week', '', '')).toBe('')
  })

  test('the module builds no Date from a date string', () => {
    const source = fs.readFileSync(path.join(__dirname, 'residentProfileData.js'), 'utf8').replace(/\/\/.*$/gm, '')
    expect(source).not.toMatch(/new Date\((?!Date\.UTC|value\))/)
  })
})

describe('summary cards', () => {
  const history = {
    incidents: [
      { incident_id: 'i1', reference: 'INC-1', status: 'resolved', role: 'victim' },
      { incident_id: 'i1', reference: 'INC-1', status: 'resolved', role: 'witness' },
      { incident_id: 'i2', reference: 'INC-2', status: 'closed', role: 'respondent' },
      { incident_id: 'i3', reference: 'INC-3', status: 'recorded', role: 'witness' },
    ],
    complaints: [{ complaint_id: 'c1' }, { complaint_id: 'c2' }],
    timeline: [{ kind: 'incident' }, { kind: 'complaint' }],
  }

  test('an incident with two roles is one record, and its roles are kept', () => {
    const rows = uniqueIncidents(history)
    expect(rows).toHaveLength(3)
    expect(rows[0].roles).toEqual(['victim', 'witness'])
  })

  test('incident, resolved and complaint counts are separate, never summed', () => {
    expect(profileSummary(history, { canViewComplaints: true })).toEqual({ incidents: 3, resolvedIncidents: 2, complaints: 2 })
  })

  test('complaint counts are withheld (null, not 0) from accounts that cannot see complaints', () => {
    expect(profileSummary(history).complaints).toBeNull()
    expect(visibleTimeline(history)).toEqual([{ kind: 'incident' }])
    expect(visibleTimeline(history, { canViewComplaints: true })).toHaveLength(2)
  })

  test('an empty history is a real zero', () => {
    expect(profileSummary({ incidents: [], complaints: [], timeline: [] }, { canViewComplaints: true })).toEqual({ incidents: 0, resolvedIncidents: 0, complaints: 0 })
  })
})

describe('descriptive analytics', () => {
  const data = { contributing_matters: [
    incident('a', friday('02')), incident('b', friday('09')), incident('c', friday('16')),
    incident('d', friday('23')), incident('e', friday('30')),
    // one incident with two roles: still one matter, both outcomes recorded
    incident('f', '2026-10-05T02:00:00Z', { category: 'threat', role: 'victim', outcome: 'not_determined' }),
    incident('f', '2026-10-05T02:00:00Z', { category: 'threat', role: 'witness', outcome: 'substantiated' }),
    complaint('x', '2026-10-20T03:00:00Z'),
  ] }

  test('five Friday-evening incidents read as a factual sentence', () => {
    const result = residentAnalytics(data)
    expect(result.incidentCount).toBe(6)
    expect(result.pattern).toBe('Five linked incidents were recorded on Fridays between 8 PM and 11:59 PM during the selected period.')
  })

  test('the sentence never rates a person', () => {
    const result = residentAnalytics(data, { canViewComplaints: true })
    expect(result.pattern).not.toMatch(/danger|risk|habitual|offender|punish|recommend|likely|predict/i)
  })

  test('a single incident, or a tie, makes no pattern sentence', () => {
    expect(residentAnalytics({ contributing_matters: [incident('a', friday('02'))] }).pattern).toBe('')
    expect(residentAnalytics({ contributing_matters: [incident('a', friday('02')), incident('b', friday('09')), incident('c', '2026-10-05T02:00:00Z'), incident('d', '2026-10-12T02:00:00Z')] }).pattern).toBe('')
  })

  test('complaints are left out entirely for an account that cannot see them', () => {
    const result = residentAnalytics(data)
    expect(result.complaintCount).toBeNull()
    expect(result.complaintCategories).toBeNull()
    expect(result.complaintLocations).toBeNull()
    expect(result.rows.some((row) => row.kind === 'complaint')).toBe(false)
    expect(result.incidentCategories.map((r) => r.key)).not.toContain('noise')
  })

  test('records staff see complaint counts kept apart from incident counts', () => {
    const result = residentAnalytics(data, { canViewComplaints: true })
    expect(result.complaintCount).toBe(1)
    expect(result.incidentCount).toBe(6)
    expect(result.complaintCategories).toEqual([{ key: 'noise', total: 1 }])
    // weekday, time and month patterns are INCIDENT occurrences only, never a complaint's filing time
    expect(result.weekdays.reduce((n, r) => n + r.total, 0)).toBe(6)
  })

  test('a matter counts once per outcome, however many roles the person held', () => {
    const result = residentAnalytics(data)
    expect(result.outcomes).toEqual([{ key: 'not_determined', total: 6 }, { key: 'substantiated', total: 1 }])
    expect(result.incidentCategories).toEqual([{ key: 'disturbance', total: 5 }, { key: 'threat', total: 1 }])
  })

  test('weekday, time of day and month use Manila time and 062 vocabulary', () => {
    const result = residentAnalytics(data)
    expect(result.weekdays).toEqual([{ key: 'Monday', total: 1 }, { key: 'Friday', total: 5 }])
    expect(result.timePeriods).toEqual([{ key: TIME_PERIODS[2], total: 1 }, { key: TIME_PERIODS[5], total: 5 }])
    expect(result.monthly).toEqual([{ key: 'October 2026', total: 6 }])
  })

  test('a date range filters a complete list; it does not invent records', () => {
    const week = residentAnalytics(data, { range: { from: '2026-10-26', to: '2026-11-01' } })
    expect(week.incidentCount).toBe(1)
    expect(week.linkedMatters).toBe(6)
    const empty = residentAnalytics(data, { range: { from: '2027-01-01', to: '2027-01-31' } })
    expect(empty.incidentCount).toBe(0)
    expect(empty.incidentCategories).toEqual([])
    expect(empty.pattern).toBe('')
  })

  test('a row with no usable date is still counted overall but never placed on a day', () => {
    const result = residentAnalytics({ contributing_matters: [incident('a', null)] })
    expect(result.incidentCount).toBe(1)
    expect(result.weekdays).toEqual([])
    expect(residentAnalytics({ contributing_matters: [incident('a', null)] }, { range: { from: '2026-01-01', to: '' } }).incidentCount).toBe(0)
  })

  test('no data reads as no data', () => {
    expect(residentAnalytics(null).incidentCount).toBe(0)
    expect(residentAnalytics({}).pattern).toBe('')
  })
})

test('an absent analytics RPC reads as not installed, a refusal as not permitted', () => {
  expect(analyticsUnavailableReason({ code: 'PGRST202' })).toBe('not_installed')
  expect(analyticsUnavailableReason({ code: '42883' })).toBe('not_installed')
  expect(analyticsUnavailableReason({ code: '42501' })).toBe('not_permitted')
  expect(analyticsUnavailableReason({ code: '08006' })).toBe('failed')
  expect(analyticsUnavailableReason(null)).toBe('failed')
})
