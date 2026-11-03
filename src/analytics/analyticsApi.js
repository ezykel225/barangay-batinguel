import { supabase } from '../supabase/supabaseClient'

// Every analytics read. The raw database message never leaves this module: a
// caller gets the SQLSTATE (so 42501 reads as a restriction and a missing
// function as "not installed") and a network flag, and nothing else.
const rpc = async (name, args) => {
  let result
  try {
    result = await supabase.rpc(name, args)
  } catch {
    const failure = new Error('Analytics are unavailable.')
    failure.network = true
    throw failure
  }
  const { data, error } = result
  if (error) {
    const failure = new Error('Analytics are unavailable.')
    failure.code = error.code
    // supabase-js reports a failed fetch as an error with no SQLSTATE.
    failure.network = !error.code && /fetch|network|load failed/i.test(String(error.message || ''))
    throw failure
  }
  return data
}

// 062. A preset window is resolved to Manila dates by the caller and sent as a
// custom range, so this function and incident_queue count the same days.
const windowFor = ({ from = null, to = null, window = 'all' } = {}) => (
  window === 'all' && !from && !to ? 'all' : 'custom'
)
export const loadBarangayAnalytics = ({ from = null, to = null, category = null, area = null, window = 'all' } = {}) =>
  rpc('barangay_safety_analytics', { p_from: from || null, p_to: to || null, p_category: category || null, p_area: area || null, p_window: windowFor({ from, to, window }) })
export const loadRepeatedDisputes = ({ from = null, to = null, window = 'all' } = {}) =>
  rpc('repeated_dispute_analytics', { p_from: from || null, p_to: to || null, p_window: windowFor({ from, to, window }) })

// 044 (in production). One row per incident in the inclusive Manila date range,
// optionally one type; no narrative and no person. The same reader Incidents &
// Blotter and the Safety Map use.
export const loadIncidentRecords = ({ from = null, to = null, category = null } = {}) =>
  rpc('incident_queue', { p_from: from || null, p_to: to || null, p_type: category || null }).then((rows) => rows || [])
// 044. The database's own count per type for the same days: the check that the
// record list above is complete.
export const loadIncidentTypeCounts = ({ from = null, to = null } = {}) =>
  rpc('incident_counts_by_type', { p_from: from || null, p_to: to || null }).then((rows) => rows || [])
