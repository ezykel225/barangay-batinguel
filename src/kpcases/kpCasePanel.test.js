// Combined Phase 1. The KP case panel as RENDERED, plus the source
// guards that only a scan can prove.
//
// ⚠️ Supabase is mocked at the module level: `supabaseClient.js` throws
// at import time without the env vars and `jest.mock` is hoisted above
// the imports. CRA 5's preset sets `resetMocks: true`, so every
// implementation is installed in `beforeEach` rather than in the factory.
//
// ⚠️ WHAT THESE TESTS CANNOT PROVE. The authorization is a position gate
// inside a SECURITY DEFINER function, and only SQL can prove one -- the
// role-impersonation matrix lives in this phase's report. What is pinned
// here is the half Jest can see: which controls are painted for whom,
// that a withheld case renders as a boundary rather than a fault, that
// the RPC's own sentence never reaches a screen, and that nothing here
// derives an outcome.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const { supabase } = require('../supabase/supabaseClient')
const KpCasePanel = require('./KpCasePanel').default

const SRC = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
// ⚠️ Comment-stripped. These files discuss `committee`, `supabase.from`,
// settlement and every deferred stage at length precisely to record that
// none is used.
const code = (p) => read(p).split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const CASE_ROW = {
  id: 'k1',
  reference: 'KP-2026-7HQ2MN',
  complaint_id: 'c1',
  complaint_reference: 'CMP-2026-AB12CD',
  screening_id: 's1',
  status: 'in_process',
  opened_by_name: 'Hon. Frankie Credo',
  opened_at: '2026-10-16T01:00:00.000Z',
  opening_note: 'Opened at the counter.',
  concluded_by_name: null,
  concluded_at: null,
  conclusion_note: null,
}

const HEARING = {
  id: 'h1',
  proceeding_type: 'mediation',
  hearing_date: '2026-10-20',
  start_time: '14:00:00',
  location: 'Barangay Hall session room',
  status: 'scheduled',
  presiding_note: 'Punong Barangay presiding',
  admin_notes: 'Both parties notified at the counter.',
  minutes: null,
  outcome: null,
  outcome_note: null,
  outcome_recorded_by_name: null,
  outcome_recorded_at: null,
  scheduled_by_name: 'Alexis Theress P. Tan',
  scheduled_at: '2026-10-16T02:00:00.000Z',
}

// Exactly the three columns `kp_case_parties_for()` returns -- and no
// contact number, because that function does not return one.
const PARTIES = [
  { party_id: 'p1', party_role: 'complainant', party_name: 'Ezequel Bautista' },
  { party_id: 'p2', party_role: 'respondent', party_name: 'Named Respondent' },
]

const PANEL = [
  {
    id: 'm1', member_name: 'Recorded Chair', panel_role: 'chairperson',
    assigned_by_name: 'Alexis Theress P. Tan',
    assigned_at: '2026-10-16T02:00:00.000Z',
  },
]

