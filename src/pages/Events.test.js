// The /events page: the Calendar | List switcher, what a list card
// shows, and that selecting a date still works.
//
// ⚠️ Supabase is mocked at the module level, for the reason given at the
// top of Announcements.test.js: the real client throws at import time
// without the env vars, and `jest.mock` is hoisted above the imports so
// it never runs. Navbar and Footer are stubbed; they have their own
// suites. `MonthCalendar` is NOT stubbed -- the real grid is what the
// selection tests are about.

import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Events from './Events'
import { manilaToday } from '../utils/displayLabels'
import { MONTH_NAMES, parseDateKey } from '../utils/monthGrid'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')

// ⚠️ The fixture dates are built from the month the page will
// actually OPEN on, which is the Manila month of today. Hard-coding
// 'October 2026' would make this suite start failing in November for a
// reason that has nothing to do with the code -- the calendar simply
// opens somewhere else. `parseDateKey` and `MONTH_NAMES` are the same
// helpers MonthCalendar names its day buttons with.
const { year: THIS_YEAR, month: THIS_MONTH } = parseDateKey(manilaToday())
const MONTH_LABEL = `${MONTH_NAMES[THIS_MONTH]} ${THIS_YEAR}`
const dayKey = (day) =>
  `${THIS_YEAR}-${String(THIS_MONTH + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// The button MonthCalendar renders for a given day. Its name is
// "<Weekday> <day> <Month> <year>" plus whatever the day means, so the
// \b keeps "5" from also matching "15" and "25".
const dayButton = (day) =>
  screen.getByRole('button', { name: new RegExp(`\\b${day} ${MONTH_LABEL}`, 'i') })

// Shaped like the live table: `event_time` NULL on most rows, and one
// legacy row carrying its time inside `location`.
const ROWS = [
  {
    id: 'e1',
    title: 'General Assembly Meetinggg',
    event_date: dayKey(28),
    event_time: null,
    event_month: 'OCT',
    event_day: '28',
    location: '2:00 PM - Main Covered Court',
  },
  {
    id: 'e2',
    title: 'Padula',
    event_date: dayKey(5),
    event_time: '14:00:00',
    event_month: 'OCT',
    event_day: '05',
    location: 'Barangay Covered Court',
  },
]

const listQuery = (rows) => ({
  select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
})

const renderEvents = async () => {
  const view = render(<MemoryRouter><Events /></MemoryRouter>)
  await screen.findByRole('group', { name: /how to browse events/i })
  return view
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.from.mockReturnValue(listQuery(ROWS))
})

describe('the page intro', () => {
  it('has one h1 naming the page, with no icon inside it', async () => {
    await renderEvents()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe('All Events')
    expect(headings[0].querySelector('svg')).toBeNull()
  })

  // ⚠️ NO HEADING LEVEL IS SKIPPED, in either view. Both of these
  // were h3 and h4 under an h1, and every earlier audit missed them:
  // the list view was never measured, and the panel's heading only
  // exists once a date is selected.
  it('steps h1 -> h2 in the list view, with nothing skipped', async () => {
    await renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /list/i }))
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName[1]))
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((l) => expect(l).toBe(2))
  })

  it('steps h1 -> h2 in the selected-day panel too', async () => {
    await renderEvents()
    fireEvent.click(dayButton(5))
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName[1]))
    expect(Math.max(...levels.map((l, i) => (i === 0 ? 0 : l - levels[i - 1])))).toBeLessThanOrEqual(1)
    expect(levels).toContain(2)
  })

  // The switcher moved into the header row. It is the same group, with
  // the same accessible name and the same two buttons.
  it('keeps the switcher a labelled group of two buttons', async () => {
    await renderEvents()
    const group = screen.getByRole('group', { name: /how to browse events/i })
    expect(within(group).getAllByRole('button')).toHaveLength(2)
  })
})

describe('the Calendar | List switcher', () => {
  it('starts on Calendar, and the state is in aria-pressed', async () => {
    await renderEvents()
    expect(screen.getByRole('button', { name: /calendar/i }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /list/i }))
      .toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.events-calendar-layout')).toBeTruthy()
  })

  it('switches to the list and back', async () => {
    await renderEvents()

    fireEvent.click(screen.getByRole('button', { name: /list/i }))
    expect(screen.getByRole('button', { name: /list/i }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.events-page-grid')).toBeTruthy()
    expect(document.querySelector('.events-calendar-layout')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /calendar/i }))
    expect(screen.getByRole('button', { name: /calendar/i }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.events-calendar-layout')).toBeTruthy()
  })
})

describe('the list view', () => {
  const showList = async () => {
    await renderEvents()
    fireEvent.click(screen.getByRole('button', { name: /list/i }))
  }

  it('links each card to its own detail page', async () => {
    await showList()
    const links = document.querySelectorAll('.event-card-link')
    expect(links).toHaveLength(2)
    expect([...links].map((a) => a.getAttribute('href')))
      .toEqual(['/events/e1', '/events/e2'])
  })

  it('keeps the date block, reading from the stored display parts', async () => {
    await showList()
    const first = document.querySelectorAll('.event-card')[0]
    expect(first.querySelector('.event-date-month').textContent).toBe('OCT')
    expect(first.querySelector('.event-date-day').textContent).toBe('28')
  })

  // ⚠️ THE LOAD-BEARING ONE. `events.event_time` is NULL on every row in
  // the live table, so a card with no time must render NO time line --
  // not an empty one, and not a label with a blank after it.
  it('shows a time only when the row has one', async () => {
    await showList()
    const [noTime, withTime] = document.querySelectorAll('.event-card')
    expect(noTime.querySelectorAll('.event-meta-item')).toHaveLength(1)
    expect(withTime.querySelectorAll('.event-meta-item')).toHaveLength(2)
    expect(withTime.textContent).toContain('2:00 PM')
  })

  // ⚠️ And it does not dig a time out of `location`. The first row's
  // location BEGINS with "2:00 PM" and that stays part of the location,
  // exactly as somebody typed it.
  it('does not read a time out of the location text', async () => {
    await showList()
    const noTime = document.querySelectorAll('.event-card')[0]
    expect(noTime.textContent).toContain('2:00 PM - Main Covered Court')
    expect(noTime.querySelector('.event-meta-item').textContent)
      .toBe('2:00 PM - Main Covered Court')
  })

  it('still shows every location', async () => {
    await showList()
    expect(screen.getByText('Barangay Covered Court')).toBeInTheDocument()
  })
})

describe('the calendar view', () => {
  // ⚠️ Unselected, the panel used to be a 46px box beside a 532px
  // calendar. The WORDS are unchanged; only the state class is new.
  it('waits for a date with the same message it always had', async () => {
    await renderEvents()
    expect(screen.getByText('Select a date above to see what is scheduled.'))
      .toBeInTheDocument()
    expect(document.querySelector('.mcal-day-panel').className)
      .toContain('is-waiting')
  })

  it('shows the day’s events once a date is selected, and drops the waiting state', async () => {
    await renderEvents()

    // The real grid, found by the accessible name MonthCalendar gives
    // each day -- not by a class or a nth-child.
    fireEvent.click(dayButton(5))

    expect(document.querySelector('.mcal-day-panel').className)
      .not.toContain('is-waiting')
    expect(screen.queryByText('Select a date above to see what is scheduled.'))
      .toBeNull()
    const item = document.querySelector('.mcal-day-item')
    expect(item.getAttribute('href')).toBe('/events/e2')
    expect(item.textContent).toContain('Padula')
  })

  it('says so when a selected date has nothing on it', async () => {
    await renderEvents()
    fireEvent.click(dayButton(7))
    expect(screen.getByText('Nothing scheduled on this date.')).toBeInTheDocument()
  })
})
