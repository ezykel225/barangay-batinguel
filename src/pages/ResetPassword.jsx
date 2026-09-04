import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaLock, FaEye, FaEyeSlash, FaShieldAlt } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Login.css'

const ResetPassword = () => {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // The reset email links here with access/refresh tokens in the URL
    // hash (e.g. #access_token=...&refresh_token=...&type=recovery).
    // The app's Supabase client has detectSessionInUrl disabled
    // globally (see supabaseClient.js — that's deliberate, to avoid
    // auto-login side effects on every page load elsewhere), so this
    // page parses and establishes the session manually, only here,
    // only for this specific recovery flow.
    const establishRecoverySession = async () => {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')

      if (!accessToken || !refreshToken || type !== 'recovery') {
        setLinkInvalid(true)
        return
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        console.error('Recovery session error:', sessionError)
        setLinkInvalid(true)
        return
      }

      setReady(true)
    }

    establishRecoverySession()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setError(updateError.message || 'Could not update your password.')
        setLoading(false)
        return
      }

      toast.success('Password updated! You can now log in with your new password.')
      // Sign out the temporary recovery session so they log in fresh
      // through the normal flow, with the correct role selected.
      await supabase.auth.signOut()
      navigate('/login')
    } catch (err) {
      console.error('Password update error:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Navbar />

      <div className="login-container">
        <div className="login-box">
          <div className="login-left">
            <div className="login-left-logo">
              <div className="login-left-logo-icon">
                <img
                  src={require('../assets/images/logo.png')}
                  alt="Barangay Batinguel Logo"
                />
              </div>
              <div className="login-left-logo-text">
                <span>Barangay Batinguel</span>
                <span>E-System</span>
              </div>
            </div>

            <div className="login-left-content">
              <div className="login-left-badge">
                <FaLock />
                Secure Gateway Access
              </div>
              <h2>Reset Your Password</h2>
              <p>Choose a new password for your account.</p>
            </div>
          </div>

          <div className="login-right">
            <h3>Set New Password</h3>

            {linkInvalid ? (
              <>
                <div className="login-error">
                  This reset link is invalid or has expired. Reset links
                  can only be used once — request a new one from the
                  login page.
                </div>
                <button
                  type="button"
                  className="login-submit-btn submit-official"
                  onClick={() => navigate('/login')}
                  style={{ marginTop: 16 }}
                >
                  Back to Login
                </button>
              </>
            ) : !ready ? (
              <p style={{ color: '#6b7280', fontSize: 14 }}>Verifying your reset link...</p>
            ) : (
              <>
                <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
                  Enter a new password below.
                </p>

                {error && <div className="login-error">{error}</div>}

                <form className="login-form" onSubmit={handleSubmit}>
                  <div className="login-form-group">
                    <label>New Password</label>
                    <div className="login-input-wrapper">
                      <div className="login-input-icon"><FaLock /></div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="login-toggle-password"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>

                  <div className="login-form-group">
                    <label>Confirm New Password</label>
                    <div className="login-input-wrapper">
                      <div className="login-input-icon"><FaLock /></div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Re-enter your new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="login-submit-btn submit-official"
                    disabled={loading}
                  >
                    <FaShieldAlt />
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default ResetPassword
