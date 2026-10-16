// The PROVISIONAL KP review checklist, its wording, and the words a
// screening is read in.
//
// ─── ⚠️ NOTHING HERE DECIDES KP JURISDICTION, AND NOTHING MAY ─────────
//
// This module holds QUESTIONS and LABELS. It contains no rule, no
// threshold, no weighting, and — most importantly — **no function that
// turns answers into a recommendation or an outcome**. Both of those are
// chosen by a human and sent to the database as parameters.
//
// `needsFurtherReview()` below is the one thing that looks like such a
// function and deliberately is not: it answers "should this single answer
// be marked for the reviewer's attention", which is display emphasis on
// one row. It produces no recommendation, no outcome, no total and no
// score, and a test asserts this module exports nothing that maps the
// answer set to either vocabulary.
//
// ─── ⚠️ PROVISIONAL — FOR BARANGAY CONFIRMATION ───────────────────────
//
// The six review items are drawn from the review areas the capstone brief
// named. They are **not** a statement of law, **not** exhaustive, and
// **not** verified against Barangay Batinguel's actual Katarungang
// Pambarangay procedure, which has not been supplied to this project.
//
// So no question states a legal conclusion, and none names a penalty
// threshold, a statutory day limit, a repudiation period or a CFA
// requirement. Each asks what a reviewer can observe — "does this
// complaint indicate", "is it possible" — because the alternative
// ("this complaint is outside KP jurisdiction") would be the software
// making a finding it has no authority to make.
//
// ─── ⚠️ THE KEYS ARE MIRRORED IN SQL AND THE TWO ARE ASSERTED EQUAL ───
//
// `complaint_screening_checklist_keys('v1')` in migration 042 is the
// authority on which keys may be STORED; this file is the authority on
// how they READ. A test parses the migration and asserts the two lists
// match exactly — the same cross-check `reservationWindow.test.js` makes
// against migration 020's SQL and `officialAvailability.test.js` against
// 026's CHECK. Editing one without the other fails in Jest rather than at
// the counter.
//
// ─── IT IS PURE, DELIBERATELY ─────────────────────────────────────────
//
// No Supabase import: `supabaseClient.js` throws at import time without
// the env vars, so a rule worth testing lives in a module that can be
// tested without them.

// ⚠️ The version travels with every stored screening. The questionnaire
// may be reworded or extended later, and a row recorded under v1 must
// still be interpretable as these six questions — otherwise a key that no
// longer exists becomes unreadable rather than historical.
export const CHECKLIST_VERSION = 'v1'

// ⚠️ EVERY KEY NAMES SOMETHING A REVIEWER OBSERVES, NEVER A LEGAL STATUS.
// There is no `is_kp_eligible` key and there must never be one: that is a
// conclusion, and this checklist records observations.
export const CHECKLIST_V1 = [
  {
    key: 'government_or_public_office_party',
    question: 'Does this complaint indicate that a party is a government'
      + ' office, a public officer, or acting in an official capacity?',
    // ⚠️ `attentionWhen` is which answer the SCREEN should mark for the
    // reviewer's attention. It is emphasis on one row, not a finding, and
    // nothing totals it.
    attentionWhen: 'yes',
  },
  {
    key: 'possible_serious_offense',
    // ⚠️ "possible" and "serious", with NO penalty threshold, no
    // imprisonment term and no fine named. Naming one would be inventing
    // the legal rule this phase is forbidden to encode.
    question: 'Does this complaint indicate a possible serious offense'
      + ' that may need to be handled by another authority?',
    attentionWhen: 'yes',
  },
  {
    key: 'possible_vawc_or_sensitive_family_matter',
    // ⚠️ A SENSITIVITY FLAG, AND IT INCREASES PRIVACY RATHER THAN
    // REDUCING IT. Recording `yes` adds nothing to the official queue, to
    // public tracking, to the resident's own status or to any
    // notification — the answer never leaves the screening record, which
    // only the Secretary and the Punong Barangay can read. There is
    // deliberately no public "VAWC" category and no VAWC procedure
    // encoded anywhere.
    question: 'Does this complaint possibly involve violence against women'
      + ' or children, or another highly sensitive family matter?',
    attentionWhen: 'yes',
    sensitive: true,
  },
  {
    key: 'parties_from_different_city_or_municipality',
    question: 'Do the parties appear to live in different cities or'
      + ' municipalities?',
    attentionWhen: 'yes',
  },
  {
    key: 'minor_involved',
    // ⚠️ The second sensitivity flag, and the same rule: it is recorded
    // inside the restricted screening and surfaces nowhere else.
    question: 'Does this complaint appear to involve a minor?',
    attentionWhen: 'yes',
    sensitive: true,
  },
  {
    key: 'other_circumstance_requiring_review',
    // ⚠️ The list does NOT claim to be exhaustive, and this item is how
    // it says so on screen rather than only in a comment.
    question: 'Is there any other circumstance that may require referral'
      + ' or further review?',
    attentionWhen: 'yes',
  },
]

export const CHECKLIST_VERSIONS = { v1: CHECKLIST_V1 }

export const checklistFor = (version) => (
  Object.prototype.hasOwnProperty.call(CHECKLIST_VERSIONS, version)
    ? CHECKLIST_VERSIONS[version]
    : null
)

