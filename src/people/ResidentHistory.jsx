import { useEffect, useState } from 'react'
import { loadPersonAnalytics, loadPersonHistory } from './peopleApi'
import PersonAnalytics from '../analytics/PersonAnalytics'
import { settlePersonRecord } from './personRecord'

const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
export default function ResidentHistory({ residentId }) {
  const [data,setData]=useState(null),[tab,setTab]=useState('incidents'),[failed,setFailed]=useState(false)
  // A failed analytics request leaves the linked history readable; only a failed history is "unavailable".
  useEffect(()=>{let live=true;setData(null);setFailed(false);settlePersonRecord(()=>loadPersonHistory('resident',residentId),()=>loadPersonAnalytics('resident',residentId)).then(record=>{if(live)setData(record)}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[residentId])
  if(failed)return <section className="resident-profile-section"><h3>Linked history</h3><p>History is unavailable or your account cannot view it.</p></section>
  if(!data)return <section className="resident-profile-section"><h3>Linked history</h3><p>Loading verified links…</p></section>
  const rows=tab==='incidents'?data.incidents:tab==='complaints'?data.complaints:tab==='timeline'?data.timeline:null
  const empty={incidents:'No linked incident or blotter records yet.',complaints:'No linked complaint or KP records yet.',timeline:'No linked history is available yet.'}
  return <section className="resident-history" aria-label="Resident linked history"><div className="ph-tabs" role="tablist" aria-label="Resident history sections">{[['incidents','Incidents & Blotter'],['complaints','Complaints & KP'],['timeline','Timeline'],['analytics','Analytics']].map(([id,text])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{text}</button>)}</div>{tab==='analytics'?<PersonAnalytics data={data.analytics} unavailable={!data.analytics&&data.analyticsUnavailable} onWindowChange={async window=>{const analytics=await loadPersonAnalytics('resident',residentId,{window});setData(current=>({...current,analytics}))}}/>:!rows?.length?<p>{empty[tab]}</p>:<div className="ph-records">{rows.map((row,i)=><article key={`${tab}-${i}`}><strong>{row.reference||label(row.kind)}</strong>{row.role&&<span>Role: {label(row.role)}</span>}{row.roles&&<span>Roles: {row.roles.map(label).join(', ')}</span>}{row.outcome&&<span>Outcome: {label(row.outcome)}</span>}{row.status&&<span>Status: {label(row.status)}</span>}{row.blotter_reference&&<span>Blotter: {row.blotter_reference}</span>}{row.kp_reference&&<span>KP: {row.kp_reference}</span>}{row.linked_incident_references?.length>0&&<span>Linked incidents: {row.linked_incident_references.join(', ')}</span>}{row.occurred_at&&<time>{new Date(row.occurred_at).toLocaleDateString()}</time>}</article>)}</div>}</section>
}
