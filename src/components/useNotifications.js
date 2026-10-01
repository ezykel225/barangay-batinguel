import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { isUnread, unreadByTab, unreadCount } from '../utils/notificationLabels'

// Fetching for the notification bell, and the one definition of unread
// that both the bell and the sidebar badges read.
//
// ⚠️ THE CLIENT NEVER DECIDES WHO SEES WHAT. This selects * from
// `notifications` with no filter at all, because RLS already answers
// that question -- `recipient_id = auth.uid()` or
// `can_see_audience(audience)`, resolved against the live officials
// directory. A `.eq('recipient_id', user.id)` here would look like the
// control and be nothing of the kind: the publishable key ships in the
// bundle, so a filter in this file hides rows from this page and from
// nobody else. Same argument migration 018 made about hiding archived
// officials with a React filter.
//
// ⚠️ NO REALTIME AND NO POLLING. `supabase_realtime` publishes zero
// tables and migration 022 did not change that. The bell refreshes when
// the dashboard refetches -- which every successful action already does
// -- and `refresh()` is exposed so a decision handler can pull the new
// notification in without a reload. Deferred deliberately: a polling
// interval against a shared client is how the getSession() lock problem
// presented, and it is not worth it for a queue an official is already
// looking at.
export const useNotifications = (userId) => {
  const [notifications, setNotifications] = useState([])
  const [readIds, setReadIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)

  // Guards a late response from a previous user overwriting the current
  // one's list after a sign-out and sign-in.
  const latestUser = useRef(userId)
  useEffect(() => { latestUser.current = userId }, [userId])

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotifications([])
      setReadIds(new Set())
      setLoading(false)
      return
    }
    const requestedFor = userId
    try {
      const [listed, marked] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('notification_reads')
          .select('notification_id'),
      ])

      if (latestUser.current !== requestedFor) return

      if (listed.error) {
        console.error('Notifications error:', listed.error)
      } else {
        setNotifications(listed.data || [])
      }
      if (marked.error) {
        console.error('Notification reads error:', marked.error)
      } else {
        setReadIds(new Set((marked.data || []).map((r) => r.notification_id)))
      }
    } catch (err) {
      console.error('Notification fetch error:', err)
    } finally {
      if (latestUser.current === requestedFor) setLoading(false)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  // ⚠️ `.select()` ON EVERY WRITE. RLS filters rows, it does not raise,
  // so an insert this policy refuses would otherwise report success with
  // nothing written. The read mark is also re-checked server-side by
  // trg_stamp_notification_read, which overwrites user_id with the
  // caller's own and refuses a notification the caller cannot see.
  const markRead = useCallback(async (notification) => {
    if (!userId || !notification?.id) return
    // Optimistic: the bar and the count clear immediately, and a refused
    // write puts them back.
    setReadIds((prev) => new Set(prev).add(notification.id))
    const { data, error } = await supabase
      .from('notification_reads')
      .insert({ notification_id: notification.id, user_id: userId })
      .select()
    if (error || !data || data.length === 0) {
      // A duplicate is not a failure -- it means somebody marked it in
      // another tab, and the end state is the one we wanted.
      if (error?.code !== '23505') {
        console.error('Could not mark the notification as read:', error)
        setReadIds((prev) => {
          const next = new Set(prev)
          next.delete(notification.id)
          return next
        })
      }
    }
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    // Only what is in `notifications`, which RLS already scoped to this
    // caller. There is no "mark everything" call that could reach
    // another audience's rows, and the trigger would refuse one anyway.
    const pending = notifications.filter((n) => isUnread(n, readIds))
    if (pending.length === 0) return
    const rows = pending.map((n) => ({ notification_id: n.id, user_id: userId }))

    setReadIds((prev) => {
      const next = new Set(prev)
      pending.forEach((n) => next.add(n.id))
      return next
    })

    // ON CONFLICT DO NOTHING rather than an update: notification_reads
    // has no UPDATE privilege and no UPDATE policy, by design.
    const { error } = await supabase
      .from('notification_reads')
      .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
    if (error) {
      console.error('Could not mark all notifications as read:', error)
      refresh()
    }
  }, [userId, notifications, readIds, refresh])

  const unread = useMemo(
    () => unreadCount(notifications, readIds),
    [notifications, readIds]
  )
  const badges = useMemo(
    () => unreadByTab(notifications, readIds),
    [notifications, readIds]
  )

  return { notifications, readIds, loading, unread, badges, refresh, markRead, markAllRead }
}

export default useNotifications
