import { useCallback, useEffect, useRef, useState } from 'react'
import './ConfirmDialog.css'

// A confirmation dialog for destructive actions, and the hook that
// drives it.
//
// ─── WHY A HOOK WITH A PROMISE ────────────────────────────────────────
// `confirm()` resolves to true or false, so a call site reads exactly
// like the window.confirm it replaces:
//
//   const ok = await confirm({ title, message, confirmLabel })
//   if (!ok) return
//
// That matters here: the handlers this guards sit on top of the
// per-row processing locks (processingReservationIds and friends).
// Restructuring them into callback-style props would risk those locks,
// and a lock that stops working reintroduces double-approval. One
// early return is the smallest possible change.
//
// ─── WHY IT IS NOT window.confirm ─────────────────────────────────────
// window.confirm cannot be styled, reads as a browser security warning,
// and on some mobile browsers offers to suppress future dialogs -- which
// would silently disable the guard. Three calls remain in the codebase
// (a resident cancelling a booking, a resident renaming a verified
// account, and the nurse removing a medicine); they are deliberately
// left alone in this phase so this component is proven on the eight
// actions that had NO confirmation at all before migrating them.
//
// ─── ACCESSIBILITY ────────────────────────────────────────────────────
// The previous audit found three modal implementations in this codebase
// with no Escape handling, no focus trap and no role="dialog" -- a
// keyboard user could tab straight out behind an open modal and had no
// way to close it. This one:
//   - is role="dialog" with aria-modal and a labelled title
//   - closes on Escape
//   - traps Tab inside itself
//   - focuses Cancel on open, not Confirm, so a stray Enter cancels
//     rather than deletes
//   - returns focus to whatever opened it
// It is the pattern the other three should follow later.

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const previouslyFocused = useRef(null)

  // Remember what had focus, move focus into the dialog, and put it
  // back on close. Without the restore, closing the dialog drops the
  // keyboard user at the top of the document.
  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    // Cancel, not Confirm: Enter on a freshly opened destructive
    // dialog should not delete anything.
    cancelRef.current?.focus()

    const restoreTo = previouslyFocused.current
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
    }
  }, [open])

  // Escape closes; Tab cycles within the dialog.
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
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

  // Stop the page behind scrolling while the dialog is up. Noticeable
  // on phones, where the page would otherwise move under the overlay.
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
      // Clicking the backdrop cancels. Safe: the backdrop can only ever
      // dismiss, never confirm.
      onClick={() => { if (!busy) onCancel() }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-dialog-title" id="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message" id="confirm-dialog-message">{message}</p>

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-cancel"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'confirm-dialog-confirm destructive' : 'confirm-dialog-confirm'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Returns [confirm, dialog]. Render `dialog` once anywhere in the
// component; call `confirm(options)` and await the answer.
export const useConfirm = () => {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current = resolve
    setState(options)
  }), [])

  const settle = useCallback((answer) => {
    // Clear the resolver before resolving so a double-click on Confirm
    // cannot resolve the same promise twice.
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    if (resolve) resolve(answer)
  }, [])

  const dialog = (
    <ConfirmDialog
      open={state !== null}
      title={state?.title ?? ''}
      message={state?.message ?? ''}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      destructive={state?.destructive ?? true}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return [confirm, dialog]
}

export default ConfirmDialog
