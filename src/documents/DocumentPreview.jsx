import { useMemo } from 'react'
import { FaPrint, FaArrowLeft } from 'react-icons/fa'
import { useModalA11y } from '../components/useModalA11y'
import { buildDocumentData, missingFieldMessages } from './documentData'
import { templateFor, UNSUPPORTED_MESSAGE } from './documentRegistry'
import { PROTOTYPE_WATERMARK, isPrototypeMode } from './documentConfig'
import './DocumentPreview.css'
import './print/DocumentPrint.css'

// The Secretary's preview, as a modal over the Document Requests queue.
//
// ⚠️ IT READS NOTHING. The request row is passed in -- the dashboard
// already fetched it under the official SELECT policy -- so this
// component makes no Supabase call, opens no second data source and
// cannot widen what RLS allows. The resident's uploaded ID is not
// touched: an ID is verification material, not document artwork.
//
// ⚠️ NOTHING HERE IS EDITABLE. The document is generated from the
// approved request. A wrong name is corrected on the request through
// the existing authorized workflow, not by typing over the printed
// copy -- otherwise the paper and the record disagree and only the
// paper leaves the building.

export const DocumentPreview = ({ request, open, onClose }) => {
  const entry = templateFor(request?.document_type)

  // ⚠️ `now` is captured per request, not per render. Without the memo
  // the printed date would be recomputed on every keystroke-driven
  // re-render, which is harmless today and exactly the kind of thing
  // that stops being harmless at midnight.
  const data = useMemo(
    () => buildDocumentData(request, {
      documentType: request?.document_type,
      requiredFields: entry?.requiredFields || [],
    }),
    [request, entry],
  )

  // Escape closes, focus enters the dialog, and focus returns to the ⋮
  // item that opened it. The hook the seventeen other modals use.
  useModalA11y(Boolean(open), onClose)

  if (!open || !request) return null

  const blockers = missingFieldMessages(data)
  const Template = entry?.Template || null

  return (
    <div className="modal-overlay doc-preview-overlay">
      <div
        className="modal doc-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-preview-title"
      >
        {/* The toolbar is screen chrome and prints nothing -- see
            DocumentPrint.css, which hides everything but `.doc-page`. */}
        <div className="doc-preview-bar no-print">
          <button type="button" className="doc-preview-back" onClick={onClose}>
            <FaArrowLeft aria-hidden="true" /> Back to request
          </button>

          <h2 id="doc-preview-title" className="doc-preview-title">
            {entry ? entry.displayName : 'Document'} — {request.full_name || 'resident'}
          </h2>

          {isPrototypeMode() && (
            <span className="doc-preview-chip">{PROTOTYPE_WATERMARK.heading}</span>
          )}

          <button
            type="button"
            className="doc-preview-print"
            onClick={() => window.print()}
            disabled={!Template || blockers.length > 0}
          >
            <FaPrint aria-hidden="true" /> Print
          </button>
        </div>

        {/* ⚠️ WARNINGS LIVE OUTSIDE THE DOCUMENT. A missing value is
            never filled with "N/A" inside a field that looks official;
            it is reported here and printing is refused. */}
        {blockers.length > 0 && (
          <div className="doc-preview-blockers no-print" role="alert">
            {blockers.map((message) => <p key={message}>{message}</p>)}
            <p className="doc-preview-blocker-hint">
              Correct the request through the existing workflow, then
              generate the document again.
            </p>
          </div>
        )}

        {/* ⚠️ `tabIndex={0}` because this element SCROLLS. An A4 sheet
            is 1123px tall and the stage rarely is, so a mouse user
            scrolls it and a keyboard user could not reach it at all --
            axe's `scrollable-region-focusable`, measured here at 1280
            rather than guessed at. The label is what the focus then
            announces. */}
        <div
          className="doc-preview-stage"
          tabIndex={0}
          role="group"
          aria-label="Document preview"
        >
          {Template && blockers.length === 0 ? (
            /* The wrapper carries the scaled box on a narrow screen --
               see DocumentPreview.css. The sheet inside keeps its real
               210mm geometry, and print ignores the scale entirely. */
            <div className="doc-preview-scale">
              <Template data={data} />
            </div>
          ) : (
            !Template && (
              <p className="doc-preview-unsupported no-print">
                {UNSUPPORTED_MESSAGE}
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

export default DocumentPreview
