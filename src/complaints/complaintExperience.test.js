// P3-B1. The resident complaint experience as rendered, plus the
// source guards that only a scan can prove.
//
// ⚠️ Supabase and AuthContext are mocked at the module level -- the
// pattern Announcements.test.js established, because
// `supabaseClient.js` throws at import time without the env vars and
// `jest.mock` is hoisted above the imports. CRA 5's preset also sets
// `resetMocks: true`, so every implementation is installed in
// `beforeEach` rather than in the factory.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')
const { useAuth } = require('../context/AuthContext')

const MyComplaints = require('./MyComplaints').default
const TrackComplaint = require('../pages/TrackComplaint').default

const SRC = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
// Comment-stripped, because these files discuss `getPublicUrl`, `*/*`
// and "video" at length precisely to record that none is used -- the
// A5 trap of a scan failing on the prose that documents the absence.
const code = (p) => read(p).split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const ROWS = [{
  id: 'c1',
  reference: 'CMP-2026-AB12CD',
  category: 'noise',
  status: 'received',
  narrative: 'Loud karaoke past midnight.',
  location_note: 'near the covered court',
  intake_channel: 'online',
  created_at: '2026-10-16T01:00:00.000Z',
  updated_at: '2026-10-16T01:00:00.000Z',
}]

const listQuery = (rows) => ({
  select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
})

beforeEach(() => {
  useAuth.mockReturnValue({ user: { id: 'u1' } })
  supabase.from.mockReturnValue(listQuery(ROWS))
  supabase.rpc.mockResolvedValue({ data: [], error: null })
  supabase.storage.from.mockReturnValue({
    upload: jest.fn(() => Promise.resolve({ error: null })),
    createSignedUrl: jest.fn(() => Promise.resolve({
      data: { signedUrl: 'https://example.test/signed' }, error: null,
    })),
  })
})

const renderMine = () => render(<MemoryRouter><MyComplaints /></MemoryRouter>)

// ── My Complaints ────────────────────────────────────────────────────

describe('My Complaints', () => {
  it('shows the reference, the human category, the status and the date', async () => {
    renderMine()
    expect(await screen.findByText('CMP-2026-AB12CD')).toBeInTheDocument()
    expect(screen.getByText('Noise Complaint')).toBeInTheDocument()
    expect(screen.getByText('Received')).toBeInTheDocument()
    expect(screen.getByText('16 October 2026')).toBeInTheDocument()
  })

  it('shows NO raw stored value on screen', async () => {
    const { container } = renderMine()
    await screen.findByText('CMP-2026-AB12CD')
    // The stored value is kept in the badge's `title` for an official
    // to hover, exactly as the resident-status badges already do, but
    // it is not the visible text.
    expect(container.textContent).not.toContain('noise')
    expect(screen.getByTitle('received')).toBeInTheDocument()
  })

  it('displays only the one status the database permits', async () => {
    renderMine()
    await screen.findByText('CMP-2026-AB12CD')
    const body = document.body.textContent.toLowerCase()
    ;['screening', 'mediation', 'conciliation', 'settled', 'referred',
      'dismissed', 'hearing', 'summons']
      .forEach((s) => expect(body).not.toContain(s))
  })

  it('does not request another account’s identifier', () => {
    // ⚠️ `encoded_by` and `filed_by_profile_id` are columns the policy
    // would hand over, and nothing on a resident's own screen needs
    // another account's uuid -- so they are not selected.
    const src = code('complaints/complaintApi.js')
    const select = /\.select\(\s*'([^']+)'\s*\)\s*\n?\s*\.order/.exec(src)
    expect(select).not.toBeNull()
    expect(select[1]).not.toContain('encoded_by')
    expect(select[1]).not.toContain('filed_by_profile_id')
  })

  it('does not filter by the resident id, because the policy already does', () => {
    // Writing `.eq('filed_by_profile_id', uid)` would imply the filter
    // is what protects the data. The SELECT policy is.
    expect(code('complaints/complaintApi.js')).not.toMatch(/eq\('filed_by_profile_id'/)
  })

  it('has an empty state rather than a blank card', async () => {
    supabase.from.mockReturnValue(listQuery([]))
    renderMine()
    expect(await screen.findByText(/have not filed any complaints yet/i)).toBeInTheDocument()
  })
})

// ── Respondent contact privacy ───────────────────────────────────────

