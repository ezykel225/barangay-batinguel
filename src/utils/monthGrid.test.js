// The month grid and the date-only arithmetic under it.
//
// Pure module, no Supabase import, so these run without the environment
// variables `App.test.js` needs.
//
// ⚠️ Most of these exist for one defect class: treating a stored
// 'YYYY-MM-DD' as an instant. `new Date('2026-10-01')` is UTC midnight
// by specification, so reading it back west of UTC gives the previous
// day. This project has already shipped that bug twice -- in
// `event_month`/`event_day`, and in the event filters that compared
// against `toISOString()`. Nothing in monthGrid.js may construct a Date
// from a date string, and these tests are what hold that.

import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  buildMonthGrid,
  dateKey,
  daysInMonth,
  groupByDateKey,
  isLeapYear,
  monthOf,
  parseDateKey,
  shiftMonth,
  toDateKey,
} from './monthGrid'

describe('date keys', () => {
  it('builds a zero-padded key from a 0-based month', () => {
    expect(dateKey(2026, 0, 1)).toBe('2026-01-01')
    expect(dateKey(2026, 9, 1)).toBe('2026-10-01')
    expect(dateKey(2026, 11, 31)).toBe('2026-12-31')
  })

  it('round-trips without touching a Date', () => {
    expect(toDateKey('2026-10-01')).toBe('2026-10-01')
    expect(parseDateKey('2026-10-01')).toEqual({ year: 2026, month: 9, day: 1 })
  })

  it('does NOT shift the day, whatever the runtime zone is', () => {
    // ⚠️ The regression. `new Date('2026-10-01').getDate()` returns 30
    // in any zone west of UTC. parseDateKey reads the characters.
    const utcMisreading = new Date('2026-10-01')
    expect(utcMisreading.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    // Whatever this runtime does with that Date, the parse is fixed:
    expect(parseDateKey('2026-10-01').day).toBe(1)
    expect(parseDateKey('2026-10-01').month).toBe(9)
    expect(toDateKey('2026-01-01')).toBe('2026-01-01')
  })

  it('takes the date part of a timestamp', () => {
    expect(toDateKey('2026-10-01T23:30:00+08:00')).toBe('2026-10-01')
    expect(toDateKey('2026-10-01T00:00:00.000Z')).toBe('2026-10-01')
  })

  it('refuses anything that is not a date', () => {
    expect(parseDateKey(null)).toBeNull()
    expect(parseDateKey(undefined)).toBeNull()
    expect(parseDateKey('')).toBeNull()
    expect(parseDateKey('not a date')).toBeNull()
    expect(parseDateKey('2026-13-01')).toBeNull()
    expect(parseDateKey('2026-10-00')).toBeNull()
    expect(parseDateKey(20261001)).toBeNull()
    expect(toDateKey(null)).toBe('')
  })

  it('refuses a day the month does not have, instead of sliding it', () => {
    // '2026-02-30' is not a date. A Date would quietly make it March 2nd,
    // which is how bad data stops being visible.
    expect(parseDateKey('2026-02-30')).toBeNull()
    expect(parseDateKey('2026-04-31')).toBeNull()
    expect(parseDateKey('2026-02-28')).toEqual({ year: 2026, month: 1, day: 28 })
  })
})

describe('leap years and month lengths', () => {
  it('knows the century rules', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
  })

  it('gives February the right length in both cases', () => {
    expect(daysInMonth(2024, 1)).toBe(29)
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2026, 0)).toBe(31)
    expect(daysInMonth(2026, 3)).toBe(30)
  })

  it('accepts 29 February only in a leap year', () => {
    expect(parseDateKey('2024-02-29')).toEqual({ year: 2024, month: 1, day: 29 })
    expect(parseDateKey('2026-02-29')).toBeNull()
  })
})

describe('moving between months', () => {
  it('wraps December to January and back', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('stays put for a zero delta', () => {
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 })
  })

  it('handles a delta larger than a year in one step', () => {
    expect(shiftMonth(2026, 0, 14)).toEqual({ year: 2027, month: 2 })
    expect(shiftMonth(2026, 0, -14)).toEqual({ year: 2024, month: 10 })
  })
})

describe('which month a date sits in', () => {
  it('reads the month off a date key', () => {
    expect(monthOf('2026-10-15')).toEqual({ year: 2026, month: 9 })
    expect(monthOf('2027-01-01')).toEqual({ year: 2027, month: 0 })
  })

  it('falls back to the current month rather than 1970', () => {
    // A calendar has to open on something. The local month is a better
    // guess than the epoch.
    const now = new Date()
    expect(monthOf(null)).toEqual({ year: now.getFullYear(), month: now.getMonth() })
    expect(monthOf('nonsense')).toEqual({ year: now.getFullYear(), month: now.getMonth() })
  })
})

