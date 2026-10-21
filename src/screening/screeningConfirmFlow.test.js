// PR #43 blocker. "Confirm screening does nothing in a real browser."
//
// ─── ⚠️ WHY THIS SUITE RENDERS `OfficialComplaints` AND NOT THE PANEL ──
// The defect was never inside `ScreeningPanel`. `useConfirm()` returns an
// ARRAY -- `return [confirm, dialog]` -- and `OfficialComplaints`
// destructured it as an OBJECT, so `confirm` and `dialog` were both
// `undefined`: no dialog was mounted, and the `confirm` handed down to
// the panel was not a function. `await confirm({...})` threw a TypeError
// outside the panel's try block, inside an async onClick nobody awaited,
// so the rejection was unhandled and NOTHING happened on screen.
//
// ⚠️ `screeningPanel.test.js` could not have caught it, and neither
// could any strengthening of it: it renders `ScreeningPanel` directly and
// passes its OWN `confirm` mock, so it never crosses the line that was
// broken. The only test that catches this is one that renders the
// component which OWNS the hook and drives the REAL shared dialog. So
// nothing here is stubbed between the button and the RPC except Supabase
// itself.
//
// ⚠️ AND IT IS NOT A SOURCE-STRING TEST. Every assertion below is made
// against rendered output and recorded calls. A scan for
// `const [confirm` would pass the moment somebody typed it and would say
// nothing about whether the dialog opens.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const { supabase } = require('../supabase/supabaseClient')
const OfficialComplaints = require('../complaints/OfficialComplaints').default

const QUEUE = [{
  id: 'c1',
  reference: 'CMP-2026-AB12CD',
  intake_channel: 'online',
  status: 'under_review',
  created_at: '2026-10-16T01:00:00.000Z',
  updated_at: '2026-10-16T02:00:00.000Z',
}]

const FULL_ROW = {
  id: 'c1',
  reference: 'CMP-2026-AB12CD',
  category: 'family_dispute',
  status: 'under_review',
  narrative: 'A disagreement over a shared fence line.',
  location_note: 'beside the covered court',
  intake_channel: 'online',
  created_at: '2026-10-16T01:00:00.000Z',
  updated_at: '2026-10-16T02:00:00.000Z',
}

const PARTIES = [{
  id: 'p1', party_role: 'complainant', full_name_snapshot: 'Ezequel Bautista',
  contact_number_snapshot: '09171234567', address_note: null,
  has_profile_link: true, has_registry_link: false,
  created_at: '2026-10-16T01:00:00.000Z',
}]

const HISTORY = [{
  id: 'h1', from_status: 'received', to_status: 'under_review',
  note: 'Screening prepared for barangay review.',
  created_at: '2026-10-16T02:00:00.000Z',
}]

// A prepared, UNCONFIRMED screening -- exactly the shape
// `complaint_screenings_for()` returns, `is_open` included.
const OPEN_SCREENING = {
  id: 's1',
  checklist_version: 'v1',
  answers: {
    parties_are_natural_persons: 'yes',
    parties_reside_in_this_barangay: 'yes',
    matter_is_between_private_parties: 'yes',
    possible_minor_involved: 'no',
    possible_vawc_or_sensitive_family_matter: 'no',
    other_circumstance_requiring_review: 'unknown',
  },
  recommendation: 'proceed_to_kp_process',
  recommendation_note: 'Both parties live on the same street.',
  prepared_by_name: 'Alexis Theress P. Tan',
  prepared_at: '2026-10-16T02:00:00.000Z',
  confirmed_outcome: null,
  confirmed_by_name: null,
  confirmed_at: null,
  confirmation_note: null,
  is_open: true,
}

// The same screening after the Punong Barangay confirmed it.
const confirmedAs = (outcome) => ({
  ...OPEN_SCREENING,
  confirmed_outcome: outcome,
  confirmed_by_name: 'Hon. Frankie Credo',
  confirmed_at: '2026-10-16T03:00:00.000Z',
  confirmation_note: 'Agreed at the barangay hall.',
  is_open: false,
})

// ⚠️ A MUTABLE SCREENING SET, so the refresh after a confirm returns
// what the database would return -- the confirmed row, no longer open.
// A fixture frozen at "still open" would let a broken refresh pass.
let screeningRows = []
let confirmCalls = []

