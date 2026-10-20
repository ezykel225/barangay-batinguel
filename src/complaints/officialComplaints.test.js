// P3-B2. The Official Portal's complaint queue, detail panel and the
// Secretary's walk-in intake, as rendered -- plus the source guards
// that only a scan can prove.
//
// ⚠️ Supabase is mocked at the module level: `supabaseClient.js` throws
// at import time without the env vars and `jest.mock` is hoisted above
// the imports. CRA 5's preset sets `resetMocks: true`, so every
// implementation is installed in `beforeEach` rather than in the
// factory.
//
// ⚠️ WHAT THESE TESTS CANNOT PROVE. The visibility rules are RLS and
// SECURITY DEFINER functions, and only SQL can prove those -- the
// role-impersonation matrix lives in this phase's report. What is
// pinned here is the half Jest can see: that the UI asks the right
// surfaces, renders the restricted case as a boundary rather than a
// fault, paints the intake control for one position only, and offers no
// action the database cannot perform.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const { supabase } = require('../supabase/supabaseClient')
const toast = require('react-hot-toast').default

const OfficialComplaints = require('./OfficialComplaints').default

const SRC = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
// ⚠️ Comment-stripped. Both files discuss `getPublicUrl`, `category`,
// every P4 verb and the word "case" at length precisely to record that
// none is used.
const code = (p) => read(p).split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Exactly the six columns `complaint_queue()` returns.
const QUEUE = [
  {
    id: 'c1',
    reference: 'CMP-2026-AB12CD',
    intake_channel: 'online',
    status: 'received',
    created_at: '2026-10-16T01:00:00.000Z',
    updated_at: '2026-10-16T01:00:00.000Z',
  },
  {
    id: 'c2',
    reference: 'CMP-2026-9XYZ70',
    intake_channel: 'walk_in',
    status: 'received',
    created_at: '2026-10-15T01:00:00.000Z',
    updated_at: '2026-10-15T01:00:00.000Z',
  },
]

const FULL_ROW = {
  id: 'c1',
  reference: 'CMP-2026-AB12CD',
  category: 'family_dispute',
  status: 'received',
  narrative: 'A disagreement over a shared fence line.',
  location_note: 'beside the covered court',
  intake_channel: 'online',
  created_at: '2026-10-16T01:00:00.000Z',
  updated_at: '2026-10-16T01:00:00.000Z',
}

const PARTIES = [
  {
    id: 'p1', party_role: 'complainant', full_name_snapshot: 'Ezequel Bautista',
    contact_number_snapshot: '09171234567', address_note: null,
    has_profile_link: true, has_registry_link: false,
    created_at: '2026-10-16T01:00:00.000Z',
  },
  {
    id: 'p2', party_role: 'respondent', full_name_snapshot: 'Named Respondent',
    // ⚠️ NULL exactly as `complaint_parties_for()` returns it for a
    // party the caller may not see the contact of.
    contact_number_snapshot: null, address_note: null,
    has_profile_link: false, has_registry_link: false,
    created_at: '2026-10-16T01:00:00.000Z',
  },
]

const ATTACHMENTS = [{
  id: 'a1', object_path: 'c1/photo.jpg', display_filename: 'photo.jpg',
  media_kind: 'photo', mime_type: 'image/jpeg', byte_size: 2048,
  uploaded_at: '2026-10-16T01:00:00.000Z',
}]

const HISTORY = [{
  id: 'h1', from_status: null, to_status: 'received',
  note: 'Encoded at the barangay hall.', created_at: '2026-10-16T01:00:00.000Z',
}]

// `from('complaints').select(...).eq(...).maybeSingle()`
const rowQuery = (data) => ({
  select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }) }),
})

