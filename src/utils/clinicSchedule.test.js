import {
  DAY_ORDER,
  breakFallsWithin,
  buildWeekSchedule,
  scheduleForDay,
} from './clinicSchedule'

// The rows as the live table actually holds them, including Friday's
// two, and including the fact that Friday is stored in 24-hour form
// while every other day is stored as a display string.
const LIVE_ROWS = [
  { day_of_week: 'Monday', time_start: '8:00 AM', time_end: '5:00 PM', break_start: '12:00 PM', break_end: '1:00 PM', status: 'available' },
  { day_of_week: 'Tuesday', time_start: '8:00 AM', time_end: '5:00 PM', break_start: '12:00 PM', break_end: '1:00 PM', status: 'available' },
  { day_of_week: 'Wednesday', time_start: '8:00 AM', time_end: '5:00 PM', break_start: '12:00 PM', break_end: '1:00 PM', status: 'available' },
  { day_of_week: 'Thursday', time_start: '8:00 AM', time_end: '5:00 PM', break_start: '12:00 PM', break_end: '1:00 PM', status: 'on-break' },
  { day_of_week: 'Friday', time_start: '08:00', time_end: '12:00', break_start: '12:00', break_end: '13:00', status: 'available' },
  { day_of_week: 'Friday', time_start: '13:00', time_end: '17:00', break_start: '12:00 PM', break_end: '1:00 PM', status: 'available' },
]

const friday = (rows = LIVE_ROWS) => scheduleForDay(buildWeekSchedule(rows), 'Friday')

describe('buildWeekSchedule', () => {
  it('returns exactly seven entries, in weekday order', () => {
    const week = buildWeekSchedule(LIVE_ROWS)
    expect(week).toHaveLength(7)
    expect(week.map((d) => d.day)).toEqual(DAY_ORDER)
  })

  // ⚠️ THE ONE THIS MODULE EXISTS FOR. Friday has two rows in the live
  // table, and the page listed it twice -- which reads as a rendering
  // fault, not as two sessions.
  it('gives Friday ONE entry carrying BOTH of its sessions', () => {
    const week = buildWeekSchedule(LIVE_ROWS)
    expect(week.filter((d) => d.day === 'Friday')).toHaveLength(1)
    expect(friday().sessions).toHaveLength(2)
    expect(friday().isSplit).toBe(true)
    expect(friday().rowCount).toBe(2)
  })

  // ⚠️ And it does NOT merge them into one 8-to-5 session. That would
  // be inferring what the barangay meant and then showing the
  // inference as fact.
  it('keeps the two Friday sessions separate rather than merging them', () => {
    expect(friday().sessions.map((s) => s.label))
      .toEqual(['8:00 AM – 12:00 NN', '1:00 PM – 5:00 PM'])
  })

  it('puts the earlier session first, whatever order the rows arrive in', () => {
    const reversed = [...LIVE_ROWS].reverse()
    expect(friday(reversed).sessions.map((s) => s.label))
      .toEqual(['8:00 AM – 12:00 NN', '1:00 PM – 5:00 PM'])
  })

  // Friday is stored 24-hour, every other day as a display string.
  // Both reach the reader in one format, which is the whole reason
  // clinicHours parses before formatting.
  it('renders the 24-hour rows and the display-string rows identically', () => {
    const week = buildWeekSchedule(LIVE_ROWS)
    expect(scheduleForDay(week, 'Monday').sessions[0].label)
      .toBe('8:00 AM – 5:00 PM')
    expect(friday().sessions[0].label).toBe('8:00 AM – 12:00 NN')
  })

  it('marks an ordinary single-session day as not split', () => {
    const monday = scheduleForDay(buildWeekSchedule(LIVE_ROWS), 'Monday')
    expect(monday.isSplit).toBe(false)
    expect(monday.sessions).toHaveLength(1)
  })

  // ⚠️ A day with no row is PRESENT and marked, not absent. A day
  // missing from the list cannot be told apart from a page that failed
  // to load -- the same rule the reconciliation panel follows.
  it('includes a day that has no hours at all, and says so', () => {
    const week = buildWeekSchedule(LIVE_ROWS)
    const saturday = scheduleForDay(week, 'Saturday')
    expect(saturday).not.toBeNull()
    expect(saturday.hasHours).toBe(false)
    expect(saturday.sessions).toEqual([])
    expect(saturday.status).toBeNull()
  })

  it('carries each day its own status', () => {
    const week = buildWeekSchedule(LIVE_ROWS)
    expect(scheduleForDay(week, 'Thursday').status).toBe('on-break')
    expect(scheduleForDay(week, 'Monday').status).toBe('available')
  })

  // Two rows for one day that disagree is a real possibility once a
  // day can have two rows. Picking one silently is how a schedule
  // starts lying.
  it('reports a status conflict rather than silently picking one', () => {
    const rows = [
      { day_of_week: 'Friday', time_start: '08:00', time_end: '12:00', status: 'available' },
      { day_of_week: 'Friday', time_start: '13:00', time_end: '17:00', status: 'unavailable' },
    ]
    expect(friday(rows).statusConflict).toBe(true)
    expect(scheduleForDay(buildWeekSchedule(LIVE_ROWS), 'Friday').statusConflict).toBe(false)
  })

  it('ignores a row for a day that is not a weekday name', () => {
    const rows = [...LIVE_ROWS, { day_of_week: 'Funday', time_start: '08:00', time_end: '09:00' }]
    expect(buildWeekSchedule(rows)).toHaveLength(7)
  })

  it('survives no rows, a null and a malformed row', () => {
    expect(buildWeekSchedule([])).toHaveLength(7)
    expect(buildWeekSchedule()).toHaveLength(7)
    expect(buildWeekSchedule([null, undefined, {}])).toHaveLength(7)
    expect(buildWeekSchedule([]).every((d) => d.hasHours === false)).toBe(true)
  })
})

