// Combined Phase 2 — the Tanod roster and the patrol schedule, as RENDERED.
//
// ⚠️ The load-bearing ones are the ABSENCES. A Tanod has no account, no
// password, no portal and no coordinate; the brief forbids all four, and a
// rendered panel is where one would quietly appear.
//
// ⚠️ CRA 5's preset sets `resetMocks: true`, so every implementation is
// installed in `beforeEach` rather than in the factory.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('Tanod editing', () => {
  it('updates only editable details using the existing ID and refreshes the roster', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod Two' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Probe Tanod Two' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Probe Tanod Two')
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), '  Updated Tanod  ')
    await userEvent.type(screen.getByLabelText('Usual area (optional)'), '  Hall  ')
    await userEvent.clear(screen.getByLabelText('Display order'))
    await userEvent.type(screen.getByLabelText('Display order'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Tanod/ })).toBeInTheDocument())
    expect(rpcCalls.find(([fn]) => fn === 'update_tanod_member')[1]).toEqual({
      p_tanod_id: 't2', p_full_name: 'Updated Tanod', p_area_note: 'Hall', p_display_order: 3,
    })
    expect(fnNames().filter((fn) => fn === 'tanod_roster')).toHaveLength(2)
    expect(fnNames()).not.toContain('add_tanod_member')
    expect(fnNames()).not.toContain('set_tanod_member_active')
  })

  it('cancels without writing and hides Edit from read-only officials', async () => {
    const { unmount } = mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Probe Tanod One' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(fnNames()).not.toContain('update_tanod_member')
    unmount()
    mount()
    await ready()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
  })

  it('rejects a whitespace-only name', async () => {
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Probe Tanod One' }))
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), '   ')
    fireEvent.submit(screen.getByLabelText('Name').closest('form'))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(fnNames()).not.toContain('update_tanod_member')
  })

  it('prevents duplicate saves while the RPC is pending', async () => {
    let release
    const held = new Promise((resolve) => { release = resolve })
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Probe Tanod One' }))
    supabase.rpc.mockImplementation((fn, args) => {
      rpcCalls.push([fn, args])
      if (fn === 'update_tanod_member') return held
      return Promise.resolve({ data: fn === 'tanod_roster' ? ROSTER : ASSIGNMENTS, error: null })
    })
    const form = screen.getByLabelText('Name').closest('form')
    fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form)
    expect(fnNames().filter((fn) => fn === 'update_tanod_member')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled()
    await act(async () => { release({ data: null, error: null }) })
    expect(screen.getByRole('button', { name: /Add Tanod/ })).toBeInTheDocument()
  })

  it('retains the edit form when authorization is refused', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Probe Tanod One' }))
    supabase.rpc.mockResolvedValue({ data: null, error: {
      message: 'Only the Barangay Secretary or the Punong Barangay can manage the Tanod roster.',
    } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/records staff/i)
    expect(screen.getByLabelText('Name')).toHaveValue('Probe Tanod One')
    warn.mockRestore()
  })

  it('uses Reactivate with a normal style and keeps Stand down destructive', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    expect(screen.getByRole('button', { name: 'Stand down Probe Tanod One' })).toHaveClass('btn-deny')
    await userEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod Two' }))
    const reactivate = screen.getByRole('button', { name: 'Reactivate Probe Tanod Two' })
    expect(reactivate).toHaveTextContent('Reactivate')
    expect(reactivate).toHaveClass('btn-add')
    expect(reactivate).not.toHaveClass('btn-deny')
    await userEvent.click(reactivate)
    await waitFor(() => expect(rpcCalls).toContainEqual(['set_tanod_member_active', { p_tanod_id: 't2', p_active: true }]))
  })
})

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

