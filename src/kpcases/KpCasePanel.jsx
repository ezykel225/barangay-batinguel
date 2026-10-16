import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaBalanceScale, FaCalendarPlus, FaFileAlt, FaInfoCircle, FaLock, FaUsers,
} from 'react-icons/fa'

import {
  KP_ATTENDANCE_KEYS,
  KP_ATTENDANCE_UNRECORDED,
  KP_CONCLUDE_PROMPT,
  KP_HEARING_OUTCOME_KEYS,
  KP_HEARING_STATUS_KEYS,
  KP_OPEN_GATE,
  KP_OUTCOME_PROVISIONAL_NOTE,
  KP_PANEL_MAX,
  KP_PANEL_PROVISIONAL_NOTE,
  KP_PANEL_ROLE_KEYS,
  KP_PROCEEDING_TYPE_KEYS,
  KP_RESTRICTED_NOTE,
  kpAttendanceLabel,
  kpCaseStatusLabel,
  kpCaseStatusNote,
  kpHearingDate,
  kpHearingOutcomeLabel,
  kpHearingStatusLabel,
  kpHearingTime,
  kpPanelRoleLabel,
  kpProceedingTypeLabel,
  kpStampedAt,
} from './kpCaseLabels'
import {
  assignPanelMember,
  kpMessage,
  loadKpAttendance,
  loadKpCase,
  loadKpCaseParties,
  loadKpHearings,
  loadKpPanel,
  openKpCase,
  recordAttendance,
  recordHearingOutcome,
  scheduleHearing,
  updateHearingRecord,
} from './kpCaseApi'
import KpNoticePreview from './documents/KpNoticePreview'
// ⚠️ THE SAME READER THE SCREENING PANEL USES, not a second copy of the
// rule and not a second source. `complaint_screenings_for()` is gated on
// exactly the pair who may administer a case, returns the rows newest
// first, and is what `open_kp_case()` itself reads -- so the control and
// the database agree by construction rather than by two rules happening
// to say the same thing.
import { loadScreenings } from '../screening/screeningApi'
import './KpCase.css'

// The KP case file, as one official sees it.
//
// ─── ⚠️ THE SYSTEM DECIDES NOTHING HERE EITHER ────────────────────────
//
// This panel opens a case a human asked for, records a panel a human
// typed, schedules a proceeding a human chose, prints the facts already
// recorded, records attendance a human observed, and asks a human for
// one outcome. There is no function in this file that derives an
// outcome, a disposition or a next step from attendance, from minutes,
// from panel composition or from the screening's answers — and a
// source-reading test asserts there is not.
//
// ⚠️ WHETHER A CASE IS CONCLUDED IS ITS OWN HUMAN ANSWER — a checkbox
// beside the outcome, not a consequence of the outcome value. "Resolved
// — agreement recorded" does not conclude the case by itself, because
// the barangay may keep it open, and `record_kp_hearing_outcome` takes
// that answer as a separate parameter.
//
// ─── ⚠️ WHO MAY DO WHAT, AND WHO DECIDES THAT ─────────────────────────
//
//   Punong Barangay     opens the case; records the proceeding outcome;
//                       may also do everything administrative
//   Barangay Secretary  records the panel; schedules the proceeding;
//                       prints the notice and the summons; records
//                       attendance, status and minutes
//   everybody else      sees one neutral sentence: the readers return
//                       zero rows to anybody who is neither
//
// ⚠️ PROVISIONAL. That split is a capstone workflow decision the
// barangay must verify; it is not a proven legal requirement, and this
// component says so on screen rather than only in a comment.
//
// ⚠️ THE TWO FLAGS DECIDE WHICH CONTROLS ARE PAINTED AND NOTHING MORE.
// `open_kp_case()` and `record_kp_hearing_outcome()` raise `P0001`
// unless the caller holds `Punong Barangay`; the three administrative
// writers unless they hold `Barangay Secretary` or `Punong Barangay`.
// All of those resolve through `official_account_links` — so the
// database is the authority and a crafted call by the wrong official is
// refused there, measured by impersonation. These flags only avoid
// painting a control the database would turn down.
//
// ⚠️ `barangay_officials.committee` IS NOT READ HERE. A real
// `Peace and Order and Appropriation` value exists on one Kagawad and it
// grants nothing: measured, that Kagawad is refused every write and
// reads an empty case file. The column is free text with no CHECK that
// any official may write on any row, so authorizing on it would
// reproduce migration 028's escalation on an unguarded column.
//
// ⚠️ NO RESIDENT OR PUBLIC SURFACE RENDERS THIS. It is reached only from
// inside `OfficialComplaints`' authorized detail branch, which itself
// renders only for an official the complaint predicate admits.

