// One case + one hearing -> the values a KP notice template prints, plus
// what is MISSING. Pure: no Supabase import, no fetching, no component.
//
// ⚠️ THE SAME CONTRACT `documentData.js` HOLDS FOR X6, and for the same
// reason: a template binds a normalized shape, so replacing a prototype
// layout with Barangay Batinguel's real form touches the template and
// nothing else — not the data access, not the authorization, not the
// print pipeline. A template that read the database would make
// installing the real form a rewrite of both.
//
// ─── ⚠️ FACTUAL DATA ONLY ─────────────────────────────────────────────
//
// Every value here is read off a row the barangay recorded: the case
// reference, the complaint reference, the proceeding type, the date, the
// time, the location, and the parties' recorded names. Nothing is
// computed, inferred or supplied on the barangay's behalf.
//
// ⚠️ NO STATUTORY CONTENT, AND NOTHING THAT LOOKS LIKE IT. No penalty
// for non-appearance, no deadline, no period, no required-attendance
// clause, no legal consequence, no "you are hereby summoned" formula.
// The barangay has not supplied the wording of either document, so the
// prototype prints the facts and says, on the page, that the wording is
// a placeholder. A test scans both sheets for all of that and for a bare
// numeral outside the factual fields.
//
// ⚠️ A MISSING VALUE IS REPORTED, NEVER FILLED. `N/A`, `UNKNOWN`, `TBD`
// and an em dash all read as statements inside a field that looks
// official, so a blocker is returned and the preview refuses to print —
// X6's rule, and the distinction it drew between MISSING (a column
// exists and this row is blank, which is actionable) and UNRECORDED (no
// column exists at all) applies here too: every field below is one the
// schema holds, so a blank one is genuinely a record to correct.

import { manilaLongDate } from '../../documents/documentData'
import { SIGNATORY_PLACEHOLDER } from '../../documents/documentConfig'
import {
  kpAttendanceLabel,
  kpHearingDate,
  kpHearingTime,
  kpProceedingTypeLabel,
} from '../kpCaseLabels'

const text = (value) => String(value ?? '').trim()

export const KP_DOCUMENT_KINDS = Object.freeze({
  summons: {
    key: 'summons',
    // ⚠️ "System template", and the title says so. Calling this sheet
    // "Summons" alone would present it as the barangay's own instrument.
    title: 'SUMMONS — SYSTEM TEMPLATE',
    displayName: 'Summons',
  },
  notice: {
    key: 'notice',
    title: 'HEARING / MEDIATION NOTICE — SYSTEM TEMPLATE',
    displayName: 'Hearing / mediation notice',
  },
})

export const buildKpNoticeData = ({ kpCase, hearing, parties, panel, now = new Date() }) => {
  const missing = []

  const caseReference = text(kpCase?.reference)
  if (!caseReference) missing.push('the KP case reference is missing')

  const hearingDate = kpHearingDate(hearing?.hearing_date)
  if (!hearingDate) missing.push('the proceeding date is missing from the record')

  const startTime = kpHearingTime(hearing?.start_time)
  if (!startTime) missing.push('the proceeding start time is missing from the record')

  const location = text(hearing?.location)
  if (!location) missing.push('the proceeding location is missing from the record')

  const proceeding = kpProceedingTypeLabel(hearing?.proceeding_type)
  if (!proceeding) missing.push('the proceeding type is missing from the record')

  // ⚠️ RECORDED NAMES, GROUPED BY RECORDED ROLE. A party's CONTACT
  // NUMBER is deliberately absent: `kp_hearing_attendance_for` does not
  // return one and `kp_case_parties_for` does not either, so there is
  // none to print. P3-A withholds a respondent's contact from the
  // complainant, and a sheet that may be handed to either party is the
  // last place to undo that.
  const grouped = (role) => (Array.isArray(parties) ? parties : [])
    .filter((p) => p?.party_role === role)
    .map((p) => text(p.party_name))
    .filter(Boolean)

  const complainants = grouped('complainant')
  const respondents = grouped('respondent')
  const witnesses = grouped('witness')

  if (!complainants.length && !respondents.length) {
    missing.push('no party is recorded on this case')
  }

  return {
    caseReference,
    complaintReference: text(kpCase?.complaint_reference),
    caseStatus: text(kpCase?.status),
    proceeding,
    hearingDate,
    startTime,
    location,
    complainants,
    respondents,
    witnesses,
    // ⚠️ A recorded panel is an administrative record, and the sheet
    // prints it only when one exists. An empty panel prints nothing
    // rather than an empty heading, which would read as a body that
    // failed to load.
    panel: (Array.isArray(panel) ? panel : []).map((m) => ({
      name: text(m.member_name),
      role: text(m.panel_role),
    })).filter((m) => m.name),
    attendance: (Array.isArray(hearing?.attendance) ? hearing.attendance : [])
      .map((a) => ({
        name: text(a.party_name),
        state: kpAttendanceLabel(a.attendance),
      })),
    // ⚠️ THE GENERATION DATE, LABELLED AS SUCH. 043 records when a
    // hearing was scheduled and when an outcome was recorded; it does
    // not record when a notice was issued, because nothing issues one.
    // So the sheet says "Date generated", exactly as X6's six do.
    issueDate: manilaLongDate(now),
    issueDateBasis: 'generated',
    signatory: SIGNATORY_PLACEHOLDER,
    missing,
  }
}

export const kpMissingMessages = (data) => (data?.missing || []).map(
  (what) => `Cannot generate this document: ${what}. Correct the case record through the existing workflow, then generate the document again.`
)
