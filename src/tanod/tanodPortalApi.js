import { supabase } from '../supabase/supabaseClient'

// No client table access, auth UUID selection or identity supplied to operational readers.
export async function tanodRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error('The Tanod operation could not be completed. Check your active account link or contact barangay records staff.')
  return data
}
export const loadMyTanodIdentity = async () => (await tanodRpc('tanod_my_identity'))?.[0] || null
export const loadMyDuty = async () => (await tanodRpc('tanod_my_duty')) || []
export const loadMyReports = async () => (await tanodRpc('tanod_my_reports')) || []
export const checkIn = (assignmentId) => tanodRpc('tanod_check_in', { p_assignment_id: assignmentId })
export const checkOut = (attendanceId) => tanodRpc('tanod_check_out', { p_attendance_id: attendanceId })
export const addFollowup = (incidentId, note) => tanodRpc('tanod_add_followup', { p_incident_id: incidentId, p_note: note.trim() })
export const loadMyFollowups = async (incidentId) => (await tanodRpc('tanod_my_followups', { p_incident_id: incidentId })) || []
export const loadAccountStates = async () => (await tanodRpc('tanod_account_states')) || []
export const setAccountLink = (tanodId, profileId) => tanodRpc('set_tanod_account_link', { p_tanod_id: tanodId, p_profile_id: profileId || null })
export const loadPublicTanodDuty = async () => (await tanodRpc('public_tanod_on_duty')) || []
