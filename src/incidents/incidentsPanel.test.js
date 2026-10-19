// Combined Phase 2 — the incident queue, the record form and the blotter as
// RENDERED.
//
// ⚠️ Supabase is mocked at the module level and CRA 5's preset sets
// `resetMocks: true`, so every implementation is installed in `beforeEach`
// rather than in the factory.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))

const { supabase } = require('../supabase/supabaseClient')
const IncidentsPanel = require('./IncidentsPanel').default

const QUEUE = [{
  id: 'i1', reference: 'INC-2026-AB12CD', incident_type: 'traffic_accident',
  occurred_at: '2026-10-15T02:00:00.000Z', location_text: 'Rizal Street',
  area_note: 'near the chapel', status: 'recorded', source: 'official_report',
  has_coordinates: true, blotter_reference: 'BLT-2026-ZZ99YY',
  recorded_by_name: 'Alexis Theress P. Tan', tanod_count: 1,
  created_at: '2026-10-15T02:05:00.000Z',
}, {
  id: 'i2', reference: 'INC-2026-QQ77RR', incident_type: 'threat',
  occurred_at: '2026-10-14T09:00:00.000Z', location_text: 'Colon Street',
  area_note: null, status: 'resolved', source: 'tanod_report',
  has_coordinates: false, blotter_reference: 'BLT-2026-WW55VV',
  recorded_by_name: 'Hon. Frankie Credo', tanod_count: 0,
  created_at: '2026-10-14T09:10:00.000Z',
}]

const DETAIL = {
  id: 'i1', reference: 'INC-2026-AB12CD', incident_type: 'traffic_accident',
  occurred_at: '2026-10-15T02:00:00.000Z',
  narrative: 'A tricycle and a motorcycle collided at the corner.',
  location_text: 'Rizal Street', area_note: 'near the chapel',
  latitude: 9.3068, longitude: 123.3054, status: 'recorded',
  source: 'official_report', blotter_reference: 'BLT-2026-ZZ99YY',
  blotter_summary: 'A tricycle and a motorcycle collided at the corner.',
  blotter_recorded_at: '2026-10-15T02:05:00.000Z',
  recorded_by_name: 'Alexis Theress P. Tan',
  created_at: '2026-10-15T02:05:00.000Z', updated_at: '2026-10-15T02:05:00.000Z',
}

const HISTORY = [
  { id: 'h1', action: 'created', note: 'Blotter entry created with the incident.',
    actor_name: 'Alexis Theress P. Tan', created_at: '2026-10-15T02:05:00.000Z' },
  { id: 'h2', action: 'amended', note: 'Plate number corrected.',
    actor_name: 'Alexis Theress P. Tan', created_at: '2026-10-15T03:00:00.000Z' },
]

const ROSTER = [
  { id: 't1', full_name: 'Probe Tanod One', active: true, area_note: 'Rizal Street',
    display_order: 1, assignment_count: 2 },
]

const INCIDENT_TANOD = [
  { id: 'it1', tanod_id: 't1', tanod_name: 'Probe Tanod One', role: 'responded',
    note: null, created_at: '2026-10-15T02:30:00.000Z' },
]

let rpcCalls = []