// The authorized caller: the full row resolves and the three RPCs answer.
const asAuthorized = () => {
  supabase.from.mockReturnValue(rowQuery(FULL_ROW))
  supabase.rpc.mockImplementation((fn) => {
    if (fn === 'complaint_queue') return Promise.resolve({ data: QUEUE, error: null })
    if (fn === 'complaint_parties_for') return Promise.resolve({ data: PARTIES, error: null })
    if (fn === 'complaint_history_for') return Promise.resolve({ data: HISTORY, error: null })
    if (fn === 'complaint_attachments_for') return Promise.resolve({ data: ATTACHMENTS, error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

// ⚠️ THE ORDINARY OFFICIAL, AS THE DATABASE ACTUALLY ANSWERS: the queue
// returns every row, and the full row and all three RPCs return NOTHING
// with NO ERROR. RLS filters rows without raising -- measured against
// the live database as `fullrow=0 parties=0` for a Treasurer and a
// Peace-and-Order Kagawad. There is no 42501 and no P0001 in this path.
const asOrdinaryOfficial = () => {
  supabase.from.mockReturnValue(rowQuery(null))
  supabase.rpc.mockImplementation((fn) => {
    if (fn === 'complaint_queue') return Promise.resolve({ data: QUEUE, error: null })
    return Promise.resolve({ data: [], error: null })
  })
}

beforeEach(() => {
  supabase.storage.from.mockReturnValue({
    upload: jest.fn().mockResolvedValue({ data: { path: 'c1/x.jpg' }, error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed' }, error: null,
    }),
  })
  asAuthorized()
})

const renderQueue = (props = {}) => render(<OfficialComplaints {...props} />)

test('uploaded active evidence refreshes both the file list and withdrawal selector; withdrawal requires a reason', async () => {
  let active = []
  const audit = []
  supabase.rpc.mockImplementation(async (fn, args) => {
    if (fn === 'complaint_queue') return { data: QUEUE, error: null }
    if (fn === 'complaint_parties_for') return { data: PARTIES, error: null }
    if (fn === 'complaint_history_for') return { data: HISTORY, error: null }
    if (fn === 'complaint_attachments_for') return { data: active, error: null }
    if (fn === 'case_support_history') return { data: [...audit], error: null }
    if (fn === 'record_complaint_attachment') {
      active = [{ id: 'fresh-evidence', object_path: args.p_object_path, display_filename: args.p_display_filename,
        media_kind: 'photo', mime_type: args.p_mime_type, byte_size: args.p_byte_size }]
      audit.push({ id: 'uploaded', event_kind: 'evidence_uploaded', created_at: '2026-10-18T10:59:00Z', detail: { attachment_id: 'fresh-evidence' } })
      return { data: 'fresh-evidence', error: null }
    }
    if (fn === 'withdraw_complaint_evidence') {
      active = []
      audit.push({ id: 'withdrawn', event_kind: 'evidence_withdrawn', created_at: '2026-10-18T11:00:00Z', detail: { attachment_id: args.p_attachment_id, reason: args.p_reason } })
      return { data: null, error: null }
    }
    return { data: [], error: null }
  })
  renderQueue({ isSecretary: true })
  await screen.findByText('CMP-2026-AB12CD')
  await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
  const withdraw = await screen.findByRole('button', { name: 'Withdraw evidence' })
  expect(withdraw).toBeDisabled()
  expect(screen.getByLabelText('Reason')).toBeDisabled()
  await userEvent.upload(screen.getByLabelText('Additional evidence'), new File(['photo'], 'fresh-photo.jpg', { type: 'image/jpeg' }))
  await userEvent.click(screen.getByRole('button', { name: 'Upload evidence' }))
  await screen.findByRole('button', { name: 'Open fresh-photo.jpg' })
  expect(screen.getByRole('option', { name: 'fresh-photo.jpg' })).toHaveValue('fresh-evidence')
  await userEvent.selectOptions(screen.getByLabelText('File'), 'fresh-evidence')
  expect(screen.getByLabelText('Reason')).toBeEnabled()
  expect(withdraw).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Reason'), '   ')
  expect(withdraw).toBeDisabled()
  expect(supabase.rpc.mock.calls.filter(([fn]) => fn === 'withdraw_complaint_evidence')).toHaveLength(0)
  await userEvent.clear(screen.getByLabelText('Reason'))
  await userEvent.type(screen.getByLabelText('Reason'), 'Sample evidence withdrawn.')
  expect(withdraw).toBeEnabled()
  await userEvent.click(withdraw)
  await waitFor(() => expect(screen.queryByRole('option', { name: 'fresh-photo.jpg' })).not.toBeInTheDocument())
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_complaint_evidence', { p_attachment_id: 'fresh-evidence', p_reason: 'Sample evidence withdrawn.' })
  await userEvent.click(screen.getByText('Evidence and case-support audit'))
  expect(await screen.findByText('Evidence uploaded')).toBeInTheDocument()
  expect(screen.getByText('Evidence withdrawn')).toBeInTheDocument()
  expect(screen.getByText('Reason: Sample evidence withdrawn.')).toBeInTheDocument()
  expect(screen.getByText(/18 Oct 2026.*6:59 PM/)).toBeInTheDocument()
  expect(document.querySelector('.complaint-audit pre')).toBeNull()
  expect(document.querySelector('.complaint-audit')).not.toHaveTextContent('attachment_id')
  expect(document.querySelector('.complaint-audit')).not.toHaveTextContent('fresh-evidence')
})
const rowsOnScreen = () => screen.getAllByRole('row').slice(1)

// ── A. The queue reads complaint_queue() and only its safe output ─────

describe('A. the queue uses the safe RPC', () => {
  it('calls complaint_queue() on mount', async () => {
    renderQueue()
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('complaint_queue'))
  })

  // ⚠️ THE LOAD-BEARING ONE. Against the live database an ordinary
  // official gets ZERO rows from `from('complaints')`, because its one
  // SELECT policy is `complaint_is_visible_to_caller(id)`. A table read
  // for the LIST would hand most of the barangay's officials an empty
  // queue, and widening the policy to fix that would publish every
  // narrative to all eleven.
  it('does not read the complaints table to build the list', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('renders a row per complaint the RPC returned', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(rowsOnScreen()).toHaveLength(2)
  })

  it('shows the status through the label map rather than raw', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.getAllByText('Received').length).toBeGreaterThan(0)
    // The raw value stays reachable as the badge's tooltip, the rule
    // every other status badge in this project follows.
    expect(screen.getAllByTitle('received').length).toBeGreaterThan(0)
  })

  // Scoped to the table: "Walk-in" is also the channel filter's own
  // option label, so an unscoped query matches two legitimate nodes.
  it('names the channel in words, not as a stored value', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const table = screen.getByRole('table')
    expect(within(table).getByText('Walk-in')).toBeInTheDocument()
    expect(within(table).queryByText('walk_in')).not.toBeInTheDocument()
  })

  // "Date received" rather than "Received": the badge in the next column
  // reads "Received" too, and two near-identical strings side by side
  // read as a fault -- the defect HEALTH_NURSE_ROLE exists to prevent,
  // and the same correction P3-B1 made to My Complaints.
  it('heads the date column distinctly from the status badge', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.getByRole('columnheader', { name: 'Date received' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Received' })).not.toBeInTheDocument()
  })
})

// ── B. No subject in a queue row ─────────────────────────────────────

describe('B. a queue row carries no subject', () => {
  it('has no category column', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Reference', 'How it arrived', 'Status', 'Date received', 'Last updated', 'Action',
    ])
  })

  // ⚠️ The fixture's full row is a `family_dispute` with a narrative and
  // a named complainant. None of it may appear until a detail is opened
  // by somebody authorized -- and the queue never asks for it.
  it('shows no narrative, party name, contact or category before a detail is opened', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.queryByText(/fence line/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ezequel Bautista/)).not.toBeInTheDocument()
    expect(screen.queryByText('09171234567')).not.toBeInTheDocument()
    expect(screen.queryByText(/Family Dispute/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/covered court/i)).not.toBeInTheDocument()
  })

  it('summarises by channel and never by category', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.getByText(/2 total/)).toBeInTheDocument()
    expect(screen.getByText(/1 online/)).toBeInTheDocument()
    expect(screen.getByText(/1 walk-in/)).toBeInTheDocument()
  })

  it("names each row's View button with its reference", async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const button = screen.getByRole('button', { name: 'View complaint CMP-2026-AB12CD' })
    // ⚠️ The visible word is the FIRST word of the accessible name, so a
    // voice-control user saying "click View" still matches (WCAG 2.5.3).
    expect(button).toHaveTextContent('View')
    expect(button.getAttribute('aria-label')).toMatch(/^View /)
  })
})

// ── C. Two empty states, and a search that narrows ───────────────────

