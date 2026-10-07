// Turning one approved document request into the values a template
// prints. Pure -- no Supabase import, no fetching, no component.
//
// ─── ⚠️ WHY THIS LAYER EXISTS AT ALL ──────────────────────────────────
//
// A template must never query the database. When the barangay supplies
// its real forms, replacing a prototype has to be: open the template,
// reproduce the verified layout, bind these same field names, drop the
// watermark. If templates read Supabase, that becomes a rewrite of the
// data access too.
//
// So this module is the contract between the two halves. The shape it
// returns is what every template may use, and the only thing that
// changes when a column is added is this file.
//
// ─── ⚠️ WHERE THE PRINTED VALUES COME FROM, AND WHY ───────────────────
//
// `document_requests` itself, and nothing else.
//
// The row carries `full_name`, `contact_number` and `purok` as the
// resident submitted them -- the Resident Portal copies them from the
// profile at submission time. That snapshot is the right source for a
// printed document for two reasons: it is what the Secretary approved,
// and it is what `document_requests`' own SELECT policy already lets
// an official read. Re-reading `profiles` at print time would print
// something nobody reviewed.
//
// ⚠️ `residents_registry` IS NOT USED AND MUST NOT BE. It is the Voter
// Reference List -- voter records, not a resident roll. Anyone too
// young to vote, registered elsewhere, or not yet supplied by the city
// is absent from it while being a resident. Reading residency off it
// would be the exact wrong inference CLAUDE.md exists to prevent, on
// the one surface where it would be printed and handed over.
//
// ⚠️ NO FIELD IS INVENTED. The schema holds no birth date, no civil
// status, no street address, no income and no residency duration, so
// no template asks for one. A certificate that usually carries a
// birthday does not get a blank line here; it gets nothing, because
// the barangay's real form will decide what it needs.

import { SIGNATORY_PLACEHOLDER, UNRECORDED_PLACEHOLDERS } from './documentConfig'
import { MONTH_NAMES } from '../utils/monthGrid'

// ⚠️ MANILA, NEVER THE BROWSER'S CLOCK. The printed date is a claim
// about when the barangay issued something; a laptop set to another
// zone must not change it. Same rule as `manilaToday()` for events and
// reservations, in the long form a document reads in.
// ⚠️ ASSEMBLED FROM PARTS, NOT FROM A LOCALE'S ORDERING. The first
// version called `Intl.DateTimeFormat('en-PH', ...).format()` and this
// container's ICU produced "October 2, 2026" where the test expected
// "2 October 2026" -- the day/month ORDER is locale data, and locale
// data differs between a developer's machine, the CI box and a
// phone. A date on a government document must not reorder itself
// depending on where the browser thinks it is.
//
// So the ZONE comes from Intl, which is what only Intl can give, and
// the ARRANGEMENT is this project's own: `MONTH_NAMES` from
// `monthGrid.js`, the same array the calendars read.
export const manilaLongDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date)

  const read = (type) => Number(parts.find((p) => p.type === type)?.value)
  const day = read('day')
  const month = read('month')
  const year = read('year')
  if ([day, month, year].some(Number.isNaN)) return ''

  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}

// ─── ⚠️ THE REFERENCE IS MARKED SAMPLE, ON PURPOSE ────────────────────
//
// `document_requests` has no public reference number -- only its uuid
// primary key. (Court reservations got `BCR-2026-AB12CD` in migration
// 024; document requests got no equivalent, and inventing an official
// numbering convention is exactly what a prototype must not do.)
//
// So the printed reference is the first eight characters of the row's
// own id behind a `SAMPLE-` prefix: it traces back to one exact
// request, it is short enough to read off paper, and it cannot be
// mistaken for a barangay document number. The real template decides
// the real scheme, and only this function changes.
export const sampleReference = (requestId) => {
  const id = String(requestId ?? '').trim()
  if (!id) return ''
  return `SAMPLE-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

const text = (value) => String(value ?? '').trim()

// Everything a template may print, and nothing else.
//
// `missing` lists the fields a template declared REQUIRED that the
// request does not carry. The preview renders that warning OUTSIDE the
// document and refuses to print -- see the note on placeholders below.
export const buildDocumentData = (request, {
  documentType = null,
  requiredFields = [],
  now = new Date(),
  signatory = SIGNATORY_PLACEHOLDER,
} = {}) => {
  const row = request || {}

  const resident = {
    fullName: text(row.full_name),
    purok: text(row.purok),
    contactNumber: text(row.contact_number),
  }

  const data = {
    documentType: text(documentType || row.document_type),
    reference: sampleReference(row.id),
    // ⚠️ THE GENERATION DATE, and this is recorded rather than assumed.
    // The request stores `created_at` and `updated_at` but no approval
    // timestamp of its own, so "the date this was approved" is not a
    // value the schema can give. The prototype therefore prints the day
    // it was generated, which is at least true of the sheet in the
    // Secretary's hand. When the real form arrives and the barangay
    // says which date belongs on it, this is the line that changes.
    issueDate: manilaLongDate(now),
    issueDateBasis: 'generated',
    resident,
    purpose: text(row.purpose),
    additionalNotes: text(row.additional_notes),
    status: text(row.status),
    signatory: {
      name: text(signatory?.name),
      position: text(signatory?.position),
    },
    // ⚠️ THE PLACEHOLDERS COME THROUGH THE ADAPTER, NOT THROUGH AN
    // IMPORT IN THE TEMPLATE, and that is the whole architecture
    // working rather than a detour.
    //
    // A template binds `data.unrecorded.businessName` exactly as it
    // binds `data.resident.fullName`. So on the day the barangay adds a
    // `business_name` column, THIS FILE is the one that changes -- the
    // line stops reading `UNRECORDED_PLACEHOLDERS.businessName` and
    // starts reading `text(row.business_name)` -- and the template,
    // the registry, the preview and the print pipeline are untouched.
    // A template that imported the placeholder directly would have to
    // be rewritten to un-invent it.
    unrecorded: { ...UNRECORDED_PLACEHOLDERS },
  }

  // ⚠️ A MISSING VALUE IS REPORTED, NEVER FILLED IN. "N/A", "UNKNOWN"
  // and an em dash all read as statements on a document somebody hands
  // to an office. The preview says what is missing and does not print.
  data.missing = requiredFields.filter((field) => !fieldValue(data, field))

  return data
}

// The fields a template may declare required, and how to read each one.
export const REQUIRED_FIELD_LABELS = Object.freeze({
  fullName: "the resident's full name",
  purok: "the resident's purok",
  purpose: 'the purpose of the request',
  contactNumber: 'a contact number',
})

export const fieldValue = (data, field) => {
  switch (field) {
    case 'fullName': return data?.resident?.fullName || ''
    case 'purok': return data?.resident?.purok || ''
    case 'contactNumber': return data?.resident?.contactNumber || ''
    case 'purpose': return data?.purpose || ''
    default: return ''
  }
}

// One readable sentence per missing field, for the warning the preview
// shows beside the document rather than inside it.
export const missingFieldMessages = (data) =>
  (data?.missing || []).map(
    (field) => `Cannot generate this document: ${REQUIRED_FIELD_LABELS[field] || field} is missing from the request.`,
  )
