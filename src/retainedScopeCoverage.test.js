import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from './supabase/supabaseClient'
import { useAuth } from './context/AuthContext'
import ResidentDashboard from './dashboards/ResidentDashboard'
import MyComplaints from './complaints/MyComplaints'
import Officials from './pages/Officials'
import PublicTanodDuty from './tanod/PublicTanodDuty'

jest.mock('./supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./components/Navbar', () => () => <nav>Public navigation</nav>)
jest.mock('./components/Footer', () => () => <footer>Public footer</footer>)
jest.mock('./components/Sidebar', () => ({ setActiveTab }) => (
  <nav>
    {['dashboard', 'documents', 'complaints', 'community-credit', 'settings'].map((tab) => (
      <button key={tab} onClick={() => setActiveTab(tab)}>{tab} navigation</button>
    ))}
  </nav>
))
jest.mock('./components/NotificationBell', () => () => null)
jest.mock('./components/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], readIds: new Set(), badges: {}, refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }),
}))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

let tables
let reads
let rpcData
const resident = { id: 'resident-one', full_name: 'Resident Example', role: 'resident', verification_status: 'verified' }

beforeEach(() => {
  reads = []
  rpcData = {}
  tables = {
    profiles: [resident],
    document_requests: [
      { id: 'd1', resident_id: resident.id, document_type: 'Barangay Clearance', purpose: 'Work', status: 'pending' },
      { id: 'd2', resident_id: resident.id, document_type: 'Certificate of Residency', purpose: 'School', status: 'ready_for_pickup' },
      { id: 'secret', resident_id: 'another', document_type: 'Other', purpose: 'PRIVATE OTHER USER', status: 'pending' },
    ],
  }
  useAuth.mockReturnValue({ user: { id: resident.id }, role: 'resident' })
  supabase.rpc.mockImplementation(async (name) => ({ data: rpcData[name] || [], error: null }))
  supabase.from.mockImplementation((table) => {
    const query = { table, filters: [], mode: 'read', payload: null }
    reads.push(query)
    const result = () => ({
      data: (tables[table] || []).filter((row) => query.filters.every(([key, value]) => row[key] === value)),
      error: null,
    })
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      is: () => builder,
      not: () => builder,
      in: () => builder,
      eq: (key, value) => { query.filters.push([key, value]); return builder },
      insert: (payload) => { query.mode = 'insert'; query.payload = payload; return builder },
      update: (payload) => { query.mode = 'update'; query.payload = payload; return builder },
      single: async () => ({ data: result().data[0] || null, error: null }),
      maybeSingle: async () => ({ data: result().data[0] || null, error: null }),
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    }
    return builder
  })
})

afterEach(cleanup)

const show = (element, route = '/') => render(<MemoryRouter initialEntries={[route]}>{element}</MemoryRouter>)

test('resident document search and filtering stay scoped to owned records', async () => {
  show(<ResidentDashboard />, '/resident?tab=documents')
  expect(await screen.findByText('Work')).toBeInTheDocument()
  expect(screen.queryByText('PRIVATE OTHER USER')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search requests'), 'school')
  expect(screen.getByText('School')).toBeInTheDocument()
  expect(screen.queryByText('Work')).not.toBeInTheDocument()
  await userEvent.clear(screen.getByLabelText('Search requests'))
  await userEvent.selectOptions(screen.getByLabelText('Status', { exact: true }), 'ready_for_pickup')
  await userEvent.selectOptions(screen.getByLabelText('Document type'), 'Barangay Clearance')
  expect(screen.getByText('No requests match these filters.')).toBeInTheDocument()
  expect(reads.some(({ table, filters }) => table === 'document_requests'
    && filters.some(([key, value]) => key === 'resident_id' && value === resident.id))).toBe(true)
})

test('resident dashboard preserves its document summary without removed quick actions', async () => {
  show(<ResidentDashboard />, '/resident')
  expect(await screen.findByText('Recent Document Requests')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Quick Actions' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Request' })).toBeEnabled())
})