describe('the month grid', () => {
  it('has one cell per day plus the leading blanks', () => {
    // 1 October 2026 is a Thursday, so four blanks precede it.
    const cells = buildMonthGrid(2026, 9)
    expect(new Date(2026, 9, 1).getDay()).toBe(4)
    expect(cells.slice(0, 4)).toEqual([null, null, null, null])
    expect(cells.filter(Boolean)).toHaveLength(31)
    expect(cells).toHaveLength(35)
  })

  it('numbers and keys every day correctly', () => {
    const days = buildMonthGrid(2026, 9).filter(Boolean)
    expect(days[0]).toMatchObject({ day: 1, key: '2026-10-01', month: 9, year: 2026 })
    expect(days[30]).toMatchObject({ day: 31, key: '2026-10-31' })
  })

  it('handles a month that starts on Sunday with no leading blanks', () => {
    // 1 February 2026 is a Sunday.
    const cells = buildMonthGrid(2026, 1)
    expect(cells[0]).toMatchObject({ day: 1, weekday: 0 })
    expect(cells.filter(Boolean)).toHaveLength(28)
  })

  it('gives leap February 29 cells', () => {
    expect(buildMonthGrid(2024, 1).filter(Boolean)).toHaveLength(29)
  })

  it('marks today and the past by string comparison', () => {
    const cells = buildMonthGrid(2026, 9, { today: '2026-10-15' }).filter(Boolean)
    const on = (day) => cells.find((c) => c.day === day)
    expect(on(15)).toMatchObject({ isToday: true, isPast: false })
    expect(on(14)).toMatchObject({ isToday: false, isPast: true })
    expect(on(16)).toMatchObject({ isToday: false, isPast: false })
  })

  it('marks nothing as today or past when today is not given', () => {
    // A calendar with no "today" is a valid state -- the caller decides.
    const cells = buildMonthGrid(2026, 9).filter(Boolean)
    expect(cells.some((c) => c.isToday)).toBe(false)
    expect(cells.some((c) => c.isPast)).toBe(false)
  })

  it('returns nothing for a month that does not exist', () => {
    expect(buildMonthGrid(2026, 12)).toEqual([])
    expect(buildMonthGrid(2026, -1)).toEqual([])
    expect(buildMonthGrid('2026', 0)).toEqual([])
  })

  it('crosses a year boundary without losing a day', () => {
    expect(buildMonthGrid(2026, 11).filter(Boolean)).toHaveLength(31)
    expect(buildMonthGrid(2027, 0).filter(Boolean)).toHaveLength(31)
    expect(buildMonthGrid(2026, 11).filter(Boolean).at(-1).key).toBe('2026-12-31')
    expect(buildMonthGrid(2027, 0).filter(Boolean)[0].key).toBe('2027-01-01')
  })
})

describe('grouping rows by date', () => {
  const rows = [
    { id: 'a', event_date: '2026-10-01' },
    { id: 'b', event_date: '2026-10-01' },
    { id: 'c', event_date: '2026-10-02' },
    { id: 'd', event_date: null },
    { id: 'e', event_date: 'whenever' },
  ]

  it('buckets several records on one date', () => {
    const map = groupByDateKey(rows, (r) => r.event_date)
    expect(map.get('2026-10-01').map((r) => r.id)).toEqual(['a', 'b'])
    expect(map.get('2026-10-02').map((r) => r.id)).toEqual(['c'])
  })

  it('skips a record with no usable date rather than guessing one', () => {
    const map = groupByDateKey(rows, (r) => r.event_date)
    const all = [...map.values()].flat().map((r) => r.id)
    expect(all).not.toContain('d')
    expect(all).not.toContain('e')
    expect(map.size).toBe(2)
  })

  it('survives a missing list', () => {
    expect(groupByDateKey(undefined, (r) => r.x).size).toBe(0)
    expect(groupByDateKey([], (r) => r.x).size).toBe(0)
  })
})

describe('the labels', () => {
  it('has twelve months and seven weekdays, short and full', () => {
    expect(MONTH_NAMES).toHaveLength(12)
    expect(MONTH_NAMES[9]).toBe('October')
    expect(WEEKDAY_SHORT).toHaveLength(7)
    expect(WEEKDAY_NAMES).toHaveLength(7)
    // The short forms are for looking at; the full ones are what a
    // screen reader is given.
    WEEKDAY_SHORT.forEach((short, i) => {
      expect(WEEKDAY_NAMES[i].startsWith(short)).toBe(true)
    })
  })
})
