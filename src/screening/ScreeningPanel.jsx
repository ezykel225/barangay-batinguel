import { useCallback, useEffect, useState } from 'react'
import { FaClipboardCheck, FaInfoCircle, FaExclamationTriangle, FaLock } from 'react-icons/fa'

import {
  ANSWER_OPTIONS,
  CHECKLIST_DISCLAIMER,
  CHECKLIST_KEYS,
  CHECKLIST_PROVISIONAL_NOTE,
  CHECKLIST_VERSION,
  RECOMMENDATION_OPTIONS,
  SCREENING_ERRORS,
  SCREENING_OUTCOMES,
  answerLabel,
  checklistFor,
  needsFurtherReview,
  screeningOutcomeLabel,
} from './screeningChecklist'
import {
  confirmScreening, loadScreenings, prepareScreening, screeningMessage,
} from './screeningApi'
import { complaintDate } from '../complaints/complaintLabels'
import './Screening.css'

// The KP review screening, as one official sees it.
//
// ─── ⚠️ THE SYSTEM DOES NOT DECIDE KP JURISDICTION ────────────────────
//
// This panel displays questions, records answers, marks individual
// answers for the reviewer's attention, carries a recommendation a human
// chose, and asks a human to confirm an outcome. It computes **no**
// recommendation and **no** outcome: there is no function in this file or
// in `screeningChecklist.js` that maps the answer set to either
// vocabulary, and a test asserts there is not.
//
// `needsFurtherReview()` marks one row at a time. Nothing totals those
// marks, nothing blocks on them, and nothing turns them into advice —
// that is the whole difference between flagging an answer, which §5
// permits, and declaring a conclusion, which it forbids.
//
// ─── ⚠️ WHO MAY DO WHAT, AND WHO DECIDES THAT ─────────────────────────
//
//   Barangay Secretary  prepares (answers + optional recommendation)
//   Punong Barangay     confirms the outcome — the only confirmer
//   everybody else      sees nothing: the RPC returns zero rows
//
// ⚠️ PROVISIONAL. That split is a capstone workflow decision the barangay
// must verify; it is not a proven legal requirement, and this component
// says so on screen rather than only in a comment.
//
// ⚠️ The two flags below decide which CONTROLS ARE PAINTED and nothing
// more. `prepare_complaint_screening()` raises `P0001` unless the caller
// holds `Barangay Secretary` and `confirm_complaint_screening()` unless
// they hold `Punong Barangay`, both resolved through
// `official_account_links` — so the database is the authority and a
// crafted call by the wrong official is refused there.
//
// ⚠️ `barangay_officials.committee` IS NOT READ HERE. A real
// `Peace and Order and Appropriation` value exists on one Kagawad and it
// grants nothing: measured, that Kagawad is refused both RPCs and reads
// zero screenings. The column is free text with no CHECK that any
// official may write on any row, so authorizing on it would reproduce
// migration 028's escalation on an unguarded column.
//
// ─── ⚠️ THE SENSITIVE ANSWERS INCREASE PRIVACY ────────────────────────
//
// Two review items record that a matter may involve a minor or may be a
// VAWC/sensitive family matter. They are answers on a record only the
// Secretary and the Punong Barangay can read, and they reach **nothing**
// else: not the official queue, not public tracking, not the resident's
// own status, not a notification, not `activity_log`. ⚠️ More granular
// access *within* that pair of readers is DEFERRED and reported — P4-A
// could not add a distinct highly-restricted tier without widening its
// own scope, so the flags stay inside the already-restricted record.

const blankAnswers = () => CHECKLIST_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: '' }), {}
)

