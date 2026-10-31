import { useEffect, useRef, useState } from 'react'
import { INCIDENT_TYPE_KEYS, incidentDate, incidentTypeLabel } from '../incidents/incidentLabels'
import { displayLabel, PersonDialog } from '../people/PeopleHistory'
import { loadPersonAnalytics, loadPersonHistory } from '../people/peopleApi'
import { settlePersonRecord } from '../people/personRecord'
import { loadBarangayAnalytics, loadRepeatedDisputes } from './analyticsApi'
import { customRangeProblem, isAccessDenied, nextFilters } from './analyticsRequest'
import './Analytics.css'

// Display-only rows are plain elements: a disabled <button> announced a control that does nothing.
const Breakdown=({title,rows=[],name})=><section className="analytics-block"><h3>{title}</h3>{rows.length?<ul className="analytics-bars">{rows.map((row,i)=><li key={`${row[name]}-${i}`}><div className="analytics-bar"><span>{displayLabel(row[name])}</span><strong>{row.total}</strong></div></li>)}</ul>:<p>No recorded incident matters match these filters.</p>}</section>

// The database is the control: repeated_dispute_analytics refuses non-administrators
// with 42501 and barangay_safety_analytics withholds repeat_people from them. The
// flag only decides what is requested and painted, so a refusal reads as a
// restriction rather than as an outage.
const RESTRICTED='restricted',FAILED='failed',LOADING='loading'
const PEOPLE_RESTRICTED='This barangay-wide list of people is restricted to authorized records staff.'
const DISPUTES_RESTRICTED='This barangay-wide list of complaint pairs is restricted to authorized records staff.'
// Dates follow the incident screens: Asia/Manila, whatever the browser's zone.
const recordedDate=value=>incidentDate(value)||'Not recorded'

