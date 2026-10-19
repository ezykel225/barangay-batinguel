import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { tanodStateLabel } from './tanodLabels'

const focusable = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'

export default function TanodManageDialog({ member, linked, onClose, editAction, children }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    const openerId = 'tnd-manage-' + member.id
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.querySelector('button')?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const controls = [...dialog.querySelectorAll(focusable)]
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    const onFocus = (event) => {
      if (!dialog.contains(event.target)) (dialog.querySelector(focusable) || dialog).focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocus)
      document.body.style.overflow = overflow
      // A roster refresh can replace the original row while this dialog stays open.
      const target = document.getElementById(openerId) || opener
      if (target && document.contains(target)) target.focus()
    }
  }, [member.id])
  const nameParts = member.full_name.trim().split(/\s+/).filter(Boolean)
  const initials = (nameParts[0]?.[0] || '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')
  return createPortal(<div className="tnd-operations tnd-modal-backdrop">
    <section id="tnd-management-dialog" className="tnd-manage-dialog" role="dialog" aria-modal="true" aria-labelledby="tnd-manage-title tnd-manage-name" tabIndex={-1} ref={dialogRef}>
      <header className="tnd-manage-header">
        <div className="tnd-manage-topline"><h2 id="tnd-manage-title">Manage Tanod</h2><button type="button" className="btn-cancel" aria-label="Close Manage Tanod" onClick={onClose}>&times;</button></div>
        <div className="tnd-profile-header">
          <span className="tnd-profile-avatar" aria-hidden="true">{initials.toLocaleUpperCase()}</span>
          <div className="tnd-profile-info"><p id="tnd-manage-name">{member.full_name}</p><span className="tnd-profile-role">Barangay Tanod</span>
            <div className="tnd-toolbar"><span className={'kp-badge kp-badge-' + (member.active ? 'open' : 'concluded')}>{tanodStateLabel(member.active)}</span><span className={'kp-badge' + (linked ? ' kp-badge-open' : '')}>{linked === null ? 'Account not confirmed' : linked ? 'Account linked' : 'Not linked'}</span></div>
          </div>
          <div className="tnd-profile-edit">{editAction}</div>
        </div>
      </header>
      <div className="tnd-manage-body">{children}</div>
      <footer className="tnd-manage-footer"><button type="button" className="btn-cancel" onClick={onClose}>Close</button></footer>
    </section>
  </div>, document.body)
}
