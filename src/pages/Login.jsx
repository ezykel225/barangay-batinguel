import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  FaShieldAlt,
  FaUserTie,
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
import { useModalA11y } from '../components/useModalA11y'
import { safeReturnTo } from '../utils/returnTo'
import {
  BARANGAY_CONTACT,
  BARANGAY_OFFICE_HOURS,
  telHref,
} from '../constants/barangay'

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

// ⚠️ PRESENTATION ONLY. This picks which heading, help text and sign-up
// prompt the form shows -- nothing else. It is NOT a role, it does not
// reach the database, and it grants nothing: where somebody lands is
// decided entirely by `profiles.role`, read back after Supabase has
// authenticated them, and what they may then see is decided by
// ProtectedRoute and RLS.
//
// It REPLACED a three-button Official / Nurse / Resident picker that
// looked like a privilege switch and behaved worse than one: the form
// compared the chosen button against `profiles.role` and, on a
// mismatch, signed the person back out with "Invalid role selected.
// Please select the correct role." So a resident who had correctly
// typed their own email and password was told their credentials were a
// role error. The check never protected anything -- it ran AFTER
// `signInWithPassword` had already succeeded, and the real control was
// always RLS -- so removing it takes nothing away.
//
// Resident is first and is the default, because this is a public
// barangay website: almost everyone signing in is a resident, and
// staff know they are staff.
const AUDIENCES = [
  {
    id: 'resident',
    label: 'Resident',
    heading: 'Sign in',
    help: 'Use the email and password you signed up with.',
  },
  {
    id: 'staff',
    label: 'Barangay Staff',
    heading: 'Staff sign in',
    help: 'For barangay officials and health centre staff. '
      + 'Staff accounts are created by the barangay, not by signing up.',
  },
]

const LOCK_TIMEOUT_MESSAGE =
  'This is taking too long — if you have this app open in another browser tab, please close it and try again.'

