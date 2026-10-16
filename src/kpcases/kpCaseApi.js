// Every KP case, panel, hearing and attendance call, and nothing else.
//
// ─── ⚠️ IT ADDS NO AUTHORIZATION AND CANNOT ───────────────────────────
//
// Each call is one of migration 043's SECURITY DEFINER functions, and
// each of those validates the caller in the database:
// `open_kp_case()` and `record_kp_hearing_outcome()` raise `P0001`
// unless the caller holds `Punong Barangay`; the three administrative
// writers unless they hold `Barangay Secretary` or `Punong Barangay`;
// and the five readers return zero rows to anybody who is neither.
// Every one of those resolves through `official_account_links`, never
// through a name and never through `committee`.
//
// ⚠️ THE FOUR KP TABLES CARRY NO CLIENT PRIVILEGE AT ALL, so there is no
// second way to read or write a case and nothing here could be
// "improved" by querying one. Measured: every client role — the
// Secretary and the Punong Barangay included — gets `42501` on a direct
// select, which is the privilege layer answering before RLS is
// consulted. `supabase.from` therefore appears nowhere in this module,
// and a test asserts it.
//
// ⚠️ NO IDENTITY, TIMESTAMP, REFERENCE OR STATUS IS SENT. `opened_by`,
// `opened_at`, `scheduled_by`, `recorded_by`, `outcome_recorded_by`,
// every `*_at` and the `KP-YYYY-XXXXXX` reference are all stamped
// server-side from `auth.uid()` and the server clock. There is no
// parameter here a crafted call could forge.
//
// ⚠️ AND NO ELIGIBILITY IS SENT EITHER. `open_kp_case` takes a COMPLAINT
// id and derives the latest screening itself, so this module cannot
// nominate which screening authorizes a case or assert that one did.

import { supabase } from '../supabase/supabaseClient'
import { KP_ERRORS } from './kpCaseLabels'

