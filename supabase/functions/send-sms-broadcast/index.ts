import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processBatch } from '../_shared/smsProvider.js'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}})
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 try {
  const auth=req.headers.get('Authorization')
  if(!auth)return json({error:'Not signed in'},401)
  const caller=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
  const {data:{user},error}=await caller.auth.getUser()
  if(error||!user)return json({error:'Not signed in'},401)
  const body=await req.json()
  if(typeof body.broadcast_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.broadcast_id))return json({error:'Notification identity required'},400)
  // No phone, message, source, actor or provider credentials are accepted from the browser.
  if(Object.keys(body).some(key=>key!=='broadcast_id'))return json({error:'Unsupported request fields'},400)
  const {error:contextError}=await caller.rpc('sms_send_context',{p_id:body.broadcast_id})
  if(contextError)return json({error:'Not authorized for this notification'},403)
  if(Deno.env.get('SMS_BROADCASTS_LIVE_ENABLED')!=='true')return json({error:'Live SMS is disabled. Use Dry run - no SMS sent.'},409)
  const token=Deno.env.get('IPROG_SMS_API_TOKEN'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!token||!serviceKey)return json({error:'SMS server configuration unavailable'},503)
  const worker=createClient(Deno.env.get('SUPABASE_URL')??'',serviceKey,{auth:{persistSession:false}})
  await processBatch({caller,worker,broadcastId:body.broadcast_id,actorId:user.id,token})
  const {data,error:stateError}=await caller.rpc('sms_broadcast_state',{p_id:body.broadcast_id})
  if(stateError)return json({error:'Notification status unavailable. Reopen history; do not recreate the send.'},503)
  return json(data)
 } catch {
  // Do not echo provider payloads, tokens, phones, URLs, or internal exception strings.
  return json({error:'Notification processing stopped. Check history before trying again.'},500)
 }
})