const Login = () => {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [params] = useSearchParams()
  // Where to go after a resident signs in, if the link that brought
  // them here asked for somewhere. ⚠️ Resolved through the allowlist in
  // utils/returnTo.js, never used raw -- see that file's header for why
  // a `next` parameter is the classic open-redirect shape.
  const nextPath = safeReturnTo(params.get('next'), '/')
  const [audience, setAudience] = useState('resident')
  const [systemId, setSystemId] = useState('')
  const [securityKey, setSecurityKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  // Escape, focus entry and focus restoration for the reset-password and
  // support boxes. One call for both -- they are mutually exclusive.
  useModalA11y(showForgotModal || showSupportModal, () => {
    setShowForgotModal(false)
    setShowSupportModal(false)
  })

  const currentAudience =
    AUDIENCES.find((entry) => entry.id === audience) || AUDIENCES[0]

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
            'Incorrect email or password. Please try again.'
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

      // ⚠️ Step 3 - Where to go is decided by `profiles.role`, the
      // value the database holds, and by NOTHING the person chose on
      // this page. The tab above picks the wording, not the
      // destination: somebody who clicks Barangay Staff and signs in
      // with a resident account is a resident, and is treated as one
      // rather than told their password was wrong.
      //
      // The role check that used to live here compared the chosen
      // button against `profile.role` and signed the person back out on
      // a mismatch. It ran after `signInWithPassword` had already
      // succeeded, so it never kept anybody out of anything -- RLS did
      // and still does -- and what it produced was a correct password
      // reported as "Invalid role selected."
      toast.success('Signed in.')

      // ⚠️ `next` is honoured for a RESIDENT only. A staff member
      // arriving from an E-Services link would otherwise be sent to a
      // resident-portal path that ProtectedRoute immediately bounces,
      // which reads as a broken login rather than as a wrong link.
      // Staff always go to their own portal.
      const destination = profile.role === 'official'
        ? '/official'
        : profile.role === 'nurse'
          ? '/nurse'
          // Residents are citizens browsing a public site who happen to
          // have an account -- not staff logging in to use an internal
          // tool. Home unless a link asked for somewhere else, and the
          // navbar shows their profile button in place of "Login" so
          // they can reach their dashboard whenever they want it.
          : nextPath

      if (audience === 'staff' && profile.role === 'resident') {
        toast('This is a resident account, so you are signed in as a resident.')
      }

      setTimeout(() => {
        navigate(destination, { replace: true })
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
      toast.error('Please enter your email address.')
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
      <main className="login-container" id="main-content" tabIndex={-1}>
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
              <h1>Log in</h1>
              <p>
                Sign in to request barangay documents and to follow your
                own requests. Barangay staff sign in here too.
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
            {/* The form's own heading, as on the signup and reset pages.
                This used to repeat the left panel's h1 and its sentence
                word for word, which is why only the wording changed
                here rather than the structure. */}
            <h2>{currentAudience.heading}</h2>

            {/* Error Message */}
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            {/* ⚠️ A TAB LIST, not a role picker. `aria-selected` and
                `role="tab"` say what these are: two versions of the
                same form. The three-button Official / Nurse / Resident
                grid that was here looked like a privilege switch, and
                a resident who picked the wrong one was told "Invalid
                role selected" after typing a correct password. See the
                AUDIENCES comment at the top of this file. */}
            <div className="login-audience-tabs" role="tablist" aria-label="Who is signing in">
              {AUDIENCES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`login-tab-${entry.id}`}
                  aria-selected={audience === entry.id}
                  aria-controls="login-panel"
                  className={`login-audience-tab ${audience === entry.id ? 'is-selected' : ''}`}
                  onClick={() => setAudience(entry.id)}
                >
                  {entry.id === 'resident' ? <FaUser /> : <FaUserTie />}
                  {entry.label}
                </button>
              ))}
            </div>

            <p className="login-audience-help">{currentAudience.help}</p>

            {/* Login Form */}
            {/* Login Form */}
            <form
              className="login-form"
              id="login-panel"
              role="tabpanel"
              aria-labelledby={`login-tab-${audience}`}
              onSubmit={handleLogin}>

              {/* Email */}
              <div className="login-form-group">
                <label htmlFor="login-email">Email</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon">
                    <FaIdCard />
                  </div>
                  <input id="login-email"
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

              {/* Password */}
              <div className="login-form-group">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon">
                    <FaKey />
                  </div>
                  <input id="login-password"
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
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide the password' : 'Show the password'}
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
                  ${audience === 'resident' ? 'submit-resident' : 'submit-official'}`}
                disabled={loading}>
                <FaShieldAlt />
                {loading
                  ? 'Logging in...'
                  : 'Log in'}
              </button>

            </form>

            {audience === 'resident' ? (
              <div className="login-signup-prompt">
                <span>Don't have an account?</span>{' '}
                <Link to="/signup">Create a resident account</Link>
                <p className="login-note">
                  Signing up needs an email you can open: the barangay sends a
                  confirmation link, and the account cannot be used until it is
                  clicked. A new account then waits for an official to verify
                  it before documents can be requested.
                </p>
              </div>
            ) : (
              <p className="login-note login-note-standalone">
                Official and health centre accounts are created by the barangay.
                There is no staff sign-up — ask at the Barangay Hall if you need
                one.
              </p>
            )}

            {/* Footer Links */}
            <div className="login-form-footer">
              <button
                type="button"
                className="login-link-btn"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot your password?
              </button>
              <span className="login-divider">|</span>
              <button
                type="button"
                className="login-link-btn"
                onClick={() => setShowSupportModal(true)}
              >
                Help with your account
              </button>
            </div>

          </div>
        </div>
      </main>

      {/* Forgot Access Modal */}
      {showForgotModal && (
        <div className="login-modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="logindlg-1-title">
            <h2 id="logindlg-1-title">Reset your password</h2>
            <p>
              Enter the email address your account uses — resident, official
              or health centre staff. We'll send a password reset link to it.
            </p>
            <p className="login-modal-note">
              The reply is the same whether or not an account exists, so this
              box cannot be used to find out who has one.
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
          <div className="login-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="logindlg-2-title">
            <h2 id="logindlg-2-title">Getting help with your account</h2>
            <p>
              For an account problem a reset link cannot fix, contact the
              barangay directly:
            </p>
            {/* ⚠️ From `constants/barangay.js`, not typed again here.
                This box used to promise "contact the Barangay Batinguel
                administrator directly:" and then give no way to contact
                anybody -- two bullet points telling the reader to go to
                the Barangay Hall, with none of the numbers the footer
                and the Home page were already showing. */}
            <ul className="login-support-list">
              <li>
                Landline:{' '}
                <a href={telHref(BARANGAY_CONTACT.landline)}>
                  {BARANGAY_CONTACT.landline}
                </a>
              </li>
              <li>
                Mobile:{' '}
                <a href={telHref(BARANGAY_CONTACT.mobile)}>
                  {BARANGAY_CONTACT.mobile}
                </a>
              </li>
              <li>{BARANGAY_CONTACT.address}</li>
              <li>
                {BARANGAY_OFFICE_HOURS.days}, {BARANGAY_OFFICE_HOURS.morning}{' '}
                and {BARANGAY_OFFICE_HOURS.afternoon}.{' '}
                {BARANGAY_OFFICE_HOURS.closedNote}.
              </li>
            </ul>
            <p className="login-modal-note">
              Bring a valid ID if you are asking for an account to be verified
              or reset in person.
            </p>
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