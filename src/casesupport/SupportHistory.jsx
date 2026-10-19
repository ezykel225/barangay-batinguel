import { useEffect, useRef, useState } from 'react'
import { caseRpc } from './caseSupportApi'

const labels = {
  evidence_uploaded: 'Evidence uploaded', evidence_withdrawn: 'Evidence withdrawn',
  followups_saved: 'Case follow-up updated', party_link_changed: 'Resident linkage updated',
  incident_linked: 'Incident linked to KP case',
}
const stampedAt = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'Date not recorded'
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
  return `${day} · ${time}`
}

export default function SupportHistory({ complaintId, version, attachments = [] }) {
  const [rows, setRows] = useState([])
  const [failed, setFailed] = useState(false)
  const knownFiles = useRef({})
  useEffect(() => {
    let live = true
    caseRpc('case_support_history', { p_complaint_id: complaintId }).then((data) => { if (live) { setRows(data || []); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [complaintId, version])
  useEffect(() => {
    attachments.forEach((file) => { knownFiles.current[`${complaintId}/${file.id}`] = file.display_filename })
  }, [attachments, complaintId])
  return <details className="complaint-audit"><summary>Evidence and case-support audit</summary>
    {failed ? <p>Audit unavailable. Check access or migration setup.</p> : rows.length === 0 ? <p className="field-note">No support activity recorded yet.</p> : <ol className="complaint-audit-timeline">{rows.map((r) => {
      const detail = r.detail || {}
      const filename = attachments.find((file) => file.id === detail.attachment_id)?.display_filename
        || knownFiles.current[`${complaintId}/${detail.attachment_id}`]
      return <li key={r.id}>
        <strong>{Object.prototype.hasOwnProperty.call(labels, r.event_kind) ? labels[r.event_kind] : 'Case support activity recorded'}</strong>
        <time dateTime={r.created_at}>{stampedAt(r.created_at)}</time>
        {(r.event_kind === 'evidence_uploaded' || r.event_kind === 'evidence_withdrawn') && <span>{filename || 'Evidence file (name unavailable in active attachments)'}</span>}
        {r.event_kind === 'evidence_withdrawn' && typeof detail.reason === 'string' && <p>Reason: {detail.reason}</p>}
        {r.event_kind === 'followups_saved' && <><span>Official-entered dates and follow-up record saved.</span>
          {typeof detail.compliance_status === 'string' && <span>Compliance: {({ not_recorded: 'Not recorded', pending: 'Pending', completed: 'Completed', not_met: 'Not met; official review required' })[detail.compliance_status] || 'Recorded'}</span>}
          {typeof detail.settlement_terms === 'string' && detail.settlement_terms && <p>Recorded settlement terms: {detail.settlement_terms}</p>}
          {typeof detail.review_note === 'string' && detail.review_note && <p>Official review note: {detail.review_note}</p>}
          {['mediation_due','conciliation_due','repudiation_end','compliance_due'].map((key) => detail[key] && <span key={key}>{({ mediation_due: 'Mediation due', conciliation_due: 'Conciliation due', repudiation_end: 'Repudiation end', compliance_due: 'Compliance due' })[key]}: {detail[key]}</span>)}
        </>}
        {r.event_kind === 'party_link_changed' && <span>{detail.record_kind === 'external' ? 'Party kept external / resident link removed.' : 'Existing resident record selected by staff.'}</span>}
      </li>
    })}</ol>}
  </details>
}
