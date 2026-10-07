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

// Printed page geometry. A4 portrait, which is what Philippine
// barangay offices print on; `@page` in DocumentPrint.css carries the
// same value so the preview and the paper agree.
export const PAGE = {
  size: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
}
