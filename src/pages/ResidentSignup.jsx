import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaLock, FaEye, FaEyeSlash, FaIdCard } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Login.css'

const ResidentSignup = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    contact_number: '',
    purok: '',
    password: '',
    confirm_password: '',
  })
  const [idFile, setIdFile] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')

    if (!formData.full_name || !formData.email || !formData.password) {
      setError('Please fill in your name, email, and password.')
      return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      // Profile fields are passed as signup metadata so the database
      // trigger (handle_new_resident_signup) can create the profiles
      // row itself, with elevated privileges — this works whether or
      // not this project requires email confirmation. Previously this
      // was a separate client-side insert that failed silently
      // whenever a session wasn't immediately available.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            role: 'resident',
            contact_number: formData.contact_number || null,
            purok: formData.purok || null,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message || 'Could not create your account.')
        setLoading(false)
        return
      }

      if (!data.user) {
        setError('Something went wrong creating your account. Please try again.')
        setLoading(false)
        return
      }

      // If email confirmation is required for this project, signUp()
      // returns a user but NOT an active session — auth.uid() isn't
      // usable yet, so anything requiring RLS (like uploading the ID
      // photo, which needs to write to a path scoped to this user)
      // will fail. Skip it here and let them upload it later from
      // their dashboard once they've confirmed their email and can
      // actually log in.
      if (!data.session) {
        toast.success(
          'Account created! Check your email to confirm your account, then log in. ' +
          (idFile ? 'You can upload your ID from your dashboard after logging in.' : '')
        )
        navigate('/login')
        return
      }

      // ID upload is optional — not everyone has a formal government
      // ID, and requiring one would exclude exactly the residents who
      // most need barangay documents (e.g. for a Certificate of
      // Indigency). If skipped, the account still goes to 'pending'
      // and the official's verification queue shows "No ID uploaded"
      // — they verify identity in person instead (recognizing the
      // resident, checking barangay records, having them visit the
      // hall) rather than being blocked entirely.
      if (idFile) {
        // Path is prefixed with the resident's own user id — the
        // storage RLS policy requires this exact structure. Bucket
        // is private; only this resident and officials can ever
        // view the file (via signed URLs).
        const fileExt = idFile.name.split('.').pop()
        const filePath = `${data.user.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('id-verification')
          .upload(filePath, idFile)

        if (uploadError) {
          console.error('ID upload error:', uploadError)
          toast.error(
            'Account created, but your ID could not be uploaded. You can try again from your dashboard after logging in.'
          )
          navigate('/login')
          return
        }

        const { error: idUrlError } = await supabase
          .from('profiles')
          .update({ id_document_url: filePath })
          .eq('id', data.user.id)

        if (idUrlError) {
          console.error('ID document link error:', idUrlError)
        }

        toast.success('Account created! An official will verify your ID before you can request documents.')
      } else {
        toast.success(
          'Account created! Since no ID was uploaded, please visit the Barangay Hall so an official can verify your account in person.'
        )
      }
      navigate('/login')
    } catch (err) {
      console.error('Resident signup error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
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
              <h2>Create a Resident Account</h2>
              <p>
                Sign up to request barangay documents, check waste
                collection schedules, and stay updated on
                announcements and events. An official verifies your
                account before you can request documents — uploading
                a valid ID speeds this up, but isn't required.
              </p>
            </div>
          </div>

          <div className="login-right">
            <h3>Resident Registration</h3>
            <p>Fill in your details to create your account.</p>

            {error && <div className="login-error">{error}</div>}

            <form className="login-form" onSubmit={handleSignup}>
              <div className="login-form-group">
                <label>Full Name</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaUser /></div>
                  <input
                    type="text"
                    name="full_name"
                    placeholder="Juan Dela Cruz"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label>Email</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaEnvelope /></div>
                  <input
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label>Contact Number</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaPhone /></div>
                  <input
                    type="tel"
                    name="contact_number"
                    placeholder="09xx xxx xxxx"
                    value={formData.contact_number}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label>Purok</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaMapMarkerAlt /></div>
                  <input
                    type="text"
                    name="purok"
                    placeholder="e.g. Purok 3"
                    value={formData.purok}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label>Password</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaLock /></div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="At least 6 characters"
                    value={formData.password}
                    onChange={handleChange}
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
                <label>Confirm Password</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaLock /></div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirm_password"
                    placeholder="Re-enter your password"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label>Valid ID (optional, but speeds up verification)</label>
                <div className="login-input-wrapper">
                  <div className="login-input-icon"><FaIdCard /></div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                    style={{ padding: '10px 0' }}
                  />
                </div>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                  A photo of any valid government or barangay-issued ID, if you
                  have one. Don't have an ID? You can skip this and visit the
                  Barangay Hall so an official can verify you in person instead.
                </p>
              </div>

              <button
                type="submit"
                className="login-submit-btn submit-resident"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            <div className="login-form-footer" style={{ justifyContent: 'center', gap: 6 }}>
              <span>Already have an account?</span>
              <Link to="/login">Log in</Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default ResidentSignup
