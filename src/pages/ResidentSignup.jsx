import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaLock, FaEye, FaEyeSlash, FaIdCard } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { BARANGAY_NAME, PUROKS } from '../constants/barangay'
import {
  MIN_PASSWORD_LENGTH,
  SIGNUP_STEPS,
  missingAccountMessage,
  missingIdentityMessage,
  passwordChecks,
} from '../utils/signupSteps'
import './Login.css'

const ResidentSignup = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    contact_number: '',
    purok: '',
    password: '',
    confirm_password: '',
  })
  // Not stored. It is an on-the-record declaration at the moment of
  // signing up, which is what the official relies on when they later
  // mark an account ineligible for not being a resident.
  const [confirmsResidency, setConfirmsResidency] = useState(false)
  const [idFile, setIdFile] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // ⚠️ Four steps over ONE `formData`, so Back never clears anything --
  // the fields are hidden, not unmounted. The reason it is steps at all
  // is that one long form told somebody entering their SURNAME that
  // their password was too short.
  //   1 about you   2 your login   3 confirm   4 done
  const [step, setStep] = useState(1)
  // What actually happened, set once the account exists. Step 4 reads
  // it, because "check your email" and "your ID is uploaded" are
  // different things to be told and the old code said them in a toast
  // on a page that was navigating away.
  const [outcome, setOutcome] = useState(null)

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const goToStep = (target) => {
    setError('')
    setStep(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleContinueFromIdentity = () => {
    const missing = missingIdentityMessage(formData)
    if (missing) {
      setError(missing)
      return
    }
    goToStep(2)
  }

  const handleContinueFromAccount = () => {
    const missing = missingAccountMessage(formData)
    if (missing) {
      setError(missing)
      return
    }
    goToStep(3)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')

    // ⚠️ Re-checked here even though steps 1 and 2 already passed. This
    // is the handler that creates an account, and the step index is
    // client state: a check at the gate is not a check at the door.
    const missingIdentity = missingIdentityMessage(formData)
    if (missingIdentity) {
      setError(missingIdentity)
      goToStep(1)
      return
    }
    const missingAccount = missingAccountMessage(formData)
    if (missingAccount) {
      setError(missingAccount)
      goToStep(2)
      return
    }
    if (!confirmsResidency) {
      setError(`Please confirm that you are a resident of ${BARANGAY_NAME}.`)
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
            // The parts are what the profile is built from. full_name
            // goes along as a fallback for the unlikely case that the
            // parts never arrive; trg_compose_full_name overwrites it
            // from the parts whenever they are present, so the two
            // cannot end up disagreeing.
            first_name: formData.first_name.trim(),
            middle_name: formData.middle_name.trim() || null,
            last_name: formData.last_name.trim(),
            suffix: formData.suffix.trim() || null,
            full_name: [
              formData.first_name.trim(),
              formData.middle_name.trim(),
              formData.last_name.trim(),
              formData.suffix.trim(),
            ].filter(Boolean).join(' '),
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
      // This project REQUIRES email confirmation, so signUp() returns a
      // user and NO session -- `auth.uid()` is not usable yet, and
      // anything behind RLS (the ID upload writes to a path scoped to
      // this user) would fail. So this is the ordinary path, not the
      // exception, and the ID waits until they can actually log in.
      if (!data.session) {
        setOutcome({
          needsConfirmation: true,
          email: formData.email,
          idPending: !!idFile,
          idUploaded: false,
        })
        goToStep(4)
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
          // ⚠️ The ACCOUNT exists. Only the upload failed, and saying
          // so is not the same as saying signing up failed.
          toast.error('Your account was created, but the ID could not be uploaded.')
          setOutcome({
            needsConfirmation: false,
            email: formData.email,
            idPending: true,
            idUploaded: false,
          })
          goToStep(4)
          return
        }

        const { error: idUrlError } = await supabase
          .from('profiles')
          .update({ id_document_url: filePath })
          .eq('id', data.user.id)

        if (idUrlError) {
          console.error('ID document link error:', idUrlError)
        }

        setOutcome({
          needsConfirmation: false,
          email: formData.email,
          idPending: false,
          idUploaded: true,
        })
      } else {
        setOutcome({
          needsConfirmation: false,
          email: formData.email,
          idPending: false,
          idUploaded: false,
        })
      }
      toast.success('Account created.')
      goToStep(4)
    } catch (err) {
      console.error('Resident signup error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const checks = passwordChecks(formData.password)
  const fullNamePreview = [
    formData.first_name, formData.middle_name, formData.last_name, formData.suffix,
  ].map((part) => part.trim()).filter(Boolean).join(' ')

  const stepIntro = {
    1: 'Your name and where you live, as they appear on your valid ID.',
    2: 'The email and password you will sign in with.',
    3: 'Check your details, add an ID if you have one, and confirm.',
  }

  return (
    <div className="login-page">
      <Navbar />

      <main className="login-container" id="main-content" tabIndex={-1}>
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
              <h1>Create a Resident Account</h1>
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
            {step === 4 ? (
              /* ─── STEP 4 ─ DONE ────────────────────────────────────
                 ⚠️ A PANEL, not a toast on a page that is navigating
                 away. What happens next to a new account is three
                 separate things -- confirm the email, sign in, wait for
                 an official to verify -- and the old flow said all of
                 them in one toast while pushing the reader to /login,
                 where the toast then sat over a form that could not
                 yet be used. */
              <div className="signup-done">
                <p className="signup-done-eyebrow">
                  <span aria-hidden="true">✓</span> Account created
                </p>
                <h2>Two things left before you can request documents</h2>

                <ol className="signup-next-steps">
                  {outcome?.needsConfirmation && (
                    <li>
                      <strong>Confirm your email.</strong> A confirmation link
                      has been sent to{' '}
                      <strong>{outcome?.email}</strong>. The account cannot be
                      used until it is clicked, and the message often lands in
                      the spam folder — look there before asking the barangay.
                    </li>
                  )}
                  <li>
                    <strong>Wait for an official to verify you.</strong> A new
                    account starts as <em>Awaiting review</em>. Signing in works
                    straight away, and so does booking the covered court — but
                    requesting a barangay document needs a verified account.
                  </li>
                </ol>

                {/* ⚠️ The ID is the one part of this that is OPTIONAL by
                    design, and saying so matters: requiring one would
                    exclude exactly the residents who most need barangay
                    documents, such as a Certificate of Indigency. */}
                <div className="signup-id-status">
                  {outcome?.idUploaded ? (
                    <p>
                      Your ID has been uploaded. An official reviews it — you do
                      not need to visit the hall unless they ask you to.
                    </p>
                  ) : outcome?.idPending ? (
                    <p>
                      Your ID has <strong>not</strong> been uploaded yet. You can
                      add it from your dashboard once you have signed in, or
                      bring it to the Barangay Hall.
                    </p>
                  ) : (
                    <p>
                      No ID was uploaded, which is fine — not everyone has one.
                      An official will verify you in person instead. Visit the
                      Barangay Hall during office hours, or add an ID later from
                      your dashboard.
                    </p>
                  )}
                </div>

                <p className="signup-done-note">
                  You will see your account's status in your own dashboard, in
                  the same words an official sees it.
                </p>

                <div className="signup-actions">
                  <button
                    type="button"
                    className="login-submit-btn submit-resident"
                    onClick={() => navigate('/login')}
                  >
                    Go to sign in
                  </button>
                  <Link to="/e-services" className="login-submit-btn signup-btn-plain">
                    Browse E-Services
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <h2>Resident Registration</h2>
                <p>
                  For residents of <strong>{BARANGAY_NAME}</strong> only. Fill in
                  your details as they appear on your valid ID.
                </p>

                {/* The steps. An ordered list, because they are a
                    sequence; `aria-current="step"` says where the person
                    is, and the tick is decorative. */}
                <ol className="signup-steps" aria-label="Sign-up progress">
                  {SIGNUP_STEPS.map((entry, index) => {
                    const number = index + 1
                    const state = number === step
                      ? 'is-current'
                      : number < step ? 'is-done' : 'is-todo'
                    return (
                      <li
                        key={entry.key}
                        className={`signup-step ${state}`}
                        aria-current={number === step ? 'step' : undefined}
                      >
                        <span className="signup-step-num" aria-hidden="true">
                          {number < step ? '✓' : number}
                        </span>
                        <span className="signup-step-label">
                          <span className="visually-hidden">
                            {number < step
                              ? 'Completed: '
                              : number === step ? 'Current step: ' : 'Not started: '}
                          </span>
                          {entry.label}
                        </span>
                      </li>
                    )
                  })}
                </ol>

                <p className="signup-step-intro">
                  Step {step} of 3 — {stepIntro[step]}
                </p>

                {error && <div className="login-error" role="alert">{error}</div>}

                <form
                  className="login-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (step === 1) return handleContinueFromIdentity()
                    if (step === 2) return handleContinueFromAccount()
                    return handleSignup(e)
                  }}
                >
                  {/* ─── STEP 1 ─ ABOUT YOU ───────────────────────── */}
                  {step === 1 && (
                    <>
                      <div className="login-form-group">
                        <label htmlFor="signup-first_name">First Name</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaUser /></div>
                          <input id="signup-first_name"
                            type="text"
                            name="first_name"
                            placeholder="Juan"
                            value={formData.first_name}
                            onChange={handleChange}
                            required
                          />
                        </div>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-middle_name">Middle Name <span className="field-optional">(optional)</span></label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaUser /></div>
                          <input id="signup-middle_name"
                            type="text"
                            name="middle_name"
                            placeholder="Santos"
                            value={formData.middle_name}
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-last_name">Last Name</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaUser /></div>
                          <input id="signup-last_name"
                            type="text"
                            name="last_name"
                            placeholder="Dela Cruz"
                            value={formData.last_name}
                            onChange={handleChange}
                            required
                          />
                        </div>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-suffix">Suffix <span className="field-optional">(optional)</span></label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaUser /></div>
                          <input id="signup-suffix"
                            type="text"
                            name="suffix"
                            placeholder="Jr., Sr., III"
                            value={formData.suffix}
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-contact_number">Contact Number</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaPhone /></div>
                          <input id="signup-contact_number"
                            type="tel"
                            name="contact_number"
                            placeholder="09xx xxx xxxx"
                            value={formData.contact_number}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <p className="field-hint">
                          How the barangay reaches you about a request.
                        </p>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-purok">Purok</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaMapMarkerAlt /></div>
                          <select id="signup-purok"
                            name="purok"
                            value={formData.purok}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select your purok</option>
                            {PUROKS.map((purok) => (
                              <option key={purok} value={purok}>{purok}</option>
                            ))}
                          </select>
                        </div>
                        <p className="field-hint">
                          Only puroks within {BARANGAY_NAME} are listed. If you live in
                          another barangay, request your documents from that barangay
                          instead.
                        </p>
                      </div>
                    </>
                  )}

                  {/* ─── STEP 2 ─ YOUR LOGIN ──────────────────────── */}
                  {step === 2 && (
                    <>
                      <div className="login-form-group">
                        <label htmlFor="signup-email">Email</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaEnvelope /></div>
                          <input id="signup-email"
                            type="email"
                            name="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <p className="field-hint">
                          This is also your username. The barangay sends a
                          confirmation link here, and the account cannot be used
                          until it is clicked — so use an address you can open.
                        </p>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-password">Password</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaLock /></div>
                          <input id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                            value={formData.password}
                            onChange={handleChange}
                            required
                          />
                          <button
                            type="button"
                            className="login-toggle-password"
                            aria-pressed={showPassword}
                            aria-label={showPassword ? 'Hide the password' : 'Show the password'}
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <FaEyeSlash /> : <FaEye />}
                          </button>
                        </div>

                        {/* ⚠️ ONE of these blocks and two are advice, and
                            the list says which is which in words rather
                            than only in colour. A rule that rejects a
                            long passphrase for having no digit makes
                            passwords worse, not better. */}
                        <ul className="signup-password-checks">
                          {checks.map((check) => (
                            <li
                              key={check.id}
                              className={check.met ? 'is-met' : 'is-unmet'}
                            >
                              <span aria-hidden="true">{check.met ? '✓' : '•'}</span>
                              <span>
                                {check.label}
                                {check.required ? ' (required)' : ' (suggested)'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="login-form-group">
                        <label htmlFor="signup-confirm_password">Confirm Password</label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaLock /></div>
                          <input id="signup-confirm_password"
                            type={showPassword ? 'text' : 'password'}
                            name="confirm_password"
                            placeholder="Re-enter your password"
                            value={formData.confirm_password}
                            onChange={handleChange}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ─── STEP 3 ─ CONFIRM ─────────────────────────── */}
                  {step === 3 && (
                    <>
                      <dl className="signup-review">
                        <div className="signup-review-row">
                          <dt>Name</dt>
                          <dd>{fullNamePreview}</dd>
                        </div>
                        <div className="signup-review-row">
                          <dt>Purok</dt>
                          <dd>{formData.purok}</dd>
                        </div>
                        <div className="signup-review-row">
                          <dt>Contact number</dt>
                          <dd>{formData.contact_number}</dd>
                        </div>
                        <div className="signup-review-row">
                          <dt>Email</dt>
                          <dd>{formData.email}</dd>
                        </div>
                      </dl>

                      <div className="login-form-group">
                        <label htmlFor="signup-valid-id">
                          Valid ID <span className="field-optional">(optional)</span>
                        </label>
                        <div className="login-input-wrapper">
                          <div className="login-input-icon"><FaIdCard /></div>
                          <input id="signup-valid-id"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                            style={{ padding: '10px 0' }}
                          />
                        </div>
                        <p className="field-hint">
                          A photo of any valid government or barangay-issued ID,
                          if you have one. JPEG, PNG or WebP, up to 5 MB — a
                          phone photo is fine. It is stored privately and is
                          seen only by you and by barangay officials.
                        </p>
                        <p className="field-hint">
                          Don't have an ID? Skip this. Uploading one speeds
                          verification up; it is not required, because requiring
                          it would shut out the residents who most need barangay
                          documents.
                        </p>
                      </div>

                      {/* Last thing before the button, so it is read after the
                          details have been entered rather than skimmed past at
                          the top. Not stored as a column: it is a declaration
                          made at signup, and what an official relies on when
                          they later mark an account ineligible for not being a
                          resident. The account record and the activity log
                          carry that decision. */}
                      <label className="residency-confirm">
                        <input
                          type="checkbox"
                          checked={confirmsResidency}
                          onChange={(e) => setConfirmsResidency(e.target.checked)}
                        />
                        <span>
                          I certify that I am a resident of {BARANGAY_NAME}, Dumaguete
                          City, and that the details above are true and correct.
                        </span>
                      </label>
                    </>
                  )}

                  <div className="signup-actions">
                    {step > 1 && (
                      <button
                        type="button"
                        className="login-submit-btn signup-btn-secondary"
                        onClick={() => goToStep(step - 1)}
                        disabled={loading}
                      >
                        ← Back
                      </button>
                    )}
                    <button
                      type="submit"
                      className="login-submit-btn submit-resident"
                      disabled={loading}
                    >
                      {loading
                        ? 'Creating Account...'
                        : step === 3 ? 'Create Account' : 'Continue →'}
                    </button>
                  </div>
                </form>

                <div className="login-form-footer" style={{ justifyContent: 'center', gap: 6 }}>
                  <span>Already have an account?</span>
                  <Link to="/login">Log in</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default ResidentSignup