describe('C. empty states and narrowing', () => {
  it('says the queue is empty when the RPC returned nothing', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    renderQueue()
    expect(await screen.findByText(/No complaints have been recorded yet/i)).toBeInTheDocument()
  })

  it('offers no filter controls when there is nothing to narrow', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    renderQueue()
    await screen.findByText(/No complaints have been recorded yet/i)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  // ⚠️ Saying the queue is empty while a filter is applied tells an
  // official there is no work waiting when there is.
  it('distinguishes a filter that matched nothing from an empty queue', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.type(screen.getByRole('searchbox'), 'ZZZZZZ')
    expect(await screen.findByText(/No complaints match this search or filter/i))
      .toBeInTheDocument()
    expect(screen.queryByText(/No complaints have been recorded yet/i)).not.toBeInTheDocument()
  })

  it('narrows to a matching reference', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.type(screen.getByRole('searchbox'), 'AB12CD')
    await waitFor(() => expect(rowsOnScreen()).toHaveLength(1))
    expect(screen.queryByText('CMP-2026-9XYZ70')).not.toBeInTheDocument()
  })

  // ⚠️ THREE STATUSES NOW, NOT ONE, and the list is still exactly what
  // the CHECK permits. Migration 042 widened `complaints_status_check`
  // from `received` alone to `received`/`under_review`/`screened`, so
  // the two new options are reachable rows rather than a fabricated
  // workflow -- and no option exists for a stage the system cannot
  // reach, which is the property this test has always held. There is
  // deliberately no KP Eligible, Under Mediation, Settled, Referred,
  // Closed or Dismissed.
  it('offers no status option the database cannot hold', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const options = Array.from(
      screen.getByLabelText('Filter by status').querySelectorAll('option'),
    ).map((o) => o.textContent)
    expect(options).toEqual([
      'All statuses', 'Received', 'Under barangay review', 'Reviewed by the barangay',
    ])
  })

  // ⚠️ And the outcome stays out of the queue. A status may say which
  // STAGE a complaint has reached; it must never say what the barangay
  // decided, which is the screening's own record and is restricted to
  // the two positions that may read it.
  it('names no screening outcome in the status filter', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const words = Array.from(
      screen.getByLabelText('Filter by status').querySelectorAll('option'),
    ).map((o) => o.textContent).join(' ').toLowerCase()
    ;['eligible', 'ineligible', 'proceed', 'refer', 'close', 'dismiss',
      'settled', 'mediation', 'jurisdiction', 'katarungang', 'lupon']
      .forEach((term) => expect(words).not.toContain(term))
  })
})

// ── D. The restricted detail: a boundary, not a fault ────────────────

describe('D. an ordinary official sees the queue and not the detail', () => {
  it('keeps every queue row on screen', async () => {
    asOrdinaryOfficial()
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(rowsOnScreen()).toHaveLength(2)
  })

  // ⚠️ THE LOAD-BEARING ONE. §7: do not hide the queue merely because
  // the detail is restricted, and do not surface a raw refusal.
  it('shows the neutral restricted sentence when the detail returns nothing', async () => {
    asOrdinaryOfficial()
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    expect(await screen.findByText(/restricted to authorized records staff/i)).toBeInTheDocument()
    // The queue is still there.
    expect(screen.getByText('CMP-2026-9XYZ70')).toBeInTheDocument()
  })

  it('shows no narrative, party, contact or evidence in the restricted state', async () => {
    asOrdinaryOfficial()
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByText(/restricted to authorized records staff/i)
    expect(screen.queryByText(/fence line/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ezequel Bautista/)).not.toBeInTheDocument()
    // ⚠️ No filename and no storage path either -- an official who may
    // not open evidence is not told what evidence exists.
    expect(screen.queryByText('photo.jpg')).not.toBeInTheDocument()
    expect(screen.queryByText(/c1\/photo/)).not.toBeInTheDocument()
  })

  // ⚠️ RLS FILTERS ROWS WITHOUT RAISING, so the restricted case arrives
  // as zero rows and NO error. A screen that reported a failure would
  // be describing a boundary working correctly as a malfunction.
  it('does not present the restriction as an error', async () => {
    asOrdinaryOfficial()
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByText(/restricted to authorized records staff/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be opened/i)).not.toBeInTheDocument()
  })

  it('exposes no SQLSTATE, policy name or function name on screen', async () => {
    asOrdinaryOfficial()
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByText(/restricted to authorized records staff/i)
    const text = document.body.textContent
    ;['42501', 'P0001', '23514', 'permission denied', 'row-level security',
      'complaint_is_visible_to_caller', 'complaint_parties_for', 'auth.uid']
      .forEach((term) => expect(text).not.toContain(term))
  })
})

// ── E. The authorized detail ─────────────────────────────────────────

describe('E. the authorized detail panel', () => {
  const open = async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByText(/fence line/i)
  }

  it('shows the category, narrative and location the queue withheld', async () => {
    await open()
    expect(screen.getByText('Family Dispute')).toBeInTheDocument()
    expect(screen.getByText(/A disagreement over a shared fence line/)).toBeInTheDocument()
    expect(screen.getByText('beside the covered court')).toBeInTheDocument()
  })

  it('calls the three detail RPCs and no private table', async () => {
    await open()
    const called = supabase.rpc.mock.calls.map((c) => c[0])
    expect(called).toContain('complaint_parties_for')
    expect(called).toContain('complaint_history_for')
    expect(called).toContain('complaint_attachments_for')
    const tables = supabase.from.mock.calls.map((c) => c[0])
    expect(tables).toEqual(['complaints'])
  })

  it('shows the complainant contact that the RPC returned', async () => {
    await open()
    expect(screen.getByText('09171234567')).toBeInTheDocument()
  })

  // ⚠️ THE LOAD-BEARING ONE. `complaint_parties_for()` returns a
  // respondent's contact as NULL, and that NULL is rendered as a
  // STATEMENT rather than as a blank cell -- an empty cell reads as
  // missing data rather than as a rule. Nothing reconstructs it, and
  // there is no other source: `complaint_parties` carries no client
  // privilege at all.
  it('renders a withheld contact as a statement, not as a blank', async () => {
    await open()
    const respondent = screen.getByText('Named Respondent').closest('li')
    expect(within(respondent).getByText(/No contact number recorded/i)).toBeInTheDocument()
  })

  it('omits the location row entirely when nothing was recorded', async () => {
    supabase.from.mockReturnValue(rowQuery({ ...FULL_ROW, location_note: null }))
    await open()
    expect(screen.queryByText(/Where it happened/i)).not.toBeInTheDocument()
  })

  // ⚠️ `complaint_history_for()` selects id, from_status, to_status,
  // note and created_at and deliberately OMITS `actor_profile_id`.
  // Displaying an actor would mean querying
  // `complaint_status_history` directly, which has no client privilege.
  it('shows no actor in the history', async () => {
    await open()
    const src = code('complaints/OfficialComplaints.jsx')
    expect(src).not.toContain('actor_profile_id')
    expect(src).not.toContain('actor')
    expect(src).not.toContain('complaint_status_history')
  })

  // ⚠️ THE SENTENCE IS GONE BECAUSE THE FACT CHANGED AGAIN, and this is
  // the SECOND time at this one site -- which is worth reading, because
  // it is what a guard over a denial looks like when the denial keeps
  // becoming untrue.
  //
  //   P3-B2  "Screening, referral and case handling are not part of
  //           this system yet."
  //   P4-A   screening arrived, so the first of those three became
  //           false and the sentence was REWORDED to deny the other
  //           two: "Case handling after screening -- hearings,
  //           settlement and referral records -- is not part of this
  //           system yet."
  //   now    hearings and a recorded outcome have arrived, so the
  //           reworded sentence is false too. There is nothing left for
  //           it to deny honestly, so it is REMOVED rather than reworded
  //           a third time, and the panel it would have contradicted
  //           takes its place.
  //
  // The property this test has held throughout is unchanged: the detail
  // panel never leaves an empty space where a reader expects a control.
  // It is now satisfied by a control rather than by a sentence, so the
  // assertion is that the KP case panel is THERE -- and BOTH retired
  // wordings are asserted gone, because a page that denies having a
  // feature it now has is worse than one that says nothing. Settlement
  // TERMS, repudiation, compliance and a CFA are still absent and are
  // still asserted absent, in section J below.
  it('offers the KP case panel where its denial sentence used to be', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'KP case' })).toBeInTheDocument()
    expect(screen.queryByText(/Case handling after screening/i))
      .not.toBeInTheDocument()
    expect(screen.queryByText(/Screening, referral and case handling are not part/i))
      .not.toBeInTheDocument()
  })
})

