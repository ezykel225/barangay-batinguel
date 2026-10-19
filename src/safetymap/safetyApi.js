// Combined Phase 2 — the map and analytics reads.
//
// ⚠️ `incident_map_points()` IS THE PRIVACY BOUNDARY, and it is the reason
// this module exists separately from `incidentApi`. It returns eight columns
// and NO NARRATIVE, no area note, no recorder name and no blotter summary --
// a marker popup is read by whoever is standing at the screen, so the sentence
// an official typed is not sent to it.
//
// ⚠️ None of the five analytics readers returns a narrative or a person
// either. They return counts.

import { supabase } from '../supabase/supabaseClient'

const logFailure = (what, error) => console.warn(`[safety-map] ${what} failed`, error)

export const SAFETY_ERRORS = Object.freeze({
  loadFailed: 'The safety map could not be loaded. Try again in a moment.',
  analyticsFailed: 'The incident summary could not be loaded. Try again in a moment.',
})

const call = async (fn, args, what) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { logFailure(what, error); throw new Error('loadFailed') }
  return data || []
}

export const loadMapPoints = ({ from, to, type } = {}) => call(
  'incident_map_points',
  { p_from: from || null, p_to: to || null, p_type: type || null },
  'Load map points'
)

// The map reader intentionally omits non-coordinate records. Reuse the existing
// authorized queue reader to include them, projecting immediately to map-safe fields.
export const loadSafetyIncidents = async () => {
  const [points, records] = await Promise.all([
    loadMapPoints(),
    call('incident_queue', { p_from: null, p_to: null, p_type: null }, 'Load incident records'),
  ])
  const coordinates = new Map(points.map(point => [point.id, point]))
  const rows = new Map(points.map(point => [point.id, point]))
  records.forEach(record => rows.set(record.id, record))
  return [...rows.values()].map(row => ({
    id: row.id, reference: row.reference, incident_type: row.incident_type,
    occurred_at: row.occurred_at, location_text: row.location_text, status: row.status,
    latitude: coordinates.get(row.id)?.latitude ?? null,
    longitude: coordinates.get(row.id)?.longitude ?? null,
  }))
}

export const loadCountsByType = ({ from, to } = {}) => call(
  'incident_counts_by_type', { p_from: from || null, p_to: to || null }, 'Counts by type'
)

export const loadCountsByStatus = ({ from, to } = {}) => call(
  'incident_counts_by_status', { p_from: from || null, p_to: to || null }, 'Counts by status'
)

export const loadMonthlyTrend = ({ from, to } = {}) => call(
  'incident_monthly_trend', { p_from: from || null, p_to: to || null }, 'Monthly trend'
)

export const loadLocationFrequency = ({ from, to } = {}) => call(
  'incident_location_frequency', { p_from: from || null, p_to: to || null }, 'Location frequency'
)

export const loadCoverageSummary = ({ from, to } = {}) => call(
  'tanod_coverage_summary', { p_from: from || null, p_to: to || null }, 'Coverage summary'
)
