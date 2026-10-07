// The one mapping from a stored `document_requests.document_type` to
// the template that prints it.
//
// ⚠️ ONE REGISTRY, NOT `if (type === ...)` SCATTERED THROUGH THE
// DASHBOARD. Adding a form is one entry here plus one template file;
// the dashboard, the permissions and the print pipeline do not change.
// Demonstrated rather than claimed: `Business Clearance` and `Other`
// were added exactly that way, and neither `canGenerate`, the ⋮ menu,
// `rowActions`, the preview nor the print stylesheet was touched.
//
// ⚠️ `document_type` IS FREE TEXT IN THE DATABASE -- no CHECK
// constraint -- so an unrecognised value is not a hypothetical. It is
// reported as unsupported and nothing crashes.

import { BarangayClearanceTemplate } from './templates/BarangayClearanceTemplate'
import { BarangayCertificateTemplate } from './templates/BarangayCertificateTemplate'
import { CertificateOfIndigencyTemplate } from './templates/CertificateOfIndigencyTemplate'
import { CertificateOfResidencyTemplate } from './templates/CertificateOfResidencyTemplate'
import { BusinessClearanceTemplate } from './templates/BusinessClearanceTemplate'
import { CustomDocumentTemplate } from './templates/CustomDocumentTemplate'

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
  // ⚠️ `requiredFields` IS WHAT THE SCHEMA CAN SUPPLY, not what a
  // business clearance conceptually needs. The business name, address
  // and nature of business are not columns on `document_requests` --
  // they are not blank, they do not exist -- so requiring them would
  // disable Print on every Business Clearance forever while telling the
  // Secretary to correct a field that is not on the form. They print as
  // bracketed placeholders instead; see `UNRECORDED_PLACEHOLDERS`.
  'Business Clearance': {
    Template: BusinessClearanceTemplate,
    displayName: 'Business Clearance',
    prototype: true,
    requiredFields: ['fullName', 'purpose'],
  },
  // ⚠️ `Other` IS NOT A BARANGAY FORM, and the template says so rather
  // than picking one. It is the request form's escape hatch: the
  // resident writes what they need into `purpose`, and which document
  // answers it is the Secretary's decision. The entry exists so the
  // Secretary gets a populated sample to work from, not so the system
  // decides anything.
  //
  // `displayName` stays the stored string, like every other key -- the
  // preview's title bar says what the request says. The descriptive
  // title lives on the printed page, which is where a reader needs it.
  'Other': {
    Template: CustomDocumentTemplate,
    displayName: 'Other',
    prototype: true,
    requiredFields: ['fullName', 'purpose'],
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

// ⚠️ ALL SIX TYPES THE RESIDENT FORM OFFERS NOW RESOLVE, and this
// message is no longer reachable from any of them.
//
// X6 left `Business Clearance` and `Other` unconfigured on the grounds
// that the schema cannot supply what they need. That observation still
// holds exactly -- see the two entries above -- but the conclusion was
// wrong in one direction: a resident can select both in the request
// form, and the live table already held an approved Business Clearance
// at `ready_for_pickup`, so "no template" meant a real approved request
// with no sample output at all. They are prototypes with visible
// placeholders now, which is the same answer the other four give to
// every value the barangay has not supplied.
//
// ⚠️ THE MESSAGE STAYS, because `document_type` is FREE TEXT in the
// database -- no CHECK constraint -- so a value outside the six is
// still reachable by a crafted API call or a legacy row. It is the
// fallback for an unrecognised type, not a statement about any type a
// resident can choose.
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
