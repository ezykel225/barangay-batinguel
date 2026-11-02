// Integration test against the REAL supabase-js / auth-js client (2.110), with the
// network and storage replaced. It reproduces the order of events that hung the app:
//
//   1. the browser holds a session whose access token has EXPIRED;
//   2. auth-js starts initializing, sees the expiry and refreshes the token over the
//      network (delayed here, as a real network is);
//   3. meanwhile React mounts AuthProvider, which subscribes to onAuthStateChange;
//   4. the refresh lands; auth-js notifies TOKEN_REFRESHED and AWAITS the callback
//      before it finishes initializing;
//   5. every query first calls getSession(), which waits for initialization.
//
// If the callback awaits a query (the previous AuthContext did), steps 4 and 5 wait on
// each other forever: the session check never finishes and EVERY query, public pages
// included, hangs. Nothing here contacts a real server.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import { supabase, mockNetwork } from '../supabase/supabaseClient'

jest.mock('../supabase/supabaseClient', () => {
  const { createClient } = jest.requireActual('@supabase/supabase-js')
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const now = Math.floor(Date.now() / 1000)
  const jwt = (exp) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'user-1', aud: 'authenticated', role: 'authenticated', exp })}.c2lnbmF0dXJl`
  const user = { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'official@auth-test.invalid' }
  const storageKey = 'auth-refresh-deadlock-test'
  const store = {
    [storageKey]: JSON.stringify({
      access_token: jwt(now - 600), refresh_token: 'refresh-1', token_type: 'bearer',
      expires_in: 3600, expires_at: now - 600, user,
    }),
  }
  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
  }
  const respond = (status, body) => ({
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  const mockNetwork = { requests: [], refreshDelayMs: 150 }
  const fetchImpl = async (input) => {
    const url = String(input && input.url ? input.url : input)
    mockNetwork.requests.push(url)
    if (url.includes('/auth/v1/token')) {
      await new Promise((r) => setTimeout(r, mockNetwork.refreshDelayMs))
      return respond(200, {
        access_token: jwt(now + 3600), refresh_token: 'refresh-2', token_type: 'bearer',
        expires_in: 3600, expires_at: now + 3600, user,
      })
    }
    if (url.includes('/rest/v1/profiles')) return respond(200, { role: 'official' })
    if (url.includes('/rest/v1/announcements')) return respond(200, [{ id: 'public-1' }])
    return respond(404, { message: 'not mocked: ' + url })
  }
  const supabase = createClient('https://auth-test.invalid', 'public-anon-key-for-tests', {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storage, storageKey },
    global: { fetch: fetchImpl },
  })
  return { supabase, mockNetwork }
})

afterAll(async () => {
  await supabase.auth.stopAutoRefresh()
})

test('an expired stored session refreshes and the portal opens: no auth callback deadlock', async () => {
  // Mount while auth-js is still waiting for the delayed refresh, which is what puts
  // this subscriber inside auth-js's initialization.
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/official']}>
        <Routes>
          <Route path="/official" element={<ProtectedRoute allowedRole="official"><p>Official portal</p></ProtectedRoute>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  expect(screen.getByText('Checking your session...')).toBeInTheDocument()

  expect(await screen.findByText('Official portal', {}, { timeout: 3000 })).toBeInTheDocument()

  // The refresh really happened, through the real client.
  expect(mockNetwork.requests.some((u) => u.includes('/auth/v1/token'))).toBe(true)
  expect(mockNetwork.requests.some((u) => u.includes('/rest/v1/profiles'))).toBe(true)

  // And an unrelated public query still completes, which is what hung app-wide before.
  const publicRead = supabase.from('announcements').select('id')
  const outcome = await Promise.race([
    publicRead.then(() => 'completed'),
    new Promise((r) => setTimeout(() => r('hung'), 2000)),
  ])
  expect(outcome).toBe('completed')
})
