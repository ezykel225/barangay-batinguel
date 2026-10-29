import { supabase } from '../supabase/supabaseClient'

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error('Analytics are unavailable.')
  return data
}

export const loadBarangayAnalytics = ({ from = null, to = null, category = null, area = null, window = 'all' } = {}) =>
  rpc('barangay_safety_analytics', { p_from: from || null, p_to: to || null, p_category: category || null, p_area: area || null, p_window: window === 'all' && (from || to) ? 'custom' : window })
export const loadRepeatedDisputes = ({ from = null, to = null, window = 'all' } = {}) =>
  rpc('repeated_dispute_analytics', { p_from: from || null, p_to: to || null, p_window: window === 'all' && (from || to) ? 'custom' : window })
