import fs from 'fs'
import path from 'path'
import { AVAILABILITY_STATUS_LABELS } from './displayLabels'
import {
  DAY_ORDER,
  OFFICIAL_AVAILABILITY_STATUSES,
  availabilityClass,
  availabilityLabel,
  buildOfficialWeek,
  groupByOfficial,
  hoursLabel,
  todayLine,
} from './officialAvailability'

const ROWS = [
  { official_id: 'a', day_of_week: 'Monday', time_start: '9:00 AM', time_end: '11:00 AM', status: 'available', note: 'Treasury concerns' },
  { official_id: 'a', day_of_week: 'Wednesday', time_start: null, time_end: null, status: 'by-appointment', note: null },
  { official_id: 'a', day_of_week: 'Friday', time_start: null, time_end: null, status: 'on-leave', note: null },
  { official_id: 'b', day_of_week: 'Tuesday', time_start: '13:00', time_end: '17:00', status: 'available', note: null },
]

describe('the status vocabulary', () => {
  // ⚠️ Every word this module can show is a word the nurse's schedule
  // already shows for the same stored value.
  it('takes every label and class from AVAILABILITY_STATUS_LABELS', () => {
    OFFICIAL_AVAILABILITY_STATUSES.forEach((status) => {
      expect(AVAILABILITY_STATUS_LABELS[status]).toBeDefined()
      expect(availabilityLabel(status)).toBe(AVAILABILITY_STATUS_LABELS[status].label)
      expect(availabilityClass(status)).toBe(AVAILABILITY_STATUS_LABELS[status].className)
    })
  })

  // ⚠️ THE LOAD-BEARING ONE. These four are what the form offers, and
  // migration 026's CHECK is what the database accepts. A word offered
  // here that the database refuses produces a bare 23514 instead of a
  // sentence -- the same trap migration 021 records for the 9th
  // exception hour.
  it('offers exactly what migration 026 allows', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../../supabase-migrations/026_official_availability.sql'),
      'utf8',
    )
    const check = migration.match(
      /official_availability_status_valid CHECK \(\s*status IN \(([^)]*)\)/,
    )
    expect(check).not.toBeNull()
    const allowed = check[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect([...OFFICIAL_AVAILABILITY_STATUSES].sort()).toEqual([...allowed].sort())
  })

  it('shows an unanticipated status as stored rather than blanking it', () => {
    expect(availabilityLabel('on-sabbatical')).toBe('on-sabbatical')
    expect(availabilityLabel(undefined)).toBe('')
    expect(availabilityClass('on-sabbatical')).toBe('badge-claimed')
  })
})

describe('hoursLabel', () => {
  it('formats the hours of an available day', () => {
    expect(hoursLabel(ROWS[0])).toBe('9:00 AM – 11:00 AM')
  })

  // Stored 24-hour or stored as a display string, the reader sees one
  // format -- clinicHours parses before it formats.
  it('renders a 24-hour row identically to a display-string row', () => {
    expect(hoursLabel(ROWS[3])).toBe('1:00 PM – 5:00 PM')
  })

  // ⚠️ Only `available` carries hours. Migration 026's
  // `official_availability_hours_present` CHECK refuses an available
  // row without them, and requires them of nothing else.
  it('is null for every status that is not available', () => {
    expect(hoursLabel(ROWS[1])).toBeNull()
    expect(hoursLabel(ROWS[2])).toBeNull()
    expect(hoursLabel({ status: 'unavailable', time_start: '9:00 AM', time_end: '5:00 PM' }))
      .toBeNull()
  })

  it('is null for a half-filled available row rather than printing a dash', () => {
    expect(hoursLabel({ status: 'available', time_start: '9:00 AM', time_end: null })).toBeNull()
    expect(hoursLabel(null)).toBeNull()
  })
})

