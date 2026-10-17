// The words a KP case, its panel, its hearings and its one outcome are
// read in. Pure: no Supabase import, no fetching, no component.
//
// ─── ⚠️ SQL OWNS THE VALUES; THIS MODULE OWNS THE WORDING ─────────────
//
// Every vocabulary below is a CHECK constraint in migration 043, so an
// invented value cannot be STORED. This file decides only how a stored
// value READS, which is why a question can be reworded without a
// migration. `kpCaseLabels.test.js` parses 043 and asserts the two agree
// exactly, in order and as sets — the cross-check
// `screeningChecklist.test.js` makes against 042, `reservationWindow`
// against 020 and `officialAvailability` against 026.
//
// ─── ⚠️ NOTHING HERE DECIDES ANYTHING ─────────────────────────────────
//
// There is no function in this module that maps attendance, minutes,
// panel composition or screening answers to an outcome, a disposition or
// a next step. Every one of those is a value a human picked, and a
// source-reading test asserts no such mapping exists. The same rule
// `screeningChecklist.js` holds, for the same reason: the software
// records what the barangay decided and never decides it.
//
// ⚠️ AND NO STATUTORY CONTENT. No penalty, fine, day limit, repudiation
// period, mandatory procedure or legal conclusion appears in any label,
// note or disclaimer — not even as a number. A test scans this file for
// a bare numeral and finds none.

// ── The case ───────────────────────────────────────────────────────────

export const KP_CASE_STATUSES = Object.freeze({
  open: { label: 'Open', note: 'The case is open. No proceeding has been scheduled yet.' },
  in_process: { label: 'In process', note: 'A proceeding has been scheduled for this case.' },
  concluded: { label: 'Concluded', note: 'The barangay head recorded that this case is concluded.' },
})

export const KP_CASE_STATUS_KEYS = Object.freeze(Object.keys(KP_CASE_STATUSES))

export const kpCaseStatusLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_CASE_STATUSES, value)
    ? KP_CASE_STATUSES[value].label
    : String(value ?? '')
)

export const kpCaseStatusNote = (value) => (
  Object.prototype.hasOwnProperty.call(KP_CASE_STATUSES, value)
    ? KP_CASE_STATUSES[value].note
    : ''
)

// ── The panel ──────────────────────────────────────────────────────────
//
// ⚠️ A RECORDED PANEL IS AN ADMINISTRATIVE RECORD, NOT A CONSTITUTED
// BODY. This system holds no Lupon roster: P2.5 found no Lupon, Justice
// or Katarungan committee recorded anywhere, and nothing here assumes an
// official is a Lupon member. So a member is a NAME somebody typed, the
// roster says on screen that it awaits barangay confirmation, and no
// name is suggested, defaulted or hardcoded.

export const KP_PANEL_ROLES = Object.freeze({
  chairperson: 'Chairperson',
  member: 'Member',
})

export const KP_PANEL_ROLE_KEYS = Object.freeze(Object.keys(KP_PANEL_ROLES))

export const kpPanelRoleLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_PANEL_ROLES, value)
    ? KP_PANEL_ROLES[value]
    : String(value ?? '')
)

// ⚠️ THREE, because a Pangkat is conceptually a three-person panel — and
// the number is a PANEL SIZE, not a statutory period or a threshold.
// Migration 043's own guard is what enforces it; this is the form's copy
// of the same limit so a fourth entry is refused before the round trip.
export const KP_PANEL_MAX = 3

export const KP_PANEL_PROVISIONAL_NOTE = 'Provisional roster — requires barangay confirmation. This system holds no Lupon or Pangkat membership list, so these are names recorded administratively, not a constituted panel.'

// ── Hearings ───────────────────────────────────────────────────────────

export const KP_PROCEEDING_TYPES = Object.freeze({
  mediation: 'Mediation',
  pangkat_hearing: 'Pangkat hearing',
  other: 'Other proceeding',
})

export const KP_PROCEEDING_TYPE_KEYS = Object.freeze(Object.keys(KP_PROCEEDING_TYPES))

export const kpProceedingTypeLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_PROCEEDING_TYPES, value)
    ? KP_PROCEEDING_TYPES[value]
    : String(value ?? '')
)

export const KP_HEARING_STATUSES = Object.freeze({
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
})

export const KP_HEARING_STATUS_KEYS = Object.freeze(Object.keys(KP_HEARING_STATUSES))

export const kpHearingStatusLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_HEARING_STATUSES, value)
    ? KP_HEARING_STATUSES[value]
    : String(value ?? '')
)

// ⚠️ `excused` IS NOT A JUDGMENT. It records that the barangay accepted a
// reason, which is a fact somebody at the counter knows; it says nothing
// about consequence, and nothing in this system attaches one. Non-
// appearance is `absent` and is likewise only a record.
export const KP_ATTENDANCE = Object.freeze({
  present: 'Present',
  absent: 'Did not appear',
  excused: 'Excused',
})

