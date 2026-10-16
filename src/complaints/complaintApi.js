// Every complaint read and write the resident experience performs.
//
// ─── ⚠️ ONE PLACE, BECAUSE THE ORDER IS FORCED AND SUBTLE ─────────────
//
// `file_complaint_as_resident()` returns TEXT -- the reference and
// nothing else. Evidence needs the complaint's UUID twice over: the
// storage path must be '<complaint_id>/<file>' for the bucket policy to
// resolve it, and `record_complaint_attachment()` takes the id as its
// first argument. So the order cannot be anything but:
//
//   1. file the complaint        -> reference
//   2. read the id back BY REFERENCE through the existing SELECT policy
//   3. upload each file, then record its metadata
//
// ⚠️ MEASURED BEFORE BUILDING ON IT, not assumed: as a real resident,
// step 2 returns the id and steps 3 succeed. There is no backend gap
// and this phase added no SQL.
//
// ⚠️ THE CONSEQUENCE IS THAT THE COMPLAINT EXISTS BEFORE ANY EVIDENCE
// DOES. A failed attachment therefore happens AFTER a successful
// filing, which is why `fileComplaintWithEvidence` returns the
// reference alongside a list of files that failed, rather than throwing
// -- a resident must never be told their complaint disappeared because
// a photo did not upload.
//
// ─── IT ADDS NO AUTHORIZATION AND CANNOT ──────────────────────────────
//
// Each call below is one of P3-A's approved surfaces. The three
// private tables carry no client privilege at all, so there is no
// second way to read a party, a transition or an attachment, and
// nothing here could be "improved" by querying one directly.

import { supabase } from '../supabase/supabaseClient'