// ⚠️ THE AUTHORIZED CALLER, as the database actually answers.
const withCase = (overrides = {}) => {
  const hearing = { ...HEARING, ...(overrides.hearing || {}) }
  supabase.rpc.mockImplementation((fn) => {
    if (fn === 'kp_case_for_complaint') {
      return Promise.resolve({
        data: [{ ...CASE_ROW, ...(overrides.kpCase || {}) }], error: null,
      })
    }
    if (fn === 'kp_hearings_for') {
      return Promise.resolve({
        data: overrides.noHearing ? [] : [hearing], error: null,
      })
    }
    if (fn === 'kp_case_parties_for') return Promise.resolve({ data: PARTIES, error: null })
    if (fn === 'kp_case_panel_for') {
      return Promise.resolve({ data: overrides.panel ?? PANEL, error: null })
    }
    if (fn === 'kp_hearing_attendance_for') {
      return Promise.resolve({ data: overrides.attendance || [], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
}

// ⚠️ THE SCREENING THE PANEL NOW READS TO DECIDE WHETHER TO PAINT
// "Open KP case". Exactly the shape `complaint_screenings_for()`
// returns, and exactly the one state `open_kp_case()` accepts: confirmed
// by a human, and confirmed to proceed. The gate itself -- which of the
// four confirmed outcomes, and the unconfirmed and no-screening cases --
// is covered end to end in `screening/screeningConfirmFlow.test.js`,
// where the real `OfficialComplaints` wiring is on screen.
const ELIGIBLE_SCREENING = {
  id: 's1',
  checklist_version: 'v1',
  answers: {},
  recommendation: 'proceed_to_kp_process',
  recommendation_note: null,
  prepared_by_name: 'Alexis Theress P. Tan',
  prepared_at: '2026-10-16T02:00:00.000Z',
  confirmed_outcome: 'proceed_to_kp_process',
  confirmed_by_name: 'Hon. Frankie Credo',
  confirmed_at: '2026-10-16T03:00:00.000Z',
  confirmation_note: null,
  is_open: false,
}

// ⚠️ NO CASE YET: the reader returns an EMPTY ARRAY with NO ERROR. RLS
// filters rows without raising, so this is the same shape an
// unauthorized caller gets -- which is exactly why the panel must tell
// the two apart by the caller's own flags rather than by the response.
//
// ⚠️ The screening reader answers with an ELIGIBLE screening, because
// these tests are about what happens once the control is reachable. A
// panel with no confirmed screening paints no control at all, which is
// the point of the gate and is proved in the flow suite.
const withoutCase = () => {
  supabase.rpc.mockImplementation((fn) => {
    if (fn === 'complaint_screenings_for') {
      return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
}

const confirmYes = jest.fn()

beforeEach(() => {
  confirmYes.mockReset()
  confirmYes.mockResolvedValue(true)
  supabase.from.mockReturnValue({})
})

const mount = (props = {}) => render(
  <KpCasePanel complaintId="c1" confirm={confirmYes} {...props} />
)

// ── A. Who sees what ────────────────────────────────────────────────

describe('A. the restricted case', () => {
  // ⚠️ ONE NEUTRAL SENTENCE, NAMING NO POSITION, exactly as the
  // restricted complaint detail does: an ordinary official cannot grant
  // themselves records access, and naming the holder only invites
  // asking for it.
  it('gives an ordinary official one neutral sentence', async () => {
    withoutCase()
    mount()
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(/restricted to authorized records staff/i)
    expect(note.textContent).not.toMatch(/Punong|Secretary|Treasurer|Kagawad/i)
  })

  it('names no policy, function or SQLSTATE anywhere in the document', async () => {
    withoutCase()
    const { container } = mount()
    await screen.findByRole('note')
    const text = container.textContent
    ;['P0001', '42501', 'open_kp_case', 'kp_cases', 'kp_hearings',
      'row level', 'policy', 'official_account_links',
      'current_official_holds_position']
      .forEach((term) => expect(text).not.toContain(term))
  })

  // ⚠️ AND IT DOES NOT READ AS AN ERROR. A withheld record is a rule
  // working, so it is a `note` rather than an `alert`.
  it('renders the withheld case as a boundary rather than a fault', async () => {
    withoutCase()
    mount()
    await screen.findByRole('note')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ⚠️ NOTHING IS RENDERED `disabled` IN PLACE OF BEING WITHHELD. A
  // disabled control advertises a capability and cannot be told from a
  // bug -- `ActionMenu`'s own rule.
  it('withholds rather than disables', async () => {
    withoutCase()
    const { container } = mount()
    await screen.findByRole('note')
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('B. opening a case', () => {
  // ⚠️ THE PUNONG BARANGAY'S, AND ONLY HIS -- §2. The Secretary gets no
  // control for it even though she may administer everything else,
  // because `open_kp_case()` raises P0001 for her.
  it('offers the Punong Barangay a form to open one', async () => {
    withoutCase()
    mount({ isKapitan: true })
    expect(await screen.findByRole('heading', { name: /Open a KP case/i }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open KP case' })).toBeInTheDocument()
  })

  it('offers the Secretary no control to open one', async () => {
    withoutCase()
    mount({ isSecretary: true })
    await screen.findByText(/No KP case has been opened/i)
    expect(screen.queryByRole('button', { name: /Open KP case/i })).not.toBeInTheDocument()
    expect(screen.getByText(/handled by the barangay head/i)).toBeInTheDocument()
  })

  // ⚠️ IT SENDS THE COMPLAINT ID AND NOTHING ELSE. No screening id, no
  // status, no eligibility claim -- the function derives the latest
  // screening itself, so the client cannot nominate one.
  it('sends only the complaint id and an optional note', async () => {
    withoutCase()
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    await userEvent.click(screen.getByRole('button', { name: 'Open KP case' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('open_kp_case', {
        p_complaint_id: 'c1', p_note: null,
      })
    })
  })

  // ⚠️ NO AUTO-CREATION: the panel does not call `open_kp_case` on
  // mount, on a confirmed screening, or on anything but the click.
  it('opens no case until somebody clicks', async () => {
    withoutCase()
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    expect(supabase.rpc).not.toHaveBeenCalledWith('open_kp_case', expect.anything())
  })

  // ⚠️ THE RPC'S OWN SENTENCE NEVER REACHES THE SCREEN. Each refusal is
  // mapped to this module's words, so a message naming the position
  // gate stays out of a room somebody may be standing in.
  it('reads a position refusal as its own sentence', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'open_kp_case') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'Only the Punong Barangay can open a KP case.',
          },
        })
      }
      // ⚠️ The gate's own input: these tests are about what the RPC
      // answers AFTER the control is reachable, so the screening reader
      // must say the control may be painted at all.
      if (fn === 'complaint_screenings_for') {
        return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    await userEvent.click(screen.getByRole('button', { name: 'Open KP case' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/handled by the barangay head/i)
    expect(alert.textContent).not.toMatch(/Only the Punong Barangay can open/)
    expect(alert.textContent).not.toMatch(/P0001/)
  })

  it('reads a duplicate refusal as its own sentence', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'open_kp_case') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'A KP case has already been opened for this complaint.',
          },
        })
      }
      // ⚠️ The gate's own input: these tests are about what the RPC
      // answers AFTER the control is reachable, so the screening reader
      // must say the control may be painted at all.
      if (fn === 'complaint_screenings_for') {
        return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    await userEvent.click(screen.getByRole('button', { name: 'Open KP case' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent(/already been opened for this complaint/i)
  })

  // ⚠️ THE SCREENING REFUSALS READ AS THEIR OWN SENTENCES TOO, so an
  // official learns the case is not openable YET rather than that
  // something broke.
  it('reads an unconfirmed screening as its own sentence', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'open_kp_case') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: "This complaint's latest screening has not been confirmed yet.",
          },
        })
      }
      // ⚠️ The gate's own input: these tests are about what the RPC
      // answers AFTER the control is reachable, so the screening reader
      // must say the control may be painted at all.
      if (fn === 'complaint_screenings_for') {
        return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    await userEvent.click(screen.getByRole('button', { name: 'Open KP case' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent(/needs a confirmed review before a case can be opened/i)
  })

  it('reads a wrong confirmed outcome as its own sentence', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'open_kp_case') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'A KP case can only be opened when the confirmed screening says to proceed with the KP process.',
          },
        })
      }
      // ⚠️ The gate's own input: these tests are about what the RPC
      // answers AFTER the control is reachable, so the screening reader
      // must say the control may be painted at all.
      if (fn === 'complaint_screenings_for') {
        return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    await userEvent.click(screen.getByRole('button', { name: 'Open KP case' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent(/does not say to proceed with the KP process/i)
  })

  // ⚠️ PROVED BY SUBMITTING THE FORM, not by clicking a disabled
  // button. P3-B2's first version of this test clicked a `disabled`
  // control and so passed either way; a keyboard Enter beating the
  // re-render is also the real case.
  it('opens one case when the form is submitted three times', async () => {
    let release
    const held = new Promise((resolve) => { release = resolve })
    let calls = 0
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'open_kp_case') {
        calls += 1
        return held.then(() => ({ data: 'KP-2026-7HQ2MN', error: null }))
      }
      if (fn === 'complaint_screenings_for') {
        return Promise.resolve({ data: [ELIGIBLE_SCREENING], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    const { container } = mount({ isKapitan: true })
    await screen.findByRole('button', { name: 'Open KP case' })
    const form = container.querySelector('form')
    form.requestSubmit()
    form.requestSubmit()
    form.requestSubmit()
    expect(calls).toBe(1)
    release()
  })
})

// ── C. The case file ───────────────────────────────────────────────

describe('C. the case file', () => {
  it('shows the reference, the status in words and who opened it', async () => {
    withCase()
    mount({ isSecretary: true })
    expect(await screen.findByText('KP-2026-7HQ2MN')).toBeInTheDocument()
    expect(screen.getByText('In process')).toBeInTheDocument()
    expect(screen.getByText('Hon. Frankie Credo')).toBeInTheDocument()
  })

  // ⚠️ NO RAW STORED VALUE REACHES A SCREEN -- the project's own rule.
  it('prints no stored identifier as a word', async () => {
    withCase()
    const { container } = mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    ;['in_process', 'pangkat_hearing', 'mediation_', 'chairperson_']
      .forEach((raw) => expect(container.textContent).not.toContain(raw))
  })

  it('reads the case from the gated reader and never from a table', async () => {
    withCase()
    mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(supabase.rpc).toHaveBeenCalledWith('kp_case_for_complaint', {
      p_complaint_id: 'c1',
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ── D. The panel ───────────────────────────────────────────────────

describe('D. the recorded panel', () => {
  // ⚠️ §3: the roster is marked as requiring barangay confirmation, in
  // words a reader sees.
  it('marks the roster as provisional on screen', async () => {
    withCase()
    mount({ isSecretary: true })
    expect(await screen.findByText(/requires barangay confirmation/i))
      .toBeInTheDocument()
    expect(screen.getByText(/no Lupon or Pangkat membership/i)).toBeInTheDocument()
  })

  // ⚠️ NO NAME IS SUGGESTED, DEFAULTED OR OFFERED FROM A LIST. A picker
  // fed from `barangay_officials` would assert that an official is a
  // Lupon member, which P2.5 established nothing in this repository
  // records.
  it('offers a free-text name and no roster to choose from', async () => {
    withCase({ panel: [] })
    mount({ isSecretary: true })
    const input = await screen.findByLabelText('Member name')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('')
    expect(screen.queryByRole('combobox', { name: /Member name/i })).not.toBeInTheDocument()
  })

  it('records a member the Secretary typed', async () => {
    withCase({ panel: [] })
    mount({ isSecretary: true })
    const input = await screen.findByLabelText('Member name')
    await userEvent.type(input, 'Recorded Person')
    await userEvent.click(screen.getByRole('button', { name: 'Record member' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('assign_kp_panel_member', {
        p_case_id: 'k1', p_member_name: 'Recorded Person', p_panel_role: 'chairperson',
      })
    })
  })

  // ⚠️ A THREE-PERSON PANEL, and the form stops offering a fourth.
  it('stops offering the form once three are recorded', async () => {
    withCase({
      panel: [
        { id: 'm1', member_name: 'A', panel_role: 'chairperson', assigned_by_name: null, assigned_at: null },
        { id: 'm2', member_name: 'B', panel_role: 'member', assigned_by_name: null, assigned_at: null },
        { id: 'm3', member_name: 'C', panel_role: 'member', assigned_by_name: null, assigned_at: null },
      ],
    })
    mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.queryByLabelText('Member name')).not.toBeInTheDocument()
  })

  it('offers an ordinary reader no panel form', async () => {
    withCase({ panel: [] })
    mount()
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.queryByLabelText('Member name')).not.toBeInTheDocument()
  })
})

// ── E. Scheduling ──────────────────────────────────────────────────

describe('E. scheduling a proceeding', () => {
  it('schedules one for the Secretary', async () => {
    withCase({ noHearing: true })
    mount({ isSecretary: true })
    await screen.findByLabelText('Place')
    await userEvent.selectOptions(screen.getByLabelText('Proceeding'), 'pangkat_hearing')
    await userEvent.type(screen.getByLabelText('Date'), '2026-10-20')
    await userEvent.type(screen.getByLabelText('Start time'), '14:00')
    await userEvent.type(screen.getByLabelText('Place'), 'Session room')
    await userEvent.click(screen.getByRole('button', { name: 'Schedule proceeding' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('schedule_kp_hearing', expect.objectContaining({
        p_case_id: 'k1',
        p_proceeding_type: 'pangkat_hearing',
        p_hearing_date: '2026-10-20',
        p_location: 'Session room',
      }))
    })
  })

  // ⚠️ NO STATUTORY DEADLINE IS SUGGESTED OR DEFAULTED. The date field
  // opens empty: a proposed date would assert a period nobody supplied.
  it('proposes no date and no time', async () => {
    withCase({ noHearing: true })
    mount({ isSecretary: true })
    expect(await screen.findByLabelText('Date')).toHaveValue('')
    expect(screen.getByLabelText('Start time')).toHaveValue('')
  })

  it('offers the three proceeding types and nothing else', async () => {
    withCase({ noHearing: true })
    mount({ isSecretary: true })
    const select = await screen.findByLabelText('Proceeding')
    const values = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(values).toEqual(['mediation', 'pangkat_hearing', 'other'])
  })

  it('offers an ordinary reader no scheduling form', async () => {
    withCase({ noHearing: true })
    mount()
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.queryByLabelText('Place')).not.toBeInTheDocument()
  })

  it('shows a scheduled proceeding with its date, time and place', async () => {
    withCase()
    mount({ isSecretary: true })
    expect(await screen.findByRole('heading', { name: /Mediation — 20 October 2026, 2:00 PM/ }))
      .toBeInTheDocument()
    expect(screen.getByText(/Barangay Hall session room/, { selector: '.kp-meta' })).toBeInTheDocument()
  })
})

// ── F. Attendance ──────────────────────────────────────────────────

describe('F. attendance and non-appearance', () => {
  it('records attendance against a party of this case', async () => {
    withCase()
    mount({ isSecretary: true })
    const select = await screen.findByLabelText('Attendance for Ezequel Bautista')
    await userEvent.selectOptions(select, 'present')
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('record_kp_attendance', {
        p_hearing_id: 'h1', p_party_id: 'p1', p_attendance: 'present', p_note: null,
      })
    })
  })

  // ⚠️ NON-APPEARANCE IS A RECORD, offered in the same list as the other
  // two and worded as what happened.
  it('offers present, did-not-appear and excused', async () => {
    withCase()
    mount({ isSecretary: true })
    const select = await screen.findByLabelText('Attendance for Ezequel Bautista')
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(labels).toEqual(['Not recorded', 'Present', 'Did not appear', 'Excused'])
  })

  it('shows what was already recorded', async () => {
    withCase({
      attendance: [{
        id: 'a1', party_id: 'p2', party_role: 'respondent',
        party_name: 'Named Respondent', attendance: 'absent',
        attendance_note: null, recorded_by_name: 'Alexis Theress P. Tan',
        recorded_at: '2026-10-20T06:00:00.000Z',
      }],
    })
    mount({ isSecretary: true })
    const select = await screen.findByLabelText('Attendance for Named Respondent')
    expect(select).toHaveValue('absent')
  })

  // ⚠️ AN UNRECORDED PARTY READS "Not recorded" rather than blank. A
  // blank cell reads as a value that failed to load, which is the defect
  // `EventDetails` and the withheld contact both exist to avoid.
  it('reads an unrecorded party as a statement, not a blank', async () => {
    withCase()
    mount()
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
  })

  // ⚠️ NO PARTY CONTACT NUMBER IS RENDERED, because neither reader
  // returns one. Asserted from a fixture that has none, which is the
  // honest shape -- the function's own column list is what withholds it,
  // and `kpCaseMigration.test.js` asserts that.
  it('renders no contact number for any party', async () => {
    withCase()
    const { container } = mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(container.textContent).not.toMatch(/09\d{9}/)
  })

  it('offers an ordinary reader no attendance control', async () => {
    withCase()
    mount()
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.queryByLabelText(/Attendance for/)).not.toBeInTheDocument()
  })
})

// ── G. The outcome ────────────────────────────────────────────────

describe('G. the proceeding outcome', () => {
  // ⚠️ THE PUNONG BARANGAY'S, AND THE SECRETARY GETS NO CONTROL FOR IT
  // even with a record open -- `record_kp_hearing_outcome()` raises
  // P0001 for her.
  it('offers the Punong Barangay a control', async () => {
    withCase()
    mount({ isKapitan: true })
    expect(await screen.findByLabelText('Outcome')).toBeInTheDocument()
  })

  it('offers the Secretary no outcome control even with a record open', async () => {
    withCase()
    mount({ isSecretary: true })
    await screen.findByLabelText('Minutes')
    expect(screen.queryByLabelText('Outcome')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record outcome' })).not.toBeInTheDocument()
  })

  it('offers the four outcomes and nothing else', async () => {
    withCase()
    mount({ isKapitan: true })
    const select = await screen.findByLabelText('Outcome')
    const values = [...select.querySelectorAll('option')].map((o) => o.value).filter(Boolean)
    expect(values).toEqual([
      'unresolved_continue_process',
      'resolved_agreement_recorded',
      'referral_needed',
      'further_hearing_needed',
    ])
  })

  // ⚠️ THE OUTCOME SENT IS THE ONE A HUMAN PICKED, and nothing derives
  // it. The fixture records every party absent, which a scorer would
  // read as a reason to conclude something -- and the panel sends only
  // what was chosen.
  it('sends the outcome a human chose, not one derived from attendance', async () => {
    withCase({
      attendance: [
        { id: 'a1', party_id: 'p1', party_role: 'complainant', party_name: 'Ezequel Bautista', attendance: 'absent', attendance_note: null, recorded_by_name: null, recorded_at: null },
        { id: 'a2', party_id: 'p2', party_role: 'respondent', party_name: 'Named Respondent', attendance: 'absent', attendance_note: null, recorded_by_name: null, recorded_at: null },
      ],
    })
    mount({ isKapitan: true })
    const select = await screen.findByLabelText('Outcome')
    await userEvent.selectOptions(select, 'resolved_agreement_recorded')
    await userEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('record_kp_hearing_outcome',
        expect.objectContaining({ p_outcome: 'resolved_agreement_recorded' }))
    })
  })

  // ⚠️ WHETHER THE CASE IS CONCLUDED IS A SEPARATE ANSWER, and it
  // defaults to FALSE: "Resolved — agreement recorded" does not conclude
  // the case by itself, because the barangay may keep it open.
  it('does not conclude the case unless a human ticks the box', async () => {
    withCase()
    mount({ isKapitan: true })
    const select = await screen.findByLabelText('Outcome')
    await userEvent.selectOptions(select, 'resolved_agreement_recorded')
    await userEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('record_kp_hearing_outcome',
        expect.objectContaining({ p_concludes_case: false }))
    })
  })

  it('concludes it when a human does tick the box', async () => {
    withCase()
    mount({ isKapitan: true })
    const select = await screen.findByLabelText('Outcome')
    await userEvent.selectOptions(select, 'referral_needed')
    await userEvent.click(screen.getByLabelText(/Also record that this case is concluded/i))
    await userEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('record_kp_hearing_outcome',
        expect.objectContaining({ p_concludes_case: true }))
    })
  })

  // ⚠️ THROUGH THE SHARED `useConfirm`, and the dialog names the outcome
  // IN WORDS rather than as an identifier.
  it('asks for confirmation, naming the outcome in words', async () => {
    withCase()
    mount({ isKapitan: true })
    await userEvent.selectOptions(await screen.findByLabelText('Outcome'), 'referral_needed')
    await userEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => expect(confirmYes).toHaveBeenCalled())
    const arg = confirmYes.mock.calls[0][0]
    expect(arg.message).toContain('Referral needed')
    expect(arg.message).not.toContain('referral_needed')
    expect(arg.destructive).toBe(false)
  })

  it('records nothing when the confirmation is declined', async () => {
    confirmYes.mockResolvedValue(false)
    withCase()
    mount({ isKapitan: true })
    await userEvent.selectOptions(await screen.findByLabelText('Outcome'), 'referral_needed')
    await userEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    await waitFor(() => expect(confirmYes).toHaveBeenCalled())
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'record_kp_hearing_outcome', expect.anything(),
    )
  })

  // ⚠️ A RECORDED OUTCOME IS READ-ONLY, with no control to change it --
  // the RPC and the trigger both refuse a second one.
  it('renders a recorded outcome read-only', async () => {
    withCase({
      hearing: {
        outcome: 'resolved_agreement_recorded',
        outcome_note: 'Agreement read back to both parties.',
        outcome_recorded_by_name: 'Hon. Frankie Credo',
        outcome_recorded_at: '2026-10-20T07:00:00.000Z',
        status: 'completed',
      },
    })
    mount({ isKapitan: true })
    expect(await screen.findByText(/Resolved — agreement recorded/))
      .toBeInTheDocument()
    expect(screen.queryByLabelText('Outcome')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Minutes')).not.toBeInTheDocument()
  })
})

// ── H. Minutes and status ─────────────────────────────────────────

describe('H. minutes and status', () => {
  it('lets the Secretary save a status, minutes and notes', async () => {
    withCase()
    mount({ isSecretary: true })
    await userEvent.type(await screen.findByLabelText('Minutes'), 'Both parties heard.')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'completed')
    await userEvent.click(screen.getByRole('button', { name: 'Save record' }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('update_kp_hearing_record',
        expect.objectContaining({
          p_hearing_id: 'h1',
          p_status: 'completed',
          p_minutes: 'Both parties heard.',
        }))
    })
  })

  it('offers the four hearing statuses', async () => {
    withCase()
    mount({ isSecretary: true })
    const select = await screen.findByLabelText('Status')
    expect([...select.querySelectorAll('option')].map((o) => o.value))
      .toEqual(['scheduled', 'completed', 'cancelled', 'rescheduled'])
  })

  // ⚠️ INTERNAL NOTES AND MINUTES RENDER ONLY INSIDE THE AUTHORIZED
  // CASE FILE. An ordinary official reached the restricted sentence
  // before any of this, so the assertion is that they are not in the
  // document at all.
  it('renders no minutes or internal note for an ordinary official', async () => {
    withoutCase()
    const { container } = mount()
    await screen.findByRole('note')
    expect(container.textContent).not.toContain('Both parties notified')
    expect(container.textContent).not.toContain('Minutes')
  })
})

// ── I. Source guards ─────────────────────────────────────────────

describe('I. the wiring', () => {
  const PANEL_SRC = code('kpcases/KpCasePanel.jsx')
  const API_SRC = code('kpcases/kpCaseApi.js')

  // ⚠️ THE FOUR KP TABLES CARRY NO CLIENT PRIVILEGE, so a table read
  // would be refused `42501` and nothing here could be "improved" by
  // one.
  it('never calls supabase.from', () => {
    expect(PANEL_SRC).not.toContain('supabase.from')
    expect(API_SRC).not.toContain('supabase.from')
    expect(PANEL_SRC).not.toContain('from(')
  })

  // ⚠️ A BARE TABLE NAME, AND THAT SCOPE IS MY OWN SCAN CORRECTED. The
  // first version used `not.toContain` and flagged the legitimate reader
  // `kp_case_panel_for`, because the RPC's name CONTAINS the table's --
  // the same false positive P4-A hit when `complaint_screenings_for`
  // tripped a scan for `complaint_screenings`.
  //
  // The property is that no table is named except as part of a gated
  // reader's own name, so every occurrence is required to be followed by
  // `_for`, and a bare one fails. STRICTER than a substring scan, not
  // weaker: `supabase.from('kp_cases')` would now fail on the table AND
  // on the `supabase.from` guard above.
  it('names every KP table only as part of a gated reader', () => {
    ;['kp_cases', 'kp_case_panel', 'kp_hearings', 'kp_hearing_attendance']
      .forEach((table) => {
        [PANEL_SRC, API_SRC].forEach((src) => {
          const hits = [...src.matchAll(new RegExp(`${table}(_for)?`, 'g'))]
          hits.forEach((hit) => expect(hit[1]).toBe('_for'))
        })
      })
  })

  // ⚠️ AND THE PRIVATE TABLES OF EARLIER PHASES ARE NAMED NOWHERE AT
  // ALL -- none of their names is a prefix of a reader this phase calls,
  // so a bare scan is the right shape for these three.
  it('names no private table from an earlier phase', () => {
    ;['complaint_screenings', 'complaint_status_history',
      'official_account_links', 'complaint_parties', 'complaint_attachments']
      .forEach((table) => {
        expect(PANEL_SRC).not.toContain(table)
        expect(API_SRC).not.toContain(table)
      })
  })

  // ⚠️ `committee` IS NOT READ. A real `Peace and Order and
  // Appropriation` value exists on one Kagawad and grants nothing.
  it('reads committee nowhere', () => {
    expect(PANEL_SRC).not.toContain('committee')
    expect(API_SRC).not.toContain('committee')
  })

  it('authorizes on no name', () => {
    ;[PANEL_SRC, API_SRC].forEach((src) => {
      expect(src).not.toMatch(/full_name\s*===/)
      expect(src).not.toMatch(/\.eq\('full_name'/)
    })
  })

  // ⚠️ NO DERIVED DECISION ANYWHERE. A function that read the attendance
  // or the minutes to propose an outcome would make the software the
  // decider, and §1 and §6 both forbid it.
  it('derives no outcome, recommendation or conclusion', () => {
    ;[PANEL_SRC, API_SRC].forEach((src) => {
      ;['deriveOutcome', 'computeOutcome', 'suggestOutcome', 'autoConclude',
        'shouldConclude', 'recommendOutcome', 'outcomeFromAttendance']
        .forEach((name) => expect(src).not.toContain(name))
    })
    // the conclusion is read off the human's checkbox and nowhere else
    expect(PANEL_SRC).toMatch(/concludesCase: concludes/)
    expect(PANEL_SRC).toMatch(/draft\.concludes/)
  })

  // ⚠️ NO STATUS IS SENT FOR A COMPLAINT, and no history note. The
  // complaint's stage stays where 042 left it.
  it('writes nothing to the complaint or its history', () => {
    ;[PANEL_SRC, API_SRC].forEach((src) => {
      expect(src).not.toMatch(/p_status:\s*'(received|under_review|screened)'/)
      expect(src).not.toContain('complaint_history')
      expect(src).not.toContain('.update(')
      expect(src).not.toContain('.insert(')
      expect(src).not.toContain('.delete(')
    })
  })

  // ⚠️ AND NO DEFERRED STAGE IS NAMED -- §10, each one individually so
  // a failure says which appeared.
  it('names none of the deferred stages', () => {
    const both = (PANEL_SRC + API_SRC).toLowerCase()
    ;['settlement', 'repudiat', 'certificate to file', 'jurisdiction',
      'blotter', 'tanod', 'heatmap', 'latitude', 'longitude', 'sms']
      .forEach((term) => expect(both).not.toContain(term))
  })

  // ⚠️ THE DASHBOARD STILL HOLDS NO KP STATE. All of it lives here, and
  // `OfficialDashboard.jsx` is ~5,640 lines already.
  it('leaves OfficialDashboard holding no KP state', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    ;['kp_case', 'open_kp_case', 'kp_hearings_for', 'KpCasePanel',
      'kpCase', 'hearing']
      .forEach((term) => expect(dash).not.toContain(term))
  })

  // ⚠️ AND NO RESIDENT OR PUBLIC SURFACE MENTIONS A KP CASE. Every
  // resident-facing complaint file is scanned, which is the guard P4-A
  // made of the screening and this phase extends.
  it('leaves every resident and public surface free of KP vocabulary', () => {
    ;['complaints/FileComplaintForm.jsx', 'complaints/MyComplaints.jsx',
      'complaints/complaintApi.js', 'complaints/complaintLabels.js',
      'complaints/complaintQueue.js', 'pages/TrackComplaint.jsx']
      .forEach((file) => {
        const src = code(file).toLowerCase()
        ;['kp_case', 'kp case', 'kpcase', 'hearing', 'summons', 'mediation',
          'pangkat', 'lupon', 'attendance', 'minutes', 'panel_role',
          'proceeding']
          .forEach((term) => expect(src).not.toContain(term))
      })
  })
})
