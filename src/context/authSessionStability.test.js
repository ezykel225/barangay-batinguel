// Session and role stability (Phase 2). These drive the REAL AuthProvider and the
// REAL ProtectedRoute; only the Supabase client is mocked, and each role lookup can be
// answered, failed or held open individually.
//
// The two defects these pin, both measured against the previous AuthContext:
//   * the auth callback AWAITED the role query. auth-js awaits every callback, and the
//     query waits for auth-js to finish initializing, so after an expired-token refresh
//     the two waited on each other and the whole app hung;
//   * a dropped connection during a lookup returned { data: null } and was read as a
//     revoked role, which threw a signed-in user out to /login.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import { supabase } from '../supabase/supabaseClient'
import { classifyRoleLookup, ROLE_RETRY_DELAYS_MS } from '../utils/roleLookup'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() } },
}))

// What postgrest-js really returns for each case. A network failure is NOT thrown.
const OK = (role) => ({ data: { role }, error: null, status: 200 })
const NET = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
const MISSING = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, status: 406 }
const JWT = { data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }

const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

let callback
const single = jest.fn()

beforeEach(() => {
  callback = undefined
  single.mockReset()
  supabase.auth.signOut.mockReset()
  supabase.auth.onAuthStateChange.mockImplementation((cb) => {
    callback = cb
    return { data: { subscription: { unsubscribe: jest.fn() } } }
  })
  supabase.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single }) }) }))
})

const Probe = () => {
  const a = useAuth()
  return (
    <output data-testid="auth">
      {`${a.user?.id || '-'}|${a.role || '-'}|${a.roleStatus}|${a.loading ? 'loading' : 'idle'}|${a.roleStale ? 'stale' : 'fresh'}`}
    </output>
  )
}
const state = () => screen.getByTestId('auth').textContent

