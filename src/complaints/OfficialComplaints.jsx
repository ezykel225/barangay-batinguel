import PartyLink from '../casesupport/PartyLink'
import EvidenceActions from '../casesupport/EvidenceActions'
import SupportHistory from '../casesupport/SupportHistory'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FaCommentDots, FaSearch, FaPlus, FaTimes, FaImage, FaVideo, FaFileAlt,
  FaLock, FaCheckCircle, FaExclamationTriangle,
} from 'react-icons/fa'

import {
  complaintCategoryLabel,
  complaintDate,
  describeComplaintStatus,
  intakeChannelLabel,
  formatBytes,
  mediaKindFor,
  COMPLAINT_ERRORS,
} from './complaintLabels'
import {
  QUEUE_CHANNEL_FILTERS,
  QUEUE_STATUS_FILTERS,
  RESTRICTED_DETAIL_MESSAGE,
  filterComplaintQueue,
  queueEmptyMessage,
  summariseComplaintQueue,
} from './complaintQueue'
import {
  listComplaintQueue,
  loadComplaintDetail,
  loadOfficialComplaintRow,
  signedEvidenceUrl,
} from './complaintApi'
import WalkInComplaintForm from './WalkInComplaintForm'
import ScreeningPanel from '../screening/ScreeningPanel'
import KpCasePanel from '../kpcases/KpCasePanel'
import { useConfirm } from '../components/ConfirmDialog'
import { DialogShell } from '../components/OfficialArchiveDialog'
import './Complaints.css'

// The Official Portal's Complaints tab.
//
// ─── ⚠️ WHY THIS IS A COMPONENT AND NOT A BLOCK OF OfficialDashboard ──
//
// `OfficialDashboard.jsx` is ~5,640 lines and already holds every tab's
// state. All complaint state lives here instead, and the dashboard
// contributes ONE line -- the same shape `{activeTab === 'complaints'
// && <MyComplaints />}` takes on the resident side.
//
// ⚠️ A TAB, NOT A NEW ROUTE, and that is what is consistent with this
// router rather than a preference. `/official` is a single
// `<ProtectedRoute allowedRole="official">` wrapping the dashboard,
// which switches on `activeTab`; NOT ONE of the twelve existing
// official tabs has a route of its own. A `/official/complaints` route
// would be the only one, would need its own role gate, and would leave
// the sidebar's `setActiveTab` navigation unable to reach it. So the
// gate stays `allowedRole="official"`, no new role is added, and P1's
// unsupported-role fail-safe is untouched -- an unrecognised role gets
// an empty nav and never reaches this component.
//
// ─── ⚠️ TWO VISIBILITY LAYERS, AND THE DATABASE OWNS BOTH ─────────────
//
// Measured against the live database:
//
//   caller                 queue | full row | parties
//   Barangay Secretary       all |        1 |       1
//   Punong Barangay          all |        1 |       1
//   Barangay Treasurer       all |        0 |       0
//   Kagawad (Peace & Order)  all |        0 |       0
//   nurse / resident           0 |        0 |       0
//
// `complaint_queue()` admits any ACTIVE official;
// `complaint_is_visible_to_caller()` admits the filer, the Secretary
// and the Punong Barangay. So an ordinary official sees that work is
// waiting and how old it is, and no narrative, party, contact or
// evidence.
//
// ⚠️ THE QUEUE IS NEVER HIDDEN BECAUSE THE DETAIL IS RESTRICTED, and an
// empty detail is NOT an error: RLS filters rows without raising, so
// the restricted case arrives as zero rows and no error at all. There
// is no `42501` and no `P0001` in this path to leak, and code that
// surfaced one would be reporting a boundary working as a fault.
//
// ─── ⚠️ IT DECIDES NOTHING ABOUT A COMPLAINT ──────────────────────────
//
// There is no Approve, Reject, Start Mediation, Refer, Settle, Close
// Case, Schedule Hearing or Dismiss control anywhere in this file.
// `complaints_status_check` permits exactly `received`, so nothing can
// move a complaint, and a button that cannot is worse than none. The
// word "case" does not appear on screen either: P3 creates complaints
// and judges nothing -- not jurisdiction, not Katarungang Pambarangay
// eligibility -- and P2.5 found no Lupon, Justice or Katarungan
// committee recorded anywhere from which this system could infer who is
// entitled to make that judgment.
//
// ⚠️ `barangay_officials.committee` IS DESCRIPTIVE DATA, NOT
// AUTHORIZATION DATA. A real `Peace and Order and Appropriation` value
// exists on one Kagawad and it grants nothing here: the column is free
// text with no CHECK, the Edit Official form sends it for any row, and
// `protect_official_record()` does not guard it -- so authorizing on it
// would reproduce migration 028's escalation on an unguarded column.
// Nothing in this file reads it.

