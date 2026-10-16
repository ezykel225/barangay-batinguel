// The words a resident reads about a complaint, and the client-side
// mirror of P3-A's evidence contract.
//
// ─── ⚠️ NOTHING HERE IS A SECURITY CONTROL ────────────────────────────
//
// Every rule that decides what may be filed, read or tracked lives in
// migrations 040 and 041: `file_complaint_as_resident()` takes the
// resident's identity from `auth.uid()` and no identity parameter;
// `complaint_is_visible_to_caller()` is the one full-detail predicate;
// `track_complaint()` is two-factor with a fixed four-column result and
// the SAME empty answer for a wrong reference and a wrong contact; the
// `complaint-evidence` bucket is private with its own MIME and size
// limits. This file is politeness: it keeps an obviously bad submission
// off the network and turns a stored value into a sentence.
//
// ─── IT IS PURE, DELIBERATELY ─────────────────────────────────────────
//
// No Supabase import, for the reason the rest of `utils/` has none:
// `supabaseClient.js` throws at import time without the env vars, so a
// rule worth testing belongs in a module that can be tested without
// them.

import { MONTH_NAMES, parseDateKey } from '../utils/monthGrid'

// ─── Categories ───────────────────────────────────────────────────────
//
// ⚠️ NO RAW DATABASE VALUE REACHES A USER. The stored values are the
// eight in migration 040's CHECK; these are the words beside them. The
// same rule `displayLabels.js` enforces for document and reservation
// statuses, and the reason the Activity Log stopped printing
// `ready_for_pickup` on screen.
//
// Order is the order the form offers them: the two most commonly
// reported first is a guess nobody has data for, so this is simply the
// migration's own order, with `other` last where a catch-all belongs.
export const COMPLAINT_CATEGORIES = [
  { value: 'noise', label: 'Noise Complaint' },
  { value: 'unpaid_debt', label: 'Debt / Unpaid Obligation' },
  { value: 'boundary_dispute', label: 'Boundary Dispute' },
  { value: 'physical_altercation', label: 'Physical Altercation' },
  { value: 'theft', label: 'Theft' },
  { value: 'threats', label: 'Threats' },
  { value: 'family_dispute', label: 'Family Dispute' },
  { value: 'other', label: 'Other' },
]

export const COMPLAINT_CATEGORY_VALUES = COMPLAINT_CATEGORIES.map((c) => c.value)

const CATEGORY_LABELS = COMPLAINT_CATEGORIES.reduce(
  (map, c) => ({ ...map, [c.value]: c.label }), {}
)

// An unrecognised value is returned EXACTLY AS STORED -- not blank, not
// guessed. The same decision `documentStatusLabel()` makes: a value
// nobody anticipated must stay visible rather than disappear, because
// the alternative is a screen that silently loses a complaint. A
// `hasOwnProperty` guard rather than a bare lookup, so a stored value
// of `constructor` does not resolve to a function -- the trap
// `officialPhotos.test.js` already pins.
export const complaintCategoryLabel = (stored) => (
  Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, stored)
    ? CATEGORY_LABELS[stored]
    : (stored ?? '')
)

// ─── Statuses ─────────────────────────────────────────────────────────
//
// ⚠️ ONE VALUE, BECAUSE THE DATABASE HAS ONE VALUE. Migration 040's
// CHECK permits `received` and nothing else; P3-A built no transition,
// so nothing can move a complaint yet. Screening, referral and KP case
// stages are P4 and will widen the CHECK and this map together.
//
// ⚠️ NO FUTURE STATUS IS LISTED HERE. A vocabulary written ahead of its
// consumers is the `displayLabels.js` mistake -- it sat in the repo
// holding a second set of words for statuses the app was already
// rendering, and neither shipped.
export const COMPLAINT_STATUS_LABELS = {
  received: { label: 'Received', className: 'badge-pending' },
}

export const complaintStatusLabel = (stored) => (
  Object.prototype.hasOwnProperty.call(COMPLAINT_STATUS_LABELS, stored)
    ? COMPLAINT_STATUS_LABELS[stored].label
    : (stored ?? '')
)

// What a status means to the person who filed, in their own terms.
//
// ⚠️ IT PROMISES NOTHING. No mediation, no hearing, no settlement, no
// response time, and no statement about whether the matter is within
// Katarungang Pambarangay jurisdiction -- that is a human judgment P4
// records and this phase has not built. "Received for barangay review"
// is the whole of what is true today.
const STATUS_EXPLANATIONS = {
  received: 'Your complaint has been received for barangay review.'
    + ' Barangay officials will look at it in the order complaints arrive.',
}

