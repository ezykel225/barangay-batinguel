// What a notification says, and which ones are new to you.
//
// Pure module, no Supabase import, so these run without the environment
// variables App.test.js needs.
//
// ⚠️ The load-bearing ones here are the vocabulary tests. Migration 022
// constrains `event` with a CHECK, and this module turns those values
// into words by borrowing the maps that already own them. If the
// migration's vocabulary is ever widened without this module being
// looked at, that must fail in Jest rather than on screen -- which is
// exactly the mistake migration 016 made when it widened the
// activity_log vocabulary and the trigger was left behind.

import {
  categoryHeading,
  isUnread,
  notificationBody,
  notificationTitle,
  outcomeLabel,
  relativeTime,
  sortNotifications,
  subjectText,
  unreadByTab,
  unreadCount,
} from './notificationLabels'
import * as notificationLabels from './notificationLabels'
import { DOCUMENT_STATUS_LABELS, RESERVATION_STATUS_LABELS } from './displayLabels'
import { VERIFICATION_STATES } from './residentGroups'
import { EXCEPTION_BADGE_LABEL } from './reservationWindow'

const n = (overrides = {}) => ({
  id: 'n1',
  audience: 'resident',
  category: 'document_request',
  event: 'approved',
  entity_type: 'document_request',
  entity_id: 'e1',
  subject: null,
  link_tab: 'documents',
  is_exception: false,
  created_at: '2026-10-01T02:00:00.000Z',
  ...overrides,
})

// Migration 022's own CHECK vocabulary, transcribed. If the migration
// grows a value, this list is what has to grow with it.
const MIGRATION_EVENTS = [
  'submitted', 'approved', 'declined', 'ready_for_pickup', 'claimed',
  'verified', 'rejected', 'ineligible',
]
const MIGRATION_CATEGORIES = ['document_request', 'reservation', 'verification']

describe('the vocabulary is borrowed, never redefined', () => {
  it('takes document outcomes from the document status map', () => {
    expect(outcomeLabel(n({ event: 'ready_for_pickup' })))
      .toBe(DOCUMENT_STATUS_LABELS.ready_for_pickup.label)
    expect(outcomeLabel(n({ event: 'claimed' })))
      .toBe(DOCUMENT_STATUS_LABELS.claimed.label)
  })

  it('takes reservation outcomes from the reservation status map', () => {
    const res = n({ category: 'reservation', event: 'declined' })
    expect(outcomeLabel(res)).toBe(RESERVATION_STATUS_LABELS.declined.label)
  })

  it('takes verification outcomes from residentGroups', () => {
    const ver = (event, audience) =>
      outcomeLabel(n({ category: 'verification', event, audience }))
    // A resident is being told about their own account, so they get the
    // resident-facing wording; an official gets the table wording.
    expect(ver('ineligible', 'resident')).toBe(VERIFICATION_STATES.ineligible.residentLabel)
    expect(ver('ineligible', 'officials')).toBe(VERIFICATION_STATES.ineligible.label)
    expect(ver('rejected', 'resident')).toBe(VERIFICATION_STATES.rejected.residentLabel)
  })

  it('defines no status map of its own', () => {
    // ⚠️ The same guard displayLabels.test.js holds over displayLabels:
    // a second vocabulary for a status that is already named elsewhere
    // is how one stored value comes to have two answers. Every export
    // here is a function; none is a status lookup table.
    const tables = Object.entries(notificationLabels)
      .filter(([, value]) => value && typeof value === 'object')
      .filter(([, value]) => {
        const keys = Object.keys(value)
        return keys.some((k) => MIGRATION_EVENTS.includes(k))
      })
      .map(([name]) => name)
    expect(tables).toEqual([])
  })
})

