import { useRef, useState } from 'react'
import { caseRpc } from './caseSupportApi'

export default function PartyLink({ party, onChanged }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const run = async (work) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage('')
    try { await work() } catch { setMessage('Could not update resident linkage. Check access and try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  const link = (kind, id = null) => run(async () => {
    await caseRpc('link_complaint_party', { p_party_id: party.id, p_record_kind: kind, p_record_id: id })
    setResults([]); setMessage('Resident linkage saved.'); onChanged?.()
  })
  return <details className="complaint-resident-link"><summary>
    <span className={`complaint-link-badge ${party.has_profile_link || party.has_registry_link ? 'is-linked' : ''}`}>
      {party.has_profile_link || party.has_registry_link ? 'Resident record linked' : 'External / not linked'}
    </span><span className="complaint-link-manage">Manage resident link</span>
  </summary>
    <p className="field-note">Confirm identity before selecting an existing record. Similar names are not proof of identity.</p>
    <label>Find existing resident for {party.full_name_snapshot}<input className="modal-form-input" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <button type="button" className="btn-add btn-sm" disabled={busy || query.trim().length < 3} onClick={() => run(async () => {
      const rows = await caseRpc('search_case_residents', { p_search: query.trim() }); setResults(rows || [])
      if (!rows?.length) setMessage('No matching records. The party may remain external.')
    })}>Search resident records</button>
    <ul>{results.map((r) => <li key={`${r.record_kind}-${r.record_id}`}>
      {r.full_name} ({r.record_kind}) <small style={{ overflowWrap: 'anywhere' }}>{r.record_id}</small>{' '}
      <button type="button" className="btn-add btn-sm" disabled={busy} onClick={() => link(r.record_kind, r.record_id)}>Confirm this resident</button>
    </li>)}</ul>
    <button type="button" className="btn-add btn-sm" disabled={busy} onClick={() => link('external')}>Keep external / remove link</button>
    <p role="status">{message}</p>
  </details>
}
