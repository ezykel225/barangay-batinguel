// Combined Phase 1. The KP case vocabularies as a pure module, and the
// cross-check that they are migration 043's own.
//
// ⚠️ WHAT THESE TESTS CANNOT PROVE. Who may open a case, schedule a
// proceeding or record an outcome is a position gate inside a SECURITY
// DEFINER function, and only SQL can prove a position gate -- the
// role-impersonation matrix lives in this phase's report. What is pinned
// here is the half Jest can see: the wording, the vocabularies agreeing
// with the database, and the ABSENCES that make this a recorder rather
// than a decider.

import fs from 'fs'
import path from 'path'

import {
  KP_ATTENDANCE,
  KP_ATTENDANCE_KEYS,
  KP_CASE_STATUSES,
  KP_CASE_STATUS_KEYS,
  KP_CONCLUDE_PROMPT,
  KP_ERRORS,
  KP_HEARING_OUTCOMES,
  KP_HEARING_OUTCOME_KEYS,
  KP_HEARING_STATUSES,
  KP_HEARING_STATUS_KEYS,
  KP_OUTCOME_PROVISIONAL_NOTE,
  KP_PANEL_MAX,
  KP_PANEL_PROVISIONAL_NOTE,
  KP_PANEL_ROLES,
  KP_PANEL_ROLE_KEYS,
  KP_PROCEEDING_TYPES,
  KP_PROCEEDING_TYPE_KEYS,
  KP_RESTRICTED_NOTE,
  kpAttendanceLabel,
  kpCaseStatusLabel,
  kpHearingDate,
  kpHearingOutcomeLabel,
  kpHearingStatusLabel,
  kpHearingTime,
  kpPanelRoleLabel,
  kpProceedingTypeLabel,
  kpStampedAt,
} from './kpCaseLabels'

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase-migrations', '043_kp_case_hearings_summons.sql',
)
const raw = fs.readFileSync(MIGRATION, 'utf8')

// ⚠️ COMMENT-STRIPPED FOR EVERY "IS NOT USED" SCAN. 043 discusses
// `committee`, settlement, repudiation and a certificate to file at
// length precisely to record that none of them is read or built, and a
// scan that counted those sentences would report the file's own
// documentation as the defect it documents avoiding. The
// `complaintIntakeMigration.test.js` precedent.
const sql = raw.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

const labelFile = fs.readFileSync(path.join(__dirname, 'kpCaseLabels.js'), 'utf8')
const labelCode = labelFile.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Pulls one CHECK's `array[...]` members out of 043.
const checkValues = (constraint) => {
  const block = sql.match(
    new RegExp(`constraint ${constraint} check \\(([\\s\\S]*?)\\n  \\)`),
  )
  expect(block).not.toBeNull()
  return (block[1].match(/'([a-z0-9_]+)'/g) || []).map((s) => s.slice(1, -1))
}

// ── A. The vocabularies ARE the migration's ──────────────────────────
//
// ⚠️ SQL OWNS THE VALUES, THIS MODULE OWNS THE WORDING. The same
// cross-check `screeningChecklist.test.js` makes against 042's key-set
// function, `reservationWindow.test.js` against migration 020's SQL
// cases and `officialAvailability.test.js` against 026's status CHECK.
// Run both directions: renaming one SQL value, or adding one, fails
// here rather than printing a raw stored word on screen.