export const CHECKLIST_KEYS = CHECKLIST_V1.map((item) => item.key)

// ⚠️ THREE OPTIONS, NOT TWO, AND THE THIRD IS THE POINT. A reviewer who
// has not established something must be able to say so: forcing a yes/no
// would make them answer `no` to a question nobody checked, and `no` and
// "not looked into" are different facts on a record the Punong Barangay
// reads before confirming. The database permits exactly these three.
export const ANSWER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown / needs verification' },
]

export const ANSWER_VALUES = ANSWER_OPTIONS.map((o) => o.value)

const ANSWER_LABELS = ANSWER_OPTIONS.reduce(
  (map, o) => ({ ...map, [o.value]: o.label }), {}
)

// Unrecognised values come back exactly as stored, and with a
// `hasOwnProperty` guard so a stored `constructor` does not resolve to a
// function — the trap `officialPhotos.test.js` pins.
export const answerLabel = (stored) => (
  Object.prototype.hasOwnProperty.call(ANSWER_LABELS, stored)
    ? ANSWER_LABELS[stored]
    : (stored ?? '')
)

// ⚠️ ONE ANSWER AT A TIME, AND IT DECIDES NOTHING. It marks a row so a
// reviewer's eye lands on it; it does not recommend, conclude, score or
// total. An `unknown` is NOT marked: "we have not checked" is an ordinary
// state of a draft, and flagging it would turn the emphasis into a
// completeness score.
export const needsFurtherReview = (item, answer) => (
  Boolean(item) && answer === item.attentionWhen
)

// ⚠️ The sentence the screen must carry, kept here so all three places
// that show it cannot drift into three different promises.
export const CHECKLIST_DISCLAIMER =
  'This checklist supports barangay review. It does not automatically'
  + ' determine legal jurisdiction, and it is not a complete list of legal'
  + ' criteria. A barangay official records the answers, and the Punong'
  + ' Barangay confirms what the barangay will do next.'

export const CHECKLIST_PROVISIONAL_NOTE =
  'Provisional review checklist — awaiting barangay confirmation.'

// ─── The outcome vocabulary ───────────────────────────────────────────
//
// ⚠️ EACH VALUE NAMES WHAT THE BARANGAY DECIDED TO DO, NOT A FINDING
// ABOUT THE LAW. That is the test every word here had to pass: a reader
// must not come away thinking the software ruled on anything.
//
// ⚠️ DELIBERATELY ABSENT: `settled`, `conciliation`,
// `certificate_to_file_action` — P4-B/P4-C concepts with nothing in this
// phase able to reach them — and `eligible`, `ineligible`, `dismissed`,
// which are legal conclusions. The database refuses all six.
export const SCREENING_OUTCOMES = [
  {
    value: 'proceed_to_kp_process',
    label: 'Proceed with the barangay KP process',
    help: 'The barangay will take this forward through its Katarungang'
      + ' Pambarangay process.',
  },
  {
    value: 'refer_for_further_action',
    label: 'Refer for further action',
    help: 'The barangay will refer this elsewhere, or handle it outside the'
      + ' KP process.',
  },
  {
    value: 'close_without_kp_process',
    label: 'Close without the KP process',
    help: 'The barangay will not take this forward through the KP process.',
  },
  {
    value: 'needs_more_information',
    label: 'Needs more information',
    help: 'Not decided yet. More information is needed before the barangay'
      + ' can say what it will do.',
  },
]

export const SCREENING_OUTCOME_VALUES = SCREENING_OUTCOMES.map((o) => o.value)

const OUTCOME_LABELS = SCREENING_OUTCOMES.reduce(
  (map, o) => ({ ...map, [o.value]: o.label }), {}
)

export const screeningOutcomeLabel = (stored) => (
  Object.prototype.hasOwnProperty.call(OUTCOME_LABELS, stored)
    ? OUTCOME_LABELS[stored]
    : (stored ?? '')
)

// The Secretary's recommendation draws on the SAME four words, so a reader
// never learns two vocabularies for one question and a recommendation can
// be compared with the outcome that followed it. The database constrains
// both columns to the same four.
export const RECOMMENDATION_OPTIONS = SCREENING_OUTCOMES

export const SCREENING_ERRORS = {
  loadFailed: 'The screening could not be loaded just now.'
    + ' Please try again in a moment.',
  prepareFailed: 'This screening could not be saved just now.'
    + ' Please try again in a moment.',
  confirmFailed: 'This screening could not be confirmed just now.'
    + ' Please try again in a moment.',
  // ⚠️ Names no position as the gate that refused, for the reason the
  // restricted-detail message does: an official who lacks the position
  // cannot grant it to themselves, and naming the holder invites asking.
  notPermittedPrepare: 'This account cannot prepare a screening.'
    + ' Screening is handled by barangay records staff.',
  notPermittedConfirm: 'This account cannot confirm a screening.'
    + ' Confirmation is handled by the barangay head.',
  alreadyConfirmed: 'This screening has already been confirmed.'
    + ' Prepare a new screening if it needs to be reviewed again.',
  selfConfirm: 'A screening cannot be confirmed by the official who'
    + ' prepared it.',
  incomplete: 'Please answer every review question before saving.',
  outcomeRequired: 'Please choose what the barangay will do next.',
}
