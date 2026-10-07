// Which actions a dashboard row offers, and what each one is called.
//
// Pure, and it exists for the reason `residentGroups.js` and
// `reservationWindow.js` do: the Official Dashboard is ~4,900 lines and
// imports the Supabase client, so a rule written inside it can only be
// checked by reading it. The rules here are checked by running them.
//
// ─── ⚠️ WHAT THIS OWNS, AND WHAT IT MUST NOT ──────────────────────────
//
// It owns the SHAPE of the row's action list: which keys appear at which
// stored status, the words on them, their order, and the accessible
// subject each one is announced with. It owns no handler, no icon, no
// Supabase call and no permission of its own -- `isSecretary` and
// `isTreasurer` are passed in, derived in the dashboard from the exact
// same `barangay_officials.position` values the RLS policies require.
//
// ⚠️ IT DOES NOT DECIDE WHETHER A DOCUMENT MAY BE GENERATED.
// `documentRegistry.canGenerate` carries all three of those gates
// (Secretary, an eligible status, a configured template) and stays the
// only authority on it; the answer arrives here as
// `canGenerateDocument`. Re-deriving it from `status` would give one
// rule two homes, which is the drift this project keeps paying for.
//
// ─── ⚠️ AN ABSENT ACTION, NEVER A DISABLED ONE ────────────────────────
//
// An action a role may not perform is simply NOT IN THE ARRAY. That is
// `ActionMenu`'s own rule -- a menu must never widen what a role can
// reach, and a disabled item still tells the reader the action exists
// for them. A non-Secretary gets an empty list for a document request;
// a non-Treasurer gets an empty list for a reservation. The dashboard
// renders its existing "Secretary only" / "Treasurer only" note in that
// case, exactly as the buttons did.
//
// ─── ⚠️ PRIMARY DECISIONS COME FIRST ──────────────────────────────────
//
// Approve and Decline are what an official opened the queue for, so
// they are the first items in the list and Generate Document is last.
// The menu focuses its first item on open, so ordering is the only
// thing that decides what a keyboard user lands on.

// The visible words. Short on screen on purpose: the table's own column
// headings and the row the menu sits in already say what the object is,
// so "Approve document request" would be read past on every line. The
// row goes back into the ACCESSIBLE name through `subject` below.
export const DOCUMENT_ACTION_LABELS = {
  approve: 'Approve',
  decline: 'Decline',
  ready: 'Mark Ready',
  claimed: 'Mark Claimed',
  generate: 'Generate Document',
}

export const RESERVATION_ACTION_LABELS = {
  approve: 'Approve',
  deny: 'Deny',
}

// Every key either builder can emit. The dashboard maps these to its
// existing handlers, and a test asserts it has an entry for each -- so a
// key added here cannot reach a menu with nothing behind it.
export const DOCUMENT_ACTION_KEYS = Object.keys(DOCUMENT_ACTION_LABELS)
export const RESERVATION_ACTION_KEYS = Object.keys(RESERVATION_ACTION_LABELS)

// ─── The accessible subject ───────────────────────────────────────────
//
// `ActionMenu` announces each item as "<label> <subject>", so "Approve"
// is heard as "Approve document request from Ezequel Bautista". A screen
// reader does not have the row for context; a sighted reader does, which
// is the whole reason the two differ.
//
// ⚠️ A missing name still produces a readable sentence rather than
// "Approve document request from undefined". It names no value the row
// does not hold -- "this resident" is a reference to the row, not a
// claim about who filed it.
const nameOr = (name, fallback) => {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return trimmed || fallback
}

export const documentRequestSubject = (residentName) =>
  `document request from ${nameOr(residentName, 'this resident')}`

// Dated when the date is readable, named when it is not. The caller
// passes an already-formatted label, because turning 'YYYY-MM-DD' into
// words is `monthGrid.parseDateKey`'s job and nothing here may hand a
// date string to `new Date()`.
export const reservationSubject = ({ dateLabel, residentName } = {}) => {
  const date = typeof dateLabel === 'string' ? dateLabel.trim() : ''
  return date
    ? `reservation on ${date}`
    : `reservation for ${nameOr(residentName, 'this resident')}`
}

// ─── Document requests ────────────────────────────────────────────────
//
// The live CHECK on `document_requests.status` is pending / approved /
// declined / ready_for_pickup / claimed. There is no `released` and no
// `rejected` on this table, and `claimed` is terminal -- so `claimed`
// and `declined` offer nothing, and the menu renders no trigger at all
// rather than an empty one.
export const documentRequestActions = ({
  status,
  isSecretary = false,
  canGenerateDocument = false,
  residentName,
} = {}) => {
  if (!isSecretary) return []

  const items = []

  if (status === 'pending') {
    items.push({ key: 'approve', label: DOCUMENT_ACTION_LABELS.approve })
    // Danger styling only; it still opens the existing reason dialog,
    // which is where the required decline reason is collected.
    items.push({ key: 'decline', label: DOCUMENT_ACTION_LABELS.decline, danger: true })
  }

  if (status === 'approved') {
    items.push({ key: 'ready', label: DOCUMENT_ACTION_LABELS.ready })
  }

  if (status === 'ready_for_pickup') {
    items.push({ key: 'claimed', label: DOCUMENT_ACTION_LABELS.claimed })
  }

  // ⚠️ Last, and gated only by the answer `canGenerate` already gave.
  //
  // ⚠️ Its subject is its OWN, because the shared one does not read as
  // English after this label: "Generate Document document request from
  // Ezequel Bautista". It is still a suffix to the visible words, never
  // a replacement for them -- WCAG 2.5.3 means somebody saying "click
  // Generate Document" has to match.
  if (canGenerateDocument) {
    items.push({
      key: 'generate',
      label: DOCUMENT_ACTION_LABELS.generate,
      subject: `for ${nameOr(residentName, 'this resident')}`,
    })
  }

  return items
}

// ─── Court reservations ───────────────────────────────────────────────
//
// Only `pending` is decidable, and only the Treasurer decides it --
// unchanged, and the same position the `reservations` UPDATE policy
// requires. An approved, declined or cancelled booking offers nothing.
export const reservationActions = ({ status, isTreasurer = false } = {}) => {
  if (!isTreasurer || status !== 'pending') return []
  return [
    { key: 'approve', label: RESERVATION_ACTION_LABELS.approve },
    { key: 'deny', label: RESERVATION_ACTION_LABELS.deny, danger: true },
  ]
}

// ─── ⚠️ A CARD WITH AN "ACTION" LABEL AND NOTHING UNDER IT ────────────
//
// Below 769px `Sidebar.css`'s protected table-to-card block turns every
// row into a card and prints each cell's `data-label` as a heading
// through `td::before`. The Action cell is always in the markup --
// desktop needs it for the column -- so a row with nothing to offer
// showed the word ACTION with empty space beneath it, which reads as a
// control that failed to render.
//
// ⚠️ "No items" is NOT the same as "nothing to show". An official who
// lacks the position still gets the existing "Secretary only" /
// "Treasurer only" note in that cell, and that note is exactly what the
// label belongs to -- hiding it would remove the one line explaining
// why there are no controls. So the question this answers is whether
// the cell renders ANYTHING, not whether the menu has items.
//
// Pure and unit-tested, rather than an inline `&&` in the JSX, because
// getting it backwards hides the note instead of the gap and nothing
// about the markup would say so.
export const actionCellIsEmpty = ({ itemCount = 0, noteShown = false } = {}) =>
  !noteShown && (itemCount || 0) === 0
