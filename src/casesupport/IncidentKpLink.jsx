import { useEffect, useRef, useState } from 'react'
import { caseRpc } from './caseSupportApi'

export default function IncidentKpLink({ incidentId }) {
  const [link, setLink] = useState(null)
  const [reference, setReference] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    let live = true
    caseRpc('incident_kp_link', { p_incident_id: incidentId }).then((rows) => { if (live) setLink(rows?.[0] || null) }).catch(() => { if (live) setMessage('Linked KP status unavailable.') })
    return () => { live = false }
  }, [incidentId])
  return <section><h3>Linked KP case</h3>
    <p>{link ? `${link.reference} — ${link.status}` : 'No linked KP case shown.'} Incident and blotter statuses remain independent.</p>
    <form onSubmit={async (e) => {
      e.preventDefault(); if (pending.current || !reference.trim()) return
      pending.current = true; setBusy(true); setMessage('')
      try {
        await caseRpc('link_incident_kp', { p_incident_id: incidentId, p_case_reference: reference.trim() })
        const rows = await caseRpc('incident_kp_link', { p_incident_id: incidentId }); setLink(rows?.[0] || null); setMessage('KP link saved; incident status unchanged.')
      } catch { setMessage('Could not link this KP reference. Check access and the existing case reference.') }
      finally { pending.current = false; setBusy(false) }
    }}><label>Existing KP case reference<input className="modal-form-input" required value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      <button className="btn-add btn-sm" disabled={busy} type="submit">Link existing KP case</button></form><p role="status">{message}</p>
  </section>
}
