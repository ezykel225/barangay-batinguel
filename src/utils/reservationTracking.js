// The public court-reservation tracking page's rules.
//
// ─── ⚠️ NOTHING HERE IS A SECURITY CONTROL ────────────────────────────
//
// The lookup itself is `track_court_reservation(p_reference, p_contact)`
// in migration 025: SECURITY DEFINER, two factors, a fixed narrow
// column list, `LIMIT 1`, and the same empty result for a wrong
// reference and a wrong contact number so it cannot confirm that a
// reference exists. `reservations` still has no anonymous SELECT
// policy.
//
// What is in this file is politeness: it keeps an obviously blank
// submission off the network and turns a stored status into a sentence.
// The normalisation below MIRRORS `normalize_reservation_reference()`
// (024) so the page can show the person what it is about to look up --
// it is NOT what matches the row. The database normalises both sides
// itself, which is what makes the match correct even if this copy ever
// drifts.
//
// ─── IT DEFINES NO STATUS WORD OF ITS OWN ─────────────────────────────
//
// Same rule as `notificationLabels.js`: the outcome word is read from
// `RESERVATION_STATUS_LABELS`, the map the official's badge already
// uses, so an official and a guest cannot be shown different words for
// one stored value. This module adds only the EXPLANATION beneath it --
// a sentence saying what that status means for the person reading,
// which is a different thing from the label and is not stored anywhere.
// `reservationTracking.test.js` asserts the file contains no second
// vocabulary.

import { RESERVATION_STATUS_LABELS } from './displayLabels'

// Crockford's look-alikes, mapped the way lookup forgives them: O -> 0,
// I -> 1, L -> 1. Generation never emits O, I, L or U (024), so this
// only ever repairs a transcription slip.
const LOOKALIKES = { O: '0', I: '1', L: '1' }

export const normalizeReference = (input) => {
  if (input === null || input === undefined) return ''
  return String(input)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[OIL]/g, (ch) => LOOKALIKES[ch])
}

// Digits only, on both sides. A resident may write 0917 123 4567,
// +639171234567 or 09171234567 for one phone, and the SQL does the same
// `regexp_replace(..., '[^0-9]', '', 'g')`.
export const digitsOnly = (input) => String(input ?? '').replace(/[^0-9]/g, '')

// What is wrong with the pair, in the person's own terms, or null when
// there is nothing obviously wrong with it.
//
// ⚠️ It never says whether a reference EXISTS. That is the whole point
// of the two-factor lookup: an answer that distinguishes "no such
// reference" from "wrong number" is an oracle for guessing references.
// So this only reports what is empty or malformed in what was TYPED.
export const trackingInputProblem = (reference, contact) => {
  if (normalizeReference(reference) === '') {
    return 'Please enter the reference number from your booking.'
  }
  if (digitsOnly(contact) === '') {
    return 'Please enter the contact number you gave when you booked.'
  }
  return null
}

// What a status means to the person who filed the booking. Keyed by the
// stored value, so widening the status vocabulary without touching this
// map falls back to the heading alone rather than printing a raw word.
const STATUS_EXPLANATIONS = {
  pending: 'The barangay has your request and nobody has decided on it yet.'
    + ' The hours you chose are held for you in the meantime.',
  approved: 'The court is yours for the date and time below.'
    + ' Please arrive on time and leave the court as you found it.',
  declined: 'The barangay could not accommodate this booking.'
    + ' The hours have been released, and you are welcome to request another time.',
  cancelled: 'This booking was cancelled and the hours have been released.',
}

const EXCEPTION_NOTE = 'This is an office-hours request, which the barangay'
  + ' decides one at a time rather than by a standing rule.'

// The whole presentation of one looked-up booking: the word, the badge
// class, the explanation, and the exception note when there is one.
//
// An unrecognised status keeps the stored value as its word -- the same
// decision `reservationStatusLabel()` makes, and right for the same
// reason: a word nobody anticipated must stay visible rather than be
// guessed at or blanked. Its explanation is simply absent.
export const describeTrackedStatus = (status, isException = false) => {
  const known = RESERVATION_STATUS_LABELS[status]
  return {
    label: known ? known.label : (status ?? ''),
    className: known ? known.className : 'badge-pending',
    isKnown: Boolean(known),
    explanation: STATUS_EXPLANATIONS[status] ?? '',
    exceptionNote: isException ? EXCEPTION_NOTE : '',
  }
}

// Every status the explanations cover, for the test that walks them.
export const EXPLAINED_STATUSES = Object.keys(STATUS_EXPLANATIONS)
