// Mock-only workflow evidence. No hosted client, credentials or authorization proof.
import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResidentDashboard from './ResidentDashboard'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), auth: { updateUser: jest.fn() }, storage: { from: jest.fn() } } }))
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../components/Sidebar', () => ({ setActiveTab }) => <nav aria-label="Test resident navigation">{['dashboard', 'documents', 'complaints', 'community-credit', 'settings'].map(tab => <button key={tab} onClick={() => setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell', () => () => null)
jest.mock('../components/useNotifications', () => ({ useNotifications: () => ({ notifications: [], readIds: new Set(), badges: {}, refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }) }))

let profile, profileReadError, requests, readError, writeError, writes
const capture = name => {
  if (!process.env.STAGE9A_LAYOUT_DIR) return
  fs.mkdirSync(process.env.STAGE9A_LAYOUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(process.env.STAGE9A_LAYOUT_DIR, `${name}.html`), document.body.innerHTML)
}
const show = () => render(<MemoryRouter><ResidentDashboard /></MemoryRouter>)
beforeEach(() => {
  profile = { id: 'test-resident', role: 'resident', full_name: 'TEST ONLY Resident', verification_status: 'verified' }
  profileReadError = null; requests = []; readError = null; writeError = null; writes = []
  useAuth.mockReturnValue({ user: { id: 'test-resident' }, role: 'resident' })
  supabase.rpc.mockResolvedValue({ data: [], error: null })
  supabase.from.mockImplementation(table => {
    let op = 'read', payload, single = false
    const q = new Proxy({}, { get: (_, method) => method === 'then' ? (resolve, reject) => Promise.resolve().then(() => {
      if (op === 'insert') {
        writes.push({ table, payload })
        if (!writeError) requests.push({ id: 'test-request', created_at: '2026-11-10T01:00:00Z', ...payload[0] })
        return { data: null, error: writeError }
      }
      if (op === 'update') return { data: null, error: null }
      return {
        data: table === 'profiles' ? (single ? profile : [profile]) : table === 'document_requests' ? requests : [],
        error: table === 'profiles' ? profileReadError : table === 'document_requests' ? readError : null,
      }
    }).then(resolve, reject) : (...args) => {
      if (method === 'single' || method === 'maybeSingle') single = true
      if (method === 'insert' || method === 'update') { op = method; payload = args[0] }
      return q
    } })
    return q
  })
})

test.each(['42501', 'NETWORK'])('failed request read %s is not an empty history or zero count; retry recovers', async code => {
  readError = { code }
  show()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(code === '42501' ? 'permissions' : 'could not be loaded')
  expect(screen.queryByText(/haven.t requested any/)).not.toBeInTheDocument()
  expect(screen.getByText('Total Requests').previousSibling).toHaveTextContent('Unavailable')
  capture(`resident-error-${code}`)
  readError = null
  fireEvent.click(screen.getByRole('button', { name: 'Retry document requests' }))
  await screen.findByText(/haven.t requested any/)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Total Requests').previousSibling).toHaveTextContent('0')
})

test('profile read failure is accessible, preserves loaded profile data and retries successfully', async () => {
  const auth = { user: { id: 'test-resident' }, role: 'resident' }
  useAuth.mockReturnValue(auth)
  const view = show()
  await screen.findByRole('heading', { name: 'Welcome, TEST ONLY Resident' })

  profileReadError = { code: '42501' }
  useAuth.mockReturnValue({ ...auth, user: { id: 'test-resident-reload' } })
  view.rerender(<MemoryRouter><ResidentDashboard /></MemoryRouter>)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('permissions')
  expect(screen.getByRole('heading', { name: 'Welcome, TEST ONLY Resident' })).toBeInTheDocument()

  profileReadError = null
  fireEvent.click(screen.getByRole('button', { name: 'Retry resident profile' }))
  await waitFor(() => expect(screen.queryByText(/profile is not available/i)).not.toBeInTheDocument())
  expect(screen.getByRole('heading', { name: 'Welcome, TEST ONLY Resident' })).toBeInTheDocument()
})

test('verified resident submits own pending document, tracks status, filters locally and cancels without another write', async () => {
  show()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Request' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'New Request' }))
  const dialog = screen.getByRole('dialog', { name: 'Request a Document' })
  capture('resident-document-dialog')
  fireEvent.change(within(dialog).getByLabelText('Purpose'), { target: { value: 'TEST ONLY defense workflow' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Submit Request' }))
  await screen.findByText('TEST ONLY defense workflow')
  expect(writes).toEqual([{ table: 'document_requests', payload: [expect.objectContaining({ resident_id: 'test-resident', status: 'pending', purpose: 'TEST ONLY defense workflow' })] }])
  fireEvent.click(screen.getByRole('button', { name: 'documents navigation' }))
  expect(screen.getByRole('row', { name: /TEST ONLY defense workflow/ })).toHaveTextContent('Pending')
  fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'no-match' } })
  expect(screen.getByText('No requests match these filters.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: '' } })
  capture('resident-documents')
  fireEvent.click(screen.getByRole('button', { name: 'New Request' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(writes).toHaveLength(1)
})

test('submission failure retains the draft and creates no false request status', async () => {
  writeError = { message: 'TEST ONLY denied write' }
  show()
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Request' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'New Request' }))
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'TEST ONLY unsaved purpose' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByLabelText('Purpose')).toHaveValue('TEST ONLY unsaved purpose')
  expect(requests).toHaveLength(0)
})

test.each(['pending', 'rejected', 'ineligible'])('unverified state %s cannot open new document requests in the UI', async state => {
  profile.verification_status = state
  show()
  await screen.findByRole('heading', { name: 'Welcome, TEST ONLY Resident' })
  expect(screen.getByRole('button', { name: 'New Request' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'documents navigation' }))
  expect(screen.getByRole('button', { name: 'New Request' })).toBeDisabled()
  expect(writes).toHaveLength(0)
})
