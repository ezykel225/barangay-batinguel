import { useEffect, useMemo, useRef, useState } from 'react'
import './ConfirmDialog.css'
import './OfficialArchiveDialog.css'

// The two dialogs the officials archive needs.
//
// ─── WHY NOT useConfirm() ─────────────────────────────────────────────
// `ConfirmDialog` is a stable shared component guarding eight destructive
// actions across two dashboards. Both dialogs here need a form field --
// an optional reason, and a display-order picker with live validation --
// and widening `ConfirmDialog` to carry arbitrary inputs would put those
// eight flows at risk for the benefit of two. So these are dedicated,
// and they reuse `ConfirmDialog.css` for the shell and buttons so they
// are visually identical rather than merely similar.
//
// ─── ACCESSIBILITY ────────────────────────────────────────────────────
// `DialogShell` below reproduces ConfirmDialog's behaviour exactly:
// role="dialog" with aria-modal and a labelled title, Escape to close,
// Tab trapped inside, body scroll locked, focus moved in on open and
// returned to whatever opened it on close, and a backdrop that can only
// ever cancel. It is factored into one shell rather than written twice,
// because an accessibility fix applied to one copy and not the other is
// how these things rot.
//
// The one deliberate difference from ConfirmDialog: focus lands on the
// FIRST FIELD rather than on Cancel. These dialogs exist to collect a
// value, and a keyboard user should arrive where they can type. Enter
// still cannot trigger the destructive action from a text field, because
// neither dialog is a <form> and neither action button is a submit.

const DialogShell = ({
  open,
  titleId,
  title,
  children,
  actions,
  busy,
  onCancel,
  initialFocusRef,
}) => {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    initialFocusRef?.current?.focus()

    // Captured now rather than read in the cleanup: by the time cleanup
    // runs the ref may point somewhere else, and focus would land on the
    // wrong element or nothing at all.
    const restoreTo = previouslyFocused.current
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
    }
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onCancel()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  if (!open) return null

  return (
    <div
      className="confirm-overlay"
      // The backdrop can only ever dismiss, never confirm.
      onClick={() => { if (!busy) onCancel() }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-dialog-title" id={titleId}>{title}</h3>
        {children}
        <div className="confirm-dialog-actions">{actions}</div>
      </div>
    </div>
  )
}

