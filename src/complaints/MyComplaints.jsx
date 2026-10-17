import { useCallback, useEffect, useRef, useState } from 'react'
import { FaPlus, FaPaperclip, FaCheckCircle, FaTimes } from 'react-icons/fa'
import { useModalA11y } from '../components/useModalA11y'
import FileComplaintForm from './FileComplaintForm'
import {
  COMPLAINT_ERRORS,
  complaintCategoryLabel,
  complaintDate,
  describeComplaintStatus,
  formatBytes,
  mediaKindFor,
} from './complaintLabels'
import {
  listMyComplaints,
  loadComplaintDetail,
  signedEvidenceUrl,
} from './complaintApi'
import './Complaints.css'

// The resident's own complaints, and the form that files one.
//
// ─── ⚠️ WHAT A RESIDENT SEES IS DECIDED BY THE DATABASE ───────────────
//
// The list is a plain `select` on `complaints`, whose SELECT policy
// admits the filing resident's own rows and nothing else -- so there is
// no `.eq('filed_by_profile_id', …)` here on purpose: writing one would
// imply the filter is what protects the data. The detail panel reads
// parties, history and attachments through their three RPCs, each
// gated on the same `complaint_is_visible_to_caller()` predicate.
//
// ⚠️ A RESPONDENT'S CONTACT NUMBER COMES BACK NULL and is rendered as
// "Not shown to you". `complaint_parties_for()` nulls the column for
// any party that is not the caller, and nothing here reconstructs it --
// there is no second source, because `complaint_parties` carries no
// client privilege at all.