test('resident complaint details preserve safe content, focus trap, and trigger restoration', async () => {
  tables.complaints = [{ id: 'c1', reference: 'CMP-OWNED', category: 'noise', status: 'received', narrative: 'Resident narrative' }]
  rpcData.complaint_parties_for = []
  rpcData.complaint_attachments_for = []
  rpcData.complaint_history_for = []
  show(<MyComplaints />)
  const view = await screen.findByRole('button', { name: 'Show details for CMP-OWNED' })
  await userEvent.click(view)
  const modal = screen.getByRole('dialog', { name: 'Complaint Details' })
  expect(within(modal).getByText('CMP-OWNED')).toBeInTheDocument()
  expect(within(modal).getByText('Resident narrative')).toBeInTheDocument()
  expect(within(modal).queryByText(/KP screening/)).not.toBeInTheDocument()
  const close = within(modal).getByRole('button', { name: 'Close complaint details' })
  close.focus()
  await userEvent.tab({ shift: true })
  expect(modal).toContainElement(document.activeElement)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(view).toHaveFocus()
})

test('shared resident filing modal preserves fixed regions and focus behavior', async () => {
  show(<MyComplaints />)
  const trigger = await screen.findByRole('button', { name: 'File a Complaint', exact: true })
  await userEvent.click(trigger)
  const modal = screen.getByRole('dialog', { name: 'File a Complaint' })
  const close = within(modal).getByRole('button', { name: 'Close file a complaint' })
  expect(close).toHaveFocus()
  expect(modal.querySelector('.resident-filing-header')).toContainElement(close)
  expect(modal.querySelector('.complaint-form-body')).toContainElement(screen.getByLabelText(/What happened/))
  expect(modal.querySelector('.modal-actions')).toContainElement(screen.getByRole('button', { name: 'Submit complaint' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('Resident Settings retains all four cards and password visibility control', async () => {
  show(<ResidentDashboard />, '/resident?tab=settings')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Details' })).toBeEnabled())
  const grid = document.querySelector('.resident-settings-grid')
  expect(grid.querySelectorAll('.dashboard-card')).toHaveLength(4)
  ;['My Details', 'Profile Photo', 'ID Verification', 'Change Password'].forEach((name) => {
    expect(within(grid).getByRole('heading', { name })).toBeInTheDocument()
  })
  expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Show the new password' }))
  expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'text')
})

test('public Officials preserves featured ordering and published schedule states', async () => {
  tables.barangay_officials = [
    { id: 'punong', full_name: 'Featured example', position: 'Punong Barangay' },
    { id: 'secretary', full_name: 'Secretary example', position: 'Barangay Secretary' },
    { id: 'treasurer', full_name: 'Treasurer example', position: 'Barangay Treasurer' },
    { id: 'member', full_name: 'Council example', position: 'Kagawad' },
  ]
  show(<Officials />)
  await screen.findByText('Secretary example')
  expect(document.querySelector('.council-card-punong')).toHaveTextContent('Featured example')
  expect(document.querySelectorAll('.council-featured .council-card')).toHaveLength(2)
  expect(document.querySelectorAll('.council-grid .council-small-card')).toHaveLength(1)
})

test('public Tanod duty hides future assignments and private fields', async () => {
  rpcData.public_tanod_on_duty = [
    { display_name: 'Upcoming person', duty_state: 'scheduled', shift_start: '2099-10-20T06:00:00+08:00', shift_end: '2099-10-20T14:00:00+08:00' },
    { display_name: 'Current person', general_area: 'Published area', duty_state: 'scheduled', shift_start: new Date(Date.now() - 3600000).toISOString(), shift_end: new Date(Date.now() + 3600000).toISOString(), contact_number: 'PRIVATE' },
  ]
  show(<PublicTanodDuty />)
  expect(await screen.findByText('Current person')).toBeInTheDocument()
  expect(screen.queryByText('Upcoming person')).not.toBeInTheDocument()
  expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh duty status' })).toBeInTheDocument()
})
