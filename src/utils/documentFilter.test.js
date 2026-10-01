// The Official Portal's Document Requests queue: search and status.
//
// This queue had no search and no filter at all -- an official scrolled
// the whole table looking for one resident. The composition is a pure
// function so the combinations can be asserted here rather than only
// clicked; the reservation queue composes its filters inline in the
// dashboard, which is why that pair has no equivalent test.
//
// Pure module, no Supabase import, so these run without the environment
// variables App.test.js needs.

import { DOCUMENT_SEARCH_FIELDS, filterDocumentRequests } from './residentGroups'

const req = (over = {}) => ({
  id: 'r1',
  full_name: 'Juan Dela Cruz',
  document_type: 'Barangay Clearance',
  purpose: 'Employment requirement',
  contact_number: '09171234567',
  purok: 'Purok 3',
  status: 'pending',
  ...over,
})

const LIST = [
  req({ id: '1' }),
  req({ id: '2', full_name: 'Maria Santos', document_type: 'Certificate of Indigency', purpose: 'Hospital assistance', status: 'approved', purok: 'Purok 5' }),
  req({ id: '3', full_name: 'Pedro Reyes', document_type: 'Barangay Clearance', purpose: 'Scholarship application', status: 'ready_for_pickup' }),
  req({ id: '4', full_name: 'Ana Lim', document_type: 'Business Permit', purpose: 'Sari-sari store', status: 'claimed' }),
  req({ id: '5', full_name: 'Jose Cruz', document_type: 'Certificate of Residency', purpose: 'Employment requirement', status: 'declined' }),
]
const ids = (rows) => rows.map((r) => r.id)

describe('what can be searched', () => {
  it('searches the resident name', () => {
    expect(ids(filterDocumentRequests(LIST, { query: 'maria' }))).toEqual(['2'])
  })

  it('searches the document type', () => {
    expect(ids(filterDocumentRequests(LIST, { query: 'clearance' }))).toEqual(['1', '3'])
  })

  it('searches the purpose', () => {
    // Two different residents asking for different documents for the
    // same reason -- the purpose is often the only thing that tells two
    // otherwise identical requests apart.
    expect(ids(filterDocumentRequests(LIST, { query: 'employment' }))).toEqual(['1', '5'])
  })

  it('searches the contact number and purok too', () => {
    expect(ids(filterDocumentRequests(LIST, { query: '09171234567' })).length).toBe(5)
    expect(ids(filterDocumentRequests(LIST, { query: 'Purok 5' }))).toEqual(['2'])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(ids(filterDocumentRequests(LIST, { query: '  MARIA  ' }))).toEqual(['2'])
  })

  it('names the fields it searches, so the label can describe them', () => {
    expect(DOCUMENT_SEARCH_FIELDS).toEqual(
      ['full_name', 'document_type', 'purpose', 'contact_number', 'purok']
    )
  })
})

describe('the status filter', () => {
  it('narrows to one stored status', () => {
    expect(ids(filterDocumentRequests(LIST, { status: 'pending' }))).toEqual(['1'])
    expect(ids(filterDocumentRequests(LIST, { status: 'ready_for_pickup' }))).toEqual(['3'])
  })

  it('"all" means no narrowing', () => {
    expect(filterDocumentRequests(LIST, { status: 'all' })).toHaveLength(5)
  })

  it('matches nothing for a status the queue does not use', () => {
    // Deliberately not a fallback to everything: a filter that silently
    // stops filtering is worse than one that shows an empty list.
    expect(filterDocumentRequests(LIST, { status: 'nonsense' })).toEqual([])
  })
})

describe('the two compose', () => {
  it('applies status AND search together', () => {
    // "clearance" alone matches 1 and 3; adding the status leaves one.
    expect(ids(filterDocumentRequests(LIST, { query: 'clearance', status: 'pending' })))
      .toEqual(['1'])
  })

  it('returns nothing when the two cannot both be satisfied', () => {
    expect(filterDocumentRequests(LIST, { query: 'maria', status: 'pending' })).toEqual([])
  })

  it('does not mutate the list it was given', () => {
    const before = ids(LIST)
    filterDocumentRequests(LIST, { query: 'maria', status: 'approved' })
    expect(ids(LIST)).toEqual(before)
  })
})

describe('resetting', () => {
  it('the cleared state returns the whole queue', () => {
    // What the Clear filters button restores: empty query, status all.
    expect(filterDocumentRequests(LIST, { query: '', status: 'all' })).toHaveLength(5)
    expect(filterDocumentRequests(LIST)).toHaveLength(5)
  })

  it('distinguishes an empty queue from a filtered-empty one', () => {
    // The tab renders different wording for each, and these are the two
    // states it decides between.
    expect(filterDocumentRequests([], { query: '', status: 'all' })).toEqual([])
    expect(filterDocumentRequests(LIST, { query: 'nobody-by-this-name' })).toEqual([])
  })
})

describe('bad input', () => {
  it('survives a missing list and missing options', () => {
    expect(filterDocumentRequests(undefined)).toEqual([])
    expect(filterDocumentRequests(null, { query: 'x' })).toEqual([])
    expect(filterDocumentRequests(LIST, {})).toHaveLength(5)
  })

  it('skips a row with a missing searchable field rather than throwing', () => {
    const sparse = [{ id: 'x', status: 'pending' }, req({ id: 'y' })]
    expect(ids(filterDocumentRequests(sparse, { query: 'juan' }))).toEqual(['y'])
  })
})
