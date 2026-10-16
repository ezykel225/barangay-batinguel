// P4-A. The screening panel as RENDERED — which controls each position
// is painted, what a confirmation actually sends, and the words a reader
// sees.
//
// ─── ⚠️ WHAT THESE TESTS CANNOT PROVE ────────────────────────────────
//
// They do NOT prove the authorization. The two flags decide which
// controls are PAINTED; `prepare_complaint_screening()` raises `P0001`
// unless the caller holds `Barangay Secretary`,
// `confirm_complaint_screening()` unless they hold `Punong Barangay`,
// and `complaint_screenings_for()` returns zero rows to anybody who is
// neither — all resolved through the private `official_account_links`
// mapping. Only SQL can prove a position gate, and the matrix for all
// eight callers lives in this phase's report.
//
// What is pinned here is that the UI never paints a control the database
// would refuse, that a refusal is read as a sentence rather than as a
// SQLSTATE, that no screening content reaches a surface it must not, and
// that nothing on screen decides anything.
//
// ⚠️ Supabase is mocked at the module level: `supabaseClient.js` throws
// at import time without the env vars and `jest.mock` is hoisted above
// the imports. CRA 5's preset sets `resetMocks: true`, so every
// implementation is installed in `beforeEach` rather than in the factory.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}))

const { supabase } = require('../supabase/supabaseClient')
const ScreeningPanel = require('./ScreeningPanel').default
const {
  CHECKLIST_KEYS, CHECKLIST_V1, SCREENING_ERRORS,
} = require('./screeningChecklist')

const SRC = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
// ⚠️ Comment-stripped. These files discuss `committee`, `full_name`,
// every forbidden verb and the whole authorization model at length
// precisely to record what is NOT read.
const code = (p) => read(p).split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const ALL_YES = CHECKLIST_KEYS.reduce((a, k) => ({ ...a, [k]: 'yes' }), {})
const ALL_NO = CHECKLIST_KEYS.reduce((a, k) => ({ ...a, [k]: 'no' }), {})

const OPEN_ROW = {
  id: 's1',
  checklist_version: 'v1',
  answers: { ...ALL_NO, minor_involved: 'yes', possible_serious_offense: 'unknown' },
  recommendation: 'refer_for_further_action',
  recommendation_note: 'Parties live in different municipalities.',
  prepared_by_name: 'Alexis Theress P. Tan',
  prepared_at: '2026-10-16T02:00:00.000Z',
  confirmed_outcome: null,
  confirmed_by_name: null,
  confirmed_at: null,
  confirmation_note: null,
  is_open: true,
}

const CONFIRMED_ROW = {
  ...OPEN_ROW,
  id: 's0',
  answers: ALL_NO,
  recommendation: null,
  recommendation_note: null,
  confirmed_outcome: 'proceed_to_kp_process',
  confirmed_by_name: 'Hon. Frankie Credo',
  confirmed_at: '2026-10-15T02:00:00.000Z',
  confirmation_note: 'Both parties are residents of this barangay.',
  is_open: false,
}

const confirmMock = jest.fn()

const renderPanel = (props = {}, rows = []) => {
  supabase.rpc.mockImplementation((name) => {
    if (name === 'complaint_screenings_for') {
      return Promise.resolve({ data: rows, error: null })
    }
    return Promise.resolve({ data: 's1', error: null })
  })
  return render(
    <ScreeningPanel complaintId="c1" confirm={confirmMock} {...props} />,
  )
}

beforeEach(() => {
  confirmMock.mockResolvedValue(true)
})

// ── A. Who sees what ─────────────────────────────────────────────────

