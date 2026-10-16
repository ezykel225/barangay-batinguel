// P3-B2. The Official Portal's queue rules, as a pure module.
//
// No Supabase mock and no `.env`: `complaintQueue.js` imports only
// `complaintLabels.js`, which imports only `monthGrid.js`. That is the
// reason the rules live in a module rather than inside a 5,640-line
// dashboard.

import fs from 'fs'
import path from 'path'

import {
  QUEUE_CHANNEL_FILTERS,
  QUEUE_EMPTY_NO_MATCH,
  QUEUE_EMPTY_NO_ROWS,
  QUEUE_SEARCH_FIELDS,
  QUEUE_STATUS_FILTERS,
  RESTRICTED_DETAIL_MESSAGE,
  filterComplaintQueue,
  queueEmptyMessage,
  summariseComplaintQueue,
} from './complaintQueue'

const SRC = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
// ⚠️ Comment-stripped. This module discusses `category`, `narrative` and
// every P4 status at length precisely to record that none is used, so a
// scan over the raw text would fail on the prose documenting the
// absence -- the A5 trap, which has now caught four phases running.
const code = (p) => read(p).split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// The six columns `complaint_queue()` actually returns, and no others.
const row = (over = {}) => ({
  id: 'c1',
  reference: 'CMP-2026-AB12CD',
  intake_channel: 'online',
  status: 'received',
  created_at: '2026-10-16T01:00:00.000Z',
  updated_at: '2026-10-16T01:00:00.000Z',
  ...over,
})

const ROWS = [
  row(),
  row({ id: 'c2', reference: 'CMP-2026-9XYZ70', intake_channel: 'walk_in' }),
  row({ id: 'c3', reference: 'CMP-2026-QQ4RT8', intake_channel: 'walk_in' }),
]

// ── A. The queue's shape is the RPC's, and carries no subject ─────────

describe('A. the queue says nothing about what a complaint is about', () => {
  it('searches the reference and nothing else', () => {
    expect(QUEUE_SEARCH_FIELDS).toEqual(['reference'])
  })

  it('offers no category filter at all', () => {
    const all = [...QUEUE_STATUS_FILTERS, ...QUEUE_CHANNEL_FILTERS]
      .map((f) => `${f.value} ${f.label}`.toLowerCase())
      .join(' ')
    ;['category', 'noise', 'theft', 'threats', 'family', 'dispute',
      'debt', 'altercation', 'boundary']
      .forEach((term) => expect(all).not.toContain(term))
  })

  it('never reads a category, narrative, party or contact off a row', () => {
    const src = code('complaints/complaintQueue.js')
    ;['category', 'narrative', 'full_name', 'contact_number',
      'location_note', 'object_path', 'party']
      .forEach((field) => expect(src).not.toContain(field))
  })

  it('summarises by channel, which is operational, not by category', () => {
    expect(summariseComplaintQueue(ROWS)).toEqual({ total: 3, online: 1, walkIn: 2 })
  })

  it('counts an empty queue without throwing', () => {
    expect(summariseComplaintQueue([])).toEqual({ total: 0, online: 0, walkIn: 0 })
    expect(summariseComplaintQueue(null)).toEqual({ total: 0, online: 0, walkIn: 0 })
  })
})

// ── B. No fabricated workflow ────────────────────────────────────────

describe('B. no status this system cannot reach is offered', () => {
  // ⚠️ FOUR SINCE P4-A, AND THE RULE IS UNCHANGED: a filter may offer
  // only a status the database can actually hold. Migration 042 widened
  // `complaints_status_check` to three real values, so each option here
  // matches real rows rather than advertising a stage nothing can reach.
  it('offers exactly All plus the statuses the database permits', () => {
    expect(QUEUE_STATUS_FILTERS.map((f) => f.value))
      .toEqual(['all', 'received', 'under_review', 'screened'])
  })

  it('shows the stored status through the label map, not raw', () => {
    expect(QUEUE_STATUS_FILTERS[1].label).toBe('Received')
    expect(QUEUE_STATUS_FILTERS[1].label).not.toBe('received')
  })

  // ⚠️ The load-bearing one. `complaints_status_check` permits exactly
  // `received`, so a filter naming a P4 stage could only ever match
  // zero rows -- and would tell an official a stage exists in a system
  // that cannot reach it. The `displayLabels.js` mistake, on a
  // government queue.
  it('names no P4 stage anywhere in the module', () => {
    const src = code('complaints/complaintQueue.js').toLowerCase()
    ;['kp eligible', 'kp_eligible', 'mediation', 'conciliation', 'settled',
      'referred', 'dismissed', 'hearing', 'summons', 'katarungang',
      'lupon', 'pangkat', 'jurisdiction']
      .forEach((term) => expect(src).not.toContain(term))
  })
})

// ── C. Filtering, including the direction that fails open ────────────

