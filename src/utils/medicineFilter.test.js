import { MEDICINE_CATEGORIES } from '../constants/medicines'
import {
  MEDICINE_SEARCH_FIELDS,
  categoryOf,
  countByStatus,
  filterMedicines,
  groupByCategory,
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