describe('A. the controls each position is painted', () => {
  // ⚠️ ONE NEUTRAL SENTENCE, and it names no position as the gate — the
  // same rule the restricted-detail panel follows. An ordinary official
  // cannot grant themselves records access, and naming the holder only
  // invites asking for it.
  it('shows a neutral restricted note to an ordinary official', async () => {
    renderPanel()
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(/restricted to authorized barangay staff/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('names no position, policy, function or SQLSTATE in that note', async () => {
    renderPanel()
    await screen.findByRole('note')
    const words = document.body.textContent
    ;['Secretary', 'Punong', 'Kapitan', 'Treasurer', 'Kagawad', 'committee',
      'P0001', '42501', 'policy', 'complaint_screenings', 'RLS', 'permission']
      .forEach((t) => expect(words).not.toContain(t))
  })

  it('paints the prepare form for the Secretary', async () => {
    renderPanel({ isSecretary: true })
    await screen.findByRole('group', { name: /Review questions/i })
    expect(screen.getByRole('button', { name: /Save screening/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirm screening/i }))
      .not.toBeInTheDocument()
  })

  // ⚠️ THE SECRETARY GETS NO CONFIRM CONTROL EVEN WITH A DRAFT OPEN, and
  // the database agrees: `confirm_complaint_screening()` refuses the
  // Secretary on the position gate AND again on the self-confirm guard.
  it('paints no confirm control for the Secretary, even with a draft open', async () => {
    renderPanel({ isSecretary: true }, [OPEN_ROW])
    await screen.findByText(/Prepared screening/i)
    expect(screen.queryByRole('button', { name: /Confirm screening/i }))
      .not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Confirmed outcome/i)).not.toBeInTheDocument()
    // It says why, rather than leaving a blank where a control sits.
    expect(screen.getByText(/waiting for the barangay head to confirm/i))
      .toBeInTheDocument()
  })

  it('paints the confirm control for the Punong Barangay when a draft is open', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    expect(await screen.findByLabelText(/Confirmed outcome/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm screening/i }))
      .toBeInTheDocument()
    // And no prepare form: he does not answer the checklist.
    expect(screen.queryByRole('group', { name: /Review questions/i }))
      .not.toBeInTheDocument()
  })

  // ⚠️ ABSENT, NOT DISABLED, which is `ActionMenu`'s own rule: a disabled
  // control advertises a capability and cannot be told from a bug.
  it('renders no control disabled in place of withholding it', async () => {
    renderPanel({}, [OPEN_ROW])
    await screen.findByRole('note')
    expect(document.querySelectorAll('button[disabled]')).toHaveLength(0)
    expect(document.querySelectorAll('select[disabled]')).toHaveLength(0)
  })

  it('tells the Punong Barangay plainly when nothing awaits confirmation', async () => {
    renderPanel({ isKapitan: true }, [])
    expect(await screen.findByText(/No screening is awaiting confirmation/i))
      .toBeInTheDocument()
  })
})

// ── B. The checklist asks and marks; it concludes nothing ────────────

