import { useEffect, useRef, useState } from 'react'
import { FaUserShield, FaExclamationTriangle } from 'react-icons/fa'
import { loadAccountStates, setAccountLink } from './tanodPortalApi'

export default function TanodAccounts({ roster, selectedMember, accountStates, onStatesChange, rosterAction }) {
  const [states, setStates] = useState(null)
  const [member, setMember] = useState(selectedMember?.id || '')
  const [linkOpen, setLinkOpen] = useState(!selectedMember)
  const [profile, setProfile] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    if (accountStates !== undefined) { setStates(accountStates); return }
    let live = true
    setStates(null)
    loadAccountStates().then((rows) => { if (live) setStates(rows) }).catch(() => { if (live) setMessage('Account links unavailable. Check authorization and migration setup.') })
    return () => { live = false }
  }, [roster, accountStates])
  const save = async (unlink = false) => {
    if (pending.current || !member || (!unlink && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(profile.trim()))) return
    pending.current = true; setBusy(true); setMessage('')
    try { await setAccountLink(member, unlink ? null : profile.trim()); const refreshed = await loadAccountStates(); setStates(refreshed); onStatesChange?.(refreshed); setProfile(''); setMessage('Tanod account link saved.') }
    catch { setMessage('Link not saved. Confirm that the profile was provisioned with the Tanod role and is not linked elsewhere.') }
    finally { pending.current = false; setBusy(false) }
  }
  const linked = Boolean(states?.find((s) => s.tanod_id === member)?.profile_id)
  return <section className="dashboard-card tnd-accounts" aria-label="Tanod account management">
    <h3><FaUserShield aria-hidden="true" /> Account Access</h3>
    {selectedMember && <><p><span className={'kp-badge' + (linked ? ' kp-badge-open' : '')}>{states === null ? 'Account not confirmed' : linked ? 'Account linked' : 'Not linked'}</span></p>
      {linked && <p>This Tanod has access through a provisioned Tanod account.</p>}
      <button type="button" className="btn-add btn-sm" disabled={busy} aria-expanded={linkOpen} aria-controls="tnd-link-fields" onClick={() => setLinkOpen(!linkOpen)}>{linkOpen ? 'Hide account link fields' : linked ? 'Change account link' : 'Link account'}</button></>}
    <p className="tnd-account-note">Authorized administration creates the Auth account and Tanod profile first. Link its profile UUID here; names and email addresses never grant access. No passwords are stored here.</p>
    {!selectedMember && <><ul className="tnd-account-list">{roster.map((t) => <li key={t.id}><strong>{t.full_name}</strong><span>{!t.active ? 'Inactive' : states === null ? 'Account state not yet confirmed' : states.find((s) => s.tanod_id === t.id)?.account_state || 'Not linked'}</span></li>)}</ul>
    <label>Tanod member<select className="modal-form-input" value={member} onChange={(e) => { setMember(e.target.value); setProfile('') }}><option value="">Select member</option>{roster.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.active ? '' : ' — Inactive'}</option>)}</select></label></>}
    {linkOpen && <div id="tnd-link-fields"><label>Provisioned Tanod profile UUID<input className="modal-form-input" value={profile} onChange={(e) => setProfile(e.target.value)} autoComplete="off" /></label>
    <div className="modal-actions"><button className="btn-add" type="button" disabled={busy || !member || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(profile.trim())} onClick={() => save(false)}>Link account</button></div></div>}
    <div className="tnd-danger-actions">{selectedMember && <h4><FaExclamationTriangle aria-hidden="true" /> Administrative actions</h4>}
      {rosterAction}<button className="btn-deny" type="button" disabled={busy || !member || !states?.find((s) => s.tanod_id === member)?.profile_id} onClick={() => save(true)}>Remove account link</button></div>
    <p role="status">{message}</p>
  </section>
}
