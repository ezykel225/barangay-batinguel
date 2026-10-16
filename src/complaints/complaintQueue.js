// What the Official Portal's complaint queue narrows, counts and says.
//
// ─── ⚠️ NOTHING HERE IS A SECURITY CONTROL ────────────────────────────
//
// `complaint_queue()` (migration 040) is what decides which rows an
// official may see at all: it is SECURITY DEFINER, gated on
// `is_official(auth.uid()) AND official_is_active(...)`, and it returns
// SIX columns and no more. This module narrows the rows that function
// already handed back. A resident or the nurse may execute it and gets
// ZERO rows, measured -- so there is nothing here for a filter to
// protect, and a filter that looked like protection would be worse than
// none.
//
// ─── ⚠️ THE QUEUE HAS NO CATEGORY, AND THIS MODULE MUST NOT INVENT ONE ─
//
// `complaint_queue()` deliberately omits `category`, `narrative`, every
// party, every contact, `location_note` and all evidence. A queue row
// reading `family_dispute` beside a date, visible to all eleven
// officials in a barangay where everybody knows their neighbours, is an
// accusation about an identifiable household -- the date and the
// channel are enough to work out who was at the hall that morning. The
// same line `reservations.purpose` draws (officials only) and
// `exception_reason` draws (out of the public slot RPCs).
//
// So there is no category filter, no category column and no category
// search field in this module. Adding one would need a second query for
// data the queue was built to withhold, and `complaints` returns ZERO
// rows to an ordinary official anyway.
//
// ─── IT IS PURE, DELIBERATELY ─────────────────────────────────────────
//
// No Supabase import, for the reason `complaintLabels.js` has none:
// `supabaseClient.js` throws at import time without the env vars.

import { intakeChannelLabel, complaintStatusLabel } from './complaintLabels'

// ⚠️ THE REFERENCE IS THE ONLY SEARCHABLE FIELD, AND THAT IS THE WHOLE
// LIST. It is the one value in a queue row that a person legitimately
// arrives holding: a complainant phones about `CMP-2026-AB12CD`, or the
// Secretary reads it off a printout. Everything else in the row is a
// date, a channel or a status -- each of which the filters below handle
// better than a text match would.
//
// Searching a narrative or a party name is not merely unimplemented, it
// is unavailable: neither is in the queue's output, and the table
// refuses an ordinary official every row.
export const QUEUE_SEARCH_FIELDS = ['reference']

// The same normalisation `filterRows` in `residentGroups.js` uses, so
// two queues in one dashboard cannot disagree about what a search term
// means: trim, collapse inner whitespace, lowercase.
const normalise = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase()

// ⚠️ A reference is matched with the look-alikes folded, so a search
// typed from a phone call still finds it. Crockford base32 omits I, L,
// O and U precisely because they are misread, and migration 040 maps
// them back on lookup through `normalize_reservation_reference()`. A
// search box that did not would tell the Secretary a complaint does not
// exist because the complainant read an O for a zero.
//
// This is a CONVENIENCE on rows the caller already holds, never a
// lookup: it cannot reveal a complaint the queue did not return.
const foldReference = (value) => normalise(value)
  .replace(/[\s-]/g, '')
  .replace(/[oil]/g, (ch) => (ch === 'o' ? '0' : '1'))

// ─── Status filter ────────────────────────────────────────────────────
//
// ⚠️ ONE REAL STATUS, BECAUSE THE DATABASE HAS ONE.
// `complaints_status_check` permits exactly `received`, so the filter
// offers exactly that plus "All".
//
// ⚠️ NO FABRICATED WORKFLOW STATES. There is deliberately no
// `KP Eligible`, `Under Mediation`, `Settled`, `Referred`, `Closed` or
// `Dismissed` option here. Those are P4 concepts that no column holds
// and nothing can set, and an option that can only ever match zero rows
// tells an official a stage exists in a system that cannot reach it --
// the `displayLabels.js` mistake, on a government queue.
export const QUEUE_STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'received', label: complaintStatusLabel('received') },
  // ⚠️ TWO MORE SINCE P4-A, AND THEY ARE NOT A WIDENING OF THE RULE ABOVE.
  // The rule is that a filter may offer only a status the database can
  // actually hold, and migration 042 widened `complaints_status_check` to
  // exactly these three -- so each of these matches real rows rather than
  // advertising a stage nothing can reach. `KP Eligible`, `Under
  // Mediation`, `Settled`, `Referred`, `Closed` and `Dismissed` are still
  // absent and still must be: nothing in this system can set one.
  //
  // ⚠️ THE STAGE IS PRIVACY-SAFE; THE OUTCOME WOULD NOT BE. `screened`
  // says a human confirmed a screening and never which outcome they
  // confirmed -- that lives on `complaint_screenings`, which an ordinary
  // official cannot read at all. So the queue gains how far along a
  // complaint is and still nothing about its subject or its decision.
  { value: 'under_review', label: complaintStatusLabel('under_review') },
  { value: 'screened', label: complaintStatusLabel('screened') },
]