export const KP_ATTENDANCE_KEYS = Object.freeze(Object.keys(KP_ATTENDANCE))

export const kpAttendanceLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_ATTENDANCE, value)
    ? KP_ATTENDANCE[value]
    : String(value ?? '')
)

export const KP_ATTENDANCE_UNRECORDED = 'Not recorded'

// ── The one outcome ────────────────────────────────────────────────────
//
// ⚠️ FOUR VALUES, EACH NAMING WHAT THE BARANGAY WILL DO — not a finding
// about the law. The shape 042's screening outcomes take, deliberately,
// so a reader never learns two vocabularies for one kind of question.
//
// ⚠️ DELIBERATELY ABSENT: a settlement's terms, a repudiation, a
// compliance record, a certificate to file action, and anything that
// reads as a legal conclusion. Each is a later phase and none of them is
// reachable from here. A test asserts the four are the whole vocabulary
// and that no fifth word of that kind appears in this file.

export const KP_HEARING_OUTCOMES = Object.freeze({
  unresolved_continue_process: 'Unresolved — continue the process',
  resolved_agreement_recorded: 'Resolved — agreement recorded',
  referral_needed: 'Referral needed',
  further_hearing_needed: 'Further proceeding needed',
})

export const KP_HEARING_OUTCOME_KEYS = Object.freeze(Object.keys(KP_HEARING_OUTCOMES))

export const kpHearingOutcomeLabel = (value) => (
  Object.prototype.hasOwnProperty.call(KP_HEARING_OUTCOMES, value)
    ? KP_HEARING_OUTCOMES[value]
    : String(value ?? '')
)

// ⚠️ WHETHER A CASE IS OVER IS A SEPARATE HUMAN ANSWER. It is not derived
// from the outcome value: "Resolved — agreement recorded" does not
// conclude the case by itself, because the barangay may keep it open, and
// `record_kp_hearing_outcome` takes the answer as its own parameter.
export const KP_CONCLUDE_PROMPT = 'Also record that this case is concluded'

// ─── ⚠️ CONCLUDING A CASE LATER, AND WHY IT HAS TO BE POSSIBLE ────────
//
// Answering the prompt above with "no" used to be irreversible: ONE
// outcome per hearing is immutable at both layers, and that RPC was the
// only writer of a concluded case. So a case whose outcome did not
// conclude it could never be concluded from that hearing at all —
// measured in Final Integration's Flow A trace as
// `P0001 This hearing already has a recorded outcome.`
//
// ⚠️ IT IMPLIES NO LEGAL JUDGMENT, and every word here is chosen for
// that. The barangay is closing its own file; this is not a finding
// about anybody, so there is no "settled", "dismissed", "eligible" or
// "in favour of" in any of it, and a test scans these three strings for
// eleven such words.
export const KP_CONCLUDE_CASE_LABEL = 'Conclude case'

export const KP_CONCLUDE_CASE_HEADING = 'Conclude the case'

// ⚠️ IT SAYS WHAT STAYS UNCHANGED, because the one thing an official
// needs to know before clicking is that the proceeding's own record is
// not being rewritten.
export const KP_CONCLUDE_CASE_NOTE = 'Recording this closes the barangay\'s case file. The outcome already recorded for the proceeding is not changed by it, and a concluded case can no longer be changed.'

export const KP_CONCLUDE_CASE_CONFIRM_TITLE = 'Conclude this KP case?'

export const kpConcludeCaseConfirmMessage = (reference) => (
  `This records that the barangay is concluding case ${reference}. `
  + 'The outcome already recorded for the proceeding is left exactly as it '
  + 'is. A concluded case can no longer be changed.'
)

export const KP_OUTCOME_PROVISIONAL_NOTE = 'Provisional outcome wording — requires barangay confirmation. These four options describe what the barangay will do next; none of them is a legal finding, and this system makes no judgment of its own.'

// ── Refusals, in words an official can act on ──────────────────────────
//
// ⚠️ THE FUNCTION'S OWN SENTENCE NEVER REACHES THE SCREEN. Two of 043's
// RPCs name the position gate, and printing one would put an
// authorization model in a message on a screen somebody may be standing
// beside. A test asserts no sentence here contains a SQLSTATE, a function
// name, a table name or a policy name.

