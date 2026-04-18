import { createContext, useContext,
  useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkUser()

    // Listen for auth state changes
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (session?.user) {
            setUser(session.user)
            await fetchRole(session.user.id)
          } else {
            setUser(null)
            setRole(null)
          }
        }
      )

    return () => subscription.unsubscribe()
  }, [])

  const checkUser = async () => {
    try {
      const { data } =
        await supabase.auth.getSession()

      if (data?.session?.user) {
        setUser(data.session.user)
        fetchRole(data.session.user.id)
      }
    } catch (error) {
      console.log('Auth error:', error)
    }
  }

  const fetchRole = async (userId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (data) setRole(data.role)
    } catch (error) {
      console.log('Role error:', error)
    }
  }

  const login = async (email, password) => {
    const { data, error } =
      await supabase.auth.signInWithPassword({
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
    <AuthContext.Provider value={{
      user,
      role,
      loading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}