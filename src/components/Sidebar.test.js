// The Sidebar's ROLE SELECTION, and the one thing that must stay true of
// it: an unknown role gets NO privileged navigation.
//
// ⚠️ THIS IS THE FIRST TEST THIS COMPONENT HAS EVER HAD. The nav
// selection was a ternary chain whose final `else` was
// `officialNavItems`, so every value that was not 'nurse' or 'resident'
// -- null, undefined, '', a future fourth role, 'constructor' -- was
// shown all twelve Official tabs. It was not reachable from the shipped
// app (all three dashboards pass a string literal, and ProtectedRoute
// redirects an unrecognised role to /login before a dashboard mounts),
// which is exactly why it was never noticed: a latent fail-OPEN default
// waiting for the day somebody adds a fourth role.
//
// ⚠️ This is a UI fail-safe, NOT an RLS fix. The database decides every
// read and write whatever navigation is painted; a nav item a role may
// not use leads to a tab that returns nothing. What this suite protects
// is the direction of the default.
//
// ⚠️ Supabase is mocked at the module level, the pattern
// Announcements.test.js and Events.test.js established: the real
// `supabaseClient.js` throws at import time when the env vars are
// missing, and `jest.mock` is hoisted above the imports, so the real
// module never executes and this suite runs without `.env`. AuthContext
// is mocked for the same reason -- the real provider subscribes to auth
// state on mount, which is the chrome's own suite's business.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { signOut: jest.fn() } },
}))

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}))

const { supabase } = require('../supabase/supabaseClient')
const { useAuth } = require('../context/AuthContext')

// ⚠️ The implementations are installed per test, not in the factory.
// CRA 5's Jest preset sets `resetMocks: true`, so an implementation
// given inside `jest.mock` is wiped before the first test runs and
// `supabase.from(...)` comes back undefined -- which presents as a
// TypeError deep inside the component rather than as a mock problem.
// Announcements.test.js sets its return value in `beforeEach` for the
// same reason.
// ⚠️ jsdom implements no `window.matchMedia`, and the Sidebar calls it
// on mount to close the drawer when the viewport grows past the desktop
// breakpoint. Without this stub every test in the file fails with
// `window.matchMedia is not a function` -- including the three
// known-role ones, which is how it was told apart from a defect: a
// fifty-of-fifty failure is a harness fault, not a fifty-fold bug.
//
// `matches: false` is the MOBILE side of `(min-width: 769px)`, so the
// drawer stays open once opened and the drawer tests below are
// meaningful.
beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

beforeEach(() => {
  useAuth.mockReturnValue({ user: { id: 'u1' } })
  // Nothing resolves: the account has no name, no position and no
  // photo. The identity block renders its own placeholders, which is
  // what an unresolved profile looks like today and is not this
  // suite's subject.
  supabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
  })
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  supabase.auth.signOut.mockResolvedValue({ error: null })
})

// The label sets, written out rather than imported, so a change to the
// component's own arrays has to be made here too deliberately.
const OFFICIAL_ONLY = [
  'Announcements', 'Waste Management', 'Officials Directory',
  'Residents', 'Voter Reference List', 'Reports', 'Activity Log',
]
const NURSE_ONLY = ['Medicines', 'Availability', 'Health Events']
// ⚠️ 'Complaints' LEFT THIS LIST IN P3-B2, and it was removed rather
// than the assertion loosened: the Official Portal now has a Complaints
// tab of its own, so the label is no longer evidence that the resident
// nav was substituted. 'My Reservations' still is -- it exists in
// exactly one of the three arrays -- which is what this set is for.
const RESIDENT_ONLY = ['My Reservations']

const renderSidebar = (role) => render(
  <MemoryRouter>
    <Sidebar role={role} activeTab="dashboard" setActiveTab={() => {}} />
  </MemoryRouter>,
)

