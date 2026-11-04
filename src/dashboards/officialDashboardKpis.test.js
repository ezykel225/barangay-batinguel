// The Official Dashboard's four summary cards.
//
// Two defects, both on the overview:
//   1. The grid wrapper was renamed to `stats-grid` (c2ba52d), a class no
//      stylesheet defines, so the cards fell back to block flow and stacked.
//   2. Active Residents filtered `profiles` rows on `resident_status`, a column
//      profiles does not have (it lives on barangay_residents, migration 054),
//      so it read 0 for every barangay -- and a failed read read 0 too.
//
// jsdom has no layout, so the grid itself is pinned from the stylesheet and the
// rendered structure; the column counts were measured in a real browser.
import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'fs'
import path from 'path'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import OfficialDashboard from './OfficialDashboard'
import { countActiveResidents, directorySummary, isActiveDirectoryResident } from '../residents/residentPresentation'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }))
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../components/Sidebar', () => () => null)
jest.mock('../components/NotificationBell', () => () => null)
jest.mock('../components/useNotifications', () => ({ useNotifications: () => ({ notifications: [], readIds: new Set(), badges: {}, refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }) }))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))

const css = fs.readFileSync(path.join(__dirname, 'OfficialDashboard.css'), 'utf8')
const source = fs.readFileSync(path.join(__dirname, 'OfficialDashboard.jsx'), 'utf8')

const LABELS = ['Announcements', 'Upcoming Events', 'Pending Document Requests', 'Active Residents']

// Five resident ACCOUNTS (profiles) and a directory of four records, three of
// them active. The two numbers differ on purpose: the card must read the
// directory, never the account list.
const PROFILES = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, full_name: `Resident ${i}`, verification_status: 'verified', role: 'resident' }))
const DIRECTORY = [
  { id: 'r1', first_name: 'Ana', last_name: 'Uno', resident_status: 'active' },
  { id: 'r2', first_name: 'Ben', last_name: 'Dos', resident_status: 'active' },
  { id: 'r3', first_name: 'Cel', last_name: 'Tres', resident_status: 'inactive' },
  { id: 'r4', first_name: 'Dan', last_name: 'Cuatro', resident_status: 'active' },
]

let directoryResult, position, rpcCalls, fromTables
beforeEach(() => {
  jest.clearAllMocks()
  directoryResult = async () => ({ data: DIRECTORY, error: null })
  position = 'Kagawad'
  rpcCalls = []
  fromTables = []
  useAuth.mockReturnValue({ user: { id: 'staff' } })
  supabase.rpc.mockImplementation((name) => {
    rpcCalls.push(name)
    if (name === 'community_credit_resident_directory') return directoryResult()
    if (name === 'official_id_for_current_user') return Promise.resolve({ data: 'official-id', error: null })
    return Promise.resolve({ data: [], error: null })
  })
  supabase.from.mockImplementation((table) => {
    fromTables.push(table)
    const rows = {
      announcements: [{ id: 'a1' }, { id: 'a2' }],
      events: [{ id: 'e1', event_date: '2999-01-01' }, { id: 'e2', event_date: '2000-01-01' }],
      document_requests: [{ id: 'd1', status: 'pending' }, { id: 'd2', status: 'approved' }],
      profiles: PROFILES,
      barangay_officials: [{ id: 'official-id', full_name: 'Hon. Test', position: 'Punong Barangay' }],
    }[table] || []
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
      not: () => builder, is: () => builder, in: () => builder, gte: () => builder,
      single: async () => ({ data: table === 'kapitan_status' ? { status: 'available' } : { id: 'staff', full_name: 'Records Staff', role: 'official' }, error: null }),
      maybeSingle: async () => ({ data: { id: 'official-id', full_name: 'Records Staff', position }, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return builder
  })
})

const show = () => render(<MemoryRouter><OfficialDashboard /></MemoryRouter>)
const grid = () => document.querySelector('.dashboard-overview-top > .dashboard-stats')
const card = (label) => within(grid()).getByText(label, { selector: '.stat-card-label' }).closest('.stat-card')
const valueOf = (label) => card(label).querySelector('.stat-card-value').textContent.trim()

describe('structure', () => {
  test('the four cards sit in the grid the stylesheet defines, in order', async () => {
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
    expect(document.querySelector('.stats-grid')).toBeNull()
    const cards = grid().querySelectorAll(':scope > .stat-card')
    expect(cards).toHaveLength(4)
    expect([...cards].map((c) => c.querySelector('.stat-card-label').textContent)).toEqual(LABELS)
    cards.forEach((c) => {
      expect(c.querySelector('.stat-card-icon svg')).not.toBeNull()
      expect(c.querySelectorAll('.stat-card-value')).toHaveLength(1)
    })
  })

  test('no retired module comes back as a summary card', async () => {
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
    const text = grid().textContent
    for (const retired of [/reservation/i, /court/i, /health/i, /medicine/i, /waste/i, /voter/i, /nurse/i]) {
      expect(text).not.toMatch(retired)
    }
  })

  test('every class the KPI block renders is defined by a stylesheet', () => {
    const bundle = css + fs.readFileSync(path.join(__dirname, '../components/Sidebar.css'), 'utf8')
    for (const cls of ['dashboard-stats', 'stat-card', 'stat-card-header', 'stat-card-icon', 'stat-card-value', 'stat-card-label', 'stat-card-value-pending', 'stat-card-note']) {
      expect(bundle).toMatch(new RegExp(`\\.${cls}[\\s{,.:>]`))
    }
    expect(source).not.toMatch(/className="stats-grid"/)
  })
})

describe('responsive grid (stylesheet)', () => {
  const block = (pattern) => {
    const match = css.match(pattern)
    expect(match).not.toBeNull()
    return match[0]
  }

  test('columns follow the overview container, with a two-column default', () => {
    expect(block(/\.dashboard-overview-top\s*\{[^}]*\}(?=\s*\n\s*\.dashboard-overview-top > \.dashboard-stats)/)).toMatch(/container-type:\s*inline-size/)
    expect(block(/\n\.dashboard-overview-top > \.dashboard-stats\s*\{[^}]*\}/)).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/)
  })

  test('four columns from 840px of content, one column below 480px', () => {
    expect(block(/@container \(min-width: 840px\)\s*\{[^}]*\}/)).toMatch(/repeat\(4, minmax\(0, 1fr\)\)/)
    expect(block(/@container \(max-width: 479\.98px\)\s*\{[^}]*\}/)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/)
  })

  test('no bare 1fr track and no fixed card width in the new rules', () => {
    const start = css.indexOf('The four stat cards: columns follow the CONTENT width')
    const rules = css.slice(start, css.indexOf('.stat-card-note', start) + 200)
    expect(rules).not.toMatch(/repeat\(\d, 1fr\)/)
    // A plain `width:`, not the `min-width: 0` the cards need to shrink.
    expect(rules).not.toMatch(/[\s;{]width:\s*\d/)
  })

  test('the grid rule outranks Sidebar.css by specificity, not emission order', () => {
    expect(css).toMatch(/\n\.dashboard-overview-top > \.dashboard-stats \{/)
  })
})

