import { useState } from 'react'
import { useModalA11y } from '../components/useModalA11y'
import { DocumentShell, DocumentFields } from '../documents/DocumentShell'
import { manilaDate } from './caseSupportApi'
import '../documents/DocumentPreview.css'
import '../documents/print/DocumentPrint.css'

const titles = { complaint: 'KP complaint form', settlement: 'Amicable settlement', certificate: 'Certificate to file action' }
export default function CaseProjectDocuments({ kpCase, parties = [], complaint, followups }) {
  const [kind, setKind] = useState('')
  const close = () => setKind('')
  useModalA11y(Boolean(kind), close)
  const text = kind === 'complaint' ? complaint?.narrative : kind === 'settlement' ? followups.settlement_terms : followups.review_note
  return <><h4>Additional project document templates</h4>
    <p className="kp-hint">LGU/legal review is required before official use. These drafts do not issue or certify a legal action.</p>
    <div className="modal-actions">{Object.entries(titles).map(([key,title]) => <button className="btn-add btn-sm" type="button" key={key} onClick={() => setKind(key)}>Preview {title.toLowerCase()}</button>)}</div>
    {kind && <div className="modal-overlay doc-preview-overlay"><div className="modal doc-preview kp-doc-preview" role="dialog" aria-modal="true" aria-labelledby="case-project-title">
      <div className="doc-preview-bar no-print"><button type="button" className="doc-preview-back" onClick={close}>Back to case</button>
        <h2 id="case-project-title">{titles[kind]} — project template</h2>
        <button type="button" className="doc-preview-print" disabled={!text?.trim() || !parties.length} onClick={() => window.print()}>Print draft</button></div>
      {!text?.trim() && <p role="alert">Record the relevant complaint, settlement terms or official review note before printing.</p>}
      <div className="doc-preview-stage"><div className="doc-preview-scale"><DocumentShell title={`${titles[kind]} — PROJECT TEMPLATE`} reference={kpCase.reference} issueDate={manilaDate()} signatory={{ name: '[AUTHORIZED SIGNATORY]', position: '[POSITION]' }}>
        <p><strong>LGU/LEGAL REVIEW REQUIRED — not an official legal or statutory form.</strong></p>
        {kind === 'certificate' && <p>Review draft only. This document does not certify eligibility to file action or establish that legal prerequisites have been met.</p>}
        <DocumentFields rows={[{ label: 'Complaint reference', value: kpCase.complaint_reference }, { label: 'Case status', value: kpCase.status }, ...parties.map((p, i) => ({ label: `${p.party_role} ${i + 1}`, value: p.party_name }))]} />
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text || 'No supporting text recorded.'}</p>
      </DocumentShell></div></div>
    </div></div>}
  </>
}