export const KP_ERRORS = Object.freeze({
  loadFailed: 'The case file could not be loaded just now. Try again in a moment.',
  notPermittedOpen: 'Opening a KP case is handled by the barangay head.',
  notPermittedAdmin: 'This action is handled by barangay records staff.',
  notPermittedOutcome: 'Recording a proceeding outcome is handled by the barangay head.',
  notPermittedConclude: 'Concluding a KP case is handled by the barangay head.',
  notConfirmed: 'This complaint needs a confirmed review before a case can be opened.',
  notProceed: 'The confirmed review for this complaint does not say to proceed with the KP process.',
  noScreening: 'This complaint has no review on record yet.',
  duplicateCase: 'A KP case has already been opened for this complaint.',
  concludedCase: 'This case is concluded and its records can no longer be changed.',
  outcomeRecorded: 'This proceeding already has a recorded outcome and cannot be changed.',
  alreadyConcluded: 'This case has already been concluded.',
  noOutcomeYet: 'A case is concluded from a recorded proceeding outcome, and this case has none yet.',
  panelFull: 'A panel records at most three people.',
  notAParty: 'That person is not recorded as a party to this case.',
  openFailed: 'The case could not be opened just now. Try again in a moment.',
  panelFailed: 'The panel member could not be recorded just now. Try again in a moment.',
  scheduleFailed: 'The proceeding could not be scheduled just now. Try again in a moment.',
  recordFailed: 'The record could not be saved just now. Try again in a moment.',
  attendanceFailed: 'Attendance could not be recorded just now. Try again in a moment.',
  outcomeFailed: 'The outcome could not be recorded just now. Try again in a moment.',
  concludeFailed: 'The case could not be concluded just now. Try again in a moment.',
})

// ⚠️ NAMES NO POSITION, exactly as the restricted complaint detail does.
// An official who cannot read a case cannot grant themselves access, and
// naming the holder only invites asking for it.
// ─── WHEN A KP CASE MAY BE OPENED ─────────────────────────────────────
//
// ⚠️ THESE WORDS GATE A CONTROL; `open_kp_case()` GATES THE WRITE, AND
// THE DATABASE CHECK IS UNTOUCHED. The RPC still finds the complaint's
// latest screening itself, still requires that a human confirmed it, and
// still requires the confirmed outcome to say to proceed -- so a crafted
// call is refused exactly as before. What changed is that the UI stops
// painting an "Open KP case" form in the three states the database would
// turn down, which is `ActionMenu`'s own rule: an action a caller cannot
// perform is ABSENT, never present and refused after the click.
//
// ⚠️ THE OUTCOME IS READ, THE CHECKLIST ANSWERS ARE NOT. Eligibility is
// the human-confirmed decision and nothing else -- no answer, no count,
// no flag and no threshold reaches this.
export const KP_OPEN_GATE = Object.freeze({
  noScreening: 'A KP case can be opened only after this complaint has been reviewed and the review confirmed. No review has been prepared yet.',
  unconfirmed: 'A review has been prepared for this complaint but has not been confirmed yet. A KP case can be opened once the barangay head confirms it.',
  notProceed: 'The confirmed review did not direct this complaint to the KP process, so no KP case can be opened for it. A later review would be a new screening.',
})

export const KP_RESTRICTED_NOTE = 'KP case administration is restricted to authorized records staff.'

// ── Dates and times, formatted once ────────────────────────────────────
//
// ⚠️ NO `Date` IS CONSTRUCTED FROM A DATE-ONLY STRING. `monthGrid`'s rule,
// and the reason for it: `new Date('2026-10-20')` parses as UTC midnight
// and reads back in the browser's zone, so west of UTC it describes the
// previous day. `kpHearingDate` splits the characters instead.
//
// ⚠️ `kpStampedAt` DOES construct one, and that is the distinction rather
// than an exception: it is given a `timestamptz`, which carries its own
// zone, so there is no zone to guess at. The hazard belongs to a bare
// `YYYY-MM-DD`, which is exactly what the test scans for — a `new Date`
// on `hearing_date` fails it, a `new Date` on a stamp does not.

const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
])

export const kpHearingDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!match) return ''
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return ''
  return `${Number(match[3])} ${month} ${match[1]}`
}

// ⚠️ A `time` column returns `HH:MM:SS`, and anything that is not a time
// yields '' rather than being printed — `eventTimeLabel`'s rule, which
// exists because three legacy event rows carry a time inside a location.
export const kpHearingTime = (value) => {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim())
  if (!match) return ''
  const hour = Number(match[1])
  if (hour > 23 || Number(match[2]) > 59) return ''
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${match[2]} ${suffix}`
}

// A timestamptz, for "recorded at" lines. The stored value carries its
// own zone, so this one may be parsed — the date-string hazard above is
// specific to a bare `YYYY-MM-DD`.
export const kpStampedAt = (value) => {
  if (!value) return ''
  const when = new Date(value)
  if (Number.isNaN(when.getTime())) return ''
  return kpHearingDate(
    `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
  )
}
