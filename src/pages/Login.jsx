import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  FaShieldAlt,
  FaUserTie,
  FaUserNurse,
  FaUser,
  FaIdCard,
  FaKey,
  FaEye,
  FaEyeSlash,
  FaLock,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Login.css'

// Supabase's browser auth lock is shared across ALL tabs of this
// origin, not per-tab. With multiple tabs open, one tab's auth call
// can forcibly "steal" the lock mid-operation from another tab's
// in-flight request, leaving that request neither resolved nor
// rejected — just hung forever. Racing every auth call against a
// timeout means a hung request surfaces as a clear, recoverable
// error instead of an infinite "Authenticating..." spinner.
const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])

const LOCK_TIMEOUT_MESSAGE =
  'This is taking too long — if you have this app open in another browser tab, please close it and try again.'

const Login = () => {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [role, setRole] = useState('official')
  const [systemId, setSystemId] = useState('')
  const [securityKey, setSecurityKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Step 1 - Sign in with Supabase
      const { data, error: signInError } =
        await withTimeout(
          supabase.auth.signInWithPassword({
            email: systemId,
            password: securityKey,
          }),
          15000,
          LOCK_TIMEOUT_MESSAGE
        )

      if (signInError) {
        // Surface the specific "email not confirmed" case distinctly —
        // this project requires email confirmation, and lumping it in
        // with generic wrong-password errors makes it look like a
        // typo when it's actually a totally different, fixable step
        // (check your inbox) rather than wrong credentials.
        if (signInError.message?.toLowerCase().includes('confirm')) {
          setError(
            'Please confirm your email first — check your inbox (and spam folder) for a confirmation link from Supabase.'
          )
        } else {
          setError(
            'Invalid System ID or Security Key. Please try again.'
          )
        }
        setLoading(false)
        return
      }

      // Step 2 - Get role from profiles table
      const { data: profile, error: profileError } =
        await withTimeout(
          supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single(),
          15000,
          LOCK_TIMEOUT_MESSAGE
        )

      if (profileError || !profile) {
        setError('Profile not found. Please contact admin.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // Step 3 - Check if role matches
      if (profile.role !== role) {
        setError(
          'Invalid role selected. Please select the correct role.'
        )
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // Step 4 - Redirect based on role
      toast.success('Login successful! Welcome back!')

      setTimeout(() => {
        if (profile.role === 'official') {
          navigate('/official', { replace: true })
        } else if (profile.role === 'nurse') {
          navigate('/nurse', { replace: true })
        } else if (profile.role === 'resident') {
          // Residents are citizens browsing a public site who happen to
          // have an account — not staff logging in to use an internal
          // tool. Send them back to Home like anyone else; the navbar
          // now shows their profile button in place of "Login" so they
          // can reach their dashboard whenever they actually want it.
          navigate('/', { replace: true })
        }
      }, 500)

    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const handleForgotAccess = async (e) => {
    e.preventDefault()
    if (forgotLoading) return
    if (!forgotEmail) {
      toast.error('Please enter your System ID (email).')
      return
    }

    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        console.error('Password reset error:', error)
        toast.error(error.message || 'Could not send reset link.')
      } else {
        toast.success('If that account exists, a reset link has been sent.')
        setShowForgotModal(false)
        setForgotEmail('')
      }
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="login-page">

      {/* Navbar */}
      <Navbar />

      {/* Login Container */}
      <div className="login-container">
        <div className="login-box">

          {/* Left Panel */}
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
              <h2>Portal Authentication</h2>
              <p>
                Please verify your identity to
                proceed to your workstation.
              </p>
            </div>

            <div className="login-left-footer">
              <p>
                © {currentYear} Barangay Batinguel.
                All Rights Reserved.
              </p>
            </div>
          </div>

          {/* Right Panel */}
          <div className="login-right">
            <h3>Portal Authentication</h3>
            <p>
              Please verify your identity to proceed
              to your workstation.
            </p>

            {/* Error Message */}
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            {/* Role Selection */}
            <div className="login-role-label">
              Authorized Role
            </div>
            <div className="login-role-buttons">

              {/* Official Role */}
              <button
                className={`login-role-btn
                  ${role === 'official'
                    ? 'active-official' : ''}`}
                onClick={() => setRole('official')}
                type="button">
                <FaUserTie />
                Official
              </button>

              {/* Nurse Role */}
              <button
                className={`login-role-btn
                  ${role === 'nurse'
                    ? 'active-nurse' : ''}`}
                onClick={() => setRole('nurse')}
                type="button">
                <FaUserNurse />
                Nurse
              </button>

              {/* Resident Role */}
              <button
                className={`login-role-btn
                  ${role === 'resident'
                    ? 'active-resident' : ''}`}
                onClick={() => setRole('resident')}
                type="button">
                <FaUser />
                Resident
              </button>

            </div>

            {/* Selected Role Badge */}
            <div className="login-selected-role">
              {role === 'official' && (
                <span className="role-badge official-badge">
                  👮 Logging in as Barangay Official
                </span>
              )}
              {role === 'nurse' && (
                <span className="role-badge nurse-badge">
                  💉 Logging in as Nurse
                </span>
              )}
              {role === 'resident' && (
                <span className="role-badge resident-badge">
                  🏠 Logging in as Resident
                </span>
              )}
            </div>

            {/* Login Form */}
            <form
              className="login-form"
              onSubmit={handleLogin}>

              {/* System ID */}
              <div className="login-form-group">
                <label>System ID</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon">
                    <FaIdCard />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter your email"
                    value={systemId}
                    onChange={(e) =>
                      setSystemId(e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* Security Key */}
              <div className="login-form-group">
                <label>Security Key</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon">
                    <FaKey />
                  </div>
                  <input
                    type={showPassword
                      ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={securityKey}
                    onChange={(e) =>
                      setSecurityKey(e.target.value)
                    }
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle-password"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }>
                    {showPassword
                      ? <FaEyeSlash />
                      : <FaEye />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={`login-submit-btn
                  ${role === 'official'
                    ? 'submit-official' : ''}
                  ${role === 'nurse'
                    ? 'submit-nurse' : ''}
                  ${role === 'resident'
                    ? 'submit-resident' : ''}`}
                disabled={loading}>
                <FaShieldAlt />
                {loading
                  ? 'Authenticating...'
                  : 'Authorize Access'}
              </button>

            </form>

            {role === 'resident' && (
              <div className="login-form-footer" style={{ justifyContent: 'center', gap: 6 }}>
                <span>Don't have an account?</span>
                <Link to="/signup">Sign up</Link>
              </div>
            )}

            {/* Footer Links */}
            <div className="login-form-footer">
              <button
                type="button"
                className="login-link-btn"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot Access?
              </button>
              <span className="login-divider">|</span>
              <button
                type="button"
                className="login-link-btn"
                onClick={() => setShowSupportModal(true)}
              >
                Support Portal
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Forgot Access Modal */}
      {showForgotModal && (
        <div className="login-modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Your Access</h3>
            <p>
              Enter the System ID (email) tied to your official or nurse
              account. We'll send a password reset link to it.
            </p>
            <form onSubmit={handleForgotAccess}>
              <input
                type="email"
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <div className="login-modal-actions">
                <button
                  type="button"
                  className="login-modal-cancel"
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="login-modal-confirm"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Support Portal Modal */}
      {showSupportModal && (
        <div className="login-modal-overlay" onClick={() => setShowSupportModal(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Support Portal</h3>
            <p>
              For account access issues that a reset link can't fix,
              contact the Barangay Batinguel administrator directly:
            </p>
            <ul className="login-support-list">
              <li>Visit the Barangay Hall during office hours</li>
              <li>Ask the assigned administrator to verify or reset your account</li>
            </ul>
            <div className="login-modal-actions">
              <button
                type="button"
                className="login-modal-confirm"
                onClick={() => setShowSupportModal(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default Login