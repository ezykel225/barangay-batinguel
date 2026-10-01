import { useEffect, useRef } from 'react'

// Escape, focus entry and focus restoration for the app's hand-rolled
// modals.
//
// ─── WHY THIS EXISTS ──────────────────────────────────────────────────
//
// The shared `useConfirm` dialog and `OfficialArchiveDialog` have had
// `role="dialog"`, `aria-modal`, Escape and focus restoration all along.
// The other seventeen modals -- every Add/Edit form in the three
// dashboards, the Login reset-password box and the Footer's Privacy and
// Terms boxes -- had **none of it**: no role, no aria-modal, no Escape
// key, and focus left sitting on the button that opened them, behind the
// overlay. A keyboard user could open one and then tab straight out of
// it into the page underneath.
//
// ⚠️ ONE CALL PER COMPONENT, NOT ONE PER MODAL.
//
// These modals are mutually exclusive -- a dashboard never shows two at
// once -- so the hook takes "is any modal open" and a single close
// action. That is what makes this a four-line change in a 4,600-line
// dashboard instead of nine separate wirings, each with its own ref to
// thread through JSX that is already deeply nested.
//
// It finds the open dialog in the DOM rather than taking a ref, for the
// same reason. The selector matches the three overlay classes this app
// uses; a modal that does not use one of them gets nothing, which is
// visible rather than silent because its Escape key simply will not
// work.
const DIALOG_SELECTOR = [
  '.modal-overlay [role="dialog"]',
  '.login-modal-overlay [role="dialog"]',
  '.footer-modal-overlay [role="dialog"]',
].join(', ')

export const useModalA11y = (open, onClose) => {
  // Where focus was before the modal opened, so it can go back there.
  const returnTo = useRef(null)
  // Kept in a ref so changing the callback does not re-run the effect
  // and re-steal focus while the user is typing in the form.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    returnTo.current = document.activeElement

    // After paint: the dialog is not in the DOM yet on the tick the
    // state flips.
    const id = window.requestAnimationFrame(() => {
      const dialog = document.querySelector(DIALOG_SELECTOR)
      if (!dialog) return
      // Prefer the first real control, so a keyboard user lands on
      // something they can act on rather than on the container. Falls
      // back to the dialog itself, which carries tabIndex={-1}.
      const first = dialog.querySelector(
        'input:not([type="hidden"]), select, textarea, button, [href]'
      )
      ;(first || dialog).focus?.()
    })

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKeyDown)
      // Put focus back where it came from, if that element is still on
      // the page. A re-render can replace it -- a row that was deleted,
      // for instance -- and focusing a detached node silently sends
      // focus to <body>.
      const target = returnTo.current
      if (target && document.contains(target)) target.focus?.()
      returnTo.current = null
    }
  }, [open])
}

export default useModalA11y
