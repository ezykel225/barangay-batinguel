// PR #45 blocker. A KP case whose hearing outcome was recorded WITHOUT
// concluding it could not afterwards be concluded at all.
//
// ⚠️ THE ORIGINAL FAILURE, in one line. `record_kp_hearing_outcome()`
// takes `p_concludes_case` as a SEPARATE human answer -- which is right,
// and Combined Phase 1's whole point: "Resolved -- agreement recorded"
// does not conclude a case by itself, because the barangay may keep it
// open. But ONE outcome per hearing is immutable at two layers (the RPC
// refuses a second, and `protect_kp_record()` refuses any update to a
// hearing that has one), and that RPC was the ONLY writer of
// `kp_cases.status = 'concluded'`. So answering "no" once put the case
// beyond conclusion from that hearing for good.
//
// Measured in Final Integration's Flow A trace:
//
//   10  outcome=resolved_agreement_recorded concludes=false -> in_process
//   10b CONCLUDE -> P0001 This hearing already has a recorded outcome.
//
// ⚠️ WHAT THIS SUITE DOES AND DOES NOT PROVE. The authorization is a
// position gate inside a SECURITY DEFINER function, and only SQL can
// prove one -- the A-H role-impersonation matrix lives in this fix's
// report. What is pinned here is the half Jest can see: that recording
// an outcome without concluding leaves the case open AND reachable,
// that the historical outcome gains no edit control, that the later
// conclusion is painted for the Punong Barangay alone, that it cannot
// run twice, and that it writes nothing else.
//
// ⚠️ IT WAS RUN AGAINST PR #45 BEFORE THE FIX and 11 of its 23 tests
// failed. The 12 that passed do so honestly: they are the
// withheld-control cases, which correctly show nothing either way, plus
// the two that cover the EXISTING `p_concludes_case` path, which the fix
// deliberately leaves alone.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const { supabase } = require('../supabase/supabaseClient')
const KpCasePanel = require('./KpCasePanel').default

const CASE_OPEN = {
  id: 'k1',
  reference: 'KP-2026-7HQ2MN',
  complaint_id: 'c1',
  complaint_reference: 'CMP-2026-AB12CD',
  screening_id: 's1',
  status: 'in_process',
  opened_by_name: 'Hon. Frankie Credo',
  opened_at: '2026-10-16T01:00:00.000Z',
  opening_note: null,
  concluded_by_name: null,
  concluded_at: null,
  conclusion_note: null,
}

const HEARING_OPEN = {
  id: 'h1',
  proceeding_type: 'mediation',
  hearing_date: '2026-10-20',
  start_time: '14:00:00',
  location: 'Barangay Hall session room',
  status: 'scheduled',
  presiding_note: null,
  admin_notes: null,
  minutes: null,
  outcome: null,
  outcome_note: null,
  outcome_recorded_by_name: null,
  outcome_recorded_at: null,
  scheduled_by_name: 'Alexis Theress P. Tan',
  scheduled_at: '2026-10-16T02:00:00.000Z',
}

// ⚠️ THE EXACT STATE THE BLOCKER PRODUCES: an outcome is on the record,
// it did NOT conclude the case, and the case is still open.
const HEARING_SETTLED = {
  ...HEARING_OPEN,
  status: 'completed',
  minutes: 'Both parties attended and signed the record.',
  outcome: 'resolved_agreement_recorded',
  outcome_note: 'Agreement read back to both parties.',
  outcome_recorded_by_name: 'Hon. Frankie Credo',
  outcome_recorded_at: '2026-10-20T07:00:00.000Z',
}

const PARTIES = [
  { party_id: 'p1', party_role: 'complainant', party_name: 'Ezequel Bautista' },
  { party_id: 'p2', party_role: 'respondent', party_name: 'Named Respondent' },
]

const calls = () => supabase.rpc.mock.calls

const withCase = ({ kpCase = {}, hearing = HEARING_SETTLED } = {}) => {
  supabase.rpc.mockImplementation((fn) => {
    if (fn === 'kp_case_for_complaint') {
      return Promise.resolve({ data: [{ ...CASE_OPEN, ...kpCase }], error: null })
    }
    if (fn === 'kp_hearings_for') {
      return Promise.resolve({ data: hearing ? [hearing] : [], error: null })
    }
    if (fn === 'kp_case_parties_for') return Promise.resolve({ data: PARTIES, error: null })
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

const concludeControl = () => screen.queryByRole('button', { name: /^Conclude case$/i })

// ── A. Recording an outcome that does not conclude the case ─────────

describe('A. an outcome recorded without concluding the case', () => {
  it('sends concludes_case false, exactly as the human answered', async () => {
    withCase({ hearing: HEARING_OPEN })
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.selectOptions(
      screen.getByLabelText('Outcome'), 'resolved_agreement_recorded',
    )
    // ⚠️ The conclude checkbox is deliberately LEFT UNCHECKED -- this is
    // the input that produced the blocker.
    await userEvent.click(screen.getByRole('button', { name: /record outcome/i }))

    await waitFor(() => {
      const call = calls().find(([fn]) => fn === 'record_kp_hearing_outcome')
      expect(call).toBeDefined()
      expect(call[1].p_concludes_case).toBe(false)
    })
  })

  // ⚠️ The checkbox still works, so the fix adds a second path rather
  // than replacing the first. Both directions.
  it('still sends true when the human does tick the box', async () => {
    withCase({ hearing: HEARING_OPEN })
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.selectOptions(
      screen.getByLabelText('Outcome'), 'resolved_agreement_recorded',
    )
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /record outcome/i }))

    await waitFor(() => {
      const call = calls().find(([fn]) => fn === 'record_kp_hearing_outcome')
      expect(call[1].p_concludes_case).toBe(true)
    })
  })
})

