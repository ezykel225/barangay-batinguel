import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { trackComplaint } from '../complaints/complaintApi'
import {
  TRACKING_MISS_TITLE,
  TRACKING_MISS_MESSAGE,
  TRACKING_UNREACHABLE,
  complaintDate,
  describeComplaintStatus,
} from '../complaints/complaintLabels'
import {
  normalizeReference,
  digitsOnly,
} from '../utils/reservationTracking'
import './TrackPage.css'

// Checking on a complaint without an account -- the path a walk-in
// complainant takes, whose complaint the Secretary encoded at the hall
// and who has a reference slip and nothing else.
//
// ─── ⚠️ THE LOOKUP IS THE DATABASE'S, NOT THIS PAGE'S ─────────────────
//
// Everything that decides what may be read lives in
// `track_complaint(p_reference, p_contact)` (migration 040): SECURITY
// DEFINER, two factors, a FIXED FOUR-COLUMN result, `LIMIT 1`, and the
// same empty answer for a wrong reference and a wrong contact number.
// `complaints` has no anonymous SELECT policy and did not get one, so
// this page cannot be made to leak more by editing it.
//
// ⚠️ AND NO SECOND QUERY FOLLOWS A HIT. Fetching a category, a name or
// an attachment count once the lookup succeeds would defeat a
// narrowness the database went to trouble to guarantee -- and would be
// refused anyway. The four fields below are the whole of what a guest
// may see.
//
// ⚠️ ON A MISS, SAY NOTHING ABOUT WHICH HALF WAS WRONG. "That reference
// does not exist" confirms which guesses are live, which turns this
// page into a way to enumerate other people's complaints -- worse here
// than for a booking, because the neighbouring record names a
// neighbour. One message covers both, and
// `complaintLabels.test.js` asserts it says nothing about not-found.

const TrackComplaint = () => {
  // ⚠️ A reference may be deep-linked (?ref=...) so the barangay can
  // paste one into a message, but the CONTACT NUMBER never is. Half of
  // a two-factor lookup in a URL is a convenience; both halves in a URL
  // is the lookup itself in browser history and in the referrer header.
  const [params] = useSearchParams()
  const [reference, setReference] = useState(params.get('ref') || '')
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [searched, setSearched] = useState(false)
  const [problem, setProblem] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    // ⚠️ Only what is EMPTY in what was typed. It never says whether a
    // reference exists -- the same rule `trackingInputProblem()`
    // follows for bookings, and the normalisers are reused from there
    // rather than copied, because the two references share one
    // alphabet and one look-alike rule.
    if (normalizeReference(reference) === '') {
      setProblem('Please enter the reference number from your complaint.')
      setResult(null); setSearched(false)
      return
    }
    if (digitsOnly(contact) === '') {
      setProblem('Please enter the contact number recorded with the complaint.')
      setResult(null); setSearched(false)
      return
    }
    setProblem('')

    try {
      setLoading(true)
      const row = await trackComplaint(reference, contact)
      setResult(row)
      setSearched(true)
    } catch {
      // ⚠️ A FAILED LOOKUP AND AN EMPTY ONE ARE DIFFERENT FACTS and are
      // said differently. Showing the miss message when the request
      // never reached the database would tell somebody their complaint
      // does not exist, which is the one wrong thing this page can say.
      setProblem(TRACKING_UNREACHABLE)
      setResult(null); setSearched(false)
    } finally {
      setLoading(false)
    }
  }

  const status = result ? describeComplaintStatus(result.status) : null

  return (
    <div className="track-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <section className="track-hero">
          <div className="track-hero-inner">
            <p className="track-hero-label">E-Services</p>
            <h1>Track a Complaint</h1>
            <p className="track-hero-text">
              Check what has happened to a complaint. You do not need an
              account — just the reference number you were given and the
              contact number recorded when the complaint was filed.
            </p>
          </div>
        </section>

        <div className="track-body">
          <div className="track-form-card">
            <form onSubmit={handleSubmit} className="track-form">
              <div className="form-group">
                <label htmlFor="complaint-track-reference">Reference number</label>
                <input
                  id="complaint-track-reference"
                  name="reference"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="CMP-2026-AB12CD"
                  autoComplete="off"
                  spellCheck="false"
                  aria-describedby="complaint-track-reference-note"
                />
                <p className="field-note" id="complaint-track-reference-note">
                  Capitals, spaces and dashes do not matter, and a letter O
                  typed for a zero still finds the complaint.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="complaint-track-contact">Contact number</label>
                <input
                  id="complaint-track-contact"
                  name="contact"
                  type="tel"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  autoComplete="tel"
                  aria-describedby="complaint-track-contact-note"
                />
                <p className="field-note" id="complaint-track-contact-note">
                  The number recorded when the complaint was filed. Both are
                  needed: the reference number on its own does not open a
                  complaint.
                </p>
              </div>

              <button type="submit" className="track-submit-btn" disabled={loading}>
                {loading ? 'Checking...' : 'Check this complaint'}
              </button>
            </form>

            {problem && <p className="track-problem" role="alert">{problem}</p>}

            {searched && !result && (
              <div className="track-miss" role="status">
                <h2>{TRACKING_MISS_TITLE}</h2>
                <p>{TRACKING_MISS_MESSAGE}</p>
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
                <span className={`track-status ${status.className}`}>
                  {status.label}
                </span>
              </div>

              {status.explanation && (
                <p className="track-result-explanation">{status.explanation}</p>
              )}

              {/* ⚠️ EXACTLY THE FOUR COLUMNS THE RPC RETURNS, and the
                  reference is already above. No category -- the
                  category is the accusation itself. No narrative, no
                  complainant, no respondent, no witness, no evidence,
                  no contact number, no internal note. */}
              <dl className="track-result-list">
                <div className="track-result-row">
                  <dt>Received on</dt>
                  <dd>{complaintDate(result.received_on)}</dd>
                </div>
                <div className="track-result-row">
                  <dt>Last updated</dt>
                  <dd>{complaintDate(result.last_updated)}</dd>
                </div>
              </dl>

              <p className="track-result-note">
                What the complaint says, who it names and any files attached to
                it are read by barangay officials only and are not shown here.
              </p>

              <div className="track-result-actions">
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
              complaint is submitted, and is written on the slip given for a
              complaint filed in person — it is not emailed or texted. If it
              was not kept, visit the Barangay Hall during office hours with
              your name and contact number, and an official can look the
              complaint up. This page is only the version that works without
              an account.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default TrackComplaint