describe('B. separate roster and account provisioning, no tracking', () => {
  // ⚠️ §1 and §5: "Tanod has NO login", "No continuous GPS". Both are stated
  // on screen so nobody at the demo infers a portal that does not exist.
  // ⚠️ ASSERTED AGAINST THE SHIPPED SENTENCES. The first version of this
  // test matched wording the module does not use and failed for that reason
  // alone -- which is why it reads the real strings now.
  it('explains separate authorized account provisioning and no tracking', async () => {
    mount()
    await ready()
    const note = screen.getByText(/roster membership is separate from account access/i)
    expect(note).toBeInTheDocument()
    expect(note.textContent).toMatch(/does not track anyone/i)
  })

  it('asks for no email, password, account or role when adding a Tanod', async () => {
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Add Tanod' }))
    const labels = [...container.querySelectorAll('#tnd-member-form label')].map((l) => l.textContent.toLowerCase())
    ;['email', 'password', 'account', 'role', 'username', 'sign in', 'login']
      .forEach((term) => labels.forEach((l) => expect(l).not.toContain(term)))
  })

  it('asks for no coordinate anywhere on a Tanod or a patrol', async () => {
    const { container } = mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule Patrol', exact: true }))
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent.toLowerCase())
    ;['latitude', 'longitude', 'gps', 'coordinate', 'track']
      .forEach((term) => labels.forEach((l) => expect(l).not.toContain(term)))
  })

  it('sends no account field, coordinate or server-owned value to the RPC', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Add Tanod' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Add Tanod' }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    expect(screen.getByRole('button', { name: 'Stand down Probe Tanod One' }))
      .toBeInTheDocument()
  })
})

// ── D. Patrol assignments ────────────────────────────────────────────────────

