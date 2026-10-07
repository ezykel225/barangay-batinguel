// What every printable document shares, in one place.
//
// ─── ⚠️ THESE ARE PROTOTYPE TEMPLATES ────────────────────────────────
//
// The barangay has NOT supplied its official document forms. Everything
// under `src/documents/` is a SAMPLE layout built so the architecture
// around it -- request processing, resident lookup, permissions, data
// preparation, numbering, preview, printing -- is real and finished,
// and so that installing the official forms later is a template edit
// rather than a rewrite.
//
// Nothing here may be presented as Barangay Batinguel's official
// wording, layout, numbering, certification clause, fee, validity
// period or signing authority. None of those is invented, and the
// watermark below says so on screen and on paper.

import { BARANGAY_NAME, BARANGAY_CONTACT } from '../constants/barangay'

// ─── The one switch ───────────────────────────────────────────────────
//
// 'prototype' -> the SAMPLE TEMPLATE watermark renders, on screen and
//                in print, on every template.
// 'official'  -> it does not.
//
// ⚠️ ONE CONSTANT, NOT MARKUP IN EVERY TEMPLATE. The watermark lives in
// `DocumentShell`, so turning it off when the verified forms arrive is
// this one line -- nobody has to find and delete a banner from four
// files and miss the fifth.
export const DOCUMENT_TEMPLATE_MODE = 'prototype'

export const isPrototypeMode = () => DOCUMENT_TEMPLATE_MODE === 'prototype'

export const PROTOTYPE_WATERMARK = {
  heading: 'SAMPLE TEMPLATE',
  subheading: 'FOR SYSTEM DEVELOPMENT ONLY',
}

// ─── Barangay identity ────────────────────────────────────────────────
//
// ⚠️ EVERY LINE HERE IS A VALUE THE REPOSITORY ALREADY HELD, and no
// line was added because Philippine certificates usually carry it.
//
//   republic  — the standard heading of a Philippine government form.
//   province  — from `constants/about.js`: "Dumaguete City, Negros
//               Oriental", which is the only place the province is
//               recorded in this project.
//   city      — the same source, and `BARANGAY_CONTACT.address`.
//   barangay  — `BARANGAY_NAME`.
//
// ⚠️ THERE IS NO "OFFICE OF THE PUNONG BARANGAY" LINE, deliberately.
// Nothing in this repository establishes which office issues which
// document, and a prototype must not be the thing that decides it.
export const DOCUMENT_BARANGAY = {
  republic: 'Republic of the Philippines',
  province: 'Province of Negros Oriental',
  city: 'City of Dumaguete',
  barangay: BARANGAY_NAME.toUpperCase(),
  contactLine: BARANGAY_CONTACT.address,
  landline: BARANGAY_CONTACT.landline,
}

// ─── The signatory ────────────────────────────────────────────────────
//
// ⚠️ A PLACEHOLDER, AND THAT IS THE DECISION, not an omission.
//
// The repository establishes no signing authority at all: there is no
// signature column, no stored signatory, and nothing anywhere that says
// a clearance is signed by the Punong Barangay rather than the
// Secretary. `barangay_officials` holds positions, not authority.
//
// Printing a real official's name here would assert something nobody
// has checked, on a form that is itself unverified. So the prototype
// prints a rule and two bracketed placeholders, and the real template
// replaces them once the barangay says who signs what.
//
// ⚠️ NO SIGNATURE IMAGE IS GENERATED OR STORED. A fabricated signature
// on a government form is not a layout detail.
export const SIGNATORY_PLACEHOLDER = {
  name: '[AUTHORIZED SIGNATORY]',
  position: '[POSITION]',
}

// ─── Values the SCHEMA cannot supply ──────────────────────────────────
//
// ⚠️ THIS IS NOT THE SAME THING AS A MISSING VALUE, and conflating the
// two is the mistake this block exists to prevent.
//
//   MISSING  — the column exists and this row is blank. `buildDocumentData`
//              reports it, `DocumentPreview` refuses to print, and the
//              message tells the Secretary to correct the REQUEST. That
//              advice is actionable, because there is a field to correct.
//
//   UNRECORDED — `document_requests` has no such column at all, for any
//              row, ever. A Business Clearance has no business name
//              because the table stores `full_name`, `contact_number`,
//              `purok`, `purpose` and `additional_notes` and nothing
//              else. Routing that through the missing-field path would
//              permanently disable Print on every Business Clearance
//              while telling the Secretary to fix a field that does not
//              exist -- advice nobody can act on.
//
// So an unrecorded value prints as a bracketed placeholder in the same
// convention as the signatory above: visibly not a value, on a sheet
// that already carries the SAMPLE TEMPLATE watermark.
//
// ⚠️ NOTHING HERE IS A GUESS DRESSED AS A PLACEHOLDER. There is no
// `[PERMIT NO.]`, `[OR NO.]`, `[FEE]`, `[VALID UNTIL]` or
// `[BUSINESS CLASSIFICATION]`, because printing a bracket for one of
// those still asserts that Barangay Batinguel's form HAS that field --
// which nobody has told this project. A placeholder is only for a value
// the barangay has already told us exists, or that the document plainly
// cannot be read without.
export const UNRECORDED_PLACEHOLDERS = Object.freeze({
  businessName: '[BUSINESS NAME]',
  businessAddress: '[BUSINESS ADDRESS]',
  natureOfBusiness: '[NATURE OF BUSINESS]',
  // 'Other' records no title of its own: the resident picks "Other"
  // and writes what they need into `purpose`. Which form answers it is
  // the Secretary's decision, so the title is a placeholder and the
  // purpose beside it is the real, stored text.
  documentTitle: '[DOCUMENT TITLE]',
})

// Printed page geometry. A4 portrait, which is what Philippine
// barangay offices print on; `@page` in DocumentPrint.css carries the
// same value so the preview and the paper agree.
export const PAGE = {
  size: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
}