describe('B. the checklist on screen', () => {
  const openForm = async () => {
    renderPanel({ isSecretary: true })
    return screen.findByRole('group', { name: /Review questions/i })
  }

  it('asks all six questions, each as its own named radio group', async () => {
    await openForm()
    CHECKLIST_V1.forEach((item) => {
      const group = screen.getByRole('group', {
        name: new RegExp(item.question.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      })
      expect(within(group).getAllByRole('radio')).toHaveLength(3)
    })
  })

  // ⚠️ THREE OPTIONS, NOT TWO, and the third says in words that it means
  // not yet verified. A reviewer forced to choose would answer `no` to a
  // question nobody checked, and `no` and "not looked into" are different
  // facts on a record the Punong Barangay reads before confirming.
  it('offers Yes, No and Unknown / needs verification on every question', async () => {
    await openForm()
    CHECKLIST_KEYS.forEach((key) => {
      const radios = document.querySelectorAll(`input[name="scr-${key}"]`)
      expect(radios).toHaveLength(3)
      expect([...radios].map((r) => r.value)).toEqual(['yes', 'no', 'unknown'])
    })
    expect(screen.getAllByLabelText('Unknown / needs verification'))
      .toHaveLength(CHECKLIST_KEYS.length)
  })

  it('associates every radio with a label by htmlFor', async () => {
    await openForm()
    document.querySelectorAll('input[type="radio"]').forEach((r) => {
      expect(r.id).toBeTruthy()
      expect(document.querySelector(`label[for="${r.id}"]`)).not.toBeNull()
    })
  })

  // ⚠️ EMPHASIS ON ONE ROW, NOT A FINDING. The flag appears against the
  // answer it belongs to, says "possible", and nothing totals the marks.
  it('marks one answer for attention without totalling or concluding', async () => {
    await openForm()
    expect(screen.queryByRole('note', { name: /further review/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByLabelText('Yes')[0])
    const flags = screen.getAllByText(/Possible condition requiring further review/i)
    expect(flags).toHaveLength(1)

    // No count, no score, no verdict anywhere on screen.
    const words = document.body.textContent
    ;['2 flags', 'flags', 'score', 'total', 'likely', 'probably',
      'recommend proceeding', 'is outside', 'is within', 'not eligible']
      .forEach((t) => expect(words).not.toContain(t))
  })

  // ⚠️ `unknown` IS NOT FLAGGED, deliberately: "we have not checked this"
  // is an ordinary state of a draft, and flagging it would turn display
  // emphasis into a completeness score.
  it('does not mark an unknown answer', async () => {
    await openForm()
    await userEvent.click(screen.getAllByLabelText('Unknown / needs verification')[0])
    expect(screen.queryByText(/Possible condition requiring further review/i))
      .not.toBeInTheDocument()
  })

  it('carries the disclaimer and the provisional note on screen', async () => {
    await openForm()
    expect(screen.getByText(/does not automatically/i)).toBeInTheDocument()
    expect(screen.getByText(/determine legal jurisdiction/i, { exact: false }))
      .toBeInTheDocument()
    expect(screen.getByText(/Provisional review checklist/i)).toBeInTheDocument()
  })

  it('shows the checklist version and how many questions are answered', async () => {
    await openForm()
    expect(screen.getByText(/Checklist v1/)).toBeInTheDocument()
    expect(screen.getByText(/0 of 6 answered/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByLabelText('No')[0])
    expect(screen.getByText(/1 of 6 answered/)).toBeInTheDocument()
  })
})

// ── C. Preparing sends exactly what a human entered ──────────────────

describe('C. preparing a screening', () => {
  const answerAll = async (label = 'No') => {
    renderPanel({ isSecretary: true })
    await screen.findByRole('group', { name: /Review questions/i })
    for (const key of CHECKLIST_KEYS) {
      const radios = document.querySelectorAll(`input[name="scr-${key}"]`)
      const target = [...radios].find(
        (r) => document.querySelector(`label[for="${r.id}"]`).textContent === label,
      )
      await userEvent.click(target)
    }
  }

  it('refuses to save until every question is answered', async () => {
    renderPanel({ isSecretary: true })
    await screen.findByRole('group', { name: /Review questions/i })
    await userEvent.click(screen.getByRole('button', { name: /Save screening/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(SCREENING_ERRORS.incomplete)
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'prepare_complaint_screening', expect.anything(),
    )
  })

  // ⚠️ THE ANSWERS GO AS THE HUMAN GAVE THEM, with the version, and
  // nothing else is sent: no identity, no timestamp, no status, no
  // outcome. All four are stamped server-side, and none is a parameter.
  it('sends the version and the six answers, and no identity or outcome', async () => {
    await answerAll('No')
    await userEvent.click(screen.getByRole('button', { name: /Save screening/i }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
      'prepare_complaint_screening', expect.anything(),
    ))
    const [, args] = supabase.rpc.mock.calls
      .find(([name]) => name === 'prepare_complaint_screening')
    expect(args.p_complaint_id).toBe('c1')
    expect(args.p_checklist_version).toBe('v1')
    expect(args.p_answers).toEqual(ALL_NO)
    expect(Object.keys(args).sort()).toEqual([
      'p_answers', 'p_checklist_version', 'p_complaint_id',
      'p_recommendation', 'p_recommendation_note',
    ])
  })

  it('sends a null recommendation when none was chosen', async () => {
    await answerAll('No')
    await userEvent.click(screen.getByRole('button', { name: /Save screening/i }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
      'prepare_complaint_screening', expect.anything(),
    ))
    const [, args] = supabase.rpc.mock.calls
      .find(([name]) => name === 'prepare_complaint_screening')
    expect(args.p_recommendation).toBeNull()
    expect(args.p_recommendation_note).toBeNull()
  })

  // ⚠️ THE RECOMMENDATION IS CHOSEN, NEVER COMPUTED. All six answers are
  // `yes` here — every one flagged — and the recommendation sent is still
  // only the one the Secretary picked.
  it('sends the recommendation the Secretary picked, not one derived from the answers', async () => {
    await answerAll('Yes')
    await userEvent.selectOptions(
      screen.getByLabelText(/Suggested next step/i), 'close_without_kp_process',
    )
    await userEvent.click(screen.getByRole('button', { name: /Save screening/i }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
      'prepare_complaint_screening', expect.anything(),
    ))
    const [, args] = supabase.rpc.mock.calls
      .find(([name]) => name === 'prepare_complaint_screening')
    expect(args.p_answers).toEqual(ALL_YES)
    expect(args.p_recommendation).toBe('close_without_kp_process')
  })

  // ⚠️ PREVENTED TWICE, and the FORM is submitted rather than the button
  // clicked — which is both the honest test and the real case, since a
  // keyboard Enter can beat the re-render that disables the button.
  // P3-B2's first version of this test clicked a `disabled` button and
  // therefore proved nothing.
  it('prevents a duplicate save', async () => {
    let release
    supabase.rpc.mockImplementation((name) => {
      if (name === 'complaint_screenings_for') {
        return Promise.resolve({ data: [], error: null })
      }
      return new Promise((resolve) => { release = () => resolve({ data: 's1', error: null }) })
    })
    render(<ScreeningPanel complaintId="c1" isSecretary confirm={confirmMock} />)
    await screen.findByRole('group', { name: /Review questions/i })
    for (const key of CHECKLIST_KEYS) {
      await userEvent.click(document.querySelector(`input[name="scr-${key}"][value="no"]`))
    }

    const form = document.querySelector('form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(
      supabase.rpc.mock.calls.filter(([n]) => n === 'prepare_complaint_screening'),
    ).toHaveLength(1))
    release()
  })

  // ⚠️ THE FUNCTION'S OWN SENTENCE NEVER REACHES THE SCREEN. It names the
  // position gate ("Only the Barangay Secretary can..."), and printing it
  // would put an authorization model in an alert on a screen somebody may
  // be standing beside.
  it('reads a position refusal as its own sentence, never the RPC message', async () => {
    supabase.rpc.mockImplementation((name) => {
      if (name === 'complaint_screenings_for') {
        return Promise.resolve({ data: [], error: null })
      }
      return Promise.resolve({
        data: null,
        error: { code: 'P0001', message: 'Only the Barangay Secretary can prepare a screening.' },
      })
    })
    render(<ScreeningPanel complaintId="c1" isSecretary confirm={confirmMock} />)
    await screen.findByRole('group', { name: /Review questions/i })
    for (const key of CHECKLIST_KEYS) {
      await userEvent.click(document.querySelector(`input[name="scr-${key}"][value="no"]`))
    }
    fireEvent.submit(document.querySelector('form'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(SCREENING_ERRORS.notPermittedPrepare)
    expect(document.body.textContent).not.toContain('Only the Barangay Secretary')
    expect(document.body.textContent).not.toContain('P0001')
  })

  // ⚠️ A draft is re-opened rather than silently restarted, so a
  // Secretary returning to a part-finished review sees what they already
  // recorded.
  it('re-opens an existing draft with its stored answers', async () => {
    renderPanel({ isSecretary: true }, [OPEN_ROW])
    await screen.findByRole('group', { name: /Review questions/i })
    expect(screen.getByText(/6 of 6 answered/)).toBeInTheDocument()
    expect(document.querySelector('input[name="scr-minor_involved"][value="yes"]').checked)
      .toBe(true)
    expect(screen.getByRole('button', { name: /Update screening/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Suggested next step/i))
      .toHaveValue('refer_for_further_action')
  })
})

// ── D. Confirming is a human act, recorded ───────────────────────────

describe('D. confirming a screening', () => {
  it('refuses to confirm with no outcome chosen', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent(SCREENING_ERRORS.outcomeRequired)
    expect(confirmMock).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'confirm_complaint_screening', expect.anything(),
    )
  })

  // ⚠️ THE OUTCOME SELECTOR OFFERS FOUR AND NO FIFTH. There is no KP
  // Eligible, Settled, Referred or Dismissed option: each would be a
  // stage this system cannot reach or a legal conclusion it must not
  // appear to make.
  it('offers exactly the four outcomes the database accepts', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    const select = await screen.findByLabelText(/Confirmed outcome/i)
    const values = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(values).toEqual([
      '', 'proceed_to_kp_process', 'refer_for_further_action',
      'close_without_kp_process', 'needs_more_information',
    ])
    const words = [...select.querySelectorAll('option')]
      .map((o) => o.textContent).join(' ').toLowerCase()
    ;['eligible', 'settled', 'dismiss', 'mediation', 'conciliation',
      'jurisdiction', 'certificate']
      .forEach((t) => expect(words).not.toContain(t))
  })

  // ⚠️ IT SAYS WHAT THE CHOICE IS NOT. Each option records what the
  // barangay will do; none of them is a legal ruling, and the screen
  // says so rather than leaving it to be inferred.
  it('says in words that no option is a legal ruling', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    expect(screen.getByText(/None of them is a legal ruling/i)).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'proceed_to_kp_process',
    )
    expect(screen.getByText(/The barangay will take this forward/i)).toBeInTheDocument()
  })

  // ⚠️ THROUGH THE SHARED CONFIRMATION DIALOG, because it is the one
  // action in this phase that records a barangay decision and a confirmed
  // screening cannot afterwards be edited. The sentence names the outcome
  // in the barangay's own words, not an identifier.
  it('asks for confirmation in readable words before sending', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'refer_for_further_action',
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    const [{ message, destructive }] = confirmMock.mock.calls[0]
    expect(message).toContain('Refer for further action')
    expect(message).not.toContain('refer_for_further_action')
    expect(message).toMatch(/cannot be edited afterwards/i)
    expect(destructive).toBe(false)
  })

  it('sends nothing when the dialog is dismissed', async () => {
    confirmMock.mockResolvedValue(false)
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'proceed_to_kp_process',
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'confirm_complaint_screening', expect.anything(),
    )
  })

  it('sends the screening id, the outcome and the note, and nothing else', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'close_without_kp_process',
    )
    await userEvent.type(screen.getByLabelText(/Decision note/i), 'Agreed at the counter.')
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
      'confirm_complaint_screening', expect.anything(),
    ))
    const [, args] = supabase.rpc.mock.calls
      .find(([name]) => name === 'confirm_complaint_screening')
    expect(args).toEqual({
      p_screening_id: 's1',
      p_outcome: 'close_without_kp_process',
      p_note: 'Agreed at the counter.',
    })
  })

  it('reads a self-confirm refusal as its own sentence', async () => {
    supabase.rpc.mockImplementation((name) => {
      if (name === 'complaint_screenings_for') {
        return Promise.resolve({ data: [OPEN_ROW], error: null })
      }
      return Promise.resolve({
        data: null,
        error: {
          code: 'P0001',
          message: 'A screening cannot be confirmed by the official who prepared it.',
        },
      })
    })
    render(<ScreeningPanel complaintId="c1" isKapitan confirm={confirmMock} />)
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'proceed_to_kp_process',
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent(SCREENING_ERRORS.selfConfirm)
  })

  it('reads an already-confirmed refusal as its own sentence', async () => {
    supabase.rpc.mockImplementation((name) => {
      if (name === 'complaint_screenings_for') {
        return Promise.resolve({ data: [OPEN_ROW], error: null })
      }
      return Promise.resolve({
        data: null,
        error: { code: 'P0001', message: 'That screening has already been confirmed.' },
      })
    })
    render(<ScreeningPanel complaintId="c1" isKapitan confirm={confirmMock} />)
    await screen.findByLabelText(/Confirmed outcome/i)
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/i), 'proceed_to_kp_process',
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/i }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent(SCREENING_ERRORS.alreadyConfirmed)
  })
})

