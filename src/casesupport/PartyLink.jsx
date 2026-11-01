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
  const link = (kind, id) => run(async () => {
    await caseRpc('link_complaint_party_identity', { p_party_id: party.id, p_person_kind: kind, p_person_id: id })
    setResults([]); setMessage('UUID identity linkage saved.'); onChanged?.()
  })
  return <details className="complaint-resident-link"><summary>
    <span className={`complaint-link-badge ${party.has_profile_link || party.has_registry_link ? 'is-linked' : ''}`}>
      {party.has_profile_link || party.has_registry_link || party.resident_id || party.external_person_id ? 'Identity record linked' : 'Identity not verified'}
    </span><span className="complaint-link-manage">Manage identity link</span>
  </summary>
    <p className="field-note">Confirm identity before selecting an existing record. Similar names are not proof of identity.</p>
    <label>Find resident or external person for {party.full_name_snapshot}<input className="modal-form-input" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <button type="button" className="btn-add btn-sm" disabled={busy || query.trim().length < 3} onClick={() => run(async () => {
      const rows = await caseRpc('search_people', { p_search: query.trim() }); setResults(rows || [])
      if (!rows?.length) setMessage('No matching UUID-backed identity. Create an external person in People & History first.')
    })}>Search people</button>
    <ul>{results.map((r) => <li key={`${r.person_kind}-${r.person_id}`}>
      {r.full_name} ({r.person_kind}) <small style={{ overflowWrap: 'anywhere' }}>{r.person_id}</small>{' '}
      <button type="button" className="btn-add btn-sm" disabled={busy} onClick={() => link(r.person_kind, r.person_id)}>Confirm this identity</button>
    </li>)}</ul>
    <p className="field-note">A name match never creates or changes a link. Select the verified UUID explicitly.</p>
    <p role="status">{message}</p>
  </details>
}