export default function AnalyticsInsights({canAdminister=false}){
  const [filters,setFilters]=useState({window:'all',from:'',to:'',category:'',area:''})
  const [data,setData]=useState(null),[disputes,setDisputes]=useState([]),[problem,setProblem]=useState('')
  const [status,setStatus]=useState(LOADING)
  const [history,setHistory]=useState(null),[reviewDispute,setReviewDispute]=useState(null)
  const [historyProblem,setHistoryProblem]=useState(''),[openingHistory,setOpeningHistory]=useState(false),opening=useRef(false)
  const rangeProblem=customRangeProblem(filters)
  // Loaded independently, so a restricted or failed dispute list never hides the general statistics.
  // An incomplete or reversed custom range sends nothing: the reader is told what is missing.
  useEffect(()=>{let live=true;setProblem('');setReviewDispute(null)
    if(rangeProblem){setStatus('needs-range');return()=>{live=false}}
    setStatus(LOADING)
    loadBarangayAnalytics(filters).then(summary=>{if(live){setData(summary);setStatus('ready')}}).catch(error=>{if(live){setData(null);setStatus('error');setProblem(isAccessDenied(error)?'Analytics are not available for this account.':'Analytics are unavailable. Check access and try again.')}})
    if(!canAdminister)setDisputes(RESTRICTED)
    else{setDisputes(LOADING);loadRepeatedDisputes(filters).then(pairs=>{if(live)setDisputes(pairs||[])}).catch(error=>{if(live)setDisputes(isAccessDenied(error)?RESTRICTED:FAILED)})}
    return()=>{live=false}},[filters,canAdminister,rangeProblem])
  const peopleRestricted=data&&(data.repeat_people_restricted===true||data.repeat_people==null)
  const update=(key,value)=>setFilters(current=>nextFilters(current,key,value))
  // The history opens even when its analytics fail; a failed history says so instead of doing nothing.
  const viewHistory=async row=>{if(opening.current)return;opening.current=true;setOpeningHistory(true);setHistoryProblem('')
    try{setHistory(await settlePersonRecord(()=>loadPersonHistory(row.person_kind,row.person_id),()=>loadPersonAnalytics(row.person_kind,row.person_id)))}
    catch(error){setHistoryProblem(isAccessDenied(error)?'This person history is not available for this account.':'Person history is unavailable. Check access and try again.')}
    finally{opening.current=false;setOpeningHistory(false)}}
  return <div className="analytics-insights"><header className="official-dashboard-header"><h1>Analytics &amp; Insights</h1><p>Descriptive patterns from verified linked barangay records.</p><small>These summaries do not predict behavior or determine wrongdoing.</small></header>
    <section className="dashboard-card analytics-filters" aria-label="Analytics filters"><h2>Time window</h2><select aria-label="Time window" value={filters.window} onChange={e=>update('window',e.target.value)}><option value="all">All records</option><option value="last_30_days">Last 30 days</option><option value="last_90_days">Last 90 days</option><option value="last_12_months">Last 12 months</option><option value="previous_12_months">Previous 12 months</option><option value="custom">Custom range</option></select>{filters.window==='custom'&&<><input aria-label="From date" type="date" value={filters.from} onChange={e=>update('from',e.target.value)}/><input aria-label="To date" type="date" value={filters.to} onChange={e=>update('to',e.target.value)}/></>}<h2>Incident filters</h2><p>Category and area apply only to sections marked “Uses incident filters.”</p><select aria-label="Incident category" value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">All incident categories</option>{INCIDENT_TYPE_KEYS.map(key=><option key={key} value={key}>{incidentTypeLabel(key)}</option>)}</select><input aria-label="Recorded area" placeholder="Exact recorded area" value={filters.area} onChange={e=>update('area',e.target.value)}/><button type="button" className="btn-cancel" onClick={()=>setFilters({window:'all',from:'',to:'',category:'',area:''})}>Reset</button></section>
    {problem&&<p role="alert">{problem}</p>}{status==='needs-range'&&<p role="status" className="analytics-caveat">{rangeProblem}</p>}{status===LOADING&&<p role="status">Loading analytics…</p>}{status==='ready'&&data&&<><p className="analytics-caveat">Based on verified linked records. Unlinked historical records are not attributed to a person.</p>
      <h2>Incident analytics <small>Uses incident filters</small></h2><div className="analytics-summary"><div><strong>{data.overview.distinct_incident_matters}</strong><span>Distinct incident matters</span></div><div><strong>{data.overview.linked_people}</strong><span>Linked people</span></div><div><strong>{data.overview.respondent_subject_matters}</strong><span>Respondent/subject matters</span></div><div><strong>{data.overview.victim_matters}</strong><span>Victim matters</span></div><div><strong>{data.overview.substantiated_outcomes}</strong><span>Substantiated outcomes</span></div><div><strong>{data.overview.not_substantiated_outcomes}</strong><span>Not substantiated outcomes</span></div></div>
      <div className="analytics-insights-grid"><Breakdown title="Incident categories" rows={data.categories} name="category"/><Breakdown title="Recorded locations" rows={data.locations} name="area"/><Breakdown title="Roles" rows={data.roles} name="role"/><Breakdown title="Outcomes" rows={data.outcomes} name="outcome"/><Breakdown title="Day of week" rows={data.weekdays} name="weekday"/><Breakdown title="Monthly trend" rows={data.monthly} name="month"/></div>
      <section className="dashboard-card"><h2>People analytics</h2><p>The date window applies. Category and area do not filter complaint matters.</p>{peopleRestricted?<p role="note">{PEOPLE_RESTRICTED}</p>:data.repeat_people.length?<div className="table-wrapper"><table className="dashboard-table analytics-table"><thead><tr><th>Name</th><th>Type</th><th>Matters</th><th>Substantiated</th><th>Not substantiated</th><th>Not determined</th><th>Referred</th><th>Closed</th><th>Unknown</th><th>Action</th></tr></thead><tbody>{data.repeat_people.map(row=><tr key={`${row.person_kind}-${row.person_id}`}><td>{row.display_name}</td><td>{displayLabel(row.person_kind)}</td><td>{row.qualifying_matters}</td><td>{row.substantiated}</td><td>{row.not_substantiated}</td><td>{row.not_determined}</td><td>{row.referred}</td><td>{row.closed} <small>procedural closure only</small></td><td>{row.unknown}</td><td><button type="button" className="btn-secondary btn-sm" disabled={openingHistory} onClick={()=>viewHistory(row)}>View history</button></td></tr>)}</tbody></table></div>:<p>No verified linked records are available for this analysis.</p>}{historyProblem&&<p role="alert">{historyProblem}</p>}</section>
      <section className="dashboard-card"><h2>Complaint/KP analytics</h2><p>The date window applies. Incident category and area filters do not apply.</p>{disputes===RESTRICTED?<p role="note">{DISPUTES_RESTRICTED}</p>:disputes===FAILED?<p role="alert">Complaint pair analytics are unavailable. Try again.</p>:disputes===LOADING?<p role="status">Loading complaint pair analytics…</p>:disputes.length?<div className="table-wrapper"><table className="dashboard-table analytics-table"><thead><tr><th>People</th><th>Distinct complaint/KP matters</th><th>First recorded</th><th>Last recorded</th><th>Action</th></tr></thead><tbody>{disputes.map(row=><tr key={`${row.person_a_key}-${row.person_b_key}`}><td>{row.person_a} ↔ {row.person_b}</td><td>{row.matter_count}</td><td>{recordedDate(row.first_recorded)}</td><td>{recordedDate(row.last_recorded)}</td><td><button type="button" className="btn-secondary btn-sm" onClick={()=>setReviewDispute(row)}>Review disputes</button></td></tr>)}</tbody></table></div>:<p>No verified linked repeated complaint pair is available for this analysis.</p>}{reviewDispute&&<div className="analytics-drill"><h3>Contributing complaints</h3><ul>{reviewDispute.matter_references.map(reference=><li key={reference}>{reference}</li>)}</ul><button type="button" className="btn-cancel btn-sm" onClick={()=>setReviewDispute(null)}>Close</button></div>}</section>
      <section className="dashboard-card"><h2>Community Credit — active policy facts</h2><p>Uses the active policy only. Incident filters do not apply. Analytics do not create credit events or alter enrollment.</p>{data.community_credit.configured===false?<p>{data.community_credit.message}</p>:<><div className="analytics-summary"><div><strong>{data.community_credit.enrolled_residents}</strong><span>Enrolled residents</span></div><div><strong>{data.community_credit.residents_with_events}</strong><span>Residents with credit events</span></div><div><strong>{data.community_credit.event_count}</strong><span>Credit events</span></div></div><p>Starting scores: {(data.community_credit.starting_score_distribution||[]).map(row=>`${row.score}: ${row.residents}`).join(', ')||'No enrollment records'}.</p><p>Current scores: {(data.community_credit.current_score_distribution||[]).map(row=>`${row.score}: ${row.residents}`).join(', ')||'No enrollment records'}.</p></>}</section>
    </>}{history&&<PersonDialog data={history} onClose={()=>setHistory(null)}/>}</div>
}
