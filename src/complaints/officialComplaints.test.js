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
const code = (p) => read(p).split('\n')
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

  it('offers no status option the database cannot hold', async () => {
    renderQueue()
    await screen.findByText('CMP-2026-AB12CD')
    const options = Array.from(
      screen.getByLabelText('Filter by status').querySelectorAll('option'),
    ).map((o) => o.textContent)
    expect(options).toEqual(['All statuses', 'Received'])
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

  it('says plainly that there is no action to take', async () => {
    await open()
    expect(screen.getByText(/Screening, referral and case handling are not part/i))
      .toBeInTheDocument()
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
    await screen.findByText('photo.jpg')
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
  // though he reads every complaint. The component takes ONE flag and
  // there is no Punong branch anywhere in it.
  it('has no Punong Barangay branch that could render it', () => {
    const src = code('complaints/OfficialComplaints.jsx')
    expect(src).not.toContain('isKapitan')
    expect(src).not.toContain('Punong Barangay')
    expect(src).not.toContain('isTreasurer')
    expect(src.match(/isSecretary/g) || []).toHaveLength(2)
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
    const labels = Array.from(document.querySelectorAll('label'))
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
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
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

  it('constrains the file picker to the four accepted types, never a wildcard', async () => {
    await openForm()
    const picker = screen.getByLabelText(/Attach photos or a PDF/i)
    const accept = picker.getAttribute('accept')
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('application/pdf')
    expect(accept).not.toContain('*/*')
    expect(accept).not.toContain('video')
  })

  it('says video is not supported rather than offering it', async () => {
    await openForm()
    expect(screen.getByText(/Video is not supported yet/i)).toBeInTheDocument()
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

  // ⚠️ P3 creates complaints and judges nothing -- not jurisdiction, not
  // KP eligibility. P2.5 found no Lupon, Justice or Katarungan
  // committee recorded anywhere, so this system has no record from
  // which to infer who is entitled to make that judgment.
  it('uses no screening or KP vocabulary, and does not say "case"', () => {
    const src = (code('complaints/OfficialComplaints.jsx')
      + code('complaints/WalkInComplaintForm.jsx')).toLowerCase()
    ;['katarungang', 'lupon', 'pangkat', 'mediation', 'conciliation',
      'summons', 'settlement', 'certificate to file', 'kp_case',
      'complaint_screenings', 'jurisdiction', 'blotter', 'tanod']
      .forEach((term) => expect(src).not.toContain(term))
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
  it('keeps the dashboard to a tab line, with no complaint state in it', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    expect(dash).toContain('<OfficialComplaints isSecretary={isSecretary} />')
    ;['complaint_queue', 'encode_walk_in_complaint', 'complaint_parties_for',
      'complaint_attachments_for', 'complaint_history_for',
      'setComplaints', 'complaintRows']
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

  it('adds no migration', () => {
    const dir = path.join(__dirname, '..', '..', 'supabase-migrations')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    expect(files).toHaveLength(41)
    expect(files.some((f) => f.startsWith('042'))).toBe(false)
  })
})
