// The one mapping from a stored `document_requests.document_type` to
// the template that prints it.
//
// ⚠️ ONE REGISTRY, NOT `if (type === ...)` SCATTERED THROUGH THE
// DASHBOARD. Adding the barangay's fifth form later is one entry here
// plus one template file; the dashboard, the permissions and the print
// pipeline do not change.
//
// ⚠️ `document_type` IS FREE TEXT IN THE DATABASE -- no CHECK
// constraint -- so an unrecognised value is not a hypothetical. It is
// reported as unsupported and nothing crashes.

import { BarangayClearanceTemplate } from './templates/BarangayClearanceTemplate'
import { BarangayCertificateTemplate } from './templates/BarangayCertificateTemplate'
import { CertificateOfIndigencyTemplate } from './templates/CertificateOfIndigencyTemplate'
import { CertificateOfResidencyTemplate } from './templates/CertificateOfResidencyTemplate'

// ⚠️ The keys are the EXACT strings the Resident Portal's
// `DOCUMENT_TYPES` dropdown writes, which are the exact strings the
// live table holds. They are not re-spelled, re-cased or tidied: a key
// that merely looks right matches nothing, which is the same failure
// the officials' photo map had when it said `Alexis Tan`.
//
// `requiredFields` are the values that template refuses to print
// without. Everything else is omitted when absent rather than filled
// in -- see `buildDocumentData`.
export const DOCUMENT_TEMPLATES = Object.freeze({
  'Barangay Clearance': {
    Template: BarangayClearanceTemplate,
    displayName: 'Barangay Clearance',
    prototype: true,
    requiredFields: ['fullName', 'purpose'],
  },
  'Barangay Certificate': {
    Template: BarangayCertificateTemplate,
    displayName: 'Barangay Certificate',
    prototype: true,
    requiredFields: ['fullName', 'purpose'],
  },
  'Certificate of Indigency': {
    Template: CertificateOfIndigencyTemplate,
    displayName: 'Certificate of Indigency',
    prototype: true,
    requiredFields: ['fullName', 'purpose'],
  },
  // ⚠️ The only type that requires a purok. A residency certificate
  // with no address on it is the one case where an absent optional
  // field makes the document meaningless rather than merely shorter.
  'Certificate of Residency': {
    Template: CertificateOfResidencyTemplate,
    displayName: 'Certificate of Residency',
    prototype: true,
    requiredFields: ['fullName', 'purpose', 'purok'],
  },
})

// ⚠️ `hasOwnProperty`, not a bare lookup. A request whose
// `document_type` is the string "constructor" or "toString" would
// otherwise resolve to a function off Object.prototype and be rendered
// as a template. Same defect `officialPhotos.hasBundledPhoto` avoids.
export const hasTemplate = (documentType) =>
  Object.prototype.hasOwnProperty.call(DOCUMENT_TEMPLATES, String(documentType ?? ''))

export const templateFor = (documentType) =>
  (hasTemplate(documentType) ? DOCUMENT_TEMPLATES[documentType] : null)

export const SUPPORTED_DOCUMENT_TYPES = Object.freeze(Object.keys(DOCUMENT_TEMPLATES))

// ⚠️ The two types the resident form offers that are NOT configured,
// and why, so this is a decision on the record rather than an
// oversight. Both fall through to the message below.
//
//   Business Clearance -- needs a business name, address and nature of
//     business. `document_requests` stores none of them; the only
//     fields it has are the resident's own.
//   Other -- has no layout by definition. The resident types what they
//     need into `purpose`, and which form answers it is a decision the
//     Secretary makes, not one a registry can.
export const UNSUPPORTED_MESSAGE =
  'Printable template not configured for this document type.'

// ─── Status gating ────────────────────────────────────────────────────
//
// ⚠️ THE REAL WORKFLOW, read from the live CHECK constraint:
//   pending --Approve--> approved --Mark Ready--> ready_for_pickup
//           --Mark Claimed--> claimed, and pending --Decline--> declined.
// There is no "released" state; `claimed` is terminal.
//
// Generation opens once the Secretary has APPROVED, and stays open
// while the request is ready for pickup -- the window in which a sheet
// actually has to come out of a printer.
//
// ⚠️ IT IS CLOSED ON `claimed`. The resident has already collected the
// document; a print button on a closed request invites a second copy
// of something the record says was handed over once.
export const GENERATABLE_STATUSES = Object.freeze(['approved', 'ready_for_pickup'])

export const canGenerateForStatus = (status) =>
  GENERATABLE_STATUSES.includes(String(status ?? ''))

// ⚠️ GENERATING AND PRINTING CHANGE NO STATUS, and that is the whole
// point of keeping this a predicate rather than a handler. A sheet
// coming out of a printer is not the same fact as "the resident may
// collect this" (Mark Ready) or "the resident has it" (Mark Claimed),
// and both of those stay the deliberate actions they already were.
export const canGenerate = ({ status, documentType, isSecretary }) =>
  Boolean(isSecretary) && canGenerateForStatus(status) && hasTemplate(documentType)