// The privileged destinations only. "Back to Home" carries
// `.sidebar-nav-home` and is a public link, not a portal tab, so it is
// excluded -- otherwise the resident's count would be four items and
// five buttons. Queried by the component's own classes because that is
// what identifies a nav ITEM as opposed to the collapse toggle or the
// Logout button, which are buttons in the same rail.
const navItems = (container) => Array.from(
  container.querySelectorAll('#sidebar-nav .sidebar-nav-item:not(.sidebar-nav-home)'),
).map((button) => button.getAttribute('aria-label'))

const drawerItems = (container) => Array.from(
  container.querySelectorAll(
    '#nav-drawer .nav-drawer-item:not(.nav-drawer-home):not(.nav-drawer-logout)',
  ),
).map((button) => button.textContent.trim())

describe('A. role="official"', () => {
  // ⚠️ SIXTEEN SINCE COMBINED PHASE 2, and the list is written out in
  // full so a tab cannot be added or lost without this being changed on
  // purpose. It was twelve from the day the Punong Barangay Status tab
  // was folded into the overview, thirteen with Complaints (P3-B2), and
  // sixteen with Incidents & Blotter, Tanod Operations and Safety Map &
  // Analytics.
  //
  // ⚠️ A DEFINITION CHANGE, NOT A LOOSENED ASSERTION: the guard still
  // compares the WHOLE list by equality, so a fourteenth surface added
  // without a decision still fails here.
  it('renders the sixteen Official destinations', () => {
    const { container } = renderSidebar('official')
    expect(navItems(container)).toEqual([
      'Dashboard', 'Announcements', 'Events', 'Reservations',
      'Document Requests', 'Complaints',
      'Incidents & Blotter', 'Tanod Operations', 'Safety Map & Analytics',
      'Waste Management',
      'Officials Directory', 'Residents', 'Voter Reference List',
      'Reports', 'Activity Log', 'Settings',
    ])
  })

  it('does not substitute the Nurse navigation', () => {
    const { container } = renderSidebar('official')
    NURSE_ONLY.forEach((label) => expect(navItems(container)).not.toContain(label))
  })

  it('does not substitute the Resident navigation', () => {
    const { container } = renderSidebar('official')
    RESIDENT_ONLY.forEach((label) => expect(navItems(container)).not.toContain(label))
  })

  it('names the portal as the Official Portal', () => {
    renderSidebar('official')
    expect(screen.getByRole('complementary', { name: 'Official Portal sidebar' })).toBeInTheDocument()
  })
})

describe('B. role="nurse"', () => {
  it('renders the five Health Center destinations', () => {
    const { container } = renderSidebar('nurse')
    expect(navItems(container)).toEqual([
      'Dashboard', 'Medicines', 'Availability', 'Health Events', 'Settings',
    ])
  })

  it('renders no Official destination', () => {
    const { container } = renderSidebar('nurse')
    OFFICIAL_ONLY.forEach((label) => expect(navItems(container)).not.toContain(label))
  })

  it('names the portal as the Health Center Portal', () => {
    renderSidebar('nurse')
    expect(screen.getByRole('complementary', { name: 'Health Center Portal sidebar' })).toBeInTheDocument()
  })
})

describe('C. role="resident"', () => {
  it('renders the five Resident destinations', () => {
    const { container } = renderSidebar('resident')
    expect(navItems(container)).toEqual([
      // ⚠️ `Complaints` was added by P3-B1, which also added
      // 'complaints' to RESIDENT_TABS -- residentTabs.test.js is what
      // holds those two arrays together.
      'Dashboard', 'Document Requests', 'My Reservations', 'Complaints', 'Settings',
    ])
  })

  it('renders no Official destination', () => {
    const { container } = renderSidebar('resident')
    OFFICIAL_ONLY.forEach((label) => expect(navItems(container)).not.toContain(label))
  })

  it('keeps Back to Home, which is a public link rather than a portal tab', () => {
    renderSidebar('resident')
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeInTheDocument()
  })
})

