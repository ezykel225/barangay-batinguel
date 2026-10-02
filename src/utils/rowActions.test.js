// What each queue row offers, asserted by RUNNING the rule rather than
// by reading the 4,900-line dashboard it used to live inside. That is
// the whole reason `rowActions.js` was extracted when the two Action
// columns became ⋮ menus.
//
// Run both directions throughout: every case that returns items has a
// matching case that returns none.

import fs from 'fs'
import path from 'path'
import {
  DOCUMENT_ACTION_KEYS,
  DOCUMENT_ACTION_LABELS,
  RESERVATION_ACTION_KEYS,
  RESERVATION_ACTION_LABELS,
  documentRequestActions,
  documentRequestSubject,
  reservationActions,
  reservationSubject,
} from './rowActions'

const keysOf = (items) => items.map((item) => item.key)
const labelsOf = (items) => items.map((item) => item.label)

// Every status the live CHECK on `document_requests.status` permits.
// There is no `released` and no `rejected` on this table.
const DOCUMENT_STATUSES = ['pending', 'approved', 'declined', 'ready_for_pickup', 'claimed']

describe('document request actions, by stored status', () => {
  const secretary = (status, extra = {}) => documentRequestActions({
    status,
    isSecretary: true,
    residentName: 'Ezequel Bautista',
    ...extra,
  })

  it('offers Approve then Decline at pending', () => {
    expect(keysOf(secretary('pending'))).toEqual(['approve', 'decline'])
    expect(labelsOf(secretary('pending'))).toEqual(['Approve', 'Decline'])
  })

  // ⚠️ Decline is the destructive-looking one, and it still opens the
  // existing reason dialog -- the flag is styling, not a shortcut.
  it('marks Decline as the danger item and Approve as not', () => {
    const [approve, decline] = secretary('pending')
    expect(approve.danger).toBeUndefined()
    expect(decline.danger).toBe(true)
  })

  it('offers Mark Ready at approved, and no Approve or Decline', () => {
    const items = secretary('approved')
    expect(keysOf(items)).toEqual(['ready'])
    expect(keysOf(items)).not.toContain('approve')
    expect(keysOf(items)).not.toContain('decline')
  })

  it('offers Mark Claimed at ready_for_pickup', () => {
    expect(keysOf(secretary('ready_for_pickup'))).toEqual(['claimed'])
  })

  // ⚠️ `claimed` is terminal and `declined` is already dealt with, so
  // the list is EMPTY -- and `ActionMenu` renders no trigger for an
  // empty list, which is what keeps a ⋮ from opening on nothing.
  it('offers nothing at claimed or declined', () => {
    expect(secretary('claimed')).toEqual([])
    expect(secretary('declined')).toEqual([])
  })

  it('offers nothing for a status it does not recognise', () => {
    expect(secretary('released')).toEqual([])
    expect(secretary('rejected')).toEqual([])
    expect(secretary(undefined)).toEqual([])
    expect(documentRequestActions()).toEqual([])
  })

  // ⚠️ THE LOAD-BEARING ONE. A menu must never widen what a role can
  // reach, so an action the caller may not perform is ABSENT from the
  // array rather than rendered disabled. Every status, both directions.
  it('offers nothing at all to a non-Secretary, at every status', () => {
    DOCUMENT_STATUSES.forEach((status) => {
      expect(documentRequestActions({
        status,
        isSecretary: false,
        canGenerateDocument: true,
        residentName: 'Ezequel Bautista',
      })).toEqual([])
      // And the same row DOES offer something to the Secretary, so the
      // empty result above is the gate and not an unreachable status.
      if (status !== 'claimed' && status !== 'declined') {
        expect(secretary(status, { canGenerateDocument: true }).length).toBeGreaterThan(0)
      }
    })
  })

  it('defaults isSecretary to false rather than to permission', () => {
    expect(documentRequestActions({ status: 'pending' })).toEqual([])
  })
})

describe('Generate Document is gated only by the answer canGenerate gave', () => {
  const build = (status, canGenerateDocument) => documentRequestActions({
    status,
    isSecretary: true,
    canGenerateDocument,
    residentName: 'Ezequel Bautista',
  })

  // ⚠️ The module re-derives NOTHING about eligibility. It is told, so
  // `documentRegistry.canGenerate` stays the single authority on the
  // Secretary / status / configured-template gates.
  it('appears whenever it is permitted, whatever the status', () => {
    DOCUMENT_STATUSES.forEach((status) => {
      expect(keysOf(build(status, true))).toContain('generate')
    })
  })

  it('is absent whenever it is not permitted, at every status', () => {
    DOCUMENT_STATUSES.forEach((status) => {
      expect(keysOf(build(status, false))).not.toContain('generate')
    })
  })

  it('defaults to absent', () => {
    expect(keysOf(documentRequestActions({ status: 'approved', isSecretary: true })))
      .not.toContain('generate')
  })

  // ⚠️ Primary decisions first. The menu focuses its first item on open,
  // so the order is the only thing deciding what a keyboard user lands
  // on -- and it must not be the one action that decides nothing.
  it('is always the LAST item', () => {
    expect(keysOf(build('approved', true))).toEqual(['ready', 'generate'])
    expect(keysOf(build('ready_for_pickup', true))).toEqual(['claimed', 'generate'])
    expect(keysOf(build('pending', true))).toEqual(['approve', 'decline', 'generate'])
  })
})