describe('A. every vocabulary matches migration 043 exactly', () => {
  it('case statuses', () => {
    expect(checkValues('kp_cases_status_check')).toEqual(KP_CASE_STATUS_KEYS)
  })

  it('panel roles', () => {
    expect(checkValues('kp_case_panel_role_check')).toEqual(KP_PANEL_ROLE_KEYS)
  })

  it('proceeding types', () => {
    expect(checkValues('kp_hearings_type_check')).toEqual(KP_PROCEEDING_TYPE_KEYS)
  })

  it('hearing statuses', () => {
    expect(checkValues('kp_hearings_status_check')).toEqual(KP_HEARING_STATUS_KEYS)
  })

  it('attendance values', () => {
    expect(checkValues('kp_attendance_value_check')).toEqual(KP_ATTENDANCE_KEYS)
  })

  // ⚠️ The outcome CHECK is `outcome is null or outcome = any (array[...])`,
  // so its own `null` branch is not a value and the members are read
  // from the array alone.
  it('proceeding outcomes', () => {
    const block = sql.match(
      /constraint kp_hearings_outcome_check check \(([\s\S]*?)\n  \)/,
    )
    expect(block).not.toBeNull()
    const values = (block[1].match(/'([a-z0-9_]+)'/g) || []).map((s) => s.slice(1, -1))
    expect(values).toEqual(KP_HEARING_OUTCOME_KEYS)
  })

  // ⚠️ AS A SET TOO, not only in order, so a reordering that happened to
  // line up would still have to be the same four words.
  it('the four outcomes are the whole outcome vocabulary', () => {
    expect(new Set(KP_HEARING_OUTCOME_KEYS)).toEqual(new Set([
      'unresolved_continue_process',
      'resolved_agreement_recorded',
      'referral_needed',
      'further_hearing_needed',
    ]))
    expect(KP_HEARING_OUTCOME_KEYS).toHaveLength(4)
  })

  // ⚠️ AT MINIMUM scheduled / completed / cancelled-or-rescheduled, §4.
  // All four are distinguished.
  it('distinguishes scheduled, completed, cancelled and rescheduled', () => {
    ;['scheduled', 'completed', 'cancelled', 'rescheduled'].forEach((key) => {
      expect(KP_HEARING_STATUS_KEYS).toContain(key)
    })
  })

  // ⚠️ THREE, and 043's own guard is what enforces it. The form's copy
  // of the limit only refuses a fourth before the round trip.
  it('records a panel of at most three, as the migration does', () => {
    expect(KP_PANEL_MAX).toBe(3)
    expect(sql).toMatch(/at most three people/)
  })
})

// ── B. Nothing here decides anything ────────────────────────────────
//
// ⚠️ THE ABSENCES ARE THE LOAD-BEARING TESTS, exactly as in
// `screeningChecklist.test.js`. A module that computed an outcome from
// attendance, minutes or a panel would make the software the decider,
// and §1 and §6 both forbid it.

describe('B. no function maps anything to an outcome', () => {
  it('exports no scorer, recommender or decider under any name', () => {
    const module = require('./kpCaseLabels')
    ;[
      'decideOutcome', 'deriveOutcome', 'computeOutcome', 'suggestOutcome',
      'recommendOutcome', 'outcomeFor', 'outcomeFromAttendance',
      'resolveCase', 'concludeCase', 'shouldConclude', 'isResolved',
      'scoreHearing', 'evaluateCase', 'assessCase', 'kpEligible',
      'isKpEligible', 'nextStep', 'nextStage', 'disposition',
      'jurisdictionFor', 'settlementFor',
    ].forEach((name) => {
      expect(module[name]).toBeUndefined()
    })
  })

  // ⚠️ Every exported function is a LOOKUP or a FORMATTER taking one
  // value. A decider would need the answers, the attendance or the
  // hearing, so the arity is the proof.
  it('every label function takes exactly one value', () => {
    ;[kpCaseStatusLabel, kpPanelRoleLabel, kpProceedingTypeLabel,
      kpHearingStatusLabel, kpAttendanceLabel, kpHearingOutcomeLabel,
      kpHearingDate, kpHearingTime, kpStampedAt]
      .forEach((fn) => expect(fn).toHaveLength(1))
  })

  it('reads no attendance, minutes, panel or checklist to produce a label', () => {
    ;['attendance_note', 'minutes', 'answers', 'checklist',
      'needsFurtherReview', 'recommendation']
      .forEach((term) => expect(labelCode).not.toContain(term))
  })

  // ⚠️ WHETHER A CASE IS OVER IS A SEPARATE HUMAN ANSWER, and the prompt
  // is worded as one. A constant reading "conclude when resolved" would
  // be a rule.
  it('asks whether the case is concluded rather than deriving it', () => {
    expect(KP_CONCLUDE_PROMPT).toMatch(/^Also record/)
    expect(KP_CONCLUDE_PROMPT.toLowerCase()).not.toMatch(/if |when |because/)
  })
})