export const describeComplaintStatus = (stored) => {
  const known = COMPLAINT_STATUS_LABELS[stored]
  return {
    label: known ? known.label : (stored ?? ''),
    className: known ? known.className : 'badge-pending',
    isKnown: Boolean(known),
    explanation: STATUS_EXPLANATIONS[stored] ?? '',
  }
}

// ─── Intake channel ───────────────────────────────────────────────────
//
// `complaints.intake_channel` is a closed two-value CHECK in migration
// 040, and `complaint_queue()` returns it raw -- so these are the words
// beside it, by the same rule as the categories above.
//
// ⚠️ IT IS NOT A STATUS AND NOT A PERMISSION. It records HOW a
// complaint arrived, which is the one thing the queue can say about a
// complaint without saying anything about its subject: `online` carries
// `filed_by_profile_id` and no `encoded_by`, `walk_in` the reverse
// (`complaints_channel_matches_source`). An official reading the queue
// needs it because a walk-in complainant has no account and no portal,
// so following one up means the counter rather than a notification.
export const INTAKE_CHANNELS = [
  { value: 'online', label: 'Online' },
  { value: 'walk_in', label: 'Walk-in' },
]

const INTAKE_CHANNEL_LABELS = INTAKE_CHANNELS.reduce(
  (map, c) => ({ ...map, [c.value]: c.label }), {}
)

// Unrecognised values come back exactly as stored, for the reason
// `complaintCategoryLabel` does, and with the same `hasOwnProperty`
// guard so a stored `constructor` does not resolve to a function.
export const intakeChannelLabel = (stored) => (
  Object.prototype.hasOwnProperty.call(INTAKE_CHANNEL_LABELS, stored)
    ? INTAKE_CHANNEL_LABELS[stored]
    : (stored ?? '')
)

// ─── Evidence ─────────────────────────────────────────────────────────
//
// ⚠️ THIS MIRRORS THE BACKEND AND DOES NOT DECIDE IT. The authoritative
// list is `storage.buckets.allowed_mime_types` on `complaint-evidence`
// plus `complaint_attachments_mime_check`, and the ceiling is the
// bucket's own `file_size_limit` plus
// `complaint_attachments_byte_size_check`. Both refuse a bad file
// whatever this file says; these constants exist so a resident is told
// before a 12 MB upload fails.
//
// ⚠️ NO VIDEO. P3-A does not accept it, and the reasons are recorded in
// migration 041: 5 MB is this project's ceiling and a few seconds of
// phone video exceeds it, `video/quicktime` does not play in a browser
// `<video>` on every platform (the exact reason HEIC was excluded from
// the image buckets), and evidence that cannot be viewed during review
// is not evidence. Offering a video option the backend refuses would be
// worse than saying so.
export const EVIDENCE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
]

// ⚠️ NEVER `*/*`. The picker is constrained to the four the bucket
// accepts. A file picker is not a control -- a determined caller posts
// whatever they like and the bucket refuses it -- but an unconstrained
// picker invites a failure the resident cannot explain.
export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf'

export const EVIDENCE_MAX_BYTES = 5242880
export const EVIDENCE_MAX_LABEL = '5 MB'
export const EVIDENCE_TYPES_LABEL = 'JPG, PNG, WebP or PDF'

// ⚠️ A cap on how many files one submission may carry. Not a backend
// rule -- the database has no such limit -- so it is stated as this
// form's own limit rather than presented as the barangay's.
export const EVIDENCE_MAX_FILES = 5