const OfficialComplaints = ({ isSecretary = false, isKapitan = false }) => {
  const intakeCloseRef = useRef(null)
  const [encodingBusy, setEncodingBusy] = useState(false)
  const closeRef = useRef(null)
  const bodyRef = useRef(null)
  const activeDetail = useRef(null)
  const detailRequest = useRef(0)
  // ⚠️ The shared confirmation dialog, because confirming a screening is
  // the one action in this phase that records a barangay decision and
  // cannot afterwards be edited. It brings the focus trap, Escape,
  // Enter-defaults-to-Cancel and `aria-modal` every other confirmation in
  // this project already has.
  //
  // ⚠️ `useConfirm()` RETURNS AN ARRAY, AND THIS LINE DESTRUCTURED IT AS
  // AN OBJECT. That is the blocker the repo owner hit in the browser: an
  // array has no `confirm` and no `dialog` property, so BOTH came back
  // `undefined` -- the dialog below rendered nothing, and the `confirm`
  // handed to both panels was not a function. `await confirm({...})` in
  // `ScreeningPanel` therefore threw a TypeError OUTSIDE its try block,
  // inside an async onClick nobody was awaiting, so the rejection was
  // unhandled: no write, no error on screen, no state change. Clicking
  // "Confirm screening" did nothing at all.
  //
  // It was latent through P3-B2 because nothing in THIS file ever called
  // `confirm` -- it only passed it down -- and P4-A's own tests render
  // `ScreeningPanel` directly with their own mock, so they never crossed
  // this line. `screeningConfirmFlow.test.js` renders this component and
  // would fail against the object form.
  //
  // The three working call sites -- ResidentDashboard, NurseDashboard
  // and OfficialDashboard -- all read `const [confirm, confirmDialog]`.
  const [confirm, confirmDialog] = useConfirm()

  // ⚠️ A COUNTER THE SCREENING PANEL BUMPS AND THE KP PANEL WATCHES.
  // They are siblings and neither owns the other's state, but whether a
  // KP case may be opened is decided by this complaint's latest
  // screening -- so confirming a review has to repaint the panel below
  // it. One integer is the whole channel: no screening state is lifted
  // out of `ScreeningPanel` and no case state is lifted out of
  // `KpCasePanel`.
  const [screeningSignal, setScreeningSignal] = useState(0)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [channel, setChannel] = useState('all')

  const [selectedId, setSelectedId] = useState(null)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [selectedId])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRestricted, setDetailRestricted] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [encoding, setEncoding] = useState(false)
  const [encoded, setEncoded] = useState(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setRows(await listComplaintQueue())
    } catch {
      setLoadError(COMPLAINT_ERRORS.queueLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const openDetail = async (id, refresh = false) => {
    if (refresh && activeDetail.current !== id) return
    activeDetail.current = id
    const request = ++detailRequest.current
    setSelectedId(id)
    if (!refresh) setDetail(null)
    setDetailRestricted(false)
    setDetailError('')
    if (!refresh) setDetailLoading(true)
    try {
      // The full row and the three detail RPCs together. Each is gated
      // on the same one predicate, so they agree by construction rather
      // than by two policies happening to match.
      const [rowResult, parts] = await Promise.all([
        loadOfficialComplaintRow(id),
        loadComplaintDetail(id),
      ])
      if (request !== detailRequest.current) return

      if (rowResult.restricted) {
        setDetail(null)
        // ⚠️ Zero rows, no error. The sentence names no position as the
        // gate and states no policy: an ordinary Kagawad cannot grant
        // themselves records access, and telling them which position
        // holds it only invites asking for it.
        setDetailRestricted(true)
      } else {
        setDetail({ row: rowResult.row, ...parts })
      }
    } catch {
      if (request === detailRequest.current) setDetailError(COMPLAINT_ERRORS.detailLoadFailed)
    } finally {
      if (request === detailRequest.current) setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    activeDetail.current = null
    detailRequest.current += 1
    setSelectedId(null)
    setDetail(null)
    setDetailRestricted(false)
    setDetailError('')
  }

  // ⚠️ A SIGNED URL, MINTED PER VIEW AND NEVER STORED. The bucket is
  // private, so `getPublicUrl()` 404s on it even with a permissive
  // policy -- and reaching for it is how a private bucket quietly
  // becomes a public one. Nothing here caches the signature: holding one
  // means a link that outlives the session entitled to it.
  const openEvidence = async (objectPath) => {
    try {
      const url = await signedEvidenceUrl(objectPath)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else toast(COMPLAINT_ERRORS.evidenceUrlFailed)
    } catch {
      toast(COMPLAINT_ERRORS.evidenceUrlFailed)
    }
  }

  const handleEncoded = async (result) => {
    setEncoded(result)
    setEncoding(false)
    if (result.failedFiles?.length) {
      toast(COMPLAINT_ERRORS.encodeEvidencePartial)
    }
    // ⚠️ The toast says a complaint was recorded and NOTHING about what
    // it is about. A category or a narrative excerpt in a toast is the
    // accusation, on a screen somebody may be standing beside.
    await fetchQueue()
  }

  const filtered = filterComplaintQueue(rows, { search, status, channel })
  const summary = summariseComplaintQueue(rows)
  const emptyMessage = queueEmptyMessage({ total: rows.length, filtered: filtered.length })
  const selected = filtered.find((r) => r.id === selectedId)
    || rows.find((r) => r.id === selectedId)

  return (
    <div>
      <div className="official-dashboard-header">
        <h1>Complaints</h1>
        <p>Record and review complaints brought to the barangay.</p>
      </div>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaCommentDots aria-hidden="true" /> Complaint queue</h2>
          {/* ⚠️ RENDERED FOR THE BARANGAY SECRETARY ONLY, because
              `encode_walk_in_complaint()` refuses everybody else with
              `P0001` -- the PUNONG BARANGAY INCLUDED, measured, even
              though he reads every complaint. A control the database
              would refuse is worse than no control. The flag decides
              what is painted; the RPC decides what is permitted. */}
          {isSecretary && (
            <button type="button" className="btn-add" onClick={() => { setEncoded(null); setEncodingBusy(false); setEncoding(true) }}>
              <FaPlus aria-hidden="true" /> Record Walk-in Complaint
            </button>
          )}
        </div>

        {/* The success panel from the last intake, kept until dismissed
            so the Secretary can read the reference onto the
            complainant's slip. */}
        {encoded && (
          <div className="complaint-success" role="status">
            <p className="complaint-success-label">
              <FaCheckCircle aria-hidden="true" /> Complaint recorded
            </p>
            <p className="complaint-success-reference">{encoded.reference}</p>
            <p>
              Give this reference number to the complainant. They will also
              need the contact number recorded on this complaint to track it.
            </p>
            {/* ⚠️ SAID ONLY WHEN IT IS TRUE OF THIS COMPLAINT.
                `track_complaint()` requires a non-empty contact and
                matches it against the complainant's stored one, so a
                complaint recorded without a number can never be
                tracked online -- measured as zero rows for any contact,
                the empty string included. The Secretary needs to know
                that now, at the counter, while the complainant is still
                in front of them. */}
            {!encoded.hasContact && (
              <p className="complaint-success-warning">
                <FaExclamationTriangle aria-hidden="true" /> No contact number
                was recorded, so this complaint cannot be tracked online. The
                complainant will need to ask at the Barangay Hall.
              </p>
            )}
            {encoded.failedFiles?.length > 0 && (
              <p className="complaint-success-warning">
                <FaExclamationTriangle aria-hidden="true" /> Some attachments
                did not upload: {encoded.failedFiles.join(', ')}. The reference
                above is still valid.
              </p>
            )}
            <button type="button" className="btn-cancel btn-sm" onClick={() => setEncoded(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* ⚠️ THE SUMMARY COUNTS WORK WAITING AND SAYS NOTHING ABOUT
            SUBJECT. The breakdown is by CHANNEL, not by category: how
            many arrived at the counter is operational, while how many
            are family disputes is the accusation the queue exists not
            to publish. */}
        {!loading && rows.length > 0 && (
          <p className="complaint-queue-summary">
            {summary.total} total · {summary.online} {intakeChannelLabel('online').toLowerCase()}
            {' '}· {summary.walkIn} {intakeChannelLabel('walk_in').toLowerCase()}
          </p>
        )}

        {/* The filter bar renders only once something exists, so an
            empty queue does not offer controls that can narrow
            nothing -- the rule the Document Requests bar follows. */}
        {!loading && rows.length > 0 && (
          <div className="resident-filter-bar">
            <div className="resident-search-field">
              <FaSearch className="resident-search-icon" aria-hidden="true" />
              {/* A real label, not a bare placeholder: a placeholder
                  disappears on the first keystroke and is not a name for
                  assistive technology. Hidden visually because the
                  magnifier and the placeholder already say what it is --
                  the same pattern `DashboardFilterBar` uses. */}
              <label htmlFor="complaint-queue-search" className="visually-hidden">
                Search complaints by reference number
              </label>
              <input
                id="complaint-queue-search"
                type="search"
                className="resident-search-input"
                placeholder="Search by reference number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-describedby="complaint-queue-search-note"
              />
              {search !== '' && (
                <button
                  type="button"
                  className="resident-search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Clear the search box"
                >
                  <FaTimes aria-hidden="true" />
                </button>
              )}
            </div>
            {/* ⚠️ THE REFERENCE IS THE ONLY SEARCHABLE FIELD, and the
                note says so rather than leaving an official to discover
                it. A narrative or a party name is not merely
                unimplemented: neither is in the queue's output, and the
                table refuses an ordinary official every row. */}
            <p className="field-note" id="complaint-queue-search-note">
              Reference number only.
            </p>

            <div className="filter-select-wrap">
              <label htmlFor="complaint-queue-status" className="visually-hidden">
                Filter by status
              </label>
              <select
                className="filter-select"
                id="complaint-queue-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {QUEUE_STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-select-wrap">
              <label htmlFor="complaint-queue-channel" className="visually-hidden">
                Filter by how the complaint arrived
              </label>
              <select
                className="filter-select"
                id="complaint-queue-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {QUEUE_CHANNEL_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {loading && <p className="complaint-empty">Loading complaints...</p>}
        {loadError && <p className="complaint-field-error" role="alert">{loadError}</p>}

        {!loading && !loadError && emptyMessage && (
          <p className="complaint-empty">{emptyMessage}</p>
        )}

        {!loading && !loadError && filtered.length > 0 && (
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>How it arrived</th>
                  <th>Status</th>
                  {/* "Date received", not "Received": the status badge in
                      the next column also reads "Received", and two
                      near-identical strings side by side read as a
                      fault -- the defect HEALTH_NURSE_ROLE exists to
                      prevent. */}
                  <th>Date received</th>
                  <th>Last updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {/* ⚠️ NO NARRATIVE, NO PARTY NAME AND NO CONTACT NUMBER
                    IN A QUEUE ROW. `complaint_queue()` does not return
                    them, and this table does not ask a second source
                    for them -- `complaints` refuses an ordinary
                    official every row anyway. There is no category
                    column either, and that is the decision rather than
                    an omission: a row reading `family_dispute` beside a
                    date, visible to all eleven officials, is an
                    accusation about an identifiable household. */}
                {filtered.map((row) => {
                  const badge = describeComplaintStatus(row.status)
                  return (
                    <tr key={row.id} className={row.id === selectedId ? 'is-selected' : ''}>
                      <td data-label="Reference">
                        <span className="complaint-reference">{row.reference}</span>
                      </td>
                      <td data-label="How it arrived">{intakeChannelLabel(row.intake_channel)}</td>
                      <td data-label="Status">
                        <span className={`status-badge ${badge.className}`} title={row.status}>
                          {badge.label}
                        </span>
                      </td>
                      <td data-label="Date received">{complaintDate(row.created_at)}</td>
                      <td data-label="Last updated">{complaintDate(row.updated_at)}</td>
                      <td data-label="Action">
                        <button
                          type="button"
                          className="btn-add btn-sm"
                          onClick={() => openDetail(row.id)}
                          /* Every row's button would otherwise be
                             announced "View" alone; the reference is
                             what tells them apart, and it is a SUFFIX so
                             the visible word stays the first word of
                             the accessible name (WCAG 2.5.3). */
                          aria-label={`View complaint ${row.reference}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── The detail panel ──────────────────────────────────────── */}
      {selectedId && (
        <div className="official-complaint-modal" aria-hidden={confirmDialog.props.open || undefined} inert={confirmDialog.props.open || undefined}>
        <DialogShell open titleId="complaint-dialog-title" title="Complaint Details"
          onCancel={closeDetail} initialFocusRef={closeRef} keyboardSuspended={confirmDialog.props.open}
          header={<header className="complaint-modal-header">
            <h3 className="confirm-dialog-title" id="complaint-dialog-title">Complaint Details</h3>
            <button type="button" ref={closeRef} className="btn-cancel complaint-modal-close" aria-label="Close complaint details" onClick={closeDetail}><FaTimes aria-hidden="true" /></button>
            <div className="complaint-modal-identity">
              <p className="complaint-reference">{selected?.reference || ''}</p>
              {selected && <span className={`status-badge ${describeComplaintStatus(selected.status).className}`}>{describeComplaintStatus(selected.status).label}</span>}
            </div>
          </header>}>
          <div ref={bodyRef} key={selectedId} className="complaint-detail-panel complaint-modal-body">
          {detailLoading && <p className="complaint-empty">Loading complaint...</p>}
          {detailError && <p className="complaint-field-error" role="alert">{detailError}</p>}

          {/* ⚠️ THE RESTRICTED STATE. Not an error, and not an empty
              screen: the official is told the boundary exists in one
              neutral sentence, and the queue above stays on screen. No
              filename, no storage path, no party name, no attachment
              count and no statement of which position holds access --
              nothing that would describe what is being withheld. */}
          {!detailLoading && detailRestricted && (
            <div className="complaint-restricted" role="note">
              <FaLock aria-hidden="true" />
              <p>{RESTRICTED_DETAIL_MESSAGE}</p>
            </div>
          )}

          {!detailLoading && detail?.row && (
            <>
              <section className="complaint-section" aria-label="Complaint information">
              <h3>Complaint details</h3>
              <dl className="complaint-detail-list complaint-summary-grid">
                <div className="complaint-detail-row">
                  <dt>What it is about</dt>
                  <dd>{complaintCategoryLabel(detail.row.category)}</dd>
                </div>
                <div className="complaint-detail-row">
                  <dt>How it arrived</dt>
                  <dd>{intakeChannelLabel(detail.row.intake_channel)}</dd>
                </div>
                <div className="complaint-detail-row">
                  <dt>Status</dt>
                  <dd>
                    <span
                      className={`status-badge ${describeComplaintStatus(detail.row.status).className}`}
                      title={detail.row.status}
                    >
                      {describeComplaintStatus(detail.row.status).label}
                    </span>
                  </dd>
                </div>
                <div className="complaint-detail-row">
                  <dt>Date received</dt>
                  <dd>{complaintDate(detail.row.created_at)}</dd>
                </div>
                {/* ⚠️ The row is omitted entirely when nothing was
                    recorded, rather than printing a label with a blank
                    after it -- which reads as a value that failed to
                    load. The same rule the event detail page's Time row
                    follows. */}
                {detail.row.location_note && (
                  <div className="complaint-detail-row">
                    <dt>Where it happened</dt>
                    <dd>{detail.row.location_note}</dd>
                  </div>
                )}
              </dl>

              <h3>What was reported</h3>
              <p className="complaint-detail-narrative">{detail.row.narrative}</p>

              </section>
              <section className="complaint-section" aria-label="People involved">
              <h3>People involved</h3>
              {detail.parties.length === 0 ? (
                <p className="complaint-empty">No parties were recorded.</p>
              ) : (
                <ul className="complaint-party-list">
                  {detail.parties.map((party) => (
                    <li key={party.id} className="complaint-party">
                      <span className="complaint-party-role">{party.party_role}</span>
                      <span className="complaint-party-name">{party.full_name_snapshot}</span>
                      <PartyLink party={party} onChanged={() => openDetail(detail.row.id)} />
                      {/* ⚠️ A NULL CONTACT IS RENDERED AS A STATEMENT,
                          NOT AS A BLANK. `complaint_parties_for()`
                          returns it as NULL for a caller who may not
                          see it, and nothing here reconstructs it --
                          there is no other source, because
                          `complaint_parties` carries no client
                          privilege at all. An empty cell would read as
                          missing data rather than as a rule. */}
                      <span className="complaint-party-contact">
                        {party.contact_number_snapshot || 'No contact number recorded'}
                      </span>
                      {party.address_note && (
                        <span className="complaint-party-address">{party.address_note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              </section>
              <section className="complaint-section complaint-evidence-card" aria-label="Evidence">
              <div className="complaint-section-heading"><h3>Evidence</h3><span className="complaint-private-label"><FaLock aria-hidden="true" /> Private evidence</span></div>
              <EvidenceActions complaintId={detail.row.id} attachments={detail.attachments} onChanged={() => openDetail(detail.row.id, true)}>
              <div className="complaint-evidence-block"><h4>Attached evidence</h4>
              {detail.attachments.length === 0 ? (
                <p className="complaint-empty">No files were attached.</p>
              ) : (
                <ul className="complaint-file-list">
                  {detail.attachments.map((file) => (
                    <li key={file.id} className="complaint-file">
                      {file.media_kind === 'photo' ? <FaImage className="complaint-evidence-icon" aria-hidden="true" />
                        : file.media_kind === 'video' ? <FaVideo className="complaint-evidence-icon" aria-hidden="true" />
                          : <FaFileAlt className="complaint-evidence-icon" aria-hidden="true" />}
                      <span className="complaint-file-name">{file.display_filename}</span>
                      <span className="complaint-file-meta">
                        {file.mime_type === 'text/plain' ? 'Witness statement' : mediaKindFor(file.mime_type)} · {formatBytes(file.byte_size)}
                      </span>
                      <button
                        type="button"
                        className="btn-add btn-sm"
                        onClick={() => openEvidence(file.object_path)}
                        aria-label={`Open ${file.display_filename}`}
                      >
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              </div>
              </EvidenceActions>
              <SupportHistory complaintId={detail.row.id} version={detail} attachments={detail.attachments} />
              </section>
              <section className="complaint-section complaint-history-card" aria-label="Complaint history">
              <h3>History</h3>
              {/* ⚠️ NO ACTOR IS SHOWN, because
                  `complaint_history_for()` does not return one -- it
                  selects id, from_status, to_status, note and
                  created_at and deliberately omits
                  `actor_profile_id`. Displaying a field the RPC
                  withholds would mean querying
                  `complaint_status_history` directly, which carries no
                  client privilege and would be refused. */}
              {detail.history.length === 0 ? (
                <p className="complaint-empty">No history was recorded.</p>
              ) : (
                <ul className="complaint-history-list">
                  {detail.history.map((entry) => (
                    <li key={entry.id}>
                      <span className="complaint-history-when">
                        {complaintDate(entry.created_at)}
                      </span>
                      <span className="complaint-history-what">
                        {describeComplaintStatus(entry.to_status).label}
                      </span>
                      {entry.note && (
                        <span className="complaint-history-note">{entry.note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* ── KP review screening (P4-A) ──────────────────────
                  ⚠️ A SEPARATE COMPONENT, not another block of state in
                  this one. `OfficialComplaints` already holds the queue,
                  the filters and the detail; the screening keeps its own
                  state in `ScreeningPanel` and this file passes it three
                  things.

                  ⚠️ `isSecretary` and `isKapitan` decide WHICH CONTROLS
                  ARE PAINTED and nothing more. `prepare_complaint_screening()`
                  raises P0001 unless the caller holds `Barangay Secretary`
                  and `confirm_complaint_screening()` unless they hold
                  `Punong Barangay`, both resolved through
                  `official_account_links` -- and `complaint_screenings_for()`
                  returns ZERO ROWS to anybody who is neither, measured.
                  So the database decides and this only avoids painting a
                  control it would refuse.

                  ⚠️ It renders only inside the AUTHORIZED detail branch,
                  so an official who cannot read the complaint at all
                  never reaches it. */}
              </section>
              <section className="complaint-section complaint-screening-card" aria-label="KP review screening">
              <h3>KP review screening</h3>
              <ScreeningPanel
                complaintId={detail.row.id}
                isSecretary={isSecretary}
                isKapitan={isKapitan}
                confirm={confirm}
                onScreeningChanged={() => setScreeningSignal((n) => n + 1)}
              />

              {/* ── KP case (Combined Phase 1) ──────────────────────
                  ⚠️ A SEPARATE COMPONENT AGAIN, for the reason the
                  screening panel is one: `OfficialComplaints` already
                  holds the queue, the filters and the detail, and
                  `OfficialDashboard` is ~5,640 lines. All case, panel,
                  hearing, attendance and notice state lives in
                  `KpCasePanel`; this file passes it three things and the
                  dashboard passes one more prop.

                  ⚠️ `isSecretary` and `isKapitan` decide WHICH CONTROLS
                  ARE PAINTED and nothing more. `open_kp_case()` and
                  `record_kp_hearing_outcome()` raise P0001 unless the
                  caller holds `Punong Barangay`; the three
                  administrative writers unless they hold `Barangay
                  Secretary` or `Punong Barangay` -- all resolved through
                  `official_account_links`, never a name and never
                  `committee`. The five readers return ZERO ROWS to
                  anybody who is neither, measured. So the database
                  decides and this only avoids painting a control it
                  would refuse.

                  ⚠️ THE PARAGRAPH THAT WAS HERE SAID CASE HANDLING WAS
                  "not part of this system yet", AND THAT IS NOW UNTRUE.
                  It is replaced rather than left beside the panel it
                  would contradict -- the same correction P4-A made to
                  the sentence before it, and the reason that sentence
                  was reworded rather than loosened.

                  ⚠️ It renders only inside the AUTHORIZED detail branch,
                  so an official who cannot read the complaint at all
                  never reaches it, and no resident or public surface
                  renders it at any point. */}
              </section>
              <section className="complaint-section" aria-label="KP case">
              <h3>KP case</h3>
              <KpCasePanel
                complaintId={detail.row.id}
                complaint={detail.row}
                isSecretary={isSecretary}
                isKapitan={isKapitan}
                confirm={confirm}
                screeningSignal={screeningSignal}
              />
              </section>
            </>
          )}
          </div>
        </DialogShell>
        </div>
      )}
      {encoding && <div className="walkin-modal">
        <DialogShell open titleId="walkin-dialog-title" title="Record Walk-in Complaint"
          busy={encodingBusy} onCancel={() => setEncoding(false)} initialFocusRef={intakeCloseRef}
          header={<header className="walkin-modal-header">
            <h3 className="confirm-dialog-title" id="walkin-dialog-title">Record Walk-in Complaint</h3>
            <p>Record a complaint received at the Barangay Hall.</p>
            <button type="button" className="btn-cancel walkin-modal-close" ref={intakeCloseRef}
              aria-label="Close walk-in complaint" disabled={encodingBusy} onClick={() => setEncoding(false)}><FaTimes aria-hidden="true" /></button>
          </header>}>
          <WalkInComplaintForm onEncoded={handleEncoded} onCancel={() => setEncoding(false)} onBusyChange={setEncodingBusy} />
        </DialogShell>
      </div>}
      {confirmDialog}
    </div>
  )
}

export default OfficialComplaints
