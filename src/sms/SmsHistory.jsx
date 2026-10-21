import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DialogShell } from '../components/OfficialArchiveDialog'
import SmsComposer from './SmsComposer'
import { smsRpc, dispatchBroadcast, audienceLabel } from './smsApi'
export default function SmsHistory({sourceType,sourceId,openOnMount=false,onClose}){
 const [open,setOpen]=useState(openOnMount),[history,setHistory]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const closeRef=useRef(null),composer=useRef(null),pending=useRef(false),id=useId()
 const load=useCallback(async()=>{try{const result=await smsRpc('sms_source_history',{p_source_type:sourceType,p_source_id:String(sourceId)});setHistory(result.broadcasts||[])}catch(e){setMessage(e.message)}},[sourceType,sourceId])
 useEffect(()=>{if(openOnMount)load()},[openOnMount,load])
 const close=()=>{setOpen(false);onClose?.()}
 const run=async(fn)=>{if(pending.current)return;pending.current=true;setBusy(true);try{await fn()}catch(e){setMessage(e.message)}finally{pending.current=false;setBusy(false);await load()}}
 return <>
  <button type="button" className="btn-cancel btn-sm sms-history-button" aria-label="SMS notification history" onClick={()=>{setOpen(true);load()}}>SMS</button>
  {open&&<div className="sms-dialog"><DialogShell open titleId={id} title="SMS Notification" busy={busy} initialFocusRef={closeRef} onCancel={()=>{if(!busy)close()}} header={<header className="sms-dialog-header"><h2 id={id}>SMS Notification</h2><button type="button" ref={closeRef} disabled={busy} className="btn-cancel" aria-label="Close SMS notification" onClick={close}>×</button></header>}>
   <div className="sms-dialog-body">
    <SmsComposer ref={composer} sourceType={sourceType} sourceId={sourceId} editing previewDraft={false} onResult={message=>setMessage(message)}/>
    <button type="button" className="btn-add" disabled={busy} onClick={()=>{if(!composer.current?.enabled){setMessage('Enable SMS and confirm the preview first.');return}if(composer.current?.beforeSave())run(()=>composer.current.afterSave(sourceId))}}>Send confirmed notification</button>
    {message&&<p role="status">{message}</p>}
    <h3>SMS history</h3><p className="sms-note">Accepted means queued by the provider, not delivered. Unknown outcomes need review and are never automatically resent.</p>
    {!history.length&&<p>No SMS broadcasts recorded.</p>}
    {history.map(row=><article className="sms-history-row" key={row.id}><strong>{row.is_dry_run?'Dry run - no SMS sent':row.counts.unknown?'Needs review':row.counts.pending?'Processing':row.counts.failed?'Completed with errors':row.counts.eligible===row.counts.skipped?'No usable SMS destinations':'Requests processed'}</strong><p>{audienceLabel(row.audience)} · {row.kind} · {new Date(row.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p><p>Accepted: {row.counts.accepted} · Failed: {row.counts.failed} · Unknown/in flight: {row.counts.unknown} · Skipped: {row.counts.skipped} · Pending: {row.counts.pending}{row.is_dry_run && <> ? Dry-run destinations: {row.counts.dry_run}</>}</p><blockquote>{row.message}</blockquote>{row.can_resume&&<button type="button" className="btn-cancel" disabled={busy} onClick={()=>run(()=>dispatchBroadcast(row.id))}>Resume this broadcast</button>}</article>)}
   </div>
  </DialogShell></div>}
 </>
}