// ── B. The case is still open afterwards ────────────────────────────

describe('B. the case after that outcome', () => {
  it('still reads as an open case, not a concluded one', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.getByText('In process')).toBeInTheDocument()
    expect(screen.queryByText('Concluded')).not.toBeInTheDocument()
  })

  // ⚠️ THE BLOCKER ITSELF. Before the fix there was no later action at
  // all, so an open case with a recorded outcome was terminal.
  it('offers the barangay head a later way to conclude it', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(concludeControl()).toBeInTheDocument()
  })
})

// ── C. The historical outcome is still immutable ────────────────────

describe('C. the recorded outcome', () => {
  it('renders read-only, with no control to change it', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    expect(screen.getByText(/Resolved — agreement recorded/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Outcome')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record outcome/i })).not.toBeInTheDocument()
  })

  // ⚠️ ABSENT, NEVER DISABLED -- `ActionMenu`'s own rule. A disabled
  // control advertises a capability and cannot be told from a bug.
  it('leaves nothing disabled in place of the withheld edit', async () => {
    withCase()
    const { container } = mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0)
  })
})

// ── D. The Punong Barangay can conclude it later ────────────────────

describe('D. concluding the case later', () => {
  it('asks an intentional confirmation naming no legal judgment', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.click(concludeControl())

    await waitFor(() => expect(confirmYes).toHaveBeenCalledTimes(1))
    const asked = confirmYes.mock.calls[0][0]
    expect(`${asked.title} ${asked.message}`).toMatch(/conclude/i)
    // ⚠️ It records that the barangay is closing its own file. It must
    // not read as a finding about anybody.
    ;[/guilty/i, /liable/i, /dismiss/i, /jurisdiction/i, /penalt/i, /fine/i,
      /eligib/i, /in favou?r of/i, /settled in/i, /judg/i, /convict/i]
      .forEach((pattern) => {
        expect(`${asked.title} ${asked.message} ${asked.confirmLabel}`)
          .not.toMatch(pattern)
      })
  })

  it('calls the conclusion RPC once, with the case id', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.click(concludeControl())

    await waitFor(() => {
      const made = calls().filter(([fn]) => fn === 'conclude_kp_case')
      expect(made).toHaveLength(1)
      expect(made[0][1].p_case_id).toBe('k1')
    })
  })

  it('writes nothing when the confirmation is declined', async () => {
    confirmYes.mockResolvedValue(false)
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.click(concludeControl())

    await waitFor(() => expect(confirmYes).toHaveBeenCalled())
    expect(calls().some(([fn]) => fn === 'conclude_kp_case')).toBe(false)
  })

  // ⚠️ The case has to have something to conclude FROM. The database
  // refuses a case with no recorded proceeding outcome, so the control
  // is not painted for one either.
  it('is not offered while no proceeding outcome is on the record', async () => {
    withCase({ hearing: HEARING_OPEN })
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(concludeControl()).not.toBeInTheDocument()
  })

  it('is not offered when the case has no hearing at all', async () => {
    withCase({ hearing: null })
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(concludeControl()).not.toBeInTheDocument()
  })
})

// ── E and F. Nobody else may conclude a case ────────────────────────

