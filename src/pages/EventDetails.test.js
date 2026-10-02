// The event detail page, and the one row that must disappear when the
// column holding it is empty.
//
// ⚠️ Supabase is mocked at the module level and Navbar/Footer are
// stubbed, for the reasons given at the top of Announcements.test.js:
// the real client throws at import time without the env vars, and
// `jest.mock` is hoisted above the imports so it never runs.

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EventDetails from './EventDetails'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')

const BASE = {
  id: 'e1',
  title: 'Senior Christmas Party',
  event_date: '2026-12-13',
  event_month: 'DEC',
  event_day: '13',
  location: 'Barangay Covered Court',
  description: 'Open to every senior citizen of the barangay.',
}

const detailQuery = (row) => ({
  select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
})

const show = async (row) => {
  supabase.from.mockReturnValue(detailQuery(row))
  const view = render(
    <MemoryRouter initialEntries={[`/events/${row.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetails />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 1, name: row.title })
  return view
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('the Time row', () => {
  it('is shown when the event has a time', async () => {
    const { container } = await show({ ...BASE, event_time: '14:00:00' })
    expect(screen.getByText('Time:')).toBeInTheDocument()
    expect(container.querySelector('.event-details-meta').textContent)
      .toContain('Time:')
    expect(container.querySelector('.event-details-meta').textContent)
      .toContain('2:00 PM')
  })

  // ⚠️ THE ONE THIS EXISTS FOR. `events.event_time` is NULL on every row
  // in the live table, so before this every event's detail page read
  // "Time:" with nothing after it -- which looks like a value that
  // failed to load rather than one that was never recorded.
  it('is GONE, label and all, when the time is null', async () => {
    const { container } = await show({ ...BASE, event_time: null })
    expect(screen.queryByText('Time:')).toBeNull()
    expect(container.querySelector('.event-details-meta').textContent)
      .not.toContain('Time')
  })

  it('is gone for an empty string and for whitespace', async () => {
    for (const value of ['', '   ', '\t']) {
      const { container, unmount } = await show({ ...BASE, event_time: value })
      expect(screen.queryByText('Time:')).toBeNull()
      expect(container.querySelector('.event-details-meta').textContent)
        .not.toContain('Time')
      unmount()
    }
  })

  it('is gone when the column is missing from the row altogether', async () => {
    const { event_time: _omitted, ...noColumn } = { ...BASE, event_time: null }
    const { container } = await show(noColumn)
    expect(container.querySelector('.event-details-meta').textContent)
      .not.toContain('Time')
  })
})

describe('everything else on the page', () => {
  // ⚠️ The location is NOT touched, and nothing is dug out of it. Three
  // legacy rows begin their location with a time -- the row below is
  // one of them -- and that string stays exactly as somebody typed it,
  // under Location, with no Time row invented from it.
  it('leaves a location that begins with a time exactly as stored', async () => {
    const legacy = { ...BASE, event_time: null, location: '2:00 PM - Main Covered Court' }
    const { container } = await show(legacy)
    const meta = container.querySelector('.event-details-meta').textContent
    expect(meta).toContain('Location:')
    expect(meta).toContain('2:00 PM - Main Covered Court')
    expect(meta).not.toContain('Time:')
  })

  it('keeps the location unchanged when there IS a time', async () => {
    const { container } = await show({ ...BASE, event_time: '08:30:00' })
    const meta = container.querySelector('.event-details-meta').textContent
    expect(meta).toContain('Location:')
    expect(meta).toContain('Barangay Covered Court')
  })

  it('keeps the date, the title and the description', async () => {
    const { container } = await show({ ...BASE, event_time: null })
    expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toBe('Senior Christmas Party')
    expect(container.querySelector('.event-details-meta').textContent)
      .toContain('Date:')
    expect(container.querySelector('.event-details-meta').textContent)
      .toContain('2026-12-13')
    expect(screen.getByText('Open to every senior citizen of the barangay.'))
      .toBeInTheDocument()
  })

  it('still says so when there is no description', async () => {
    await show({ ...BASE, event_time: null, description: null })
    await waitFor(() =>
      expect(screen.getByText('No event description available.')).toBeInTheDocument())
  })
})