describe('C. filtering', () => {
  it('returns every row when nothing is applied', () => {
    expect(filterComplaintQueue(ROWS)).toHaveLength(3)
  })

  it('narrows by channel', () => {
    expect(filterComplaintQueue(ROWS, { channel: 'walk_in' }).map((r) => r.id))
      .toEqual(['c2', 'c3'])
    expect(filterComplaintQueue(ROWS, { channel: 'online' }).map((r) => r.id))
      .toEqual(['c1'])
  })

  it('narrows by status', () => {
    const mixed = [...ROWS, row({ id: 'c4', status: 'something_new' })]
    expect(filterComplaintQueue(mixed, { status: 'received' })).toHaveLength(3)
  })

  it('matches a reference case-insensitively and on a fragment', () => {
    expect(filterComplaintQueue(ROWS, { search: 'ab12cd' }).map((r) => r.id)).toEqual(['c1'])
    expect(filterComplaintQueue(ROWS, { search: '  9XYZ70 ' }).map((r) => r.id)).toEqual(['c2'])
  })

  // ⚠️ Crockford base32 omits I, L, O and U because they are misread,
  // and migration 040 maps them back on lookup. A search box that did
  // not would tell the Secretary a complaint does not exist because the
  // complainant read an O for a zero over the phone.
  it('folds the look-alike characters the reference alphabet excludes', () => {
    expect(filterComplaintQueue(ROWS, { search: 'CMP-2026-9XYZ7O' }).map((r) => r.id))
      .toEqual(['c2'])
    expect(filterComplaintQueue(ROWS, { search: 'cmp20269xyz7o' }).map((r) => r.id))
      .toEqual(['c2'])
  })

  // ⚠️ BOTH DIRECTIONS. An unrecognised filter must match NOTHING. The
  // direction that fails open is the dangerous one: returning the whole
  // queue for a value it did not understand would show an official rows
  // they had asked to exclude.
  it('matches nothing for an unrecognised status or channel', () => {
    expect(filterComplaintQueue(ROWS, { status: 'settled' })).toEqual([])
    expect(filterComplaintQueue(ROWS, { channel: 'sms' })).toEqual([])
    expect(filterComplaintQueue(ROWS, { status: 'constructor' })).toEqual([])
  })

  it('composes a search with both filters', () => {
    expect(filterComplaintQueue(ROWS, {
      search: 'QQ4RT8', channel: 'walk_in', status: 'received',
    }).map((r) => r.id)).toEqual(['c3'])
    expect(filterComplaintQueue(ROWS, { search: 'QQ4RT8', channel: 'online' })).toEqual([])
  })

  it('survives a missing or malformed row list', () => {
    expect(filterComplaintQueue(null)).toEqual([])
    expect(filterComplaintQueue(undefined)).toEqual([])
    expect(filterComplaintQueue([{}], { search: 'x' })).toEqual([])
  })

  // The RPC is `ORDER BY created_at DESC`; re-sorting here would give
  // the page a second opinion about order.
  it('preserves the order the database returned', () => {
    expect(filterComplaintQueue(ROWS).map((r) => r.id)).toEqual(['c1', 'c2', 'c3'])
    const src = code('complaints/complaintQueue.js')
    expect(src).not.toContain('.sort(')
  })
})

// ── D. Two empty states, because they are two different facts ────────

describe('D. the empty states', () => {
  it('says the queue is empty only when it is', () => {
    expect(queueEmptyMessage({ total: 0, filtered: 0 })).toBe(QUEUE_EMPTY_NO_ROWS)
  })

  // ⚠️ Saying "No complaints yet." while a filter is applied tells an
  // official the queue is empty when it is not -- on a queue of
  // grievances residents brought to the barangay, the one wrong thing
  // this tab can say.
  it('says a filter matched nothing when rows exist', () => {
    expect(queueEmptyMessage({ total: 3, filtered: 0 })).toBe(QUEUE_EMPTY_NO_MATCH)
    expect(QUEUE_EMPTY_NO_MATCH).not.toBe(QUEUE_EMPTY_NO_ROWS)
  })

  it('says nothing when there is something to show', () => {
    expect(queueEmptyMessage({ total: 3, filtered: 2 })).toBe('')
  })
})

// ── E. The restricted-detail sentence ────────────────────────────────

describe('E. the restricted-detail message', () => {
  // ⚠️ It names no position as the gate that refused. An ordinary
  // Kagawad cannot grant themselves records access, and naming the
  // position that holds it only invites asking for it.
  it('names no position, policy, function or error code', () => {
    const m = RESTRICTED_DETAIL_MESSAGE.toLowerCase()
    ;['secretary', 'punong', 'kagawad', 'treasurer', 'position', 'policy',
      'rls', '42501', 'p0001', 'permission denied', 'complaint_is_visible',
      'auth.uid']
      .forEach((term) => expect(m).not.toContain(term))
  })

  it('states the restriction and who holds it in general terms', () => {
    expect(RESTRICTED_DETAIL_MESSAGE).toMatch(/restricted/i)
    expect(RESTRICTED_DETAIL_MESSAGE).toMatch(/records staff/i)
  })

  it('does not read as a failure', () => {
    const m = RESTRICTED_DETAIL_MESSAGE.toLowerCase()
    ;['error', 'failed', 'could not', 'try again', 'unavailable']
      .forEach((term) => expect(m).not.toContain(term))
  })
})

// ── F. It is not a security control, and says so ─────────────────────

describe('F. the module claims no authority', () => {
  // ⚠️ COMMENT-STRIPPED, and the first version of this test was not --
  // it failed on the module's own header, which says "No Supabase
  // import" and names `supabaseClient.js`. The A5 trap: a scan that
  // matches the prose documenting an absence. Fifth phase running.
  it('imports no Supabase client', () => {
    const src = code('complaints/complaintQueue.js')
    expect(src).not.toContain("from '../supabase/supabaseClient'")
    expect(src).not.toContain('supabase')
  })

  // ⚠️ `barangay_officials.committee` IS DESCRIPTIVE DATA, NOT
  // AUTHORIZATION DATA -- free text, no CHECK, writable by any official
  // on any row, and not guarded by `protect_official_record()`.
  it('reads neither committee nor full_name for any decision', () => {
    const src = code('complaints/complaintQueue.js')
    expect(src).not.toContain('committee')
    expect(src).not.toContain('full_name')
    expect(src).not.toContain('position')
  })
})