// ── E. A confirmed screening is history ──────────────────────────────

describe('E. the confirmed screening', () => {
  it('renders read-only, with the outcome in words, the actor and the version', async () => {
    renderPanel({ isKapitan: true }, [CONFIRMED_ROW])
    expect(await screen.findByText('Proceed with the barangay KP process'))
      .toBeInTheDocument()
    expect(screen.getByText(/Hon\. Frankie Credo/)).toBeInTheDocument()
    expect(screen.getByText(/checklist v1/)).toBeInTheDocument()
    expect(screen.getByText(/Both parties are residents/)).toBeInTheDocument()
  })

  // ⚠️ NOT EDITABLE HERE, and the database refuses an update to it as
  // well — so a recorded decision keeps the actor and the moment it was
  // made. A further review is a NEW screening.
  it('offers no control to change a confirmed decision', async () => {
    renderPanel({ isKapitan: true }, [CONFIRMED_ROW])
    await screen.findByText('Proceed with the barangay KP process')
    expect(screen.queryByLabelText(/Confirmed outcome/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirm screening/i }))
      .not.toBeInTheDocument()
    const buttons = screen.queryAllByRole('button').map((b) => b.textContent.toLowerCase())
    ;['edit', 'change', 'reopen', 'undo', 'delete', 'remove', 'overwrite']
      .forEach((v) => expect(buttons.join(' ')).not.toContain(v))
  })

  // ⚠️ A REDONE SCREENING PRESERVES THE PREVIOUS ONE: the confirmed row
  // stays on screen while a new draft is prepared beside it.
  // ⚠️ SCOPED TO THE HISTORY SECTION, which is my own ambiguity rather
  // than a duplicate on screen: the same four words are an `<option>` in
  // the Secretary's recommendation select, correctly, because one
  // vocabulary serves both the recommendation and the outcome. An
  // unscoped query matches both and says "found multiple elements".
  it('keeps a confirmed screening on screen while a new draft is prepared', async () => {
    renderPanel({ isSecretary: true }, [OPEN_ROW, CONFIRMED_ROW])
    await screen.findByRole('group', { name: /Review questions/i })
    const history = document.querySelector('.screening-history')
    expect(history).not.toBeNull()
    expect(within(history).getByText('Proceed with the barangay KP process'))
      .toBeInTheDocument()
    expect(within(history).getByText(/Confirmed screenings/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update screening/i })).toBeInTheDocument()
  })
})