const blankHearing = () => ({
  proceedingType: KP_PROCEEDING_TYPE_KEYS[0],
  hearingDate: '',
  startTime: '',
  location: '',
  presidingNote: '',
  adminNotes: '',
})

const KpCasePanel = ({
  complaintId, isSecretary = false, isKapitan = false, confirm,
  // ⚠️ A BUMPED COUNTER, NOT LIFTED STATE. All screening state still
  // lives in `ScreeningPanel` and all case state still lives here; this
  // is only how a sibling says "the screening changed, look again", so
  // confirming a review repaints this panel without a page reload.
  screeningSignal = 0,
}) => {
  const [kpCase, setKpCase] = useState(null)
  const [screenings, setScreenings] = useState([])
  const [hearings, setHearings] = useState([])
  const [parties, setParties] = useState([])
  const [panel, setPanel] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')

  const [openNote, setOpenNote] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState(KP_PANEL_ROLE_KEYS[0])
  const [form, setForm] = useState(blankHearing)
  const [notice, setNotice] = useState(null)

  // Per-hearing editing state, keyed by hearing id so two open rows
  // cannot share a draft.
  const [drafts, setDrafts] = useState({})

  // ⚠️ The administrative writers accept BOTH positions, so this is one
  // flag rather than two checks spelled out at six call sites.
  const canAdminister = isSecretary || isKapitan

  const draftFor = (id) => drafts[id] || {}
  const setDraft = (id, patch) => setDrafts(
    (prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } })
  )

  const fetchCase = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const [row, screeningRows] = await Promise.all([
        loadKpCase(complaintId),
        loadScreenings(complaintId),
      ])
      setKpCase(row)
      setScreenings(screeningRows)
      if (!row) {
        setHearings([])
        setParties([])
        setPanel([])
        return
      }
      const [hearingRows, partyRows, panelRows] = await Promise.all([
        loadKpHearings(row.id),
        loadKpCaseParties(row.id),
        loadKpPanel(row.id),
      ])
      // Attendance hangs off each hearing, so the notice can print what
      // was recorded and the row can show it without a second click.
      const withAttendance = await Promise.all(
        hearingRows.map(async (h) => ({
          ...h, attendance: await loadKpAttendance(h.id),
        }))
      )
      setHearings(withAttendance)
      setParties(partyRows)
      setPanel(panelRows)
    } catch (err) {
      setProblem(kpMessage(err, 'loadFailed'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintId, screeningSignal])

  useEffect(() => { fetchCase() }, [fetchCase])

  // ─── ⚠️ WHETHER A CASE MAY BE OPENED, MIRRORING THE SQL EXACTLY ─────
  //
  // `open_kp_case()` takes the COMPLAINT id, reads that complaint's
  // screenings `ORDER BY created_at DESC LIMIT 1`, refuses unless
  // `confirmed_at` is set, and then refuses unless `confirmed_outcome`
  // is `proceed_to_kp_process`. `complaint_screenings_for()` returns the
  // same rows in the same order with `is_open = (confirmed_at IS NULL)`,
  // so `rows[0]` is the same screening the RPC will look at.
  //
  // ⚠️ THIS DOES NOT REPLACE THE DATABASE CHECK AND MUST NOT. It decides
  // which control is painted; the RPC still decides whether the row is
  // written, and a crafted call is still refused with its own P0001.
  const latestScreening = screenings[0] || null
  const screeningConfirmed = Boolean(latestScreening) && !latestScreening.is_open
  const mayOpenCase = screeningConfirmed
    && latestScreening.confirmed_outcome === 'proceed_to_kp_process'

  // ⚠️ Which sentence explains the absence. A control that is simply
  // gone with nothing in its place reads as something that failed to
  // render -- the reason the Archived Officials panel renders even when
  // it finds nothing.
  const openGateNote = () => {
    if (!latestScreening) return KP_OPEN_GATE.noScreening
    if (!screeningConfirmed) return KP_OPEN_GATE.unconfirmed
    return KP_OPEN_GATE.notProceed
  }

  // ⚠️ THE GUARD IS A REF, NOT THE `busy` STATE, and that is a real
  // defect of mine that my own test caught rather than a precaution.
  //
  // The first version read `if (busy) return`. `busy` comes from the
  // render closure and React BATCHES `setBusy`, so three submits in one
  // tick all saw `''` and all three ran -- measured as 3 calls where 1
  // was expected. So the guard worked only ACROSS renders, which is
  // exactly the case the `disabled` attribute already covers, and it
  // failed at the case it exists for: a keyboard Enter beating the
  // re-render that disables the button. A second call would open a
  // second case or record a second panel member.
  //
  // A ref is not batched, so the second submit in the same tick sees it
  // set. ⚠️ The test submits the FORM rather than clicking a disabled
  // control -- both the honest test and the real case. P3-B2's first
  // version of that test proved nothing because it clicked a disabled
  // button, and deleting this guard now fails it.
  const inFlight = useRef(false)

  const run = async (key, work, fallbackKey) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(key)
    setProblem('')
    try {
      await work()
      await fetchCase()
      return true
    } catch (err) {
      setProblem(kpMessage(err, fallbackKey))
      return false
    } finally {
      inFlight.current = false
      setBusy('')
    }
  }

  const handleOpenCase = (event) => {
    event.preventDefault()
    return run('open', () => openKpCase({ complaintId, note: openNote }), 'openFailed')
      .then((ok) => { if (ok) setOpenNote('') })
  }

  const handleAddMember = (event) => {
    event.preventDefault()
    if (!memberName.trim()) return undefined
    return run(
      'panel',
      () => assignPanelMember({ caseId: kpCase.id, memberName, panelRole: memberRole }),
      'panelFailed',
    ).then((ok) => { if (ok) setMemberName('') })
  }

  const handleSchedule = (event) => {
    event.preventDefault()
    return run('schedule', () => scheduleHearing({
      caseId: kpCase.id,
      proceedingType: form.proceedingType,
      hearingDate: form.hearingDate,
      startTime: form.startTime,
      location: form.location,
      presidingNote: form.presidingNote,
      adminNotes: form.adminNotes,
    }), 'scheduleFailed').then((ok) => { if (ok) setForm(blankHearing()) })
  }

  const handleRecord = (hearing) => (event) => {
    event.preventDefault()
    const draft = draftFor(hearing.id)
    return run(`record-${hearing.id}`, () => updateHearingRecord({
      hearingId: hearing.id,
      status: draft.status || null,
      minutes: draft.minutes,
      adminNotes: draft.adminNotes,
    }), 'recordFailed')
  }

  const handleAttendance = (hearing, partyId, value) => run(
    `attendance-${hearing.id}-${partyId}`,
    () => recordAttendance({
      hearingId: hearing.id, partyId, attendance: value,
    }),
    'attendanceFailed',
  )

  // ⚠️ THROUGH THE SHARED `useConfirm`, because an outcome is the one
  // action here that records a barangay decision and cannot afterwards
  // be edited — the trigger and the RPC both refuse a second one. The
  // sentence names the outcome IN WORDS rather than as an identifier,
  // and `destructive: false` because recording a decision is not a
  // deletion.
  const handleOutcome = (hearing) => async (event) => {
    event.preventDefault()
    const draft = draftFor(hearing.id)
    if (!draft.outcome) return
    const concludes = Boolean(draft.concludes)
    const ok = await confirm({
      title: 'Record this outcome?',
      message: concludes
        ? `This records the outcome "${kpHearingOutcomeLabel(draft.outcome)}" for the proceeding on ${kpHearingDate(hearing.hearing_date)}, and records that this case is concluded. Neither can be changed afterwards.`
        : `This records the outcome "${kpHearingOutcomeLabel(draft.outcome)}" for the proceeding on ${kpHearingDate(hearing.hearing_date)}. It cannot be changed afterwards.`,
      confirmLabel: 'Record outcome',
      destructive: false,
    })
    if (!ok) return
    await run(`outcome-${hearing.id}`, () => recordHearingOutcome({
      hearingId: hearing.id,
      outcome: draft.outcome,
      note: draft.outcomeNote,
      concludesCase: concludes,
    }), 'outcomeFailed')
  }

  if (loading) return <p className="kp-loading">Loading case file...</p>

  // ⚠️ AN EMPTY CASE FILE FOR SOMEBODY WHO MAY NOT SEE ONE IS NOT AN
  // ERROR, and telling the two apart is what this branch is for. The
  // readers filter rather than raising, so an ordinary official gets a
  // null case with no error — the same shape as "no case has been opened
  // yet". Only a caller who could open one is told that; everybody else
  // reads the neutral sentence, which NAMES NO POSITION, no policy, no
  // function and no SQLSTATE.
  if (!kpCase && !isKapitan && !canAdminister) {
    return (
      <p className="kp-restricted" role="note">
        <FaLock aria-hidden="true" /> {KP_RESTRICTED_NOTE}
      </p>
    )
  }

  return (
    <div className="kp-panel">
      {problem && (
        <p className="kp-problem" role="alert">
          <FaInfoCircle aria-hidden="true" /> {problem}
        </p>
      )}

      {!kpCase ? (
        <>
          {/* ⚠️ NO AUTOMATIC CASE CREATION. Confirming a screening with
              "Proceed with the barangay KP process" creates nothing;
              migration 042's confirming RPC is untouched and gains no
              branch. An authorized human opens the case explicitly, and
              that is this form.

              ⚠️ ELIGIBILITY IS NOT ASSERTED HERE. The form sends the
              COMPLAINT id and nothing else; `open_kp_case()` finds the
              latest screening itself, requires that it was confirmed by
              a human, and requires the confirmed outcome to say to
              proceed. So this panel cannot nominate a screening, and
              neither layer reads the checklist ANSWERS. */}
          <p className="kp-empty">
            No KP case has been opened for this complaint.
          </p>
          {/* ⚠️ THE CONTROL IS ABSENT, NEVER DISABLED AND NEVER PAINTED
              OVER A RULE THE DATABASE WOULD REFUSE. The preview showed
              "Open a KP case" before any review had been confirmed, so
              the one visible next step was a button whose only possible
              answer was a refusal. It now appears for the one state
              `open_kp_case()` accepts, and the other three say why
              instead -- a missing control with nothing in its place
              cannot be told from one that failed to render.

              ⚠️ A sentence, not a disabled button: `ActionMenu`'s own
              rule, and the reason the Add Official form OMITS the three
              powered positions rather than showing them greyed. */}
          {isKapitan && mayOpenCase ? (
            <form className="kp-form" onSubmit={handleOpenCase}>
              <h4><FaBalanceScale aria-hidden="true" /> Open a KP case</h4>
              <p className="kp-hint">
                A case can be opened only when this complaint's latest
                review was confirmed and says to proceed with the KP
                process. The system checks that when you open it.
              </p>
              <label htmlFor="kp-open-note">Opening note (optional)</label>
              <textarea
                id="kp-open-note"
                rows={2}
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
              />
              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {busy === 'open' ? 'Opening...' : 'Open KP case'}
              </button>
            </form>
          ) : (
            <p className="kp-hint" role="note">
              <FaInfoCircle aria-hidden="true" />{' '}
              {mayOpenCase
                ? 'Opening a KP case is handled by the barangay head.'
                : openGateNote()}
            </p>
          )}
        </>
      ) : (
        <>
          <dl className="kp-summary">
            <div>
              <dt>KP case reference</dt>
              <dd className="kp-reference">{kpCase.reference}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`kp-badge kp-badge-${kpCase.status}`}>
                  {kpCaseStatusLabel(kpCase.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Opened by</dt>
              <dd>{kpCase.opened_by_name || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>{kpStampedAt(kpCase.opened_at) || 'Not recorded'}</dd>
            </div>
          </dl>
          <p className="kp-hint">{kpCaseStatusNote(kpCase.status)}</p>
          {kpCase.opening_note && (
            <p className="kp-note">{kpCase.opening_note}</p>
          )}
          {kpCase.conclusion_note && (
            <p className="kp-note">{kpCase.conclusion_note}</p>
          )}

          {/* ── The recorded panel ───────────────────────────────── */}
          <h4><FaUsers aria-hidden="true" /> Recorded panel</h4>
          <p className="kp-provisional" role="note">
            <FaInfoCircle aria-hidden="true" /> {KP_PANEL_PROVISIONAL_NOTE}
          </p>
          {panel.length === 0 ? (
            <p className="kp-empty">No panel member recorded yet.</p>
          ) : (
            <ul className="kp-list">
              {panel.map((member) => (
                <li key={member.id}>
                  <strong>{member.member_name}</strong>
                  <span className="kp-meta">
                    {kpPanelRoleLabel(member.panel_role)}
                    {member.assigned_by_name ? ` · recorded by ${member.assigned_by_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canAdminister && kpCase.status !== 'concluded' && panel.length < KP_PANEL_MAX && (
            /* ⚠️ NO NAME IS SUGGESTED, DEFAULTED OR OFFERED FROM A LIST.
               This system holds no Lupon roster, and populating this
               field from `barangay_officials` would assert that an
               official is a Lupon member — which P2.5 established
               nothing in this repository records. */
            <form className="kp-form kp-form-inline" onSubmit={handleAddMember}>
              <div>
                <label htmlFor="kp-member-name">Member name</label>
                <input
                  id="kp-member-name"
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="kp-member-role">Panel role</label>
                <select
                  id="kp-member-role"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                >
                  {KP_PANEL_ROLE_KEYS.map((key) => (
                    <option key={key} value={key}>{kpPanelRoleLabel(key)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-add btn-sm" disabled={Boolean(busy)}>
                {busy === 'panel' ? 'Recording...' : 'Record member'}
              </button>
            </form>
          )}

          {/* ── Proceedings ──────────────────────────────────────── */}
          <h4><FaCalendarPlus aria-hidden="true" /> Proceedings</h4>
          {hearings.length === 0 ? (
            <p className="kp-empty">No proceeding scheduled yet.</p>
          ) : (
            <ul className="kp-hearings">
              {hearings.map((hearing) => {
                const draft = draftFor(hearing.id)
                const settled = Boolean(hearing.outcome)
                return (
                  <li key={hearing.id} className="kp-hearing">
                    <h5>
                      {kpProceedingTypeLabel(hearing.proceeding_type)}
                      {' — '}
                      {kpHearingDate(hearing.hearing_date)}
                      {kpHearingTime(hearing.start_time)
                        ? `, ${kpHearingTime(hearing.start_time)}`
                        : ''}
                    </h5>
                    <p className="kp-meta">
                      <span className={`kp-badge kp-badge-${hearing.status}`}>
                        {kpHearingStatusLabel(hearing.status)}
                      </span>
                      {' '}
                      {hearing.location}
                      {hearing.scheduled_by_name ? ` · scheduled by ${hearing.scheduled_by_name}` : ''}
                    </p>
                    {hearing.presiding_note && (
                      <p className="kp-note">Handling: {hearing.presiding_note}</p>
                    )}

                    {/* ⚠️ INTERNAL NOTES AND MINUTES RENDER ONLY HERE,
                        inside the authorized case file. No resident or
                        public surface reads them: there is no KP column
                        in `complaint_queue()`, nothing KP in
                        `track_complaint()`, and no KP note is written to
                        `complaint_status_history`, whose own reader
                        admits the filing resident. */}
                    {hearing.admin_notes && (
                      <p className="kp-note">Notes: {hearing.admin_notes}</p>
                    )}
                    {hearing.minutes && (
                      <p className="kp-note">Minutes: {hearing.minutes}</p>
                    )}

                    {/* Attendance */}
                    <h5 className="kp-subhead">Attendance</h5>
                    {parties.length === 0 ? (
                      <p className="kp-empty">No party recorded on this case.</p>
                    ) : (
                      <ul className="kp-attendance">
                        {parties.map((party) => {
                          const recorded = (hearing.attendance || []).find(
                            (a) => a.party_id === party.party_id
                          )
                          const fieldId = `kp-att-${hearing.id}-${party.party_id}`
                          return (
                            <li key={party.party_id}>
                              <span className="kp-party">
                                {party.party_name}
                                <span className="kp-meta"> {party.party_role}</span>
                              </span>
                              {canAdminister && !settled ? (
                                <>
                                  <label className="visually-hidden" htmlFor={fieldId}>
                                    Attendance for {party.party_name}
                                  </label>
                                  <select
                                    id={fieldId}
                                    value={recorded?.attendance || ''}
                                    disabled={Boolean(busy)}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleAttendance(hearing, party.party_id, e.target.value)
                                      }
                                    }}
                                  >
                                    <option value="">{KP_ATTENDANCE_UNRECORDED}</option>
                                    {KP_ATTENDANCE_KEYS.map((key) => (
                                      <option key={key} value={key}>
                                        {kpAttendanceLabel(key)}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <span className="kp-att-state">
                                  {recorded
                                    ? kpAttendanceLabel(recorded.attendance)
                                    : KP_ATTENDANCE_UNRECORDED}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {/* Notice and summons */}
                    {canAdminister && (
                      <div className="kp-doc-actions">
                        <button
                          type="button"
                          className="btn-add btn-sm"
                          onClick={() => setNotice({ kind: 'notice', hearing })}
                        >
                          <FaFileAlt aria-hidden="true" /> Hearing notice
                        </button>
                        <button
                          type="button"
                          className="btn-add btn-sm"
                          onClick={() => setNotice({ kind: 'summons', hearing })}
                        >
                          <FaFileAlt aria-hidden="true" /> Summons
                        </button>
                      </div>
                    )}

                    {/* Status and minutes */}
                    {canAdminister && !settled && (
                      <form className="kp-form" onSubmit={handleRecord(hearing)}>
                        <h5 className="kp-subhead">Record the proceeding</h5>
                        <label htmlFor={`kp-status-${hearing.id}`}>Status</label>
                        <select
                          id={`kp-status-${hearing.id}`}
                          value={draft.status || hearing.status}
                          onChange={(e) => setDraft(hearing.id, { status: e.target.value })}
                        >
                          {KP_HEARING_STATUS_KEYS.map((key) => (
                            <option key={key} value={key}>{kpHearingStatusLabel(key)}</option>
                          ))}
                        </select>

                        <label htmlFor={`kp-minutes-${hearing.id}`}>Minutes</label>
                        <textarea
                          id={`kp-minutes-${hearing.id}`}
                          rows={3}
                          value={draft.minutes ?? (hearing.minutes || '')}
                          onChange={(e) => setDraft(hearing.id, { minutes: e.target.value })}
                        />

                        <label htmlFor={`kp-admin-${hearing.id}`}>
                          Administrative notes
                        </label>
                        <textarea
                          id={`kp-admin-${hearing.id}`}
                          rows={2}
                          value={draft.adminNotes ?? (hearing.admin_notes || '')}
                          onChange={(e) => setDraft(hearing.id, { adminNotes: e.target.value })}
                        />

                        <button type="submit" className="btn-add btn-sm" disabled={Boolean(busy)}>
                          {busy === `record-${hearing.id}` ? 'Saving...' : 'Save record'}
                        </button>
                      </form>
                    )}

                    {/* The one outcome */}
                    {settled ? (
                      <p className="kp-outcome">
                        <strong>Outcome:</strong>{' '}
                        {kpHearingOutcomeLabel(hearing.outcome)}
                        {hearing.outcome_recorded_by_name
                          ? ` · recorded by ${hearing.outcome_recorded_by_name}`
                          : ''}
                        {hearing.outcome_note ? ` — ${hearing.outcome_note}` : ''}
                      </p>
                    ) : isKapitan && (
                      /* ⚠️ THE OUTCOME IS THE PUNONG BARANGAY'S, and the
                          Secretary gets no control for it even with a
                          record open — `record_kp_hearing_outcome()`
                          raises `P0001` for her, measured. */
                      <form className="kp-form" onSubmit={handleOutcome(hearing)}>
                        <h5 className="kp-subhead">Record the outcome</h5>
                        <p className="kp-provisional" role="note">
                          <FaInfoCircle aria-hidden="true" /> {KP_OUTCOME_PROVISIONAL_NOTE}
                        </p>
                        <label htmlFor={`kp-outcome-${hearing.id}`}>Outcome</label>
                        <select
                          id={`kp-outcome-${hearing.id}`}
                          value={draft.outcome || ''}
                          onChange={(e) => setDraft(hearing.id, { outcome: e.target.value })}
                          required
                        >
                          <option value="">Choose an outcome</option>
                          {KP_HEARING_OUTCOME_KEYS.map((key) => (
                            <option key={key} value={key}>{kpHearingOutcomeLabel(key)}</option>
                          ))}
                        </select>

                        <label htmlFor={`kp-outcome-note-${hearing.id}`}>
                          Outcome note (optional)
                        </label>
                        <textarea
                          id={`kp-outcome-note-${hearing.id}`}
                          rows={2}
                          value={draft.outcomeNote || ''}
                          onChange={(e) => setDraft(hearing.id, { outcomeNote: e.target.value })}
                        />

                        <div className="kp-check">
                          <input
                            id={`kp-concludes-${hearing.id}`}
                            type="checkbox"
                            checked={Boolean(draft.concludes)}
                            onChange={(e) => setDraft(hearing.id, { concludes: e.target.checked })}
                          />
                          <label htmlFor={`kp-concludes-${hearing.id}`}>
                            {KP_CONCLUDE_PROMPT}
                          </label>
                        </div>

                        <button type="submit" className="btn-add btn-sm" disabled={Boolean(busy)}>
                          {busy === `outcome-${hearing.id}` ? 'Recording...' : 'Record outcome'}
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canAdminister && kpCase.status !== 'concluded' && (
            /* ⚠️ NO STATUTORY DEADLINE IS COMPUTED, SUGGESTED OR
               DEFAULTED. The date field opens empty and the system
               proposes nothing: a suggested date would assert a period
               nobody has supplied. And nothing here touches the covered
               court's own calendar — `reservations` has no column, no
               policy and no trigger in this phase, and the overlap
               exclusion constraint is not involved. */
            <form className="kp-form" onSubmit={handleSchedule}>
              <h5 className="kp-subhead">Schedule a proceeding</h5>
              <label htmlFor="kp-proceeding">Proceeding</label>
              <select
                id="kp-proceeding"
                value={form.proceedingType}
                onChange={(e) => setForm({ ...form, proceedingType: e.target.value })}
              >
                {KP_PROCEEDING_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>{kpProceedingTypeLabel(key)}</option>
                ))}
              </select>

              <label htmlFor="kp-date">Date</label>
              <input
                id="kp-date"
                type="date"
                value={form.hearingDate}
                onChange={(e) => setForm({ ...form, hearingDate: e.target.value })}
                required
              />

              <label htmlFor="kp-time">Start time</label>
              <input
                id="kp-time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                required
              />

              <label htmlFor="kp-location">Place</label>
              <input
                id="kp-location"
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                required
              />

              <label htmlFor="kp-presiding">Handling assignment (optional)</label>
              <input
                id="kp-presiding"
                type="text"
                value={form.presidingNote}
                onChange={(e) => setForm({ ...form, presidingNote: e.target.value })}
              />

              <label htmlFor="kp-admin-notes">Administrative notes (optional)</label>
              <textarea
                id="kp-admin-notes"
                rows={2}
                value={form.adminNotes}
                onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
              />

              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {busy === 'schedule' ? 'Scheduling...' : 'Schedule proceeding'}
              </button>
            </form>
          )}

          <KpNoticePreview
            kind={notice?.kind}
            kpCase={kpCase}
            hearing={notice?.hearing}
            parties={parties}
            panel={panel}
            open={Boolean(notice)}
            onClose={() => setNotice(null)}
          />
        </>
      )}
    </div>
  )
}

export default KpCasePanel
