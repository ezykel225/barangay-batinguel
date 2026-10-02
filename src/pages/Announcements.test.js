// The /announcements browse page, and the one thing that must stay
// true of it: the CARD shows an excerpt and the DETAIL page shows the
// whole notice.
//
// ⚠️ Supabase is mocked at the module level rather than stood up. The
// real `supabaseClient.js` throws at import time when the env vars are
// missing, which is why `App.test.js` needs `.env` and the rest of the
// suite does not -- `jest.mock` is hoisted above the imports, so the
// real module never executes and this suite keeps that property.
//
// Navbar and Footer are stubbed too. They have their own suites
// (Navbar.test.js, EServicesMenu.test.js) and Navbar pulls in
// AuthContext, which subscribes to auth state on mount. Standing that
// up here would test the chrome, not the page.

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Announcements from './Announcements'
import AnnouncementDetails from './AnnouncementDetails'
import { EXCERPT_MAX_CHARS } from '../utils/homeSections'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')

// The live row that caused this: a 616-character body on the browse
// page, beside a 10-character one.
const LONG_BODY = 'The barangay council will hold a general assembly at the covered court. '.repeat(30)

const ROWS = [
  {
    id: 'a1', title: 'General Assembly', badge: 'Notice', description: LONG_BODY, date_posted: '2026-09-28T00:00:00Z',
  },
  {
    id: 'a2', title: 'Defense Day', badge: 'asdasd', description: 'Short one.', date_posted: '2026-05-28T00:00:00Z',
  },
]

const listQuery = (rows) => ({
  select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
})

const detailQuery = (row) => ({
  select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
})

describe('the announcements browse page', () => {
  beforeEach(() => {
    supabase.from.mockReset()
    supabase.from.mockReturnValue(listQuery(ROWS))
  })

  it('renders one card per announcement', async () => {
    render(<MemoryRouter><Announcements /></MemoryRouter>)
    expect(await screen.findByText('General Assembly')).toBeInTheDocument()
    expect(screen.getByText('Defense Day')).toBeInTheDocument()
  })

  // ⚠️ THE LOAD-BEARING ONE. The card printed the whole body, so one
  // long notice made its card 1,293px tall and the cards beside it were
  // padded to match.
  it('shows an EXCERPT on the card, not the whole notice', async () => {
    const { container } = render(<MemoryRouter><Announcements /></MemoryRouter>)
    await screen.findByText('General Assembly')

    const excerpts = container.querySelectorAll('.announcement-card-excerpt')
    expect(excerpts).toHaveLength(2)

    const long = excerpts[0].textContent
    expect(LONG_BODY.length).toBeGreaterThan(2000)
    expect(long.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS + 3)
    expect(long.endsWith('...')).toBe(true)
    expect(container.textContent).not.toContain(LONG_BODY.trim())
  })

  // A short announcement is not padded out or cut -- it reads exactly
  // as stored.
  it('leaves a short announcement alone', async () => {
    const { container } = render(<MemoryRouter><Announcements /></MemoryRouter>)
    await screen.findByText('Defense Day')
    const excerpts = container.querySelectorAll('.announcement-card-excerpt')
    expect(excerpts[1].textContent).toBe('Short one.')
  })

  // The long card must still have every part a card has. The defect
  // this guards is a card whose date and affordance get pushed a
  // thousand pixels below the fold by its own body text.
  it('keeps the whole card structure on the long announcement', async () => {
    const { container } = render(<MemoryRouter><Announcements /></MemoryRouter>)
    await screen.findByText('General Assembly')
    const card = container.querySelectorAll('.announcement-card')[0]
    expect(card.querySelector('.announcement-card-image')).toBeTruthy()
    expect(card.querySelector('.announcement-badge').textContent).toBe('Notice')
    expect(card.querySelector('h2').textContent).toBe('General Assembly')
    expect(card.querySelector('.announcement-card-excerpt')).toBeTruthy()
    expect(card.querySelector('.announcement-card-date').textContent).toMatch(/2026/)
    expect(card.querySelector('.announcement-card-more')).toBeTruthy()
  })

  // ⚠️ The whole card is ONE link. "Read announcement →" is a <span>
  // inside it, because an <a> inside an <a> is invalid HTML and would
  // give a keyboard user a second stop for the same destination.
  it('is one link per card, with no nested anchor', async () => {
    const { container } = render(<MemoryRouter><Announcements /></MemoryRouter>)
    await screen.findByText('General Assembly')
    const link = container.querySelectorAll('.announcement-card-link')[0]
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/announcements/a1')
    expect(link.querySelectorAll('a')).toHaveLength(0)
  })

  // The intro block: exactly one <h1>, and the icon is NOT part of its
  // accessible name.
  it('has one h1 naming the page, with no icon inside it', async () => {
    render(<MemoryRouter><Announcements /></MemoryRouter>)
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe('All Announcements')
    expect(headings[0].querySelector('svg')).toBeNull()
  })

  it('says so plainly when there is nothing to show', async () => {
    supabase.from.mockReturnValue(listQuery([]))
    render(<MemoryRouter><Announcements /></MemoryRouter>)
    expect(await screen.findByText('No announcements yet.')).toBeInTheDocument()
  })
})

describe('the announcement detail page', () => {
  // ⚠️ THE OTHER HALF. Shortening the card must not shorten the page
  // the card leads to -- both read the same `description` column.
  it('still renders the FULL notice', async () => {
    supabase.from.mockReturnValue(detailQuery(ROWS[0]))
    const { container } = render(
      <MemoryRouter initialEntries={['/announcements/a1']}>
        <Routes>
          <Route path="/announcements/:id" element={<AnnouncementDetails />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(container.textContent).toContain(LONG_BODY.trim()))
    expect(container.querySelector('.announcement-card-excerpt')).toBeNull()
  })
})
