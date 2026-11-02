import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { classifyRoleLookup, ROLE_RETRY_DELAYS_MS } from '../utils/roleLookup'

const AuthContext = createContext()

// roleStatus says what the app knows about the signed-in account's role:
//   'loading'      the session is known and the first role lookup has not answered
//   'ready'        the database confirmed a supported role (roleStale: kept through
//                  a dropped connection while a newer answer is retried)
//   'unsupported'  the database answered: no profile, or a role no portal serves
//   'unavailable'  the lookup could not be completed and no role is confirmed
//   'signed_out'   there is no session
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [roleStatus, setRoleStatus] = useState('loading')
  const [roleStale, setRoleStale] = useState(false)
  const [loading, setLoading] = useState(true)

  // Refs, so the auth callback can stay synchronous and every async answer can be
  // checked against the CURRENT state rather than the state it started from.
  const userIdRef = useRef(null)     // the session's user id, set inside the callback
  const confirmedRef = useRef(null)  // { userId, role } the database last confirmed
  const seqRef = useRef(0)           // bumped by every lookup, sign-out and user change
  const timerRef = useRef(null)      // the one pending lookup or retry
  const attemptRef = useRef(0)       // automatic retries used in this failure episode
  const inFlightRef = useRef(false)
  const recoveringRef = useRef(false)
  const mountedRef = useRef(false)
  const lookupRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const schedule = (delay) => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      lookupRef.current()
    }, delay)
  }

  // Forget everything about the previous account, synchronously. Any lookup still in
  // flight carries an old sequence number and is discarded when it returns.
  const forgetAccount = useCallback(() => {
    seqRef.current += 1
    inFlightRef.current = false
    recoveringRef.current = false
    attemptRef.current = 0
    confirmedRef.current = null
    clearTimer()
  }, [clearTimer])

  const resetToSignedOut = useCallback(() => {
    userIdRef.current = null
    forgetAccount()
    setUser(null)
    setRole(null)
    setRoleStale(false)
    setRoleStatus('signed_out')
    setLoading(false)
  }, [forgetAccount])

  const apply = (userId, outcome) => {
    if (outcome.kind === 'role') {
      confirmedRef.current = { userId, role: outcome.role }
      recoveringRef.current = false
      attemptRef.current = 0
      setRole(outcome.role)
      setRoleStale(false)
      setRoleStatus('ready')
      setLoading(false)
      return
    }
    if (outcome.kind === 'unsupported' || outcome.kind === 'missing') {
      // A definitive answer: revoke at once, whatever was confirmed before.
      confirmedRef.current = null
      recoveringRef.current = false
      attemptRef.current = 0
      setRole(null)
      setRoleStale(false)
      setRoleStatus('unsupported')
      setLoading(false)
      return
    }
    // No answer. Only a TRANSIENT failure may keep a role, and only the role the
    // database confirmed for this same user. A refused token never keeps one.
    if (outcome.kind !== 'transient') confirmedRef.current = null
    const kept = confirmedRef.current && confirmedRef.current.userId === userId
      ? confirmedRef.current.role
      : null
    recoveringRef.current = true
    setRole(kept)
    setRoleStale(Boolean(kept))
    setRoleStatus(kept ? 'ready' : 'unavailable')
    setLoading(false)
    const i = attemptRef.current
    if (i < ROLE_RETRY_DELAYS_MS.length) {
      attemptRef.current = i + 1
      schedule(ROLE_RETRY_DELAYS_MS[i])
    }
  }

  lookupRef.current = async () => {
    const userId = userIdRef.current
    if (!userId || !mountedRef.current) return
    clearTimer()
    const seq = ++seqRef.current
    inFlightRef.current = true
    let result
    try {
      result = await supabase.from('profiles').select('role').eq('id', userId).single()
    } catch (error) {
      result = { data: null, error: { message: String(error?.message || error) }, status: 0 }
    }
    // Superseded by a newer lookup, a sign-out or another account: discard.
    if (seq !== seqRef.current) return
    inFlightRef.current = false
    if (!mountedRef.current || userIdRef.current !== userId) return
    apply(userId, classifyRoleLookup(result))
  }

  // Retry now: the Retry button, the browser coming back online, the tab becoming
  // visible. Starts a fresh bounded episode; never runs two lookups at once.
  const retryRole = useCallback(() => {
    if (!userIdRef.current || inFlightRef.current) return
    attemptRef.current = 0
    lookupRef.current()
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // IMPORTANT: this used to ALSO call supabase.auth.getSession()
    // directly (via a separate checkUser() function) alongside this
    // onAuthStateChange subscription. That was the actual bug behind
    // the app-wide hangs/"Auth check timed out" errors: onAuthStateChange
    // already fires once immediately with the current session the
    // moment you subscribe (Supabase's documented behavior), so the
    // extra getSession() call was a second, redundant request racing
    // the first one for the same browser-wide auth lock on every
    // single page load — and since AuthProvider wraps the whole app,
    // that meant every request through the shared Supabase client
    // (including plain public table reads with no auth involved,
    // like the public Waste Management schedule) queued up behind
    // that stuck lock too. Removing the duplicate call removes the
    // contention entirely — there's now only ever one request.
    //
    // ⚠️ AND THE CALLBACK MUST NOT AWAIT A SUPABASE CALL. auth-js awaits every
    // callback, and a query needs getSession(), which waits for auth-js to finish
    // initializing. When a stored session has expired, initialization refreshes the
    // token and then notifies TOKEN_REFRESHED and waits for this callback, so an
    // awaited role query here waits on initialization while initialization waits on
    // it: the whole app, public pages included, hangs. The callback therefore only
    // records the session and SCHEDULES the lookup (setTimeout), which runs after
    // the callback has returned. Do not add getSession() here either.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (!nextUser) {
        resetToSignedOut()
        return
      }
      if (userIdRef.current !== nextUser.id) {
        // A different account: nothing about the previous one carries over.
        userIdRef.current = nextUser.id
        forgetAccount()
        setRole(null)
        setRoleStale(false)
        setRoleStatus('loading')
        setLoading(true)
      }
      setUser(nextUser)
      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED and USER_UPDATED all re-read the
      // role, so a revocation is picked up at the next auth event.
      schedule(0)
    })

    const recoverIfNeeded = () => {
      if (recoveringRef.current) retryRole()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') recoverIfNeeded()
    }
    window.addEventListener('online', recoverIfNeeded)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mountedRef.current = false
      seqRef.current += 1
      clearTimer()
      subscription.unsubscribe()
      window.removeEventListener('online', recoverIfNeeded)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Subscribe ONCE. Every listed dependency is stable. `schedule` reads only refs and
    // is deliberately left out: listing it would resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToSignedOut, retryRole, forgetAccount, clearTimer])

  // Logout succeeds only when Supabase says it did. On failure the session is still
  // in storage, so clearing the screen would show a signed-out page that a reload
  // signs straight back in. SIGNED_OUT also clears, through the callback above.
  const logout = useCallback(async () => {
    let error = null
    try {
      ({ error } = await supabase.auth.signOut())
    } catch (thrown) {
      error = thrown
    }
    if (error) return { error }
    resetToSignedOut()
    return { error: null }
  }, [resetToSignedOut])

  return (
    <AuthContext.Provider value={{ user, role, roleStatus, roleStale, loading, logout, retryRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