describe('Active Residents', () => {
  test('counts ACTIVE directory records, not resident accounts', async () => {
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
    expect(valueOf('Active Residents')).not.toBe(String(PROFILES.length))
    expect(rpcCalls).toContain('community_credit_resident_directory')
    expect(rpcCalls).not.toContain('barangay_resident_directory')
    expect(fromTables).not.toContain('barangay_residents')
  })

  test('the other three cards keep their values', async () => {
    show()
    await waitFor(() => expect(valueOf('Announcements')).toBe('2'))
    expect(valueOf('Upcoming Events')).toBe('1')
    expect(valueOf('Pending Document Requests')).toBe('1')
  })

  test('says Loading... while the directory is being read, never 0', async () => {
    let release
    directoryResult = () => new Promise((resolve) => { release = resolve })
    show()
    await waitFor(() => expect(release).toBeDefined())
    expect(valueOf('Active Residents')).toBe('Loading...')
    release({ data: DIRECTORY, error: null })
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
  })

  test('a refused read says Unavailable, never 0', async () => {
    directoryResult = async () => ({ data: null, error: { code: '42501', message: 'Not authorized' } })
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('Unavailable'))
    expect(within(card('Active Residents')).getByRole('status')).toHaveTextContent('The resident directory could not be loaded.')
    expect(card('Active Residents').textContent).not.toMatch(/42501|Not authorized|community_credit/)
  })

  test('a thrown network error says Unavailable', async () => {
    directoryResult = async () => { throw new TypeError('Failed to fetch') }
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('Unavailable'))
  })

  test('a non-list answer is not read as an empty directory', async () => {
    directoryResult = async () => ({ data: null, error: null })
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('Unavailable'))
  })

  test('an empty directory is a real 0, shown as one', async () => {
    directoryResult = async () => ({ data: [], error: null })
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('0'))
    expect(card('Active Residents').querySelector('.stat-card-note')).toBeNull()
  })

  test('only inactive records also count 0, not Unavailable', async () => {
    directoryResult = async () => ({ data: [{ id: 'x', resident_status: 'inactive' }], error: null })
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('0'))
  })
})

describe('the count does not depend on the official position', () => {
  test.each(['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer', 'Kagawad'])('%s reads the same count through the same reader', async (held) => {
    position = held
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
    expect(rpcCalls.filter((n) => n.includes('resident_directory'))).toEqual(expect.arrayContaining(['community_credit_resident_directory']))
    expect(rpcCalls).not.toContain('barangay_resident_directory')
  })

  test('the Punong Barangay status control is still his alone', async () => {
    position = 'Punong Barangay'
    const { unmount } = show()
    expect(await screen.findByLabelText('Set your availability status')).toBeInTheDocument()
    unmount()
    position = 'Barangay Secretary'
    show()
    await waitFor(() => expect(valueOf('Active Residents')).toBe('3'))
    await waitFor(() => expect(document.querySelector('.kapitan-compact-state')).not.toBeNull())
    expect(screen.queryByLabelText('Set your availability status')).toBeNull()
  })
})

describe('one definition of an active resident', () => {
  test('the predicate, the counter and the Residents tab summary agree', () => {
    expect(countActiveResidents(DIRECTORY)).toBe(3)
    expect(directorySummary(DIRECTORY).find(([label]) => label === 'Active Residents')[1]).toBe(3)
    expect(isActiveDirectoryResident({ resident_status: 'active' })).toBe(true)
    for (const other of [{ resident_status: 'inactive' }, { resident_status: 'Active' }, {}, null, undefined, { verification_status: 'verified' }]) {
      expect(isActiveDirectoryResident(other)).toBe(false)
    }
  })

  test('the dashboard no longer filters profiles on resident_status', () => {
    expect(source).not.toMatch(/residentsList\.filter\([^)]*resident_status/)
    expect(source).toMatch(/countActiveResidents\(data\)/)
  })
})