const install = () => {
  supabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: FULL_ROW, error: null }) }) }),
  })
  supabase.rpc.mockImplementation((fn, args) => {
    if (fn === 'complaint_queue') return Promise.resolve({ data: QUEUE, error: null })
    if (fn === 'complaint_parties_for') return Promise.resolve({ data: PARTIES, error: null })
    if (fn === 'complaint_history_for') return Promise.resolve({ data: HISTORY, error: null })
    if (fn === 'complaint_attachments_for') return Promise.resolve({ data: [], error: null })
    if (fn === 'complaint_screenings_for') return Promise.resolve({ data: screeningRows, error: null })
    if (fn === 'confirm_complaint_screening') {
      confirmCalls.push(args)
      screeningRows = [confirmedAs(args.p_outcome)]
      return Promise.resolve({ data: null, error: null })
    }
    if (fn === 'kp_case_for_complaint') return Promise.resolve({ data: null, error: null })
    return Promise.resolve({ data: [], error: null })
  })
}

beforeEach(() => {
  screeningRows = [OPEN_SCREENING]
  confirmCalls = []
  supabase.storage.from.mockReturnValue({
    upload: jest.fn(), createSignedUrl: jest.fn(),
  })
  install()
})

// The Punong Barangay, on the one complaint, with its detail open.
const openAsKapitan = async () => {
  render(<OfficialComplaints isSecretary={false} isKapitan />)
  await userEvent.click(
    await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ })
  )
  // ⚠️ Wait for the PANEL, not for the static heading above it. The
  // `<h3>` belongs to `OfficialComplaints` and is on screen while the
  // panel still reads "Loading screening...".
  await screen.findByLabelText(/Confirmed outcome/)
}

const rpcNames = () => supabase.rpc.mock.calls.map((c) => c[0])
const confirmCount = () => rpcNames().filter((n) => n === 'confirm_complaint_screening').length

// ── A. The whole click path, end to end ──────────────────────────────

describe('A. confirming a screening from the Official Portal', () => {
  // ⚠️ THE LOAD-BEARING TEST. Against the broken wiring the dialog never
  // appears, so step 5 fails and nothing after it runs.
  it('opens the shared confirmation dialog when Confirm screening is clicked', async () => {
    await openAsKapitan()

    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )
    await userEvent.type(
      screen.getByLabelText('Decision note'), 'Agreed at the barangay hall.'
    )

    expect(screen.queryByRole('dialog', { name: /^(?!Complaint Details$)/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    // The real `ConfirmDialog`, mounted by the real `useConfirm`.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(
      screen.getByRole('heading', { name: 'Confirm this screening?' })
    ).toBeInTheDocument()
  })

  // ⚠️ The outcome is named IN WORDS in the question, not as an
  // identifier -- somebody is confirming something they can read.
  it('names the outcome in the barangay-s own words, not as a stored value', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Proceed with the barangay KP process')
    expect(dialog.textContent).not.toMatch(/proceed_to_kp_process/)
  })

  it('calls confirm_complaint_screening exactly once when the dialog is approved', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )
    await userEvent.type(
      screen.getByLabelText('Decision note'), 'Agreed at the barangay hall.'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    const dialog = await screen.findByRole('dialog')
    expect(confirmCount()).toBe(0)

    await userEvent.click(
      // The dialog's own button, not the panel's.
      screen.getAllByRole('button', { name: 'Confirm screening' })
        .find((b) => dialog.contains(b))
    )

    await waitFor(() => expect(confirmCount()).toBe(1))
    expect(confirmCalls[0]).toEqual({
      p_screening_id: 's1',
      p_outcome: 'proceed_to_kp_process',
      p_note: 'Agreed at the barangay hall.',
    })
  })

  // ⚠️ The refresh, not merely the call: a confirm that writes and then
  // leaves the form on screen reads as a click that did nothing, which
  // is the same complaint this whole fix is about.
  it('refreshes to the confirmed, read-only state afterwards', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Confirm screening' })
        .find((b) => dialog.contains(b))
    )

    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Confirmed screenings' }))
        .toBeInTheDocument()
    )
    // The decision is shown, and no control remains to change it.
    expect(screen.getByText(/Confirmed by Hon\. Frankie Credo/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Confirm screening/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Confirmed outcome/)).not.toBeInTheDocument()
  })
})

