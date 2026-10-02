// Narrowing the public medicine list, and counting what is in it.
//
// Pure, and it REUSES `filterRows` from `residentGroups.js` rather than
// normalising a search string again -- the same reason
// `filterDocumentRequests` lives beside it. Two search boxes that
// normalise differently is a defect nobody reports, because each one
// looks right on its own.
//
// ⚠️ Nothing here is a promise about stock. The underlying rule stands:
// medicine availability is a STATUS and never a quantity, because a
// published count is a promise the barangay cannot keep without
// logging every tablet dispensed. These functions narrow and count
// ROWS -- "4 medicines listed as available" is a count of list
// entries, not of boxes on a shelf, and the wording on the page says
// so.

import { MEDICINE_CATEGORIES, MEDICINE_STATUS } from '../constants/medicines'
import { filterRows } from './residentGroups'

// What a resident might type: the medicine, what it is for, and the
// form they were told to ask for.
export const MEDICINE_SEARCH_FIELDS = ['name', 'generic_name', 'category', 'form', 'notes']

// ⚠️ An unrecognised category or status matches NOTHING rather than
// everything. A filter that silently stops filtering is worse than one
// that shows an empty list -- the direction `documentFilter.test.js`
// already pins for the document queue.
export const filterMedicines = (
  list = [],
  { query = '', category = 'all', status = 'all' } = {},
) => {
  let rows = list || []
  if (category !== 'all') rows = rows.filter((row) => row?.category === category)
  if (status !== 'all') rows = rows.filter((row) => row?.status === status)
  return filterRows(rows, { query, fields: MEDICINE_SEARCH_FIELDS })
}

// ⚠️ A row whose category is not on the barangay's list is NOT dropped.
// It lands under 'Other', the same place `HealthCenter` already put it,
// because a medicine missing from every group makes the totals
// silently short -- the rule `residentGroups` states for an
// unrecognised verification status.
export const categoryOf = (medicine) =>
  MEDICINE_CATEGORIES.includes(medicine?.category) ? medicine.category : 'Other'

// Groups in the catalogue's own order, and only the ones that have
// something in them.
export const groupByCategory = (list = []) => {
  const groups = new Map()
  ;(list || []).forEach((medicine) => {
    const key = categoryOf(medicine)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(medicine)
  })
  return MEDICINE_CATEGORIES
    .filter((category) => groups.has(category))
    .map((category) => [category, groups.get(category)])
}

// How many rows sit at each status, plus the total. Read by the
// summary line, so the three numbers and the badges below them come
// from one pass over one list.
export const countByStatus = (list = []) => {
  const counts = { total: 0 }
  Object.keys(MEDICINE_STATUS).forEach((key) => { counts[key] = 0 })
  ;(list || []).forEach((medicine) => {
    counts.total += 1
    // The same fallback `statusOf` applies: a row written before a
    // status existed counts as out of stock rather than vanishing.
    const key = Object.prototype.hasOwnProperty.call(MEDICINE_STATUS, medicine?.status)
      ? medicine.status
      : 'unavailable'
    counts[key] += 1
  })
  return counts
}

// ─── Which category groups are open ──────────────────────────────────
//
// The collapsible groups exist to shorten a page that was unreadably
// long, so leaving every one of them open by default defeats the thing
// they were added for. The first group is open and the rest are folded.
export const DEFAULT_OPEN_CATEGORY_COUNT = 1

// ⚠️ WHILE A FILTER IS APPLIED, EVERY RENDERED GROUP IS OPEN, AND THAT
// IS NOT A CONVENIENCE.
//
// `filterMedicines` has already removed everything that does not match,
// so every row still in `medicinesByCategory` IS a match. A collapsed
// group would therefore hide a medicine that the page has just counted
// as a result -- "Showing 1 of 6 medicines" above a screen with no
// medicine on it. A resident searching for Paracetamol would read that
// as the health centre not having it.
//
// `overrides` carries only the groups the reader has actually clicked.
// An absent key means "never touched", which is what lets the default
// differ per group; `hasOwnProperty` rather than a bare lookup, for the
// reason `officialPhotos.hasBundledPhoto` uses it -- a bare lookup
// answers for `toString`.
export const isCategoryOpen = ({
  index = 0,
  category,
  overrides = {},
  isFiltered = false,
} = {}) => {
  if (isFiltered) return true
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, category)) {
    return Boolean(overrides[category])
  }
  return index < DEFAULT_OPEN_CATEGORY_COUNT
}
