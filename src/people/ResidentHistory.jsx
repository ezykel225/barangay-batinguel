import { useEffect, useState } from 'react'
import { loadPersonHistory } from './peopleApi'

const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
export default function ResidentHistory({ residentId }) {
  const [data,setData]=useState(null),[tab,setTab]=useState('incidents'),[failed,setFailed]=useState(false)
  useEffect(()=>{let live=true;loadPersonHistory('resident',residentId).then(v=>{if(live)setData(v)}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[residentId])
  if(failed)return <section className="resident-profile-section"><h3>Linked history</h3><p>History is unavailable or your account cannot view it.</p></section>
  if(!data)return <section className="resident-profile-section"><h3>Linked history</h3><p>Loading verified links…</p></section>
  const rows=tab==='incidents'?data.incidents:tab==='complaints'?data.complaints:data.timeline
  const empty={incidents:'No linked incident or blotter records yet.',complaints:'No linked complaint or KP records yet.',timeline:'No linked history is available yet.'}
  return <section className="resident-history" aria-label="Resident linked history"><div className="ph-tabs" role="tablist" aria-label="Resident history sections">{[['incidents','Incidents & Blotter'],['complaints','Complaints & KP'],['timeline','Timeline']].map(([id,text])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{text}</button>)}</div>{!rows?.length?<p>{empty[tab]}</p>:<div className="ph-records">{rows.map((row,i)=><article key={`${tab}-${i}`}><strong>{row.reference||label(row.kind)}</strong>{row.role&&<span>Role: {label(row.role)}</span>}{row.roles&&<span>Roles: {row.roles.map(label).join(', ')}</span>}{row.outcome&&<span>Outcome: {label(row.outcome)}</span>}{row.status&&<span>Status: {label(row.status)}</span>}{row.blotter_reference&&<span>Blotter: {row.blotter_reference}</span>}{row.kp_reference&&<span>KP: {row.kp_reference}</span>}{row.linked_incident_references?.length>0&&<span>Linked incidents: {row.linked_incident_references.join(', ')}</span>}{row.occurred_at&&<time>{new Date(row.occurred_at).toLocaleDateString()}</time>}</article>)}</div>}</section>
}
