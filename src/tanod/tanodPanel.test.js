// Combined Phase 2 — the Tanod roster and the patrol schedule, as RENDERED.
//
// ⚠️ The load-bearing ones are the ABSENCES. A Tanod has no account, no
// password, no portal and no coordinate; the brief forbids all four, and a
// rendered panel is where one would quietly appear.
//
// ⚠️ CRA 5's preset sets `resetMocks: true`, so every implementation is
// installed in `beforeEach` rather than in the factory.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))

const { supabase } = require('../supabase/supabaseClient')
const TanodPanel = require('./TanodPanel').default

const ROSTER = [
  { id: 't1', full_name: 'Probe Tanod One', active: true, area_note: 'Rizal Street',
    display_order: 1, assignment_count: 2 },
  { id: 't2', full_name: 'Probe Tanod Two', active: false, area_note: null,
    display_order: 2, assignment_count: 0 },
]

const ASSIGNMENTS = [
  { id: 'a1', tanod_id: 't1', tanod_name: 'Probe Tanod One',
    assignment_date: '2026-10-18', start_time: '18:00:00', end_time: '22:00:00',
    patrol_type: 'roving', area_label: 'Rizal Street', active: true },
  { id: 'a2', tanod_id: 't1', tanod_name: 'Probe Tanod One',
    assignment_date: '2026-10-19', start_time: null, end_time: null,
    patrol_type: 'static', area_label: 'Barangay Hall', active: false },
]

let rpcCalls = []

const install = (overrides = {}) => {
  rpcCalls = []
  const table = {
    tanod_roster: ROSTER,
    tanod_assignments_for: ASSIGNMENTS,
    add_tanod_member: 'new-id',
    schedule_tanod_assignment: 'new-assignment',
    ...overrides,
  }
  supabase.rpc.mockImplementation((fn, args) => {
    rpcCalls.push([fn, args])
    return Promise.resolve({ data: table[fn] ?? [], error: null })
  })
}

beforeEach(() => {
  supabase.from.mockReturnValue({})
  install()
})

const fnNames = () => rpcCalls.map(([fn]) => fn)
const mount = (props = {}) => render(<TanodPanel {...props} />)
// ⚠️ `findAllByText`, BECAUSE THE NAME LEGITIMATELY APPEARS MORE THAN ONCE --
// once on the roster and once per patrol assignment. The first version of
// this helper used `findByText` and failed 18 tests with "found multiple
// elements", which reads as the panel being broken and was the helper.
const ready = () => screen.findAllByText('Probe Tanod One')

// ── A. The roster ────────────────────────────────────────────────────────────

describe('A. the roster', () => {
  it('builds both lists from the RPCs and never reads a table', async () => {
    mount()
    await ready()
    expect(fnNames()).toContain('tanod_roster')
    expect(fnNames()).toContain('tanod_assignments_for')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shows a stood-down Tanod rather than dropping them from the roster', async () => {
    mount()
    await ready()
    expect(screen.getByText('Probe Tanod Two')).toBeInTheDocument()
  })

  // ⚠️ `getAllByText`, because the roster and a stood-down ASSIGNMENT
  // share one state vocabulary -- deliberately, so the two cannot drift into
  // two words for one stored boolean.
  it('carries the state as a word, not only as a colour', async () => {
    mount()
    await ready()
    expect(screen.getAllByText('On the roster').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Stood down').length).toBeGreaterThan(0)
    const badge = screen.getAllByText('Stood down')[0]
    expect(badge.className).toMatch(/kp-badge/)
  })

  it('says an unrecorded area is unrecorded rather than leaving a blank cell', async () => {
    mount()
    await ready()
    const row = screen.getByText('Probe Tanod Two').closest('tr')
    expect(within(row).getByText('Not recorded')).toBeInTheDocument()
  })

  it('offers an empty state rather than an empty table', async () => {
    install({ tanod_roster: [], tanod_assignments_for: [] })
    mount()
    expect(await screen.findByText('No Tanod members on the roster yet.')).toBeInTheDocument()
  })
})

// ── B. A Tanod is a record, never an account ─────────────────────────────────

describe('B. no login and no tracking', () => {
  // ⚠️ §1 and §5: "Tanod has NO login", "No continuous GPS". Both are stated
  // on screen so nobody at the demo infers a portal that does not exist.
  // ⚠️ ASSERTED AGAINST THE SHIPPED SENTENCES. The first version of this
  // test matched wording the module does not use and failed for that reason
  // alone -- which is why it reads the real strings now.
  it('says in words that a Tanod has no account and is not tracked', async () => {
    mount()
    await ready()
    const note = screen.getByText(/do not have system accounts and cannot sign in/i)
    expect(note).toBeInTheDocument()
    expect(note.textContent).toMatch(/does not track anyone/i)
  })

  it('asks for no email, password, account or role when adding a Tanod', async () => {
    const { container } = mount({ canAdminister: true })
    await ready()
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent.toLowerCase())
    ;['email', 'password', 'account', 'role', 'username', 'sign in', 'login']
      .forEach((term) => labels.forEach((l) => expect(l).not.toContain(term)))
  })

  it('asks for no coordinate anywhere on a Tanod or a patrol', async () => {
    const { container } = mount({ canAdminister: true })
    await ready()
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent.toLowerCase())
    ;['latitude', 'longitude', 'gps', 'coordinate', 'track']
      .forEach((term) => labels.forEach((l) => expect(l).not.toContain(term)))
  })

  it('sends no account field, coordinate or server-owned value to the RPC', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.type(screen.getByLabelText('Name'), 'Probe Tanod Three')
    await userEvent.click(screen.getByRole('button', { name: /Add Tanod/i }))

    await waitFor(() => expect(fnNames()).toContain('add_tanod_member'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'add_tanod_member')
    ;['p_profile_id', 'p_email', 'p_password', 'p_role', 'p_latitude', 'p_longitude',
      'p_created_by', 'p_created_at', 'p_id']
      .forEach((key) => expect(args).not.toHaveProperty(key))
    expect(args.p_full_name).toBe('Probe Tanod Three')
  })
})