describe('E. the Barangay Secretary', () => {
  it('gets no conclude control, even with a recorded outcome in front of her', async () => {
    withCase()
    mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(concludeControl()).not.toBeInTheDocument()
  })

  it('is not offered one disabled either', async () => {
    withCase()
    const { container } = mount({ isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(container.textContent).not.toMatch(/conclude case/i)
  })
})

describe('F. an ordinary official', () => {
  it('gets no conclude control', async () => {
    withCase()
    mount()
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(concludeControl()).not.toBeInTheDocument()
  })
})

// ── G. It cannot run twice ──────────────────────────────────────────

describe('G. a case already concluded', () => {
  it('offers no conclude control at all', async () => {
    withCase({
      kpCase: {
        status: 'concluded',
        concluded_by_name: 'Hon. Frankie Credo',
        concluded_at: '2026-10-21T01:00:00.000Z',
        conclusion_note: 'Closed on the recorded agreement.',
      },
    })
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.getByText('Concluded')).toBeInTheDocument()
    expect(concludeControl()).not.toBeInTheDocument()
  })

  it('renders the concluded case read-only, with no write control anywhere', async () => {
    withCase({
      kpCase: {
        status: 'concluded',
        concluded_by_name: 'Hon. Frankie Credo',
        concluded_at: '2026-10-21T01:00:00.000Z',
      },
    })
    mount({ isKapitan: true, isSecretary: true })
    await screen.findByText('KP-2026-7HQ2MN')
    expect(screen.queryByRole('button', { name: /schedule proceeding/i }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record outcome/i }))
      .not.toBeInTheDocument()
    expect(concludeControl()).not.toBeInTheDocument()
  })

  // ⚠️ SUBMITTED AS A FORM, not clicked as a disabled button. React
  // batches `setBusy`, so the `disabled` attribute only guards ACROSS
  // renders; the real case is a keyboard Enter beating the re-render,
  // and a second call would be a second conclusion. P3-B2's first
  // version of this test proved nothing because it clicked a disabled
  // control.
  it('cannot be concluded twice by a double submit', async () => {
    let release
    const held = new Promise((resolve) => { release = resolve })
    withCase()
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'kp_case_for_complaint') {
        return Promise.resolve({ data: [CASE_OPEN], error: null })
      }
      if (fn === 'kp_hearings_for') {
        return Promise.resolve({ data: [HEARING_SETTLED], error: null })
      }
      if (fn === 'kp_case_parties_for') return Promise.resolve({ data: PARTIES, error: null })
      if (fn === 'conclude_kp_case') return held.then(() => ({ data: 'k1', error: null }))
      return Promise.resolve({ data: [], error: null })
    })

    const { container } = mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    const form = concludeControl().closest('form')
    expect(form).not.toBeNull()
    await userEvent.click(concludeControl())
    await waitFor(() => expect(
      calls().filter(([fn]) => fn === 'conclude_kp_case'),
    ).toHaveLength(1))

    const { fireEvent } = require('@testing-library/react')
    fireEvent.submit(form)
    fireEvent.submit(form)
    release()

    await waitFor(() => expect(container).toBeInTheDocument())
    expect(calls().filter(([fn]) => fn === 'conclude_kp_case')).toHaveLength(1)
  })
})

// ── H. Nothing else is rewritten ────────────────────────────────────

describe('H. what concluding does not touch', () => {
  it('calls no hearing, screening or complaint writer', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')

    await userEvent.click(concludeControl())
    await waitFor(() => expect(
      calls().some(([fn]) => fn === 'conclude_kp_case'),
    ).toBe(true))

    const forbidden = [
      'record_kp_hearing_outcome', 'update_kp_hearing_record',
      'schedule_kp_hearing', 'record_kp_attendance', 'assign_kp_panel_member',
      'open_kp_case', 'prepare_complaint_screening',
      'confirm_complaint_screening', 'track_complaint',
    ]
    calls().forEach(([fn]) => expect(forbidden).not.toContain(fn))
  })

  it('never reaches a table directly', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    await userEvent.click(concludeControl())
    await waitFor(() => expect(
      calls().some(([fn]) => fn === 'conclude_kp_case'),
    ).toBe(true))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // ⚠️ The recorded outcome is still on screen afterwards, from the same
  // reader -- so the refresh cannot be mistaken for the hearing having
  // been rewritten.
  it('leaves the recorded outcome and its actor on screen', async () => {
    withCase()
    mount({ isKapitan: true })
    await screen.findByText('KP-2026-7HQ2MN')
    await userEvent.click(concludeControl())
    await waitFor(() => expect(
      calls().some(([fn]) => fn === 'conclude_kp_case'),
    ).toBe(true))
    expect(screen.getByText(/Resolved — agreement recorded/i)).toBeInTheDocument()
    expect(screen.getByText(/recorded by Hon\. Frankie Credo/i)).toBeInTheDocument()
  })
})

// ── I. The source guards a scan has to make ─────────────────────────

describe('I. the wiring', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8')
  const stripped = (p) => read(p).split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  // ⚠️ ONE RPC, AND NO SECOND WAY. The four KP tables carry no client
  // privilege, so a direct write is `42501` -- but a scan is what keeps
  // somebody from reaching for one later.
  it('concludes through the RPC and never through a table', () => {
    const api = stripped('kpCaseApi.js')
    expect(api).toContain("supabase.rpc('conclude_kp_case'")
    expect(api).not.toContain('supabase.from')
  })

  // ⚠️ The conclusion writes the CASE. It must send no hearing id, no
  // outcome and no status -- `status`, `concluded_by` and `concluded_at`
  // are all stamped server-side.
  it('sends the case id and an optional note, and nothing else', () => {
    const api = stripped('kpCaseApi.js')
    const fn = api.slice(api.indexOf("supabase.rpc('conclude_kp_case'"))
      .slice(0, 400)
    expect(fn).toContain('p_case_id')
    ;['p_hearing_id', 'p_outcome', 'p_status', 'p_concluded_by', 'p_concluded_at',
      'p_concludes_case'].forEach((param) => expect(fn).not.toContain(param))
  })

  it('gates the control on the Punong Barangay flag and an open case', () => {
    const panel = stripped('KpCasePanel.jsx')
    expect(panel).toMatch(/mayConcludeCase/)
    expect(panel).toMatch(/isKapitan[\s\S]{0,200}?status !== 'concluded'/)
  })
})
