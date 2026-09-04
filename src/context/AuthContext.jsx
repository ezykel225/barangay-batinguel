import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchRole = useCallback(async (userId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (data) setRole(data.role)
    } catch (error) {
      console.error('Role error:', error)
    }
  }, [])

  useEffect(() => {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user)
          await fetchRole(session.user.id)
        } else {
          setUser(null)
          setRole(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchRole])

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    if (data.user) {
      setUser(data.user)
      await fetchRole(data.user.id)
    }

    return data
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
