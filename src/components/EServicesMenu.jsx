import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronDown } from 'react-icons/fa'
import { SERVICE_GROUPS } from '../constants/eServices'
import './EServicesMenu.css'

// The public navbar's E-Services dropdown.
//
// ─── WHY A DISCLOSURE, NOT role="menu" ────────────────────────────────
//
// `ActionMenu` is a role="menu" of role="menuitem" BUTTONS that perform
// an action on a row. This is a list of LINKS that navigate. ARIA's
// menu role promises application-style arrow-key navigation and tells a
// screen reader these are commands, not destinations -- which is wrong
// for navigation and, worse, suppresses the link semantics a screen
// reader user navigates a site by.
//
// So this is the disclosure pattern: a real <button> with
// aria-expanded and aria-controls revealing a real <ul> of <Link>s.
// Tab moves through the links, as it does everywhere else on the site.
//
// ─── WHAT IT COPIES FROM THE REST OF THE PROJECT ──────────────────────
//
// Escape closes and returns focus to the trigger. A click outside
// closes WITHOUT stealing focus back -- the person is clicking
// somewhere else on purpose, the same rule `ActionMenu` and
// `NotificationBell` already follow.
//
// ⚠️ It opens on CLICK, never on hover. A hover-only menu is
// unreachable by keyboard and unusable on a touch screen, and this is
// the way into half the services on the site.
const EServicesMenu = ({ label = 'E-Services', isActive = false }) => {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const close = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (
        panelRef.current?.contains(event.target)
        || triggerRef.current?.contains(event.target)
      ) return
      close({ restoreFocus: false })
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  return (
    <div className="eservices-menu">
      <button
        type="button"
        id={triggerId}
        className={`eservices-trigger${isActive ? ' active' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        ref={triggerRef}
        onClick={() => setOpen((previous) => !previous)}
      >
        {label}
        <FaChevronDown className="eservices-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="eservices-panel"
          id={menuId}
          aria-labelledby={triggerId}
          ref={panelRef}
        >
          {/* The landing page is offered FIRST, so the dropdown is a
              shortcut to the services rather than the only way to
              reach a page that explains them. */}
          <Link
            to="/e-services"
            className="eservices-panel-all"
            onClick={() => close({ restoreFocus: false })}
          >
            All E-Services
          </Link>

          {SERVICE_GROUPS.map((group) => (
            <div className="eservices-group" key={group.access}>
              {/* A real heading, so a screen reader user can tell the
                  two groups apart without reading every item first. */}
              <p className="eservices-group-label" id={`${menuId}-${group.access}`}>
                {group.groupLabel}
              </p>
              <ul className="eservices-list" aria-labelledby={`${menuId}-${group.access}`}>
                {group.services.map((service) => (
                  <li key={service.key}>
                    <Link
                      to={service.to}
                      className="eservices-item"
                      onClick={() => close({ restoreFocus: false })}
                    >
                      <span className="eservices-item-label">{service.label}</span>
                      {/* ⚠️ The access requirement is TEXT, on the item
                          itself, before the click. A resident must not
                          discover an account is needed only after
                          filling in a form. */}
                      <span className="eservices-item-access">{group.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default EServicesMenu