const MyComplaints = () => {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [filed, setFiled] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [evidenceProblem, setEvidenceProblem] = useState('')

  // Focus lands on the reference after a successful filing, so a
  // keyboard or screen-reader user meets the thing they must write down
  // rather than being left where the submit button used to be.
  const referenceRef = useRef(null)
  const newButtonRef = useRef(null)

  useModalA11y(showForm, () => setShowForm(false))

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setComplaints(await listMyComplaints())
      setProblem('')
    } catch {
      setProblem(COMPLAINT_ERRORS.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (filed && referenceRef.current) referenceRef.current.focus()
  }, [filed])

  const handleFiled = (result) => {
    setShowForm(false)
    setFiled(result)
    refresh()
  }

  const openDetail = async (complaintId) => {
    if (openId === complaintId) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(complaintId)
    setDetail(null)
    setEvidenceProblem('')
    try {
      setDetailLoading(true)
      setDetail(await loadComplaintDetail(complaintId))
    } finally {
      setDetailLoading(false)
    }
  }

  // ⚠️ Minted on the click and followed immediately, never stored. A
  // signed URL is a bearer token for one object; keeping one in state
  // means a link that outlives the session entitled to it. An expired
  // or refused signature gets a neutral retry message rather than the
  // storage error.
  const openEvidence = async (objectPath) => {
    setEvidenceProblem('')
    try {
      const url = await signedEvidenceUrl(objectPath)
      if (!url) throw new Error('no-url')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setEvidenceProblem(COMPLAINT_ERRORS.evidenceUrlFailed)
    }
  }

  return (
    <div>
      <div className="resident-dashboard-header">
        <h1>Complaints</h1>
        <p>File a complaint with the barangay and follow what happens to it.</p>
      </div>

      {filed && (
        <div className="complaint-success" role="status">
          <h2 className="section-heading">
            <FaCheckCircle aria-hidden="true" /> Complaint received
          </h2>
          {/* ⚠️ "Received for barangay review", not "accepted" and not
              "your case". P3-A records a complaint and decides nothing:
              no jurisdiction, no mediation, no hearing. */}
          <p>Your complaint has been received for barangay review.</p>

          <p className="complaint-success-label" id="filed-reference-label">
            Your reference number
          </p>
          <p
            className="complaint-success-reference"
            ref={referenceRef}
            tabIndex={-1}
            aria-labelledby="filed-reference-label"
          >
            {filed.reference}
          </p>
          <p className="complaint-success-note">
            Please write this down or screenshot it. You will need it, together
            with your contact number, to check this complaint without signing in.
          </p>

          {/* ⚠️ The complaint ALREADY EXISTS when evidence fails --
              attachments can only be uploaded after the complaint row
              is created, because the storage path is its own id. So a
              failed file is reported beside a valid reference, never as
              a lost complaint. */}
          {filed.failedFiles?.length > 0 && (
            <p className="complaint-success-warning" role="alert">
              {COMPLAINT_ERRORS.evidencePartial}
            </p>
          )}

          {/* The same Close the official detail panel uses, so a resident
              and an official are not shown two spellings of one control. */}
          <button type="button" className="btn-cancel" onClick={() => setFiled(null)}>
            <FaTimes aria-hidden="true" /> Close
          </button>
        </div>
      )}

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>My Complaints</h2>
          {/* ⚠️ `type="button"` EXPLICITLY. A <button> defaults to
              `submit`, and this was the one control in the complaint,
              screening, KP, incident and Tanod modules without it. */}
          <button
            type="button"
            className="btn-add"
            ref={newButtonRef}
            onClick={() => setShowForm(true)}
          >
            <FaPlus aria-hidden="true" /> File a Complaint
          </button>
        </div>

        {problem && <p className="complaint-field-error" role="alert">{problem}</p>}

        {loading ? (
          <p>Loading...</p>
        ) : complaints.length === 0 ? (
          <p className="complaint-empty">You have not filed any complaints yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">About</th>
                  <th scope="col">Status</th>
                  {/* ⚠️ "Date received", not "Received" -- the status
                      badge in the previous column also reads "Received",
                      and two columns saying the same word is the
                      near-identical-strings-stacked fault
                      HEALTH_NURSE_ROLE exists to prevent. Found by a
                      test that could not tell the two apart either. */}
                  <th scope="col">Date received</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => {
                  const status = describeComplaintStatus(c.status)
                  return (
                    <tr key={c.id}>
                      <td data-label="Reference">
                        <span className="complaint-reference">{c.reference}</span>
                      </td>
                      <td data-label="About">{complaintCategoryLabel(c.category)}</td>
                      <td data-label="Status">
                        <span className={`badge ${status.className}`} title={c.status}>
                          {status.label}
                        </span>
                      </td>
                      <td data-label="Date received">{complaintDate(c.created_at)}</td>
                      <td data-label="Details">
                        <button
                          type="button"
                          className="btn-add btn-sm"
                          onClick={() => openDetail(c.id)}
                          aria-expanded={openId === c.id}
                          aria-controls={`complaint-detail-${c.id}`}
                          aria-label={
                            openId === c.id
                              ? `Hide details for ${c.reference}`
                              : `Show details for ${c.reference}`
                          }
                        >
                          {openId === c.id ? 'Hide' : 'View'}
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

      {openId && (() => {
        const current = complaints.find((c) => c.id === openId)
        if (!current) return null
        const status = describeComplaintStatus(current.status)
        return (
          <div className="dashboard-card complaint-detail" id={`complaint-detail-${openId}`}>
            <h2 className="complaint-detail-reference">{current.reference}</h2>
            {status.explanation && (
              <p className="complaint-detail-status">{status.explanation}</p>
            )}

            <dl className="complaint-detail-list">
              <div className="complaint-detail-row">
                <dt>About</dt>
                <dd>{complaintCategoryLabel(current.category)}</dd>
              </div>
              <div className="complaint-detail-row">
                <dt>Received</dt>
                <dd>{complaintDate(current.created_at)}</dd>
              </div>
              {current.location_note && (
                <div className="complaint-detail-row">
                  <dt>Where</dt>
                  <dd>{current.location_note}</dd>
                </div>
              )}
              <div className="complaint-detail-row">
                <dt>What you wrote</dt>
                <dd className="complaint-detail-narrative">{current.narrative}</dd>
              </div>
            </dl>

            {detailLoading && <p>Loading details...</p>}

            {detail && (
              <>
                <h3>People named</h3>
                {detail.parties.length === 0 ? (
                  <p className="complaint-empty">Nobody else is recorded on this complaint.</p>
                ) : (
                  <ul className="complaint-party-list">
                    {detail.parties.map((p) => (
                      <li key={p.id} className="complaint-party">
                        <span className="complaint-party-role">
                          {p.party_role === 'complainant' ? 'You filed this'
                            : p.party_role === 'respondent' ? 'Complaint is about'
                              : 'Witness'}
                        </span>
                        <span className="complaint-party-name">{p.full_name_snapshot}</span>
                        {/* ⚠️ NULL for anybody but the caller, straight
                            from `complaint_parties_for()`. Rendered as a
                            statement rather than an empty cell, so the
                            absence reads as a rule and not as missing
                            data. */}
                        <span className="complaint-party-contact">
                          {p.contact_number_snapshot || 'Contact not shown to you'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <h3>Files you attached</h3>
                {evidenceProblem && (
                  <p className="complaint-field-error" role="alert">{evidenceProblem}</p>
                )}
                {detail.attachments.length === 0 ? (
                  <p className="complaint-empty">No files are attached to this complaint.</p>
                ) : (
                  <ul className="complaint-file-list">
                    {detail.attachments.map((a) => (
                      <li key={a.id} className="complaint-file">
                        <FaPaperclip aria-hidden="true" />
                        <span className="complaint-file-name">{a.display_filename}</span>
                        <span className="complaint-file-meta">
                          {mediaKindFor(a.mime_type)} · {formatBytes(a.byte_size)}
                        </span>
                        <button
                          type="button"
                          className="btn-add btn-sm"
                          onClick={() => openEvidence(a.object_path)}
                          aria-label={`Open ${a.display_filename}`}
                        >
                          Open
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )
      })()}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="modal complaint-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-complaint-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="file-complaint-title">File a Complaint</h2>
            <FileComplaintForm
              onFiled={handleFiled}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default MyComplaints