// ── F. Nothing on screen decides anything ────────────────────────────

describe('F. the system decides nothing on screen', () => {
  it('offers no button that acts on a complaint', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    const buttons = screen.getAllByRole('button')
      .map((b) => b.textContent.toLowerCase()).join(' | ')
    ;['approve', 'reject', 'decline', 'deny', 'mediat', 'settle',
      'close case', 'schedule', 'hearing', 'summon', 'dismiss', 'escalate',
      'create case', 'issue', 'certificate']
      .forEach((v) => expect(buttons).not.toContain(v))
  })

  // ⚠️ THE PANEL READS AND WRITES THROUGH THE THREE RPCs AND NOTHING
  // ELSE. `supabase.from` is never called, so there is no second path to
  // the screening or the complaint and nothing to "improve" into one.
  it('never queries a table directly', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    expect(supabase.from).not.toHaveBeenCalled()
    const names = [...new Set(supabase.rpc.mock.calls.map(([n]) => n))]
    names.forEach((n) => expect([
      'complaint_screenings_for', 'prepare_complaint_screening',
      'confirm_complaint_screening',
    ]).toContain(n))
  })

  it('states no legal conclusion anywhere on screen', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW, CONFIRMED_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    const words = document.body.textContent.toLowerCase()
    ;['is outside', 'is within', 'not eligible', 'ineligible', 'eligible',
      'is required by law', 'shall be', 'unlawful', 'guilty', 'verdict',
      'ruling of', 'we conclude', 'the system has determined']
      .forEach((t) => expect(words).not.toContain(t))
  })

  // ⚠️ §10: a sensitive answer increases privacy. It is on screen HERE
  // because this panel is the restricted record itself — and nothing in
  // this file sends it anywhere else, which the next test pins.
  it('shows a sensitive answer only as the recorded answer it is', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    const list = document.querySelector('.screening-answer-list')
    expect(list).not.toBeNull()
    expect(list.textContent).toMatch(/involve a minor/i)
    // No badge, banner or alert singling the complaint out as sensitive.
    expect(screen.queryByText(/^VAWC$/)).not.toBeInTheDocument()
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0)
  })
})