// ── F. Evidence ──────────────────────────────────────────────────────

describe('F. evidence access', () => {
  it('mints a short-lived signed URL on each view and stores none', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed' }, error: null,
    })
    supabase.storage.from.mockReturnValue({ createSignedUrl })
    window.open = jest.fn()

    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByRole('button', { name: 'Open photo.jpg' })
    await userEvent.click(screen.getByRole('button', { name: 'Open photo.jpg' }))

    await waitFor(() => expect(createSignedUrl).toHaveBeenCalledWith('c1/photo.jpg', 60))
    expect(supabase.storage.from).toHaveBeenCalledWith('complaint-evidence')

    // Opened again -> signed again. A cached signature is a link that
    // outlives the session entitled to it.
    await userEvent.click(screen.getByRole('button', { name: 'Open photo.jpg' }))
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalledTimes(2))
  })

  // ⚠️ `getPublicUrl()` 404s on a private bucket even with a permissive
  // policy, and reaching for it is how a private bucket quietly becomes
  // a public one.
  it('never calls getPublicUrl and builds no bucket URL by hand', () => {
    const src = code('complaints/OfficialComplaints.jsx') + code('complaints/complaintApi.js')
    expect(src).not.toContain('getPublicUrl')
    expect(src).not.toContain('/storage/v1/object/public')
  })
})

// ── G. The walk-in control is painted for one position only ──────────

describe('G. the walk-in intake control', () => {
  it('is absent without the Secretary flag', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.queryByRole('button', { name: /Record Walk-in Complaint/i }))
      .not.toBeInTheDocument()
  })

  it('is present for the Secretary', async () => {
    renderQueue({ isSecretary: true })
    await screen.findByText('CMP-2026-AB12CD')
    expect(screen.getByRole('button', { name: /Record Walk-in Complaint/i }))
      .toBeInTheDocument()
  })

  // ⚠️ ABSENT, NOT DISABLED. `ActionMenu`'s own rule: an action a role
  // may not perform must not be rendered at all, because a disabled
  // control advertises a capability and cannot be told from a bug.
  it('is absent rather than rendered disabled', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const disabled = Array.from(document.querySelectorAll('button[disabled]'))
      .map((b) => b.textContent)
    expect(disabled.join(' ')).not.toMatch(/Walk-in/i)
  })

  // ⚠️ THE PUNONG BARANGAY IS NOT GIVEN IT EITHER, and that is measured
  // rather than assumed: `encode_walk_in_complaint()` raises P0001
  // unless the caller holds the Barangay Secretary position, and the
  // Punong Barangay was refused by it against the live database -- even
  // though he reads every complaint.
  //
  // ⚠️ SCOPED TO THE CONTROL, not to the file, and the narrowing is
  // deliberate rather than a loosening. P4-A gave this component a
  // second flag, `isKapitan`, which gates the SCREENING CONFIRMATION
  // control -- a different control, with a different database gate
  // (`confirm_complaint_screening()` requires the Punong Barangay and
  // refuses the Secretary). So "the file mentions no Punong" stopped
  // being the property; "the walk-in gate is `isSecretary` and nothing
  // else" is, and that is what is asserted.
  it('has no Punong Barangay branch that could render it', () => {
    const src = code('complaints/OfficialComplaints.jsx')
    const at = src.indexOf('Record Walk-in Complaint')
    expect(at).toBeGreaterThan(-1)

    // The conditional the control is rendered under, read out of the
    // source rather than assumed: the last `{<expr> && (` before it.
    const before = src.slice(0, at)
    const gates = before.match(/\{\s*[^{}\n]*?&&\s*\(/g) || []
    const gate = gates[gates.length - 1]
    expect(gate).toBeDefined()
    expect(gate).toContain('isSecretary')
    expect(gate).not.toContain('isKapitan')
    expect(gate).not.toContain('isTreasurer')
    expect(gate).not.toMatch(/Punong|kapitan/i)
  })

  // ⚠️ And the second flag reaches ONE place: the screening panel's
  // props. If `isKapitan` ever appeared in a second expression in this
  // file it would be gating something the brief did not give it, which
  // is exactly what the old whole-file scan was protecting against.
  // ⚠️ COUNTED BY LINE, NOT BY TOKEN, and that is my own arithmetic
  // corrected rather than a weakened assertion: the first version
  // expected two occurrences and got three, because
  // `isKapitan={isKapitan}` is one line carrying the name twice. A
  // count of tokens answers a question nobody asked; the property is
  // that the flag appears in exactly two PLACES -- where it arrives,
  // and where it is handed on.
  // ⚠️ A THIRD LINE, AND IT IS THE SAME SHAPE AS THE SECOND. Combined
  // Phase 1 hands the flag to one more child panel, so the count moves
  // from two to three -- and the assertion is tightened rather than
  // loosened: every line is now required to be either the destructured
  // default or a `isKapitan={isKapitan}` HAND-OFF. A line using the flag
  // in any other expression -- a gate, a ternary, a comparison -- fails,
  // which is the property the original count was protecting and which a
  // bare `toHaveLength(3)` would not have held.
  it('uses the Punong Barangay flag only as a default and a hand-off', () => {
    const lines = code('complaints/OfficialComplaints.jsx')
      .split('\n').filter((l) => l.includes('isKapitan'))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/isKapitan\s*=\s*false/)   // the destructured default
    lines.slice(1).forEach((line) => {
      expect(line.trim()).toBe('isKapitan={isKapitan}')
    })
  })
})

// ── H. The walk-in form ──────────────────────────────────────────────

