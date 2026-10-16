import { DocumentShell, DocumentFields, PrototypeProse } from '../../documents/DocumentShell'
import { KP_DOCUMENT_KINDS } from './kpNoticeData'
import { kpPanelRoleLabel } from '../kpCaseLabels'

// The two KP sheets, from ONE component.
//
// ⚠️ ONE TEMPLATE SERVING BOTH, because a summons and a hearing notice
// carry the SAME factual block — which case, which proceeding, when,
// where, and who is recorded as a party. Two files would be two places
// for that block to drift, and the barangay has supplied the wording of
// neither, so there is no verified difference to encode yet. The title
// and one prototype paragraph are all that differ. When the real forms
// arrive and genuinely differ, splitting this is a mechanical change to
// one file.
//
// ─── ⚠️ WHAT THIS SHEET DOES NOT CONTAIN ──────────────────────────────
//
//   * no seal of its own — the mark in the header is the project's
//     existing `logo.png`, the same asset the public navbar renders;
//     no government seal is generated, altered or redrawn
//   * no signature image, and no official's name: the signatory is
//     `[AUTHORIZED SIGNATORY]` / `[POSITION]` over a rule, because this
//     repository establishes no signing authority for either document
//   * no statutory or legal wording: no "you are hereby required", no
//     penalty for non-appearance, no period, no deadline, no authority
//     cited, no consequence asserted
//   * no claim to be an official form. `DOCUMENT_TEMPLATE_MODE` is
//     `'prototype'`, so `DocumentShell` prints the watermark, the banner
//     and the footer disclaimer, and the TITLE itself says SYSTEM
//     TEMPLATE — which survives even a premature flip of that constant
//
// ⚠️ IT READS NOTHING. Everything arrives as `data` from
// `buildKpNoticeData`, which is pure. A test asserts this file imports
// no Supabase client, calls no `fetch`, and uses no `useEffect`.

const nameList = (names) => (names.length ? names.join(', ') : '')

export const KpNoticeTemplate = ({ kind, data }) => {
  // ⚠️ `hasOwnProperty`, NOT A BARE LOOKUP, and that is a real defect of
  // mine that a test caught. `KP_DOCUMENT_KINDS['constructor']` resolves
  // through the prototype chain to `Object.prototype.constructor` -- a
  // function, which is truthy, so `|| KP_DOCUMENT_KINDS.notice` never
  // fired and the sheet rendered with an EMPTY TITLE. A blank title on a
  // printed page reads as a document that failed to generate.
  //
  // `Object.freeze` does not remove the prototype chain, which is the
  // trap: the object looks closed. The same lesson `officialPhotos`
  // records, where a bare lookup reported a portrait for an official
  // named `toString`.
  const document = Object.prototype.hasOwnProperty.call(KP_DOCUMENT_KINDS, kind)
    ? KP_DOCUMENT_KINDS[kind]
    : KP_DOCUMENT_KINDS.notice

  return (
    <DocumentShell
      title={document.title}
      reference={data.caseReference}
      issueDate={data.issueDate}
      signatory={data.signatory}
    >
      {/* ⚠️ FACTUAL ROWS ONLY, and a row with no value is dropped
          entirely rather than printed empty — `DocumentFields`' own rule,
          and the reason `EventDetails` omits the whole Time row rather
          than leaving a label with nothing after it. */}
      <DocumentFields
        rows={[
          { label: 'KP case reference', value: data.caseReference },
          { label: 'Complaint reference', value: data.complaintReference },
          { label: 'Proceeding', value: data.proceeding },
          { label: 'Date', value: data.hearingDate },
          { label: 'Start time', value: data.startTime },
          { label: 'Place', value: data.location },
          { label: 'Complainant', value: nameList(data.complainants) },
          { label: 'Respondent', value: nameList(data.respondents) },
          { label: 'Witness', value: nameList(data.witnesses) },
        ]}
      />

      {/* ⚠️ The recorded panel prints only when one exists, and it is
          labelled as a RECORDED roster rather than a constituted panel —
          this system holds no Lupon membership list, and a sheet that
          implied otherwise would assert something nobody has confirmed. */}
      {data.panel.length > 0 && (
        <DocumentFields
          rows={data.panel.map((member, index) => ({
            label: index === 0
              ? 'Recorded panel (requires barangay confirmation)'
              : `Recorded panel — ${kpPanelRoleLabel(member.role)}`,
            value: index === 0
              ? `${member.name} (${kpPanelRoleLabel(member.role)})`
              : member.name,
          }))}
        />
      )}

      {/* ⚠️ Attendance prints only on a sheet generated AFTER it was
          recorded, and only as the words the barangay recorded. Nothing
          here attaches a consequence to "Did not appear". */}
      {data.attendance.length > 0 && (
        <DocumentFields
          rows={data.attendance.map((entry) => ({
            label: `Attendance — ${entry.name}`,
            value: entry.state,
          }))}
        />
      )}

      <PrototypeProse>
        {kind === 'summons'
          ? 'This sheet is a system-generated template. It reproduces the proceeding details recorded for this case so they can be read on paper. Barangay Batinguel has not supplied the wording of its own summons, so no required-attendance text, authority or consequence is stated here, and none is implied. The barangay issues and serves its own summons; this layout is for system development and review only.'
          : 'This sheet is a system-generated template. It reproduces the proceeding details recorded for this case so they can be read on paper. Barangay Batinguel has not supplied the wording of its own hearing or mediation notice, so no required-attendance text, authority or consequence is stated here, and none is implied. The barangay issues its own notice; this layout is for system development and review only.'}
      </PrototypeProse>
    </DocumentShell>
  )
}

export default KpNoticeTemplate
