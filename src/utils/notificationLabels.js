// What a notification says, and which of them are new to you.
//
// ─── WHY THIS MODULE EXISTS AT ALL ────────────────────────────────────
//
// Migration 022's triggers store a notification as STRUCTURE --
// category, event, entity, and a raw `subject` -- and no prose. The
// words are here, for the reason displayLabels.js and residentGroups.js
// exist: the Resident Portal and the Official Portal must not be able to
// show different words for the same stored state. A sentence written
// into the database by a trigger would be a second vocabulary living
// somewhere this project cannot see it, and changing it would need a
// migration.
//
// ⚠️ THIS MODULE DEFINES NO STATUS WORDS OF ITS OWN.
//
// That is deliberate and load-bearing. The `event` values ARE the stored
// status values they came from:
//
//   approved / declined / ready_for_pickup / claimed
//       are document_requests.status  -> DOCUMENT_STATUS_LABELS
//   approved / declined
//       are reservations.status       -> RESERVATION_STATUS_LABELS
//   verified / rejected / ineligible
//       are profiles.verification_status
//                                     -> residentGroups.VERIFICATION_STATES
//
// So the outcome word a notification shows is looked up in the SAME map
// the badge on the row uses, and a resident cannot be told "Declined" in
// the bell and "Rejected" in the table. displayLabels.test.js already
// asserts that displayLabels.js never re-acquires a verification
// vocabulary; this module must not acquire one either.
//
// The only new wording here is the queue heading for `submitted`, which
// is not a status at all -- no table stores it. It means "this arrived
// and nobody has dealt with it yet".
//
// Pure: no Supabase import, so the tests run without the environment
// variables App.test.js needs.

import {
  DOCUMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  manilaToday,
} from './displayLabels'
import { VERIFICATION_STATES } from './residentGroups'
import { EXCEPTION_BADGE_LABEL } from './reservationWindow'
import { MONTH_NAMES, parseDateKey } from './monthGrid'

// ── What a notification is about ──────────────────────────────────────
//
// The heading names the thing; the outcome word comes from the maps
// above. Split this way so "Court reservation" and "Approved" can never
// drift from the reservations table's own badge.
const CATEGORY_HEADINGS = {
  document_request: 'Document request',
  reservation: 'Court reservation',
  verification: 'Account verification',
}

// The queue side. `submitted` is the one event with no stored status
// behind it, so it is the one place this module names an outcome.
const QUEUE_HEADINGS = {
  document_request: 'New document request',
  reservation: 'New court reservation',
  verification: 'Account waiting for review',
}

// What the reader is being asked to do about it. Officials get a queue
// item; a resident gets a decision. Kept short -- the panel is a list,
// not a page.
const QUEUE_BODIES = {
  document_request: 'Waiting for the Barangay Secretary to review.',
  reservation: 'Waiting for the Barangay Treasurer to review.',
  verification: 'Waiting for an official to check the account.',
}

export const categoryHeading = (category) =>
  CATEGORY_HEADINGS[category] ?? (category ?? '')

// ── The outcome word, borrowed from the owning module ─────────────────
//
// Returns '' for an event this app does not recognise, so `title` falls
// back to the heading alone rather than printing a raw database value.
// Migration 022's CHECK constrains `event`, so an unknown one means the
// vocabulary was widened without this map being looked at -- the same
// failure mode migration 016 had, and notificationLabels.test.js walks
// the vocabulary to catch it.
export const outcomeLabel = (notification) => {
  const { audience, category, event } = notification || {}
  if (!category || !event || event === 'submitted') return ''
  // ⚠️ READ THE MAPS, NOT documentStatusLabel()/reservationStatusLabel().
  // Those two deliberately RETURN AN UNKNOWN VALUE UNCHANGED, which is
  // right for the Activity Log -- the audit trail is the one surface
  // where a word nobody anticipated must stay visible. A notification is
  // the opposite: there is nothing here that an unrecognised event needs
  // to reveal, and the passthrough would put `ready_for_pickup` on
  // screen. Verified by the test that walks all 8 events across all 3
  // categories and asserts no title contains an underscore.
  if (category === 'document_request') return DOCUMENT_STATUS_LABELS[event]?.label ?? ''
  if (category === 'reservation') return RESERVATION_STATUS_LABELS[event]?.label ?? ''
  if (category === 'verification') {
    // ⚠️ Read the map directly, NOT through describeVerification --
    // that answers UNKNOWN_STATE for anything it does not hold, and
    // "Unrecognized status" is wording for a table cell, not for a
    // notification title. An unrecognised event must fall back to the
    // heading alone.
    const state = VERIFICATION_STATES[event]
    if (!state) return ''
    // residentGroups keeps a separate resident-facing wording for these
    // -- "Not a resident of this barangay" rather than "Not a resident"
    // -- because the resident is being told about their own account.
    return audience === 'resident' ? state.residentLabel : state.label
  }
  return ''
}