describe('H. the walk-in form', () => {
  const openForm = async () => {
    renderQueue({ isSecretary: true })
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /Record Walk-in Complaint/i }))
    return screen.findByLabelText(/Full name/i)
  }

  // ⚠️ Scoped to the Complainant fieldset. Each respondent block is ALSO
  // labelled "Contact number", which is correct on screen -- the
  // fieldset legend is what distinguishes them -- so an unscoped query
  // is my own ambiguity rather than a duplicate-label defect.
  it('asks for the complainant, the category and the narrative', async () => {
    await openForm()
    const complainant = within(screen.getByRole('group', { name: /^Complainant$/i }))
    expect(complainant.getByLabelText(/Full name/i)).toBeInTheDocument()
    expect(complainant.getByLabelText(/Contact number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/What is this complaint about/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/What happened/i)).toBeInTheDocument()
  })

  // ⚠️ NOTHING THE SERVER OWNS. None of these is a parameter of
  // `encode_walk_in_complaint()`: the reference is stamped by a trigger,
  // the status is the literal `received`, `encoded_by` comes from
  // `auth.uid()`, and `filed_by_profile_id` is NULL for a walk-in.
  it('asks for no reference, status, actor, timestamp or system id', async () => {
    await openForm()
    const labels = Array.from(screen.getByRole('dialog', { name: 'Record Walk-in Complaint' }).querySelectorAll('label'))
      .map((l) => l.textContent.toLowerCase()).join(' | ')
    ;['reference', 'status', 'encoded by', 'encoded_by', 'filed by', 'actor',
      'date received', 'timestamp', 'system id', 'complaint id', 'uuid']
      .forEach((term) => expect(labels).not.toContain(term))
  })

  // ⚠️ NO RESIDENT OR VOTER PICKER. The Voter Reference List holds the
  // voter records the barangay happens to have, not a roll of who lives
  // here, and putting it behind a search box on an intake screen would
  // publish it one query at a time.
  it('offers no account or voter-registry lookup', async () => {
    await openForm()
    const src = code('complaints/WalkInComplaintForm.jsx')
    ;['residents_registry', 'registryEntries', 'findRegistryMatch',
      'profiles', 'registry_entry_id', 'profile_id']
      .forEach((term) => expect(src).not.toContain(term))
    expect(within(screen.getByRole('dialog', { name: 'Record Walk-in Complaint' })).queryByRole('searchbox')).not.toBeInTheDocument()
  })

  // ⚠️ FREE TEXT, NOT A PUROK DROPDOWN. P2 established there is nothing
  // canonical to choose from, and the column is `location_note`.
  it('records the location as free text rather than a purok', async () => {
    await openForm()
    const src = code('complaints/WalkInComplaintForm.jsx')
    expect(src).toContain('locationNote')
    expect(src).not.toMatch(/PUROKS/)
    expect(src).not.toMatch(/purok/i)
  })

  it('refuses a submission with no complainant name, with an accessible alert', async () => {
    await openForm()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/complainant's name/i)
    expect(supabase.rpc).not.toHaveBeenCalledWith('encode_walk_in_complaint', expect.anything())
  })

  it('refuses a submission with no narrative', async () => {
    await openForm()
    const complainant = within(screen.getByRole('group', { name: /^Complainant$/i }))
    await userEvent.type(complainant.getByLabelText(/Full name/i), 'Walk-in Person')
    await userEvent.selectOptions(screen.getByLabelText(/What is this complaint about/i), 'noise')
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/describe what happened/i)
  })

  it('constrains the file picker to the supported evidence types, never a wildcard', async () => {
    await openForm()
    const picker = screen.getByLabelText(/Attach photos or a PDF/i)
    const accept = picker.getAttribute('accept')
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('application/pdf')
    expect(accept).not.toContain('*/*')
    expect(accept).toContain('video/mp4')
  })

  it('describes supported video and witness statements', async () => {
    await openForm()
    expect(screen.getByText(/Videos: MP4 or WebM/i)).toBeInTheDocument()
  })

  // ⚠️ The consequence is permanent and invisible otherwise:
  // `track_complaint()` requires a non-empty contact and matches it
  // against the complainant's stored one, so a complaint encoded
  // without a number can NEVER be tracked -- measured as zero rows for
  // any contact, the empty string included.
  it('says what the contact number unlocks, without demanding one', async () => {
    await openForm()
    expect(screen.getByText(/cannot be tracked online/i)).toBeInTheDocument()
    const complainant = within(screen.getByRole('group', { name: /^Complainant$/i }))
    expect(complainant.getByLabelText(/Contact number/i)).not.toBeRequired()
  })
})

// ── I. Encoding, duplicate prevention and the success panel ──────────

describe('I. encoding a walk-in complaint', () => {
  const fill = async ({ contact } = {}) => {
    renderQueue({ isSecretary: true })
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /Record Walk-in Complaint/i }))
    await screen.findByLabelText(/Full name/i)
    const complainant = within(screen.getByRole('group', { name: /^Complainant$/i }))
    await userEvent.type(complainant.getByLabelText(/Full name/i), 'Walk-in Person')
    if (contact) await userEvent.type(complainant.getByLabelText(/Contact number/i), contact)
    await userEvent.selectOptions(screen.getByLabelText(/What is this complaint about/i), 'noise')
    await userEvent.type(screen.getByLabelText(/What happened/i), 'Reported at the counter.')
  }

  const encodeOk = (reference = 'CMP-2026-NEW001') => {
    supabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'new1' }, error: null }) }),
      }),
    })
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'encode_walk_in_complaint') return Promise.resolve({ data: reference, error: null })
      if (fn === 'complaint_queue') return Promise.resolve({ data: QUEUE, error: null })
      return Promise.resolve({ data: [], error: null })
    })
  }

  it('sends only the fields the RPC accepts', async () => {
    await fill({ contact: '0917 555 0101' })
    encodeOk()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
      'encode_walk_in_complaint',
      expect.objectContaining({
        p_complainant_name: 'Walk-in Person',
        p_complainant_contact: '0917 555 0101',
        p_category: 'noise',
        p_narrative: 'Reported at the counter.',
      }),
    ))
    const payload = supabase.rpc.mock.calls
      .find((c) => c[0] === 'encode_walk_in_complaint')[1]
    expect(Object.keys(payload).sort()).toEqual([
      'p_category', 'p_complainant_contact', 'p_complainant_name',
      'p_location_note', 'p_narrative', 'p_respondents',
    ])
  })

  it('shows the reference and the wording the Secretary reads out', async () => {
    await fill({ contact: '0917 555 0101' })
    encodeOk()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    expect(await screen.findByText('CMP-2026-NEW001')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Record Walk-in Complaint' })).not.toBeInTheDocument()
    expect(screen.getByText(/Give this reference number to the complainant/i))
      .toBeInTheDocument()
    expect(screen.getByText(/need the contact number recorded on this complaint/i))
      .toBeInTheDocument()
  })

  // ⚠️ Warned ONLY when it is true of this complaint, at the counter,
  // while the complainant is still in front of the Secretary.
  it('warns when no contact was recorded, and not when one was', async () => {
    await fill()
    encodeOk()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    await screen.findByText('CMP-2026-NEW001')
    expect(screen.getByText(/cannot be tracked online/i)).toBeInTheDocument()
  })

  it('does not warn about tracking when a contact was recorded', async () => {
    await fill({ contact: '09175550101' })
    encodeOk()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    await screen.findByText('CMP-2026-NEW001')
    expect(screen.queryByText(/cannot be tracked online/i)).not.toBeInTheDocument()
  })

  // ⚠️ THE LOAD-BEARING ONE, and the FIRST VERSION OF IT PROVED
  // NOTHING. It clicked the button three times, and `userEvent.click`
  // does nothing to a `disabled` button -- so the test passed whether
  // or not the handler's own guard existed. The mutation run caught it:
  // deleting `if (submitting) return` failed ZERO tests.
  //
  // Submitting the FORM is what exercises the guard, and it is also the
  // real-world case the guard exists for: a keyboard Enter in a text
  // field submits the form and can beat the re-render that disables the
  // button. A second encode would create a second complaint with its
  // own reference that nothing downstream could tell apart.
  //
  // Both directions: with `if (submitting) return` removed this test
  // reports 3 calls instead of 1.
  it('encodes once however many times the form is submitted', async () => {
    await fill({ contact: '09175550101' })
    let release
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'encode_walk_in_complaint') {
        return new Promise((resolve) => { release = () => resolve({ data: 'CMP-2026-ONCE11', error: null }) })
      }
      return Promise.resolve({ data: QUEUE, error: null })
    })

    const form = document.querySelector('form.complaint-form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    const encodes = supabase.rpc.mock.calls.filter((c) => c[0] === 'encode_walk_in_complaint')
    expect(encodes).toHaveLength(1)

    // And the button is disabled as well -- two mechanisms, each
    // asserted, rather than one standing in for the other.
    expect(screen.getByRole('button', { name: /Recording/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close walk-in complaint' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Record Walk-in Complaint' })).toBeInTheDocument()
    release()
  })

  it('refetches the queue after a successful encode', async () => {
    await fill({ contact: '09175550101' })
    encodeOk()
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))
    await screen.findByText('CMP-2026-NEW001')
    const queueCalls = supabase.rpc.mock.calls.filter((c) => c[0] === 'complaint_queue')
    expect(queueCalls.length).toBeGreaterThanOrEqual(1)
  })

  // ⚠️ The trigger's own refusal names the position gate. Printing it
  // would put an authorization model in a toast at the counter.
  it('shows a neutral sentence rather than the trigger text on refusal', async () => {
    await fill({ contact: '09175550101' })
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'encode_walk_in_complaint') {
        return Promise.resolve({
          data: null,
          error: {
            message: 'Only the Barangay Secretary can encode a walk-in complaint.',
            code: 'P0001',
          },
        })
      }
      return Promise.resolve({ data: QUEUE, error: null })
    })
    await userEvent.click(screen.getByRole('button', { name: /Record complaint/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/cannot record a walk-in complaint/i)
    expect(document.body.textContent).not.toContain('P0001')
    expect(document.body.textContent).not.toContain('Only the Barangay Secretary can encode')
  })
})

