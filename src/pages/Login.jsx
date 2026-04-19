import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt,
  FaUserTie,
  FaUserNurse,
  FaUserCog,
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

const Login = () => {
  const navigate = useNavigate()
  const [role, setRole] = useState('admin')
  const [systemId, setSystemId] = useState('')
  const [securityKey, setSecurityKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Step 1 - Sign in with Supabase
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: systemId,
          password: securityKey,
        })

      if (signInError) {
        setError(
          'Invalid System ID or Security Key. Please try again.'
        )
        setLoading(false)
        return
      }

      // Step 2 - Get role from profiles table
      const { data: profile, error: profileError } =
        await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

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
        if (profile.role === 'admin') {
          navigate('/admin', { replace: true })
        } else if (profile.role === 'official') {
          navigate('/official', { replace: true })
        } else if (profile.role === 'nurse') {
          navigate('/nurse', { replace: true })
        }
      }, 500)

    } catch (err) {
      console.error('Login error:', err)
      setError(
        'Something went wrong. Please try again.'
      )
      setLoading(false)
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

              {/* Role Info */}
              <div className="login-left-roles">
                <div className={`login-left-role-item
                  ${role === 'admin' ? 'active' : ''}`}>
                  <FaUserCog />
                  <div>
                    <span>Admin</span>
                    <p>Full System Access</p>
                  </div>
                </div>
                <div className={`login-left-role-item
                  ${role === 'official' ? 'active' : ''}`}>
                  <FaUserTie />
                  <div>
                    <span>Barangay Official</span>
                    <p>Operations Access</p>
                  </div>
                </div>
                <div className={`login-left-role-item
                  ${role === 'nurse' ? 'active' : ''}`}>
                  <FaUserNurse />
                  <div>
                    <span>Nurse</span>
                    <p>Health Module Access</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="login-left-footer">
              <p>
                © 2024 Barangay Batinguel.
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

              {/* Admin Role */}
              <button
                className={`login-role-btn
                  ${role === 'admin'
                    ? 'active-admin' : ''}`}
                onClick={() => setRole('admin')}
                type="button">
                <FaUserCog />
                Admin
              </button>

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

            </div>

            {/* Selected Role Badge */}
            <div className="login-selected-role">
              {role === 'admin' && (
                <span className="role-badge admin-badge">
                  👨‍💻 Logging in as Admin
                </span>
              )}
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
                  ${role === 'admin'
                    ? 'submit-admin' : ''}
                  ${role === 'official'
                    ? 'submit-official' : ''}
                  ${role === 'nurse'
                    ? 'submit-nurse' : ''}`}
                disabled={loading}>
                <FaShieldAlt />
                {loading
                  ? 'Authenticating...'
                  : 'Authorize Access'}
              </button>

            </form>

            {/* Footer Links */}
            <div className="login-form-footer">
              <a href="#top">Forgot Access?</a>
              <span className="login-divider">|</span>
              <a href="#top">Support Portal</a>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default Login