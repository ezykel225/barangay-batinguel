// Login names the right failure and still fails closed on every one of them.
// Before Phase 2 a dropped connection while reading the role read "Profile not found.
// Please contact admin.", sending people to an administrator for a network blip.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from './Login'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), auth: { signInWithPassword: jest.fn(), signOut: jest.fn() } } }))
jest.mock('../components/Navbar', () => () => null)
jest.mock('../components/Footer', () => () => null)
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

const profileLookup = (result) => {
  supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => result }) }) })
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuth.mockReturnValue({ user: null, role: null, loading: false })
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'account-a' } }, error: null })
  supabase.auth.signOut.mockResolvedValue({ error: null })
})

const signIn = async () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/official" element={<p>Official portal</p>} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } })
  await act(async () => fireEvent.submit(screen.getByRole('tabpanel')))
}

test('invalid credentials say so, and no role is read', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } })
  await signIn()
  expect(screen.getByText('Incorrect email or password. Please try again.')).toBeInTheDocument()
  expect(supabase.from).not.toHaveBeenCalled()
})

test('a missing profile is reported as missing, and the session is ended', async () => {
  profileLookup({ data: null, error: { code: 'PGRST116', message: 'no rows' }, status: 406 })
  await signIn()
  expect(screen.getByText('Profile not found. Please contact barangay administration.')).toBeInTheDocument()
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.queryByText('Official portal')).toBeNull()
})

test('a dropped connection is reported as a connection problem, not a missing profile, and still fails closed', async () => {
  profileLookup({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 })
  await signIn()
  expect(screen.getByText(/could not reach the barangay system/i)).toBeInTheDocument()
  expect(screen.queryByText(/Profile not found/)).toBeNull()
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.queryByText('Official portal')).toBeNull()
})

test('a refused token is reported generically and fails closed', async () => {
  profileLookup({ data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 })
  await signIn()
  expect(screen.getByText('Sign-in could not be completed. Please try again.')).toBeInTheDocument()
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.queryByText('Official portal')).toBeNull()
})

test('the retired nurse role is still refused and signed out', async () => {
  profileLookup({ data: { role: 'nurse' }, error: null, status: 200 })
  await signIn()
  expect(screen.getByText(/no supported portal role/)).toBeInTheDocument()
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.queryByText('Official portal')).toBeNull()
})

test('a supported role still signs in and goes to its portal', async () => {
  profileLookup({ data: { role: 'official' }, error: null, status: 200 })
  await signIn()
  expect(await screen.findByText('Official portal', {}, { timeout: 2000 })).toBeInTheDocument()
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
})
