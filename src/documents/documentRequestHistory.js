import { supabase } from '../supabase/supabaseClient'

// Reuse the existing official-readable, append-only log. Never infer missing events.
export async function loadDocumentRequestHistory(requestId) {
  const { data, error } = await supabase.from('activity_log')
    .select('id, action, details, created_at')
    .eq('entity_type', 'document_request').eq('entity_id', requestId)
    .order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error('Request activity unavailable')
  return data || []
}