describe('the accessible subject', () => {
  it('names the request and the resident', () => {
    expect(documentRequestSubject('Ezequel Bautista'))
      .toBe('document request from Ezequel Bautista')
  })

  // ⚠️ `ActionMenu` composes "<label> <subject>", so these are the
  // sentences a screen reader actually reads. The visible word is the
  // first word of each, which is what WCAG 2.5.3 requires.
  it('reads as English after every document label', () => {
    const subject = documentRequestSubject('Ezequel Bautista')
    expect(`${DOCUMENT_ACTION_LABELS.approve} ${subject}`)
      .toBe('Approve document request from Ezequel Bautista')
    expect(`${DOCUMENT_ACTION_LABELS.decline} ${subject}`)
      .toBe('Decline document request from Ezequel Bautista')
  })

  // ⚠️ THE REASON THE PER-ITEM OVERRIDE EXISTS. The shared subject
  // after this label reads "Generate Document document request from
  // ...", which is why Generate carries its own.
  it('gives Generate Document its own subject, still as a suffix', () => {
    const [generate] = documentRequestActions({
      status: 'approved',
      isSecretary: true,
      canGenerateDocument: true,
      residentName: 'Ezequel Bautista',
    }).filter((item) => item.key === 'generate')
    expect(generate.subject).toBe('for Ezequel Bautista')
    expect(`${generate.label} ${generate.subject}`)
      .toBe('Generate Document for Ezequel Bautista')
    // A suffix, never a replacement: the visible words still start it.
    expect(`${generate.label} ${generate.subject}`.startsWith(generate.label)).toBe(true)
  })

  it('carries no item subject on the decisions, so the menu-level one is used', () => {
    documentRequestActions({ status: 'pending', isSecretary: true, residentName: 'X' })
      .forEach((item) => expect(item.subject).toBeUndefined())
  })

  // ⚠️ Never "from undefined", and never a claim the row cannot support.
  it('falls back to a reference to the row, not to a name', () => {
    expect(documentRequestSubject(undefined)).toBe('document request from this resident')
    expect(documentRequestSubject('   ')).toBe('document request from this resident')
    expect(documentRequestSubject(null)).toBe('document request from this resident')
  })

  it('dates a reservation when the date reads, and names it when it does not', () => {
    expect(reservationSubject({ dateLabel: '10 October 2026', residentName: 'Maria Cruz' }))
      .toBe('reservation on 10 October 2026')
    // `longDate` returns '' for anything parseDateKey refuses, which is
    // the case this branch exists for.
    expect(reservationSubject({ dateLabel: '', residentName: 'Maria Cruz' }))
      .toBe('reservation for Maria Cruz')
    expect(reservationSubject({})).toBe('reservation for this resident')
    expect(reservationSubject()).toBe('reservation for this resident')
  })

  it('reads as English after every reservation label', () => {
    const subject = reservationSubject({ dateLabel: '10 October 2026' })
    expect(`${RESERVATION_ACTION_LABELS.approve} ${subject}`)
      .toBe('Approve reservation on 10 October 2026')
    expect(`${RESERVATION_ACTION_LABELS.deny} ${subject}`)
      .toBe('Deny reservation on 10 October 2026')
  })
})

describe('reservation actions', () => {
  it('offers Approve then Deny to the Treasurer at pending', () => {
    const items = reservationActions({ status: 'pending', isTreasurer: true })
    expect(keysOf(items)).toEqual(['approve', 'deny'])
    expect(labelsOf(items)).toEqual(['Approve', 'Deny'])
    expect(items[1].danger).toBe(true)
  })

  // ⚠️ Unchanged from the buttons: only the Treasurer decides, which is
  // the same position the `reservations` UPDATE policy requires.
  it('offers nothing to any other official, and nothing anonymous', () => {
    expect(reservationActions({ status: 'pending', isTreasurer: false })).toEqual([])
    expect(reservationActions({ status: 'pending' })).toEqual([])
    expect(reservationActions()).toEqual([])
  })

  // ⚠️ `declined` and `cancelled` released their slot and `approved` is
  // decided; none of them is re-decidable, and there is no re-decide
  // path by design.
  it('offers nothing for a decided booking, even to the Treasurer', () => {
    ;['approved', 'declined', 'cancelled', undefined, 'nonsense'].forEach((status) => {
      expect(reservationActions({ status, isTreasurer: true })).toEqual([])
    })
  })

  // The words are the ones the buttons carried. "Deny" rather than
  // "Decline" on reservations is pre-existing and was not renamed here.
  it('keeps Deny, not Decline, on reservations', () => {
    expect(RESERVATION_ACTION_LABELS.deny).toBe('Deny')
    expect(DOCUMENT_ACTION_LABELS.decline).toBe('Decline')
  })
})