// ── B. The directions a confirmation must NOT go ─────────────────────

describe('B. the refusals', () => {
  it('writes nothing when the dialog is cancelled', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'close_without_kp_process'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Go back' }).find((b) => dialog.contains(b))
    )

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^(?!Complaint Details$)/ })).not.toBeInTheDocument())
    expect(confirmCount()).toBe(0)
    // The form is still there, with the choice kept.
    expect(screen.getByLabelText(/Confirmed outcome/)).toHaveValue('close_without_kp_process')
  })

  // ⚠️ `useConfirm` answers an abandoned question FALSE, so a second
  // click while the first dialog is open must not produce two writes.
  it('cannot be confirmed twice by clicking the button again', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )

    const trigger = screen.getByRole('button', { name: /Confirm screening/ })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Confirm screening' })
        .find((b) => dialog.contains(b))
    )

    await waitFor(() => expect(confirmCount()).toBe(1))
    expect(confirmCount()).toBe(1)
  })

  it('refuses with no outcome chosen, and opens no dialog', async () => {
    await openAsKapitan()
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /choose what the barangay will do|outcome/i
    )
    expect(screen.queryByRole('dialog', { name: /^(?!Complaint Details$)/ })).not.toBeInTheDocument()
    expect(confirmCount()).toBe(0)
  })

  // ⚠️ The Secretary prepares and a different human confirms. She gets
  // no control at all -- not a disabled one.
  it('paints no confirm control for the Secretary', async () => {
    render(<OfficialComplaints isSecretary isKapitan={false} />)
    await userEvent.click(
      await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ })
    )
    await screen.findByText(
      /waiting for the barangay head to\s+confirm/
    )

    expect(
      screen.queryByRole('button', { name: /Confirm screening/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Confirmed outcome/)).not.toBeInTheDocument()
  })
})

// ── C. The dialog is really mounted by this component ────────────────

describe('C. the shared dialog is wired, not merely imported', () => {
  // ⚠️ The direct consequence of the object/array mistake: `dialog` was
  // `undefined`, so `{confirmDialog}` rendered nothing. This asserts the
  // mounted element rather than the destructuring that produces it.
  it('mounts a real role=dialog with the shared dialog-s own markup', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'needs_more_information'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveClass('confirm-dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title')
    // Cancel is focused on open, so a stray Enter cancels.
    expect(document.activeElement).toHaveTextContent('Go back')
  })

  it('closes on Escape without writing anything', async () => {
    await openAsKapitan()
    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'refer_for_further_action'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^(?!Complaint Details$)/ })).not.toBeInTheDocument())
    expect(confirmCount()).toBe(0)
  })
})

// ── D. The KP case control follows the DATABASE rule (§4) ────────────
//
// ⚠️ The preview offered "Open a KP case" before any review had been
// confirmed, so the one visible next step was a control whose only
// possible answer was a refusal. `open_kp_case()` is UNCHANGED and still
// decides -- it reads the complaint's latest screening itself, requires
// `confirmed_at`, and requires `confirmed_outcome = proceed_to_kp_process`.
// These assert the UI now agrees with it.

const openKpAsKapitan = async () => {
  render(<OfficialComplaints isSecretary={false} isKapitan />)
  await userEvent.click(
    await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ })
  )
  await screen.findByText(/No KP case has been opened for this complaint/)
}

const openCaseForm = () => screen.queryByRole('button', { name: /^Open KP case$/ })

