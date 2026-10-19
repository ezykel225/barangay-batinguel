import { supabase } from '../supabase/supabaseClient'

// No table access or client-side authority decisions. SQL gates every operation.
export async function caseRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error('Unable to complete the case operation. Check your access and try again.')
  return data
}

export const manilaDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type) => parts.find((p) => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const dueState = (date, today = manilaDate()) => !date ? 'Not set' : date < today ? 'Overdue' : date === today ? 'Due today' : 'Upcoming'