// ── J. No decision, no screening, no case ────────────────────────────

describe('J. nothing here decides anything about a complaint', () => {
  it('renders no status-changing control', async () => {
    renderQueue({ isSecretary: true })
    await screen.findByText('CMP-2026-AB12CD')
    await userEvent.click(screen.getByRole('button', { name: /View complaint CMP-2026-AB12CD/ }))
    await screen.findByText(/fence line/i)

    const buttons = screen.getAllByRole('button').map((b) => b.textContent.toLowerCase()).join(' | ')
    ;['approve', 'reject', 'decline', 'deny', 'mediat', 'refer', 'settle',
      'close case', 'schedule', 'hearing', 'summon', 'dismiss', 'resolve',
      'escalate']
      .forEach((verb) => expect(buttons).not.toContain(verb))
  })

  it('writes no status and inserts nothing anywhere', () => {
    const src = code('complaints/OfficialComplaints.jsx') + code('complaints/WalkInComplaintForm.jsx')
    expect(src).not.toContain('.update(')
    expect(src).not.toContain('.insert(')
    expect(src).not.toContain('.upsert(')
    expect(src).not.toContain('.delete(')
  })

  // ⚠️ THE SCOPE-OUT IS GONE BECAUSE THE PARAGRAPH IT PROTECTED IS
  // GONE, and the scan is now whole-file again -- which is STRICTER
  // than the P4-A version, not weaker.
  //
  // P4-A ran this over the file MINUS its one denial paragraph, the
  // `prototypeCoverage.test.js` precedent: the paragraph whose whole job
  // was to say hearings and settlement are absent was the one place
  // those words had to appear. Combined Phase 1 removed that paragraph
  // (see section E), so there is no exemption left to carve out and none
  // is carved.
  //
  // ⚠️ THE LIST IS THE P3 LIST MINUS ONLY WHAT THIS PHASE GENUINELY
  // MADE REACHABLE, named individually so a failure says which word
  // appeared. `mediation`, `summons`, `pangkat` and `kp_case` are now
  // real -- they live in `kpcases/`, which has its own suites -- but
  // THIS file must still not acquire them, because it holds the queue
  // and the detail and renders the case panel as a child rather than
  // reaching into it.
  //
  // ⚠️ WHAT IS STILL FORBIDDEN OUTRIGHT, in this file and everywhere in
  // this phase: `settlement` TERMS, `repudiation`, `certificate to
  // file`, `jurisdiction`, `blotter`, `tanod`. Each is a §10 deferral
  // and none of them is reachable from anywhere in the application.
  it('names no KP vocabulary of its own, and none of the deferred stages', () => {
    const src = (code('complaints/OfficialComplaints.jsx')
      + code('complaints/WalkInComplaintForm.jsx')).toLowerCase()

    // Not in THIS file, though `kpcases/` now holds them legitimately.
    ;['katarungang', 'lupon', 'pangkat', 'mediation', 'conciliation',
      'summons', 'complaint_screenings', 'kp_cases', 'kp_hearings']
      .forEach((term) => expect(src).not.toContain(term))

    // Not anywhere in this phase -- §10.
    ;['settlement', 'repudiation', 'certificate to file', 'jurisdiction',
      'blotter', 'tanod']
      .forEach((term) => expect(src).not.toContain(term))

    // ⚠️ The retired denial paragraph must not be back. A sentence
    // saying case handling is absent, beside the panel that provides
    // it, is the contradiction section E exists to prevent.
    expect(src).not.toContain('not part of this system yet')
  })

  // ⚠️ THE SCREENING NEVER REACHES THE DATABASE FROM HERE. This file
  // renders `<ScreeningPanel>` and passes it two flags; it names no
  // screening RPC and reads no screening table, so the queue file
  // cannot acquire a second path to the same records.
  it('calls no screening RPC and names no screening table itself', () => {
    const src = code('complaints/OfficialComplaints.jsx')
    expect(src).not.toContain('prepare_complaint_screening')
    expect(src).not.toContain('confirm_complaint_screening')
    expect(src).not.toContain('complaint_screenings_for')
    expect(src).not.toContain('complaint_screenings')
  })

  it('files no activity-log entry and sends no notification', () => {
    const src = code('complaints/OfficialComplaints.jsx') + code('complaints/WalkInComplaintForm.jsx')
    expect(src).not.toContain('logActivity')
    expect(src).not.toContain('activity_log')
    expect(src).not.toContain('notifications')
    expect(src).not.toContain('notify')
  })
})

