import { supabase } from '../supabase/supabaseClient'

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error('The people-history operation could not be completed.')
  return data
}

export const searchPeople = (query) => rpc('search_people', { p_search: query.trim() })
export const loadPersonHistory = (kind, id) => rpc('person_history', { p_person_kind: kind, p_person_id: id })
export const loadPersonAnalytics = (kind, id, { from = null, to = null, window = 'all' } = {}) => rpc('person_analytics', {
  p_person_kind: kind, p_person_id: id, p_from: from || null, p_to: to || null, p_window: window,
})
export const createExternalPerson = (form) => rpc('save_external_person', {
  p_id: null, p_first_name: form.firstName, p_middle_name: form.middleName || '',
  p_last_name: form.lastName, p_suffix: form.suffix || '', p_recorded_barangay: form.barangay || '',
  p_recorded_city_municipality: form.city || '', p_address_snapshot: form.address || '',
})
export const loadIncidentParties = (incidentId) => rpc('incident_parties_for', { p_incident_id: incidentId })
export const saveIncidentParty = ({ id = null, incidentId, kind, personId, role, note, outcome = 'not_determined' }) => rpc('save_incident_party', {
  p_id: id, p_incident_id: incidentId,
  p_resident_id: kind === 'resident' ? personId : null,
  p_external_person_id: kind === 'external' ? personId : null,
  p_role: role, p_address_snapshot: '', p_involvement_note: note || '', p_outcome_status: outcome,
})
