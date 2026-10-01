import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaEllipsisV } from 'react-icons/fa'
import './ActionMenu.css'

// A ⋮ overflow menu for secondary row actions.
//
// ─── WHERE THIS MAY AND MAY NOT BE USED ───────────────────────────────
//
// Six places: the nurse's medicine list, and five Official Portal
// tables -- Announcements, Events, Waste Management, Voter Reference
// List and Officials Directory. The medicine row carried five controls
// -- three availability buttons plus Edit and Remove -- and the three
// availability buttons are the whole point of that screen, so the two
// that are not stay visible and the two that are occasional move in
// here. The five tables carry only Edit/Delete-shaped management
// actions, which is the same shape.
//
// ⚠️ It is NOT a general replacement for row buttons. Two things used
// to decide where it could go; ONE IS NOW SOLVED and one still stands:
//
//   1. **A primary decision must never be hidden behind it.** Verify,
//      Reject and Not a Resident on the Residents tab are the reason an
//      official opened that tab; an extra click before each is a cost
//      with no benefit. Same for Approve/Decline on reservations and
//      document requests.
//
//      ⚠️ THIS IS WHY DOCUMENT REQUESTS HAS NO ⋮ MENU, although it was
//      asked for by name. Its action cell holds nothing but the
//      Secretary's primary decisions: Approve and Decline at
//      `pending`, and a single `Mark Ready` or `Mark Claimed`
//      otherwise. A one-button cell behind a ⋮ is strictly worse than
//      the button. Same for the Reservations queue, the overview's
//      pending list, the Residents tab, Archived Officials (one
//      Restore) and the Activity Log (no actions at all).
//   2. **`.table-wrapper` clips an absolutely-positioned menu.** It has
//      `overflow-x: auto` and `overflow-y: auto`, and an overflow
//      container clips absolute descendants. Measured: a menu in a
//      table's action cell ended 69px past the wrapper and
//      `elementFromPoint` at its centre returned `.dashboard-main` --
//      not painted at all.
//
//      ⚠️ THIS IS NOW SOLVED, by `portal`, rather than being a reason
//      not to use the menu in a table. Pass `portal` and the popup is
//      rendered into <body> with `position: fixed`, measured from the
//      trigger. The medicine list is a card list with no clipping
//      ancestor, so it keeps the simpler absolute anchoring and its
//      behaviour is unchanged.
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
const ActionMenu = ({ items = [], label = 'More actions', portal = false }) => {
  const [open, setOpen] = useState(false)
  // Where to draw the popup when `portal` is set. Measured from the
  // trigger at open time; null until then.
  const [anchor, setAnchor] = useState(null)
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

  // ── Portal anchoring ───────────────────────────────────────────────
  //
  // Measured once per open, from the trigger's viewport rect, and used
  // with `position: fixed`. The menu is right-aligned to the trigger,
  // and flips ABOVE it when there is not enough room below -- a row near
  // the bottom of a long table would otherwise open a menu off-screen.
  //
  // It does not follow the trigger afterwards, and does not need to: the
  // scroll listener below closes the menu, which is the behaviour this
  // component already had.
  useEffect(() => {
    if (!open || !portal) { setAnchor(null); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const MENU_WIDTH = 180
    const ESTIMATED_HEIGHT = 44 * items.length + 12
    const GAP = 6
    const roomBelow = window.innerHeight - rect.bottom
    const flipUp = roomBelow < ESTIMATED_HEIGHT + GAP && rect.top > roomBelow
    setAnchor({
      // Right-aligned, then clamped so a trigger near the left edge
      // cannot push the menu off the other side.
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      top: flipUp ? undefined : rect.bottom + GAP,
      bottom: flipUp ? window.innerHeight - rect.top + GAP : undefined,
    })
  }, [open, portal, items.length])

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

  const popup = (
    <div
      className={`action-menu-list${portal ? ' is-portal' : ''}`}
      id={menuId}
      role="menu"
      ref={menuRef}
      style={portal && anchor ? anchor : undefined}
    >
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
  )

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

      {open && (portal ? createPortal(popup, document.body) : popup)}
    </div>
  )
}

export default ActionMenu