const renderApp = (path = '/official') => render(
  <AuthProvider>
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/official" element={<ProtectedRoute allowedRole="official"><p>Official portal</p></ProtectedRoute>} />
        <Route path="/resident" element={<ProtectedRoute allowedRole="resident"><p>Resident portal</p></ProtectedRoute>} />
        <Route path="/tanod" element={<ProtectedRoute allowedRole="tanod"><p>Tanod portal</p></ProtectedRoute>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  </AuthProvider>,
)

const fire = (event, userId) => act(() => { callback(event, userId ? { user: { id: userId } } : null) })

describe('classifyRoleLookup', () => {
  test.each([
    ['a supported role', OK('official'), { kind: 'role', role: 'official' }],
    ['the retired nurse role', OK('nurse'), { kind: 'unsupported', role: 'nurse' }],
    ['an unknown role', OK('admin'), { kind: 'unsupported', role: 'admin' }],
    ['no profile row (PGRST116)', MISSING, { kind: 'missing' }],
    ['no data and no error', { data: null, error: null, status: 200 }, { kind: 'missing' }],
    ['a dropped connection (status 0)', NET, { kind: 'transient' }],
    ['a timeout', { data: null, error: { message: 'timeout' }, status: 408 }, { kind: 'transient' }],
    ['rate limiting', { data: null, error: { message: 'slow down' }, status: 429 }, { kind: 'transient' }],
    ['a server error', { data: null, error: { message: 'bad gateway' }, status: 502 }, { kind: 'transient' }],
    ['an expired JWT', JWT, { kind: 'auth' }],
    ['a plain 401', { data: null, error: { message: 'unauthorized' }, status: 401 }, { kind: 'auth' }],
    ['an unexpected client error', { data: null, error: { code: '42P01', message: 'relation does not exist' }, status: 404 }, { kind: 'failed' }],
  ])('%s', (_label, result, expected) => {
    expect(classifyRoleLookup(result)).toEqual(expected)
  })

  it('retries a bounded number of times', () => {
    expect(ROLE_RETRY_DELAYS_MS.length).toBeGreaterThan(0)
    expect(ROLE_RETRY_DELAYS_MS.length).toBeLessThanOrEqual(5)
    expect(Object.isFrozen(ROLE_RETRY_DELAYS_MS)).toBe(true)
  })
})

describe('the auth callback', () => {
  it('1. returns synchronously and makes no Supabase call inside the callback', async () => {
    single.mockResolvedValue(OK('official'))
    renderApp()
    let returned
    act(() => { returned = callback('SIGNED_IN', { user: { id: 'a' } }) })
    expect(returned).toBeUndefined()
    expect(single).not.toHaveBeenCalled()
    expect(await screen.findByText('Official portal')).toBeInTheDocument()
  })

  it('2. does not deadlock when auth-js awaits the callback before finishing initialization', async () => {
    // Model of auth-js 2.110 after an expired-token refresh: initialization awaits
    // every callback, and a query's getSession() awaits initialization.
    renderApp()
    const initialized = deferred()
    single.mockImplementation(async () => { await initialized.promise; return OK('official') })
    const initialize = async () => {
      await callback('TOKEN_REFRESHED', { user: { id: 'a' } })
      initialized.resolve()
    }
    let outcome
    await act(async () => {
      outcome = await Promise.race([
        initialize().then(() => 'initialized'),
        new Promise((r) => setTimeout(() => r('hung'), 300)),
      ])
    })
    expect(outcome).toBe('initialized')
    expect(await screen.findByText('Official portal')).toBeInTheDocument()
  })
})

describe('transient failures', () => {
  it('3. a first-load network failure shows Retry, with no redirect, no sign-out and no false logout', async () => {
    single.mockResolvedValue(NET)
    renderApp()
    fire('INITIAL_SESSION', 'a')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't confirm your account")
    expect(alert).toHaveTextContent('You are still signed in')
    expect(screen.queryByText('Login page')).toBeNull()
    expect(screen.queryByText('Official portal')).toBeNull()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(state()).toBe('a|-|unavailable|idle|fresh')

    single.mockResolvedValue(OK('official'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Official portal')).toBeInTheDocument()
    expect(state()).toBe('a|official|ready|idle|fresh')
  })

  it('4. a mid-session network failure keeps the confirmed role for the same user', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValue(NET)
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('TOKEN_REFRESHED', 'a')
    await waitFor(() => expect(state()).toBe('a|official|ready|idle|stale'))
    expect(screen.getByText('Official portal')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).toBeNull()
  })

  it('an auth failure (expired JWT) never keeps a role', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValue(JWT)
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('TOKEN_REFRESHED', 'a')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(state()).toBe('a|-|unavailable|idle|fresh')
    expect(screen.queryByText('Official portal')).toBeNull()
  })
})

describe('definitive answers apply at once', () => {
  it('5. official to resident redirects to the resident portal', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValueOnce(OK('resident'))
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('TOKEN_REFRESHED', 'a')
    expect(await screen.findByText('Resident portal')).toBeInTheDocument()
    expect(screen.queryByText('Official portal')).toBeNull()
  })

  it('6. the nurse role is blocked, at sign-in and after a confirmed role', async () => {
    single.mockResolvedValueOnce(OK('nurse'))
    renderApp()
    fire('SIGNED_IN', 'n')
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(state()).toBe('n|-|unsupported|idle|fresh')
  })

  it('6b. a confirmed official whose role becomes nurse loses the portal', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValueOnce(OK('nurse'))
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('USER_UPDATED', 'a')
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(state()).toBe('a|-|unsupported|idle|fresh')
  })

  it('7. a missing profile row removes access, even after a confirmed role', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValueOnce(MISSING)
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('TOKEN_REFRESHED', 'a')
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(state()).toBe('a|-|unsupported|idle|fresh')
  })
})

