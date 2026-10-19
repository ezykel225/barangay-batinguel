import { useEffect, useRef, useState } from 'react'
import { caseRpc, dueState } from './caseSupportApi'
import CaseProjectDocuments from './CaseProjectDocuments'

const fields = { mediation_due: 'Mediation due date', conciliation_due: 'Conciliation due date', repudiation_end: 'Repudiation period end', compliance_due: 'Settlement compliance due date' }
const blank = { mediation_due: '', conciliation_due: '', repudiation_end: '', compliance_due: '', compliance_status: 'not_recorded', settlement_terms: '', review_note: '' }

export default function CaseFollowups({ kpCase, parties, complaint }) {
  const [draft, setDraft] = useState(blank)
  const [saved, setSaved] = useState(blank)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    let live = true
    setReady(false)
    caseRpc('kp_followups_for', { p_case_id: kpCase.id }).then((rows) => {
      if (!live) return
      const row = Object.fromEntries(Object.entries(blank).map(([k, v]) => [k, rows?.[0]?.[k] ?? v]))
      setDraft(row); setSaved(row); setReady(true)
    }).catch(() => { if (live) setMessage('Follow-up records unavailable. Check access or migration setup.') })
    return () => { live = false }
  }, [kpCase.id])
  const save = async (e) => {
    e.preventDefault()
    if (pending.current || !ready) return
    pending.current = true; setBusy(true); setMessage('')
    try {
      await caseRpc('save_kp_followups', { p_case_id: kpCase.id, ...Object.fromEntries(Object.entries(draft).map(([k,v]) => [`p_${k}`, v === '' && k in fields ? null : v])) })
      setSaved({ ...draft }); setMessage('Follow-up record saved. Case status was not changed.')
    } catch { setMessage('Could not save follow-up record. No case disposition was made.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section aria-label="Case follow-up and project documents">
    <h4>Manual dates and settlement follow-up</h4>
    <p className="kp-hint">Officials enter dates according to verified LGU guidance. No statutory period is calculated. Due dates never change case status automatically.</p>
    <form className="kp-form" onSubmit={save}><fieldset style={{ minWidth: 0 }} disabled={!ready || busy}>
      <legend>Official-entered follow-up record</legend>
      <div className="kp-form-grid">{Object.entries(fields).map(([key, label]) => <label key={key}>{label}
        <input className="modal-form-input" type="date" aria-label={label} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        <span className="field-note">Saved: {key === 'compliance_due' && saved.compliance_status === 'completed' ? 'Compliance completed' : dueState(saved[key])}</span>
      </label>)}</div>
      <label>Compliance status<select className="modal-form-input" value={draft.compliance_status} onChange={(e) => setDraft({ ...draft, compliance_status: e.target.value })}>
        <option value="not_recorded">Not recorded</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="not_met">Not met — official review required</option>
      </select></label>
      <label>Recorded settlement terms<textarea className="modal-form-input" rows={4} value={draft.settlement_terms} onChange={(e) => setDraft({ ...draft, settlement_terms: e.target.value })} /></label>
      <label>Official review note (not a legal certification)<textarea className="modal-form-input" rows={3} value={draft.review_note} onChange={(e) => setDraft({ ...draft, review_note: e.target.value })} /></label>
      <button className="btn-add" type="submit">{busy ? 'Saving…' : 'Save follow-up record'}</button>
    </fieldset></form><p role="status">{message}</p>
    {ready && <CaseProjectDocuments kpCase={kpCase} parties={parties} complaint={complaint} followups={saved} />}
  </section>
}
