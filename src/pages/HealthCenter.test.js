// The public Health Center's "Bakuna & Health Events" card.
//
// This suite exists for one regression, found during the MASTER-B B3
// browser smoke test and PRE-EXISTING -- the query read
// `.order('event_date', { ascending: true }).limit(3)` with no date
// filter, so the three OLDEST rows in the table won the three slots.
// On the live table that was the two 2024 rows plus 15 October 2026,
// and the 20 October 2026 event the nurse had just published was row
// four and was dropped by SQL before any filtering could happen.
//
// ⚠️ Supabase is mocked at the module level, for the reason given at the
// top of Announcements.test.js: the real client throws at import time
// without the env vars, and `jest.mock` is hoisted above the imports so
// it never runs. Navbar and Footer are stubbed; they have their own
// suites.

import { render, screen, within } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import HealthCenter from './HealthCenter'
import { manilaToday } from '../utils/displayLabels'
import { parseDateKey } from '../utils/monthGrid'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')

// ⚠️ Every fixture date is built relative to the Manila date, so the
// suite cannot start failing next month for a reason that has nothing
// to do with the code. `manilaToday` is the project's one answer to
// "what day is it", and it is what `upcomingEvents` compares against.
const { year: THIS_YEAR } = parseDateKey(manilaToday())
const TODAY = manilaToday()
const past = (yearsAgo, md) => `${THIS_YEAR - yearsAgo}-${md}`
const future = (yearsAhead, md) => `${THIS_YEAR + yearsAhead}-${md}`

const row = (id, title, event_date, extra = {}) => ({
  id,
  title,
  description: `${title} description.`,
  event_date,
  event_time: null,
  // ⚠️ The denormalised display copies are deliberately WRONG on some
  // fixtures below, to prove the card reads `event_date`.
  event_month: 'XXX',
  event_day: '99',
  location: 'Barangay Batinguel Health Center',
  target_audience: 'All Residents',
  ...extra,
})

// Records what each table's query chain was asked to do, so the suite
// can assert the absence of `.limit()` on the health-event read as well
// as the presence of the filter.
let calls

