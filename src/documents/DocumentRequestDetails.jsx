import { useEffect, useRef, useState } from 'react'
import { FaRegFileAlt, FaUser, FaShieldAlt, FaTasks, FaHistory } from 'react-icons/fa'
import { DialogShell } from '../components/OfficialArchiveDialog'
import { documentStatusClass, documentStatusLabel } from '../utils/displayLabels'
import ClearanceWarning from '../casesupport/ClearanceWarning'
import { loadDocumentRequestHistory } from './documentRequestHistory'
import DocumentRequirements from './DocumentRequirements.jsx'
import './DocumentRequests.css'

const stamp = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(value)) : 'Not recorded'

export default function DocumentRequestDetails({ request, resident, canReviewCase = false, isSecretary = false, actions = [], busy = false, onAction, onClose }) {
  const closeRef = useRef(null)
  const [history, setHistory] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setHistory(null); setFailed(false)
    loadDocumentRequestHistory(request.id).then((rows) => { if (live) setHistory(rows) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [request.id, request.updated_at])
  return <div className="dr-details"><DialogShell open titleId="dr-detail-title" title="Document Request" onCancel={onClose} initialFocusRef={closeRef}
    actions={<button type="button" className="confirm-dialog-cancel" onClick={onClose}>Close</button>}>
    <button className="dr-close btn-cancel" type="button" ref={closeRef} aria-label="Close document request details" onClick={onClose}>&times;</button>
    <header className="dr-detail-header"><h4>{request.full_name}</h4><p>{request.document_type}</p><span className={'badge ' + documentStatusClass(request.status)}>{documentStatusLabel(request.status)}</span></header>
    <section className="dr-summary-section" aria-labelledby="dr-info-heading"><h4 id="dr-info-heading"><FaRegFileAlt aria-hidden="true" /> Request Information</h4>
      <dl className="dr-info"><div><dt>Purpose</dt><dd>{request.purpose || 'Not recorded'}</dd></div><div><dt>Submitted (Philippines)</dt><dd>{stamp(request.created_at)}</dd></div>
        <div><dt>Contact number</dt><dd>{request.contact_number || 'Not recorded'}</dd></div><div><dt>Purok as submitted</dt><dd>{request.purok || 'Not recorded'}</dd></div>
      </dl>
      {request.additional_notes?.trim() ? <div className="dr-additional"><h5>Additional notes</h5><p>{request.additional_notes}</p></div> : <p className="dr-muted dr-empty-notes">No additional notes</p>}
    </section>
    <DocumentRequirements documentType={request.document_type} audience="official" />
    <section className="dr-card dr-profile-card" aria-labelledby="dr-resident-heading"><h4 id="dr-resident-heading"><FaUser aria-hidden="true" /> Resident Profile</h4>
      <p><span className={'badge ' + (request.resident_id ? 'badge-approved' : 'badge-pending')}>{request.resident_id ? 'Linked resident account' : 'Unlinked request'}</span></p>
      <p className="dr-profile-name">{resident?.full_name || request.full_name}</p>
      <p className="dr-muted">{resident ? 'Account verification: ' + (resident.verification_status || 'Not recorded') : request.resident_id ? 'Profile verification information is not available in the loaded authorized records. Review manually.' : 'No resident account is linked. Do not match a resident by name; manual review is required.'}</p>
    </section>
    {request.document_type === 'Barangay Clearance' && <section className={'dr-card dr-case-review' + (canReviewCase && (!request.resident_id || !resident) ? ' dr-manual-review' : '')} aria-labelledby="dr-case-heading"><h4 id="dr-case-heading"><FaShieldAlt aria-hidden="true" /> Clearance / Case Review</h4>
      {!canReviewCase ? <p className="dr-muted">Case review is available only to authorized records staff.</p> : !request.resident_id ? <p>Manual review required: this request is not linked to a resident profile.</p> : !resident ? <p>Manual review required: a linked resident profile could not be confirmed from the available authorized records.</p> : <ClearanceWarning requestId={request.id} />}
      <p className="dr-muted">Review aid only. This indicator does not approve or deny clearance.</p>
    </section>}
    <section className="dr-card dr-processing-card" aria-labelledby="dr-processing-heading"><h4 id="dr-processing-heading"><FaTasks aria-hidden="true" /> Official Processing</h4>
      <div className="dr-current-status"><span>Current status</span><span className={'badge ' + documentStatusClass(request.status)}>{documentStatusLabel(request.status)}</span></div>
      <dl><dt>Official notes</dt><dd className="dr-notes">{request.reviewer_notes || 'No official notes recorded.'}</dd></dl>
      <p className="dr-muted">Official notes include the explanation recorded through the existing decline action.</p>
      <div className="dr-action-bar">{actions.map((action) => <button type="button" className={action.danger ? 'btn-deny' : 'btn-add'} key={action.key} disabled={busy} onClick={() => onAction(action)}>{action.icon}{action.label}</button>)}</div>
      {!isSecretary && <p className="role-restricted-note">Secretary only: request processing actions.</p>}
      {isSecretary && !actions.length && <p className="dr-muted">No processing actions are available for this status.</p>}
    </section>
    <section className="dr-card dr-history-card" aria-labelledby="dr-history-heading"><h4 id="dr-history-heading"><FaHistory aria-hidden="true" /> History</h4>
      <p className="dr-muted">Activity history is best-effort and may not represent every status change.</p>
      {failed ? <p role="status">Request activity could not be loaded.</p> : history === null ? <p role="status">Loading recorded activity...</p> : !history.length ? <p>No activity entries are available for this request.</p> : <ol className="dr-timeline">{history.map((entry) => <li key={entry.id}><strong>{documentStatusLabel(entry.action)}</strong><time dateTime={entry.created_at}>{stamp(entry.created_at)}</time>{entry.details && <p>{entry.details}</p>}</li>)}</ol>}
    </section>
  </DialogShell></div>
}