// ── The fail-safe ────────────────────────────────────────────────────
//
// ⚠️ EVERY CASE BELOW FAILS AGAINST THE PRE-FIX TERNARY, because its
// final `else` handed each of these the twelve Official items. That is
// the proof the suite is worth having: measured, not assumed.

const unsupported = [
  ['D. an arbitrary unknown value', 'lupon-secretary'],
  ['E. null', null],
  ['F. undefined', undefined],
  ['G. the empty string', ''],
  ['H. "tanod" -- a future fourth role', 'tanod'],
  ['I. "constructor" -- an inherited property name', 'constructor'],
]

describe.each(unsupported)('%s', (_name, role) => {
  it('renders ZERO privileged navigation items', () => {
    const { container } = renderSidebar(role)
    expect(navItems(container)).toEqual([])
  })

  it('renders no Official destination in particular', () => {
    const { container } = renderSidebar(role)
    OFFICIAL_ONLY.forEach((label) => expect(navItems(container)).not.toContain(label))
  })

  it('shows the explanatory empty state rather than an empty rail', () => {
    renderSidebar(role)
    expect(
      screen.getByText('Dashboard navigation is unavailable for this account.'),
    ).toBeInTheDocument()
  })

  it('keeps Logout reachable', () => {
    renderSidebar(role)
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('does not claim to be the Official Portal', () => {
    const { container } = renderSidebar(role)
    expect(container.querySelector('.sidebar')).not.toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Official Portal sidebar' })).toBeNull()
  })

  it('offers no Back to Home either, which only the Resident portal has', () => {
    renderSidebar(role)
    expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull()
  })
})

// ── The other role-dependent branches ───────────────────────────────
//
// The nav and the portal name were the two that failed OPEN. The rest
// were inspected and already fail closed; these pin the one that does
// something privileged, so a later edit cannot turn the identity lookup
// into another permissive default.

describe('the privileged identity lookup', () => {
  // ⚠️ `fetchProfile` only reaches the RPC inside
  // `if (profile?.full_name)`, so the default fixture above -- which
  // resolves no profile -- never calls it for ANY role. The first
  // version of these three tests used that fixture and reported "not
  // called" for the official too, which reads as a regression and is a
  // test with the wrong premise. A named profile is what makes the
  // negative cases mean anything.
  beforeEach(() => {
    supabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { full_name: 'Alexis Theress P. Tan', photo_url: null },
            error: null,
          }),
        }),
      }),
    })
  })

  it('resolves the official directory row for an official', async () => {
    renderSidebar('official')
    await screen.findByRole('complementary', { name: 'Official Portal sidebar' })
    expect(supabase.rpc).toHaveBeenCalledWith('official_id_for_current_user')
  })

  it('is not attempted for a nurse or a resident', async () => {
    renderSidebar('nurse')
    await screen.findByRole('complementary', { name: 'Health Center Portal sidebar' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('is not attempted for an unsupported role', async () => {
    renderSidebar('tanod')
    await screen.findByText('Dashboard navigation is unavailable for this account.')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

// ── The Main Menu heading ───────────────────────────────────────────

describe('the Main Menu heading', () => {
  it('is present when there are destinations under it', () => {
    renderSidebar('official')
    expect(screen.getByText('Main Menu')).toBeInTheDocument()
  })

  it('is absent when there are none, rather than heading an empty list', () => {
    renderSidebar('tanod')
    expect(screen.queryByText('Main Menu')).toBeNull()
  })
})

// ── The mobile drawer reads the same array ───────────────────────────
//
// One `navItems` definition feeds both the rail and the drawer, so the
// drawer cannot disagree with the desktop nav about what a role may
// reach -- asserted rather than left to the reading, because the drawer
// is the WHOLE of navigation on a phone.

describe('the mobile drawer', () => {
  const openDrawer = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  }

  it('offers the Official destinations to an official', async () => {
    const { container } = renderSidebar('official')
    await openDrawer()
    expect(drawerItems(container)).toHaveLength(16)
    expect(drawerItems(container)).toContain('Officials Directory')
    // The drawer is the WHOLE of navigation on a phone, so a tab that
    // reaches the rail and not the drawer is unreachable there.
    expect(drawerItems(container)).toContain('Complaints')
    expect(drawerItems(container)).toContain('Incidents & Blotter')
    expect(drawerItems(container)).toContain('Tanod Operations')
    expect(drawerItems(container)).toContain('Safety Map & Analytics')
  })

  // ⚠️ THE PROBE ROLE IS 'tanod', AND COMBINED PHASE 2 MAKES THAT POINTED
  // RATHER THAN ARBITRARY. That phase adds a Tanod roster, a patrol
  // schedule and an operations tab -- and NO `tanod` account, no login and
  // no fourth value in `profiles_role_check`. So a session claiming to be
  // one is still an unrecognised role, and still gets nothing.
  it('offers ZERO privileged destinations to an unknown role', async () => {
    const { container } = renderSidebar('tanod')
    await openDrawer()
    expect(drawerItems(container)).toEqual([])
  })

  it('keeps Logout reachable in the drawer for an unknown role', async () => {
    const { container } = renderSidebar('tanod')
    await openDrawer()
    expect(container.querySelector('.nav-drawer-logout')).not.toBeNull()
  })

  it('shows the explanatory empty state in the drawer too', async () => {
    renderSidebar('tanod')
    await openDrawer()
    // Once in the rail, once in the drawer -- both are mounted, and the
    // rail is hidden by CSS rather than unmounted.
    expect(
      screen.getAllByText('Dashboard navigation is unavailable for this account.'),
    ).toHaveLength(2)
  })
})

// ── Accessibility and keyboard, for the state this change adds ───────
//
// Not a redesign and not a full audit -- X3 already did the sweep. These
// cover the things THIS change could have broken: the landmark's
// accessible name (it is built from `portalName`, which the fix
// changes), `aria-controls` still resolving (the nav must still render
// when it holds no items, or the collapse toggle points at nothing),
// Escape, focus restoration, and Logout being a real focusable control
// in the state with no navigation.

describe('accessibility in the unsupported-role state', () => {
  it('still exposes the complementary landmark, with a neutral name', () => {
    renderSidebar('tanod')
    const rail = screen.getByRole('complementary', { name: 'Dashboard sidebar' })
    expect(rail).toBeInTheDocument()
  })

  it('keeps the collapse toggle pointing at an element that EXISTS', () => {
    const { container } = renderSidebar('tanod')
    const toggle = container.querySelector('.sidebar-collapse-toggle')
    const id = toggle.getAttribute('aria-controls')
    expect(id).toBe('sidebar-nav')
    // The same check Navbar.test.js makes of the public menu button. The
    // nav element must survive having no items in it.
    expect(container.querySelector(`#${id}`)).not.toBeNull()
  })

  it('keeps Logout focusable, outside the nav', () => {
    const { container } = renderSidebar('tanod')
    const logout = screen.getByRole('button', { name: 'Logout' })
    logout.focus()
    expect(document.activeElement).toBe(logout)
    // In the footer, not in the nav -- which is why an empty nav cannot
    // take it with it.
    expect(container.querySelector('#sidebar-nav .sidebar-logout')).toBeNull()
  })

  it('opens the drawer, closes it on Escape and restores focus', async () => {
    renderSidebar('tanod')
    const menu = screen.getByRole('button', { name: 'Open navigation menu' })
    await userEvent.click(menu)

    const drawer = screen.getByRole('dialog', { name: 'Dashboard navigation' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(menu)
  })

  it('tracks the menu button\'s aria-expanded', async () => {
    renderSidebar('tanod')
    const menu = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
  })

  it('leaves the three supported portals\' landmark names unchanged', () => {
    renderSidebar('official')
    expect(screen.getByRole('complementary', { name: 'Official Portal sidebar' })).toBeInTheDocument()
  })
})