describe('no role leaks across accounts or time', () => {
  it('8. switching accounts never carries the previous role, even through a network failure', async () => {
    single.mockResolvedValueOnce(OK('official')).mockResolvedValue(NET)
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    fire('SIGNED_IN', 'b')
    expect(state()).toBe('b|-|loading|loading|fresh')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(state()).toBe('b|-|unavailable|idle|fresh')
    expect(screen.queryByText('Official portal')).toBeNull()
  })

  it('9. SIGNED_OUT clears everything, and a lookup still in flight is ignored when it lands', async () => {
    const late = deferred()
    single.mockReturnValueOnce(late.promise)
    renderApp()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(single).toHaveBeenCalledTimes(1))
    fire('SIGNED_OUT', null)
    expect(state()).toBe('-|-|signed_out|idle|fresh')
    await act(async () => { late.resolve(OK('official')) })
    expect(state()).toBe('-|-|signed_out|idle|fresh')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('10. an older response arriving late cannot restore revoked access', async () => {
    const older = deferred()
    const newer = deferred()
    single.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    renderApp()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(single).toHaveBeenCalledTimes(1))
    fire('TOKEN_REFRESHED', 'a')
    await waitFor(() => expect(single).toHaveBeenCalledTimes(2))
    await act(async () => { newer.resolve(OK('nurse')) })
    await waitFor(() => expect(state()).toBe('a|-|unsupported|idle|fresh'))
    await act(async () => { older.resolve(OK('official')) })
    expect(state()).toBe('a|-|unsupported|idle|fresh')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('a response landing after unmount changes nothing and raises nothing', async () => {
    const late = deferred()
    single.mockReturnValueOnce(late.promise)
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderApp()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(single).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => { late.resolve(OK('official')) })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('11. recovery', () => {
  it('retries when the browser comes back online', async () => {
    single.mockResolvedValueOnce(NET).mockResolvedValue(OK('official'))
    renderApp()
    fire('INITIAL_SESSION', 'a')
    await screen.findByRole('alert')
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(await screen.findByText('Official portal')).toBeInTheDocument()
  })

  it('retries when the tab becomes visible again', async () => {
    single.mockResolvedValueOnce(NET).mockResolvedValue(OK('official'))
    renderApp()
    fire('INITIAL_SESSION', 'a')
    await screen.findByRole('alert')
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(await screen.findByText('Official portal')).toBeInTheDocument()
    visibility.mockRestore()
  })

  it('does not look the role up again on online or visibility when nothing needs recovering', async () => {
    single.mockResolvedValue(OK('official'))
    renderApp()
    fire('SIGNED_IN', 'a')
    await screen.findByText('Official portal')
    const calls = single.mock.calls.length
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(single).toHaveBeenCalledTimes(calls)
  })

  it('automatic retries are bounded, with backoff, and then stop', async () => {
    jest.useFakeTimers()
    try {
      single.mockResolvedValue(NET)
      renderApp()
      fire('INITIAL_SESSION', 'a')
      await act(async () => { jest.advanceTimersByTime(0) })
      expect(single).toHaveBeenCalledTimes(1)
      let expected = 1
      for (const delay of ROLE_RETRY_DELAYS_MS) {
        await act(async () => { jest.advanceTimersByTime(delay - 1) })
        expect(single).toHaveBeenCalledTimes(expected)
        await act(async () => { jest.advanceTimersByTime(1) })
        expected += 1
        expect(single).toHaveBeenCalledTimes(expected)
      }
      await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000) })
      expect(single).toHaveBeenCalledTimes(1 + ROLE_RETRY_DELAYS_MS.length)
      expect(state()).toBe('a|-|unavailable|idle|fresh')
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('12. logout', () => {
  const LogoutButton = () => {
    const { logout } = useAuth()
    return <button type="button" onClick={() => logout().then((r) => { document.title = r.error ? 'logout failed' : 'logged out' })}>Log out</button>
  }
  const renderWithLogout = () => render(<AuthProvider><MemoryRouter><Probe /><LogoutButton /></MemoryRouter></AuthProvider>)

  it('a failed sign-out reports the error and leaves the session in place', async () => {
    single.mockResolvedValue(OK('official'))
    supabase.auth.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    renderWithLogout()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(state()).toBe('a|official|ready|idle|fresh'))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(document.title).toBe('logout failed'))
    expect(state()).toBe('a|official|ready|idle|fresh')
  })

  it('a successful sign-out clears the session', async () => {
    single.mockResolvedValue(OK('official'))
    supabase.auth.signOut.mockResolvedValue({ error: null })
    renderWithLogout()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(state()).toBe('a|official|ready|idle|fresh'))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(document.title).toBe('logged out'))
    expect(state()).toBe('-|-|signed_out|idle|fresh')
  })

  it('a thrown sign-out is reported as a failure, not as success', async () => {
    single.mockResolvedValue(OK('official'))
    supabase.auth.signOut.mockRejectedValue(new Error('offline'))
    renderWithLogout()
    fire('SIGNED_IN', 'a')
    await waitFor(() => expect(state()).toBe('a|official|ready|idle|fresh'))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(document.title).toBe('logout failed'))
    expect(state()).toBe('a|official|ready|idle|fresh')
  })
})

describe('13. route isolation', () => {
  const portal = { official: 'Official portal', resident: 'Resident portal', tanod: 'Tanod portal' }
  for (const role of ['official', 'resident', 'tanod']) {
    for (const path of ['/official', '/resident', '/tanod']) {
      const target = path.slice(1)
      it(`a confirmed ${role} visiting ${path} sees ${role === target ? 'that portal' : 'their own portal'}`, async () => {
        single.mockResolvedValue(OK(role))
        renderApp(path)
        fire('SIGNED_IN', 'a')
        expect(await screen.findByText(portal[role])).toBeInTheDocument()
        for (const other of Object.keys(portal).filter((r) => r !== role)) {
          expect(screen.queryByText(portal[other])).toBeNull()
        }
      })
    }
  }

  it('a signed-out visitor is sent to /login from every portal', async () => {
    for (const path of ['/official', '/resident', '/tanod']) {
      const { unmount } = renderApp(path)
      fire('INITIAL_SESSION', null)
      expect(await screen.findByText('Login page')).toBeInTheDocument()
      unmount()
    }
  })
})
