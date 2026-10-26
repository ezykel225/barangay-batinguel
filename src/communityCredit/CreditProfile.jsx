import { useEffect, useState } from 'react'
import { getMyCreditProfile, getResidentCreditProfile } from './communityCreditApi'
import './CommunityCredit.css'

const dateTime = value => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)) : 'None'
const sourceLabel = value => String(value || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())

export default function CreditProfile({ residentId, showResident = false }) {
  const [state,setState] = useState({loading:true,data:null,error:''})
  useEffect(()=>{ let live=true; setState({loading:true,data:null,error:''});
    const request=residentId?getResidentCreditProfile(residentId):getMyCreditProfile()
    request.then(data=>{if(live)setState({loading:false,data:residentId?data:data?.profile,error:''})})
      .catch(()=>{if(live)setState({loading:false,data:null,error:'Community credit information is unavailable. Please try again later.'})})
    return()=>{live=false}
  },[residentId])
  if(state.loading)return <p role="status">Loading community credit profile...</p>
  if(state.error)return <p role="alert">{state.error}</p>
  if(!residentId && state.data==null)return <div className="credit-empty"><h2>Community Credit</h2><p>Your resident directory record is not yet linked to this account.</p></div>
  const data=state.data
  if(!data)return null
  return <div className="credit-profile">
    {showResident&&<section className="credit-section" aria-labelledby="credit-resident-heading"><h2 id="credit-resident-heading">Resident</h2><dl className="credit-facts">
      <div><dt>Full name</dt><dd>{data.resident?.full_name}</dd></div><div><dt>Purok</dt><dd>{data.resident?.purok||'Not recorded'}</dd></div>
      <div><dt>Resident status</dt><dd>{sourceLabel(data.resident?.resident_status)}</dd></div><div><dt>Account linkage</dt><dd>{data.resident?.account_linked?'Linked':'Not linked'}</dd></div>
    </dl></section>}
    <section className="credit-section" aria-labelledby="community-credit-heading"><h2 id="community-credit-heading">Community Credit</h2>
      {!data.configured?<p className="credit-not-configured">Community credit policy is not configured.</p>:<>
        {data.enrolled===false?<p className="credit-not-configured">Community credit enrollment has not started for this resident.</p>:<><div className="credit-score" aria-label={`Current community credit score ${data.current_score} out of ${data.maximum_score}`}><strong>{data.current_score}</strong><span>/ {data.maximum_score}</span><small>Current score</small></div>
        <p className="credit-policy">Policy: {data.policy_name}</p>
        <dl className="credit-metrics"><div><dt>Credit started</dt><dd>{dateTime(data.credit_started_at)}</dd></div><div><dt>Starting score</dt><dd>{data.starting_score??data.base_score}</dd></div><div><dt>Credit adjustments total</dt><dd>{Number(data.event_total)>0?'+':''}{data.event_total}</dd></div>
          <div><dt>Positive events</dt><dd>{data.positive_event_count}</dd></div><div><dt>Negative events</dt><dd>{data.negative_event_count}</dd></div>
          <div><dt>Repair events</dt><dd>{data.repair_event_count}</dd></div><div><dt>Last credit activity</dt><dd>{dateTime(data.last_credit_event_at)}</dd></div></dl></>}
      </>}
    </section>
    {data.enrolled!==false&&<section className="credit-section" aria-labelledby="credit-ledger-heading"><h2 id="credit-ledger-heading">Credit Ledger</h2>
      {!data.ledger?.length?<p>No credit events recorded.</p>:<div className="credit-table-wrap"><table className="credit-table"><thead><tr><th>Date</th><th>Event</th><th>Category</th><th>Points</th><th>Source</th><th>Verified by</th></tr></thead><tbody>
        {data.ledger.map(row=><tr key={row.id}><td data-label="Date">{dateTime(row.verified_at)}</td><td data-label="Event">{row.event}</td><td data-label="Category">{sourceLabel(row.category)}</td><td data-label="Points"><span className="credit-points">{row.points>0?'+':''}{row.points}</span></td><td data-label="Source">{row.source_reference||sourceLabel(row.source)}</td><td data-label="Verified by">{row.verified_by}</td></tr>)}
      </tbody></table></div>}
    </section>}
    {showResident&&<section className="credit-section credit-safety-placeholder" aria-labelledby="credit-safety-heading"><h2 id="credit-safety-heading">Public-Safety History</h2><p>Resident incident and KP analytics will appear here once verified person-linking and outcome review are enabled.</p></section>}
  </div>
}