export const QUEUE_CHANNEL_FILTERS = [
  { value: 'all', label: 'All channels' },
  { value: 'online', label: intakeChannelLabel('online') },
  { value: 'walk_in', label: intakeChannelLabel('walk_in') },
]

// ⚠️ AN UNRECOGNISED FILTER VALUE MATCHES NOTHING, NEVER EVERYTHING.
// The direction that fails open is the dangerous one: a status filter
// that returned the whole queue for a value it did not understand would
// show an official rows they had asked to exclude. `documentFilter.js`
// makes the same choice and `documentFilter.test.js` pins it.
const matchesStatus = (row, status) => {
  if (status === 'all') return true
  return row?.status === status
}

const matchesChannel = (row, channel) => {
  if (channel === 'all') return true
  return row?.intake_channel === channel
}

const matchesSearch = (row, term) => {
  const folded = foldReference(term)
  if (!folded) return true
  return foldReference(row?.reference).includes(folded)
}

// Narrow the rows `complaint_queue()` returned.
//
// ⚠️ THE ORDER IS THE DATABASE'S AND IS NOT RE-SORTED HERE.
// `complaint_queue()` is `ORDER BY c.created_at DESC`, so the newest
// complaint is already first. Re-sorting would give the page a second
// opinion about order, and a filter is not the place to form one.
export const filterComplaintQueue = (rows, { search = '', status = 'all', channel = 'all' } = {}) => {
  if (!Array.isArray(rows)) return []
  return rows.filter((row) => (
    matchesStatus(row, status)
    && matchesChannel(row, channel)
    && matchesSearch(row, search)
  ))
}

// What the queue says about itself above the table.
//
// ⚠️ IT COUNTS WORK WAITING, AND SAYS NOTHING ABOUT SUBJECT. The
// breakdown is by CHANNEL, not by category: how many arrived online and
// how many at the counter is operational, while how many are family
// disputes is the accusation the queue exists not to publish.
export const summariseComplaintQueue = (rows) => {
  const list = Array.isArray(rows) ? rows : []
  return {
    total: list.length,
    online: list.filter((r) => r?.intake_channel === 'online').length,
    walkIn: list.filter((r) => r?.intake_channel === 'walk_in').length,
  }
}

// ⚠️ TWO DIFFERENT EMPTY STATES, BECAUSE THEY ARE TWO DIFFERENT FACTS.
// Saying "No complaints yet." while a filter is applied tells an
// official the queue is empty when it is not -- which, on a queue of
// grievances residents have brought to the barangay, is the one wrong
// thing this tab can say. `documentFilter`'s own two empty states exist
// for exactly this reason and CLAUDE.md records it.
export const QUEUE_EMPTY_NO_ROWS = 'No complaints have been recorded yet.'
export const QUEUE_EMPTY_NO_MATCH = 'No complaints match this search or filter.'

export const queueEmptyMessage = ({ total, filtered }) => (
  total === 0 ? QUEUE_EMPTY_NO_ROWS : (filtered === 0 ? QUEUE_EMPTY_NO_MATCH : '')
)

// ─── What an ordinary official is told, and what they are not ─────────
//
// ⚠️ THE QUEUE IS NEVER HIDDEN BECAUSE THE DETAIL IS RESTRICTED.
// Measured against the live database: a Treasurer and a Peace-and-Order
// Kagawad each see all queue rows and get ZERO rows from `complaints`,
// `complaint_parties_for()`, `complaint_history_for()` and
// `complaint_attachments_for()`. Only the Barangay Secretary and the
// Punong Barangay resolve true through
// `complaint_is_visible_to_caller()`.
//
// ⚠️ AN EMPTY DETAIL IS NOT AN ERROR. RLS filters rows; it does not
// raise. So the restricted case arrives as zero rows and no error at
// all -- there is no `42501` and no `P0001` to surface, and code that
// reported one would be inventing it. The caller renders this sentence
// instead.
//
// It names no position as the gate it failed, states no policy, and
// gives the official nothing to act on that they cannot act on: an
// ordinary Kagawad cannot grant themselves records access, and telling
// them which position holds it invites asking for it.
export const RESTRICTED_DETAIL_MESSAGE =
  'Full complaint details are restricted to authorized records staff.'
