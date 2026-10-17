// Combined Phase 2 — the Tanod roster and patrol assignment calls.
//
// ⚠️ No `supabase.from` here either: `tanod_members` and `tanod_assignments`
// are private tables reached only through SECURITY DEFINER functions.

import { supabase } from '../supabase/supabaseClient'
import { TANOD_ERRORS } from './tanodLabels'

const logFailure = (what, error) => console.warn(`[tanod] ${what} failed`, error)

const tanodError = (error, fallbackKey) => {
  const message = String(error?.message || '')
  const err = new Error(fallbackKey)
  if (/Secretary or the Punong Barangay/i.test(message)) err.kind = 'notPermitted'
  else if (/needs a name/i.test(message)) err.kind = 'nameRequired'
  else if (/needs an area/i.test(message)) err.kind = 'areaRequired'
  else if (/needs a date/i.test(message)) err.kind = 'dateRequired'
  else err.kind = fallbackKey
  return err
}

export const tanodMessage = (err, fallbackKey) => (
  TANOD_ERRORS[err?.kind] || TANOD_ERRORS[fallbackKey] || TANOD_ERRORS.loadFailed
)

export const loadTanodRoster = async ({ includeInactive = true } = {}) => {
  const { data, error } = await supabase.rpc('tanod_roster', {
    p_include_inactive: includeInactive,
  })
  if (error) { logFailure('Load Tanod roster', error); throw tanodError(error, 'loadFailed') }
  return data || []
}

export const loadTanodAssignments = async ({ from, to } = {}) => {
  const { data, error } = await supabase.rpc('tanod_assignments_for', {
    p_from: from || null, p_to: to || null,
  })
  if (error) { logFailure('Load assignments', error); throw tanodError(error, 'loadFailed') }
  return data || []
}

export const addTanodMember = async ({ fullName, areaNote, displayOrder }) => {
  const { data, error } = await supabase.rpc('add_tanod_member', {
    p_full_name: fullName,
    p_area_note: String(areaNote ?? '').trim() || null,
    p_display_order: Number(displayOrder) || 0,
  })
  if (error) { logFailure('Add Tanod', error); throw tanodError(error, 'addFailed') }
  return data
}

export const setTanodActive = async ({ tanodId, active }) => {
  const { error } = await supabase.rpc('set_tanod_member_active', {
    p_tanod_id: tanodId, p_active: active,
  })
  if (error) { logFailure('Set Tanod active', error); throw tanodError(error, 'updateFailed') }
}

export const scheduleAssignment = async ({
  tanodId, assignmentDate, areaLabel, patrolType, startTime, endTime,
}) => {
  const { data, error } = await supabase.rpc('schedule_tanod_assignment', {
    p_tanod_id: tanodId,
    p_assignment_date: assignmentDate,
    p_area_label: areaLabel,
    p_patrol_type: patrolType || 'roving',
    p_start_time: startTime || null,
    p_end_time: endTime || null,
  })
  if (error) { logFailure('Schedule assignment', error); throw tanodError(error, 'scheduleFailed') }
  return data
}

export const setAssignmentActive = async ({ assignmentId, active }) => {
  const { error } = await supabase.rpc('set_tanod_assignment_active', {
    p_assignment_id: assignmentId, p_active: active,
  })
  if (error) { logFailure('Set assignment active', error); throw tanodError(error, 'updateFailed') }
}
