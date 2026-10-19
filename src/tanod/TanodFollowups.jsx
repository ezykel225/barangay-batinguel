import { useEffect, useRef, useState } from 'react'
import { addFollowup, loadMyFollowups } from './tanodPortalApi'
import { FaCommentAlt, FaChevronRight } from 'react-icons/fa'
import { dutyTime } from './tanodDuty'

export default function TanodFollowups({ incidentId }) {
  const [note, setNote] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    let live = true
    loadMyFollowups(incidentId).then((data) => { if (live) setRows(data) }).catch(() => { if (live) setMessage('Follow-up notes unavailable.') })
    return () => { live = false }
  }, [incidentId])
  return <details className="td-followups"><summary><FaChevronRight className="td-followup-chevron" aria-hidden="true" /><FaCommentAlt aria-hidden="true" /><span>Operational follow-up notes</span></summary>
    {!rows.length && <div className="td-note-empty"><FaCommentAlt aria-hidden="true" /><strong>No follow-up notes</strong><p>Operational updates added to this incident will appear here.</p></div>}
    <ul className="td-note-timeline">{rows.map((row) => <li key={row.id}><time dateTime={row.created_at}>{dutyTime(row.created_at)}</time><p>{row.note}</p></li>)}</ul>
    <form onSubmit={async (e) => {
      e.preventDefault(); if (pending.current || !note.trim()) return
      pending.current = true; setBusy(true); setMessage('')
      try { await addFollowup(incidentId, note); setNote(''); setMessage('Operational note recorded. Incident and legal statuses were not changed.'); setRows(await loadMyFollowups(incidentId)) }
      catch { setMessage('The operation could not be confirmed. Refresh your notes before trying again.') }
      finally { pending.current = false; setBusy(false) }
    }}><label>Operational follow-up<textarea required maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="btn-add" disabled={busy || !note.trim()} type="submit">{busy ? 'Saving…' : 'Add follow-up note'}</button>
    </form><p role="status">{message}</p>
  </details>
}
