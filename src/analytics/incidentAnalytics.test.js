import fs from 'fs'
import path from 'path'
import { INCIDENT_TYPE_KEYS } from '../incidents/incidentLabels'
import { NOT_RECORDED, areaOf, areaOptions, completeness, filterRecords, incidentSummary, manilaHour, seriesSummary } from './incidentAnalytics'

// Synthetic incident_queue rows. 16:30Z on 31 Oct is 00:30 on 1 Nov in Manila.
const row = (id, occurred_at, extra = {}) => ({ id, reference: `INC-T-${id}`, incident_type: 'traffic_accident', status: 'recorded', location_text: 'Rizal Street', area_note: '', occurred_at, blotter_reference: null, ...extra })
const ROWS = [
  row('1', '2026-10-31T16:30:00Z'),                                          // Sun 1 Nov 00:30 Manila
  row('2', '2026-11-02T01:00:00Z', { status: 'resolved', area_note: 'Purok 2' }), // Mon 2 Nov 09:00
  row('3', '2026-11-02T13:00:00Z', { incident_type: 'disturbance' }),         // Mon 2 Nov 21:00
  row('4', '2026-11-05T04:00:00Z', { incident_type: 'mystery_type', location_text: '  ', area_note: '' }),
]

test('the area rule is the 062 rule: area note, else location text, else Not recorded; exact otherwise', () => {
  expect(areaOf({ area_note: ' Purok 2 ', location_text: 'Rizal Street' })).toBe('Purok 2')
  expect(areaOf({ area_note: '   ', location_text: ' Rizal Street ' })).toBe('Rizal Street')
  expect(areaOf({ area_note: null, location_text: '' })).toBe(NOT_RECORDED)
  expect(areaOf({ location_text: 'rizal street' })).not.toBe(areaOf({ location_text: 'Rizal Street' }))
})

test('Manila hours and days, whatever the test machine zone', () => {
  expect(manilaHour('2026-10-31T16:30:00Z')).toBe(0)
  expect(manilaHour('2026-11-02T13:00:00Z')).toBe(21)
  expect(manilaHour('not a date')).toBeNull()
})

test('category and area filters narrow the same records the charts count', () => {
  expect(filterRecords(ROWS, { category: 'traffic_accident' }).map((r) => r.id)).toEqual(['1', '2'])
  expect(filterRecords(ROWS, { area: 'Purok 2' }).map((r) => r.id)).toEqual(['2'])
  expect(filterRecords(ROWS, { category: 'disturbance', area: 'Purok 2' })).toEqual([])
  expect(filterRecords(ROWS, {})).toHaveLength(4)
})

test('every breakdown sums to the record total; nothing is double counted or dropped', () => {
  const s = incidentSummary(ROWS, { from: '2026-11-01', to: '2026-11-07' })
  const sum = (rows) => rows.reduce((n, r) => n + r.total, 0)
  expect(s.total).toBe(4)
  for (const list of [s.series, s.categories, s.statuses, s.weekdays, s.timeBands, s.areas]) expect(sum(list)).toBe(4)
  // An unknown category is kept, as stored, after the known ones.
  expect(s.categories.map((r) => r.key)).toEqual([...INCIDENT_TYPE_KEYS, 'mystery_type'])
  expect(s.categories.find((r) => r.key === 'mystery_type').total).toBe(1)
})

test('a week is daily, Monday first, and the Manila date decides the day', () => {
  const s = incidentSummary(ROWS, { from: '2026-11-01', to: '2026-11-07' })
  expect(s.granularity).toBe('day')
  expect(s.series.map((r) => [r.key, r.total])).toEqual([['2026-11-01', 1], ['2026-11-02', 2], ['2026-11-03', 0], ['2026-11-04', 0], ['2026-11-05', 1], ['2026-11-06', 0], ['2026-11-07', 0]])
  expect(s.weekdays.map((r) => r.label)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  expect(s.weekdays.find((r) => r.label === 'Sunday').total).toBe(1)
  expect(s.weekdays.find((r) => r.label === 'Monday').total).toBe(2)
  // Manila hours 0, 9, 21 and 12 fall in the 4-hour bands 0, 2, 5 and 3.
  expect(s.timeBands.map((r) => r.total)).toEqual([1, 0, 1, 1, 0, 1])
})

test('an unbounded period runs the monthly series over the data actually present', () => {
  const s = incidentSummary(ROWS, {})
  expect(s.granularity).toBe('day') // 1 Nov to 5 Nov
  const long = incidentSummary([row('a', '2025-12-15T02:00:00Z'), row('b', '2026-03-01T02:00:00Z')], {})
  expect(long.granularity).toBe('week')
  const year = incidentSummary([row('a', '2025-01-15T02:00:00Z'), row('b', '2026-03-01T02:00:00Z')], {})
  expect(year.series.map((r) => r.key)[0]).toBe('2025-01')
  expect(year.series.map((r) => r.key).slice(-1)[0]).toBe('2026-03')
  expect(year.series).toHaveLength(15)
})

test('no records gives zeros over real buckets, never invented values', () => {
  const s = incidentSummary([], { from: '2026-11-02', to: '2026-11-04' })
  expect(s.total).toBe(0)
  expect(s.series.map((r) => r.total)).toEqual([0, 0, 0])
  expect(s.areas).toEqual([])
  expect(seriesSummary(s.series)).toMatch(/^No incidents recorded/)
})

test('area choices list what was recorded, Not recorded last', () => {
  expect(areaOptions(ROWS)).toEqual(['Purok 2', 'Rizal Street', NOT_RECORDED])
  expect(areaOptions(ROWS, 'disturbance')).toEqual(['Rizal Street'])
})

test('completeness compares the list with the database count for the same days and category', () => {
  const counts = [{ incident_type: 'traffic_accident', total: 2 }, { incident_type: 'disturbance', total: 1 }, { incident_type: 'mystery_type', total: 1 }]
  expect(completeness(ROWS, counts)).toEqual({ known: true, complete: true, expected: 4, received: 4 })
  expect(completeness(ROWS.slice(0, 2), counts, 'traffic_accident').complete).toBe(true)
  expect(completeness(ROWS.slice(0, 3), counts)).toMatchObject({ complete: false, expected: 4, received: 3 })
  // When the count could not be read, the list is not declared incomplete -- but the check is marked unknown.
  expect(completeness(ROWS, null)).toMatchObject({ known: false, complete: true })
})

test('the summary sentence states the total and the peak from the same series', () => {
  const s = incidentSummary(ROWS, { from: '2026-11-01', to: '2026-11-07' })
  expect(seriesSummary(s.series)).toBe('4 incidents from Nov 1 to Nov 7. Highest: Nov 2, 2 incidents.')
})

test('the analytics modules hold no person attribution, name matching or judgment', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const f of ['incidentAnalytics.js', 'analyticsPeriods.js', 'AnalyticsCharts.jsx']) {
    const code = read(f)
    expect(code).not.toMatch(/resident_id|external_person|full_name|ilike|soundex|levenshtein/)
    expect(code).not.toMatch(/risk|danger|offender|predict|score\(|recommend/i)
    expect(code).not.toMatch(/Math\.random|faker|sample|placeholder/i)
  }
})
