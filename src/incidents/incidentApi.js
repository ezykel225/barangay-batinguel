// Combined Phase 2 — every incident and blotter read and write.
//
// ⚠️ NOTHING HERE TOUCHES A TABLE. `supabase.from` appears nowhere in this
// module: all six tables are private, with zero policies and zero client
// privilege, so a table read is `42501` at the privilege layer. Every call is
// an RPC with a fixed, narrow column list.
//
// ⚠️ AND THE FUNCTION'S OWN SENTENCE NEVER REACHES A SCREEN. Several of these
// RPCs name the position that holds the permission; printing one would put an
// authorization model in an alert in a room with people in it. Each actionable
// refusal is mapped to this project's own words and everything else falls back
// to a neutral sentence.

import { supabase } from '../supabase/supabaseClient'
import { INCIDENT_ERRORS } from './incidentLabels'

const logFailure = (what, error) => {
  // The real error reaches the console for whoever is debugging, and never
  // the screen.
  console.warn(`[incidents] ${what} failed`, error)
}

const incidentError = (error, fallbackKey) => {
  const message = String(error?.message || '')
  const err = new Error(fallbackKey)
  if (/active barangay official can record/i.test(message)) err.kind = 'notPermittedRecord'
  else if (/Secretary or the Punong Barangay/i.test(message)) err.kind = 'notPermittedAdmin'
  else if (/happening in the future/i.test(message)) err.kind = 'futureIncident'
  else if (/needs a description/i.test(message)) err.kind = 'narrativeRequired'
  else if (/needs a location/i.test(message)) err.kind = 'locationRequired'
  else if (/needs the date and time/i.test(message)) err.kind = 'occurredRequired'
  else err.kind = fallbackKey
  return err
}

export const incidentMessage = (err, fallbackKey) => (
  INCIDENT_ERRORS[err?.kind] || INCIDENT_ERRORS[fallbackKey] || INCIDENT_ERRORS.loadFailed
)

export const loadIncidentQueue = async ({ from, to, type } = {}) => {
  const { data, error } = await supabase.rpc('incident_queue', {
    p_from: from || null, p_to: to || null, p_type: type || null,
  })
  if (error) { logFailure('Load incident queue', error); throw incidentError(error, 'loadFailed') }
  return data || []
}

export const loadIncidentDetail = async (incidentId) => {
  const { data, error } = await supabase.rpc('incident_detail', { p_incident_id: incidentId })
  if (error) { logFailure('Load incident detail', error); throw incidentError(error, 'loadFailed') }
  return (data || [])[0] || null
}

export const loadBlotterHistory = async (incidentId) => {
  const { data, error } = await supabase.rpc('blotter_history_for', { p_incident_id: incidentId })
  if (error) { logFailure('Load blotter history', error); throw incidentError(error, 'loadFailed') }
  return data || []
}

export const loadIncidentTanod = async (incidentId) => {
  const { data, error } = await supabase.rpc('incident_tanod_for', { p_incident_id: incidentId })
  if (error) { logFailure('Load incident Tanod', error); throw incidentError(error, 'loadFailed') }
  return data || []
}

// ⚠️ IT SENDS NOTHING THE SERVER OWNS. No reference, no blotter reference, no
// status, no recorder and no timestamp is a parameter of this RPC, so none of
// them can be forged from here. One call creates the incident, its blotter
// entry and the history row.
export const recordIncident = async ({
  incidentType, occurredAt, narrative, locationText, source,
  latitude, longitude, areaNote, tanodId, tanodRole,
}) => {
  const { data, error } = await supabase.rpc('record_incident', {
    p_incident_type: incidentType,
    p_occurred_at: occurredAt,
    p_narrative: narrative,
    p_location_text: locationText,
    p_source: source || 'official_report',
    p_latitude: latitude === '' || latitude === undefined ? null : latitude,
    p_longitude: longitude === '' || longitude === undefined ? null : longitude,
    p_area_note: String(areaNote ?? '').trim() || null,
    p_tanod_id: tanodId || null,
    p_tanod_role: tanodId ? (tanodRole || 'reported') : null,
  })
  if (error) { logFailure('Record incident', error); throw incidentError(error, 'recordFailed') }
  return data
}

export const setIncidentStatus = async ({ incidentId, status, note }) => {
  const { error } = await supabase.rpc('set_incident_status', {
    p_incident_id: incidentId, p_status: status,
    p_note: String(note ?? '').trim() || null,
  })
  if (error) { logFailure('Set incident status', error); throw incidentError(error, 'statusFailed') }
}

export const amendBlotterEntry = async ({ incidentId, note }) => {
  const { error } = await supabase.rpc('amend_blotter_entry', {
    p_incident_id: incidentId, p_note: note,
  })
  if (error) { logFailure('Amend blotter entry', error); throw incidentError(error, 'amendFailed') }
}

export const attributeIncidentTanod = async ({ incidentId, tanodId, role, note }) => {
  const { error } = await supabase.rpc('attribute_incident_tanod', {
    p_incident_id: incidentId, p_tanod_id: tanodId, p_role: role,
    p_note: String(note ?? '').trim() || null,
  })
  if (error) { logFailure('Attribute incident Tanod', error); throw incidentError(error, 'tanodFailed') }
}