// ── C. Administration is absent, never disabled ──────────────────────────────

describe('C. who may administer the roster', () => {
  it('paints no roster or patrol control without the flag, and says why neutrally', async () => {
    const { container } = mount({ canAdminister: false })
    await ready()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stand down/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Patrol area')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[disabled]').length).toBe(0)
    expect(screen.getAllByText(/records staff/i).length).toBeGreaterThan(0)
  })

  it('names no position, policy or error code in that sentence', async () => {
    mount({ canAdminister: false })
    await ready()
    const note = screen.getAllByText(/records staff/i)[0].textContent
    ;['Secretary', 'Punong', 'Kapitan', 'P0001', '42501', 'policy', 'RLS',
      'current_official', 'tanod_members']
      .forEach((term) => expect(note).not.toContain(term))
  })

  it('offers the controls with the flag', async () => {
    mount({ canAdminister: true })
    await ready()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Patrol area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stand down Probe Tanod One' }))
      .toBeInTheDocument()
  })
})

// ── D. Patrol assignments ────────────────────────────────────────────────────

describe('D. the patrol schedule', () => {
  it('shows the window when there is one and says so when there is not', async () => {
    mount()
    await ready()
    expect(screen.getByText(/18:00/)).toBeInTheDocument()
    expect(screen.getByText(/22:00/)).toBeInTheDocument()
    expect(screen.getByText('No time recorded')).toBeInTheDocument()
  })

  it('reads the patrol type as words rather than as a stored value', async () => {
    mount()
    await ready()
    expect(screen.getByText('Roving')).toBeInTheDocument()
    expect(screen.getByText('Static post')).toBeInTheDocument()
    expect(screen.queryByText('roving')).not.toBeInTheDocument()
    expect(screen.queryByText('static')).not.toBeInTheDocument()
  })

  // ⚠️ §6: a Tanod is referenced by ID. A schedule that posted the name
  // would satisfy a rendering check and break the foreign key.
  it('schedules against the Tanod ID, never the name on screen', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.selectOptions(screen.getByLabelText('Tanod'), 't1')
    await userEvent.type(screen.getByLabelText('Date'), '2026-10-20')
    await userEvent.type(screen.getByLabelText('Patrol area'), 'Perdices Street')
    await userEvent.click(screen.getByRole('button', { name: /Schedule patrol/i }))

    await waitFor(() => expect(fnNames()).toContain('schedule_tanod_assignment'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'schedule_tanod_assignment')
    expect(args.p_tanod_id).toBe('t1')
    expect(JSON.stringify(args)).not.toContain('Probe Tanod One')
  })

  it('offers only the Tanod still on the roster for a new patrol', async () => {
    mount({ canAdminister: true })
    await ready()
    const picker = screen.getByLabelText('Tanod')
    expect(within(picker).getByRole('option', { name: 'Probe Tanod One' })).toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: 'Probe Tanod Two' }))
      .not.toBeInTheDocument()
  })

  it('writes nothing when the area is blank', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.selectOptions(screen.getByLabelText('Tanod'), 't1')
    await userEvent.type(screen.getByLabelText('Date'), '2026-10-20')
    await userEvent.click(screen.getByRole('button', { name: /Schedule patrol/i }))
    expect(fnNames()).not.toContain('schedule_tanod_assignment')
  })

  // ⚠️ PROVED BY SUBMITTING THE FORM, not by clicking a disabled button --
  // P3-B2's first version of this test clicked a `disabled` control and so
  // passed either way, and a keyboard Enter beating the re-render is the
  // real case.
  it('adds one Tanod when the form is submitted three times', async () => {
    let release
    const held = new Promise((resolve) => { release = resolve })
    let calls = 0
    supabase.rpc.mockImplementation((fn, args) => {
      rpcCalls.push([fn, args])
      if (fn === 'add_tanod_member') { calls += 1; return held.then(() => ({ data: 'x', error: null })) }
      if (fn === 'tanod_roster') return Promise.resolve({ data: ROSTER, error: null })
      return Promise.resolve({ data: [], error: null })
    })
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.type(screen.getByLabelText('Name'), 'Probe Tanod Three')
    const form = container.querySelector('#tnd-member-form')
    form.requestSubmit(); form.requestSubmit(); form.requestSubmit()
    expect(calls).toBe(1)
    release()
  })
})

