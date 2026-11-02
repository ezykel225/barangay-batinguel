import { act, render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), auth: { onAuthStateChange: jest.fn() } } }))
const Reader = () => { const { role, loading } = useAuth(); return <p>{loading ? 'Loading role' : role || 'No supported role'}</p> }
test.each(['official','resident','tanod'])('AuthContext obtains %s from profiles, not user metadata', async (role) => {
  let callback
  supabase.auth.onAuthStateChange.mockImplementation((cb) => { callback = cb; return { data: { subscription: { unsubscribe: jest.fn() } } } })
  supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) })
  render(<AuthProvider><Reader /></AuthProvider>)
  await act(async () => callback('SIGNED_IN', { user: { id: 'user-a', user_metadata: { role: 'official' } } }))
  // The lookup now runs after the auth callback returns (see AuthContext), so wait for it.
  expect(await screen.findByText(role)).toBeInTheDocument()
  expect(supabase.from).toHaveBeenCalledWith('profiles')
})

test('AuthContext treats the retired nurse role as unsupported', async () => {
  let callback
  supabase.auth.onAuthStateChange.mockImplementation((cb) => { callback = cb; return { data: { subscription: { unsubscribe: jest.fn() } } } })
  supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'nurse' } }) }) }) })
  render(<AuthProvider><Reader /></AuthProvider>)
  await act(async () => callback('SIGNED_IN', { user: { id: 'user-a', user_metadata: { role: 'official' } } }))
  expect(await screen.findByText('No supported role')).toBeInTheDocument()
})
