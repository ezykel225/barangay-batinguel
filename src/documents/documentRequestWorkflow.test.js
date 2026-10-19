import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ResidentDashboard from '../dashboards/ResidentDashboard'
import OfficialDashboard from '../dashboards/OfficialDashboard'
import { DOCUMENT_REQUIREMENTS, preparationFor } from './documentPreparationConfig'
import { SUPPORTED_DOCUMENT_TYPES } from './documentRegistry'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }))
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../components/Sidebar', () => ({ setActiveTab }) => <button onClick={() => setActiveTab('documents')}>Documents navigation</button>)
jest.mock('../components/NotificationBell', () => () => null)
jest.mock('../components/useNotifications', () => ({ useNotifications: () => ({ notifications: [], readIds: new Set(), badges: {}, refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }) }))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))

const resident = { id: 'resident-a', full_name: 'Resident Alpha', contact_number: '09123456789', purok: 'Purok 1', verification_status: 'verified', role: 'resident' }
const base = { id: 'request-a', resident_id: resident.id, full_name: resident.full_name, document_type: 'Barangay Clearance', purpose: 'Employment', additional_notes: 'Pick up in person', contact_number: resident.contact_number, purok: resident.purok, status: 'pending', created_at: '2026-10-19T02:00:00Z', updated_at: '2026-10-19T02:00:00Z', reviewer_notes: 'Previously recorded note' }
let requests, writes, queries, history, position, currentProfile
beforeEach(() => {
  jest.clearAllMocks()
  requests = [{ ...base }, { ...base, id: 'request-b', resident_id: null, full_name: 'External Beta', purpose: 'Application', additional_notes: null }]
  writes = []; queries = []; history = []; position = 'Barangay Secretary'; currentProfile = resident
  useAuth.mockReturnValue({ user: { id: resident.id } })
  supabase.rpc.mockImplementation(async (name) => ({ data: name === 'official_id_for_current_user' ? 'official-id' : name === 'clearance_case_warning' ? false : [], error: null }))
  supabase.from.mockImplementation((table) => {
    const query = { table, filters: [], data: null, mode: 'read' }; queries.push(query)
    const result = () => {
      if (query.mode === 'insert') { writes.push(query); return { data: null, error: null } }
      if (query.mode === 'update') {
        writes.push(query)
        if (table === 'document_requests') requests = requests.map((r) => r.id === query.filters.find(([key]) => key === 'id')?.[1] ? { ...r, ...query.data } : r)
        return { data: [{ id: query.filters.find(([key]) => key === 'id')?.[1] }], error: null }
      }
      return { data: table === 'document_requests' ? [...requests] : table === 'profiles' ? [resident] : table === 'activity_log' ? history : [], error: null }
    }
    const builder = {
      select: jest.fn(() => builder), eq: jest.fn((key,value) => { query.filters.push([key,value]); return builder }),
      order: jest.fn(() => builder), limit: jest.fn(() => builder), not: jest.fn(() => builder), is: jest.fn(() => builder), in: jest.fn(() => builder),
      insert: jest.fn((data) => { query.mode = 'insert'; query.data = data; return builder }),
      update: jest.fn((data) => { query.mode = 'update'; query.data = data; return builder }),
      single: jest.fn(async () => ({ data: table === 'profiles' ? currentProfile : { id: 'official-id', position }, error: null })),
      maybeSingle: jest.fn(async () => ({ data: { id: 'official-id', position }, error: null })),
      then: (resolve,reject) => Promise.resolve(result()).then(resolve,reject),
    }
    return builder
  })
})
const showResident = () => render(<MemoryRouter initialEntries={['/resident?tab=documents']}><ResidentDashboard /></MemoryRouter>)
const showOfficial = async () => {
  currentProfile = { id: 'staff', full_name: 'Records Staff', role: 'official' }
  useAuth.mockReturnValue({ user: { id: 'staff' } })
  const view = render(<MemoryRouter><OfficialDashboard /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Documents navigation' }))
  await screen.findByRole('button', { name: 'View document request from Resident Alpha for ' + requests[0].document_type })
  return view
}
const openAlpha = async () => {
  const button = screen.getByRole('button', { name: 'View document request from Resident Alpha for Barangay Clearance' })
  await userEvent.click(button)
  return screen.getByRole('dialog', { name: 'Document Request' })
}

test('central preparation covers all existing types with a safe unknown-type fallback', () => {
  expect(Object.keys(DOCUMENT_REQUIREMENTS).sort()).toEqual([...SUPPORTED_DOCUMENT_TYPES].sort())
  expect(preparationFor('constructor')).toEqual(['Confirm preparation for this document with Barangay Hall.'])
})

test('resident requirements change before Purpose and submission retains the existing identity/payload', async () => {
  showResident()
  const newRequest = await screen.findByRole('button', { name: 'New Request' })
  await waitFor(() => expect(newRequest).toBeEnabled())
  await userEvent.click(newRequest)
  const dialog = screen.getByRole('dialog', { name: 'Request a Document' })
  expect(within(dialog).getByText(/Official requirements are not yet confirmed/)).toBeInTheDocument()
  expect(within(dialog).getByText(/Prepare these documents and present them at the Barangay Hall/)).toBeInTheDocument()
  expect(dialog.querySelector('input[type="file"]')).toBeNull()
  await userEvent.selectOptions(within(dialog).getByLabelText('Document Type'), 'Business Clearance')
  expect(within(dialog).getByText('Proof of business address')).toBeInTheDocument()
  expect(within(dialog).queryByText(/Community Tax Certificate/)).toBeNull()
  const requirements = within(dialog).getByRole('region', { name: 'What to prepare for Business Clearance' })
  expect(requirements.compareDocumentPosition(within(dialog).getByLabelText('Purpose')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await userEvent.type(within(dialog).getByLabelText('Purpose'), 'Store application')
  await userEvent.type(within(dialog).getByLabelText('Additional Notes (optional)'), 'Please contact me')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Submit Request' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes.find((q) => q.table === 'document_requests' && q.mode === 'insert').data).toEqual([{ resident_id: resident.id, document_type: 'Business Clearance', full_name: resident.full_name, contact_number: resident.contact_number, purok: resident.purok, purpose: 'Store application', additional_notes: 'Please contact me', status: 'pending' }])
  expect(queries.some((q) => q.table === 'document_requests' && q.filters.some(([key,value]) => key === 'resident_id' && value === resident.id))).toBe(true)
  expect(supabase.rpc).not.toHaveBeenCalledWith('clearance_case_warning', expect.anything())
})

test('resident verification still gates requests', async () => {
  currentProfile = { ...resident, verification_status: 'pending' }
  showResident()
  expect(await screen.findByRole('button', { name: 'New Request' })).toBeDisabled()
  expect(writes.filter((q) => q.mode === 'insert')).toHaveLength(0)
})

test('official details open by keyboard with request/profile/notes and clearance review scoped to this request', async () => {
  history = [{ id: 'log-a', action: 'approved', created_at: base.created_at, details: 'Recorded processing note' }]
  await showOfficial()
  expect(supabase.rpc.mock.calls.some(([name]) => name === 'clearance_case_warning')).toBe(false)
  const opener = screen.getByRole('button', { name: 'View document request from Resident Alpha for Barangay Clearance' })
  opener.focus(); await userEvent.keyboard('{Enter}')
  const dialog = screen.getByRole('dialog', { name: 'Document Request' })
  expect(within(dialog).getByText('Employment')).toBeInTheDocument()
  expect(within(dialog).getByText('Pick up in person')).toBeInTheDocument()
  expect(within(dialog).getByText(resident.contact_number)).toBeInTheDocument()
  expect(within(dialog).getByText('Linked resident account')).toBeInTheDocument()
  expect(within(dialog).getByText('Account verification: verified')).toBeInTheDocument()
  expect(within(dialog).getByText('Previously recorded note')).toBeInTheDocument()
  expect(await within(dialog).findByText(/No unresolved case found/)).toBeInTheDocument()
  expect(supabase.rpc).toHaveBeenCalledWith('clearance_case_warning', { p_request_id: base.id })
  expect(await within(dialog).findByText('Recorded processing note')).toBeInTheDocument()
  expect(queries.find((q) => q.table === 'activity_log').filters).toEqual([['entity_type','document_request'], ['entity_id',base.id]])
})

test('unlinked request requires manual review, not a name match or a case RPC', async () => {
  await showOfficial()
  await userEvent.click(screen.getByRole('button', { name: 'View document request from External Beta for Barangay Clearance' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Unlinked request')).toBeInTheDocument()
  expect(within(dialog).getByText(/Manual review required: this request/)).toBeInTheDocument()
  expect(supabase.rpc.mock.calls.some(([name]) => name === 'clearance_case_warning')).toBe(false)
  expect(within(dialog).queryByText('Account verification: verified')).toBeNull()
})

test('unresolved-case warning remains informational and never changes the request', async () => {
  supabase.rpc.mockImplementation(async (name) => ({ data: name === 'official_id_for_current_user' ? 'official-id' : name === 'clearance_case_warning' ? true : [], error: null }))
  await showOfficial(); const dialog = await openAlpha()
  expect(await within(dialog).findByText(/Unresolved case on record/)).toBeInTheDocument()
  expect(within(dialog).getByText(/does not approve or deny/)).toBeInTheDocument()
  expect(writes.filter((q) => q.table === 'document_requests')).toHaveLength(0)
})

test('ordinary official can view request details but gets no case RPC or processing action', async () => {
  position = 'Kagawad'
  await showOfficial(); const dialog = await openAlpha()
  expect(within(dialog).getByText(/Case review is available only/)).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull()
  expect(supabase.rpc.mock.calls.some(([name]) => name === 'clearance_case_warning')).toBe(false)
})

test('Secretary approves using the unchanged update handler and detail status refreshes', async () => {
  await showOfficial(); const dialog = await openAlpha()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Approve' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Mark Ready' })).toBeInTheDocument())
  expect(writes.find((q) => q.table === 'document_requests' && q.mode === 'update').data).toMatchObject({ status: 'approved', reviewed_by: 'staff' })
  expect(within(dialog).getByText('Current status').nextElementSibling).toHaveTextContent('Approved')
})

test('decline hands over to the existing reason dialog rather than nesting dialogs', async () => {
  await showOfficial(); const dialog = await openAlpha()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Decline' }))
  expect(screen.queryByRole('dialog', { name: 'Document Request' })).toBeNull()
  const reasonDialog = screen.getByRole('dialog', { name: 'Decline Barangay Clearance Request' })
  await userEvent.type(within(reasonDialog).getByLabelText('Reason'), 'Please visit the office')
  await userEvent.click(within(reasonDialog).getByRole('button', { name: 'Confirm Decline' }))
  await waitFor(() => expect(writes.some((q) => q.data.status === 'declined')).toBe(true))
  expect(writes.find((q) => q.data.status === 'declined').data.reviewer_notes).toBe('Please visit the office')
})

test('details support close, Escape, focus trapping/return and body scroll lock', async () => {
  await showOfficial(); const dialog = await openAlpha()
  const close = within(dialog).getByRole('button', { name: 'Close document request details' })
  const footer = within(dialog).getByRole('button', { name: 'Close', exact: true })
  expect(close).toHaveFocus(); expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(footer).toHaveFocus()
  fireEvent.keyDown(footer, { key: 'Tab' }); expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'View document request from Resident Alpha for Barangay Clearance' })).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
  await openAlpha(); await userEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('details CSS caps internal scrolling and stacks information/actions on mobile', () => {
  const css = fs.readFileSync(path.join(__dirname, 'DocumentRequests.css'), 'utf8').replace(/\r\n/g, '\n')
  expect(css).toMatch(/max-height: 85vh; overflow-y: auto/)
  expect(css).toMatch(/@media\(max-width: 600px\).*?\.dr-info \{ grid-template-columns: minmax\(0,1fr\)/s)
})


test('all six resident types render their own informational guidance without verified checkmarks', async () => {
  showResident(); const open = await screen.findByRole('button', { name: 'New Request' })
  await waitFor(() => expect(open).toBeEnabled()); await userEvent.click(open)
  const dialog = screen.getByRole('dialog')
  for (const type of SUPPORTED_DOCUMENT_TYPES) {
    await userEvent.selectOptions(within(dialog).getByLabelText('Document Type'), type)
    const section = within(dialog).getByRole('region', { name: 'What to prepare for ' + type })
    DOCUMENT_REQUIREMENTS[type].forEach((text) => expect(within(section).getByText(text)).toBeInTheDocument())
    expect(section.querySelector('input, [aria-checked], [role="checkbox"]')).toBeNull()
  }
})

test('a missing loaded profile prompts manual review without a name fallback', async () => {
  requests[0].resident_id = 'not-in-authorized-records'
  await showOfficial(); const dialog = await openAlpha()
  expect(within(dialog).getByText(/linked resident profile could not be confirmed/)).toBeInTheDocument()
  expect(within(dialog).queryByText('Account verification: verified')).toBeNull()
  expect(supabase.rpc.mock.calls.some(([name]) => name === 'clearance_case_warning')).toBe(false)
})

test('Secretary marks ready through the original handler; generation hands over without changing status', async () => {
  requests[0].status = 'approved'
  await showOfficial(); let dialog = await openAlpha()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Mark Ready' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Mark Claimed' })).toBeInTheDocument())
  expect(writes.find((q) => q.table === 'document_requests' && q.mode === 'update').data.status).toBe('ready_for_pickup')
  const before = writes.filter((q) => q.table === 'document_requests').length
  await userEvent.click(within(dialog).getByRole('button', { name: 'Generate Document' }))
  expect(screen.queryByRole('dialog', { name: 'Document Request' })).toBeNull()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(writes.filter((q) => q.table === 'document_requests')).toHaveLength(before)
})