// ── C. No statutory content, anywhere ───────────────────────────────
//
// ⚠️ §5 and the standing P4-A rule: no penalty, fine, day limit,
// repudiation period, statutory period or legal conclusion -- "no bare
// number at all", which is how `screeningChecklist.test.js` states it,
// because a threshold is a number.

describe('C. no statutory or legal content', () => {
  // ⚠️ SCOPED TO THE VOCABULARY SECTION, AND THAT IS MY OWN SCAN
  // CORRECTED RATHER THAN A WEAKENED ASSERTION. The first version ran
  // over the whole file and reported 26 numbers -- every one of them a
  // regex quantifier (`\d{4}`, `(\d{2})`) or 12-hour clock arithmetic
  // (12, 23, 59) in the two formatters at the bottom. Those are not
  // statutory content; a scan that flags them is the `Badminton`/`admin`
  // trap in numeric form, and P4-A hit the word version of it twice.
  //
  // The property is that no number functions as a PERIOD, a THRESHOLD or
  // a PENALTY, and the place one would hide is the vocabulary, the notes
  // and the refusal sentences -- so the scan runs over everything above
  // the date helpers, where the panel size is the only number, and the
  // whole-file word scan below covers the rest.
  it('holds no number in its vocabulary except the panel size', () => {
    const vocab = labelCode.slice(0, labelCode.indexOf('const MONTHS'))
    expect(vocab).toContain('KP_ERRORS')          // the scan reaches the end
    expect(vocab.match(/\b\d+\b/g) || []).toEqual(['3'])
    expect(labelCode).toMatch(/KP_PANEL_MAX = 3/)
  })

  it('names no penalty, period, deadline or legal instrument', () => {
    const lower = labelCode.toLowerCase()
    ;['penalty', 'penalt', 'fine', 'imprison', 'days', 'deadline',
      'repudiat', 'prescriptive', 'statutor', 'certificate to file',
      'cfa', 'barangay protection order', 'subpoena', 'contempt',
      'sanction', 'liable', 'liability', 'jurisdiction']
      .forEach((term) => expect(lower).not.toContain(term))
  })

  // ⚠️ WORD BOUNDARIES, and this is measured rather than stylistic:
  // P4-A's own first version of this scan reported `tan` inside
  // `circumstance` and `fine` inside `definer`. A substring scan of a
  // vocabulary reports the vocabulary.
  it('no outcome reads as a legal finding', () => {
    Object.values(KP_HEARING_OUTCOMES).forEach((label) => {
      ;['eligible', 'ineligible', 'dismissed', 'guilty', 'liable',
        'jurisdiction', 'certified']
        .forEach((term) => {
          expect(label.toLowerCase()).not.toMatch(new RegExp(`\\b${term}\\b`))
        })
    })
  })

  // ⚠️ §6 and §10: the outcome vocabulary stops where this phase stops.
  it('offers no deferred stage as an outcome', () => {
    ;['settled', 'settlement_terms', 'conciliation',
      'certificate_to_file_action', 'repudiated', 'eligible', 'ineligible',
      'dismissed']
      .forEach((value) => {
        expect(Object.prototype.hasOwnProperty.call(KP_HEARING_OUTCOMES, value))
          .toBe(false)
      })
  })
})

// ── D. The provisional markings say so on screen ────────────────────
//
// ⚠️ §3: if actual Lupon/Pangkat membership is not available, mark the
// roster as requiring barangay confirmation -- in WORDS a reader sees,
// not only in a comment.

describe('D. provisional markings', () => {
  it('marks the panel roster as requiring barangay confirmation', () => {
    expect(KP_PANEL_PROVISIONAL_NOTE).toMatch(/requires barangay confirmation/i)
    expect(KP_PANEL_PROVISIONAL_NOTE).toMatch(/no Lupon or Pangkat membership/i)
  })

  it('marks the outcome wording as requiring barangay confirmation', () => {
    expect(KP_OUTCOME_PROVISIONAL_NOTE).toMatch(/requires barangay confirmation/i)
    expect(KP_OUTCOME_PROVISIONAL_NOTE).toMatch(/none of them is a legal finding/i)
  })

  // ⚠️ §3: do not fabricate real members, and do not hardcode names.
  it('hardcodes no person, and suggests none', () => {
    ;['Credo', 'Tan', 'Remata', 'Baroy', 'Katada', 'Duran', 'Lastimoso',
      'Catalan', 'Amparado', 'Cabrera', 'Fabillar']
      .forEach((surname) => {
        expect(labelCode).not.toMatch(new RegExp(`\\b${surname}\\b`))
      })
  })
})

