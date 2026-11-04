import { useEffect, useMemo, useRef, useState } from 'react'
import { INCIDENT_TYPE_KEYS, incidentDate, incidentDateTime, incidentStatusLabel, incidentTypeLabel } from '../incidents/incidentLabels'
import { displayLabel, PersonDialog } from '../people/PeopleHistory'
import { loadPersonAnalytics, loadPersonHistory } from '../people/peopleApi'
import { settlePersonRecord } from '../people/personRecord'
import { loadBarangayAnalytics, loadIncidentRecords, loadIncidentTypeCounts, loadRepeatedDisputes } from './analyticsApi'
import { PROBLEM_MESSAGES, analyticsProblem, customRangeProblem, isAccessDenied, nextFilters } from './analyticsRequest'
import { GRANULARITY_LABELS, PERIODS, periodLabel, periodRange } from './analyticsPeriods'
import { areaOf, areaOptions, completeness, filterRecords, incidentSummary } from './incidentAnalytics'
import { BarChart, TrendChart } from './AnalyticsCharts'
import './Analytics.css'

// The database is the control: repeated_dispute_analytics refuses non-administrators
// with 42501 and barangay_safety_analytics withholds repeat_people from them. The
// flag only decides what is requested and painted, so a refusal reads as a
// restriction rather than as an outage.
const RESTRICTED='restricted',FAILED='failed',LOADING='loading'
const PEOPLE_RESTRICTED='This barangay-wide list of people is restricted to authorized records staff.'
const DISPUTES_RESTRICTED='This barangay-wide list of complaint pairs is restricted to authorized records staff.'
export const IDENTITY_COUNT_NOTE='A resident and an external record verified as the same person are counted as two records here. This is a count of linked person records, not of unique people.'
export const SOURCE_INCOMPLETE='The record list for this selection is incomplete, so record-level charts are not shown. Narrow the period or category.'
const RECORD_PREVIEW=25
const BLANK={window:'all',from:'',to:'',category:'',area:''}
// Dates follow the incident screens: Asia/Manila, whatever the browser's zone.
const recordedDate=value=>incidentDate(value)||'Not recorded'

const Problem=({kind})=>kind==='denied'||kind==='not_installed'?<p role="note" className="analytics-caveat">{PROBLEM_MESSAGES[kind]}</p>:<p role="alert">{PROBLEM_MESSAGES[kind]||PROBLEM_MESSAGES.failed}</p>
const Kpi=({value,label})=><div><strong>{value}</strong><span>{label}</span></div>

