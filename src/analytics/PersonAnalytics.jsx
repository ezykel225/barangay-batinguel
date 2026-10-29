import { useMemo, useState } from 'react'
import { displayLabel } from '../people/PeopleHistory'
import './Analytics.css'

const List=({title,rows=[],field,onSelect})=><section className="analytics-block"><h4>{title}</h4>{rows.length?<ul className="analytics-bars">{rows.map((row,i)=><li key={`${row[field]}-${i}`}><button type="button" onClick={()=>onSelect?.(row)} disabled={!onSelect}><span>{displayLabel(row[field])}</span><strong>{row.total}</strong></button></li>)}</ul>:<p>No verified linked records are available for this analysis.</p>}</section>

export default function PersonAnalytics({data,onWindowChange}){
  const [drill,setDrill]=useState(null)
  const matters=useMemo(()=>data?.contributing_matters||[],[data])
  if(!data)return <p>Loading factual analytics…</p>
  const show=(kind,row,source=kind)=>setDrill({label:row[source],rows:matters.filter(m=>m[kind]===row[source])})
  const showRows=(label,rows=[])=>setDrill({label,rows})
  return <div className="person-analytics"><p className="analytics-caveat">{data.coverage?.message}</p>
    {onWindowChange&&<label className="analytics-window">Time window <select value={data.filters?.window||'all'} onChange={e=>onWindowChange(e.target.value)}><option value="all">All verified linked records</option><option value="last_30_days">Last 30 days</option><option value="last_90_days">Last 90 days</option><option value="last_12_months">Last 12 months</option><option value="previous_12_months">Previous 12 months</option></select></label>}
    <div className="analytics-summary"><div><strong>{data.summary.distinct_linked_matters}</strong><span>Distinct linked matters</span></div><div><strong>{data.summary.incident_matters}</strong><span>Incident matters</span></div><div><strong>{data.summary.complaint_kp_matters}</strong><span>Complaint/KP matters</span></div></div>
    <p>{data.comparison.current_period_qualifying_matters} respondent/subject matters in the last 12 months, compared with {data.comparison.previous_period_qualifying_matters} in the previous 12 months. <button type="button" className="btn-secondary btn-sm" onClick={()=>showRows('Last 12 months',data.indicators?.[1]?.contributing_matters)}>Review contributing records</button></p>
    <div className="analytics-grid"><List title="Roles" rows={data.roles} field="role" onSelect={row=>show('role',row)}/><List title="Outcomes" rows={data.outcomes} field="outcome" onSelect={row=>show('outcome',row)}/><List title="Recurring categories" rows={data.categories} field="category" onSelect={row=>show('category',row)}/><List title="Recorded locations" rows={data.locations} field="area_label" onSelect={row=>show('area',row,'area_label')}/><List title="Day of week" rows={data.weekdays} field="weekday"/><List title="Recorded time periods" rows={data.time_buckets} field="bucket"/></div>
    {data.historical_review?.requires_review===true&&<section className="historical-review historical-review-visible"><h4>Historical Records Review</h4><p><strong>{data.historical_review.qualifying_count}</strong> qualifying pre-enrollment matters were identified.</p><p>{data.historical_review.message}</p><button type="button" className="btn-secondary btn-sm" onClick={()=>showRows('Historical Records Review',data.historical_review.contributing_matters)}>Review contributing records</button></section>}
    {drill&&<section className="analytics-drill"><div><h4>Contributing records: {displayLabel(drill.label)}</h4><button type="button" className="btn-cancel btn-sm" onClick={()=>setDrill(null)}>Close</button></div>{drill.rows.length?<ul>{drill.rows.map((row,index)=><li key={`${row.matter_key}-${row.role||index}`}><strong>{row.reference}</strong><span>{displayLabel(row.category)} · {displayLabel(row.role)} · {displayLabel(row.outcome)}</span>{row.related_records?.length>0&&<span>Related to: {row.related_records.map(item=>[item.reference,item.kp_reference].filter(Boolean).join(' / ')).join(', ')}</span>}</li>)}</ul>:<p>No verified linked records are available for this analysis.</p>}</section>}
  </div>
}