describe('respondent contact privacy', () => {
  it('renders a NULL respondent contact as a statement, not an empty cell', async () => {
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'complaint_parties_for') {
        return Promise.resolve({
          data: [
            {
              id: 'p1', party_role: 'complainant', full_name_snapshot: 'Me',
              contact_number_snapshot: '09171234567', address_note: null,
              has_profile_link: true, has_registry_link: false, created_at: null,
            },
            {
              id: 'p2', party_role: 'respondent', full_name_snapshot: 'The Other Person',
              // ⚠️ NULL, exactly as complaint_parties_for() returns it
              // for a party that is not the caller.
              contact_number_snapshot: null, address_note: null,
              has_profile_link: false, has_registry_link: false, created_at: null,
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    })

    renderMine()
    await userEvent.click(await screen.findByRole('button', { name: /Show details for CMP-2026-AB12CD/i }))

    expect(await screen.findByText('The Other Person')).toBeInTheDocument()
    // Their own contact is shown; the respondent's is not.
    expect(screen.getByText('09171234567')).toBeInTheDocument()
    expect(screen.getByText('Contact not shown to you')).toBeInTheDocument()
  })

  it('never reconstructs a hidden contact from another source', () => {
    const src = code('complaints/complaintApi.js') + code('complaints/MyComplaints.jsx')
    // There is no second source: complaint_parties carries no client
    // privilege at all. Asserted so a later edit cannot add one.
    expect(src).not.toMatch(/from\(\s*'complaint_parties'/)
    expect(src).not.toMatch(/from\(\s*'complaint_status_history'/)
    expect(src).not.toMatch(/from\(\s*'complaint_attachments'/)
  })
})

// ── Attachments ──────────────────────────────────────────────────────

describe('attachment access', () => {
  it('mints a signed URL and never builds a public one', () => {
    const src = code('complaints/complaintApi.js')
    expect(src).toMatch(/createSignedUrl\(/)
    // ⚠️ getPublicUrl() 404s on a private bucket even with a
    // permissive policy -- and reaching for it is how a private bucket
    // quietly becomes a public one.
    expect(src).not.toMatch(/getPublicUrl/)
    expect(src).not.toMatch(/\/storage\/v1\/object\/public/)
  })

  it('does not cache the signed URL in state', () => {
    // A signed URL is a bearer token for one object; keeping one means
    // a link that outlives the session entitled to it.
    const src = code('complaints/MyComplaints.jsx')
    expect(src).not.toMatch(/setSignedUrl|signedUrls\s*\[/)
    expect(code('complaints/complaintApi.js')).toMatch(/SIGNED_URL_SECONDS\s*=\s*60/)
  })

  it('shows a neutral retry message when signing fails', async () => {
    supabase.storage.from.mockReturnValue({
      upload: jest.fn(),
      createSignedUrl: jest.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
    })
    supabase.rpc.mockImplementation((fn) => Promise.resolve({
      data: fn === 'complaint_attachments_for'
        ? [{
          id: 'a1', object_path: 'c1/x.png', display_filename: 'proof.png',
          media_kind: 'photo', mime_type: 'image/png', byte_size: 2048, uploaded_at: null,
        }]
        : [],
      error: null,
    }))

    renderMine()
    await userEvent.click(await screen.findByRole('button', { name: /Show details for/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open proof.png' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be opened just now/i)
    expect(alert.textContent).not.toContain('boom')
  })
})

// ── Public tracking ──────────────────────────────────────────────────

describe('public complaint tracking', () => {
  const renderTrack = () => render(<MemoryRouter><TrackComplaint /></MemoryRouter>)

  const fill = async (ref, contact) => {
    await userEvent.type(screen.getByLabelText('Reference number'), ref)
    await userEvent.type(screen.getByLabelText('Contact number'), contact)
    await userEvent.click(screen.getByRole('button', { name: /Check this complaint/i }))
  }

  it('calls ONLY track_complaint, and makes no second query on a hit', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{
        reference: 'CMP-2026-AB12CD', status: 'received',
        received_on: '2026-10-16', last_updated: '2026-10-16',
      }],
      error: null,
    })
    renderTrack()
    await fill('CMP-2026-AB12CD', '09171234567')

    await screen.findByText('CMP-2026-AB12CD')
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('track_complaint', {
      p_reference: 'CMP-2026-AB12CD', p_contact: '09171234567',
    })
    // ⚠️ No table read follows. Fetching a category or a name once the
    // lookup succeeds would defeat a narrowness the database
    // guarantees -- and would be refused anyway.
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('renders only the four permitted fields', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{
        reference: 'CMP-2026-AB12CD', status: 'received',
        received_on: '2026-10-16', last_updated: '2026-10-17',
      }],
      error: null,
    })
    const { container } = renderTrack()
    await fill('CMP-2026-AB12CD', '09171234567')
    await screen.findByText('CMP-2026-AB12CD')

    const result = container.querySelector('.track-result')
    expect(result).not.toBeNull()
    expect(result.textContent).toContain('CMP-2026-AB12CD')
    expect(result.textContent).toContain('Received')
    expect(result.textContent).toContain('16 October 2026')
    expect(result.textContent).toContain('17 October 2026')

    // ⚠️ Category is the accusation itself, so it is not returned by
    // the RPC and must not appear. Nor may any party, narrative,
    // contact or evidence.
    ;['Noise', 'noise', 'karaoke', 'Respondent', 'respondent', 'Witness',
      'Complainant', '0917', 'proof', 'attachment', 'Category']
      .forEach((leak) => expect(result.textContent).not.toContain(leak))
  })

  it('gives ONE neutral message for a wrong reference AND a wrong contact', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })

    renderTrack()
    await fill('CMP-2026-ZZZZZZ', '09171234567')
    const first = (await screen.findByRole('status')).textContent

    await userEvent.clear(screen.getByLabelText('Reference number'))
    await userEvent.clear(screen.getByLabelText('Contact number'))
    await fill('CMP-2026-AB12CD', '09990000000')
    const second = (await screen.findByRole('status')).textContent

    // ⚠️ Byte-identical. Any difference is an oracle for enumerating
    // other people's complaints.
    expect(second).toBe(first)
    const lower = first.toLowerCase()
    ;['not found', 'no such', 'does not exist', 'invalid reference',
      'wrong number', 'incorrect', 'reference exists']
      .forEach((oracle) => expect(lower).not.toContain(oracle))
  })

  it('says something DIFFERENT when the system could not be reached', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '500' } })
    renderTrack()
    await fill('CMP-2026-AB12CD', '09171234567')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not reach the barangay system/i)
    // ⚠️ It must NOT say no complaint matched -- that would tell
    // somebody their complaint does not exist.
    expect(alert.textContent.toLowerCase()).not.toContain('could not retrieve')
    expect(alert.textContent).not.toContain('network')
    expect(alert.textContent).not.toContain('500')
  })

  it('keeps an empty submission off the network', async () => {
    renderTrack()
    await userEvent.click(screen.getByRole('button', { name: /Check this complaint/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/reference number/i)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('is reachable without an account and labels both fields', () => {
    renderTrack()
    expect(screen.getByLabelText('Reference number')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact number')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

// ── Submission success ───────────────────────────────────────────────

describe('after a successful submission', () => {
  const fileOnce = async () => {
    renderMine()
    await userEvent.click(await screen.findByRole('button', { name: /File a Complaint/i }))
    await userEvent.selectOptions(
      screen.getByLabelText(/What is this complaint about/i), 'noise'
    )
    await userEvent.type(screen.getByLabelText(/What happened/i), 'Loud karaoke.')
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
  }

  it('shows the reference prominently and tells the resident to keep it', async () => {
    supabase.rpc.mockImplementation((fn) => Promise.resolve({
      data: fn === 'file_complaint_as_resident' ? 'CMP-2026-NEW123' : [], error: null,
    }))
    supabase.from.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: ROWS, error: null }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'c9' }, error: null }) }),
      }),
    })

    await fileOnce()
    const panel = await screen.findByRole('status')
    expect(panel).toHaveTextContent('CMP-2026-NEW123')
    expect(panel).toHaveTextContent(/write this down/i)
    // ⚠️ "received for barangay review", not "accepted" and not "case".
    expect(panel).toHaveTextContent(/received for barangay review/i)
    expect(panel.textContent.toLowerCase()).not.toContain('your case')
    expect(panel.textContent.toLowerCase()).not.toContain('accepted')
  })

  it('moves focus to the reference, so a keyboard user meets it', async () => {
    supabase.rpc.mockImplementation((fn) => Promise.resolve({
      data: fn === 'file_complaint_as_resident' ? 'CMP-2026-NEW123' : [], error: null,
    }))
    supabase.from.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: ROWS, error: null }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'c9' }, error: null }) }),
      }),
    })

    await fileOnce()
    await screen.findByText('CMP-2026-NEW123')
    await waitFor(() => expect(document.activeElement)
      .toHaveTextContent('CMP-2026-NEW123'))
  })

  it('shows no respondent name or evidence path on the success panel', async () => {
    supabase.rpc.mockImplementation((fn) => Promise.resolve({
      data: fn === 'file_complaint_as_resident' ? 'CMP-2026-NEW123' : [], error: null,
    }))
    supabase.from.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: ROWS, error: null }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'c9' }, error: null }) }),
      }),
    })

    renderMine()
    await userEvent.click(await screen.findByRole('button', { name: /File a Complaint/i }))
    await userEvent.selectOptions(
      screen.getByLabelText(/What is this complaint about/i), 'noise'
    )
    await userEvent.type(screen.getByLabelText(/What happened/i), 'Loud karaoke.')
    await userEvent.type(screen.getAllByLabelText('Name')[0], 'Named Respondent')
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))

    const panel = await screen.findByRole('status')
    expect(panel.textContent).not.toContain('Named Respondent')
    expect(panel.textContent).not.toContain('c9/')
  })

  it('keeps the reference valid when only an attachment fails', async () => {
    // ⚠️ Evidence can only be uploaded AFTER the complaint row exists,
    // because the storage path is its own id -- so a failed file always
    // sits beside a valid reference and must never read as a lost
    // complaint.
    supabase.rpc.mockImplementation((fn) => {
      if (fn === 'file_complaint_as_resident') return Promise.resolve({ data: 'CMP-2026-PART99', error: null })
      if (fn === 'record_complaint_attachment') return Promise.resolve({ data: null, error: { message: 'nope' } })
      return Promise.resolve({ data: [], error: null })
    })
    supabase.from.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: ROWS, error: null }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'c9' }, error: null }) }),
      }),
    })

    renderMine()
    await userEvent.click(await screen.findByRole('button', { name: /File a Complaint/i }))
    await userEvent.selectOptions(
      screen.getByLabelText(/What is this complaint about/i), 'noise'
    )
    await userEvent.type(screen.getByLabelText(/What happened/i), 'Loud karaoke.')
    await userEvent.upload(
      screen.getByLabelText(/Attach photos or a PDF/i),
      new File(['x'], 'proof.png', { type: 'image/png' })
    )
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))

    expect(await screen.findByText('CMP-2026-PART99')).toBeInTheDocument()
    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent(/complaint was submitted/i)
    expect(warning).toHaveTextContent(/reference number below is valid/i)
    expect(warning.textContent).not.toContain('nope')
  })
})