describe('every event in the migration produces words', () => {
  it('gives a title to all 8 events across all 3 categories', () => {
    MIGRATION_CATEGORIES.forEach((category) => {
      MIGRATION_EVENTS.forEach((event) => {
        const title = notificationTitle(n({ category, event, audience: 'resident' }))
        expect(typeof title).toBe('string')
        expect(title.length).toBeGreaterThan(0)
        // ⚠️ And never the raw stored value on its own. A notification
        // is not the audit trail -- there is no surface here where an
        // unanticipated word has to stay visible, so a title must never
        // read "ready_for_pickup".
        expect(title).not.toContain('_')
      })
    })
  })

  it('names the three categories', () => {
    MIGRATION_CATEGORIES.forEach((category) => {
      expect(categoryHeading(category)).not.toContain('_')
      expect(categoryHeading(category).length).toBeGreaterThan(0)
    })
  })

  it('falls back to the heading alone for an event it does not know', () => {
    // Rather than printing the unknown value, which would put a raw
    // database word on screen.
    const odd = n({ event: 'escalated' })
    expect(outcomeLabel(odd)).toBe('')
    expect(notificationTitle(odd)).toBe('Your document request')
    expect(notificationTitle(odd)).not.toContain('escalated')
  })

  it('returns nothing rather than guessing for an empty notification', () => {
    expect(notificationTitle(null)).toBe('')
    expect(notificationTitle({})).toBe('')
    expect(notificationBody(undefined)).toBe('')
    expect(outcomeLabel(null)).toBe('')
  })

  it('never shows residentGroups\' unrecognised-status wording', () => {
    // describeVerification answers UNKNOWN_STATE for anything it does
    // not hold. That is wording for a table cell, not a notification.
    const odd = n({ category: 'verification', event: 'nonsense' })
    expect(notificationTitle(odd)).not.toMatch(/Unrecognized/)
  })
})

describe('the two lines', () => {
  it('phrases a resident\'s own thing possessively', () => {
    expect(notificationTitle(n({ audience: 'resident', event: 'approved' })))
      .toBe('Your document request — Approved')
  })

  it('phrases an official\'s queue item impersonally', () => {
    expect(notificationTitle(n({ audience: 'secretary', event: 'submitted' })))
      .toBe('New document request')
    expect(notificationTitle(n({ audience: 'treasurer', category: 'reservation', event: 'submitted' })))
      .toBe('New court reservation')
    expect(notificationTitle(n({ audience: 'officials', category: 'verification', event: 'submitted' })))
      .toBe('Account waiting for review')
  })

  it('says who a queue item is waiting for', () => {
    expect(notificationBody(n({ audience: 'secretary', event: 'submitted', subject: null })))
      .toMatch(/Barangay Secretary/)
    expect(notificationBody(n({
      audience: 'treasurer', category: 'reservation', event: 'submitted', subject: null,
    }))).toMatch(/Barangay Treasurer/)
  })

  it('points a rejected account at where to fix it', () => {
    const body = notificationBody(n({ category: 'verification', event: 'rejected' }))
    expect(body).toMatch(/Settings/)
  })

  it('reuses the Official Portal\'s own exception wording', () => {
    // Not a second phrasing of the same thing -- the badge on the
    // reservation row and the line in the bell are one constant.
    const body = notificationBody(n({
      category: 'reservation', event: 'approved', is_exception: true, subject: '2026-12-02',
    }))
    expect(body).toContain(EXCEPTION_BADGE_LABEL)
  })

  it('does not mention an exception when there is not one', () => {
    const body = notificationBody(n({
      category: 'reservation', event: 'approved', is_exception: false, subject: '2026-12-02',
    }))
    expect(body).not.toContain(EXCEPTION_BADGE_LABEL)
  })
})

describe('the subject is a raw stored value', () => {
  it('prints a document type verbatim', () => {
    expect(subjectText(n({ subject: 'Barangay Clearance' }))).toBe('Barangay Clearance')
  })

  it('formats a reservation date WITHOUT shifting it', () => {
    // ⚠️ The regression this project has shipped twice.
    // `new Date('2026-12-02')` is UTC midnight, so reading it back west
    // of UTC gives 1 December. subjectText goes through parseDateKey.
    const res = n({ category: 'reservation', subject: '2026-12-02' })
    expect(subjectText(res)).toBe('2 December 2026')
    expect(subjectText(n({ category: 'reservation', subject: '2026-01-01' })))
      .toBe('1 January 2026')
  })

  it('returns nothing for a date it cannot read', () => {
    expect(subjectText(n({ category: 'reservation', subject: 'whenever' }))).toBe('')
    expect(subjectText(n({ subject: null }))).toBe('')
  })
})

