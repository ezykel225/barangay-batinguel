import { render, screen, within, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from './supabase/supabaseClient'
import { useAuth } from './context/AuthContext'
import Home from './pages/Home'
import EServices from './pages/EServices'
import HealthCenter from './pages/HealthCenter'
import Officials from './pages/Officials'
import ResidentDashboard from './dashboards/ResidentDashboard'
import NurseDashboard from './dashboards/NurseDashboard'
import MyComplaints from './complaints/MyComplaints'
import PublicTanodDuty from './tanod/PublicTanodDuty'
import fs from 'fs'
import path from 'path'

jest.mock('./supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } } }))
jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./components/Navbar', () => () => <nav>Public navigation</nav>)
jest.mock('./components/Footer', () => () => <footer>Public footer</footer>)
jest.mock('./components/Sidebar', () => ({ setActiveTab }) => <nav>{['dashboard','documents','reservations','complaints','medical-programs','medicines','health-events'].map(tab => <button key={tab} onClick={() => setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('./components/NotificationBell', () => () => null)
jest.mock('./components/useNotifications', () => ({ useNotifications: () => ({ notifications: [], readIds: new Set(), badges: {}, refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }) }))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

let tables, writes, reads, rpcData
const user = { id: 'resident-one', full_name: 'Resident Example', role: 'resident', verification_status: 'verified' }
const reservation = { id: 'booking-one', resident_id: user.id, reference: 'RES-EXAMPLE', preferred_date: '2099-10-20', preferred_time: '17:00', end_time: '18:00', purpose: 'Training', status: 'approved', contact_number: '09123456789', created_at: '2026-10-19T01:00:00Z', additional_notes: 'Resident booking note' }
beforeEach(() => {
  writes = []; reads = []; rpcData = {}
  tables = {
    profiles: [user], document_requests: [
      { id: 'd1', resident_id: user.id, document_type: 'Barangay Clearance', purpose: 'Work', status: 'pending' },
      { id: 'd2', resident_id: user.id, document_type: 'Certificate of Residency', purpose: 'School', status: 'ready_for_pickup' },
      { id: 'secret', resident_id: 'another', document_type: 'Other', purpose: 'PRIVATE OTHER USER', status: 'pending' },
    ], reservations: [reservation],
    medical_programs: [{ id: 'program1', title: 'Recurring service', schedule_label: 'Published weekday', time_label: 'Published hours', display_order: 0 }],
    medicine_stock: [{ id: 'm1', name: 'Example medicine', generic_name: 'Example generic', category: 'Other', form: 'Tablet', status: 'available' }, { id: 'm2', name: 'Second medicine', category: 'Other', status: 'low' }, { id: 'm3', name: 'Third medicine', status: 'unavailable' }],
    health_events: [{ id: 'event1', title: 'Health activity', event_date: '2099-10-20', location: 'Health Center', target_audience: 'Published audience', description: 'Existing event description' }],
  }
  useAuth.mockReturnValue({ user: { id: user.id }, role: 'resident' })
  supabase.rpc.mockImplementation(async name => ({ data: rpcData[name] || [], error: null }))
  supabase.from.mockImplementation(table => {
    const query = { table, filters: [], mode: 'read', payload: null }; reads.push(query)
    const result = () => {
      if (query.mode !== 'read') { writes.push(query); return { data: [{ id: 'saved' }], error: null } }
      return { data: (tables[table] || []).filter(row => query.filters.every(([key,value]) => row[key] === value)), error: null }
    }
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder, is: () => builder, not: () => builder, in: () => builder,
      eq: (key,value) => { query.filters.push([key,value]); return builder },
      insert: payload => { query.mode = 'insert'; query.payload = payload; return builder },
      update: payload => { query.mode = 'update'; query.payload = payload; return builder },
      delete: () => { query.mode = 'delete'; return builder },
      single: async () => ({ data: result().data[0] || null, error: null }),
      maybeSingle: async () => ({ data: result().data[0] || null, error: null }),
      then: (resolve,reject) => Promise.resolve(result()).then(resolve,reject),
    }
    return builder
  })
})
const show = (element, route = '/') => render(<MemoryRouter initialEntries={[route]}>{element}</MemoryRouter>)
const navigate = async tab => userEvent.click(screen.getByRole('button', { name: tab + ' navigation' }))

test('Home has five popular services, concise previews, and unchanged destinations', async () => {
  show(<Home />)
  expect(screen.getByRole('heading', { name: 'Popular E-Services' })).toBeInTheDocument()
  const cards = document.querySelectorAll('.home-service-card')
  expect(cards).toHaveLength(5)
  expect([...cards].map(card => card.getAttribute('href'))).toEqual(expect.arrayContaining(['/reservation','/track-reservation','/track-complaint','/resident?tab=complaints','/resident?tab=documents']))
  expect(screen.queryByText('My Complaints')).toBeNull()
  expect(screen.getByRole('link', { name: 'View E-Services' })).toHaveAttribute('href', '/e-services')
  expect(screen.getByRole('link', { name: 'View Safety Map' })).toHaveAttribute('href', '/community-safety')
  expect(screen.getByRole('link', { name: 'About the Barangay' })).toHaveAttribute('href', '/about')
})

test('E-Services removes shared authentication strip and preserves each return destination', async () => {
  useAuth.mockReturnValue({ user: null, role: null })
  show(<EServices />)
  expect(screen.queryByRole('link', { name: 'Sign in', exact: true })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
  expect(screen.queryByText('Sign in to continue')).toBeNull()
  expect(screen.getByRole('link', { name: 'Request Document' })).toHaveAttribute('href', '/login?next=%2Fresident%3Ftab%3Ddocuments')
  expect(screen.getByRole('link', { name: 'Reserve Court' })).toHaveAttribute('href', '/reservation')
  cleanup()
  useAuth.mockReturnValue({ user, role: 'resident' })
  show(<EServices />)
  expect(screen.getByRole('link', { name: 'Request Document' })).toHaveAttribute('href', '/resident?tab=documents')
  expect(screen.queryByRole('link', { name: 'Sign in', exact: true })).toBeNull()
})

test('public Health Center removes quick links and shows public-safe existing programs', async () => {
  tables.medical_programs[0].internal_note = 'NEVER PUBLIC'
  show(<HealthCenter />)
  expect(await screen.findByText('Recurring service')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Ongoing Medical Programs' })).toBeInTheDocument()
  const activities = screen.getByRole('region', { name: 'Programs & Health Activities' })
  expect(within(activities).getAllByRole('heading', { name: 'Ongoing Medical Programs' })).toHaveLength(1)
  expect(within(activities).getByRole('heading', { name: 'Upcoming Health Events' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Quick Links' })).toBeNull()
  expect(screen.queryByText('NEVER PUBLIC')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add Program' })).toBeNull()
})

test('public programs label only explicitly recurring or walk-in schedules', async () => {
  tables.medical_programs = [
    { title: 'Weekly service', schedule_label: 'Every Tuesday', time_label: '8:00 AM' },
    { title: 'Walk-in service', schedule_label: 'Daily Walk-in', time_label: '1:00 PM' },
    { title: 'Unconfirmed schedule', schedule_label: 'Contact the clinic', time_label: '' },
  ]
  show(<HealthCenter />)
  await screen.findByText('Weekly service')
  const programs = within(screen.getByRole('region', { name: 'Ongoing Medical Programs' }))
  expect(programs.getAllByText('Recurring', { exact: true })).toHaveLength(1)
  expect(programs.getAllByText('Walk-in', { exact: true })).toHaveLength(1)
  expect(screen.getByText('Contact the clinic')).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { name: 'Ongoing Medical Programs' })).toHaveLength(1)
})

test('public duty hides future assignments and never exposes private fields', async () => {
  rpcData.public_tanod_on_duty = [
    { display_name: 'Upcoming person', duty_state: 'scheduled', shift_start: '2099-10-20T06:00:00+08:00', shift_end: '2099-10-20T14:00:00+08:00' },
    { display_name: 'Current person', general_area: 'Published area', duty_state: 'scheduled', shift_start: new Date(Date.now()-3600000).toISOString(), shift_end: new Date(Date.now()+3600000).toISOString(), contact_number: 'PRIVATE' },
  ]
  show(<PublicTanodDuty />)
  expect(await screen.findByText('Current person')).toBeInTheDocument()
  expect(screen.queryByText('Upcoming person')).toBeNull()
  expect(screen.queryByText('Upcoming Shifts')).toBeNull()
  expect(screen.getByText('Scheduled')).toBeInTheDocument()
  expect(screen.queryByText('PRIVATE')).toBeNull()
  expect(screen.getByRole('button', { name: 'Refresh duty status' })).toBeInTheDocument()
})

test('resident documents search and filters use only loaded owned records', async () => {
  show(<ResidentDashboard />, '/resident?tab=documents')
  expect(await screen.findByText('Work')).toBeInTheDocument()
  expect(screen.queryByText('PRIVATE OTHER USER')).toBeNull()
  await userEvent.type(screen.getByLabelText('Search requests'), 'school')
  expect(screen.getByText('School')).toBeInTheDocument()
  expect(screen.queryByText('Work')).toBeNull()
  await userEvent.clear(screen.getByLabelText('Search requests'))
  await userEvent.selectOptions(screen.getByLabelText('Status', { exact: true }), 'ready_for_pickup')
  expect(screen.queryByText('Work')).toBeNull()
  await userEvent.selectOptions(screen.getByLabelText('Document type'), 'Barangay Clearance')
  expect(screen.getByText('No requests match these filters.')).toBeInTheDocument()
  expect(reads.some(row => row.table === 'document_requests' && row.filters.some(([key,value]) => key === 'resident_id' && value === user.id))).toBe(true)
})

test('resident reservation View opens correct owned data and restores focus on Escape', async () => {
  show(<ResidentDashboard />, '/resident?tab=reservations')
  const view = await screen.findByRole('button', { name: 'View reservation RES-EXAMPLE' })
  await userEvent.click(view)
  const modal = screen.getByRole('dialog', { name: 'Reservation Details' })
  expect(within(modal).getByText('Training')).toBeInTheDocument()
  expect(within(modal).getByText('09123456789')).toBeInTheDocument()
  expect(within(modal).getByText('RES-EXAMPLE')).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(view).toHaveFocus()
})

test('resident dashboard keeps recent requests and summary without redundant Quick Actions', async () => {
  show(<ResidentDashboard />, '/resident')
  expect(await screen.findByText('Recent Document Requests')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Quick Actions' })).toBeNull()
  expect(screen.queryByText(/Active \/ Upcoming Reservations:/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'New Document Request' })).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Request' })).toBeEnabled())
})

test('resident complaint modal keeps reference/status, evidence and focus behavior without internal case details', async () => {
  tables.complaints = [{ id: 'c1', reference: 'CMP-OWNED', category: 'noise', status: 'received', narrative: 'Resident narrative' }]
  rpcData.complaint_parties_for = []; rpcData.complaint_attachments_for = []; rpcData.complaint_history_for = []
  show(<MyComplaints />)
  const view = await screen.findByRole('button', { name: 'Show details for CMP-OWNED' })
  await userEvent.click(view)
  const modal = screen.getByRole('dialog', { name: 'Complaint Details' })
  expect(within(modal).getByText('CMP-OWNED')).toBeInTheDocument()
  expect(within(modal.querySelector('.portal-details-header')).getByText('Received')).toBeInTheDocument()
  expect(within(modal).getByText('Resident narrative')).toBeInTheDocument()
  expect(within(modal).getAllByRole('button', { name: /close/i })).toHaveLength(1)
  expect(within(modal).queryByText(/KP screening/)).toBeNull()
  const close = within(modal).getByRole('button', { name: 'Close complaint details' })
  close.focus(); await userEvent.tab({ shift: true }); expect(modal).toContainElement(document.activeElement)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull(); expect(view).toHaveFocus()
})

test('nurse dashboard previews programs and moves existing management into Medical Programs', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />)
  await screen.findByText('Recurring service')
  expect(screen.queryByRole('button', { name: /Add Program/ })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'View all programs' }))
  expect(screen.getByRole('heading', { name: 'Medical Programs' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Add Program/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save Program' })).toBeInTheDocument()
})

test('nurse medicines summarize and filter existing data while quick availability writes stay unchanged', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />); await navigate('medicines')
  expect(await screen.findByText('Example medicine')).toBeInTheDocument()
  const summary = document.querySelector('.medicine-summary-grid')
  expect(summary).toHaveTextContent('3Total Medicines1Available1Low Stock1Out of Stock')
  await userEvent.type(screen.getByLabelText('Search medicines'), 'Example')
  expect(screen.queryByText('Second medicine')).toBeNull()
  const row = screen.getByText('Example medicine').closest('.medicine-admin-row')
  await userEvent.click(within(row).getByRole('button', { name: 'Low stock' }))
  await waitFor(() => expect(writes.some(row => row.table === 'medicine_stock' && row.payload.status === 'low')).toBe(true))
  await userEvent.clear(screen.getByLabelText('Search medicines'))
  await userEvent.selectOptions(screen.getByLabelText('Medicine status'), 'unavailable')
  expect(screen.getByText('Third medicine')).toBeInTheDocument()
  expect(screen.queryByText('Second medicine')).toBeNull()
})

test('Health Event Manage shows existing fields and hands Edit to the existing form', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />); await navigate('health-events')
  const manage = await screen.findByRole('button', { name: 'Manage health event Health activity' })
  await userEvent.click(manage)
  const modal = screen.getByRole('dialog', { name: 'Health Event' })
  expect(within(modal).getByText('Existing event description')).toBeInTheDocument()
  expect(within(modal).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  await userEvent.click(within(modal).getByRole('button', { name: 'Edit' }))
  expect(screen.queryByRole('dialog', { name: 'Health Event' })).toBeNull()
  expect(screen.getByRole('dialog')).toHaveTextContent('Edit Health Event')
})

test('public Officials controls portrait geometry and Home previews share layout rules', () => {
  const officials = fs.readFileSync(path.join(__dirname,'pages/Officials.css'),'utf8')
  const home = fs.readFileSync(path.join(__dirname,'pages/Home.css'),'utf8')
  expect(officials).toContain('max-width: 360px')
  expect(officials).toContain('width: 100%; height: auto; aspect-ratio: 5 / 4; margin: 0')
  expect(officials).toContain('max-width: 660px')
  expect(officials).toContain('object-fit: cover')
  expect(home).toContain('.home-safety-teaser-container, .home-about-teaser-container')
})


test('Medical Programs keeps add/edit/remove on the existing table and confirmation flow', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />); await navigate('medical-programs')
  await screen.findByText('Recurring service')
  await userEvent.click(screen.getByRole('button', { name: /Add Program/ }))
  await userEvent.type(screen.getByLabelText('Program Title *'), 'New recurring service')
  await userEvent.type(screen.getByLabelText('Schedule *'), 'New published schedule')
  await userEvent.type(screen.getByLabelText('Time *'), 'Published hours')
  await userEvent.click(screen.getByRole('button', { name: 'Save Program' }))
  await waitFor(() => expect(writes.some(row => row.table === 'medical_programs' && row.mode === 'insert' && row.payload[0].title === 'New recurring service')).toBe(true))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await userEvent.click(screen.getByRole('button', { name: /Edit Schedule/ }))
  await userEvent.clear(screen.getByLabelText('Schedule *'))
  await userEvent.type(screen.getByLabelText('Schedule *'), 'Updated schedule')
  await userEvent.click(screen.getByRole('button', { name: 'Update Program' }))
  await waitFor(() => expect(writes.some(row => row.table === 'medical_programs' && row.mode === 'update' && row.payload.schedule_label === 'Updated schedule')).toBe(true))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await userEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))
  const confirm = screen.getByRole('dialog')
  await userEvent.click(within(confirm).getByRole('button', { name: 'Remove program' }))
  await waitFor(() => expect(writes.some(row => row.table === 'medical_programs' && row.mode === 'delete')).toBe(true))
})

test('Health Event Delete keeps the existing confirmation before the existing delete call', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />); await navigate('health-events')
  await userEvent.click(await screen.findByRole('button', { name: 'Manage health event Health activity' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Health Event' })).getByRole('button', { name: 'Delete' }))
  expect(writes.some(row => row.table === 'health_events' && row.mode === 'delete')).toBe(false)
  const confirm = screen.getByRole('dialog')
  await userEvent.click(within(confirm).getByRole('button', { name: /Delete event/i }))
  await waitFor(() => expect(writes.some(row => row.table === 'health_events' && row.mode === 'delete')).toBe(true))
})

test('public Officials renders the featured Punong before equal staff cards, preserving published schedule states', async () => {
  tables.barangay_officials = [
    { id:'punong', full_name:'Featured example', position:'Punong Barangay' },
    { id:'secretary', full_name:'Secretary example', position:'Barangay Secretary' },
    { id:'treasurer', full_name:'Treasurer example', position:'Barangay Treasurer' },
    { id:'member', full_name:'Council example', position:'Kagawad' },
  ]
  show(<Officials />)
  await screen.findByText('Secretary example')
  expect(document.querySelector('.council-card-punong')).toHaveTextContent('Featured example')
  expect(document.querySelectorAll('.council-featured .council-card')).toHaveLength(2)
  expect(document.querySelectorAll('.council-grid .council-small-card')).toHaveLength(1)
  expect(document.querySelector('.council-card-punong').compareDocumentPosition(document.querySelector('.council-featured')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})


test('resident filing uses fixed header/body/footer and shared focus behavior', async () => {
  show(<MyComplaints />)
  const trigger = await screen.findByRole('button', { name: 'File a Complaint', exact: true })
  await userEvent.click(trigger)
  const modal = screen.getByRole('dialog', { name: 'File a Complaint' })
  const close = within(modal).getByRole('button', { name: 'Close file a complaint' })
  expect(close).toHaveFocus()
  expect(modal.querySelector('.resident-filing-header')).toContainElement(close)
  expect(modal.querySelector('.complaint-form-body')).toContainElement(screen.getByLabelText(/What happened/))
  const footer = modal.querySelector('.modal-actions')
  expect(footer).toContainElement(screen.getByRole('button', { name: 'Submit complaint' }))
  expect(modal.querySelector('.complaint-form-body')).not.toContainElement(footer)
  expect(document.body.style.overflow).toBe('hidden')
  await userEvent.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Submit complaint' })).toHaveFocus()
  await userEvent.tab(); expect(close).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger).toHaveFocus()
  await userEvent.click(trigger); await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger).toHaveFocus()
})

test('reservation Action omits obsolete placeholder while View still opens details', async () => {
  tables.reservations = [{ ...reservation, status: 'completed' }]
  show(<ResidentDashboard />, '/resident?tab=reservations')
  const view = await screen.findByRole('button', { name: 'View reservation RES-EXAMPLE' })
  expect(view.closest('td')).toHaveTextContent(/^View$/)
  await userEvent.click(view)
  expect(screen.getByRole('dialog', { name: 'Reservation Details' })).toBeInTheDocument()
})

test('nurse stock overview counts loaded statuses, prioritizes alerts, limits preview and opens Medicines', async () => {
  tables.medicine_stock.push({id:'m4',name:'Fourth medicine',status:'low'},{id:'m5',name:'Fifth medicine',status:'unavailable'})
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />)
  const stock = await screen.findByRole('region', { name: 'Medicine Stock' })
  await waitFor(() => expect(within(stock).getAllByRole('listitem')).toHaveLength(3))
  expect(stock.querySelector('.nurse-stock-counts .medicine-available')).toHaveTextContent('1Available')
  expect(stock.querySelector('.nurse-stock-counts .medicine-low')).toHaveTextContent('2Low stock')
  expect(stock.querySelector('.nurse-stock-counts .medicine-unavailable')).toHaveTextContent('2Out of stock')
  const alerts = within(stock).getAllByRole('listitem')
  expect(alerts[0]).toHaveTextContent('Third medicine'); expect(alerts[1]).toHaveTextContent('Fifth medicine')
  expect(screen.getByRole('heading', { name: /Upcoming Health Events/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Active Medical Programs' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'My Status' })).toBeInTheDocument()
  await userEvent.click(within(stock).getByRole('button', { name: 'View medicines' }))
  expect(screen.getByRole('heading', { name: 'Medicines' })).toBeInTheDocument()
})

test('nurse stock overview shows healthy empty state without inventing quantities', async () => {
  tables.medicine_stock = [tables.medicine_stock[0]]
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />)
  const stock = await screen.findByRole('region', { name: 'Medicine Stock' })
  await waitFor(() => expect(stock.querySelector('.medicine-available')).toHaveTextContent('1Available'))
  expect(within(stock).getByText('No medicine stock alerts.')).toBeInTheDocument()
  expect(within(stock).queryByRole('list')).toBeNull()
})

test('Health Event editing retains the existing update payload and table', async () => {
  useAuth.mockReturnValue({ user: { id: 'nurse' }, role: 'nurse' })
  show(<NurseDashboard />); await navigate('health-events')
  await userEvent.click(await screen.findByRole('button', { name: 'Manage health event Health activity' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Health Event' })).getByRole('button', { name: 'Edit' }))
  const input = screen.getByDisplayValue('Health activity')
  await userEvent.clear(input); await userEvent.type(input, 'Updated existing activity')
  await userEvent.click(screen.getByRole('button', { name: 'Save Event' }))
  await waitFor(() => expect(writes.some(row => row.table === 'health_events' && row.mode === 'update' && row.payload.title === 'Updated existing activity')).toBe(true))
})


test('Resident Settings groups all four existing cards without changing fields or actions', async () => {
  show(<ResidentDashboard />, '/resident?tab=settings')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Details' })).toBeEnabled())
  const grid = document.querySelector('.resident-settings-grid')
  const columns = grid.querySelectorAll('.resident-settings-column')
  expect(columns).toHaveLength(2)
  expect(within(columns[0]).getByRole('heading', { name: 'My Details' })).toBeInTheDocument()
  expect(within(columns[0]).getByRole('heading', { name: 'Profile Photo' })).toBeInTheDocument()
  expect(within(columns[1]).getByRole('heading', { name: 'ID Verification' })).toBeInTheDocument()
  expect(within(columns[1]).getByRole('heading', { name: 'Change Password' })).toBeInTheDocument()
  expect(grid.querySelectorAll('.dashboard-card')).toHaveLength(4)
  expect(screen.getByRole('button', { name: 'Save Details' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Save Password' })).toBeInTheDocument()
  expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Show the new password' }))
  expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'text')
  expect(document.getElementById('resident-avatar-upload')).toHaveAttribute('accept', 'image/*')
})