// ── E. The refusals leak nothing ────────────────────────────────────

describe('E. refusal wording', () => {
  it('names no SQLSTATE, function, table or policy', () => {
    Object.values(KP_ERRORS).concat([KP_RESTRICTED_NOTE]).forEach((message) => {
      expect(message).not.toMatch(/P0001|42501|23505|23514|SQLSTATE/)
      expect(message).not.toMatch(/open_kp_case|record_kp|schedule_kp|kp_cases|kp_hearings/)
      expect(message).not.toMatch(/policy|RLS|row level/i)
      expect(message).not.toMatch(/current_official_holds_position|official_account_links/)
    })
  })

  // ⚠️ THE RESTRICTED SENTENCE NAMES NO POSITION, exactly as the
  // restricted complaint detail does: an ordinary official cannot grant
  // themselves records access, and naming the holder only invites
  // asking for it.
  it('the restricted note names no position', () => {
    expect(KP_RESTRICTED_NOTE).not.toMatch(/Punong|Secretary|Treasurer|Kagawad|Kapitan/i)
  })

  // ⚠️ AND IT DOES NOT READ AS A FAILURE. A withheld record is a rule
  // working; a sentence saying something went wrong would send an
  // official looking for a fault that is not there.
  it('the restricted note does not read as an error', () => {
    expect(KP_RESTRICTED_NOTE).not.toMatch(/error|failed|unable|wrong|problem|denied/i)
  })

  // ⚠️ The two position-gated refusals say WHO handles the action
  // without naming a gate, which is the distinction: an official needs
  // to know where to take the work.
  it('the two position refusals point somewhere without naming a gate', () => {
    expect(KP_ERRORS.notPermittedOpen).toMatch(/barangay head/i)
    expect(KP_ERRORS.notPermittedOutcome).toMatch(/barangay head/i)
    expect(KP_ERRORS.notPermittedAdmin).toMatch(/records staff/i)
  })
})

// ── F. Labels, and an unknown value ────────────────────────────────

describe('F. label lookup', () => {
  it('reads every stored value as words with no underscore', () => {
    ;[
      [KP_CASE_STATUS_KEYS, kpCaseStatusLabel],
      [KP_PANEL_ROLE_KEYS, kpPanelRoleLabel],
      [KP_PROCEEDING_TYPE_KEYS, kpProceedingTypeLabel],
      [KP_HEARING_STATUS_KEYS, kpHearingStatusLabel],
      [KP_ATTENDANCE_KEYS, kpAttendanceLabel],
      [KP_HEARING_OUTCOME_KEYS, kpHearingOutcomeLabel],
    ].forEach(([keys, label]) => {
      keys.forEach((key) => {
        expect(label(key)).toBeTruthy()
        expect(label(key)).not.toContain('_')
      })
    })
  })

  // ⚠️ `hasOwnProperty`, asserted -- a bare lookup resolves
  // `constructor` to a function, which is the `officialPhotos` lesson.
  it('does not resolve an inherited property name', () => {
    ;[kpCaseStatusLabel, kpPanelRoleLabel, kpProceedingTypeLabel,
      kpHearingStatusLabel, kpAttendanceLabel, kpHearingOutcomeLabel]
      .forEach((label) => {
        expect(label('constructor')).toBe('constructor')
        expect(typeof label('constructor')).toBe('string')
      })
  })

  it('returns an unrecognised value exactly as stored', () => {
    expect(kpHearingStatusLabel('postponed_forever')).toBe('postponed_forever')
    expect(kpAttendanceLabel('')).toBe('')
    expect(kpCaseStatusLabel(undefined)).toBe('')
  })

  // ⚠️ `absent` READS AS A RECORD, not as a judgment: "Did not appear"
  // states what happened. A label reading "Failed to appear" or
  // "Defaulted" would attach a consequence this system does not hold.
  it('states non-appearance without attaching a consequence', () => {
    expect(KP_ATTENDANCE.absent).toBe('Did not appear')
    Object.values(KP_ATTENDANCE).forEach((label) => {
      expect(label.toLowerCase()).not.toMatch(/fail|default|waive|forfeit|penal/)
    })
  })

  it('every case status carries a note that explains it', () => {
    KP_CASE_STATUS_KEYS.forEach((key) => {
      expect(KP_CASE_STATUSES[key].note).toBeTruthy()
      expect(KP_CASE_STATUSES[key].note).not.toContain('_')
    })
  })

  it('panel roles support a chairperson and members', () => {
    expect(KP_PANEL_ROLES.chairperson).toBe('Chairperson')
    expect(KP_PANEL_ROLES.member).toBe('Member')
  })

  it('names the three proceeding types without inventing a fourth', () => {
    expect(KP_PROCEEDING_TYPES.mediation).toBe('Mediation')
    expect(KP_PROCEEDING_TYPES.pangkat_hearing).toBe('Pangkat hearing')
    expect(KP_PROCEEDING_TYPE_KEYS).toHaveLength(3)
  })

  it('reads every hearing status as words', () => {
    expect(KP_HEARING_STATUSES.scheduled).toBe('Scheduled')
    expect(KP_HEARING_STATUSES.rescheduled).toBe('Rescheduled')
  })
})