describe('read state', () => {
  const list = [n({ id: 'a' }), n({ id: 'b' }), n({ id: 'c' })]

  it('counts what is not in the read set', () => {
    expect(unreadCount(list, new Set(['a']))).toBe(2)
    expect(unreadCount(list, new Set())).toBe(3)
    expect(unreadCount(list, new Set(['a', 'b', 'c']))).toBe(0)
  })

  it('accepts a plain array as well as a Set', () => {
    expect(unreadCount(list, ['a', 'b'])).toBe(1)
    expect(isUnread(list[0], ['a'])).toBe(false)
    expect(isUnread(list[0], [])).toBe(true)
  })

  it('survives a missing list or set', () => {
    expect(unreadCount(undefined, new Set())).toBe(0)
    expect(unreadCount(list, undefined)).toBe(3)
    expect(isUnread(null, new Set())).toBe(false)
  })

  it('groups unread counts by the tab each notification names', () => {
    // ⚠️ This is what the sidebar badges read, and it is the SAME rows
    // the bell counts -- which is the whole point of repointing them.
    const mixed = [
      n({ id: 'a', link_tab: 'documents' }),
      n({ id: 'b', link_tab: 'documents' }),
      n({ id: 'c', link_tab: 'reservations' }),
      n({ id: 'd', link_tab: 'dashboard' }),
    ]
    expect(unreadByTab(mixed, new Set())).toEqual({
      documents: 2, reservations: 1, dashboard: 1,
    })
    expect(unreadByTab(mixed, new Set(['a', 'd']))).toEqual({
      documents: 1, reservations: 1,
    })
  })

  it('leaves a notification with no tab out of the badge counts', () => {
    // It still shows in the bell; it just has nowhere to send anybody.
    expect(unreadByTab([n({ id: 'x', link_tab: null })], new Set())).toEqual({})
  })

  it('agrees with the bell\'s own total', () => {
    const mixed = [
      n({ id: 'a', link_tab: 'documents' }),
      n({ id: 'b', link_tab: 'reservations' }),
      n({ id: 'c', link_tab: null }),
    ]
    const byTab = unreadByTab(mixed, new Set())
    const tabbed = Object.values(byTab).reduce((sum, v) => sum + v, 0)
    // The totals differ by exactly the untabbed one, and by nothing else.
    expect(unreadCount(mixed, new Set()) - tabbed).toBe(1)
  })
})

describe('ordering', () => {
  it('puts the newest first', () => {
    const list = [
      n({ id: 'old', created_at: '2026-09-01T00:00:00.000Z' }),
      n({ id: 'new', created_at: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(sortNotifications(list).map((x) => x.id)).toEqual(['new', 'old'])
  })

  it('breaks a tie by id, so a refetch cannot reshuffle the list', () => {
    const same = '2026-10-01T00:00:00.000Z'
    const list = [n({ id: 'b', created_at: same }), n({ id: 'a', created_at: same })]
    expect(sortNotifications(list).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('does not mutate what it was given', () => {
    const list = [
      n({ id: 'old', created_at: '2026-09-01T00:00:00.000Z' }),
      n({ id: 'new', created_at: '2026-10-01T00:00:00.000Z' }),
    ]
    sortNotifications(list)
    expect(list.map((x) => x.id)).toEqual(['old', 'new'])
  })

  it('survives a missing list and a missing timestamp', () => {
    expect(sortNotifications(undefined)).toEqual([])
    expect(sortNotifications([n({ id: 'a', created_at: null })])).toHaveLength(1)
  })
})

describe('when it happened', () => {
  const now = new Date('2026-10-01T12:00:00.000Z').getTime()
  const ago = (ms) => new Date(now - ms).toISOString()

  it('is relative while that is the useful answer', () => {
    expect(relativeTime(ago(10 * 1000), now)).toBe('Just now')
    expect(relativeTime(ago(60 * 1000), now)).toBe('1 minute ago')
    expect(relativeTime(ago(5 * 60 * 1000), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(60 * 60 * 1000), now)).toBe('1 hour ago')
    expect(relativeTime(ago(3 * 60 * 60 * 1000), now)).toBe('3 hours ago')
    expect(relativeTime(ago(24 * 60 * 60 * 1000), now)).toBe('1 day ago')
  })

  it('becomes an absolute date once it is a week old', () => {
    expect(relativeTime('2026-09-01T12:00:00.000Z', now)).toBe('1 September 2026')
  })

  it('does not shift the absolute date through UTC parsing', () => {
    // The fallback reads the date part through parseDateKey, not through
    // a Date, so the day cannot move.
    expect(relativeTime('2026-01-01T00:00:00.000Z', now)).toBe('1 January 2026')
  })

  it('never reports the future as elapsed time', () => {
    expect(relativeTime(new Date(now + 60 * 60 * 1000).toISOString(), now)).toBe('Just now')
  })

  it('returns nothing for a missing or unreadable timestamp', () => {
    expect(relativeTime(null, now)).toBe('')
    expect(relativeTime('not a time', now)).toBe('')
  })
})