// ── G. Source guards a scan alone can prove ──────────────────────────

describe('G. the wiring', () => {
  // ⚠️ §2 AND §18: the real `Peace and Order and Appropriation` value on
  // one Kagawad grants nothing. `committee` is free text with no CHECK
  // that any official may write on any row, and
  // `protect_official_record()` does not guard it — so authorizing on it
  // would reproduce migration 028's escalation on an unguarded column.
  it('reads no committee, no name and no hardcoded person', () => {
    const src = code('screening/ScreeningPanel.jsx')
      + code('screening/screeningApi.js')
      + code('screening/screeningChecklist.js')
    expect(src).not.toContain('committee')
    expect(src).not.toContain('full_name')
    expect(src).not.toContain("eq('full_name'")
    ;['Harold', 'Baroy', 'Frankie', 'Credo', 'Alexis', 'Adelina',
      'Fabillar', 'Remata', 'Jeffrey', 'Duran', 'Katada', 'Peace and Order']
      .forEach((n) => expect(src).not.toContain(n))
  })

  // ⚠️ THE TABLE IS NEVER NAMED AS A TABLE, and that distinction is my
  // own scan corrected: `complaint_screenings_for` CONTAINS the table
  // name as a substring, so a bare `not.toContain('complaint_screenings')`
  // flagged the one legitimate read. The property is that no `.from()`
  // ever names it -- and it could not work anyway, since the table
  // carries no client privilege at all and every client read is `42501`.
  it('reads neither the links table nor the screening table directly', () => {
    const src = code('screening/ScreeningPanel.jsx') + code('screening/screeningApi.js')
    expect(src).not.toContain('official_account_links')
    expect(src).not.toContain('official_id_for_current_user')
    expect(src).not.toMatch(/from\(\s*'complaint/)
    expect(src).not.toMatch(/\bsupabase\.from\b/)
    // Every occurrence of the table's name is the reader RPC's name.
    const hits = (src.match(/complaint_screenings\w*/g) || [])
    expect(hits.length).toBeGreaterThan(0)
    hits.forEach((h) => expect(h).toBe('complaint_screenings_for'))
  })

  // ⚠️ NO FUNCTION TURNS ANSWERS INTO A DECISION, asserted over the panel
  // too — not only over the pure module. A derived recommendation would
  // be the software deciding, which §5 forbids.
  it('derives no recommendation and no outcome', () => {
    const src = code('screening/ScreeningPanel.jsx')
    ;['deriveRecommendation', 'deriveOutcome', 'suggestOutcome',
      'autoOutcome', 'recommendFor', 'evaluateChecklist', 'scoreChecklist',
      'isKpEligible', 'decideOutcome']
      .forEach((n) => expect(src).not.toContain(n))
    // `needsFurtherReview` is called per item, never over the answer set.
    const calls = [...src.matchAll(/needsFurtherReview\(([^)]*)\)/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThan(0)
    calls.forEach((args) => expect(args).toMatch(/^item, /))
  })

  it('writes no activity log, sends no notification and prints nothing to the console', () => {
    const src = code('screening/ScreeningPanel.jsx') + code('screening/screeningChecklist.js')
    ;['logActivity', 'activity_log', 'notifications', 'notify',
      'console.log', 'console.info', 'console.warn']
      .forEach((t) => expect(src).not.toContain(t))
  })

  // ⚠️ The one console call is the project's own failure shape, in the
  // API module, and it prints the error rather than the complaint.
  it('logs the error shape and never a narrative, party or answer', () => {
    const src = code('screening/screeningApi.js')
    const logs = [...src.matchAll(/console\.error\(([\s\S]*?)\n  \}\)/g)].map((m) => m[0])
    expect(logs).toHaveLength(1)
    ;['answers', 'narrative', 'party', 'complainant', 'respondent',
      'p_answers', 'outcome']
      .forEach((t) => expect(logs[0]).not.toContain(t))
  })

  // ⚠️ §26: the headings nest rather than skip. This panel renders under
  // the detail card's own <h3>, so its sections are <h4> and their
  // subsections <h5> — the defect P3-B2's first Chromium pass reported
  // 49 times, not repeated.
  it('nests its headings under the detail section without skipping a level', async () => {
    renderPanel({ isKapitan: true }, [OPEN_ROW, CONFIRMED_ROW])
    await screen.findByLabelText(/Confirmed outcome/i)
    const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((h) => Number(h.tagName[1]))
    expect(levels.length).toBeGreaterThan(0)
    // Nothing above h4, because the panel is a child of an <h3> section.
    expect(Math.min(...levels)).toBe(4)
    // And no level is skipped within the panel.
    levels.forEach((lvl, i) => {
      if (i > 0) expect(lvl - levels[i - 1]).toBeLessThanOrEqual(1)
    })
  })

  it('is a separate component, with no complaint state of its own', () => {
    const src = code('screening/ScreeningPanel.jsx')
    ;['complaint_queue', 'complaint_parties_for', 'complaint_attachments_for',
      'encode_walk_in_complaint', 'file_complaint_as_resident',
      'track_complaint', 'createSignedUrl', 'getPublicUrl']
      .forEach((t) => expect(src).not.toContain(t))
  })
})