const install = () => {
  rpcCalls = []
  supabase.rpc.mockImplementation((fn, args) => {
    rpcCalls.push([fn, args])
    if (fn === 'incident_queue') return Promise.resolve({ data: QUEUE, error: null })
    if (fn === 'tanod_roster') return Promise.resolve({ data: ROSTER, error: null })
    if (fn === 'incident_detail') return Promise.resolve({ data: [DETAIL], error: null })
    if (fn === 'blotter_history_for') return Promise.resolve({ data: HISTORY, error: null })
    if (fn === 'incident_tanod_for') return Promise.resolve({ data: INCIDENT_TANOD, error: null })
    if (fn === 'record_incident') return Promise.resolve({ data: 'INC-2026-NEW111', error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

const confirmYes = jest.fn()

beforeEach(() => {
  confirmYes.mockReset()
  confirmYes.mockResolvedValue(true)
  supabase.from.mockReturnValue({})
  install()
})

const mount = (props = {}) => render(
  <IncidentsPanel confirm={confirmYes} {...props} />
)

const fnNames = () => rpcCalls.map(([fn]) => fn)
const openDetail = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /View incident INC-2026-AB12CD/ }))
  await screen.findByRole('dialog', { name: 'Incident Details' })
}

// ── A. The queue ─────────────────────────────────────────────────────────────

describe('A. the incident queue', () => {
  it('builds the list from incident_queue() and never reads a table', async () => {
    mount()
    await screen.findByText('INC-2026-AB12CD')
    expect(fnNames()).toContain('incident_queue')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ⚠️ A READABILITY DECISION, SAID HONESTLY. A queue is a list and a
  // narrative is prose; `incident_detail()` returns it to the same caller one
  // click later. The privacy boundary is the MAP reader, not this one.
  it('shows no narrative in the list, from a fixture that has one', async () => {
    mount()
    await screen.findByText('INC-2026-AB12CD')
    expect(screen.queryByText(/tricycle and a motorcycle/)).not.toBeInTheDocument()
  })

  it('says how many incidents have no coordinates and so are not on the map', async () => {
    mount()
    expect(await screen.findByText(/1 incident has no coordinates and does not appear on the map/)).toBeInTheDocument()
  })

  it('offers two different empty states', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'incident_queue') return Promise.resolve({ data: [], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    mount()
    expect(await screen.findByText('No incidents recorded yet.')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by incident type'), 'threat')
    expect(await screen.findByText('No incidents match this filter.')).toBeInTheDocument()
  })
})

// ── B. Recording ─────────────────────────────────────────────────────────────

describe('B. recording an incident', () => {
  const fillForm = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Record Incident/ }))
    await userEvent.type(screen.getByLabelText('When it happened'), '2026-10-16T14:30')
    await userEvent.type(screen.getByLabelText('Location'), 'Perdices Street')
    await userEvent.type(screen.getByLabelText('What happened'), 'A parked tricycle was hit.')
  }

  it('sends nothing the server owns', async () => {
    mount()
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: 'Record incident' }))

    await waitFor(() => expect(fnNames()).toContain('record_incident'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'record_incident')
    ;['p_reference', 'p_status', 'p_recorded_by', 'p_created_at', 'p_blotter_reference']
      .forEach((key) => expect(args).not.toHaveProperty(key))
    expect(args.p_location_text).toBe('Perdices Street')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record Incident' })).not.toBeInTheDocument())
  })

  // ⚠️ Half a coordinate would plot at (0, 0) — a point in the Gulf of
  // Guinea. The database refuses it too; this says so before the round trip.
  it('refuses a latitude with no longitude, before calling anything', async () => {
    mount()
    await fillForm()
    await userEvent.type(screen.getByLabelText('Latitude (optional)'), '9.3068')
    await userEvent.click(screen.getByRole('button', { name: 'Record incident' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/latitude and a longitude, or neither/i)
    expect(fnNames()).not.toContain('record_incident')
  })

  // ⚠️ PROVED BY SUBMITTING THE FORM, not by clicking a disabled button.
  // P3-B2's first version of this test clicked a `disabled` control and so
  // passed either way; a keyboard Enter beating the re-render is also the
  // real case.
  it('records one incident when the form is submitted three times', async () => {
    let release
    const held = new Promise((resolve) => { release = resolve })
    let calls = 0
    supabase.rpc.mockImplementation((fn, args) => {
      rpcCalls.push([fn, args])
      if (fn === 'record_incident') { calls += 1; return held.then(() => ({ data: 'X', error: null })) }
      if (fn === 'incident_queue') return Promise.resolve({ data: QUEUE, error: null })
      if (fn === 'tanod_roster') return Promise.resolve({ data: ROSTER, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { container } = mount()
    await fillForm()
    const form = container.querySelector('#inc-record-form')
    form.requestSubmit(); form.requestSubmit(); form.requestSubmit()
    expect(calls).toBe(1)
    release()
  })
})

// ── C. Records administration is absent, never disabled ──────────────────────

describe('C. who may administer records', () => {
  it('paints no records control without the flag, and says why neutrally', async () => {
    mount({ canAdminister: false })
    await openDetail()

    expect(screen.queryByRole('heading', { name: 'Record Actions' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a blotter amendment')).not.toBeInTheDocument()
    expect(screen.getByText(/handled by the barangay records staff/i)).toBeInTheDocument()
  })

  // ⚠️ The neutral sentence names NO position, no policy, no function and no
  // SQLSTATE -- an official who cannot administer records cannot grant
  // themselves the permission, and naming the holder only invites asking.
  it('names no position, policy or error code in that sentence', async () => {
    mount({ canAdminister: false })
    await openDetail()
    const note = screen.getByText(/handled by the barangay records staff/i)
    ;['Secretary', 'Punong', 'Kagawad', 'P0001', '42501', 'policy', 'RLS', 'function']
      .forEach((term) => expect(note.textContent).not.toContain(term))
  })

  it('renders nothing disabled in place of being withheld', async () => {
    const { container } = mount({ canAdminister: false })
    await openDetail()
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0)
  })

  it('offers the records controls with the flag', async () => {
    mount({ canAdminister: true })
    await openDetail()
    expect(screen.getByRole('heading', { name: 'Record Actions' })).toBeInTheDocument()
    expect(screen.getByLabelText('Add a blotter amendment')).toBeInTheDocument()
  })

  it('confirms a status change in words before writing it', async () => {
    mount({ canAdminister: true })
    await openDetail()
    await userEvent.click(screen.getByRole('button', { name: /Mark resolved/ }))

    expect(confirmYes).toHaveBeenCalledTimes(1)
    expect(confirmYes.mock.calls[0][0].message).toContain('Resolved')
    expect(confirmYes.mock.calls[0][0].message).not.toContain('resolved"')
    await waitFor(() => expect(fnNames()).toContain('set_incident_status'))
  })

  it('writes nothing when the confirmation is declined', async () => {
    confirmYes.mockResolvedValue(false)
    mount({ canAdminister: true })
    await openDetail()
    await userEvent.click(screen.getByRole('button', { name: /Mark resolved/ }))

    await waitFor(() => expect(confirmYes).toHaveBeenCalled())
    expect(fnNames()).not.toContain('set_incident_status')
  })
})

// ── D. The blotter ───────────────────────────────────────────────────────────

describe('D. the blotter entry', () => {
  it('shows its own reference, separate from the incident', async () => {
    mount()
    await openDetail()
    expect(screen.getByRole('heading', { name: /Blotter entry BLT-2026-ZZ99YY/ })).toBeInTheDocument()
  })

  // ⚠️ INTERNAL, and said so on screen so nobody wires up a public lookup
  // later by analogy with `track_complaint`.
  it('says the blotter is internal with no public lookup', async () => {
    mount()
    await openDetail()
    expect(screen.getByText(/not published and there is no public lookup/i)).toBeInTheDocument()
  })

  it('renders the append-only history, oldest first, and says it is append-only', async () => {
    mount()
    await openDetail()
    expect(screen.getByText(/never overwritten/i)).toBeInTheDocument()
    const items = screen.getAllByText(/Entry (created|amended)/)
    expect(items[0]).toHaveTextContent('Entry created')
    expect(items[1]).toHaveTextContent('Entry amended')
  })

  it('reads the history through the RPC and never from the table', async () => {
    mount()
    await openDetail()
    expect(fnNames()).toContain('blotter_history_for')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ── E. Tanod attribution ─────────────────────────────────────────────────────

describe('E. Tanod on an incident', () => {
  it('shows the Tanod by name and role from the join reader', async () => {
    mount()
    await openDetail()
    expect(screen.getByText(/Probe Tanod One/)).toBeInTheDocument()
    expect(fnNames()).toContain('incident_tanod_for')
  })

  // ⚠️ §6: "Do not store only a Tanod name string when a Tanod record
  // exists." So the load-bearing assertion is the SUBMITTED VALUE, not the
  // option's existence -- a picker that displayed the roster and posted
  // `full_name` would satisfy a rendering check and break the FK.
  it('records the Tanod by ID, never by the name on screen', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Record Incident/ }))
    await userEvent.type(screen.getByLabelText('When it happened'), '2026-10-16T14:30')
    await userEvent.type(screen.getByLabelText('Location'), 'Perdices Street')
    await userEvent.type(screen.getByLabelText('What happened'), 'A parked tricycle was hit.')

    const picker = screen.getByLabelText('Tanod involved (optional)')
    expect(within(picker).getByRole('option', { name: 'Probe Tanod One' })).toHaveValue('t1')
    await userEvent.selectOptions(picker, 't1')
    await userEvent.click(screen.getByRole('button', { name: 'Record incident' }))

    await waitFor(() => expect(fnNames()).toContain('record_incident'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'record_incident')
    expect(args.p_tanod_id).toBe('t1')
    expect(JSON.stringify(args)).not.toContain('Probe Tanod One')
  })

  it('attributes a Tanod from the detail panel by ID too', async () => {
    mount({ canAdminister: true })
    await openDetail()
    await userEvent.selectOptions(screen.getByLabelText('Record another Tanod'), 't1')

    await waitFor(() => expect(fnNames()).toContain('attribute_incident_tanod'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'attribute_incident_tanod')
    expect(args.p_tanod_id).toBe('t1')
    expect(args.p_incident_id).toBe('i1')
    expect(JSON.stringify(args)).not.toContain('Probe Tanod One')
  })

  it('offers no Tanod picker in the detail panel without the records flag', async () => {
    mount({ canAdminister: false })
    await openDetail()
    expect(screen.queryByLabelText('Record another Tanod')).not.toBeInTheDocument()
    expect(screen.getByText(/Probe Tanod One/)).toBeInTheDocument()
  })
})

// ── F. Source guards ─────────────────────────────────────────────────────────

describe('F. the wiring', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
  const code = (p) => read(p).split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  it('keeps all incident state out of OfficialDashboard', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    ;['incident_queue', 'record_incident', 'blotter_history_for', 'incident_map_points']
      .forEach((fn) => expect(dash).not.toContain(fn))
    expect(dash).toContain('<IncidentsPanel')
  })

  it('reads no table from either incident module', () => {
    ;['incidents/incidentApi.js', 'incidents/IncidentsPanel.jsx']
      .forEach((p) => expect(code(p)).not.toContain('supabase.from'))
  })

  // ⚠️ SCOPED TO READS, AND THE FIRST VERSION WAS NOT -- it scanned for the
  // bare word `complaint` and failed on `className="complaint-reference"`,
  // which is §10's "reuse current design language" doing exactly what it was
  // asked to. That is the `tan`-inside-`circumstance` trap P4-A recorded. The
  // property that matters is that nothing here READS a complaint, screening
  // or KP surface: no import of one, no RPC name, no table name.
  it('reads no complaint, screening or KP surface from the incident modules', () => {
    const SURFACES = [
      'complaints', 'complaint_parties', 'complaint_status_history',
      'complaint_attachments', 'complaint_screenings',
      'kp_cases', 'kp_case_panel', 'kp_hearings', 'kp_hearing_attendance',
      'complaint_queue', 'complaint_detail', 'complaint_parties_for',
      'complaint_history_for', 'complaint_attachments_for', 'track_complaint',
      'file_complaint_as_resident', 'encode_walk_in_complaint',
      'prepare_complaint_screening', 'confirm_complaint_screening',
      'complaint_screenings_for', 'open_kp_case', 'schedule_kp_hearing',
      'record_kp_hearing_outcome', 'vawc', 'witness',
    ]
    ;['incidents/incidentApi.js', 'incidents/IncidentsPanel.jsx', 'incidents/incidentLabels.js']
      .forEach((p) => {
        const lower = code(p).toLowerCase()
        SURFACES.forEach((term) => expect(lower).not.toContain(term))
      })
  })

  it('imports nothing from the complaint, screening or KP modules', () => {
    ;['incidents/incidentApi.js', 'incidents/IncidentsPanel.jsx', 'incidents/incidentLabels.js']
      .forEach((p) => {
        const imports = code(p).match(/from\s+'[^']+'/g) || []
        imports.forEach((line) => {
          expect(line).not.toMatch(/complaints\//)
          expect(line).not.toMatch(/screening\//)
          expect(line).not.toMatch(/kpcases\//)
        })
      })
  })
})

// ── G. The filter controls are real targets ────────────────────────────────

describe('G. the filter bar controls', () => {
  // ⚠️ A REAL DEFECT THIS GUARD EXISTS FOR. `.filter-select-wrap` is a padded
  // wrapper and `.filter-select` is what carries `align-self: stretch` and
  // `min-height: 24px`. These panels reused the wrapper and omitted the
  // control class, so every filter rendered **19px tall** -- under WCAG 2.2
  // SC 2.5.8's 24px minimum. Measured in Chromium at five widths, not read
  // off the stylesheet; "a padded wrapper is not a target" is the project's
  // own phrase for it, from PR #24.
  it('gives every filter control the class that carries the 24px target', () => {
    const { container } = mount()
    const wraps = [...container.querySelectorAll('.filter-select-wrap')]
    expect(wraps.length).toBeGreaterThan(0)
    wraps.forEach((wrap) => {
      const control = wrap.querySelector('input, select, textarea')
      expect(control).not.toBeNull()
      expect(control.className.split(/\s+/)).toContain('filter-select')
    })
  })
})


describe('incident floating dialogs', () => {
  it('opens the record form above the unchanged table, retains fields, and closes with Cancel', async () => {
    mount()
    await screen.findByText('INC-2026-AB12CD')
    const opener = screen.getByRole('button', { name: 'Record Incident' })
    await userEvent.click(opener)
    const modal = screen.getByRole('dialog', { name: 'Record Incident' })
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(modal).toContainElement(document.querySelector('#inc-record-form'))
    expect(within(modal).getByRole('button', { name: 'Close record incident' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    for (const label of ['What kind of incident', 'When it happened', 'How it reached the barangay', 'Location', 'Tanod involved (optional)', 'Latitude (optional)', 'Longitude (optional)', 'What happened']) {
      expect(within(modal).getByLabelText(label)).toBeInTheDocument()
    }
    expect(within(modal).getByRole('button', { name: /Use Current Location/i })).toBeInTheDocument()
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('shows the correct fixed incident identity and only one Close control, with no inline details', async () => {
    mount({ canAdminister: true })
    await openDetail()
    const modal = screen.getByRole('dialog', { name: 'Incident Details' })
    const header = modal.querySelector('.inc-modal-header')
    expect(within(header).getByRole('heading', { name: 'Incident Details' })).toBeInTheDocument()
    expect(within(header).getByText('INC-2026-AB12CD')).toBeInTheDocument()
    expect(within(header).getByText('Recorded')).toBeInTheDocument()
    expect(within(header).getByText('Blotter BLT-2026-ZZ99YY')).toBeInTheDocument()
    expect(within(modal).getAllByRole('button', { name: /close incident details/i })).toHaveLength(1)
    expect(modal.querySelector('.confirm-dialog-actions')).toBeNull()
    expect(document.querySelector('.dashboard-card.inc-detail')).toBeNull()
    expect(modal).toContainElement(document.querySelector('.inc-detail'))
    expect(within(modal).getByRole('region', { name: 'What happened' })).toHaveTextContent(DETAIL.narrative)
    expect(within(modal).getByRole('region', { name: 'Blotter Entry' })).toHaveTextContent('Plate number corrected.')
    const close = within(modal).getByRole('button', { name: 'Close incident details' })
    const buttons = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
    buttons[buttons.length - 1].focus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View incident INC-2026-AB12CD' })).toHaveFocus()
  })

  it('closes recording with Escape and opens another incident with its own identity', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Record Incident' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Incident' })).toHaveFocus()
    const original = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation((fn, args) => fn === 'incident_detail' ? Promise.resolve({ data: [{ ...DETAIL, ...QUEUE.find(row => row.id === args.p_incident_id) }], error: null }) : original(fn, args))
    await userEvent.click(await screen.findByRole('button', { name: 'View incident INC-2026-QQ77RR' }))
    const modal = await screen.findByRole('dialog', { name: 'Incident Details' })
    expect(within(modal.querySelector('.inc-modal-header')).getByText('INC-2026-QQ77RR')).toBeInTheDocument()
    expect(within(modal.querySelector('.inc-modal-header')).getByText('Resolved')).toBeInTheDocument()
    await userEvent.click(within(modal).getByRole('button', { name: 'Close incident details' }))
    expect(screen.getByRole('button', { name: 'View incident INC-2026-QQ77RR' })).toHaveFocus()
  })

  it('uses one body scrollbar with fixed headers, form-only footer, and stacked fields up to tablet width', () => {
    const css = fs.readFileSync(path.join(__dirname, 'Incidents.css'), 'utf8')
    expect(css).toMatch(/inc-modal \.confirm-dialog \{[^}]*max-height: 88vh;[^}]*overflow: hidden/)
    expect(css).toMatch(/inc-modal-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto/)
    expect(css).toMatch(/inc-modal-header \{ position: relative; flex: 0 0 auto/)
    expect(css).toMatch(/@media\(max-width: 768px\)[\s\S]*inc-modal \.inc-grid, \.inc-modal \.kp-summary \{ grid-template-columns: minmax\(0,1fr\)/)
  })
})


describe('incident records pagination', () => {
  const records = Array.from({ length: 41 }, (_, index) => ({
    ...QUEUE[0], id: `page-${index}`, reference: `INC-PAGE-${index + 1}`,
    incident_type: index >= 28 ? 'threat' : 'traffic_accident',
    occurred_at: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
    has_coordinates: index !== 40,
  }))
  const installPages = (data = records) => {
    const original = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation((fn, args) => {
      if (fn !== 'incident_queue') return original(fn, args)
      const filtered = data.filter(row => (!args.p_type || row.incident_type === args.p_type)
        && (!args.p_from || row.occurred_at.slice(0, 10) >= args.p_from)
        && (!args.p_to || row.occurred_at.slice(0, 10) <= args.p_to))
      return Promise.resolve({ data: filtered, error: null })
    })
  }
  const rowCount = () => within(screen.getByRole('table')).getAllByRole('row').length - 1

  it('shows ten rows, preserves order, navigates both ways, and shows one row on the final page', async () => {
    installPages()
    mount()
    expect(await screen.findByText('41 incidents \u00b7 Showing 1\u201310')).toBeInTheDocument()
    expect(rowCount()).toBe(10)
    const columns = screen.getByRole('table').querySelector('colgroup').outerHTML
    expect(screen.getByRole('table').querySelectorAll('col')).toHaveLength(7)
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByText('INC-PAGE-1')).toBeInTheDocument()
    expect(screen.queryByText('INC-PAGE-11')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('41 incidents \u00b7 Showing 11\u201320')).toBeInTheDocument()
    expect(screen.getByText('INC-PAGE-11')).toBeInTheDocument()
    expect(screen.getByRole('table').querySelector('colgroup').outerHTML).toBe(columns)
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument()
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('41 incidents \u00b7 Showing 41\u201341')).toBeInTheDocument()
    expect(rowCount()).toBe(1)
    expect(screen.getByText('INC-PAGE-41')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByText('1 incident has no coordinates and does not appear on the map.')).toBeInTheDocument()
  })

  it('paginates the filtered results and resets to page one for each type/date filter change', async () => {
    installPages()
    mount()
    await screen.findByText('Page 1 of 5')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.selectOptions(screen.getByLabelText('Filter by incident type'), 'threat')
    expect(await screen.findByText('13 incidents \u00b7 Showing 1\u201310')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('INC-PAGE-29')).toBeInTheDocument()
    expect(rowCount()).toBe(10)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowCount()).toBe(3)
    expect(screen.getByText('13 incidents \u00b7 Showing 11\u201313')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Incidents from'), '2026-10-01')
    expect(await screen.findByText('11 incidents \u00b7 Showing 1\u201310')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.type(screen.getByLabelText('Incidents up to'), '2026-10-05')
    expect(await screen.findByText('5 incidents \u00b7 Showing 1\u20135')).toBeInTheDocument()
    expect(rowCount()).toBe(5)
    expect(screen.queryByRole('navigation', { name: 'Incident records pagination' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Incidents up to'))
    await userEvent.type(screen.getByLabelText('Incidents up to'), '2026-09-01')
    expect(await screen.findByText('No incidents match this filter.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Incident records pagination' })).not.toBeInTheDocument()
  })

  it('uses singular incident wording and plural coordinate wording without counting only the visible page', async () => {
    installPages([{ ...records[0], has_coordinates: false }])
    const { unmount } = mount()
    expect(await screen.findByText('1 incident \u00b7 Showing 1\u20131')).toBeInTheDocument()
    expect(screen.getByText('1 incident has no coordinates and does not appear on the map.')).toBeInTheDocument()
    unmount()
    installPages(records.map(row => ({ ...row, has_coordinates: false })))
    mount()
    expect(await screen.findByText('41 incidents have no coordinates and do not appear on the map.')).toBeInTheDocument()
    expect(rowCount()).toBe(10)
  })
})


test('incident table fixes desktop column widths and wrapping while preserving mobile cards', () => {
  const css = fs.readFileSync(path.join(__dirname, 'Incidents.css'), 'utf8')
  const desktop = css.slice(css.indexOf('/* Column sizing depends'))
  expect(desktop).toMatch(/@media\(min-width: 769px\)[\s\S]*table-layout: fixed/)
  for (const column of ['reference', 'type', 'when', 'status', 'blotter', 'action']) {
    expect(desktop).toContain(`.inc-col-${column}`)
  }
  expect(desktop).toMatch(/white-space: nowrap; overflow-wrap: normal; word-break: normal/)
  expect(desktop).toMatch(/data-label="Type"[\s\S]*data-label="Location"[\s\S]*white-space: normal/)
  expect(desktop).toMatch(/@media\(max-width: 768px\)[\s\S]*colgroup \{ display: none/)
  expect(desktop).not.toMatch(/text-overflow:\s*ellipsis/)
})