// ── Route and link wiring ────────────────────────────────────────────

describe('the route and every link to it land together', () => {
  const app = read('App.js')
  const services = read('constants/eServices.js')

  it('registers /track-complaint in App.js', () => {
    // ⚠️ `path="*"` renders Home, so a link whose route does not exist
    // does not 404 -- it silently shows the homepage and looks like the
    // service is broken.
    expect(app).toMatch(/path="\/track-complaint"/)
    expect(app).toMatch(/element=\{<TrackComplaint \/>\}/)
  })

  it('points every catalogue entry at a route that exists', () => {
    const targets = [...services.matchAll(/to:\s*'([^']+)'/g)].map((m) => m[1])
    expect(targets).toContain('/track-complaint')
    expect(targets).toContain('/resident?tab=complaints')
    targets.forEach((target) => {
      const [route, query] = target.split('?')
      expect(app).toMatch(new RegExp(`path="${route}"`))
      if (query) {
        // A ?tab= value must be one the resident portal resolves, or
        // the deep link silently lands on the dashboard front page.
        const tab = /tab=([a-z-]+)/.exec(query)
        expect(read('utils/residentTabs.js')).toContain(`'${tab[1]}'`)
      }
    })
  })

  it('adds no second protected route and no new role', () => {
    const protectedRoles = [...app.matchAll(/allowedRole="(\w+)"/g)].map((m) => m[1])
    expect(protectedRoles.sort()).toEqual(['nurse', 'official', 'resident'])
    // ⚠️ The resident complaint experience is a TAB of /resident, which
    // ProtectedRoute already gates -- so an official, the nurse and any
    // unsupported role are bounced before it renders, and P1's
    // fail-safe is untouched.
    expect(read('components/ProtectedRoute.jsx')).toMatch(/Navigate to="\/login" replace/)
  })

  it('calls it a complaint, never a case', () => {
    // P3 creates complaints and decides nothing about them.
    //
    // ⚠️ Scanned over COMMENT-STRIPPED code. The catalogue's own
    // comment explains why the word "case" is avoided, so a raw scan
    // fails on the prose documenting the rule it checks -- the A5 trap,
    // and the third time this project has hit it.
    const serviceCode = code('constants/eServices.js')
    expect(serviceCode).not.toMatch(/File a Case|Track a Case|\bcase\b/i)
    expect(serviceCode).toContain('File a Complaint')
    expect(serviceCode).toContain('Track a Complaint')
  })

  it('states the access requirement of each new service in words', () => {
    const fileEntry = /key: 'file-complaint'[\s\S]*?\}/.exec(services)[0]
    const trackEntry = /key: 'track-complaint'[\s\S]*?\}/.exec(services)[0]
    expect(fileEntry).toContain("access: 'resident'")
    expect(fileEntry).toMatch(/resident account is required/i)
    expect(trackEntry).toContain("access: 'guest'")
  })
})

