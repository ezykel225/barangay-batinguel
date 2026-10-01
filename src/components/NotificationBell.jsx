import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { FaBell, FaCheck } from 'react-icons/fa'
import {
  isUnread,
  notificationBody,
  notificationTitle,
  relativeTime,
  sortNotifications,
  unreadCount,
} from '../utils/notificationLabels'
import './NotificationBell.css'

// The notification bell, shared by the Resident and Official portals.
//
// ─── WHAT IT IS NOT GIVEN ─────────────────────────────────────────────
//
// No Supabase import. It takes the notifications, the set of read ids
// and three callbacks, exactly as ActionMenu and ConfirmDialog take
// their data -- which is why this has unit tests that run without the
// environment variables App.test.js needs. The dashboards own the
// fetching.
//
// ⚠️ THERE IS NO NURSE BELL, and that is a decision rather than an
// omission. Her work -- medicine stock, clinic hours, health events --
// has no asynchronous decision waiting on anybody else, so a bell would
// be permanently empty. If a nurse workflow ever gains one, it needs a
// nurse audience in migration 022 first.
//
// ─── ACCESSIBILITY ────────────────────────────────────────────────────
//
// The trigger is a real button with `aria-haspopup="dialog"` and
// `aria-expanded`. The unread count is in the accessible name as words
// ("Notifications, 3 unread"), not only as a number in a coloured
// circle, so it is not conveyed by colour or by position alone.
//
// Escape closes and returns focus to the bell; so does clicking outside,
// except that clicking elsewhere does NOT steal focus back, for the
// reason ActionMenu gives -- the person is clicking somewhere else on
// purpose.
//
// ⚠️ READ AND UNREAD ARE NOT DISTINGUISHED BY COLOUR ALONE. An unread
// item carries a left bar AND bolder text AND the word "New" in its
// accessible name. A reader who cannot see the tint still gets all
// three.
const NotificationBell = ({
  notifications = [],
  readIds = new Set(),
  onOpenTab,
  onMarkRead,
  onMarkAllRead,
  loading = false,
}) => {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  const sorted = sortNotifications(notifications)
  const unread = unreadCount(notifications, readIds)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (triggerRef.current?.contains(event.target)) return
      // No focus restore -- see the header.
      close(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close(true)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  // Opening the panel is what counts as looking at the list, so focus
  // lands on it and a screen reader announces the heading rather than
  // leaving the reader on a button whose label just changed.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  const handleSelect = (notification) => {
    // Mark first, then navigate: the panel unmounts on navigation, and a
    // handler that runs after it is gone would be writing into nothing.
    if (isUnread(notification, readIds)) onMarkRead?.(notification)
    close(false)
    if (notification.link_tab) onOpenTab?.(notification.link_tab, notification)
  }

  return (
    <div className="notif-bell">
      <button
        type="button"
        ref={triggerRef}
        className="notif-bell-trigger"
        onClick={() => (open ? close(true) : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : 'Notifications, none unread'
        }
      >
        <FaBell aria-hidden="true" />
        {unread > 0 && (
          <span className="notif-bell-count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notif-panel"
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Notifications"
          tabIndex={-1}
        >
          <div className="notif-panel-head">
            <h2>Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                className="notif-mark-all"
                onClick={() => onMarkAllRead?.()}
              >
                <FaCheck aria-hidden="true" /> Mark all as read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {loading ? (
              <p className="notif-empty">Loading notifications...</p>
            ) : sorted.length === 0 ? (
              /* The empty state says nothing has happened yet, not that
                 something is broken -- a panel that renders nothing at
                 all cannot be told apart from one that failed, which was
                 the mistake in migration 018's first Archived Officials
                 cut. */
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              sorted.map((n) => {
                const fresh = isUnread(n, readIds)
                const title = notificationTitle(n)
                const body = notificationBody(n)
                const when = relativeTime(n.created_at)
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={`notif-item${fresh ? ' notif-item-unread' : ''}`}
                    onClick={() => handleSelect(n)}
                    aria-label={[fresh ? 'New.' : '', title, body, when]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="notif-item-title">{title}</span>
                    {body && <span className="notif-item-body">{body}</span>}
                    <span className="notif-item-when">{when}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
