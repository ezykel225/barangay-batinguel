import { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { DialogShell } from '../components/OfficialArchiveDialog'
import ResidentProfileDialog from './ResidentProfileDialog'
import ActionMenu from '../components/ActionMenu'
import { useConfirm } from '../components/ConfirmDialog'
import { emptyResident, filterResidents, residentName, residentPayload, validMobile } from './directoryData'
import { manilaToday } from '../utils/displayLabels'
import { directorySummary, purokLabel, residentPurokOptions } from './residentPresentation'
import './ResidentDirectory.css'

export default function ResidentDirectory({ profiles = [], onEligibilityChange }) {
  const [confirm, confirmation] = useConfirm()
  const eligibilityLock = useRef(false)
  const refreshKey = profiles.map(p => `${p.id}:${p.verification_status}`).join('|')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [purok, setPurok] = useState('')
  const [form, setForm] = useState(null)
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const titleId = useId()
  const firstRef = useRef(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('barangay_resident_directory').then(({ data, error: err }) => {
      if (!alive) return
      if (err) setError('Resident directory unavailable. Check authorization and whether migration 054 has been applied.')
      else setRows(data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [refreshKey])
  const openForm = row => { setForm(row ? { ...emptyResident(), ...row, birth_date: row.birth_date || '' } : emptyResident()); setFormError('') }
  const save = async event => {
    event.preventDefault()
    if (busy) return
    if (!validMobile(form.mobile_number)) { setFormError('Enter a Philippine mobile number such as 09171234567 or +639171234567.'); return }
    setBusy(true)
    setFormError('')
    try {
      const { data: id, error: err } = await supabase.rpc('save_barangay_resident', residentPayload(form))
      if (err) throw err
      const saved = { ...form, id }
      setRows(previous => [...previous.filter(r => r.id !== id), saved].sort((a,b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)))
      setForm(null)
      setNotice('Resident saved.')
    } catch { setFormError('Could not save the resident. Check the fields and your permission, then try again.') }
    finally { setBusy(false) }
  }
  const changeEligibility = async resident => {
    if (eligibilityLock.current || busy) return
    eligibilityLock.current = true
    const active = resident.resident_status !== 'active'
    try {
      const ok = await confirm({
        title: active ? `Reactivate ${residentName(resident)}?` : `Mark ${residentName(resident)} as not a resident?`,
        message: active
          ? 'The directory record will become active. Any linked resident account will be verified again. Confirm residency before proceeding. Historical records are preserved.'
          : 'The directory record will become inactive and excluded from active resident targeting. Any linked account will be marked not a resident and will no longer be verified. Historical records are preserved.',
        confirmLabel: active ? 'Reactivate resident' : 'Mark as Not Resident', destructive: !active,
      })
      if (!ok) return
      setBusy(true)
      const { error: err } = await supabase.rpc('set_barangay_resident_eligibility', {p_resident_id:resident.id,p_active:active})
      if (err) throw err
      setRows(previous=>previous.map(row=>row.id===resident.id?{...row,resident_status:active?'active':'inactive'}:row))
      setNotice(active?'Resident reactivated.':'Resident marked inactive.')
      onEligibilityChange?.()
    } catch { setNotice('Could not change eligibility. No success is assumed; reload and check your permission and migration 056 before retrying.') }
    finally { eligibilityLock.current=false;setBusy(false) }
  }
  const change = event => setForm({ ...form, [event.target.name]: event.target.value })
  const filtered = filterResidents(rows, search, status, purok)
  return <section className="resident-directory dashboard-card" aria-label="Barangay Residents">
    <div className="directory-heading"><div><h2>Barangay Residents</h2><p>Manage resident details and explicit online-account links.</p></div>
      <button className="confirm-dialog-confirm" onClick={() => openForm(null)} disabled={loading || !!error}>Add Resident</button></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && <dl className="directory-summary">{directorySummary(rows).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    <div className={`directory-filters${search.trim() || status || purok ? ' has-filters' : ''}`}><label>Search residents<input placeholder="Search residents..." value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
      <label>Resident status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label>Purok filter<select value={purok} onChange={e => setPurok(e.target.value)}><option value="">All Puroks</option>{residentPurokOptions(rows).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>{(search.trim() || status || purok) && <button type="button" className="directory-reset" onClick={() => { setSearch(''); setStatus(''); setPurok('') }}>Clear filters</button>}</div>
    {loading ? <p role="status">Loading resident directory...</p> : !error && <><p>{search.trim() || status || purok ? `Showing ${filtered.length} of ${rows.length} residents` : `${rows.length} ${rows.length === 1 ? 'resident' : 'residents'}`}</p>
      {filtered.length > 0 && <table className="directory-table"><thead><tr><th scope="col">Resident name</th><th scope="col">Purok</th><th scope="col">Status</th><th scope="col">Online account</th><th scope="col">Actions</th></tr></thead>
        <tbody>{filtered.map(r => <tr key={r.id}><td data-label="Resident name"><button className="resident-name-button" onClick={() => setView(r)}>{residentName(r)}</button></td><td data-label="Purok">{purokLabel(r.purok) || 'Not recorded'}</td><td data-label="Status"><span className={`badge ${r.resident_status === 'active' ? 'badge-approved' : 'badge-pending'}`}>{r.resident_status === 'active' ? 'Active' : 'Inactive'}</span></td><td data-label="Online account">{r.profile_id ? 'Explicitly linked' : 'Not linked'}</td><td data-label="Actions"><ActionMenu portal label={`Actions for ${residentName(r)}`} subject={residentName(r)} items={[
          {key:'edit',label:'Edit resident',onSelect:()=>openForm(r)},
          {key:'eligibility',label:r.resident_status==='active'?'Mark as Not Resident':'Reactivate resident',danger:r.resident_status==='active',onSelect:()=>changeEligibility(r)},
        ]}/></td></tr>)}</tbody>
      </table>}
      {!filtered.length && <p>{rows.length ? 'No residents match the current filters.' : 'No barangay resident records have been added yet.'}</p>}</>}
    {confirmation}
    {view && <ResidentProfileDialog key={view.id} resident={view} profile={profiles.find(p=>p.id===view.profile_id)} onClose={()=>setView(null)} onEdit={()=>{const row=view;setView(null);setTimeout(()=>openForm(row),0)}}/>}
    {form && <div className="directory-dialog"><DialogShell open titleId={titleId} title={form.id ? 'Edit Resident' : 'Add Resident'} initialFocusRef={firstRef} busy={busy} onCancel={() => setForm(null)}
      header={<header className="directory-modal-header"><h2 id={titleId}>{form.id ? 'Edit Resident' : 'Add Resident'}</h2><button type="button" aria-label="Close resident form" disabled={busy} onClick={() => setForm(null)}>×</button></header>}>
      <form onSubmit={save} className="directory-form"><div className="directory-fields">
        <label>First name<input ref={firstRef} name="first_name" required maxLength={100} value={form.first_name} onChange={change} /></label>
        <label>Last name<input name="last_name" required maxLength={100} value={form.last_name} onChange={change} /></label>
        <label>Middle name (optional)<input name="middle_name" maxLength={100} value={form.middle_name || ''} onChange={change} /></label>
        <label>Suffix (optional)<input name="suffix" maxLength={30} value={form.suffix || ''} onChange={change} /></label>
        <label>Birth date (optional)<input type="date" max={manilaToday()} name="birth_date" value={form.birth_date} onChange={change} /></label>
        <label>Mobile number (optional)<input type="tel" name="mobile_number" maxLength={30} value={form.mobile_number || ''} onChange={change} /></label>
        <label>Purok (optional)<input name="purok" maxLength={100} value={form.purok || ''} onChange={change} /></label>
        <div><strong>Resident status</strong><p>{form.resident_status === 'active' ? 'Active' : 'Inactive'}</p><small>Use the resident actions menu to change eligibility.</small></div>
      </div><p className="directory-note">A phone and online account are optional. Purok is recorded as provided; the official vocabulary is not yet confirmed. Account linking is not available in this form.</p>
      {formError && <p role="alert">{formError}</p>}<div className="directory-actions"><button className="confirm-dialog-cancel" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="confirm-dialog-confirm" disabled={busy}>{busy ? 'Saving...' : 'Save resident'}</button></div></form>
    </DialogShell></div>}
  </section>
}