// ── Archive ───────────────────────────────────────────────────────────
// The wording is deliberate. "Removed from the current directory" is what
// the official is actually doing; "kept as barangay history" and "can be
// restored" are the two things that make this different from the
// permanent Delete it replaces. The old dialog promised the record "cannot
// be recovered", which is no longer true -- a confirmation that lies is
// worse than none.
export const ArchiveOfficialDialog = ({ official, busy, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('')
  const reasonRef = useRef(null)

  // A fresh reason per official, so a cancelled archive cannot leak its
  // text into the next one.
  useEffect(() => { setReason('') }, [official?.id])

  if (!official) return null

  return (
    <DialogShell
      open
      titleId="archive-official-title"
      title="Archive this official?"
      busy={busy}
      onCancel={onCancel}
      initialFocusRef={reasonRef}
      actions={(
        <>
          <button
            type="button"
            className="confirm-dialog-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Archive official'}
          </button>
        </>
      )}
    >
      <p className="confirm-dialog-message">
        <strong>{official.full_name}</strong>
        {official.position ? ` (${official.position})` : ''} will be removed
        from the current directory and from the public Officials page.
      </p>
      <p className="confirm-dialog-message">
        Their record is <strong>kept as barangay history</strong> and can be
        <strong> restored later</strong>. Their photo is not deleted.
      </p>

      <label className="archive-field-label" htmlFor="archive-reason">
        Reason <span className="archive-field-optional">(optional)</span>
      </label>
      <textarea
        id="archive-reason"
        className="archive-field-input"
        rows={2}
        maxLength={300}
        placeholder="e.g. term ended, resigned"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={busy}
        ref={reasonRef}
      />
      <p className="archive-field-help">
        Recorded in the Activity Log alongside who archived the record and
        when. Left blank, nothing is recorded beyond the action itself.
      </p>
    </DialogShell>
  )
}

// ── Restore ───────────────────────────────────────────────────────────
// Two shapes in one dialog. With no conflict it is a plain confirmation.
// With a conflict the restore is BLOCKED until a free display order is
// chosen: no existing active official is ever moved to make room, and
// nothing is renumbered silently.
//
// `takenOrders` is the set of display_order values currently held by
// ACTIVE officials. Validation runs against it on every keystroke, and
// again in the handler before the write, because the list could have
// changed in another tab while this dialog sat open.
export const RestoreOfficialDialog = ({
  official,
  takenOrders,
  occupiedBy,
  busy,
  onConfirm,
  onCancel,
}) => {
  const taken = useMemo(() => new Set(takenOrders ?? []), [takenOrders])
  const originalOrder = official?.display_order ?? null
  const hasConflict = originalOrder !== null && taken.has(originalOrder)

  // The lowest free positive integer, offered as a SUGGESTION. Nothing is
  // written until the official accepts or changes it.
  const suggestedOrder = useMemo(() => {
    let candidate = 1
    while (taken.has(candidate)) candidate += 1
    return candidate
  }, [taken])

  const [order, setOrder] = useState('')
  const orderRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    if (!official) return
    setOrder(hasConflict ? String(suggestedOrder) : String(originalOrder ?? suggestedOrder))
  }, [official, hasConflict, suggestedOrder, originalOrder])

  if (!official) return null

  const parsed = Number(order)
  const isPositiveInteger = Number.isInteger(parsed) && parsed > 0
  const collides = isPositiveInteger && taken.has(parsed)
  const canRestore = isPositiveInteger && !collides

  let validationMessage = ''
  if (order.trim() === '') validationMessage = 'Enter a display order.'
  else if (!isPositiveInteger) validationMessage = 'Display order must be a whole number greater than 0.'
  else if (collides) validationMessage = `Position ${parsed} is already taken by an active official.`

  return (
    <DialogShell
      open
      titleId="restore-official-title"
      title={hasConflict ? 'Choose a display order to restore this official' : 'Restore this official?'}
      busy={busy}
      onCancel={onCancel}
      initialFocusRef={hasConflict ? orderRef : restoreRef}
      actions={(
        <>
          <button
            type="button"
            className="confirm-dialog-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm"
            onClick={() => onConfirm(parsed)}
            disabled={busy || !canRestore}
            ref={restoreRef}
          >
            {busy ? 'Working…' : 'Restore official'}
          </button>
        </>
      )}
    >
      {hasConflict ? (
        <>
          <p className="confirm-dialog-message">
            <strong>{official.full_name}</strong> was at position
            <strong> {originalOrder}</strong>, which is now used by
            <strong> {occupiedBy || 'another active official'}</strong>.
          </p>
          <p className="confirm-dialog-message">
            Existing officials <strong>will not be moved</strong>. Choose a
            display order for {official.full_name}.
          </p>
        </>
      ) : (
        <p className="confirm-dialog-message">
          <strong>{official.full_name}</strong>
          {official.position ? ` (${official.position})` : ''} will return to
          the current directory and to the public Officials page, with every
          detail and their photo as stored.
        </p>
      )}

      <label className="archive-field-label" htmlFor="restore-order">
        Display order
      </label>
      <input
        id="restore-order"
        className={`archive-field-input${validationMessage ? ' has-error' : ''}`}
        type="number"
        min={1}
        step={1}
        value={order}
        onChange={(event) => setOrder(event.target.value)}
        disabled={busy}
        ref={orderRef}
        aria-describedby="restore-order-help"
        aria-invalid={validationMessage ? 'true' : undefined}
      />
      <p className="archive-field-help" id="restore-order-help" role="status">
        {validationMessage
          ? validationMessage
          : `Position ${parsed} is free. Lower numbers appear first.`}
      </p>
    </DialogShell>
  )
}