const logFailure = (where, error) => {
  console.error(`${where} error:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  })
}

// ⚠️ MAPPED TO OUR OWN WORDS, MATCHED ON THE MESSAGE, because the code is
// `P0001` for all of them. The refusals an official can act on get a
// sentence; everything else falls back to a neutral one, so a message
// naming the position gate — "Only the Punong Barangay can..." — never
// reaches a screen.
const kpError = (error, fallbackKey) => {
  const message = String(error?.message || '')
  const err = new Error(fallbackKey)
  if (/Punong Barangay can open/i.test(message)) err.kind = 'notPermittedOpen'
  else if (/Punong Barangay can record a proceeding outcome/i.test(message)) err.kind = 'notPermittedOutcome'
  else if (/cannot (record|schedule|update)/i.test(message)) err.kind = 'notPermittedAdmin'
  else if (/already been opened/i.test(message)) err.kind = 'duplicateCase'
  else if (/has not been confirmed/i.test(message)) err.kind = 'notConfirmed'
  else if (/says to proceed/i.test(message)) err.kind = 'notProceed'
  else if (/no screening yet/i.test(message)) err.kind = 'noScreening'
  else if (/has been concluded|concluded KP case/i.test(message)) err.kind = 'concludedCase'
  else if (/recorded outcome/i.test(message)) err.kind = 'outcomeRecorded'
  else if (/at most three/i.test(message)) err.kind = 'panelFull'
  else if (/not a party/i.test(message)) err.kind = 'notAParty'
  else err.kind = fallbackKey
  return err
}

export const kpMessage = (err, fallbackKey) => (
  KP_ERRORS[err?.kind] || KP_ERRORS[fallbackKey]
)

// ⚠️ ZERO ROWS IS "NOT YOURS TO SEE", NOT AN ERROR. Each reader's own
// predicate filters rather than raising, so an official who may not read
// a case receives an empty result with no error at all — there is no
// `42501` in this path to surface, and code that reported one would be
// describing a working boundary as a fault.
export const loadKpCase = async (complaintId) => {
  const { data, error } = await supabase.rpc('kp_case_for_complaint', {
    p_complaint_id: complaintId,
  })
  if (error) {
    logFailure('Load KP case', error)
    throw kpError(error, 'loadFailed')
  }
  return Array.isArray(data) && data.length ? data[0] : null
}

export const loadKpHearings = async (caseId) => {
  const { data, error } = await supabase.rpc('kp_hearings_for', { p_case_id: caseId })
  if (error) {
    logFailure('Load KP hearings', error)
    throw kpError(error, 'loadFailed')
  }
  return Array.isArray(data) ? data : []
}

export const loadKpCaseParties = async (caseId) => {
  const { data, error } = await supabase.rpc('kp_case_parties_for', { p_case_id: caseId })
  if (error) {
    logFailure('Load KP case parties', error)
    throw kpError(error, 'loadFailed')
  }
  return Array.isArray(data) ? data : []
}

export const loadKpPanel = async (caseId) => {
  const { data, error } = await supabase.rpc('kp_case_panel_for', { p_case_id: caseId })
  if (error) {
    logFailure('Load KP panel', error)
    throw kpError(error, 'loadFailed')
  }
  return Array.isArray(data) ? data : []
}

export const loadKpAttendance = async (hearingId) => {
  const { data, error } = await supabase.rpc('kp_hearing_attendance_for', {
    p_hearing_id: hearingId,
  })
  if (error) {
    logFailure('Load KP attendance', error)
    throw kpError(error, 'loadFailed')
  }
  return Array.isArray(data) ? data : []
}

// ⚠️ THE COMPLAINT ID IS THE ONLY THING SENT, and the function derives
// the latest screening, checks it was human-CONFIRMED and checks the
// confirmed outcome says to proceed. So eligibility is never asserted by
// the client and is never derived from checklist answers at either layer.
export const openKpCase = async ({ complaintId, note }) => {
  const { data, error } = await supabase.rpc('open_kp_case', {
    p_complaint_id: complaintId,
    p_note: String(note ?? '').trim() || null,
  })
  if (error) {
    logFailure('Open KP case', error)
    throw kpError(error, 'openFailed')
  }
  return data
}

export const assignPanelMember = async ({ caseId, memberName, panelRole }) => {
  const { data, error } = await supabase.rpc('assign_kp_panel_member', {
    p_case_id: caseId,
    p_member_name: String(memberName ?? '').trim(),
    p_panel_role: panelRole,
  })
  if (error) {
    logFailure('Assign KP panel member', error)
    throw kpError(error, 'panelFailed')
  }
  return data
}

export const scheduleHearing = async ({
  caseId, proceedingType, hearingDate, startTime, location, presidingNote, adminNotes,
}) => {
  const { data, error } = await supabase.rpc('schedule_kp_hearing', {
    p_case_id: caseId,
    p_proceeding_type: proceedingType,
    p_hearing_date: hearingDate,
    p_start_time: startTime,
    p_location: String(location ?? '').trim(),
    p_presiding_note: String(presidingNote ?? '').trim() || null,
    p_admin_notes: String(adminNotes ?? '').trim() || null,
  })
  if (error) {
    logFailure('Schedule KP hearing', error)
    throw kpError(error, 'scheduleFailed')
  }
  return data
}

// ⚠️ A NULL PARAMETER LEAVES ITS COLUMN ALONE — the RPC `COALESCE`-merges
// — so saving minutes cannot blank a status somebody else just set.
export const updateHearingRecord = async ({ hearingId, status, minutes, adminNotes }) => {
  const { data, error } = await supabase.rpc('update_kp_hearing_record', {
    p_hearing_id: hearingId,
    p_status: status || null,
    p_minutes: minutes === undefined ? null : String(minutes ?? '').trim() || null,
    p_admin_notes: adminNotes === undefined ? null : String(adminNotes ?? '').trim() || null,
  })
  if (error) {
    logFailure('Update KP hearing record', error)
    throw kpError(error, 'recordFailed')
  }
  return data
}

export const recordAttendance = async ({ hearingId, partyId, attendance, note }) => {
  const { data, error } = await supabase.rpc('record_kp_attendance', {
    p_hearing_id: hearingId,
    p_party_id: partyId,
    p_attendance: attendance,
    p_note: String(note ?? '').trim() || null,
  })
  if (error) {
    logFailure('Record KP attendance', error)
    throw kpError(error, 'attendanceFailed')
  }
  return data
}

// ⚠️ `concludesCase` IS AN EXPLICIT HUMAN ANSWER and is never derived
// from the outcome value. Nothing in this module, and nothing in
// migration 043, decides that a case is over — a function that did would
// make the software the decider rather than the recorder.
export const recordHearingOutcome = async ({
  hearingId, outcome, note, concludesCase,
}) => {
  const { data, error } = await supabase.rpc('record_kp_hearing_outcome', {
    p_hearing_id: hearingId,
    p_outcome: outcome,
    p_note: String(note ?? '').trim() || null,
    p_concludes_case: Boolean(concludesCase),
  })
  if (error) {
    logFailure('Record KP hearing outcome', error)
    throw kpError(error, 'outcomeFailed')
  }
  return data
}