const ScreeningPanel = ({
  complaintId, isSecretary = false, isKapitan = false, confirm,
  // ⚠️ A NOTIFICATION, NOT LIFTED STATE. The KP case panel is a sibling
  // and its "may a case be opened" question is answered by this
  // complaint's latest screening, so it has to be told when that
  // changes. All screening state still lives here; this only says that
  // something moved.
  onScreeningChanged,
}) => {
  const [screenings, setScreenings] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')

  const [answers, setAnswers] = useState(blankAnswers)
  const [recommendation, setRecommendation] = useState('')
  const [recommendationNote, setRecommendationNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [outcome, setOutcome] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const checklist = checklistFor(CHECKLIST_VERSION) || []

  const fetchScreenings = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const rows = await loadScreenings(complaintId)
      setScreenings(rows)
      // Re-open the existing draft rather than a blank form, so a
      // Secretary returning to a part-finished review sees what they
      // already recorded instead of silently starting again.
      const open = rows.find((r) => r.is_open)
      if (open) {
        setAnswers({ ...blankAnswers(), ...(open.answers || {}) })
        setRecommendation(open.recommendation || '')
        setRecommendationNote(open.recommendation_note || '')
      }
    } catch (err) {
      setProblem(screeningMessage(err, 'loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [complaintId])

  useEffect(() => { fetchScreenings() }, [fetchScreenings])

  const openScreening = screenings.find((r) => r.is_open) || null
  const history = screenings.filter((r) => !r.is_open)

  const handlePrepare = async (event) => {
    event.preventDefault()
    // ⚠️ Prevented twice, and this half is the load-bearing one: a
    // keyboard Enter can beat the re-render that disables the button, and
    // a second save would re-stamp `prepared_at` for no reason.
    if (saving) return

    // ⚠️ Every question answered before saving, because the database
    // refuses a partial answer set and a reviewer should be told that
    // here rather than by a round trip. `unknown` is a real answer — this
    // only refuses a question nobody touched.
    const unanswered = CHECKLIST_KEYS.filter((k) => !answers[k])
    if (unanswered.length > 0) {
      setProblem(SCREENING_ERRORS.incomplete)
      return
    }
    setProblem('')

    try {
      setSaving(true)
      await prepareScreening({
        complaintId,
        checklistVersion: CHECKLIST_VERSION,
        answers,
        recommendation,
        recommendationNote,
      })
      await fetchScreenings()
      if (onScreeningChanged) onScreeningChanged()
    } catch (err) {
      setProblem(screeningMessage(err, 'prepareFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (confirming) return
    if (!outcome) {
      setProblem(SCREENING_ERRORS.outcomeRequired)
      return
    }
    setProblem('')

    // ⚠️ CONFIRMATION IS INTENTIONAL, through the shared dialog, because
    // it is the one action in this phase that records a barangay decision
    // and a confirmed screening cannot afterwards be edited. The sentence
    // names the outcome in the barangay's own words so the reader is
    // confirming something they can read, not an identifier.
    const ok = await confirm({
      title: 'Confirm this screening?',
      message: `The barangay's recorded decision will be: "${screeningOutcomeLabel(outcome)}".`
        + ' This is recorded against your name and cannot be edited afterwards.'
        + ' A later review would be a new screening.',
      confirmLabel: 'Confirm screening',
      cancelLabel: 'Go back',
      destructive: false,
    })
    if (!ok) return

    try {
      setConfirming(true)
      await confirmScreening({
        screeningId: openScreening.id, outcome, note: decisionNote,
      })
      setOutcome('')
      setDecisionNote('')
      await fetchScreenings()
      if (onScreeningChanged) onScreeningChanged()
    } catch (err) {
      setProblem(screeningMessage(err, 'confirmFailed'))
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return <p className="complaint-empty">Loading screening...</p>
  }

  // ⚠️ Zero rows is "not yours to see", not an error — the RPC filters
  // rather than raising. An official who is neither the Secretary nor the
  // Punong Barangay gets this one neutral sentence, and it names no
  // position as the gate, exactly as the restricted-detail panel does.
  if (!isSecretary && !isKapitan) {
    return (
      <div className="complaint-restricted" role="note">
        <FaLock aria-hidden="true" />
        <p>KP review screening is restricted to authorized barangay staff.</p>
      </div>
    )
  }

  const answeredCount = CHECKLIST_KEYS.filter((k) => answers[k]).length

  return (
    <div className="screening-panel">
      {/* ⚠️ THE DISCLAIMER IS ON SCREEN, not only in a comment. A reviewer
          must not come away thinking the checklist ruled on anything. */}
      <div className="complaint-notice" role="note">
        <FaInfoCircle aria-hidden="true" />
        <p>
          {CHECKLIST_DISCLAIMER}{' '}
          <strong>{CHECKLIST_PROVISIONAL_NOTE}</strong>
        </p>
      </div>

      {problem && <p className="complaint-field-error" role="alert">{problem}</p>}

      {/* ── What has already been confirmed ─────────────────────────
          ⚠️ <h4>, NOT <h3>. This panel renders inside the detail card
          under its own `<h3>KP review screening</h3>`, so its sections
          are that heading's CHILDREN: the levels run h1 (page) -> h2
          (card) -> h3 (section) -> h4 (this) -> h5, with none skipped.
          Rendering an <h3> here would make these siblings of the heading
          they belong to -- not an axe violation, but a structure a
          screen-reader user navigating by heading would read as a flat
          list of unrelated sections. */}
      {history.length > 0 && (
        <section className="screening-history">
          <h4>Confirmed screenings</h4>
          {/* ⚠️ A confirmed screening is HISTORY and is shown read-only.
              It is not editable here and the database refuses an update
              to it, so a recorded decision keeps the actor and the moment
              it was made. A further review is a new screening. */}
          <ul className="screening-history-list">
            {history.map((row) => (
              <li key={row.id} className="screening-history-item">
                <p className="screening-outcome">
                  {screeningOutcomeLabel(row.confirmed_outcome)}
                </p>
                <p className="screening-meta">
                  Confirmed by {row.confirmed_by_name || 'a barangay official'}
                  {' on '}{complaintDate(row.confirmed_at)}
                  {' · checklist '}{row.checklist_version}
                </p>
                {row.confirmation_note && (
                  <p className="screening-note">{row.confirmation_note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Preparing: the Barangay Secretary's ───────────────────── */}
      {isSecretary && (
        <form className="complaint-form" onSubmit={handlePrepare} noValidate>
          <fieldset className="complaint-fieldset">
            <legend>Review questions</legend>
            <p className="field-note">
              Checklist {CHECKLIST_VERSION} · {answeredCount} of{' '}
              {CHECKLIST_KEYS.length} answered. Choose{' '}
              <strong>Unknown / needs verification</strong> where something has
              not been established — it is a real answer, not a blank.
            </p>

            {checklist.map((item, index) => {
              const value = answers[item.key] || ''
              const flagged = needsFurtherReview(item, value)
              return (
                <div className="screening-item" key={item.key}>
                  {/* A real fieldset per question, so the three radios
                      are announced as one group named by the question
                      rather than as three unrelated controls. */}
                  <fieldset className="screening-question">
                    <legend>
                      <span className="screening-q-number">{index + 1}.</span>{' '}
                      {item.question}
                    </legend>

                    <div className="screening-options">
                      {ANSWER_OPTIONS.map((opt) => {
                        const id = `scr-${item.key}-${opt.value}`
                        return (
                          <span className="screening-option" key={opt.value}>
                            <input
                              type="radio"
                              id={id}
                              name={`scr-${item.key}`}
                              value={opt.value}
                              checked={value === opt.value}
                              onChange={() => setAnswers(
                                (a) => ({ ...a, [item.key]: opt.value })
                              )}
                            />
                            <label htmlFor={id}>{opt.label}</label>
                          </span>
                        )
                      })}
                    </div>

                    {/* ⚠️ EMPHASIS ON ONE ROW, NOT A FINDING. It says this
                        answer is worth a further look; it states no
                        conclusion, recommends nothing, and nothing
                        totals it. */}
                    {flagged && (
                      <p className="screening-flag" role="note">
                        <FaExclamationTriangle aria-hidden="true" />{' '}
                        Possible condition requiring further review.
                      </p>
                    )}
                  </fieldset>
                </div>
              )
            })}
          </fieldset>

          <fieldset className="complaint-fieldset">
            <legend>Administrative recommendation (optional)</legend>
            {/* ⚠️ CHOSEN, NEVER COMPUTED. Nothing derives this from the
                answers above — the Secretary reads the complaint and
                picks one, or leaves it blank. */}
            <p className="field-note">
              Optional. The Punong Barangay confirms what the barangay will
              actually do; this records what you suggest.
            </p>

            <div className="modal-form-group">
              <label htmlFor="scr-recommendation" className="modal-form-label">
                Suggested next step
              </label>
              <select
                id="scr-recommendation"
                className="modal-form-input"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
              >
                <option value="">No recommendation</option>
                {RECOMMENDATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="modal-form-group">
              <label htmlFor="scr-recommendation-note" className="modal-form-label">
                Note
              </label>
              <textarea
                id="scr-recommendation-note"
                className="modal-form-input"
                rows={3}
                value={recommendationNote}
                onChange={(e) => setRecommendationNote(e.target.value)}
              />
            </div>
          </fieldset>

          <div className="modal-actions">
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Saving...' : (openScreening ? 'Update screening' : 'Save screening')}
            </button>
          </div>
        </form>
      )}

      {/* ── Confirming: the Punong Barangay's ─────────────────────── */}
      {openScreening && (
        <section className="screening-review">
          <h4>{isKapitan ? 'Review and confirm' : 'Prepared screening'}</h4>

          <dl className="complaint-detail-list">
            <div className="complaint-detail-row">
              <dt>Checklist version</dt>
              <dd>{openScreening.checklist_version}</dd>
            </div>
            <div className="complaint-detail-row">
              <dt>Prepared by</dt>
              <dd>
                {openScreening.prepared_by_name || 'a barangay official'}
                {' on '}{complaintDate(openScreening.prepared_at)}
              </dd>
            </div>
            {/* The row is omitted entirely when nothing was recommended,
                rather than printing a label with a blank after it. */}
            {openScreening.recommendation && (
              <div className="complaint-detail-row">
                <dt>Recommendation</dt>
                <dd>{screeningOutcomeLabel(openScreening.recommendation)}</dd>
              </div>
            )}
            {openScreening.recommendation_note && (
              <div className="complaint-detail-row">
                <dt>Recommendation note</dt>
                <dd>{openScreening.recommendation_note}</dd>
              </div>
            )}
          </dl>

          <h5>Recorded answers</h5>
          <ul className="screening-answer-list">
            {checklist.map((item) => {
              const stored = (openScreening.answers || {})[item.key]
              return (
                <li className="screening-answer" key={item.key}>
                  <span className="screening-answer-q">{item.question}</span>
                  <span className="screening-answer-a">{answerLabel(stored)}</span>
                  {needsFurtherReview(item, stored) && (
                    <span className="screening-answer-flag">
                      Requires further review
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {/* ⚠️ THE CHECKLIST ANSWERS AND THE FINAL OUTCOME ARE VISIBLY
              SEPARATE, which is the point of the heading change: the
              answers above are observations a human recorded, and the
              control below is a decision a different human makes. */}
          {isKapitan && (
            <div className="screening-confirm">
              <h5>What the barangay will do next</h5>

              <div className="modal-form-group">
                <label htmlFor="scr-outcome" className="modal-form-label">
                  Confirmed outcome <span aria-hidden="true">*</span>
                </label>
                <select
                  id="scr-outcome"
                  className="modal-form-input"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  aria-required="true"
                  aria-describedby="scr-outcome-note"
                >
                  <option value="">Please choose</option>
                  {SCREENING_OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {/* ⚠️ Says what the choice IS and what it is not. Every
                    option names an action the barangay will take, not a
                    finding about the law. */}
                <p className="field-note" id="scr-outcome-note">
                  {outcome
                    ? (SCREENING_OUTCOMES.find((o) => o.value === outcome) || {}).help
                    : 'Each option records what the barangay will do. None of'
                      + ' them is a legal ruling.'}
                </p>
              </div>

              <div className="modal-form-group">
                <label htmlFor="scr-decision-note" className="modal-form-label">
                  Decision note
                </label>
                <textarea
                  id="scr-decision-note"
                  className="modal-form-input"
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-save"
                  onClick={handleConfirm}
                  disabled={confirming}
                >
                  <FaClipboardCheck aria-hidden="true" />{' '}
                  {confirming ? 'Confirming...' : 'Confirm screening'}
                </button>
              </div>
            </div>
          )}

          {/* ⚠️ Says why there is no control rather than leaving a blank
              where the Punong Barangay sees one. It names the holder in
              general terms ("the barangay head") because the Secretary
              already knows who prepares and who confirms — unlike the
              restricted panel, which is read by officials who must not be
              told which position to ask. */}
          {!isKapitan && (
            <p className="complaint-no-actions" role="note">
              This screening is prepared and waiting for the barangay head to
              confirm what the barangay will do next.
            </p>
          )}
        </section>
      )}

      {!openScreening && !isSecretary && (
        <p className="complaint-empty">No screening is awaiting confirmation.</p>
      )}
    </div>
  )
}

export default ScreeningPanel