// ── K. Nothing sensitive leaves through a toast or the console ────────

describe('K. no complaint content leaks sideways', () => {
  it('logs no narrative, party or category to the console', () => {
    const src = code('complaints/OfficialComplaints.jsx')
      + code('complaints/WalkInComplaintForm.jsx')
    const logs = [...src.matchAll(/console\.\w+\(([^)]*)\)/g)].map((m) => m[1])
    logs.forEach((arg) => {
      ;['narrative', 'category', 'full_name', 'contact', 'party', 'reference']
        .forEach((field) => expect(arg).not.toContain(field))
    })
  })

  // ⚠️ A category or a narrative excerpt in a toast is the accusation,
  // on a screen somebody may be standing beside at the counter.
  it('passes no complaint content to a toast', async () => {
    renderQueue({ isSecretary: true })
    await screen.findByText('CMP-2026-AB12CD')
    const src = code('complaints/OfficialComplaints.jsx')
    const toasts = [...src.matchAll(/toast[.\w]*\(([^)]*)\)/g)].map((m) => m[1])
    expect(toasts.length).toBeGreaterThan(0)
    toasts.forEach((arg) => {
      // Every toast argument is a COMPLAINT_ERRORS lookup, never a
      // template string carrying a row value.
      expect(arg).toMatch(/COMPLAINT_ERRORS/)
      expect(arg).not.toContain('`')
    })
    expect(toast).not.toHaveBeenCalled()
  })
})

// ── L. committee is descriptive data, and the architecture holds ─────

describe('L. the architecture the phase committed to', () => {
  // ⚠️ `barangay_officials.committee` IS DESCRIPTIVE DATA, NOT
  // AUTHORIZATION DATA. It is free text with no CHECK, the Edit Official
  // form sends it for any row, and `protect_official_record()` does not
  // guard it -- so authorizing on it would reproduce migration 028's
  // escalation on an unguarded column. A real
  // `Peace and Order and Appropriation` value exists on one Kagawad and
  // it grants nothing here.
  it('reads neither committee nor full_name for any decision', () => {
    const src = code('complaints/OfficialComplaints.jsx')
      + code('complaints/WalkInComplaintForm.jsx')
      + code('complaints/complaintQueue.js')
    expect(src).not.toContain('committee')
    expect(src).not.toContain('full_name =')
    expect(src).not.toContain("eq('full_name'")
  })

  // ⚠️ ALL COMPLAINT STATE IS IN THE COMPONENT. OfficialDashboard.jsx is
  // ~5,640 lines and already holds every tab's state.
  //
  // ⚠️ P4-A ADDED ONE PROP AND NOTHING ELSE. The screening needed the
  // Punong Barangay flag, which the dashboard already computes for the
  // kapitan status row, so the tab line carries a second attribute --
  // and the forbidden list below grew by every screening surface, so
  // the dashboard still cannot acquire state or a data path of its own.
  it('keeps the dashboard to a tab line, with no complaint state in it', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    expect(dash).toContain(
      '<OfficialComplaints isSecretary={isSecretary} isKapitan={isKapitan} />',
    )
    ;['complaint_queue', 'encode_walk_in_complaint', 'complaint_parties_for',
      'complaint_attachments_for', 'complaint_history_for',
      'setComplaints', 'complaintRows',
      'prepare_complaint_screening', 'confirm_complaint_screening',
      'complaint_screenings', 'setScreenings', 'ScreeningPanel']
      .forEach((term) => expect(dash).not.toContain(term))
  })

  // ⚠️ A TAB, NOT A ROUTE, and that is what is consistent with this
  // router: `/official` is a single ProtectedRoute and NOT ONE of the
  // thirteen official tabs has a route of its own.
  it('adds no route and no role, leaving the official gate as it was', () => {
    const app = read('App.js')
    expect(app).not.toContain('official/complaints')
    expect(app).not.toContain('OfficialComplaints')
    expect(app).toContain('<ProtectedRoute allowedRole="official">')
    // The only complaint route in the app is still P3-B1's public one.
    expect((app.match(/complaint/gi) || []).length).toBeGreaterThan(0)
    expect(app).toContain('/track-complaint')
  })

  it('leaves the nurse and resident navigation untouched', () => {
    const sidebar = read('components/Sidebar.jsx')
    const nurse = /const nurseNavItems = \[([\s\S]*?)\n  \]/.exec(sidebar)[1]
    expect(nurse).not.toContain('complaints')
    const resident = /const residentNavItems = \[([\s\S]*?)\n  \]/.exec(sidebar)[1]
    // The resident has had one since P3-B1; it is the same single entry.
    expect((resident.match(/complaints/g) || [])).toHaveLength(1)
  })

  // ⚠️ Q. P1's unsupported-role fail-safe is untouched: the Map, the
  // empty default and the two empty states all survive this phase.
  // ⚠️ COMMENT-STRIPPED for the bracket scan. Sidebar.jsx's own header
  // writes out `portalsByRole['constructor']` to explain why a Map is
  // used instead of an object lookup -- so a raw scan fails on the
  // prose documenting the very thing it is checking for. The A5 trap,
  // and the second time it caught me in this phase.
  it('keeps P1 role selection failing closed', () => {
    const sidebar = read('components/Sidebar.jsx')
    const sidebarCode = code('components/Sidebar.jsx')
    expect(sidebar).toContain('const portalsByRole = new Map([')
    expect(sidebar).toContain('const navItems = portal ? portal.navItems : []')
    expect(sidebar).toContain("const portalName = portal ? portal.portalName : 'Dashboard'")
    // Not an object literal keyed by role, which answers for inherited
    // property names.
    expect(sidebarCode).not.toMatch(/portalsByRole\[/)
  })

  // ⚠️ THE NUMBER MOVES WITH EACH PHASE AND THE PROPERTY DOES NOT:
  // each phase adds AT MOST ONE migration, and the count is asserted
  // rather than the absence, so a phase that quietly reached for a
  // second one still fails here. P3-B2 added none, P4-A added 042 and
  // Combined Phase 1 added 043, Combined Phase 2 added 044 and Final
  // Integration added 045 -- one apiece, and 045 is the newest.
  it('lists the expected migrations through 056', () => {
    const dir = path.join(__dirname, '..', '..', 'supabase-migrations')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toHaveLength(56)
    expect(files[41]).toBe('042_kp_screening_foundation.sql')
    expect(files[42]).toBe('043_kp_case_hearings_summons.sql')
    expect(files[43]).toBe('044_incident_blotter_tanod.sql')
    expect(files[44]).toBe('045_public_safety_aggregates.sql')
    expect(files[45]).toBe('046_kp_conclude_case.sql')
    expect(files[46]).toBe('047_edit_tanod_member.sql')
    expect(files[47]).toBe('048_location_type_ties.sql')
    expect(files[48]).toBe('049_public_zone_type_counts.sql')
    expect(files[49]).toBe('050_case_evidence_support.sql')
    expect(files[50]).toBe('051_case_review_support.sql')
    expect(files[51]).toBe('052_tanod_accounts_and_duty.sql')
    expect(files[52]).toBe('053_tanod_incident_access.sql')
    expect(files[53]).toBe('054_barangay_resident_directory.sql')
    expect(files[54]).toBe('055_verified_resident_directory_sync.sql')
    expect(files[55]).toBe('056_resident_eligibility.sql')
    expect(files.some((f) => f.startsWith('057'))).toBe(false)
  })
})