export const formatBytes = (bytes) => {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// What is wrong with one chosen file, in the person's own words, or
// null. Checked against the SAME two facts the database checks, so the
// message a resident reads is the reason the upload would have failed.
export const evidenceProblem = (file) => {
  if (!file) return null
  if (!EVIDENCE_MIME_TYPES.includes(file.type)) {
    return `${file.name || 'That file'} is not a supported type.`
      + ` Please attach ${EVIDENCE_TYPES_LABEL}. Video is not supported yet.`
  }
  if (Number(file.size) > EVIDENCE_MAX_BYTES) {
    return `${file.name || 'That file'} is ${formatBytes(file.size)},`
      + ` which is over the ${EVIDENCE_MAX_LABEL} limit for one file.`
  }
  if (Number(file.size) <= 0) {
    return `${file.name || 'That file'} appears to be empty.`
  }
  return null
}

export const mediaKindFor = (mimeType) => {
  if (typeof mimeType !== 'string') return ''
  if (mimeType.startsWith('image/')) return 'Photo'
  if (mimeType === 'application/pdf') return 'Document'
  return ''
}

// ─── Dates ────────────────────────────────────────────────────────────
//
// `track_complaint()` returns `date`, and the detail reads return
// `timestamptz`. Both are rendered from the CHARACTERS of the date.
//
// ⚠️ NO `Date` IS CONSTRUCTED FROM A DATE STRING. `new Date('2026-10-16')`
// parses as UTC midnight and reads back in the browser's zone, so west
// of UTC it describes the previous day -- the defect `event_month` /
// `event_day` carried, verified to render "Sep 30" in New York and
// "Oct 1" in Manila for one instant. `parseDateKey` splits the
// characters instead, and the month name comes from this project's own
// array rather than from a locale, whose day/month ORDER differs
// between machines (the X6 finding).
export const complaintDate = (value) => {
  const key = typeof value === 'string' ? value.slice(0, 10) : ''
  const parsed = parseDateKey(key)
  if (!parsed) return ''
  return `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}`
}

// ─── Tracking ─────────────────────────────────────────────────────────
//
// ⚠️ ONE MESSAGE FOR EVERY MISS, AND IT IS THE WHOLE POINT. A wrong
// reference and a wrong contact number must be indistinguishable:
// anything that says "that reference does not exist" confirms which
// guesses are live, which turns the tracking page into a way to
// enumerate other people's complaints. `track_complaint()` cannot tell
// them apart either -- both conditions are ANDed in one WHERE with no
// branch -- so this message is the UI half of a property the database
// already holds.
//
// ⚠️ It must never say: not found, no such, does not exist, invalid
// reference, wrong number, or that a reference exists.
// `complaintLabels.test.js` asserts all of those are absent.
export const TRACKING_MISS_TITLE = 'We could not retrieve a complaint'

export const TRACKING_MISS_MESSAGE = 'Please check the reference number and the'
  + ' contact number against what you were given — they have to be the pair'
  + ' from the same complaint. If they still do not match, visit the Barangay'
  + ' Hall during office hours and an official can look it up for you.'

// A failure to REACH the database is a different fact from an empty
// result and is said differently. Telling somebody "no complaint
// matched" when the request never arrived tells them their complaint
// does not exist, which is the one wrong thing this page can say.
export const TRACKING_UNREACHABLE = 'We could not reach the barangay system'
  + ' just now. Please try again in a moment.'

// ─── Neutral failure messages ─────────────────────────────────────────
//
// ⚠️ NO RAW SUPABASE ERROR, SQLSTATE, POLICY NAME, RPC NAME OR STORAGE
// PATH REACHES A USER. The underlying error is logged to the console
// with the project's existing shape (message / details / hint / code),
// and the person gets a sentence they can act on.
export const COMPLAINT_ERRORS = {
  submitFailed: 'We could not submit your complaint just now.'
    + ' Please try again in a moment.',
  notSignedIn: 'Please sign in with your resident account to file a complaint.',
  notResident: 'Only a resident account can file a complaint online.'
    + ' If you are staff, a complaint is encoded at the Barangay Hall.',
  loadFailed: 'We could not load your complaints just now.'
    + ' Please try again in a moment.',
  // ⚠️ The complaint ALREADY EXISTS when this fires. Evidence can only
  // be uploaded after the complaint row is created -- the storage path
  // is '<complaint_id>/<file>' and the policy resolves the complaint --
  // so a failed attachment must never read as a lost complaint.
  evidencePartial: 'Your complaint was submitted, but some attachments could'
    + ' not be uploaded. Your reference number below is valid. You can bring'
    + ' the files to the Barangay Hall.',
  evidenceUrlFailed: 'That attachment could not be opened just now.'
    + ' Please try again.',

  // ─── What an OFFICIAL reads (P3-B2) ─────────────────────────────────
  //
  // ⚠️ Separate strings, because the resident ones are addressed to the
  // person who filed ("your complaint") and would be wrong read by the
  // Secretary at a counter encoding somebody else's.
  queueLoadFailed: 'The complaint queue could not be loaded just now.'
    + ' Please try again in a moment.',
  detailLoadFailed: 'That complaint could not be opened just now.'
    + ' Please try again in a moment.',
  encodeFailed: 'This complaint could not be recorded just now.'
    + ' Please try again in a moment.',
  // ⚠️ Says what to do, and names no position as the gate that refused.
  // The trigger's own sentence does name one, which is exactly why it
  // is mapped away rather than printed.
  encodeNotPermitted: 'This account cannot record a walk-in complaint.'
    + ' Walk-in intake is handled by barangay records staff.',
  encodeNeedsName: "Please record the complainant's name.",
  encodeRespondentNoName: 'One of the people complained about was left'
    + ' without a name. Add a name or remove that entry.',
  // ⚠️ The complaint ALREADY EXISTS, as on the resident side. The
  // Secretary must still be able to give the complainant the reference.
  encodeEvidencePartial: 'The complaint was recorded, but some attachments'
    + ' could not be uploaded. The reference number below is valid.',
}