// ── A stored subject, formatted ───────────────────────────────────────
//
// `subject` is a raw stored value: a document type verbatim, or a
// reservation date as 'YYYY-MM-DD'.
//
// ⚠️ The date goes through parseDateKey, never through `new Date()`.
// `new Date('2026-12-02')` is UTC midnight, so reading it back west of
// UTC gives 1 December. See src/utils/monthGrid.js.
export const subjectText = (notification) => {
  const { category, subject } = notification || {}
  if (!subject) return ''
  if (category === 'reservation') {
    const parsed = parseDateKey(subject)
    if (!parsed) return ''
    return `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}`
  }
  return subject
}

// ── The two lines a notification shows ────────────────────────────────
export const notificationTitle = (notification) => {
  const { audience, category, event } = notification || {}
  if (!category) return ''
  if (event === 'submitted') {
    return QUEUE_HEADINGS[category] ?? categoryHeading(category)
  }
  const outcome = outcomeLabel(notification)
  const heading = categoryHeading(category)
  // A resident reads about their own thing, so the possessive is the
  // natural reading; an official is looking at somebody else's.
  const subject = audience === 'resident' ? `Your ${heading.toLowerCase()}` : heading
  return outcome ? `${subject} — ${outcome}` : subject
}

export const notificationBody = (notification) => {
  const { category, event } = notification || {}
  if (!category) return ''
  const parts = []
  if (event === 'submitted') {
    const subject = subjectText(notification)
    if (subject) parts.push(subject)
    parts.push(QUEUE_BODIES[category] ?? '')
  } else {
    const subject = subjectText(notification)
    if (subject) parts.push(subject)
    if (category === 'verification' && event === 'rejected') {
      // residentGroups' own residentLabel already says "you can
      // resubmit"; this says WHERE. The resident is the only audience
      // this event is ever addressed to.
      parts.push('Open Settings to correct your details.')
    }
  }
  // The exception flag rides inside the notification rather than
  // arriving as a second one, and reuses the Official Portal's own badge
  // wording so the bell and the row agree.
  if (notification?.is_exception) parts.push(EXCEPTION_BADGE_LABEL)
  return parts.filter(Boolean).join(' · ')
}

// ── Read state ────────────────────────────────────────────────────────
//
// ⚠️ ONE DEFINITION OF UNREAD, used by the bell AND by the resident's
// sidebar badges. Before this, the badges counted rows whose
// `resident_viewed_at` was older than their `updated_at`, which answers
// a different question -- it marks a ROW as seen, so a request that goes
// approved -> ready_for_pickup -> claimed could only ever remember the
// last of the three. Two counters derived from two different records of
// "seen" is how a badge and a panel come to disagree.
export const isUnread = (notification, readIds) =>
  !!notification && !(readIds instanceof Set
    ? readIds.has(notification.id)
    : (readIds || []).includes(notification.id))

export const unreadCount = (notifications = [], readIds = new Set()) =>
  (notifications || []).filter((n) => isUnread(n, readIds)).length

// Newest first. Ties broken by id so the order is stable across
// refetches rather than depending on what the server happened to return.
export const sortNotifications = (notifications = []) =>
  [...(notifications || [])].sort((a, b) => {
    const byDate = String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? ''))
    return byDate !== 0 ? byDate : String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })

// ── Sidebar badge counts, from the same source as the bell ────────────
//
// `link_tab` is what the notification itself says answers it, so a tab
// gaining a notification kind needs no change here.
export const unreadByTab = (notifications = [], readIds = new Set()) => {
  const counts = {}
  ;(notifications || []).forEach((n) => {
    if (!n?.link_tab) return
    if (!isUnread(n, readIds)) return
    counts[n.link_tab] = (counts[n.link_tab] || 0) + 1
  })
  return counts
}

// ── When it happened ──────────────────────────────────────────────────
//
// Relative for the recent past, because "2 hours ago" is what the reader
// actually wants, and an absolute date once that stops being useful.
//
// ⚠️ The absolute fallback is built from the date part through
// parseDateKey, not from a Date, for the usual reason. The relative
// branch does use timestamps -- that is arithmetic on two instants,
// which is exactly what Date is for, and `created_at` is a real
// timestamptz rather than a date-only string.
export const relativeTime = (iso, now = Date.now()) => {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 0) return 'Just now'
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  const parsed = parseDateKey(String(iso).slice(0, 10))
  if (!parsed) return ''
  return `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}`
}

// Today in Manila, re-exported so a caller that needs both this and the
// labels has one import. Same function, not a copy.
export { manilaToday }