// ─── The wiring, read from the dashboard ──────────────────────────────
//
// ⚠️ These rules can be right and wired to nothing. A key this module
// emits with no handler behind it gives a menu item that silently does
// nothing when chosen, which is worse than no item -- so the keys are
// checked against the dashboard's own maps.
describe('every key this module emits is wired in the dashboard', () => {
  const OFFICIAL = fs.readFileSync(
    path.join(__dirname, '..', 'dashboards', 'OfficialDashboard.jsx'),
    'utf8',
  )

  const mapBody = (name) => {
    const start = OFFICIAL.indexOf(`const ${name} = {`)
    expect(start).toBeGreaterThan(-1)
    return OFFICIAL.slice(start, OFFICIAL.indexOf('\n  }', start))
  }

  it('has a document handler for each document key', () => {
    const body = mapBody('docActionHandlers')
    DOCUMENT_ACTION_KEYS.forEach((key) => expect(body).toContain(`${key}:`))
  })

  it('has a reservation handler for each reservation key', () => {
    const body = mapBody('reservationActionHandlers')
    RESERVATION_ACTION_KEYS.forEach((key) => expect(body).toContain(`${key}:`))
  })

  it('has an icon for each key of both', () => {
    const docIcons = mapBody('DOC_ACTION_ICONS')
    DOCUMENT_ACTION_KEYS.forEach((key) => expect(docIcons).toContain(`${key}:`))
    const resIcons = mapBody('RESERVATION_ACTION_ICONS')
    RESERVATION_ACTION_KEYS.forEach((key) => expect(resIcons).toContain(`${key}:`))
  })

  // ⚠️ The handlers are the EXISTING ones. A menu item that called a
  // new write path would be a second answer for how a request is
  // approved, and RLS has only ever been checked against the first.
  it('routes the document items to the handlers the buttons called', () => {
    const body = mapBody('docActionHandlers')
    expect(body).toContain("handleUpdateDocRequestStatus(req, 'approved')")
    expect(body).toContain("handleUpdateDocRequestStatus(req, 'ready_for_pickup')")
    expect(body).toContain('handleOpenDeclineRequest(req)')
    expect(body).toContain('handleMarkDocRequestClaimed(req)')
    expect(body).toContain('setDocumentRequestToPrint(req)')
  })

  it('routes the reservation items to the existing decision handlers', () => {
    const body = mapBody('reservationActionHandlers')
    expect(body).toContain('handleApproveReservation(res)')
    expect(body).toContain('handleDeclineReservation(res)')
  })

  // ⚠️ The position gates are untouched, and both cells still render
  // their existing note for an official who lacks the position.
  it('still gates both cells on the unchanged position flags', () => {
    expect(OFFICIAL).toMatch(
      /const isSecretary = officialInfo\?\.position === 'Barangay Secretary'/,
    )
    expect(OFFICIAL).toMatch(
      /const isTreasurer = officialInfo\?\.position === 'Barangay Treasurer'/,
    )
    expect(OFFICIAL).toContain('<span className="role-restricted-note">Secretary only</span>')
    expect(OFFICIAL).toContain('<span className="role-restricted-note">Treasurer only</span>')
  })

  // ⚠️ `portal` is required in a table: `.table-wrapper` has
  // `overflow: auto` and clips an absolutely-positioned menu, which was
  // measured at 69px past the wrapper and not painted at all.
  it('passes portal on both queue menus', () => {
    const docMenu = OFFICIAL.slice(
      OFFICIAL.indexOf('items={docRequestMenuItems(req)}') - 400,
      OFFICIAL.indexOf('items={docRequestMenuItems(req)}'),
    )
    expect(docMenu).toContain('portal')
    const resMenu = OFFICIAL.slice(
      OFFICIAL.indexOf('items={reservationMenuItems(res)}') - 400,
      OFFICIAL.indexOf('items={reservationMenuItems(res)}'),
    )
    expect(resMenu).toContain('portal')
  })

  // ⚠️ No item carries a `disabled` flag, because `ActionMenu` has no
  // such state by design -- an action a role may not perform is absent.
  // The double-write protection is the handlers' own processing sets,
  // which are still there.
  it('keeps the re-entrancy guards that the disabled attribute was not', () => {
    expect(OFFICIAL).toContain('if (processingDocRequestIds.has(requestId)) return')
    expect(OFFICIAL).toContain('if (processingReservationIds.has(reservation.id)) return')
  })
})