// ── No screening language anywhere in the UI ──────────────────────────

describe('no screening or KP functionality is exposed', () => {
  it.each([
    'complaints/FileComplaintForm.jsx',
    'complaints/MyComplaints.jsx',
    'complaints/complaintApi.js',
    'pages/TrackComplaint.jsx',
    // P3-B2's two official files are held to the same bar: the Official
    // Portal is where screening language would be most tempting to add,
    // because it is the screen an official would do it from.
    'complaints/OfficialComplaints.jsx',
    'complaints/WalkInComplaintForm.jsx',
    'complaints/complaintQueue.js',
  ])('%s contains no screening vocabulary in its code', (file) => {
    const src = code(file).toLowerCase()
    ;['katarungang', 'lupon', 'pangkat', 'mediation', 'conciliation',
      'summons', 'settlement', 'certificate to file', 'kp_case',
      'complaint_screenings', 'jurisdiction']
      .forEach((term) => expect(src).not.toContain(term))
  })

  // ⚠️ THE ALLOWLIST GREW BY EXACTLY TWO IN P3-B2, and this is the
  // guard that it grew by no more than that. Before P3-B2 the last two
  // lines of this test asserted `encode_walk_in_complaint` and
  // `complaint_queue` were ABSENT, because the official queue was not
  // built; they are now present and the set is pinned instead. Every
  // name here is a function migration 040 or 041 actually created --
  // an invented RPC, or a P4 one written ahead of its migration, fails.
  it('calls only the P3-A surfaces that exist', () => {
    const src = code('complaints/complaintApi.js') + code('pages/TrackComplaint.jsx')
    const rpcs = [...src.matchAll(/rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect([...new Set(rpcs)].sort()).toEqual([
      'complaint_attachments_for', 'complaint_history_for',
      'complaint_parties_for', 'complaint_queue',
      'encode_walk_in_complaint', 'file_complaint_as_resident',
      'record_complaint_attachment', 'track_complaint',
    ])
    // ⚠️ NO P4 SURFACE IS REFERENCED, named individually so the failure
    // says which one appeared rather than only that the set changed.
    ;['screen_complaint', 'complaint_screenings', 'create_kp_case',
      'refer_complaint', 'settle_complaint', 'close_complaint',
      'schedule_hearing', 'issue_summons']
      .forEach((fn) => expect(src).not.toContain(fn))
  })
})

// ── No purok work ────────────────────────────────────────────────────

describe('no purok normalisation', () => {
  it('uses the free-text location field, not a purok dropdown', () => {
    const form = code('complaints/FileComplaintForm.jsx')
    expect(form).toMatch(/locationNote/)
    expect(form).not.toMatch(/PUROKS/)
    expect(form).not.toMatch(/purok/i)
  })

  it('leaves PUROKS at seven values with Purok 7 present', () => {
    const list = /export const PUROKS = \[([\s\S]*?)\]/.exec(read('constants/barangay.js'))
    expect((list[1].match(/'Purok \d'/g) || [])).toHaveLength(7)
    expect(list[1]).toContain("'Purok 7'")
  })
})