// embedded: rendered as a tab of Safety Map & Analytics, under that module's own h1.
// filters/onFiltersChange: optional; the module holds the filters so they survive a
// tab change and share the incident category with the map. Without them the page
// keeps its own state, exactly as before.
export default function AnalyticsInsights({canAdminister=false,embedded=false,filters:heldFilters,onFiltersChange}){
  const [ownFilters,setOwnFilters]=useState(BLANK)
  const filters=heldFilters?{...BLANK,...heldFilters}:ownFilters
  const setFilters=next=>{const value=typeof next==='function'?next(filters):next;if(onFiltersChange)onFiltersChange(value);else setOwnFilters(value)}
  const [records,setRecords]=useState({status:LOADING,rows:[],check:null,problem:''})
  const [summary,setSummary]=useState({status:LOADING,data:null,problem:''})
  const [disputes,setDisputes]=useState([])
  const [history,setHistory]=useState(null),[reviewDispute,setReviewDispute]=useState(null),[showAllRecords,setShowAllRecords]=useState(false)
  const [historyProblem,setHistoryProblem]=useState(''),[openingHistory,setOpeningHistory]=useState(false),opening=useRef(false)
  const rangeProblem=customRangeProblem(filters)
  // One Manila date range for every source, so every section counts the same days.
  const {from,to}=periodRange(filters.window,undefined,filters)
  const request=useMemo(()=>({window:filters.window==='all'?'all':'custom',from,to}),[filters.window,from,to])

  // Incident records (044): the source of every incident chart and the drill-down.
  // Category narrows on the server; area is narrowed below, so its choices stay complete.
  useEffect(()=>{let live=true;setShowAllRecords(false)
    if(rangeProblem)return()=>{live=false}
    setRecords(r=>({...r,status:LOADING,problem:''}))
    // allSettled: a failed record list is an error; a failed count only leaves completeness unknown.
    Promise.allSettled([loadIncidentRecords({from,to,category:filters.category}),loadIncidentTypeCounts({from,to})]).then(([rows,counts])=>{if(!live)return
      if(rows.status==='rejected')setRecords({status:'error',rows:[],check:null,problem:analyticsProblem(rows.reason)})
      else setRecords({status:'ready',rows:rows.value,check:completeness(rows.value,counts.status==='fulfilled'?counts.value:null,filters.category),problem:''})})
    return()=>{live=false}},[from,to,filters.category,rangeProblem])

  // Loaded independently, so a restricted or failed dispute list never hides the general statistics.
  // An incomplete or reversed custom range sends nothing: the reader is told what is missing.
  useEffect(()=>{let live=true;setReviewDispute(null)
    if(rangeProblem)return()=>{live=false}
    setSummary(s=>({...s,status:LOADING,problem:''}))
    loadBarangayAnalytics({...request,category:filters.category,area:filters.area}).then(data=>{if(live)setSummary({status:'ready',data,problem:''})})
      .catch(error=>{if(live)setSummary({status:'error',data:null,problem:analyticsProblem(error)})})
    if(!canAdminister)setDisputes(RESTRICTED)
    else{setDisputes(LOADING);loadRepeatedDisputes(request).then(pairs=>{if(live)setDisputes(pairs||[])}).catch(error=>{if(live)setDisputes(isAccessDenied(error)?RESTRICTED:FAILED)})}
    return()=>{live=false}},[request,filters.category,filters.area,canAdminister,rangeProblem])

  const filtered=useMemo(()=>filterRecords(records.rows,{area:filters.area}),[records.rows,filters.area])
  const stats=useMemo(()=>incidentSummary(filtered,{from,to}),[filtered,from,to])
  const areas=useMemo(()=>{const list=areaOptions(records.rows);return filters.area&&!list.includes(filters.area)?[filters.area,...list]:list},[records.rows,filters.area])
  const recordsUsable=records.status==='ready'&&records.check?.complete!==false
  const data=summary.status==='ready'?summary.data:null
  const peopleRestricted=data&&(data.repeat_people_restricted===true||data.repeat_people==null)
  const update=(key,value)=>setFilters(current=>nextFilters(current,key,value))
  const chooseCategory=key=>update('category',filters.category===key?'':key)
  const periodText=filters.window==='all'?'All available records':from||to?`${from?incidentDate(`${from}T12:00:00+08:00`):'…'} – ${to?incidentDate(`${to}T12:00:00+08:00`):'…'}`:periodLabel(filters.window)
  // The history opens even when its analytics fail; a failed history says so instead of doing nothing.
  const viewHistory=async row=>{if(opening.current)return;opening.current=true;setOpeningHistory(true);setHistoryProblem('')
    try{setHistory(await settlePersonRecord(()=>loadPersonHistory(row.person_kind,row.person_id),()=>loadPersonAnalytics(row.person_kind,row.person_id)))}
    catch(error){setHistoryProblem(isAccessDenied(error)?'This person history is not available for this account.':'Person history is unavailable. Check access and try again.')}
    finally{opening.current=false;setOpeningHistory(false)}}
  const shownRecords=showAllRecords?filtered:filtered.slice(0,RECORD_PREVIEW)

  return <div className="analytics-insights">{embedded?<div className="ai-embedded-intro"><h2>Analytics &amp; Insights</h2><p>Descriptive patterns from recorded barangay incidents and verified linked records.</p><small>These summaries do not predict behavior or determine wrongdoing.</small></div>:<header className="official-dashboard-header"><h1>Analytics &amp; Insights</h1><p>Descriptive patterns from recorded barangay incidents and verified linked records.</p><small>These summaries do not predict behavior or determine wrongdoing.</small></header>}
    <section className="dashboard-card analytics-filters" aria-label="Analytics filters"><h2>Filters</h2>
      <div className="ai-filter-grid">
        <label>Period<select aria-label="Time window" value={filters.window} onChange={e=>update('window',e.target.value)}>{PERIODS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {filters.window==='custom'&&<><label>From<input aria-label="From date" type="date" value={filters.from} onChange={e=>update('from',e.target.value)}/></label><label>To<input aria-label="To date" type="date" value={filters.to} onChange={e=>update('to',e.target.value)}/></label></>}
        <label>Incident category<select aria-label="Incident category" value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">All categories</option>{INCIDENT_TYPE_KEYS.map(key=><option key={key} value={key}>{incidentTypeLabel(key)}</option>)}</select></label>
        <label>Recorded area<select aria-label="Recorded area" value={filters.area} onChange={e=>update('area',e.target.value)}><option value="">All areas</option>{areas.map(area=><option key={area} value={area}>{area}</option>)}</select></label>
        <button type="button" className="btn-cancel" onClick={()=>setFilters(BLANK)}>Reset</button>
      </div>
      <p className="ai-scope">Dates use Asia/Manila calendar days; weeks start Monday. Category and area apply only to sections marked “Uses incident filters.” Showing: <strong>{periodText}</strong>.</p>
    </section>
    {rangeProblem&&<p role="status" className="analytics-caveat">{rangeProblem}</p>}
    {!rangeProblem&&<>
      <section className="dashboard-card ai-section" aria-labelledby="ai-incidents"><h2 id="ai-incidents">Incident analytics <small>Uses incident filters</small></h2>
        <p className="ai-source">Source: every recorded incident in the selected period (the incident records list). Each incident counts once.</p>
        {records.status===LOADING&&<p role="status">Loading incident records…</p>}
        {records.status==='error'&&<Problem kind={records.problem}/>}
        {records.status==='ready'&&!recordsUsable&&<p role="alert">{SOURCE_INCOMPLETE} ({records.check.received} of {records.check.expected} records returned.)</p>}
        {recordsUsable&&(stats.total===0?<p className="ai-empty-period">No incidents were recorded for this selection.</p>:<>
          <div className="analytics-summary"><Kpi value={stats.total} label="Incident records"/><Kpi value={filtered.filter(r=>r.blotter_reference).length} label="With a blotter entry"/><Kpi value={stats.areas.length} label="Distinct recorded areas"/></div>
          <TrendChart title="Incidents over time" series={stats.series} granularityLabel={GRANULARITY_LABELS[stats.granularity]}/>
          <div className="analytics-insights-grid">
            <BarChart title="Incident categories" rows={stats.categories} unit="incident" onSelect={chooseCategory} selectedKey={filters.category} note="Select a category to drill down. Select it again for all categories." hideZero/>
            <BarChart title="Current status" rows={stats.statuses} unit="incident" hideZero/>
            <BarChart title="Day of week" rows={stats.weekdays} unit="incident"/>
            <BarChart title="Time of day" rows={stats.timeBands} unit="incident"/>
            <BarChart title="Recorded areas" rows={stats.areas} unit="incident" note="Area note when recorded, otherwise the location text, exactly as typed."/>
          </div>
          {stats.undated>0&&<p className="ai-chart-note">{stats.undated} record(s) have no usable date and are counted in totals only.</p>}
          {filters.category&&<section className="analytics-drill ai-drill" aria-labelledby="ai-drill-title"><div><h3 id="ai-drill-title">{incidentTypeLabel(filters.category)} — {stats.total} record{stats.total===1?'':'s'}</h3><button type="button" className="btn-cancel btn-sm" onClick={()=>update('category','')}>All categories</button></div>
            <p className="ai-chart-note">The charts above are already narrowed to this category{filters.area?` and area`:''}. These are the records they count.</p>
            <div className="table-wrapper"><table className="dashboard-table analytics-table"><caption className="visually-hidden">{incidentTypeLabel(filters.category)} incident records</caption><thead><tr><th scope="col">Date and time</th><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Recorded area</th></tr></thead>
              <tbody>{shownRecords.map(row=><tr key={row.id}><td data-label="Date and time">{incidentDateTime(row.occurred_at)||'Not recorded'}</td><td data-label="Reference">{row.reference}</td><td data-label="Status">{incidentStatusLabel(row.status)}</td><td data-label="Recorded area">{areaOf(row)}</td></tr>)}</tbody></table></div>
            {filtered.length>RECORD_PREVIEW&&<button type="button" className="btn-secondary btn-sm" aria-expanded={showAllRecords} onClick={()=>setShowAllRecords(v=>!v)}>{showAllRecords?'Show fewer':`Show all ${filtered.length} records`}</button>}
          </section>}
        </>)}
      </section>

      <section className="dashboard-card ai-section" aria-labelledby="ai-parties"><h2 id="ai-parties">People involved in incidents <small>Uses incident filters</small></h2>
        <p className="ai-source">Source: verified person links on incident records. Each figure counts incidents, not people, except where stated.</p>
        {summary.status===LOADING&&<p role="status">Loading linked-record analytics…</p>}
        {summary.status==='error'&&<Problem kind={summary.problem}/>}
        {data&&<>
          <p className="analytics-caveat">Based on verified linked records. Unlinked historical records are not attributed to a person.</p>
          <div className="analytics-summary"><Kpi value={data.overview.respondent_subject_matters} label="Incidents with a respondent or subject"/><Kpi value={data.overview.victim_matters} label="Incidents with a victim"/><Kpi value={data.overview.substantiated_outcomes} label="Incidents with a substantiated outcome"/><Kpi value={data.overview.not_substantiated_outcomes} label="Incidents with a not-substantiated outcome"/><Kpi value={data.overview.linked_people} label="Linked person records"/></div>
          <p className="ai-chart-note">{IDENTITY_COUNT_NOTE}</p>
          <div className="analytics-insights-grid">
            <BarChart title="Recorded roles" rows={(data.roles||[]).map(r=>({key:r.role,label:displayLabel(r.role),total:r.total}))} unit="incident"/>
            <BarChart title="Recorded outcomes" rows={(data.outcomes||[]).map(r=>({key:r.outcome,label:displayLabel(r.outcome),total:r.total}))} unit="incident" note="“Closed” is a procedural closure only."/>
          </div>
        </>}
      </section>

      <section className="dashboard-card"><h2>People analytics</h2><p>The date window applies. Category and area do not filter complaint matters.</p>{summary.status==='error'?<Problem kind={summary.problem}/>:!data?<p role="status">Loading people analytics…</p>:peopleRestricted?<p role="note">{PEOPLE_RESTRICTED}</p>:data.repeat_people.length?<><p className="ai-chart-note">Each row is one identity record. {IDENTITY_COUNT_NOTE}</p><div className="table-wrapper"><table className="dashboard-table analytics-table"><thead><tr><th>Name</th><th>Type</th><th>Matters</th><th>Substantiated</th><th>Not substantiated</th><th>Not determined</th><th>Referred</th><th>Closed</th><th>Unknown</th><th>Action</th></tr></thead><tbody>{data.repeat_people.map(row=><tr key={`${row.person_kind}-${row.person_id}`}><td>{row.display_name}</td><td>{displayLabel(row.person_kind)}</td><td>{row.qualifying_matters}</td><td>{row.substantiated}</td><td>{row.not_substantiated}</td><td>{row.not_determined}</td><td>{row.referred}</td><td>{row.closed} <small>procedural closure only</small></td><td>{row.unknown}</td><td><button type="button" className="btn-secondary btn-sm" disabled={openingHistory} onClick={()=>viewHistory(row)}>View history</button></td></tr>)}</tbody></table></div></>:<p>No verified linked records are available for this analysis.</p>}{historyProblem&&<p role="alert">{historyProblem}</p>}</section>

      <section className="dashboard-card"><h2>Complaint/KP analytics</h2><p>The date window applies. Incident category and area filters do not apply, and complaint counts are never added to incident counts.</p>{disputes===RESTRICTED?<p role="note">{DISPUTES_RESTRICTED}</p>:disputes===FAILED?<p role="alert">Complaint pair analytics are unavailable. Try again.</p>:disputes===LOADING?<p role="status">Loading complaint pair analytics…</p>:disputes.length?<div className="table-wrapper"><table className="dashboard-table analytics-table"><thead><tr><th>People</th><th>Distinct complaint/KP matters</th><th>First recorded</th><th>Last recorded</th><th>Action</th></tr></thead><tbody>{disputes.map(row=><tr key={`${row.person_a_key}-${row.person_b_key}`}><td>{row.person_a} ↔ {row.person_b}</td><td>{row.matter_count}</td><td>{recordedDate(row.first_recorded)}</td><td>{recordedDate(row.last_recorded)}</td><td><button type="button" className="btn-secondary btn-sm" onClick={()=>setReviewDispute(row)}>Review disputes</button></td></tr>)}</tbody></table></div>:<p>No verified linked repeated complaint pair is available for this analysis.</p>}{reviewDispute&&<div className="analytics-drill"><h3>Contributing complaints</h3><ul>{reviewDispute.matter_references.map(reference=><li key={reference}>{reference}</li>)}</ul><button type="button" className="btn-cancel btn-sm" onClick={()=>setReviewDispute(null)}>Close</button></div>}</section>

      <section className="dashboard-card"><h2>Community Credit — active policy facts</h2><p>Uses the active policy only. The period and incident filters do not apply. Analytics do not create credit events or alter enrollment.</p>{summary.status==='error'?<Problem kind={summary.problem}/>:!data?<p role="status">Loading Community Credit facts…</p>:data.community_credit?.configured===false?<p>{data.community_credit.message}</p>:data.community_credit?<><div className="analytics-summary"><Kpi value={data.community_credit.enrolled_residents} label="Enrolled residents"/><Kpi value={data.community_credit.residents_with_events} label="Residents with credit events"/><Kpi value={data.community_credit.event_count} label="Credit events"/></div>
        <div className="analytics-insights-grid"><BarChart title="Starting score distribution" rows={(data.community_credit.starting_score_distribution||[]).map(r=>({key:String(r.score),label:`Score ${r.score}`,total:r.residents}))} unit="resident"/><BarChart title="Current score distribution" rows={(data.community_credit.current_score_distribution||[]).map(r=>({key:String(r.score),label:`Score ${r.score}`,total:r.residents}))} unit="resident"/></div></>:<p>Community Credit facts are not included in this response.</p>}</section>
    </>}{history&&<PersonDialog data={history} onClose={()=>setHistory(null)}/>}</div>
}
