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
  actionCellIsEmpty,
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
    // Every <ActionMenu ... /> element, sliced to its own closing tag,
    // so neither assertion depends on how the items are spelled at the
    // call site -- the shape the first version of this test did depend
    // on, and which the card-mode pass then changed.
    const elements = []
    for (let at = OFFICIAL.indexOf('<ActionMenu'); at > -1;
      at = OFFICIAL.indexOf('<ActionMenu', at + 1)) {
      elements.push(OFFICIAL.slice(at, OFFICIAL.indexOf('/>', at)))
    }
    const queue = elements.filter((el) =>
      el.includes('documentRequestSubject') || el.includes('reservationSubject'))
    expect(queue).toHaveLength(2)
    // ⚠️ `.table-wrapper` has `overflow: auto` and clips an
    // absolutely-positioned menu -- measured at 69px past the wrapper
    // and not painted at all. `portal` is what lifted that.
    queue.forEach((el) => expect(el).toMatch(/\bportal\b/))
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

// ─── The card-mode ACTION heading ─────────────────────────────────────
//
// ⚠️ Getting this backwards hides the "Secretary only" note instead of
// the gap, and nothing in the markup would say so -- which is why the
// rule is a function with tests rather than an `&&` in the JSX.
describe('whether a row has an empty action cell', () => {
  it('is empty when there are no items and no note', () => {
    expect(actionCellIsEmpty({ itemCount: 0, noteShown: false })).toBe(true)
    expect(actionCellIsEmpty({})).toBe(true)
    expect(actionCellIsEmpty()).toBe(true)
  })

  it('is NOT empty when the menu has items', () => {
    expect(actionCellIsEmpty({ itemCount: 1, noteShown: false })).toBe(false)
    expect(actionCellIsEmpty({ itemCount: 3, noteShown: false })).toBe(false)
  })

  // ⚠️ THE LOAD-BEARING ONE. An official who lacks the position gets no
  // items AND the note explaining why. The heading belongs to that
  // note, so the cell is not empty -- hiding it would remove the one
  // line saying why there are no controls.
  it('is NOT empty when the role note is shown, even with no items', () => {
    expect(actionCellIsEmpty({ itemCount: 0, noteShown: true })).toBe(false)
  })

  // The real rows, composed the way the dashboard composes them.
  const docRowIsEmpty = (status, isSecretary, canGenerateDocument = false) =>
    actionCellIsEmpty({
      itemCount: documentRequestActions({ status, isSecretary, canGenerateDocument }).length,
      noteShown: !isSecretary,
    })

  it('collapses a claimed or declined document row for the Secretary', () => {
    expect(docRowIsEmpty('claimed', true)).toBe(true)
    expect(docRowIsEmpty('declined', true)).toBe(true)
  })

  it('keeps every actionable document row', () => {
    expect(docRowIsEmpty('pending', true)).toBe(false)
    expect(docRowIsEmpty('approved', true)).toBe(false)
    expect(docRowIsEmpty('ready_for_pickup', true)).toBe(false)
    // And one that is actionable ONLY because a document may be printed.
    expect(docRowIsEmpty('approved', true, true)).toBe(false)
  })

  it('keeps every document row for a non-Secretary, note and all', () => {
    DOCUMENT_STATUSES.forEach((status) => {
      expect(docRowIsEmpty(status, false)).toBe(false)
    })
  })

  const resRowIsEmpty = (status, isTreasurer) =>
    actionCellIsEmpty({
      itemCount: reservationActions({ status, isTreasurer }).length,
      noteShown: status === 'pending' && !isTreasurer,
    })

  it('collapses a decided reservation row for everybody', () => {
    ;['approved', 'declined', 'cancelled'].forEach((status) => {
      expect(resRowIsEmpty(status, true)).toBe(true)
      expect(resRowIsEmpty(status, false)).toBe(true)
    })
  })

  it('keeps a pending reservation row for the Treasurer and for anybody else', () => {
    expect(resRowIsEmpty('pending', true)).toBe(false)
    // The note, not a menu -- but still something the heading names.
    expect(resRowIsEmpty('pending', false)).toBe(false)
  })
})

// ⚠️ The class is only half of it: the CSS has to collapse the heading
// AND the divider that the protected block leaves on the cell before a
// hidden one, and it must do neither above 768px.
describe('the card-mode rule is wired and scoped', () => {
  const CSS = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'Sidebar.css'), 'utf8',
  )
  const OFFICIAL = fs.readFileSync(
    path.join(__dirname, '..', 'dashboards', 'OfficialDashboard.jsx'), 'utf8',
  )

  it('marks the row from the shared predicate in both queues', () => {
    expect(OFFICIAL.match(/actionCellIsEmpty\(\{/g)).toHaveLength(2)
    expect(OFFICIAL.match(/'row-no-actions'/g)).toHaveLength(2)
  })

  it('hides the cell and the divider above it', () => {
    expect(CSS).toContain('.dashboard-table tr.row-no-actions td:last-child')
    expect(CSS).toContain('.dashboard-table tr.row-no-actions td:nth-last-child(2)')
  })

  // ⚠️ Inside the media query, so the desktop column is untouched. The
  // rule sits AFTER the protected mobile table-to-card block, which is
  // not edited.
  //
  // ⚠️ COMMENTS ARE STRIPPED FIRST, and the first version of this test
  // did not strip them -- so it PASSED with the rule moved outside the
  // media query entirely. The explanatory comment above the rule says
  // the words `@media (max-width: 768px)`, and `lastIndexOf` was
  // finding that sentence rather than a real at-rule. The project's own
  // rule: ask which step produced the result.
  it('applies only below 769px', () => {
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = code.indexOf('.dashboard-table tr.row-no-actions')
    expect(at).toBeGreaterThan(-1)
    const query = code.lastIndexOf('@media (max-width: 768px)', at)
    expect(query).toBeGreaterThan(-1)
    // Nothing closes that query between it and the rule.
    expect(code.slice(query, at)).not.toContain('\n}')
  })
})