test('claimed still requires the existing explicit confirmation after details closes', async () => {
  requests[0].status = 'ready_for_pickup'
  await showOfficial(); const dialog = await openAlpha()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Mark Claimed' }))
  expect(screen.queryByRole('dialog', { name: 'Document Request' })).toBeNull()
  const confirm = screen.getByRole('dialog', { name: 'Mark this request as claimed?' })
  expect(writes.filter((q) => q.table === 'document_requests')).toHaveLength(0)
  await userEvent.click(within(confirm).getByRole('button', { name: 'Mark claimed' }))
  await waitFor(() => expect(writes.some((q) => q.data.status === 'claimed')).toBe(true))
})

test('empty activity is reported honestly and does not fabricate a history event', async () => {
  await showOfficial(); const dialog = await openAlpha()
  expect(await within(dialog).findByText('No activity entries are available for this request.')).toBeInTheDocument()
  expect(within(dialog).getByText(/Activity history is best-effort and may not represent every status change/)).toBeInTheDocument()
  expect(dialog.querySelector('.dr-timeline')).toBeNull()
})

test('resident name alone opens details while the independent action menu does not', async () => {
  await showOfficial()
  const name = screen.getByRole('button', { name: 'View document request from Resident Alpha for Barangay Clearance' })
  expect(name).toHaveTextContent(/^Resident Alpha$/)
  expect(screen.queryByText('View request', { exact: true })).toBeNull()
  const row = name.closest('tr')
  const menu = within(row).getByRole('button', { name: /Actions/i })
  await userEvent.click(menu)
  expect(screen.getByRole('menu')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Document Request' })).toBeNull()
  await userEvent.keyboard('{Escape}')
  name.focus(); await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('dialog', { name: 'Document Request' })).toBeInTheDocument()
})

test('official preparation section uses the same sample items without implying online verification', async () => {
  requests[0].document_type = 'Certificate of Residency'
  await showOfficial()
  await userEvent.click(screen.getByRole('button', { name: 'View document request from Resident Alpha for Certificate of Residency' }))
  const section = within(screen.getByRole('dialog')).getByRole('region', { name: 'Requirements to Check for Certificate of Residency' })
  DOCUMENT_REQUIREMENTS['Certificate of Residency'].forEach((text) => expect(within(section).getByText(text)).toBeInTheDocument())
  expect(within(section).getByText('Sample preparation guidance only. Confirm applicable requirements with Barangay Hall. Supporting documents are checked manually during processing, not verified online.')).toBeInTheDocument()
  expect(within(section).getByText(/Sample preparation guidance only/)).toBeInTheDocument()
  expect(section.querySelector('input, [aria-checked], [role="checkbox"]')).toBeNull()
})
