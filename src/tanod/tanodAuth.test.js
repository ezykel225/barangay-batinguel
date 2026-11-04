import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { dashboardForRole, isSupportedRole } from '../utils/authRoles'
import ProtectedRoute from '../components/ProtectedRoute'
import Login from '../pages/Login'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), auth: { signInWithPassword: jest.fn(), signOut: jest.fn() } } }))
jest.mock('../components/Navbar', () => () => null)
jest.mock('../components/Footer', () => () => null)
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))
beforeEach(() => {
  jest.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'account-a' }, role: 'tanod', loading: false })
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'account-a' } }, error: null })
  supabase.auth.signOut.mockResolvedValue({ error: null })
})
test.each(['official','resident','tanod'])('supported %s role maps to its own dashboard', (role) => {
  expect(dashboardForRole(role)).toBe(`/${role}`)
  expect(isSupportedRole(role)).toBe(true)
})
test.each(['nurse','constructor','admin','',null])('unsupported role %s fails closed', (role) => {
  expect(dashboardForRole(role)).toBe('/login')
  expect(isSupportedRole(role)).toBe(false)
})
for (const role of ['official','resident','tanod']) {
  for (const target of ['official','resident','tanod']) {
    test(`${role} cannot acquire ${target} capability through navigation`, () => {
      useAuth.mockReturnValue({ user: { id: 'a' }, role, loading: false })
      render(<MemoryRouter initialEntries={[`/gate`]}><Routes>
        <Route path="/gate" element={<ProtectedRoute allowedRole={target}><p>Authorized content</p></ProtectedRoute>} />
        <Route path={`/${role}`} element={<p>Own portal</p>} />
      </Routes></MemoryRouter>)
      expect(screen.getByText(role === target ? 'Authorized content' : 'Own portal')).toBeInTheDocument()
      if (role !== target) expect(screen.queryByText('Authorized content')).toBeNull()
    })
  }
}
test('signed-out Tanod route requires the same centralized login', () => {
  useAuth.mockReturnValue({ user: null, role: null, loading: false })
  render(<MemoryRouter><Routes><Route path="/" element={<ProtectedRoute allowedRole="tanod"><p>Secret</p></ProtectedRoute>} /><Route path="/login" element={<p>Shared login</p>} /></Routes></MemoryRouter>)
  expect(screen.getByText('Shared login')).toBeInTheDocument()
  expect(screen.queryByText('Secret')).toBeNull()
})
test.each(['official','resident','tanod'])('shared personnel login routes stored %s role, never audience selection', async (role) => {
  supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) })
  render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<Login />} /><Route path={`/${role}`} element={<p>Correct portal</p>} /></Routes></MemoryRouter>)
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Barangay Personnel' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } })
  fireEvent.submit(screen.getByRole('tabpanel'))
  await waitFor(() => expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.test', password: 'test-only-password' }))
  await screen.findByText('Correct portal', {}, { timeout: 2000 })
  expect(supabase.from).toHaveBeenCalledWith('profiles')
})
test('unknown stored role is signed out rather than sent to a privileged portal', async () => {
  supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) })
  render(<MemoryRouter><Login /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } })
  await act(async () => fireEvent.submit(screen.getByRole('tabpanel')))
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.getByText(/no supported portal role/)).toBeInTheDocument()
})
