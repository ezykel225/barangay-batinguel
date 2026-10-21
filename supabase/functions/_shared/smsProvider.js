// Server-only iProg contract. No credential-bearing URL or raw response is returned/logged.
export function estimateSegments(message) {
  const basic = /^[\x20-\x7e\r\n]*$/.test(message)
  const units = basic ? [...message].reduce((n,c)=>n+('^{}[]~|\\'.includes(c)?2:1),0) : message.length
  return { encoding: basic ? 'GSM-7 estimate' : 'Unicode estimate', segments: units <= (basic?160:70) ? 1 : Math.ceil(units/(basic?153:67)) }
}
export async function submitIprog({ phone, message, token, fetchImpl = fetch }) {
  if (!/^639[0-9]{9}$/.test(phone) || !message || !token) throw new Error('Invalid server SMS configuration')
  let response
  try {
    response = await fetchImpl('https://iprogsms.com/api/v1/sms_messages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({api_token:token,phone_number:phone,message}),
      signal:AbortSignal.timeout(8000),
    })
  } catch { return {status:'unknown',reason:'transport_unknown',providerId:null} }
  let data
  try { data = await response.json() } catch { return {status:'unknown',reason:'provider_unknown',providerId:null} }
  const status = typeof data?.status==='number' || (typeof data?.status==='string' && data.status.trim()!=='') ? Number(data.status) : NaN
  if (response.ok && status===200 && typeof data?.message_id==='string' && data.message_id.length>0 && data.message_id.length<=128) {
    return {status:'accepted',reason:null,providerId:data.message_id}
  }
  // Explicit provider rejection only. Timeouts, malformed replies and 5xx are ambiguous.
  if (response.status<500 && data && Number.isFinite(status) && status!==200) {
    return {status:'failed',reason:'provider_rejected',providerId:null}
  }
  return {status:'unknown',reason:'provider_unknown',providerId:null}
}
/** @param {{caller:any, worker:any, broadcastId:string, actorId:string, token:string, fetchImpl?:typeof fetch}} args */
export async function processBatch({ caller, worker, broadcastId, actorId, token, fetchImpl }) {
  const {error:contextError}=await caller.rpc('sms_send_context',{p_id:broadcastId})
  if(contextError)throw new Error('Not authorized to process this notification')
  const {data:batch,error}=await worker.rpc('sms_claim_batch',{p_id:broadcastId,p_actor:actorId})
  if(error)throw new Error('Notification queue unavailable')
  for(const row of batch || []) {
    const outcome=await submitIprog({phone:row.phone,message:row.message,token,fetchImpl})
    const {error:finishError}=await worker.rpc('sms_finish_attempt',{p_id:row.recipient_id,p_actor:actorId,p_status:outcome.status,p_reason:outcome.reason,p_provider_id:outcome.providerId})
    // Never call the provider again if persisting a result fails. The durable claim stays attempting.
    if(finishError)throw new Error('A provider outcome needs review; automatic resend was stopped')
  }
  return (batch || []).length
}
