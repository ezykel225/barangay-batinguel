import { supabase } from '../supabase/supabaseClient'
export async function smsRpc(name,args){
 const {data,error}=await supabase.rpc(name,args)
 if(error){
  if(error.code==='42501')throw new Error('This account cannot manage these SMS notifications.')
  if(error.code==='23505')throw new Error('An initial SMS broadcast already exists. Check SMS history instead of sending it again.')
  if(/Unsupported or invalid audience|Choose an audience/.test(error.message||''))throw new Error('Choose a valid audience, Purok, or inclusive age range from 0 to 150.')
  throw new Error('Notification unavailable or changed. Preview again; check history before retrying.')
 }
 return data
}
export async function dispatchBroadcast(id){
 const initial=await smsRpc('sms_broadcast_state',{p_id:id})
 if(initial?.counts?.pending===0)return initial
 for(let batch=0;batch<400;batch++){
  const {data,error}=await supabase.functions.invoke('send-sms-broadcast',{body:{broadcast_id:id}})
  if(error||data?.error)throw new Error('SMS was not completed. Open SMS history to review or resume the same broadcast. Live sending may be disabled.')
  if(!data?.counts||data.counts.pending===0)return data
 }
 throw new Error('Processing paused. Resume this same broadcast from SMS history.')
}
export function audienceLabel(a){if(a?.type==='senior_citizens')return 'Senior Citizens (60+)';if(a?.type==='age_range')return `Age ${a.min_age}-${a.max_age}`;if(a?.type==='purok')return a.value;return 'All Residents'}
