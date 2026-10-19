import { useRef, useState } from 'react'
import { uploadEvidence } from '../complaints/complaintApi'
import { EVIDENCE_ACCEPT, EVIDENCE_MAX_FILES, EVIDENCE_TYPES_LABEL, EVIDENCE_MAX_LABEL, evidenceProblem } from '../complaints/complaintLabels'
import { caseRpc } from './caseSupportApi'

export default function EvidenceActions({ complaintId, attachments = [], onChanged, children }) {
  const [file, setFile] = useState(null)
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const picker = useRef(null)
  const selectedActive = attachments.some((attachment) => attachment.id === selected)
  const run = async (work) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage('')
    try { await work(); await onChanged?.() } catch { setMessage('Evidence could not be updated. Refresh before retrying to check whether it was saved.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="complaint-evidence-manager">
    <div className="complaint-evidence-block"><h4>Upload evidence</h4>
    <p className="field-note">Private files only: {EVIDENCE_TYPES_LABEL}, up to {EVIDENCE_MAX_LABEL} per file. Witness statements may be PDF or plain text. Intake accepts up to {EVIDENCE_MAX_FILES} files; add further files individually here.</p>
    <label>Additional evidence<input style={{ maxWidth: '100%', minWidth: 0 }} ref={picker} type="file" accept={EVIDENCE_ACCEPT} disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] || null); setMessage('') }} /></label>
    <button type="button" className="btn-add btn-sm" disabled={busy || !file} onClick={() => {
      const problem = evidenceProblem(file); if (problem) { setMessage(problem); return }
      run(async () => { await uploadEvidence(complaintId, file); setFile(null); if (picker.current) picker.current.value = ''; setMessage('Evidence uploaded.') })
    }}>Upload evidence</button>
    </div>
    {children}
    <fieldset className="complaint-evidence-block complaint-withdraw" disabled={busy}><legend>Withdraw evidence</legend>
      <p className="field-note">Originals and audit records are retained. Existing temporary links may work for up to 60 seconds.</p>
      <p id="withdraw-file-help" className="field-note">Select an attached file before withdrawing evidence.</p>
      <label>File<select aria-describedby="withdraw-file-help" disabled={!attachments.length} className="modal-form-input" value={selected} onChange={(e) => { setSelected(e.target.value); setReason('') }}><option value="">Choose a file</option>
        {attachments.map((a) => <option key={a.id} value={a.id}>{a.display_filename}</option>)}</select></label>
      <label>Reason<input required disabled={!selectedActive} className="modal-form-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" className="btn-deny btn-sm" disabled={busy || !selectedActive || !reason.trim()} onClick={() => run(async () => {
        await caseRpc('withdraw_complaint_evidence', { p_attachment_id: selected, p_reason: reason.trim() }); setSelected(''); setReason(''); setMessage('Evidence withdrawn; original retained.')
      })}>Withdraw evidence</button>
    </fieldset>
    <p role="status">{message}</p>
  </div>
}
