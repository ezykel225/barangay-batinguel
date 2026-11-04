import { useRef, useState } from 'react'
import { correctExternalResidentLink, linkExternalToResident, searchPeople } from './peopleApi'

// Verify or correct which Batinguel resident an EXTERNAL person record is.
//
// Rendered only for records administrators (the caller passes the flag), and
// the database refuses anybody else with 42501 regardless. The official
// searches and picks the resident explicitly: search results are a list to
// choose from, never a match, because similar names are not proof of identity.
// A correction keeps the previous link in the database's immutable correction
// history; this panel cannot edit or delete that history.
export const IDENTITY_LINK_NOTE = 'Similar names are not proof of identity. Confirm who this person is before linking.'
export const CORRECTION_HISTORY_NOTE = 'A correction keeps the previous link in a permanent correction history. That history cannot be edited or deleted.'

export default function IdentityLinkPanel({ identity, onChanged }) {
  const linked = Boolean(identity.linked_resident_id)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [chosen, setChosen] = useState(null)
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const run = async (work, failure) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage('')
    try { await work() } catch { setMessage(failure) } finally { pending.current = false; setBusy(false) }
  }
  const find = () => run(async () => {
    const rows = (await searchPeople(query)) || []
    const residents = rows.filter((row) => row.person_kind === 'resident' && row.person_id !== identity.linked_resident_id)
    setResults(residents)
    if (!residents.length) setMessage('No matching Batinguel resident found.')
  }, 'Resident search is unavailable.')
  const save = (event) => {
    event.preventDefault()
    if (!chosen || (linked && !text.trim())) return
    run(async () => {
      if (linked) await correctExternalResidentLink(identity.id, chosen.person_id, text.trim())
      else await linkExternalToResident(identity.id, chosen.person_id, text.trim())
      setChosen(null); setResults([]); setQuery(''); setText('')
      setMessage(linked ? 'Resident link corrected.' : 'Resident link verified.')
      await onChanged?.()
    }, linked ? 'The link could not be corrected. Check access and try again.' : 'The link could not be saved. Check access and try again.')
  }
  return <section className="ph-identity-link" aria-labelledby="ph-identity-link-title">
    <h3 id="ph-identity-link-title">{linked ? 'Correct resident link' : 'Verify resident link'}</h3>
    <p className="field-note">{IDENTITY_LINK_NOTE}</p>
    {linked && <p className="field-note">{CORRECTION_HISTORY_NOTE}</p>}
    <form onSubmit={save}>
      <div className="ph-identity-search">
        <label htmlFor="ph-identity-query">Search Batinguel residents</label>
        <input id="ph-identity-query" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn-secondary" disabled={busy || query.trim().length < 2} onClick={find}>Search</button>
      </div>
      {results.length > 0 && <ul className="ph-identity-results">{results.map((row) => <li key={row.person_id}>
        <span><strong>{row.full_name}</strong> <small>{row.secondary_text}</small></span>
        <button type="button" className="btn-secondary btn-sm" aria-pressed={chosen?.person_id === row.person_id} onClick={() => setChosen(row)}>Select</button>
      </li>)}</ul>}
      {chosen && <p className="ph-identity-chosen">Selected resident: <strong>{chosen.full_name}</strong></p>}
      <label htmlFor="ph-identity-text">{linked ? 'Reason for correction (required)' : 'Verification note (optional)'}</label>
      <textarea id="ph-identity-text" rows={2} maxLength={500} required={linked} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="modal-buttons"><button type="submit" className="btn-add" disabled={busy || !chosen || (linked && !text.trim())}>{linked ? 'Save correction' : 'Verify link'}</button></div>
    </form>
    <p role="status">{message}</p>
  </section>
}
