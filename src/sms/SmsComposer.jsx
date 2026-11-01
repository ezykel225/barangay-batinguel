import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { smsRpc, dispatchBroadcast, audienceLabel } from './smsApi'
import './SmsNotifications.css'
export default forwardRef(function SmsComposer({sourceType,sourceId=null,draft={},editing=false,previewDraft=true,onEnabledChange=()=>{},onResult=()=>{}},ref){
 const [audience,setAudience]=useState({type:'all_residents'}),[enabled,setEnabled]=useState(false),[preview,setPreview]=useState(null),[confirmed,setConfirmed]=useState(false),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false),[puroks,setPuroks]=useState([])
 const [kind,setKind]=useState(editing?(sourceType==='medical_program'?'schedule_update':'update'):'initial')
 const pending=useRef(false),key=useRef(null),initialEnabledChange=useRef(onEnabledChange),initialRule=useRef(JSON.stringify({type:'all_residents'}))
 useEffect(()=>{initialEnabledChange.current(false)},[])
 const signature=JSON.stringify({audience,draft,sourceId,kind})
 const previewSignature=useRef('')
 useEffect(()=>{let live=true;smsRpc('sms_audience_options',{p_source_type:sourceType}).then(rows=>{if(live)setPuroks(rows||[])}).catch(()=>{});if(sourceId)smsRpc('sms_source_history',{p_source_type:sourceType,p_source_id:String(sourceId)}).then(data=>{if(live&&data?.audience){setAudience(data.audience);initialRule.current=JSON.stringify(data.audience)}}).catch(()=>{});return()=>{live=false}},[sourceType,sourceId])
 const current=preview&&previewSignature.current===signature
 const getPreview=async()=>{
  if(pending.current)return;pending.current=true;setBusy(true);setProblem('');setConfirmed(false)
  try{const result=await smsRpc('sms_preview',{p_source_type:sourceType,p_source_id:!previewDraft&&sourceId?String(sourceId):null,p_draft:draft,p_audience:audience});previewSignature.current=signature;setPreview(result);key.current=null}catch(e){setProblem(e.message)}finally{pending.current=false;setBusy(false)}
 }
 const prepare=async(id,dry)=>{
  if(!current)throw new Error('Preview the current audience and message first.')
  if(!dry&&!confirmed)throw new Error('Confirm the recipient count and message first.')
  if(!key.current)key.current={mode:dry,value:crypto.randomUUID()}
  if(key.current.mode!==dry)throw new Error('Preview again before changing notification mode.')
  return smsRpc('sms_prepare_broadcast',{p_source_type:sourceType,p_source_id:String(id),p_kind:kind,p_audience:audience,p_preview_token:preview.preview_token,p_request_key:key.current.value,p_dry_run:dry})
 }
 useImperativeHandle(ref,()=>({
  enabled,
  beforeSave(){if(!enabled)return true;if(!current||!confirmed){setProblem('Preview SMS and explicitly confirm before saving with SMS.');return false}return true},
  async afterSave(id){
   try{
    if(!enabled){if(JSON.stringify(audience)===initialRule.current)return;await smsRpc('sms_save_rule',{p_source_type:sourceType,p_source_id:String(id),p_audience:audience});return}
    const broadcastId=await prepare(id,false);const state=await dispatchBroadcast(broadcastId);onResult(state?.counts?.unknown||state?.counts?.failed?'Content saved. Some SMS outcomes need review in SMS history.':'Content saved. SMS requests processed; acceptance is not confirmed delivery.')
   }catch(e){onResult(`Content saved. ${e.message}`,true)}
  }
 }))
 const dryRun=async()=>{if(pending.current)return;pending.current=true;setBusy(true);setProblem('');try{if(!sourceId)throw new Error('Save the content first to record a dry run. Preview itself sends no SMS.');const id=await prepare(sourceId,true);const state=await smsRpc('sms_broadcast_state',{p_id:id});setProblem(`Dry run - no SMS sent. ${state.counts.dry_run} unique usable numbers; ${state.counts.skipped} skipped.`);onResult('Dry run - no SMS sent')}catch(e){setProblem(e.message)}finally{pending.current=false;setBusy(false)}}
 return <section className="sms-composer" aria-label="Audience and SMS notification">
  <h4>Audience &amp; Notification</h4>
  <label>SMS target audience<select value={audience.type} disabled={busy} onChange={e=>{setAudience({type:e.target.value,...(e.target.value==='age_range'?{min_age:18,max_age:59}:e.target.value==='purok'?{value:puroks[0]||''}:{})});setConfirmed(false)}}>
   <option value="all_residents">All Residents</option><option value="senior_citizens">Senior Citizens (60+)</option><option value="age_range">Age Range</option><option value="purok">Specific Purok</option>
  </select></label>
  {audience.type==='purok'&&<label>Purok<select value={audience.value||''} onChange={e=>{setAudience({...audience,value:e.target.value});setConfirmed(false)}}><option value="">Choose a recorded Purok</option>{puroks.map(p=><option key={p}>{p}</option>)}</select></label>}
  {audience.type==='age_range'&&<div className="sms-age-grid">{['min_age','max_age'].map((field,i)=><label key={field}>{i?'Maximum age':'Minimum age'}<input type="number" min="0" max="150" value={audience[field]??''} onChange={e=>{setAudience({...audience,[field]:e.target.value});setConfirmed(false)}}/></label>)}</div>}
  <p className="sms-note">Active residents only. Age is calculated from recorded DOB today; 60+ is an SMS audience rule, not proof of legal benefits or OSCA registration. Missing DOB is excluded from age audiences.</p>
  <label className="sms-check"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);onEnabledChange(e.target.checked);setConfirmed(false)}}/>{editing?'Send a separate, explicitly confirmed SMS':'Send SMS when this content is published'}</label>
  {editing&&<label>Notification action<select value={kind} onChange={e=>{setKind(e.target.value);setConfirmed(false)}}>{sourceType==='medical_program'?<option value="schedule_update">Schedule update</option>:<option value="update">Content update</option>}{sourceType!=='announcement'&&<option value="reminder">Manual reminder</option>}</select></label>}
  <button type="button" className="btn-cancel" disabled={busy} onClick={getPreview}>Preview SMS</button>
  {current&&<div className="sms-preview" aria-label="SMS preview"><strong>{audienceLabel(preview.audience)}</strong><p>{preview.eligible} eligible residents · {preview.recipients} unique usable numbers · {preview.skipped} skipped phones</p><p className="sms-note">Missing: {preview.skipped_missing||0} · Invalid: {preview.skipped_invalid||0} · Duplicate destinations: {preview.skipped_duplicate||0}</p>{preview.missing_dob>0&&<p>{preview.missing_dob} active residents excluded for missing/invalid DOB.</p>}<blockquote>{preview.message}</blockquote><p className="sms-note">Provider acceptance is not confirmed delivery. Message length/encoding can affect credits.</p>{enabled&&<label className="sms-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this message and {preview.recipients} unique SMS destinations.</label>}{sourceId&&<button type="button" className="btn-cancel" disabled={busy} onClick={dryRun}>Dry run - no SMS sent</button>}</div>}
  {problem&&<p role="status">{problem}</p>}
 </section>
})
