import {
  EXCERPT_MAX_CHARS,
  announcementExcerpt,
  daysUntilWeekday,
  nextCollection,
  relativeDayLabel,
} from './homeSections'

// The two rows the live table actually holds. One is 'All Purok', one
// is a single purok, and one `time_label` is the ragged
// "7:00 AM - 10:00" the column really contains.
const LIVE_ROWS = [
  {
    id: 1, purok: 'All Purok', waste_type: 'Biodegradable', day_of_week: 'Monday', time_label: '7:00 AM - 4:00 PM',
  },
  {
    id: 2, purok: 'Purok 4', waste_type: 'Biodegradable', day_of_week: 'Tuesday', time_label: '7:00 AM - 10:00',
  },
]

describe('announcementExcerpt', () => {
  it('returns a short description untouched', () => {
    expect(announcementExcerpt('Clean-up drive on Saturday.'))
      .toBe('Clean-up drive on Saturday.')
  })

  // ⚠️ THE REGRESSION GUARD. One announcement with a long body made its
  // card several times the height of the two beside it and pushed the
  // events and waste sections down the page.
  it('bounds a very long body', () => {
    const long = 'The barangay council will hold a general assembly. '.repeat(40)
    const out = announcementExcerpt(long)
    expect(long.length).toBeGreaterThan(1900)
    expect(out.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS + 3)
    expect(out.endsWith('...')).toBe(true)
  })

  it('cuts on a word boundary, not mid-word', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet '.repeat(8)
    const out = announcementExcerpt(long, 40)
    expect(out).toBe('alpha bravo charlie delta echo foxtrot...')
    expect(out).not.toMatch(/fox\.\.\.$/)
  })

  // A URL or a run of hyphens has no boundary to find. It is cut where
  // the limit falls rather than returned whole, which is the direction
  // that keeps the card bounded.
  it('cuts an unbroken token rather than returning it whole', () => {
    const out = announcementExcerpt('x'.repeat(500), 50)
    expect(out).toBe(`${'x'.repeat(50)}...`)
  })

  it('collapses the whitespace a pasted notice arrives with', () => {
    expect(announcementExcerpt('One.\n\n   Two.\tThree.')).toBe('One. Two. Three.')
  })

  // Three dots, not a single-character ellipsis -- the X1 convention
  // the loading labels follow.
  it('ends in three dots, never a one-character ellipsis', () => {
    const out = announcementExcerpt('word '.repeat(200))
    expect(out).toContain('...')
    expect(out).not.toContain('…')
  })

  it('does not leave a dangling comma or dash before the dots', () => {
    expect(announcementExcerpt('alpha bravo charlie, delta', 24)).toBe('alpha bravo charlie...')
  })

  it('survives null, undefined, a number and an empty string', () => {
    expect(announcementExcerpt()).toBe('')
    expect(announcementExcerpt(null)).toBe('')
    expect(announcementExcerpt('   ')).toBe('')
    expect(announcementExcerpt(42)).toBe('42')
  })
})

describe('daysUntilWeekday', () => {
  it('is 0 for today and 1 for tomorrow', () => {
    expect(daysUntilWeekday('Monday', 'Monday')).toBe(0)
    expect(daysUntilWeekday('Tuesday', 'Monday')).toBe(1)
  })

  it('wraps across the end of the week', () => {
    expect(daysUntilWeekday('Monday', 'Saturday')).toBe(2)
    expect(daysUntilWeekday('Monday', 'Sunday')).toBe(1)
    expect(daysUntilWeekday('Sunday', 'Monday')).toBe(6)
  })

  // ⚠️ Null rather than a guess. A row whose day is not a weekday name
  // must not be placed on some day anyway.
  it('is null for anything that is not a weekday name', () => {
    expect(daysUntilWeekday('Funday', 'Monday')).toBeNull()
    expect(daysUntilWeekday('Monday', 'Funday')).toBeNull()
    expect(daysUntilWeekday(null, 'Monday')).toBeNull()
    expect(daysUntilWeekday('2026-10-05', 'Monday')).toBeNull()
  })
})

describe('relativeDayLabel', () => {
  it('reads Today, Tomorrow, then the weekday', () => {
    expect(relativeDayLabel(0, 'Monday')).toBe('Today')
    expect(relativeDayLabel(1, 'Tuesday')).toBe('Tomorrow')
    expect(relativeDayLabel(4, 'Friday')).toBe('Friday')
  })
})

describe('nextCollection', () => {
  it('picks the soonest weekday from the real rows', () => {
    const out = nextCollection(LIVE_ROWS, 'Sunday')
    expect(out.weekday).toBe('Monday')
    expect(out.days).toBe(1)
    expect(out.label).toBe('Tomorrow')
    expect(out.rows.map((r) => r.id)).toEqual([1])
  })

  // ⚠️ Today counts as the next collection, not as missed. `time_label`
  // is free text, so deciding whether today's window has passed would
  // mean parsing a range the column does not guarantee -- and telling
  // somebody their collection is six days away on the morning it
  // happens is the worse error. Same rule as `upcomingEvents`.
  it('counts today as the next collection', () => {
    const out = nextCollection(LIVE_ROWS, 'Monday')
    expect(out.days).toBe(0)
    expect(out.label).toBe('Today')
  })

  it('wraps to next week when every day has passed', () => {
    const out = nextCollection(LIVE_ROWS, 'Wednesday')
    expect(out.weekday).toBe('Monday')
    expect(out.days).toBe(5)
    expect(out.label).toBe('Monday')
  })

  it('returns every row that falls on that day, not just the first', () => {
    const rows = [
      ...LIVE_ROWS,
      { id: 3, purok: 'Purok 2', waste_type: 'Recyclable', day_of_week: 'Monday' },
    ]
    const out = nextCollection(rows, 'Monday')
    expect(out.rows.map((r) => r.id)).toEqual([1, 3])
  })

  // ⚠️ THE ONE THAT KEEPS IT HONEST. If the day cannot be derived, the
  // summary is null and the page renders none -- it does not invent one.
  it('is null when no row carries a weekday name', () => {
    expect(nextCollection([{ id: 9, day_of_week: 'As scheduled' }], 'Monday')).toBeNull()
    expect(nextCollection([], 'Monday')).toBeNull()
    expect(nextCollection(undefined, 'Monday')).toBeNull()
    expect(nextCollection([null, {}], 'Monday')).toBeNull()
  })

  // A row left out is COUNTED, not silently dropped. A summary that
  // quietly loses rows looks complete while being short.
  it('counts the rows it had to leave out', () => {
    const rows = [...LIVE_ROWS, { id: 4, day_of_week: 'Every other Friday' }]
    expect(nextCollection(rows, 'Monday').skipped).toBe(1)
    expect(nextCollection(LIVE_ROWS, 'Monday').skipped).toBe(0)
  })

  it('reads the Manila weekday by default rather than throwing', () => {
    expect(() => nextCollection(LIVE_ROWS)).not.toThrow()
  })
})
