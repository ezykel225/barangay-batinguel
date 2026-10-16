import { useMemo } from 'react'
import { FaPrint, FaArrowLeft } from 'react-icons/fa'
import { useModalA11y } from '../../components/useModalA11y'
import { PROTOTYPE_WATERMARK, isPrototypeMode } from '../../documents/documentConfig'
import { buildKpNoticeData, kpMissingMessages, KP_DOCUMENT_KINDS } from './kpNoticeData'
import KpNoticeTemplate from './KpNoticeTemplate'
import '../../documents/DocumentPreview.css'
import '../../documents/print/DocumentPrint.css'
import '../KpCase.css'

// The preview, as a modal over the case file. X6's `DocumentPreview`
// shape, deliberately: the same toolbar, the same blocking warnings
// outside the sheet, the same `.doc-preview-scale` wrapper, the same
// `window.print()`, the same `useModalA11y`.
//
// ⚠️ A SEPARATE COMPONENT RATHER THAN A SIXTH DOCUMENT TYPE. X6's
// preview is driven by `documentRegistry`, which maps a
// `document_requests.document_type` to a template and carries
// `canGenerate`'s three gates — a Secretary, a request status, and a
// configured template. A KP notice is none of those things: it has no
// document request, no requester and a different authorization question,
// so registering it there would mean teaching the registry about cases.
// The PRINT ARCHITECTURE is shared; the registry is not.
//
// ⚠️ IT READS NOTHING. The case, the hearing, the parties and the panel
// are passed in — the panel above already loaded them through 043's
// gated readers — so this component makes no Supabase call, opens no
// second data source and cannot widen what the database allows. A test
// asserts it imports no client.
//
// ⚠️ NOTHING HERE IS EDITABLE, and nothing it does changes a record.
// Generating and printing write nothing: no status moves, no hearing is
// marked, no outcome is recorded, and no `activity_log` entry is filed.
// A wrong date is corrected on the HEARING through the existing
// authorized workflow, or the paper and the record disagree and only the
// paper leaves the building.

export const KpNoticePreview = ({ kind, kpCase, hearing, parties, panel, open, onClose }) => {
  // ⚠️ `now` is captured per hearing, not per render — X6's reason: the
  // printed date would otherwise be recomputed on every re-render, which
  // is harmless today and stops being harmless at midnight.
  const data = useMemo(
    () => buildKpNoticeData({ kpCase, hearing, parties, panel }),
    [kpCase, hearing, parties, panel],
  )

  useModalA11y(Boolean(open), onClose)

  if (!open || !kpCase || !hearing) return null

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
  const blockers = kpMissingMessages(data)

  return (
    <div className="modal-overlay doc-preview-overlay">
      <div
        className="modal doc-preview kp-doc-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kp-notice-preview-title"
      >
        <div className="doc-preview-bar no-print">
          <button type="button" className="doc-preview-back" onClick={onClose}>
            <FaArrowLeft aria-hidden="true" /> Back to case
          </button>

          <h2 id="kp-notice-preview-title" className="doc-preview-title">
            {document.displayName} — {data.caseReference || 'KP case'}
          </h2>

          {isPrototypeMode() && (
            <span className="doc-preview-chip">{PROTOTYPE_WATERMARK.heading}</span>
          )}

          <button
            type="button"
            className="doc-preview-print"
            onClick={() => window.print()}
            disabled={blockers.length > 0}
          >
            <FaPrint aria-hidden="true" /> Print
          </button>
        </div>

        {/* ⚠️ WARNINGS LIVE OUTSIDE THE DOCUMENT. A missing proceeding
            date is never filled with a dash inside a field that looks
            official; it is reported here and printing is refused. */}
        {blockers.length > 0 && (
          <div className="doc-preview-blockers no-print" role="alert">
            {blockers.map((message) => <p key={message}>{message}</p>)}
          </div>
        )}

        {/* `tabIndex={0}` because this element SCROLLS: an A4 sheet is
            1123px tall and the stage rarely is, so a keyboard user could
            not reach it at all — axe's `scrollable-region-focusable`. */}
        <div
          className="doc-preview-stage"
          tabIndex={0}
          role="group"
          aria-label="Document preview"
        >
          {blockers.length === 0 && (
            <div className="doc-preview-scale">
              <KpNoticeTemplate kind={document.key} data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default KpNoticePreview
