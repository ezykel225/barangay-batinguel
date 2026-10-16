// The three screening calls, and nothing else.
//
// ─── ⚠️ IT ADDS NO AUTHORIZATION AND CANNOT ───────────────────────────
//
// Each call is one of migration 042's SECURITY DEFINER functions, and
// each of those validates the caller in the database:
// `prepare_complaint_screening()` raises `P0001` unless the caller holds
// `Barangay Secretary`, `confirm_complaint_screening()` unless they hold
// `Punong Barangay`, and `complaint_screenings_for()` returns zero rows
// to anybody who is neither.
//
// ⚠️ `complaint_screenings` itself carries NO client privilege at all, so
// there is no second way to read or write a screening and nothing here
// could be "improved" by querying the table. Measured: every client role
// — the Secretary and the Punong Barangay included — gets `42501` on a
// direct select.
//
// ⚠️ NO IDENTITY, TIMESTAMP, STATUS OR OUTCOME IS SENT FOR SOMEBODY ELSE.
// `prepared_by`, `prepared_at`, `confirmed_by` and `confirmed_at` are all
// stamped server-side from `auth.uid()` and the server clock, and the
// complaint's status is moved by the same RPC inside one statement. There
// is no parameter here a crafted call could forge.

import { supabase } from '../supabase/supabaseClient'
import { SCREENING_ERRORS } from './screeningChecklist'

// The console shape the rest of this project uses, so a real failure is
// diagnosable while the user reads a sentence.
const logFailure = (where, error) => {
  console.error(`${where} error:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  })
}

// ⚠️ THE FUNCTION'S OWN SENTENCE NEVER REACHES THE SCREEN. Every refusal
// these RPCs raise is `P0001`, and two of them name the position gate
// ("Only the Barangay Secretary can...", "Only the Punong Barangay
// can..."). Printing one would put an authorization model in a toast on a
// screen somebody may be standing beside. The refusals an official can
// act on are mapped to their own words; everything else falls back to a
// neutral sentence. Matched on the message, because the code is `P0001`
// for all of them.
const screeningError = (error, fallbackKey) => {
  const message = String(error?.message || '')
  const err = new Error(fallbackKey)
  if (/Barangay Secretary/i.test(message)) err.kind = 'notPermittedPrepare'
  else if (/Punong Barangay/i.test(message)) err.kind = 'notPermittedConfirm'
  else if (/already been confirmed/i.test(message)) err.kind = 'alreadyConfirmed'
  else if (/official who prepared/i.test(message)) err.kind = 'selfConfirm'
  else err.kind = fallbackKey
  return err
}

// Every screening recorded for one complaint, newest first.
//
// ⚠️ ZERO ROWS IS "NOT YOURS TO SEE", NOT AN ERROR. The RPC's own
// predicate filters rather than raising, so an official who may not read
// screenings receives an empty array with no error at all — there is no
// `42501` in this path to surface, and code that reported one would be
// describing a working boundary as a fault.
export const loadScreenings = async (complaintId) => {
  const { data, error } = await supabase.rpc('complaint_screenings_for', {
    p_complaint_id: complaintId,
  })

  if (error) {
    logFailure('Load screenings', error)
    throw screeningError(error, 'loadFailed')
  }
  return Array.isArray(data) ? data : []
}

// Creates or revises the OPEN screening for a complaint, and returns its id.
//
// ⚠️ An open screening is a draft and is revised in place; a CONFIRMED one
// is never touched. The database holds that line with a partial unique
// index (one open row per complaint) and a trigger that refuses any update
// to a confirmed row — so a second call here cannot overwrite a recorded
// decision even if this module were wrong about which it was editing.
export const prepareScreening = async ({
  complaintId, checklistVersion, answers, recommendation, recommendationNote,
}) => {
  const { data, error } = await supabase.rpc('prepare_complaint_screening', {
    p_complaint_id: complaintId,
    p_checklist_version: checklistVersion,
    p_answers: answers,
    p_recommendation: recommendation || null,
    p_recommendation_note: String(recommendationNote ?? '').trim() || null,
  })

  if (error) {
    logFailure('Prepare screening', error)
    throw screeningError(error, 'prepareFailed')
  }
  return data
}

// Records the Punong Barangay's confirmed outcome.
//
// ⚠️ THE OUTCOME IS A PARAMETER A HUMAN CHOSE. Nothing in this module,
// and nothing in migration 042, derives it from the answers — a function
// that did would make the software the decider rather than the recorder.
export const confirmScreening = async ({ screeningId, outcome, note }) => {
  const { data, error } = await supabase.rpc('confirm_complaint_screening', {
    p_screening_id: screeningId,
    p_outcome: outcome,
    p_note: String(note ?? '').trim() || null,
  })

  if (error) {
    logFailure('Confirm screening', error)
    throw screeningError(error, 'confirmFailed')
  }
  return data
}

export const screeningMessage = (err, fallbackKey) => (
  SCREENING_ERRORS[err?.kind] || SCREENING_ERRORS[fallbackKey]
)
