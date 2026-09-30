import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { FaEllipsisV } from 'react-icons/fa'
import './ActionMenu.css'

// A ⋮ overflow menu for secondary row actions.
//
// ─── WHERE THIS MAY AND MAY NOT BE USED ───────────────────────────────
//
// It is used in exactly one place: the nurse's medicine list. That row
// carried five controls -- three availability buttons plus Edit and
// Remove -- and the three availability buttons are the whole point of the
// screen, so the two that are not stay visible and the two that are
// occasional move in here.
//
// ⚠️ It is NOT a general replacement for row buttons, and two things
// decide where it can go at all:
//
//   1. **A primary decision must never be hidden behind it.** Verify,
//      Reject and Not a Resident on the Residents tab are the reason an
//      official opened that tab; an extra click before each is a cost
//      with no benefit. Same for Approve/Decline on reservations and
//      document requests.
//   2. **`.table-wrapper` has `overflow-x: auto`.** Anything positioned
//      absolutely inside a dashboard table is CLIPPED by that, and the
//      rule lives in the protected mobile table-to-card block, which is
//      not ours to change. The medicine list is a card list, not a
//      table, which is why the menu works there. Putting this inside a
//      `.dashboard-table` would need a portal, not a tweak.
//
// ─── ACCESSIBILITY ────────────────────────────────────────────────────
//
// A real button with `aria-haspopup="menu"` and `aria-expanded`, and a
// `role="menu"` whose items are `role="menuitem"` buttons. Escape closes
// and returns focus to the trigger; so does choosing an item, so a
// keyboard user is never left with focus on a removed element. Arrow
// keys, Home and End move between items, which is what a menu role
// promises. Clicking outside closes it, and so does scrolling the page,
// because an absolutely-positioned menu would otherwise drift away from
// the row it belongs to.
//
// `items` is an array of { key, label, icon, onSelect, danger }.
const ActionMenu = ({ items = [], label = 'More actions' }) => {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  // Which item is focused, so the arrow keys have something to move.
  const itemRefs = useRef([])

  const close = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Focus the first item when the menu opens. Without this, opening with
  // the keyboard leaves focus on the trigger and the arrow keys have no
  // starting point.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event) => {
      if (
        menuRef.current?.contains(event.target)
        || triggerRef.current?.contains(event.target)
      ) return
      // No focus restore: the person is clicking somewhere else on
      // purpose, and yanking focus back would fight them.
      close({ restoreFocus: false })
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    // Capture, so a scroll inside the card list closes it too.
    const onScroll = () => close({ restoreFocus: false })

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  const moveFocus = (from, delta) => {
    const count = items.length
    if (count === 0) return
    const next = (from + delta + count) % count
    itemRefs.current[next]?.focus()
  }

  const onItemKeyDown = (event, index) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(index, 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(index, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      itemRefs.current[items.length - 1]?.focus()
    }
  }

  const choose = (item) => {
    // Close first, so focus is back on the trigger before the handler
    // opens a confirmation dialog -- otherwise the dialog's own focus
    // return would send focus to a menu that no longer exists.
    close()
    item.onSelect?.()
  }

  if (items.length === 0) return null

  return (
    <div className="action-menu">
      <button
        type="button"
        className="action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        ref={triggerRef}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          // Opening with ArrowDown is the convention for a menu button,
          // and it lands on the first item via the effect above.
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <FaEllipsisV aria-hidden="true" />
      </button>

      {open && (
        <div className="action-menu-list" id={menuId} role="menu" ref={menuRef}>
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`action-menu-item${item.danger ? ' is-danger' : ''}`}
              ref={(node) => { itemRefs.current[index] = node }}
              onClick={() => choose(item)}
              onKeyDown={(event) => onItemKeyDown(event, index)}
            >
              {item.icon && <span className="action-menu-item-icon">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionMenu
