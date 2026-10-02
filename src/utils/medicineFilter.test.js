import { MEDICINE_CATEGORIES } from '../constants/medicines'
import {
  DEFAULT_OPEN_CATEGORY_COUNT,
  MEDICINE_SEARCH_FIELDS,
  categoryOf,
  countByStatus,
  filterMedicines,
  groupByCategory,
  isCategoryOpen,
} from './medicineFilter'

const LIST = [
  { name: 'Paracetamol', generic_name: 'Paracetamol', category: 'Pain & Fever', form: 'Tablet', status: 'available', notes: 'For fever' },
  { name: 'Biogesic', generic_name: 'Paracetamol', category: 'Pain & Fever', form: 'Syrup', status: 'low', notes: '' },
  { name: 'Amoxicillin', generic_name: 'Amoxicillin', category: 'Antibiotics', form: 'Capsule', status: 'unavailable', notes: 'Prescription only' },
  { name: 'Losartan', generic_name: 'Losartan', category: 'Maintenance', form: 'Tablet', status: 'available', notes: '' },
  { name: 'Ascorbic Acid', generic_name: 'Vitamin C', category: 'Vitamins', form: 'Tablet', status: 'available', notes: '' },
  { name: 'Mystery Sachet', generic_name: '', category: 'Herbal Remedies', form: 'Sachet', status: 'available', notes: '' },
]

describe('filterMedicines', () => {
  it('returns everything when nothing is applied', () => {
    expect(filterMedicines(LIST)).toHaveLength(LIST.length)
    expect(filterMedicines(LIST, {})).toHaveLength(LIST.length)
  })

  it('narrows by category', () => {
    expect(filterMedicines(LIST, { category: 'Pain & Fever' }).map((m) => m.name))
      .toEqual(['Paracetamol', 'Biogesic'])
  })

  it('narrows by status', () => {
    expect(filterMedicines(LIST, { status: 'available' })).toHaveLength(4)
    expect(filterMedicines(LIST, { status: 'low' }).map((m) => m.name)).toEqual(['Biogesic'])
  })

  // ⚠️ The direction that fails open. A filter that silently stops
  // filtering shows a resident a list that does not answer what they
  // asked -- the same guard documentFilter.test.js holds for the
  // document queue.
  it('matches NOTHING for an unrecognised category or status', () => {
    expect(filterMedicines(LIST, { category: 'Not A Category' })).toEqual([])
    expect(filterMedicines(LIST, { status: 'half-available' })).toEqual([])
  })

  it('searches every field it claims to', () => {
    MEDICINE_SEARCH_FIELDS.forEach((field) => {
      const row = LIST.find((m) => m[field])
      if (!row) return
      expect(filterMedicines(LIST, { query: String(row[field]) }).length)
        .toBeGreaterThan(0)
    })
  })

  // The reason this reuses residentGroups.filterRows rather than
  // normalising again: two search boxes that normalise differently is a
  // defect nobody reports, because each one looks right on its own.
  it('ignores case and surrounding whitespace, like every other search', () => {
    expect(filterMedicines(LIST, { query: '  PARACETAMOL ' })).toHaveLength(2)
  })

  it('finds a brand by its generic name, which is what a resident is told', () => {
    expect(filterMedicines(LIST, { query: 'paracetamol' }).map((m) => m.name))
      .toEqual(['Paracetamol', 'Biogesic'])
  })

  it('composes the three narrowings', () => {
    expect(filterMedicines(LIST, { category: 'Pain & Fever', status: 'available', query: 'para' })
      .map((m) => m.name)).toEqual(['Paracetamol'])
  })

  it('survives no list at all', () => {
    expect(filterMedicines()).toEqual([])
    expect(filterMedicines(null, { query: 'x' })).toEqual([])
  })
})

describe('categoryOf', () => {
  it('keeps a category the barangay list holds', () => {
    MEDICINE_CATEGORIES.forEach((category) => {
      expect(categoryOf({ category })).toBe(category)
    })
  })

  // ⚠️ Never dropped. A medicine missing from every group makes the
  // totals silently short -- the rule residentGroups states for an
  // unrecognised verification status, applied here.
  it('files an unrecognised category under Other rather than dropping it', () => {
    expect(categoryOf({ category: 'Herbal Remedies' })).toBe('Other')
    expect(categoryOf({ category: '' })).toBe('Other')
    expect(categoryOf({})).toBe('Other')
    expect(categoryOf(null)).toBe('Other')
  })
})

describe('groupByCategory', () => {
  it('uses the catalogue order, not the order rows arrived in', () => {
    const order = groupByCategory(LIST).map(([category]) => category)
    const expected = MEDICINE_CATEGORIES.filter((c) => order.includes(c))
    expect(order).toEqual(expected)
  })

  it('omits a category with nothing in it', () => {
    expect(groupByCategory(LIST).map(([c]) => c)).not.toContain('Allergy & Cough')
  })

  it('loses no medicine between the list and the groups', () => {
    const grouped = groupByCategory(LIST).flatMap(([, items]) => items)
    expect(grouped).toHaveLength(LIST.length)
  })

  it('puts the off-list medicine in Other', () => {
    const other = groupByCategory(LIST).find(([c]) => c === 'Other')
    expect(other[1].map((m) => m.name)).toEqual(['Mystery Sachet'])
  })

  it('survives no list', () => {
    expect(groupByCategory()).toEqual([])
    expect(groupByCategory([])).toEqual([])
  })
})

describe('countByStatus', () => {
  it('counts each status and the total', () => {
    expect(countByStatus(LIST)).toEqual({
      total: 6, available: 4, low: 1, unavailable: 1,
    })
  })

  // Same fallback statusOf() uses: a row written before a status
  // existed counts as out of stock rather than vanishing from the
  // totals.
  it('counts an unknown status as out of stock rather than losing it', () => {
    const counts = countByStatus([{ status: 'mystery' }, { status: null }, {}])
    expect(counts.total).toBe(3)
    expect(counts.unavailable).toBe(3)
  })

  it('always sums to the total', () => {
    const c = countByStatus(LIST)
    expect(c.available + c.low + c.unavailable).toBe(c.total)
  })

  it('is all zeroes for no list', () => {
    expect(countByStatus()).toEqual({ total: 0, available: 0, low: 0, unavailable: 0 })
  })
})

describe('isCategoryOpen', () => {
  // The groups exist to shorten the page. Leaving them all open
  // defeats the thing they were added for.
  it('opens the first group and folds the rest by default', () => {
    expect(isCategoryOpen({ index: 0, category: 'Pain & Fever' })).toBe(true)
    expect(isCategoryOpen({ index: 1, category: 'Antibiotics' })).toBe(false)
    expect(isCategoryOpen({ index: 5, category: 'Vitamins' })).toBe(false)
  })

  it('opens exactly as many groups as the default says', () => {
    expect(DEFAULT_OPEN_CATEGORY_COUNT).toBe(1)
  })

  // ⚠️ THE LOAD-BEARING ONE. `filterMedicines` has already dropped
  // everything that does not match, so every group still rendered IS a
  // match. A collapsed group would hide a medicine the page has just
  // counted as a result -- "Showing 1 of 6" over an empty screen, which
  // a resident reads as the health centre not having it.
  it('opens EVERY group while a filter is applied, whatever its index', () => {
    expect(isCategoryOpen({ index: 3, category: 'Vitamins', isFiltered: true })).toBe(true)
    expect(isCategoryOpen({ index: 9, category: 'Other', isFiltered: true })).toBe(true)
  })

  // ⚠️ And a filter overrides a collapse the reader asked for, in
  // that direction only. The alternative is a match that exists in the
  // results and cannot be seen.
  it('opens a group the reader collapsed, once a filter is applied', () => {
    const overrides = { Vitamins: false }
    expect(isCategoryOpen({ index: 2, category: 'Vitamins', overrides })).toBe(false)
    expect(isCategoryOpen({
      index: 2, category: 'Vitamins', overrides, isFiltered: true,
    })).toBe(true)
  })

  it('honours an override in both directions when nothing is filtered', () => {
    expect(isCategoryOpen({ index: 0, category: 'Pain & Fever', overrides: { 'Pain & Fever': false } }))
      .toBe(false)
    expect(isCategoryOpen({ index: 4, category: 'Vitamins', overrides: { Vitamins: true } }))
      .toBe(true)
  })

  // An absent key means "never touched", which is what lets the
  // default differ per group. A plain collapsed-by-key map could not
  // tell that apart from "deliberately open".
  it('tells an untouched group apart from one explicitly opened', () => {
    expect(isCategoryOpen({ index: 2, category: 'Vitamins', overrides: {} })).toBe(false)
    expect(isCategoryOpen({ index: 2, category: 'Vitamins', overrides: { Vitamins: true } }))
      .toBe(true)
  })

  // `hasOwnProperty`, not a bare lookup -- the defect
  // `officialPhotos.hasBundledPhoto` exists to avoid.
  it('does not answer for an inherited property name', () => {
    expect(isCategoryOpen({ index: 3, category: 'toString', overrides: {} })).toBe(false)
    expect(isCategoryOpen({ index: 0, category: 'toString', overrides: {} })).toBe(true)
  })

  it('survives no arguments at all', () => {
    expect(isCategoryOpen()).toBe(true)
    expect(isCategoryOpen({})).toBe(true)
  })
})
