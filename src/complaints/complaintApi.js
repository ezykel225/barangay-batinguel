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

// Attaches what it can to a complaint that already exists, and reports
// which files did not make it.
//
// ⚠️ ONE COPY, SHARED BY BOTH INTAKE PATHS. The resident form and the
// Secretary's walk-in form both reach this, because the forced order
// above is a property of the RPCs rather than of either screen: both
// creation functions return the reference alone, so both must resolve
// the id and then attach. A second copy of this loop is how two intake
// paths come to disagree about what a failed upload means -- the same
// objection this project makes to a second status vocabulary.
const attachEvidence = async (complaintId, files = []) => {
  const failedFiles = []

  if (!complaintId) {
    // The complaint filed but its id could not be resolved, so no
    // evidence can be attached to it. Reported rather than silently
    // dropped.
    files.forEach((f) => failedFiles.push(f.name || 'attachment'))
    return failedFiles
  }

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

  return failedFiles
}

// Files the complaint, then attaches what it can.
//
// ⚠️ Returns { reference, complaintId, failedFiles } and throws ONLY if
// the complaint itself could not be filed. Once a reference exists the
// submission has succeeded, and the screen must say so.
export const fileComplaintWithEvidence = async (input, files = []) => {
  const { reference, complaintId } = await fileComplaint(input)
  const failedFiles = await attachEvidence(complaintId, files)
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

// ─── The Official Portal (P3-B2) ──────────────────────────────────────

// The queue every active official sees.
//
// ⚠️ `complaint_queue()` AND NOTHING ELSE. It is SECURITY DEFINER,
// gated on `is_official(auth.uid()) AND official_is_active(...)`, and
// it returns six columns: id, reference, intake_channel, status,
// created_at, updated_at.
//
// ⚠️ IT IS NOT REPLACED BY `from('complaints').select('*')` FOR
// CONVENIENCE, and the measurement is why rather than the rule. Against
// the live database a Treasurer and a Peace-and-Order Kagawad each get
// ZERO rows from that table -- its only SELECT policy is
// `complaint_is_visible_to_caller(id)`, true for the filer, the
// Barangay Secretary and the Punong Barangay. So a table read would
// hand most of the barangay's officials an empty queue, and widening
// the policy to fix that would publish every narrative to all eleven.
//
// ⚠️ A resident and the nurse may EXECUTE this and get zero rows, which
// is the fail-closed answer rather than a refusal. Code that treated
// "no rows" as an error would report a working boundary as a fault.
export const listComplaintQueue = async () => {
  const { data, error } = await supabase.rpc('complaint_queue')

  if (error) {
    logFailure('Load complaint queue', error)
    throw new Error('load-failed')
  }
  return Array.isArray(data) ? data : []
}

// The full row for one complaint: the narrative, the category and the
// location note the queue withholds.
//
// ⚠️ THE EMPTY ANSWER IS "RESTRICTED", NOT "FAILED", AND THE DIFFERENCE
// IS THE WHOLE FUNCTION. RLS filters rows and does not raise, so an
// ordinary official reaches this and receives `null` with NO error --
// there is no `42501` and no `P0001` in this path to surface, and code
// that invented one would be reporting a policy working correctly as a
// malfunction. `maybeSingle()` is what makes zero rows a value rather
// than an exception.
//
// So this returns { row, restricted } and the caller renders
// `RESTRICTED_DETAIL_MESSAGE` for the restricted case, while the queue
// above stays on screen.
export const loadOfficialComplaintRow = async (complaintId) => {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, reference, category, status, narrative, location_note, intake_channel, created_at, updated_at')
    .eq('id', complaintId)
    .maybeSingle()

  if (error) {
    logFailure('Load complaint row', error)
    throw new Error('load-failed')
  }

  return { row: data || null, restricted: !data }
}

// ─── Walk-in intake, the Barangay Secretary's own ─────────────────────

// Encodes a complaint brought to the barangay hall in person.
//
// ⚠️ SECRETARY-ONLY, AND THE DATABASE IS WHAT ENFORCES IT.
// `encode_walk_in_complaint()` raises `P0001` unless
// `current_official_holds_position('Barangay Secretary')`. Measured:
// the PUNONG BARANGAY is refused by it, even though he reads every
// complaint -- so this phase renders him no intake control, because the
// backend would refuse one. The frontend's position flag decides which
// controls to paint and decides nothing about what is permitted.
//
// ⚠️ IT TAKES NO IDENTITY, STATUS, REFERENCE OR TIMESTAMP. `encoded_by`
// comes from `auth.uid()`, `status` is the literal `received`, the
// reference is server-stamped by a trigger, and `filed_by_profile_id`
// is NULL because a walk-in complainant has no account. There is
// nothing here for a crafted call to forge.
export const encodeWalkInComplaint = async ({
  complainantName, complainantContact, category, narrative, locationNote, respondents,
}) => {
  const { data: reference, error } = await supabase.rpc('encode_walk_in_complaint', {
    p_complainant_name: String(complainantName ?? '').trim(),
    p_complainant_contact: String(complainantContact ?? '').trim() || null,
    p_category: category,
    p_narrative: String(narrative ?? '').trim(),
    p_location_note: String(locationNote ?? '').trim() || null,
    p_respondents: respondentPayload(respondents),
  })

  if (error) {
    logFailure('Encode walk-in complaint', error)
    const err = new Error('encode-failed')
    // ⚠️ THE TRIGGER'S OWN SENTENCE NEVER REACHES THE SCREEN. Every
    // refusal this RPC raises is `P0001`, and one of them names the
    // position gate ("Only the Barangay Secretary can encode a walk-in
    // complaint."). Printing it would put an authorization model in a
    // toast at the counter; the two the Secretary can act on are mapped
    // to their own words and everything else falls back to a neutral
    // sentence. Matched on the message, not on a code, because the code
    // is `P0001` for all of them.
    const message = String(error.message || '')
    if (/Barangay Secretary/i.test(message)) err.kind = 'encodeNotPermitted'
    else if (/complainant/i.test(message)) err.kind = 'encodeNeedsName'
    else if (/respondent/i.test(message)) err.kind = 'encodeRespondentNoName'
    else err.kind = 'encodeFailed'
    throw err
  }

  // Same id read-back as the resident path, and for the same reason:
  // the RPC returns the reference alone, and evidence needs the uuid.
  const { data: row, error: idErr } = await supabase
    .from('complaints')
    .select('id')
    .eq('reference', reference)
    .maybeSingle()

  if (idErr) logFailure('Resolve encoded complaint id', idErr)

  return { reference, complaintId: row?.id ?? null }
}

// Encodes the walk-in, then attaches whatever the complainant brought.
//
// ⚠️ Throws ONLY if the complaint itself could not be encoded, exactly
// as the resident path does. A reference means the complaint exists and
// the Secretary has something to write on the complainant's slip; a
// failed photo must never read as a lost intake.
export const encodeWalkInWithEvidence = async (input, files = []) => {
  const { reference, complaintId } = await encodeWalkInComplaint(input)
  const failedFiles = await attachEvidence(complaintId, files)
  return { reference, complaintId, failedFiles }
}