describe('D. when Open KP case is offered', () => {
  it('offers no control when no screening has been prepared', async () => {
    screeningRows = []
    await openKpAsKapitan()

    expect(openCaseForm()).not.toBeInTheDocument()
    expect(screen.getByText(/No review has been prepared yet/)).toBeInTheDocument()
  })

  // ⚠️ THE REPORTED CASE: a prepared but unconfirmed screening.
  it('offers no control while the screening is prepared but unconfirmed', async () => {
    screeningRows = [OPEN_SCREENING]
    await openKpAsKapitan()

    expect(openCaseForm()).not.toBeInTheDocument()
    expect(
      screen.getByText(/has not been confirmed yet/)
    ).toBeInTheDocument()
  })

  it('offers the control once the confirmed outcome says to proceed', async () => {
    screeningRows = [confirmedAs('proceed_to_kp_process')]
    await openKpAsKapitan()

    expect(openCaseForm()).toBeInTheDocument()
  })

  // ⚠️ Each of the other three confirmed outcomes, because "confirmed"
  // is not the rule -- "confirmed AND says to proceed" is.
  it.each([
    ['refer_for_further_action'],
    ['close_without_kp_process'],
    ['needs_more_information'],
  ])('offers no control when the confirmed outcome is %s', async (outcome) => {
    screeningRows = [confirmedAs(outcome)]
    await openKpAsKapitan()

    expect(openCaseForm()).not.toBeInTheDocument()
    expect(
      screen.getByText(/did not direct this complaint to the KP process/)
    ).toBeInTheDocument()
  })

  // ⚠️ The LATEST screening decides, exactly as the RPC's own
  // `ORDER BY created_at DESC LIMIT 1` does. A superseded "proceed" must
  // not re-open the control after a later review said otherwise, and
  // `complaint_screenings_for()` returns the rows newest first.
  it('reads the latest screening, not any earlier one', async () => {
    screeningRows = [
      confirmedAs('close_without_kp_process'),
      confirmedAs('proceed_to_kp_process'),
    ]
    await openKpAsKapitan()

    expect(openCaseForm()).not.toBeInTheDocument()
  })

  it('never offers the control to the Secretary, even when eligible', async () => {
    screeningRows = [confirmedAs('proceed_to_kp_process')]
    render(<OfficialComplaints isSecretary isKapitan={false} />)
    await userEvent.click(
      await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ })
    )
    await screen.findByText(/No KP case has been opened for this complaint/)

    expect(openCaseForm()).not.toBeInTheDocument()
    expect(
      screen.getByText(/Opening a KP case is handled by the barangay head/)
    ).toBeInTheDocument()
  })

  it('calls open_kp_case only from the control, and never on its own', async () => {
    screeningRows = [confirmedAs('proceed_to_kp_process')]
    await openKpAsKapitan()

    expect(rpcNames()).not.toContain('open_kp_case')
    await userEvent.click(openCaseForm())
    await waitFor(
      () => expect(rpcNames().filter((n) => n === 'open_kp_case')).toHaveLength(1)
    )
  })

  // ⚠️ Confirming a review repaints the panel below it. Without the
  // signal the Punong Barangay would confirm "proceed" and still be
  // looking at "has not been confirmed yet" until a reload.
  it('offers the control immediately after the screening is confirmed', async () => {
    screeningRows = [OPEN_SCREENING]
    render(<OfficialComplaints isSecretary={false} isKapitan />)
    await userEvent.click(
      await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ })
    )
    await screen.findByLabelText(/Confirmed outcome/)
    expect(openCaseForm()).not.toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByLabelText(/Confirmed outcome/), 'proceed_to_kp_process'
    )
    await userEvent.click(screen.getByRole('button', { name: /Confirm screening/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Confirm screening' })
        .find((b) => dialog.contains(b))
    )

    await waitFor(() => expect(openCaseForm()).toBeInTheDocument())
  })
})


describe('authorized complaint disposition header', () => {
  it('shows confirmed referral without a KP opening or a replacement Secretary form', async () => {
    screeningRows = [confirmedAs('refer_for_further_action')]
    render(<OfficialComplaints isSecretary />)
    await userEvent.click(await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await waitFor(() => expect(document.querySelector('.complaint-modal-header')).toHaveTextContent('Referred for further action'))
    expect(screen.queryByRole('button', { name: /Open a KP case/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Review questions/i })).not.toBeInTheDocument()
  })
  it('shows ongoing KP only for a confirmed proceed outcome and active linked case', async () => {
    screeningRows = [confirmedAs('proceed_to_kp_process')]
    const original = supabase.rpc.getMockImplementation()
    supabase.rpc.mockImplementation((name, args) => name === 'kp_case_for_complaint'
      ? Promise.resolve({ data: [{ id: 'k1', reference: 'KP-2026-DEMO', status: 'open' }], error: null })
      : original(name, args))
    render(<OfficialComplaints isKapitan />)
    await userEvent.click(await screen.findByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await waitFor(() => expect(document.querySelector('.complaint-modal-header')).toHaveTextContent('KP process ongoing'))
    expect(screen.getByText('KP-2026-DEMO')).toBeInTheDocument()
  })
})
