import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import {
  describeTrackedStatus,
  trackingInputProblem,
} from '../utils/reservationTracking'
import './TrackReservation.css'

// Checking on a court booking without an account.
//
// ─── ⚠️ THE LOOKUP IS THE DATABASE'S, NOT THIS PAGE'S ─────────────────
//
// Everything that decides WHAT may be read lives in
// `track_court_reservation()` (migration 025): two factors, a fixed
// narrow column list, `LIMIT 1`, masking done in SQL, and the SAME
// empty result for a wrong reference and a wrong contact number.
// `reservations` has no anonymous SELECT policy and did not get one.
//
// So this page cannot be made to leak more by editing it, and it must
// never be "improved" by fetching the row a second way -- there is no
// second way that is as narrow.
//
// ⚠️ ON A MISS, SAY NOTHING ABOUT WHICH HALF WAS WRONG. "That reference
// does not exist" would confirm which guesses are live, which is the
// thing the two-factor design exists to prevent. One message covers
// both, and it is written to be useful anyway: what to re-check, and
// where to go if the answer is still nothing.

const TrackReservation = () => {
  // ⚠️ A reference may be deep-linked (?ref=...) so the barangay can
  // paste one into a message, but the CONTACT NUMBER never is. Half of
  // a two-factor lookup in a URL is a convenience; both halves in a URL
  // is the lookup itself in browser history, in the referrer header and
  // in anybody's shoulder view.
  const [params] = useSearchParams()
  const [reference, setReference] = useState(params.get('ref') || '')
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)
  // null = nothing looked up yet. The miss case is its own value, so an
  // empty result can be told apart from a page nobody has used -- the
  // same reason the reconciliation panel renders when it finds nothing.
  const [result, setResult] = useState(null)
  const [searched, setSearched] = useState(false)
  const [problem, setProblem] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    const inputProblem = trackingInputProblem(reference, contact)
    if (inputProblem) {
      setProblem(inputProblem)
      setResult(null)
      setSearched(false)
      return
    }
    setProblem('')

    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('track_court_reservation', {
        p_reference: reference,
        p_contact: contact,
      })

      if (error) {
        console.error('Track reservation error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        // ⚠️ A FAILED LOOKUP AND AN EMPTY ONE ARE DIFFERENT FACTS and
        // are said differently. Showing "no booking found" when the
        // request never reached the database tells somebody their
        // booking does not exist, which is the one wrong thing this
        // page can say.
        setProblem(
          'We could not reach the barangay system just now. Please try again in a moment.'
        )
        setResult(null)
        setSearched(false)
        return
      }

      // The function returns a table, so supabase-js hands back an
      // array of at most one row.
      setResult(Array.isArray(data) ? data[0] || null : data || null)
      setSearched(true)
    } catch (err) {
      console.error('Track reservation error:', err)
      setProblem(
        'We could not reach the barangay system just now. Please try again in a moment.'
      )
      setResult(null)
      setSearched(false)
    } finally {
      setLoading(false)
    }
  }

  const status = result ? describeTrackedStatus(result.status, result.is_exception) : null

  return (
    <div className="track-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <section className="track-hero">
          <div className="track-hero-inner">
            <p className="track-hero-label">E-Services</p>
            <h1>Track a Court Reservation</h1>
            <p className="track-hero-text">
              Check what has happened to a covered court booking. You do not
              need an account — just the reference number you were given and
              the contact number you booked with.
            </p>
          </div>
        </section>

        <div className="track-body">
          <div className="track-form-card">
            <form onSubmit={handleSubmit} className="track-form">
              <div className="form-group">
                <label htmlFor="track-reference">Reference number</label>
                <input
                  id="track-reference"
                  name="reference"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="BCR-2026-AB12CD"
                  autoComplete="off"
                  spellCheck="false"
                />
                <p className="field-note">
                  Capitals, spaces and dashes do not matter, and a letter O
                  typed for a zero still finds the booking.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="track-contact">Contact number</label>
                <input
                  id="track-contact"
                  name="contact"
                  type="tel"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  autoComplete="tel"
                />
                <p className="field-note">
                  The number given when the booking was made. Both are needed:
                  the reference number on its own does not open a booking.
                </p>
              </div>

              <button type="submit" className="track-submit-btn" disabled={loading}>
                {loading ? 'Checking...' : 'Check this booking'}
              </button>
            </form>

            {/* ⚠️ `role="alert"` rather than a toast. A toast disappears,
                and this is the answer the person came for. */}
            {problem && (
              <p className="track-problem" role="alert">{problem}</p>
            )}

            {searched && !result && (
              <div className="track-miss" role="status">
                <h2>No booking matched those details</h2>
                <p>
                  Please check both the reference number and the contact
                  number against what you were given — they have to be the
                  pair from the same booking.
                </p>
                <p>
                  If they still do not match, visit the Barangay Hall with
                  your name and the date you asked for, and an official can
                  find the booking for you.
                </p>
              </div>
            )}
          </div>

          {result && status && (
            <div className="track-result">
              <div className="track-result-head">
                <div>
                  <p className="track-result-label">Reference</p>
                  <p className="track-result-reference">{result.reference}</p>
                </div>
                {/* ⚠️ The CLASS comes from the shared status map, so the
                    pill a guest sees is the pill an official sees -- but
                    the RULES for it are in this page's own stylesheet at
                    a higher specificity, so nothing here depends on
                    `Sidebar.css` being in the bundle. A public page
                    reaching into a dashboard stylesheet is the
                    `@keyframes pulse` trap X4 recorded. */}
                <span className={`track-status ${status.className}`}>
                  {status.label}
                </span>
              </div>

              {status.explanation && (
                <p className="track-result-explanation">{status.explanation}</p>
              )}
              {status.exceptionNote && (
                <p className="track-result-exception">{status.exceptionNote}</p>
              )}

              <dl className="track-result-list">
                <div className="track-result-row">
                  <dt>Date</dt>
                  <dd>{result.preferred_date}</dd>
                </div>
                <div className="track-result-row">
                  <dt>Time</dt>
                  <dd>
                    {result.preferred_time}
                    {result.end_time ? ` – ${result.end_time}` : ''}
                    {' '}({result.duration_hours} hour{result.duration_hours === 1 ? '' : 's'})
                  </dd>
                </div>
                <div className="track-result-row">
                  <dt>Activity</dt>
                  <dd>{result.activity_type || 'Not recorded'}</dd>
                </div>
                {/* ⚠️ Both of these arrive ALREADY MASKED from the
                    database -- "Ezequel B." and "*******4567". They are
                    here so somebody can confirm they are looking at
                    their own booking, not so a lucky guess returns
                    somebody's details. Nothing on this page unmasks
                    them, because the browser never receives the full
                    values to unmask. */}
                <div className="track-result-row">
                  <dt>Booked by</dt>
                  <dd>{result.requester}</dd>
                </div>
                <div className="track-result-row">
                  <dt>Contact on file</dt>
                  <dd>{result.contact_masked}</dd>
                </div>
              </dl>

              <p className="track-result-note">
                The purpose you wrote, any notes and any office-hours reason are
                read by barangay officials only and are not shown here.
              </p>

              <div className="track-result-actions">
                <Link to="/reservation" className="track-link-btn">
                  Make another reservation
                </Link>
                <Link to="/e-services" className="track-link-btn track-link-plain">
                  Back to E-Services
                </Link>
              </div>
            </div>
          )}

          <div className="track-help">
            <h2>If you do not have a reference number</h2>
            <p>
              A reference number is shown once, on screen, immediately after a
              booking is submitted — it is not emailed or texted. If it was not
              written down, visit the Barangay Hall with your name, your contact
              number and the date you asked for, and an official can look the
              booking up. Barangay officials can always see the full booking;
              this page is only the version that works without an account.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default TrackReservation