// One chainable stand-in for every shape the page uses: `.select()`
// bare and awaited, `.select().eq().limit()`, and
// `.select().order().order()`. It is thenable, so `await` resolves it
// wherever the chain stops.
const makeChain = (table, rows) => {
  const result = { data: rows, error: null }
  const chain = {}
  const note = (method) => (...args) => {
    calls[table] = calls[table] || { select: 0, eq: 0, order: [], limit: [] }
    if (method === 'order' || method === 'limit') calls[table][method].push(args)
    else calls[table][method] += 1
    return chain
  }
  chain.select = note('select')
  chain.eq = note('eq')
  chain.order = note('order')
  chain.limit = note('limit')
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

const renderPage = async (healthEventRows) => {
  calls = {}
  supabase.from.mockImplementation((table) => {
    if (table === 'health_events') return makeChain('health_events', healthEventRows)
    if (table === 'nurse_availability') return makeChain('nurse_availability', [])
    if (table === 'medicine_stock') return makeChain('medicine_stock', [])
    return makeChain(table, [])
  })

  const view = render(<HealthCenter />)
  // The card's own heading is present from the first paint; waiting for
  // the loading line to GO is what proves the fetch resolved.
  await screen.findByRole('heading', { name: /bakuna & health events/i })
  await screen.findByText(
    (_, node) => node?.className === 'health-bakuna-card',
    { selector: '.health-bakuna-card' },
  ).catch(() => {})
  return view
}

// The card element, so every assertion is scoped to this section rather
// than to the whole page -- "Community Health Checkup" could appear in
// a programme list elsewhere.
const bakunaCard = () =>
  screen.getByRole('heading', { name: /bakuna & health events/i }).closest('.health-bakuna-card')

const cardTitles = () =>
  Array.from(bakunaCard().querySelectorAll('.bakuna-card-body h4')).map((h) => h.textContent)

const settle = async () => {
  // The three fetches resolve on microtasks; one findByText against a
  // known terminal state is enough to flush them.
  await screen.findByTestId('footer')
  await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('Health Center -> Bakuna & Health Events', () => {
  // ─── A. past + upcoming mixed ──────────────────────────────────────
  test('excludes past events and shows the upcoming ones', async () => {
    await renderPage([
      row('p1', 'Childhood Immunization', past(2, '11-05')),
      row('p2', 'Dengue Awareness Seminar', past(2, '11-12')),
      row('u1', 'Community Health Checkup', future(1, '03-15')),
      row('u2', 'Free Blood Pressure Screening', future(1, '03-20')),
    ])
    await settle()

    expect(cardTitles()).toEqual([
      'Community Health Checkup',
      'Free Blood Pressure Screening',
    ])
    // Both directions: the upcoming rows are present AND the past rows
    // are absent. Asserting only the former would pass on a page that
    // still showed all four.
    expect(within(bakunaCard()).queryByText('Childhood Immunization')).toBeNull()
    expect(within(bakunaCard()).queryByText('Dengue Awareness Seminar')).toBeNull()
  })

  test('an event dated TODAY is upcoming, not past', async () => {
    // ⚠️ The project's rule, shared with `upcomingEvents` and the Home
    // page: a session this afternoon has not happened yet.
    await renderPage([row('t1', 'Screening Today', TODAY)])
    await settle()
    expect(cardTitles()).toEqual(['Screening Today'])
  })

  // ─── B. more than three upcoming ───────────────────────────────────
  test('shows the three EARLIEST upcoming events when more exist', async () => {
    await renderPage([
      row('u4', 'Fourth Session', future(1, '06-01')),
      row('u2', 'Second Session', future(1, '04-01')),
      row('u1', 'First Session', future(1, '03-01')),
      row('u3', 'Third Session', future(1, '05-01')),
      row('p1', 'Old Session', past(1, '01-01')),
    ])
    await settle()

    expect(cardTitles()).toEqual(['First Session', 'Second Session', 'Third Session'])
    expect(within(bakunaCard()).queryByText('Fourth Session')).toBeNull()
    expect(within(bakunaCard()).queryByText('Old Session')).toBeNull()
  })

  // ─── C. only two upcoming ──────────────────────────────────────────
  test('shows exactly two when only two are upcoming, and no past event fills slot three', async () => {
    await renderPage([
      row('p1', 'Past One', past(2, '11-05')),
      row('p2', 'Past Two', past(2, '11-12')),
      row('p3', 'Past Three', past(1, '02-02')),
      row('u1', 'Upcoming One', future(1, '03-15')),
      row('u2', 'Upcoming Two', future(1, '03-20')),
    ])
    await settle()

    const titles = cardTitles()
    expect(titles).toEqual(['Upcoming One', 'Upcoming Two'])
    // The load-bearing half: THREE past events were available to pad
    // the row out and none of them was used.
    expect(titles).toHaveLength(2)
    expect(bakunaCard().querySelectorAll('.bakuna-card')).toHaveLength(2)
    ;['Past One', 'Past Two', 'Past Three'].forEach((t) => {
      expect(within(bakunaCard()).queryByText(t)).toBeNull()
    })
  })

  test('shows exactly one when only one is upcoming', async () => {
    await renderPage([
      row('p1', 'Past One', past(2, '11-05')),
      row('u1', 'Only Upcoming', future(1, '03-15')),
    ])
    await settle()
    expect(cardTitles()).toEqual(['Only Upcoming'])
  })

  // ─── D. zero upcoming ──────────────────────────────────────────────
  test('shows the empty state when nothing is upcoming, rather than historical events', async () => {
    await renderPage([
      row('p1', 'Childhood Immunization', past(2, '11-05')),
      row('p2', 'Dengue Awareness Seminar', past(2, '11-12')),
    ])
    await settle()

    expect(
      within(bakunaCard()).getByText(/no upcoming health events at the moment/i),
    ).toBeInTheDocument()
    expect(bakunaCard().querySelectorAll('.bakuna-card')).toHaveLength(0)
    // ⚠️ The past rows existed and were still not used to fill the card.
    expect(within(bakunaCard()).queryByText('Childhood Immunization')).toBeNull()
  })

  test('the empty state says UPCOMING, not that the table is empty', async () => {
    await renderPage([])
    await settle()
    // Both directions: the new wording is present and the old wording,
    // which claimed there were no health events at all, is gone.
    expect(
      within(bakunaCard()).getByText(/no upcoming health events at the moment/i),
    ).toBeInTheDocument()
    expect(within(bakunaCard()).queryByText(/no health events yet/i)).toBeNull()
  })

  // ─── E. the date shows the year ────────────────────────────────────
  test('each card shows the year, derived from event_date', async () => {
    const nextYear = String(THIS_YEAR + 1)
    await renderPage([row('u1', 'Screening', future(1, '03-20'))])
    await settle()

    const tile = bakunaCard().querySelector('.bakuna-card-date')
    expect(tile.querySelector('.year')).not.toBeNull()
    expect(tile.querySelector('.year').textContent).toBe(nextYear)
    expect(tile.textContent).toContain(nextYear)
  })

  test('the month and day come from event_date, NOT from the stored display copies', async () => {
    // The fixture carries event_month 'XXX' / event_day '99', which is
    // what the card used to print. `event_date` is the date.
    await renderPage([row('u1', 'Screening', future(1, '03-20'))])
    await settle()

    const tile = bakunaCard().querySelector('.bakuna-card-date')
    expect(tile.querySelector('.month').textContent).toBe('MAR')
    expect(tile.querySelector('.day').textContent).toBe('20')
    expect(tile.textContent).not.toContain('XXX')
    expect(tile.textContent).not.toContain('99')
  })

  test('two years apart are distinguishable on the cards', async () => {
    // The exact confusion that hid the defect: without a year, a
    // correctly sorted list read as though it were shuffled.
    await renderPage([
      row('u1', 'Earlier Year', future(1, '11-05')),
      row('u2', 'Later Year', future(2, '03-15')),
    ])
    await settle()

    const tiles = Array.from(bakunaCard().querySelectorAll('.bakuna-card-date'))
    expect(tiles[0].querySelector('.year').textContent).toBe(String(THIS_YEAR + 1))
    expect(tiles[1].querySelector('.year').textContent).toBe(String(THIS_YEAR + 2))
  })

  // ─── The anti-pattern guard ────────────────────────────────────────
  test('the health_events query applies NO SQL limit', async () => {
    await renderPage([
      row('u1', 'One', future(1, '03-01')),
      row('u2', 'Two', future(1, '04-01')),
      row('u3', 'Three', future(1, '05-01')),
      row('u4', 'Four', future(1, '06-01')),
    ])
    await settle()

    // ⚠️ This is the defect itself. A `.limit(3)` here would hand three
    // rows to a filter that needed all four, and the limiting must
    // happen AFTER the upcoming filter instead.
    expect(calls.health_events.limit).toEqual([])
    expect(calls.health_events.order).toEqual([['event_date', { ascending: true }]])
    // And the limiting still happens -- four upcoming, three shown.
    expect(cardTitles()).toHaveLength(3)
  })

  test('a row with no usable date is not announced as upcoming', async () => {
    await renderPage([
      row('bad', 'No Date Recorded', null),
      row('u1', 'Real Session', future(1, '03-15')),
    ])
    await settle()
    // Putting it under a heading promising upcoming sessions would
    // assert a date the row does not have.
    expect(cardTitles()).toEqual(['Real Session'])
  })
})

// ─── Source-reading guards ───────────────────────────────────────────
//
// The behaviour above could be right while being wired to a second,
// local copy of the date rule. These pin the wiring, in the style of
// `officialIdentity.test.js`.
describe('Health Center source wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, 'HealthCenter.jsx'), 'utf8')
  // Comments quote the expression they document removing, so a scan
  // over raw source would match the very thing it is checking for.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  test('uses the shared upcomingEvents helper', () => {
    expect(code).toMatch(/import\s*\{[^}]*upcomingEvents[^}]*\}\s*from\s*'\.\.\/utils\/eventCalendar'/)
    expect(code).toMatch(/upcomingEvents\(\s*data\s*\|\|\s*\[\]/)
  })

  test('uses the shared eventCardDate helper for the card date', () => {
    expect(code).toMatch(/import\s*\{[^}]*eventCardDate[^}]*\}\s*from\s*'\.\.\/utils\/eventCalendar'/)
    expect(code).toMatch(/eventCardDate\(event\)/)
  })

  test('does not duplicate the date rule locally', () => {
    // No local "is this in the future" comparison, and no second
    // definition of today -- `upcomingEvents` owns both.
    expect(code).not.toMatch(/manilaToday\s*\(/)
    expect(code).not.toMatch(/event_date\s*>=|>=\s*.{0,12}event_date/)
    expect(code).not.toMatch(/new Date\(\s*\w*\.?event_date/)
  })

  test('the health_events read carries no .limit(', () => {
    // Scoped to the health-event fetch, because the nurse-status read
    // legitimately uses .limit(1) for a single current row.
    const fetchBlock = code.slice(
      code.indexOf("from('health_events')"),
      code.indexOf("from('health_events')") + 420,
    )
    expect(fetchBlock).toContain("order('event_date'")
    expect(fetchBlock).not.toContain('.limit(')
  })

  test('the card does not read event_month/event_day for display', () => {
    expect(code).not.toMatch(/\{\s*event\.event_month\s*\}/)
    expect(code).not.toMatch(/\{\s*event\.event_day\s*\}/)
  })
})
