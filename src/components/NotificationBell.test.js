// The notification bell, as rendered.
//
// notificationLabels.test.js covers the wording. These cover the parts
// that only exist once it is on screen: the accessible name, the
// keyboard contract, focus restoration, and the rule that read and
// unread are never distinguished by colour alone.
//
// The component imports React, react-icons and the pure
// notificationLabels module only -- no Supabase -- so this runs without
// the environment variables App.test.js needs. That is the reason the
// fetching lives in useNotifications.js and not in here.

import { render, screen, fireEvent } from '@testing-library/react'
import NotificationBell from './NotificationBell'

const n = (overrides = {}) => ({
  id: 'n1',
  audience: 'resident',
  category: 'document_request',
  event: 'approved',
  entity_type: 'document_request',
  entity_id: 'e1',
  subject: 'Barangay Clearance',
  link_tab: 'documents',
  is_exception: false,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ...overrides,
})

const bell = () => screen.getByRole('button', { name: /^Notifications,/ })
const openBell = () => fireEvent.click(bell())

describe('the trigger', () => {
  it('says how many are unread IN WORDS, not only as a number', () => {
    // ⚠️ A count in a coloured circle is conveyed by colour and
    // position. The accessible name has to carry it too.
    render(<NotificationBell notifications={[n({ id: 'a' }), n({ id: 'b' })]} readIds={new Set()} />)
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('says so when nothing is unread', () => {
    render(<NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set(['a'])} />)
    expect(screen.getByRole('button', { name: 'Notifications, none unread' })).toBeInTheDocument()
  })

  it('shows no count bubble at zero', () => {
    const { container } = render(
      <NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set(['a'])} />
    )
    expect(container.querySelector('.notif-bell-count')).toBeNull()
  })

  it('caps the visible bubble but not the spoken number', () => {
    const many = Array.from({ length: 120 }, (_, i) => n({ id: `x${i}` }))
    const { container } = render(<NotificationBell notifications={many} readIds={new Set()} />)
    expect(container.querySelector('.notif-bell-count').textContent).toBe('99+')
    expect(screen.getByRole('button', { name: 'Notifications, 120 unread' })).toBeInTheDocument()
  })

  it('reports the panel through aria-expanded', () => {
    render(<NotificationBell notifications={[]} readIds={new Set()} />)
    expect(bell()).toHaveAttribute('aria-expanded', 'false')
    openBell()
    expect(bell()).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('the panel', () => {
  it('opens and closes from the trigger', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openBell()
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    openBell()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says nothing has happened yet rather than rendering blank', () => {
    // ⚠️ A panel that renders nothing cannot be told apart from one that
    // is broken -- the mistake in migration 018's first Archived
    // Officials cut.
    render(<NotificationBell notifications={[]} readIds={new Set()} />)
    openBell()
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument()
  })

  it('shows a loading label instead of the empty state', () => {
    render(<NotificationBell notifications={[]} readIds={new Set()} loading />)
    openBell()
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument()
    expect(screen.queryByText('No notifications yet.')).not.toBeInTheDocument()
  })

  it('lists the newest first', () => {
    const list = [
      n({ id: 'old', subject: 'Older One', created_at: '2026-09-01T00:00:00.000Z' }),
      n({ id: 'new', subject: 'Newer One', created_at: '2026-10-01T00:00:00.000Z' }),
    ]
    render(<NotificationBell notifications={list} readIds={new Set()} />)
    openBell()
    const items = screen.getAllByRole('button', { name: /document request/i })
    expect(items[0].textContent).toContain('Newer One')
  })

  it('moves focus to the panel when it opens', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})

describe('read and unread are not colour alone', () => {
  it('marks an unread item with a class AND the word New in its name', () => {
    render(<NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set()} />)
    openBell()
    const item = screen.getByRole('button', { name: /^New\./ })
    expect(item.className).toMatch(/notif-item-unread/)
  })

  it('does neither for an item already read', () => {
    render(<NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set(['a'])} />)
    openBell()
    expect(screen.queryByRole('button', { name: /^New\./ })).not.toBeInTheDocument()
    const item = screen.getByRole('button', { name: /document request/i })
    expect(item.className).not.toMatch(/notif-item-unread/)
  })
})

describe('acting on one', () => {
  it('marks it read and then navigates to its tab', () => {
    const calls = []
    render(
      <NotificationBell
        notifications={[n({ id: 'a', link_tab: 'documents' })]}
        readIds={new Set()}
        onMarkRead={(x) => calls.push(['read', x.id])}
        onOpenTab={(tab) => calls.push(['open', tab])}
      />
    )
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /^New\./ }))
    // ⚠️ Order matters: the panel unmounts on navigation, so a mark that
    // ran afterwards would be writing into something gone.
    expect(calls).toEqual([['read', 'a'], ['open', 'documents']])
  })

  it('does not re-mark something already read', () => {
    const calls = []
    render(
      <NotificationBell
        notifications={[n({ id: 'a' })]}
        readIds={new Set(['a'])}
        onMarkRead={() => calls.push('read')}
        onOpenTab={() => calls.push('open')}
      />
    )
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /document request/i }))
    expect(calls).toEqual(['open'])
  })

  it('closes the panel on selection', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} onOpenTab={() => {}} />)
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /^New\./ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('still closes when the notification names no tab', () => {
    const calls = []
    render(
      <NotificationBell
        notifications={[n({ id: 'a', link_tab: null })]}
        readIds={new Set()}
        onOpenTab={() => calls.push('open')}
      />
    )
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /^New\./ }))
    expect(calls).toEqual([])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('survives having no callbacks at all', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /^New\./ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('mark all as read', () => {
  it('offers the control only while something is unread', () => {
    const { rerender } = render(
      <NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set()} />
    )
    openBell()
    expect(screen.getByRole('button', { name: /Mark all as read/ })).toBeInTheDocument()

    rerender(<NotificationBell notifications={[n({ id: 'a' })]} readIds={new Set(['a'])} />)
    expect(screen.queryByRole('button', { name: /Mark all as read/ })).not.toBeInTheDocument()
  })

  it('calls back once and leaves the panel open', () => {
    let calls = 0
    render(
      <NotificationBell
        notifications={[n({ id: 'a' }), n({ id: 'b' })]}
        readIds={new Set()}
        onMarkAllRead={() => { calls += 1 }}
      />
    )
    openBell()
    fireEvent.click(screen.getByRole('button', { name: /Mark all as read/ }))
    expect(calls).toBe(1)
    // The reader is looking at the list; closing it under them would
    // hide what they just acknowledged.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('the keyboard and the pointer', () => {
  it('closes on Escape and returns focus to the bell', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(bell()).toHaveFocus()
  })

  it('ignores other keys', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    fireEvent.keyDown(document, { key: 'a' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on a click outside WITHOUT stealing focus back', () => {
    // The person is clicking somewhere else on purpose -- yanking focus
    // back would fight them. Same rule ActionMenu follows.
    render(
      <>
        <NotificationBell notifications={[n()]} readIds={new Set()} />
        <button type="button">Elsewhere</button>
      </>
    )
    openBell()
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    fireEvent.mouseDown(elsewhere)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(bell()).not.toHaveFocus()
  })

  it('stays open when the click is inside the panel', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes from the trigger with focus restored', () => {
    render(<NotificationBell notifications={[n()]} readIds={new Set()} />)
    openBell()
    openBell()
    expect(bell()).toHaveFocus()
  })
})
