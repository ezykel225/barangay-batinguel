import { useEffect, useRef, useState } from 'react'
import { DialogShell } from '../components/OfficialArchiveDialog'
import { createExternalPerson, loadIncidentParties, loadPersonHistory, saveIncidentParty, searchPeople } from './peopleApi'
import { PersonDialog, displayLabel } from './PeopleHistory'

const roles=['','victim','witness','reporting_party','respondent','subject','other_involved']
const outcomes=['not_determined','substantiated','not_substantiated','referred','closed']
const roleNames={victim:'Victim',witness:'Witness',reporting_party:'Reporting party',respondent:'Respondent',subject:'Subject',other_involved:'Other involved person'}
const blankExternal={firstName:'',middleName:'',lastName:'',suffix:'',barangay:'',city:'',address:''}
const roleHelp={respondent:'Person reported or complained against. This does not mean the allegation is substantiated.',subject:'Person whose involvement is being reviewed. This does not mean wrongdoing has been established.'}

export default function IncidentParties({ incidentId, canManage }) {
  const [rows,setRows]=useState([]),[dialog,setDialog]=useState(null),[query,setQuery]=useState(''),[results,setResults]=useState([])
  const [role,setRole]=useState(''),[note,setNote]=useState(''),[outcome,setOutcome]=useState('not_determined'),[selected,setSelected]=useState(null)
  const [external,setExternal]=useState(blankExternal),[externalMode,setExternalMode]=useState(false),[history,setHistory]=useState(null)
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false); const firstRef=useRef(null)
  const load=()=>loadIncidentParties(incidentId).then(data=>setRows(data||[])).catch(()=>setMessage('People involved are unavailable.'))
  useEffect(()=>{load()},[incidentId]) // eslint-disable-line react-hooks/exhaustive-deps
  const reset=()=>{setDialog(null);setQuery('');setResults([]);setRole('');setNote('');setOutcome('not_determined');setSelected(null);setExternal(blankExternal);setExternalMode(false)}
  const beginAdd=()=>{reset();setDialog('add')}
  const beginEdit=row=>{reset();setDialog('edit');setRole(row.role);setOutcome(row.outcome_status);setSelected({person_kind:row.person_kind,person_id:row.person_id,full_name:row.name_snapshot})}
  const find=async()=>{setBusy(true);try{setResults(await searchPeople(query)||[])}catch{setMessage('People search is unavailable.')}finally{setBusy(false)}}
  const save=async event=>{event.preventDefault();if(!role||!selected)return;setBusy(true);try{const row=dialog==='edit'?rows.find(item=>item.id===dialogId()):null;await saveIncidentParty({id:row?.id,incidentId,kind:selected.person_kind,personId:selected.person_id,role,note,outcome:dialog==='add'?'not_determined':outcome});reset();setMessage(dialog==='add'?'Person added to the incident.':'Person details updated.');await load()}catch{setMessage('The person could not be saved.')}finally{setBusy(false)}}
  const [editingId,setEditingId]=useState(null)
  const dialogId=()=>editingId
  const edit=row=>{setEditingId(row.id);beginEdit(row)}
  const createAndSelect=async event=>{event.preventDefault();setBusy(true);try{const id=await createExternalPerson(external);setSelected({person_kind:'external',person_id:id,full_name:[external.firstName,external.middleName,external.lastName,external.suffix].filter(Boolean).join(' '),secondary_text:[external.barangay,external.city].filter(Boolean).join(', ')});setExternalMode(false);setExternal(blankExternal)}catch{setMessage('The external person could not be saved.')}finally{setBusy(false)}}
  const view=async row=>{setBusy(true);try{setHistory(await loadPersonHistory(row.person_kind,row.person_id))}catch{setMessage('Person history is unavailable.')}finally{setBusy(false)}}
  const identityChanged=dialog==='edit'&&selected&&rows.find(r=>r.id===editingId)?.person_id!==selected.person_id
  return <section className="inc-section incident-people" aria-label="People involved"><div className="incident-people-heading"><div><h3>People involved</h3><p>Link the people involved in this incident and record their role. Being listed as a respondent or subject does not by itself mean responsibility has been established.</p></div>{canManage&&<button type="button" className="btn-add" onClick={beginAdd}>+ Add person</button>}</div>
    {!rows.length?<p>No people have been linked to this incident yet.</p>:<div className="incident-party-cards">{rows.map(row=><article key={row.id}><div><strong>{row.name_snapshot}</strong><span>{row.person_kind==='resident'?'Batinguel Resident':'External Person'}</span></div><dl><div><dt>Role</dt><dd>{roleNames[row.role]||displayLabel(row.role)}</dd></div><div><dt>Outcome</dt><dd>{displayLabel(row.outcome_status)}</dd></div></dl><div className="incident-party-actions">{canManage&&<><button type="button" className="btn-secondary btn-sm" onClick={()=>edit(row)}>Edit</button><button type="button" className="btn-secondary btn-sm" onClick={()=>edit(row)}>Update outcome</button></>}<button type="button" className="btn-cancel btn-sm" onClick={()=>view(row)}>View history</button></div></article>)}</div>}
    <p role="status">{message}</p>
    {dialog&&<DialogShell open titleId="incident-person-title" title={dialog==='add'?'Add person to incident':'Edit person involved'} busy={busy} onCancel={reset} initialFocusRef={firstRef}><form className="incident-person-form" onSubmit={save}><label>1. Role<select ref={firstRef} value={role} onChange={e=>setRole(e.target.value)} required><option value="">Choose a role</option>{roles.filter(Boolean).map(value=><option key={value} value={value}>{roleNames[value]}</option>)}</select></label>{roleHelp[role]&&<p className="field-note">{roleHelp[role]}</p>}
      <fieldset><legend>2. Person</legend><div className="incident-person-search"><input aria-label="Search Batinguel residents or external people" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Batinguel residents or external people"/><button type="button" className="btn-secondary" disabled={query.trim().length<2||busy} onClick={find}>Search</button></div><div className="incident-person-results">{results.map(row=><article key={`${row.person_kind}-${row.person_id}`}><div><strong>{row.full_name}</strong><span>{row.person_kind==='resident'?'Batinguel Resident':'External Person'} · {row.secondary_text}</span></div><button type="button" className="btn-secondary btn-sm" onClick={()=>setSelected(row)}>Select</button></article>)}</div><button type="button" className="btn-cancel btn-sm" onClick={()=>setExternalMode(true)}>Add new external person</button></fieldset>
      {selected&&<section className="incident-selected-person"><h4>3. Selected person</h4><strong>{selected.full_name}</strong><span>{selected.person_kind==='resident'?'Batinguel Resident':'External Person'}</span><small>{selected.secondary_text}</small></section>}
      <label>4. Involvement note <span className="field-note">Optional</span><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}/></label>
      {dialog==='edit'&&<label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}>{outcomes.map(value=><option key={value} value={value}>{displayLabel(value)}</option>)}</select>{outcome==='closed'&&<small>Procedural closure only. It does not mean responsibility was established.</small>}</label>}
      {identityChanged&&<p className="incident-identity-warning" role="alert">You are changing the person linked to this incident record. The previous link will remain in the audit history.</p>}
      <div className="modal-buttons"><button type="button" className="btn-cancel" onClick={reset}>Cancel</button><button className="btn-add" disabled={busy||!role||!selected}>{dialog==='add'?'Add person':'Save changes'}</button></div></form>
      {externalMode&&<div className="incident-external-panel"><h4>Add new external person</h4><form onSubmit={createAndSelect}>{[['firstName','First name'],['middleName','Middle name'],['lastName','Last name'],['suffix','Suffix'],['barangay','Barangay'],['city','City / Municipality'],['address','Address (optional)']].map(([key,text])=><label key={key}>{text}<input value={external[key]} required={key==='firstName'||key==='lastName'} onChange={e=>setExternal({...external,[key]:e.target.value})}/></label>)}<div className="modal-buttons"><button type="button" className="btn-cancel" onClick={()=>setExternalMode(false)}>Back</button><button className="btn-add" disabled={busy}>Save and select</button></div></form></div>}
    </DialogShell>}
    {history&&<PersonDialog data={history} onClose={()=>setHistory(null)}/>}</section>
}
