import { useEffect, useState } from 'react'
import { getMyCreditProfile, getResidentCreditProfile } from './communityCreditApi'
import CreditGauge from './CreditGauge'
import CreditCorrections from './CreditCorrections'
import './CommunityCredit.css'

const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeZone:'Asia/Manila'}).format(new Date(value)) : 'Not recorded'
const label = value => String(value || '').replaceAll('_',' ')
export default function CreditProfile({ residentId, showResident = false }) {
 const [state,setState] = useState({loading:true,data:null,error:''})
 useEffect(()=>{let live=true;setState({loading:true,data:null,error:''});(residentId?getResidentCreditProfile(residentId):getMyCreditProfile()).then(data=>{if(live)setState({loading:false,data:residentId?data:data?.profile,error:''})}).catch(()=>{if(live)setState({loading:false,data:null,error:'Community credit information is unavailable. Please try again later.'})});return()=>{live=false}},[residentId])
 if(state.loading)return <p role="status">Loading community credit profile...</p>
 if(state.error)return <p role="alert">{state.error}</p>
 const data=state.data
 if(!data)return <div className="credit-empty"><h2>Community Credit</h2><p>Your resident directory record is not yet linked to this account.</p></div>
 const v2=data.policy_model==='participation_v2'
 const enrolled=data.configured&&data.enrolled!==false&&data.status!=='not_enrolled'
 const ledger=data.ledger||[]
 return <div className="credit-profile">
  <section className="credit-section"><h2>Community Credit</h2>
   {!data.configured?<p>Community credit policy is not configured.</p>:!enrolled?<p>Community credit enrollment has not started for this resident.</p>:<>
    <div className="credit-hero"><CreditGauge value={data.current_score} maximum={data.maximum_score}/><div><span className="credit-model">{v2?'Active V2 · Participation':'Active V1 · Legacy policy'}</span><h3>{data.policy_name}</h3><p>Your current score comes from the active policy and verified server records.</p>{!v2&&<p>Participation V2 is not active for this profile.</p>}<dl className="credit-facts"><div><dt>Starting score</dt><dd>{data.starting_score??data.base_score??'Not recorded'}</dd></div><div><dt>Credit started</dt><dd>{dateTime(data.credit_started_at)}</dd></div></dl></div></div>
    {data.transition_notice&&<p className="credit-notice">{data.transition_notice}</p>}<p>Reports, complaints, blotters and incident involvement do not automatically affect credit scores. {data.service_notice||'This score does not determine access to essential barangay services.'}</p>
   </>}
  </section>
  {showResident&&<section className="credit-section"><h2>Resident</h2><p>{data.resident?.full_name} · {data.resident?.purok||'Purok not recorded'}</p><p>{label(data.resident?.resident_status)}</p></section>}
  {enrolled&&<>
   <section className="credit-section"><h2>Community participation history</h2>{!v2?<p>Participation history is available when a V2 participation policy is active. Existing V1 adjustments remain below.</p>:<><p>Recorded participation points: <strong>{data.points_recorded??'Not recorded'}</strong>. Positive records remain in your history even at the score ceiling.</p>{!ledger.length&&!data.participations_without_points?.length?<p>No participation records.</p>:<ul className="credit-history">{ledger.filter(r=>r.kind!=='reversal').map(r=><li key={r.id}><strong>{r.activity_title||r.event}</strong><span>{r.activity_reference} · {dateTime(r.activity_date)} · {r.reversed?'Reversed':label(r.kind)}</span></li>)}{data.participations_without_points?.map((r,i)=><li key={`${r.activity_reference}-${i}`}><strong>{r.activity_title}</strong><span>{r.activity_reference} · {label(r.state)} · No points awarded</span></li>)}</ul>}</>}</section>
   <section className="credit-section"><h2>Credit Ledger</h2><p>Credit adjustment ledger — verified entries and reversals.</p>{!ledger.length?<p>No credit events recorded.</p>:<div className="credit-table-wrap" tabIndex="0" aria-label="Credit adjustment ledger"><table className="credit-table"><thead><tr><th>Date</th><th>Event</th><th>Category</th><th>Points</th><th>Source</th><th>Verified by</th></tr></thead><tbody>{ledger.map(r=><tr key={r.id}><td data-label="Date">{dateTime(r.verified_at)}</td><td data-label="Event">{r.event}{r.reason&&<p>{r.reason}</p>}</td><td data-label="Category">{label(r.kind||r.category)}</td><td data-label="Points">{r.points>0?'+':''}{r.points}</td><td data-label="Source">{r.activity_reference||r.source_reference||label(r.source)}</td><td data-label="Verified by">{r.verified_by}</td></tr>)}</tbody></table></div>}</section>
   {!residentId&&<CreditCorrections activeV2={v2} ledger={ledger}/>}
  </>}
 </div>
}