describe('D. the patrol schedule', () => {
  it('shows the window when there is one and says so when there is not', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
    fireEvent.change(screen.getByLabelText('Schedule month'), { target: { value: '2026-10' } })
    expect(screen.getByText(/6:00 PM/)).toBeInTheDocument()
    expect(screen.getByText(/10:00 PM/)).toBeInTheDocument()
    expect(screen.getByText('No time recorded')).toBeInTheDocument()
  })

  it('reads the patrol type as words rather than as a stored value', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
    fireEvent.change(screen.getByLabelText('Schedule month'), { target: { value: '2026-10' } })
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
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule Patrol', exact: true }))
    await userEvent.selectOptions(screen.getByLabelText('Tanod'), 't1')
    await userEvent.type(screen.getByLabelText('Date'), '2026-10-20')
    await userEvent.type(screen.getByLabelText('Patrol area'), 'Perdices Street')
    await userEvent.click(screen.getByRole('button', { name: /Schedule patrol/i }))

    await waitFor(() => expect(fnNames()).toContain('schedule_tanod_assignment'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'schedule_tanod_assignment')
    expect(args.p_tanod_id).toBe('t1')
    expect(JSON.stringify(args)).not.toContain('Probe Tanod One')
    await waitFor(() => expect(screen.queryByLabelText('Patrol area')).toBeNull())
    expect(screen.getByRole('button', { name: 'Schedule Patrol', exact: true })).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers only the Tanod still on the roster for a new patrol', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule Patrol', exact: true }))
    const picker = screen.getByLabelText('Tanod')
    expect(within(picker).getByRole('option', { name: 'Probe Tanod One' })).toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: 'Probe Tanod Two' }))
      .not.toBeInTheDocument()
  })

  it('writes nothing when the area is blank', async () => {
    mount({ canAdminister: true })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule Patrol', exact: true }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Add Tanod' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Probe Tanod Three')
    const form = screen.getByLabelText('Name').closest('form')
    act(() => { form.requestSubmit(); form.requestSubmit(); form.requestSubmit() })
    expect(calls).toBe(1)
    await act(async () => { release() })
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
    await userEvent.click(screen.getByRole('button', { name: 'Add Tanod' }))
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
  const code = (p) => read(p).split(/\r?\n/)
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


describe('compact operations views', () => {
  it('collapses creation and account forms until explicitly requested', async () => {
    mount({ canAdminister: true }); await ready()
    expect(screen.getByRole('button', { name: 'Roster & Accounts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByLabelText('Provisioned Tanod profile UUID')).toBeNull()
    expect(screen.queryByLabelText('Patrol area')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add Tanod' })
    expect(add).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(add)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Add form' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Add form' }))
    expect(screen.queryByLabelText('Name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    expect(screen.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const schedule = screen.getByRole('button', { name: 'Schedule Patrol', exact: true })
    expect(schedule).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(schedule)
    expect(screen.getByLabelText('Patrol area')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close schedule form' }))
    expect(screen.queryByLabelText('Patrol area')).toBeNull()
  })

  it('loads account states once and keeps UUID controls scoped to the managed member', async () => {
    const profileId = '00000000-0000-4000-8000-000000000001'
    install({ tanod_account_states: [{ tanod_id: 't1', profile_id: profileId, account_state: 'Linked' }] })
    mount({ canAdminister: true }); await ready()
    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.queryByText(profileId)).toBeNull()
    const calls = fnNames().filter((fn) => fn === 'tanod_account_states').length
    fireEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod Two' }))
    expect(fnNames().filter((fn) => fn === 'tanod_account_states')).toHaveLength(calls)
    expect(screen.queryByLabelText('Tanod member')).toBeNull()
    expect(screen.queryByLabelText('Provisioned Tanod profile UUID')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Link account', exact: true }))
    const profile = screen.getByLabelText('Provisioned Tanod profile UUID')
    fireEvent.change(profile, { target: { value: 'not-a-uuid' } })
    expect(screen.getByRole('button', { name: 'Link account' })).toBeDisabled()
    fireEvent.change(profile, { target: { value: profileId } })
    fireEvent.click(screen.getByRole('button', { name: 'Link account' }))
    await waitFor(() => expect(rpcCalls).toContainEqual(['set_tanod_account_link', { p_tanod_id: 't2', p_profile_id: profileId }]))
    await screen.findByText('Tanod account link saved.')
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    expect(screen.queryByLabelText('Provisioned Tanod profile UUID')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change account link' }))
    expect(screen.getByLabelText('Provisioned Tanod profile UUID')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove account link' }))
    await waitFor(() => expect(rpcCalls).toContainEqual(['set_tanod_account_link', { p_tanod_id: 't1', p_profile_id: null }]))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('summaries derive today coverage only from active loaded assignments', async () => {
    const today = require('./tanodDuty').dutyDate()
    install({ tanod_account_states: [{ tanod_id: 't1', profile_id: 'linked' }], tanod_assignments_for: [
      { ...ASSIGNMENTS[0], assignment_date: today, start_time: '06:00:00', end_time: '14:00:00' },
      { ...ASSIGNMENTS[0], id: 'a3', assignment_date: today, start_time: '14:00:00', end_time: '22:00:00' },
      { ...ASSIGNMENTS[1], assignment_date: today },
    ] })
    mount({ canAdminister: true }); await ready()
    const summary = screen.getByLabelText('Tanod operations summary')
    expect(within(summary).getByText('Accounts Linked').nextElementSibling).toHaveTextContent('1')
    expect(within(summary).getByText('Scheduled Today').nextElementSibling).toHaveTextContent('2')
    expect(within(summary).getByText('Shift Coverage').nextElementSibling).toHaveTextContent('2 shifts today')
  })

  it('does not query account administration without permission', async () => {
    mount(); await ready()
    expect(fnNames()).not.toContain('tanod_account_states')
    expect(screen.queryByRole('button', { name: /^Manage / })).toBeNull()
  })

  it('retains assignment stand-down and refreshes through the existing RPC', async () => {
    mount({ canAdminister: true }); await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Patrol Schedule', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
    fireEvent.change(screen.getByLabelText('Schedule month'), { target: { value: '2026-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stand down assignment for Probe Tanod One on 18 Oct 2026' }))
    await waitFor(() => expect(rpcCalls).toContainEqual(['set_tanod_assignment_active', { p_assignment_id: 'a1', p_active: false }]))
    await waitFor(() => expect(fnNames().filter((fn) => fn === 'tanod_assignments_for')).toHaveLength(2))
  })
})


describe('Manage Tanod dialog', () => {
  it('opens one centered dialog with the correct summary while leaving the roster unchanged', async () => {
    const { container } = mount({ canAdminister: true }); await ready()
    const table = container.querySelector('table')
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    const dialog = screen.getByRole('dialog', { name: 'Manage Tanod Probe Tanod One' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Rizal Street')).toBeInTheDocument()
    expect(within(dialog).getByText('Active Assignments').nextElementSibling).toHaveTextContent('2')
    expect(within(dialog).getByText('On the roster')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Edit Probe Tanod One' })).toBeInTheDocument()
    expect(container.querySelector('table')).toBe(table)
    expect(container.querySelector('.tnd-management')).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(within(dialog).queryByLabelText('Provisioned Tanod profile UUID')).toBeNull()
    expect(within(dialog).queryByText('t1')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('moves focus in, traps both Tab directions, closes with Escape and restores the opener', async () => {
    mount({ canAdminister: true }); await ready()
    const opener = screen.getByRole('button', { name: 'Manage Probe Tanod One' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    const first = within(dialog).getByRole('button', { name: 'Close Manage Tanod' })
    const last = within(dialog).getByRole('button', { name: 'Close', exact: true })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    opener.focus()
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it.each(['Close Manage Tanod', 'Close'])('explicit %s closes and restores focus', async (name) => {
    mount({ canAdminister: true }); await ready()
    const opener = screen.getByRole('button', { name: 'Manage Probe Tanod Two' })
    await userEvent.click(opener)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name, exact: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('edits inside the same dialog and restores focus to a refreshed roster row when closed', async () => {
    mount({ canAdminister: true }); await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit Probe Tanod One' }))
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Probe Tanod One')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => expect(within(dialog).queryByLabelText('Name')).toBeNull())
    expect(fnNames()).toContain('update_tanod_member')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('button', { name: 'Manage Probe Tanod One' })).toHaveFocus()
  })

  it('keeps stand-down inside the dialog danger area and calls the same stable ID', async () => {
    mount({ canAdminister: true }); await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Manage Probe Tanod One' }))
    const action = within(screen.getByRole('dialog')).getByRole('button', { name: 'Stand down Probe Tanod One' })
    expect(action.closest('.tnd-danger-actions')).toBeInTheDocument()
    await userEvent.click(action)
    await waitFor(() => expect(rpcCalls).toContainEqual(['set_tanod_member_active', { p_tanod_id: 't1', p_active: false }]))
  })

  it('contains scrolling and keeps phone dialogs floating above the page', () => {
    const css = fs.readFileSync(path.join(__dirname, 'Tanod.css'), 'utf8').replace(/\r\n/g, '\n')
    expect(css).toMatch(/\.tnd-modal-backdrop \{[^}]*position: fixed/)
    expect(css).toMatch(/\.tnd-manage-dialog \{[^}]*max-width: 640px;[^}]*max-height: 85vh/)
    expect(css).toMatch(/\.tnd-manage-body \{[^}]*overflow-y: auto/)
    expect(css).toMatch(/@media\(max-width: 600px\).*?\.tnd-manage-summary \{ grid-template-columns: minmax\(0,1fr\)/s)
  })
})

test('Manage profile header derives initials and contains the only Edit Tanod action', async () => {
  install({ tanod_roster: [{ ...ROSTER[0], full_name: 'Carlo M. Abellanosa' }] })
  mount({ canAdminister: true })
  await userEvent.click(await screen.findByRole('button', { name: 'Manage Carlo M. Abellanosa' }))
  const dialog = screen.getByRole('dialog')
  const header = dialog.querySelector('.tnd-profile-header')
  expect(within(header).getByText('CA')).toHaveAttribute('aria-hidden', 'true')
  expect(within(header).getByText('Carlo M. Abellanosa')).toBeInTheDocument()
  expect(within(header).getByText('Barangay Tanod')).toBeInTheDocument()
  const edit = within(header).getByRole('button', { name: 'Edit Carlo M. Abellanosa' })
  expect(within(dialog).getAllByRole('button', { name: 'Edit Carlo M. Abellanosa' })).toHaveLength(1)
  expect(dialog.querySelector('.tnd-manage-body')).not.toContainElement(edit)
  await userEvent.click(edit)
  expect(within(dialog).getByLabelText('Name')).toHaveValue('Carlo M. Abellanosa')
})