describe('the lunch break', () => {
  it('is shown when it falls inside the session', () => {
    const monday = scheduleForDay(buildWeekSchedule(LIVE_ROWS), 'Monday')
    expect(monday.sessions[0].breakLabel).toBe('12:00 NN – 1:00 PM')
  })

  // ⚠️ Friday's SECOND row carries a 12:00 PM - 1:00 PM break against a
  // session that starts at 1:00 PM. Printing it would tell a resident
  // the clinic shuts an hour before it opens.
  it('is dropped when it sits outside the session it is attached to', () => {
    const sessions = friday().sessions
    expect(sessions[1].breakLabel).toBeNull()
  })

  // Friday's FIRST row's break is 12:00-13:00 against a session ending
  // at 12:00 -- it is the end of the session, not a closure within it.
  it('is dropped when it merely abuts the end of the session', () => {
    expect(friday().sessions[0].breakLabel).toBeNull()
  })

  describe('breakFallsWithin', () => {
    const session = { start: '8:00 AM', end: '5:00 PM' }

    it('accepts a break inside the session', () => {
      expect(breakFallsWithin(session, '12:00 PM', '1:00 PM')).toBe(true)
    })

    it('accepts a break touching either boundary exactly', () => {
      expect(breakFallsWithin(session, '8:00 AM', '9:00 AM')).toBe(true)
      expect(breakFallsWithin(session, '4:00 PM', '5:00 PM')).toBe(true)
    })

    it('refuses a break that starts before or ends after the session', () => {
      expect(breakFallsWithin(session, '7:00 AM', '9:00 AM')).toBe(false)
      expect(breakFallsWithin(session, '4:00 PM', '6:00 PM')).toBe(false)
    })

    it('refuses a zero-length or backwards break', () => {
      expect(breakFallsWithin(session, '12:00 PM', '12:00 PM')).toBe(false)
      expect(breakFallsWithin(session, '1:00 PM', '12:00 PM')).toBe(false)
    })

    it('refuses anything it cannot parse, rather than guessing', () => {
      expect(breakFallsWithin(session, null, '1:00 PM')).toBe(false)
      expect(breakFallsWithin(session, 'noon', 'one')).toBe(false)
      expect(breakFallsWithin(null, '12:00 PM', '1:00 PM')).toBe(false)
    })
  })
})

describe('scheduleForDay', () => {
  it('finds a day', () => {
    expect(scheduleForDay(buildWeekSchedule(LIVE_ROWS), 'Monday').day).toBe('Monday')
  })

  it('is null for a day that is not a weekday, and for no week at all', () => {
    expect(scheduleForDay(buildWeekSchedule(LIVE_ROWS), 'Funday')).toBeNull()
    expect(scheduleForDay([], 'Monday')).toBeNull()
    expect(scheduleForDay(undefined, 'Monday')).toBeNull()
  })
})