// ── E. Failure ───────────────────────────────────────────────────────────────

describe('E. when a write is refused', () => {
  it('says so neutrally, with no SQLSTATE, policy or function name', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.rpc.mockImplementation((fn) => {
      rpcCalls.push([fn, null])
      if (fn === 'tanod_roster') return Promise.resolve({ data: ROSTER, error: null })
      if (fn === 'tanod_assignments_for') return Promise.resolve({ data: ASSIGNMENTS, error: null })
      return Promise.resolve({
        data: null,
        error: { code: 'P0001', message: 'Only the Barangay Secretary or the Punong Barangay can administer Tanod records.' },
      })
    })
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.type(screen.getByLabelText('Name'), 'Probe Tanod Three')
    await userEvent.click(screen.getByRole('button', { name: /Add Tanod/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent.length).toBeGreaterThan(0)
    ;['P0001', 'Barangay Secretary', 'Punong Barangay', 'current_official',
      'tanod_members', 'policy', '42501']
      .forEach((term) => expect(container.textContent).not.toContain(term))
    warn.mockRestore()
  })
})

// ── F. Source guards ─────────────────────────────────────────────────────────

describe('F. the wiring', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
  const code = (p) => read(p).split('\n')
    .map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const MODULES = ['tanod/tanodApi.js', 'tanod/TanodPanel.jsx', 'tanod/tanodLabels.js']

  it('keeps all Tanod state out of OfficialDashboard', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    ;['tanod_roster', 'add_tanod_member', 'schedule_tanod_assignment', 'tanod_assignments_for']
      .forEach((fn) => expect(dash).not.toContain(fn))
    expect(dash).toContain('<TanodPanel')
  })

  it('reads no table from any Tanod module', () => {
    MODULES.forEach((p) => expect(code(p)).not.toContain('supabase.from'))
  })

  // ⚠️ §1: "Do NOT add `tanod` to profiles.role; create Tanod accounts".
  // Nothing here may touch an auth surface, a profile or a role.
  it('touches no auth, profile or role surface', () => {
    MODULES.forEach((p) => {
      const lower = code(p).toLowerCase()
      ;['supabase.auth', 'profiles', 'auth.uid', 'signup', 'signin',
        'official_account_links', 'profiles.role', "'tanod'])"]
        .forEach((term) => expect(lower).not.toContain(term.toLowerCase()))
    })
  })

  it('names no coordinate column on a Tanod anywhere', () => {
    MODULES.forEach((p) => {
      const lower = code(p).toLowerCase()
      ;['latitude', 'longitude', 'geolocation', 'navigator.geo', 'watchposition']
        .forEach((term) => expect(lower).not.toContain(term))
    })
  })

  it('reads no complaint, screening or KP surface', () => {
    MODULES.forEach((p) => {
      const lower = code(p).toLowerCase()
      ;['complaint_queue', 'complaint_detail', 'track_complaint', 'complaint_screenings_for',
        'open_kp_case', 'vawc', 'witness']
        .forEach((term) => expect(lower).not.toContain(term))
    })
  })
})