describe('floating complaint details', () => {
  it('opens details only inside a labelled modal, traps focus, and returns focus on Close', async () => {
    renderQueue({ isSecretary: true })
    const view = await screen.findByRole('button', { name: 'View complaint CMP-2026-AB12CD' })
    view.focus()
    await userEvent.click(view)
    const modal = await screen.findByRole('dialog', { name: 'Complaint Details' })
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(await within(modal).findByText(/shared fence line/)).toBeInTheDocument()
    expect(modal).toContainElement(document.querySelector('.complaint-detail-panel'))
    expect(document.querySelector('.dashboard-card.complaint-detail-panel')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    const closeIcon = within(modal).getByRole('button', { name: 'Close complaint details' })
    expect(within(modal).getAllByRole('button', { name: /close/i })).toHaveLength(1)
    expect(modal.querySelector('.confirm-dialog-actions')).toBeNull()
    const header = modal.querySelector('.complaint-modal-header')
    expect(within(header).getByRole('heading', { name: 'Complaint Details' })).toBeInTheDocument()
    expect(within(header).getByText('CMP-2026-AB12CD')).toBeInTheDocument()
    expect(within(header).getByText('Received')).toBeInTheDocument()
    expect(header).toContainElement(closeIcon)
    const controls = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
    const lastControl = controls[controls.length - 1]
    expect(closeIcon).toHaveFocus()
    lastControl.focus()
    await userEvent.tab()
    expect(closeIcon).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(lastControl).toHaveFocus()
    await userEvent.click(closeIcon)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(view).toHaveFocus()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closes with Escape and opens the next selected complaint with its own data', async () => {
    supabase.from.mockImplementation(() => ({ select: () => ({ eq: (_, id) => ({ maybeSingle: async () => ({ data: { ...FULL_ROW, id, reference: QUEUE.find(row => row.id === id).reference, narrative: id === 'c1' ? 'First complaint narrative' : 'Second complaint narrative' }, error: null }) }) }) }))
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'View complaint CMP-2026-AB12CD' }))
    expect(await screen.findByText('First complaint narrative')).toBeInTheDocument()
    const previousBody = document.querySelector('.complaint-modal-body')
    previousBody.scrollTop = 400
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View complaint CMP-2026-AB12CD' })).toHaveFocus()
    const view = screen.getByRole('button', { name: 'View complaint CMP-2026-9XYZ70' })
    await userEvent.click(view)
    const modal = screen.getByRole('dialog', { name: 'Complaint Details' })
    expect(await within(modal).findByText('Second complaint narrative')).toBeInTheDocument()
    expect(within(modal).getByText('CMP-2026-9XYZ70')).toBeInTheDocument()
    expect(screen.queryByText('First complaint narrative')).not.toBeInTheDocument()
    expect(modal.querySelector('.complaint-modal-body').scrollTop).toBe(0)
    await userEvent.click(within(modal).getByRole('button', { name: 'Close complaint details' }))
    expect(view).toHaveFocus()
  })

  it('keeps the header fixed and only the body scrollable on desktop and mobile', () => {
    const css = read('complaints/Complaints.css')
    expect(css).toMatch(/max-width: 860px; max-height: 85vh; padding: 0; display: flex; flex-direction: column; overflow: hidden/)
    expect(css).toMatch(/complaint-modal-header \{ position: relative; flex: 0 0 auto/ )
    expect(css).toMatch(/complaint-modal-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto/)
    expect(css).toMatch(/@media\(max-width: 600px\)[\s\S]*complaint-summary-grid \{ grid-template-columns: minmax\(0,1fr\)/)
  })
})


describe('walk-in intake modal', () => {
  it('keeps the queue behind the modal, preserves fields/files/people, and returns focus after Cancel', async () => {
    renderQueue({ isSecretary: true })
    const opener = await screen.findByRole('button', { name: 'Record Walk-in Complaint' })
    await userEvent.click(opener)
    const modal = screen.getByRole('dialog', { name: 'Record Walk-in Complaint' })
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.queryByText('Back to the queue')).not.toBeInTheDocument()
    expect(within(modal).getAllByRole('button', { name: /close/i })).toHaveLength(1)
    expect(within(modal).getByRole('button', { name: 'Close walk-in complaint' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    for (const name of ['Complainant', 'Complaint Details', 'Person or people complained about (optional)', 'Supporting files (optional)']) {
      expect(within(modal).getByRole('group', { name })).toBeInTheDocument()
    }
    await userEvent.click(within(modal).getByRole('button', { name: 'Add another person' }))
    expect(within(modal).getAllByLabelText('Name')).toHaveLength(2)
    await userEvent.upload(within(modal).getByLabelText('Attach photos or a PDF, video or witness statement'), new File(['photo'], 'intake.jpg', { type: 'image/jpeg' }))
    expect(within(modal).getByText('intake.jpg')).toBeInTheDocument()
    const footer = modal.querySelector('.modal-actions')
    expect(footer).not.toContainElement(modal.querySelector('.walkin-form-body'))
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closes with Escape, restores focus, and starts a fresh form when reopened', async () => {
    renderQueue({ isSecretary: true })
    const opener = await screen.findByRole('button', { name: 'Record Walk-in Complaint' })
    await userEvent.click(opener)
    await userEvent.type(screen.getByLabelText(/Full name/), 'Unsaved name')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    await userEvent.click(opener)
    expect(screen.getByLabelText(/Full name/)).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Close walk-in complaint' }))
    expect(opener).toHaveFocus()
  })

  it('keeps the header/footer outside the sole scrolling form body on mobile', () => {
    const css = read('complaints/Complaints.css')
    expect(css).toMatch(/walkin-modal \.confirm-dialog \{[^}]*overflow: hidden/)
    expect(css).toMatch(/walkin-form-body \{ min-height: 0; overflow-y: auto/)
    expect(css).toMatch(/walkin-modal \.modal-actions \{ flex: 0 0 auto/)
    expect(css).toMatch(/@media\(max-width: 600px\)[\s\S]*walkin-modal \.confirm-dialog \{ max-height: 90vh/)
  })
})