describe('buildOfficialWeek', () => {
  it('returns seven entries in weekday order', () => {
    const week = buildOfficialWeek(ROWS.filter((r) => r.official_id === 'a'))
    expect(week.map((e) => e.day)).toEqual(DAY_ORDER)
  })

  // ⚠️ A day with no row is PRESENT and marked, never omitted: a day
  // missing from a list cannot be told apart from a page that failed
  // to load.
  it('includes a day with no row, and says so', () => {
    const week = buildOfficialWeek(ROWS.filter((r) => r.official_id === 'a'))
    const tuesday = week.find((e) => e.day === 'Tuesday')
    expect(tuesday.hasEntry).toBe(false)
    expect(tuesday.status).toBeNull()
    expect(tuesday.hours).toBeNull()
  })

  it('carries the status, label, class, hours and note of a day that has one', () => {
    const monday = buildOfficialWeek(ROWS).find((e) => e.day === 'Monday')
    expect(monday.hasEntry).toBe(true)
    expect(monday.label).toBe('Available')
    expect(monday.hours).toBe('9:00 AM – 11:00 AM')
    expect(monday.note).toBe('Treasury concerns')
  })

  it('ignores a row for something that is not a weekday', () => {
    expect(buildOfficialWeek([{ day_of_week: 'Funday', status: 'available' }]))
      .toHaveLength(7)
    expect(buildOfficialWeek([{ day_of_week: 'Funday', status: 'available' }])
      .every((e) => !e.hasEntry)).toBe(true)
  })

  // The database's UNIQUE (official_id, day_of_week) makes this
  // impossible through the API. It is still handled, because a page
  // that renders beats a page that does not.
  it('keeps one entry per day even if a direct edit produced two', () => {
    const week = buildOfficialWeek([
      { day_of_week: 'Monday', status: 'available', time_start: '9:00 AM', time_end: '10:00 AM' },
      { day_of_week: 'Monday', status: 'on-leave' },
    ])
    expect(week.filter((e) => e.day === 'Monday')).toHaveLength(1)
    expect(week.find((e) => e.day === 'Monday').status).toBe('on-leave')
  })

  it('survives no rows at all', () => {
    expect(buildOfficialWeek()).toHaveLength(7)
    expect(buildOfficialWeek([null, undefined, {}])).toHaveLength(7)
  })
})

describe('groupByOfficial', () => {
  it('splits the rows by official', () => {
    const map = groupByOfficial(ROWS)
    expect(map.get('a')).toHaveLength(3)
    expect(map.get('b')).toHaveLength(1)
  })

  it('loses no row', () => {
    const total = [...groupByOfficial(ROWS).values()].flat().length
    expect(total).toBe(ROWS.length)
  })

  it('drops a row with no official, rather than grouping it under undefined', () => {
    const map = groupByOfficial([...ROWS, { day_of_week: 'Monday', status: 'available' }])
    expect(map.has(undefined)).toBe(false)
    expect([...map.keys()].sort()).toEqual(['a', 'b'])
  })

  it('is an empty map for nothing', () => {
    expect(groupByOfficial().size).toBe(0)
    expect(groupByOfficial([]).size).toBe(0)
  })
})

describe('todayLine', () => {
  const forA = ROWS.filter((r) => r.official_id === 'a')

  it('reports the status and hours for a day that has them', () => {
    const line = todayLine(forA, 'Monday')
    expect(line.kind).toBe('entry')
    expect(line.text).toBe('Available · 9:00 AM – 11:00 AM')
    expect(line.note).toBe('Treasury concerns')
  })

  it('reports a status with no hours as just the status', () => {
    expect(todayLine(forA, 'Wednesday').text).toBe('By appointment')
    expect(todayLine(forA, 'Friday').text).toBe('On leave')
  })

  it('says there is nothing today when other days have entries', () => {
    const line = todayLine(forA, 'Tuesday')
    expect(line.kind).toBe('closed')
    expect(line.text).toBe('No consultation hours today.')
  })

  // ⚠️ An absent schedule is not a closed door. Saying "not available"
  // for an official who has simply never published hours asserts
  // something about them that nobody checked.
  it('distinguishes "nothing published at all" from "nothing today"', () => {
    const line = todayLine([], 'Monday')
    expect(line.kind).toBe('none')
    expect(line.text).toBe('No consultation hours published yet.')
    expect(todayLine(undefined, 'Monday').kind).toBe('none')
  })

  // The day is PASSED IN, never read here: this stays pure, and the
  // page uses the one manilaWeekday() everything else uses. A
  // resident whose phone is set to another timezone must still be told
  // whether their Kagawad is in today.
  it('reads the day it is given and never the browser clock', () => {
    expect(todayLine(forA, 'Monday').status).toBe('available')
    expect(todayLine(forA, 'Friday').status).toBe('on-leave')
    expect(todayLine(forA, undefined).kind).toBe('closed')
  })
})

describe('the module itself', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'officialAvailability.js'), 'utf8',
  )

  it('defines no availability label of its own', () => {
    const body = source.replace(/\/\/.*$/gm, '')
    Object.values(AVAILABILITY_STATUS_LABELS).forEach((entry) => {
      expect(body).not.toContain(`'${entry.label}'`)
    })
  })

  it('reads the shared map rather than re-declaring one', () => {
    expect(source).toContain("import { AVAILABILITY_STATUS_LABELS } from './displayLabels'")
    expect(source).not.toMatch(/const\s+\w*STATUS_LABELS\s*=/)
  })
})