// The console shape the rest of this project uses, so a real failure is
// diagnosable while the user sees a sentence.
const logFailure = (where, error) => {
  console.error(`${where} error:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  })
}

export const COMPLAINT_BUCKET = 'complaint-evidence'

// ⚠️ Short-lived, and re-minted on each view rather than cached. A
// signed URL is a bearer token for one object: holding one in state
// indefinitely means a link that outlives the session that was
// entitled to it. 60 seconds is enough to open a file and not enough to
// be worth passing on.
export const SIGNED_URL_SECONDS = 60

// ─── Filing ───────────────────────────────────────────────────────────

// Respondents are sent as the jsonb array the RPC validates. ⚠️ ONLY
// the snapshot fields it reads: a name, an optional contact and an
// optional address note. No `profile_id`, no `registry_entry_id`, and
// nothing resembling a lookup -- P3-A links a party only where a real
// link exists, and being named in a complaint must create nothing.
const respondentPayload = (respondents = []) => respondents
  .map((r) => ({
    full_name: String(r.fullName ?? '').trim(),
    contact_number: String(r.contactNumber ?? '').trim() || null,
    address_note: String(r.addressNote ?? '').trim() || null,
  }))
  .filter((r) => r.full_name !== '')

// Files the complaint and returns { reference, complaintId }.
// Throws a plain Error with a `kind` for the caller to map to words --
// ⚠️ never the Supabase error itself, so a policy name or an SQLSTATE
// cannot reach a screen through a thrown message.
export const fileComplaint = async ({
  category, narrative, locationNote, respondents,
}) => {
  const { data: reference, error } = await supabase.rpc('file_complaint_as_resident', {
    p_category: category,
    p_narrative: narrative,
    p_location_note: locationNote || null,
    p_respondents: respondentPayload(respondents),
  })

  if (error) {
    logFailure('File complaint', error)
    const err = new Error('file-failed')
    // The two refusals the RPC raises that mean something specific to
    // the person: not signed in, and not a resident account. Matched on
    // the sentence the function raises, not on a code, because P0001 is
    // every one of its refusals.
    const message = String(error.message || '')
    if (/signed in/i.test(message)) err.kind = 'notSignedIn'
    else if (/resident account/i.test(message)) err.kind = 'notResident'
    else err.kind = 'submitFailed'
    throw err
  }

  // ⚠️ Step 2. Read the id back by the reference just issued, through
  // the `complaints` SELECT policy -- which admits the filing resident
  // and nobody else's row. `.maybeSingle()` rather than `.single()`:
  // a missing row here is a surprising state, not an exception to
  // throw at a resident who has just filed successfully.
  const { data: row, error: idError } = await supabase
    .from('complaints')
    .select('id')
    .eq('reference', reference)
    .maybeSingle()

  if (idError) logFailure('Resolve complaint id', idError)

  return { reference, complaintId: row?.id ?? null }
}

// ─── Evidence ─────────────────────────────────────────────────────────

// ⚠️ The path is '<complaint_id>/<random>-<safe name>'. The folder is
// the complaint id because that is what `complaint_evidence_is_visible()`
// parses and what `record_complaint_attachment()` insists on; the random
// prefix stops two files of the same name colliding on the UNIQUE
// `object_path`, and the name is stripped to characters a storage key
// accepts.
const evidencePath = (complaintId, file) => {
  const safe = String(file.name || 'evidence')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(-80)
  const token = Math.random().toString(36).slice(2, 10)
  return `${complaintId}/${token}-${safe}`
}

// Uploads one file and records its metadata. Resolves to the path on
// success; throws on failure so the caller can collect which files
// failed without losing the ones that worked.
export const uploadEvidence = async (complaintId, file) => {
  const path = evidencePath(complaintId, file)

  const { error: upErr } = await supabase.storage
    .from(COMPLAINT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (upErr) {
    logFailure('Upload evidence', upErr)
    throw new Error('upload-failed')
  }

  const { error: recErr } = await supabase.rpc('record_complaint_attachment', {
    p_complaint_id: complaintId,
    p_object_path: path,
    p_display_filename: file.name || 'evidence',
    p_mime_type: file.type,
    p_byte_size: file.size,
  })

  if (recErr) {
    // ⚠️ The object is now in the bucket with no row describing it. It
    // is NOT removed here, and that is deliberate: the bucket has no
    // DELETE policy (migration 041), so `storage.remove()` would match
    // zero rows and report success -- the exact silent failure
    // migration 009 fixed for ID uploads. Reporting the file as failed
    // is honest; pretending to clean up would not be.
    logFailure('Record evidence', recErr)
    throw new Error('record-failed')
  }

  return path
}

// Files the complaint, then attaches what it can.
//
// ⚠️ Returns { reference, complaintId, failedFiles } and throws ONLY if
// the complaint itself could not be filed. Once a reference exists the
// submission has succeeded, and the screen must say so.
export const fileComplaintWithEvidence = async (input, files = []) => {
  const { reference, complaintId } = await fileComplaint(input)

  const failedFiles = []
  if (complaintId && files.length > 0) {
    for (const file of files) {
      try {
        // Sequential on purpose. Five parallel uploads from a phone on
        // barangay wifi is how one of them fails for a reason nobody
        // can reproduce.
        // eslint-disable-next-line no-await-in-loop
        await uploadEvidence(complaintId, file)
      } catch {
        failedFiles.push(file.name || 'attachment')
      }
    }
  } else if (!complaintId && files.length > 0) {
    // The complaint filed but its id could not be resolved, so no
    // evidence can be attached to it. Reported rather than silently
    // dropped.
    files.forEach((f) => failedFiles.push(f.name || 'attachment'))
  }

  return { reference, complaintId, failedFiles }
}

// ─── Reading ──────────────────────────────────────────────────────────

// The resident's own complaints. ⚠️ The SELECT policy already restricts
// this to rows the caller filed, so there is no `.eq('filed_by...')`
// here -- adding one would imply the filter is what protects the data.
// The column list is narrowed to what the list and the detail panel
// render: `encoded_by` and `filed_by_profile_id` are deliberately not
// requested, because nothing on a resident's own screen needs another
// account's identifier.
export const listMyComplaints = async () => {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, reference, category, status, narrative, location_note, intake_channel, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    logFailure('Load complaints', error)
    throw new Error('load-failed')
  }
  return data || []
}

// Parties, history and attachment metadata for one complaint, each
// through its own approved RPC.
//
// ⚠️ `complaint_parties_for()` returns `contact_number_snapshot` as
// NULL for any party that is not the caller, and that NULL is rendered
// as-is. Nothing here reconstructs it from another source, and there is
// no other source: `complaint_parties` carries no client privilege.
export const loadComplaintDetail = async (complaintId) => {
  const [parties, history, attachments] = await Promise.all([
    supabase.rpc('complaint_parties_for', { p_complaint_id: complaintId }),
    supabase.rpc('complaint_history_for', { p_complaint_id: complaintId }),
    supabase.rpc('complaint_attachments_for', { p_complaint_id: complaintId }),
  ])

  ;[parties, history, attachments].forEach((r) => {
    if (r.error) logFailure('Load complaint detail', r.error)
  })

  return {
    parties: parties.data || [],
    history: history.data || [],
    attachments: attachments.data || [],
  }
}

// ⚠️ A SIGNED URL, NEVER `getPublicUrl()`. The bucket is private, so
// `getPublicUrl()` 404s on it even with a permissive policy -- and
// reaching for it is how a private bucket quietly becomes a public one.
// The signature is minted per view and is not stored.
export const signedEvidenceUrl = async (objectPath) => {
  const { data, error } = await supabase.storage
    .from(COMPLAINT_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_SECONDS)

  if (error) {
    logFailure('Sign evidence URL', error)
    throw new Error('sign-failed')
  }
  return data?.signedUrl || null
}

// ─── Public tracking ──────────────────────────────────────────────────
//
// ⚠️ THE ONLY CALL THIS PAGE MAKES, AND NO SECOND QUERY FOLLOWS IT.
// `track_complaint()` is the whole lookup: two factors, four columns,
// LIMIT 1, and the same empty answer for a wrong reference and a wrong
// contact. Fetching anything else once it succeeds -- a category, a
// name, an attachment count -- would defeat a narrowness the database
// went to trouble to guarantee, because `complaints` has no anonymous
// SELECT policy and would refuse it anyway.
export const trackComplaint = async (reference, contact) => {
  const { data, error } = await supabase.rpc('track_complaint', {
    p_reference: reference,
    p_contact: contact,
  })

  if (error) {
    logFailure('Track complaint', error)
    throw new Error('track-failed')
  }
  // The function returns a table, so supabase-js hands back an array of
  // at most one row.
  return Array.isArray(data) ? (data[0] || null) : (data || null)
}