// ── G. Dates and times ─────────────────────────────────────────────
//
// ⚠️ NO `Date` FROM A DATE-ONLY STRING. `new Date('2026-10-20')` parses
// as UTC midnight and reads back in the browser's zone, so west of UTC
// it describes the previous day -- `monthGrid`'s rule and the reason
// `eventCardDate` exists.

describe('G. date and time formatting', () => {
  it('formats a stored date from its characters', () => {
    expect(kpHearingDate('2026-10-20')).toBe('20 October 2026')
    expect(kpHearingDate('2026-01-05')).toBe('5 January 2026')
  })

  // ⚠️ SCOPED TO THE DATE-ONLY HELPERS, AND THAT IS THE DISTINCTION
  // RATHER THAN AN EXEMPTION -- my first version asserted the module
  // constructs no `Date` at all and failed on `kpStampedAt`, which is
  // given a `timestamptz`. A timestamptz carries its own zone, so there
  // is no zone to guess at; the hazard belongs to a bare `YYYY-MM-DD`.
  //
  // So: the two date-only helpers construct none, and the ONE `new Date`
  // in the module is the stamp parser. A `new Date` added anywhere else
  // fails the count.
  it('constructs no Date from a date-only string', () => {
    expect(kpHearingDate.toString()).not.toMatch(/new Date/)
    expect(kpHearingTime.toString()).not.toMatch(/new Date/)
    expect(labelCode.match(/new Date\(/g) || []).toHaveLength(1)
    expect(kpStampedAt.toString()).toMatch(/new Date\(value\)/)
  })

  it('refuses a value that is not a date rather than guessing', () => {
    ;['', null, undefined, 'next Tuesday', '2026-13-01', 'Main Hall']
      .forEach((value) => expect(kpHearingDate(value)).toBe(''))
  })

  // ⚠️ A `time` column really returns `HH:MM:SS`, and anything that is
  // not a time yields '' rather than being printed -- the
  // `eventTimeLabel` rule, which exists because three legacy event rows
  // carry a time inside a LOCATION.
  it('formats the HH:MM:SS a time column returns', () => {
    expect(kpHearingTime('14:00:00')).toBe('2:00 PM')
    expect(kpHearingTime('09:30:00')).toBe('9:30 AM')
    expect(kpHearingTime('00:15:00')).toBe('12:15 AM')
    expect(kpHearingTime('12:00:00')).toBe('12:00 PM')
  })

  it('yields nothing for a value that is not a time', () => {
    ;['', null, undefined, '2:00 PM - Main Covered Court', '25:00:00',
      '10:75:00', 'Barangay Hall']
      .forEach((value) => expect(kpHearingTime(value)).toBe(''))
  })

  it('reads a stamp as a date, and nothing at all when absent', () => {
    expect(kpStampedAt('')).toBe('')
    expect(kpStampedAt(null)).toBe('')
    expect(kpStampedAt('not a timestamp')).toBe('')
    expect(kpStampedAt('2026-10-16T01:00:00.000Z')).toMatch(/October 2026$/)
  })
})
