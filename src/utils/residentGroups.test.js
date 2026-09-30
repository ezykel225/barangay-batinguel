// Unit tests for the resident grouping, search and reconciliation rules.
//
// This module is pure, so these run without the Supabase environment
// variables -- unlike App.test.js, which imports App, which imports the
// client, which throws at import time when they are missing.
//
// Every rule is asserted in BOTH directions: a case that must be
// reported and a neighbouring case that must not. A one-directional
// test on a filter proves only that the function returns something.
//
// The fixtures are synthetic. No real resident data appears here.

import {
  RESIDENT_GROUPS,
  PUROK_FILTER_UNLISTED,
  RESIDENT_SEARCH_FIELDS,
  REGISTRY_SEARCH_FIELDS,
  normalizeName,
  isKnownPurok,
  purokMatchesFilter,
  describeVerification,
  groupIdForStatus,
  groupResidents,
  matchesSearch,
  filterRows,
  findReconciliationIssues,
} from './residentGroups'

const account = (id, overrides = {}) => ({
  id,
  full_name: `Test Person ${id}`,
  contact_number: '09000000000',
  purok: 'Purok 1',
  verification_status: 'pending',
  ...overrides,
})

const entry = (id, overrides = {}) => ({
  id,
  full_name: `Test Person ${id}`,
  purok: 'Purok 1',
  household_number: null,
  contact_number: null,
  ...overrides,
})

describe('normalizeName', () => {
  it('trims, collapses inner whitespace and lowercases', () => {
    expect(normalizeName('  Juan   Dela  Cruz ')).toBe('juan dela cruz')
  })

  it('treats a missing name as empty rather than throwing', () => {
    expect(normalizeName(undefined)).toBe('')
    expect(normalizeName(null)).toBe('')
  })

  it('does not fold two different names together', () => {
    expect(normalizeName('Juan Dela Cruz')).not.toBe(normalizeName('Juana Dela Cruz'))
  })
})

describe('purok handling', () => {
  it('recognises a value from the barangay list, whatever the casing', () => {
    expect(isKnownPurok('Purok 3')).toBe(true)
    expect(isKnownPurok('purok 3')).toBe(true)
    expect(isKnownPurok(' PUROK  3 ')).toBe(true)
  })

  it('does not recognise a legacy free-text value or a blank', () => {
    expect(isKnownPurok('purol 5')).toBe(false)
    expect(isKnownPurok('4')).toBe(false)
    expect(isKnownPurok('')).toBe(false)
    expect(isKnownPurok(null)).toBe(false)
  })

  it('filters by an exact purok and by the unlisted sentinel', () => {
    expect(purokMatchesFilter('Purok 2', 'Purok 2')).toBe(true)
    expect(purokMatchesFilter('Purok 2', 'Purok 3')).toBe(false)
    expect(purokMatchesFilter('Purok 2', PUROK_FILTER_UNLISTED)).toBe(false)
    expect(purokMatchesFilter('asd', PUROK_FILTER_UNLISTED)).toBe(true)
    expect(purokMatchesFilter(null, PUROK_FILTER_UNLISTED)).toBe(true)
  })

  it('lets everything through when no filter is applied', () => {
    expect(purokMatchesFilter('anything', 'all')).toBe(true)
    expect(purokMatchesFilter(null, 'all')).toBe(true)
  })
})

describe('the status vocabulary', () => {
  it('maps each stored status to exactly one group', () => {
    expect(groupIdForStatus('pending')).toBe('requests')
    expect(groupIdForStatus('rejected')).toBe('requests')
    expect(groupIdForStatus('verified')).toBe('residents')
    expect(groupIdForStatus('ineligible')).toBe('notResidents')
  })

  it('puts an unrecognised status in Requests rather than dropping it', () => {
    expect(groupIdForStatus('something_new')).toBe('requests')
    expect(groupIdForStatus(undefined)).toBe('requests')
  })

  it('distinguishes rejected from ineligible in words, not only colour', () => {
    const rejected = describeVerification('rejected')
    const ineligible = describeVerification('ineligible')
    expect(rejected.label).not.toBe(ineligible.label)
    expect(rejected.tone).not.toBe(ineligible.tone)
    expect(rejected.meaning).toMatch(/correct/i)
    expect(ineligible.meaning).toMatch(/permanent/i)
  })
})

describe('groupResidents', () => {
  const list = [
    account('a', { verification_status: 'pending' }),
    account('b', { verification_status: 'rejected' }),
    account('c', { verification_status: 'verified' }),
    account('d', { verification_status: 'ineligible' }),
    account('e', { verification_status: 'mystery' }),
  ]

  it('sorts accounts into the three groups', () => {
    const groups = groupResidents(list)
    expect(groups.requests.map((r) => r.id)).toEqual(['a', 'b', 'e'])
    expect(groups.residents.map((r) => r.id)).toEqual(['c'])
    expect(groups.notResidents.map((r) => r.id)).toEqual(['d'])
  })

  it('loses nobody, so the group counts add up to the accounts', () => {
    const groups = groupResidents(list)
    const total = RESIDENT_GROUPS.reduce((sum, g) => sum + groups[g.id].length, 0)
    expect(total).toBe(list.length)
  })

  it('returns three empty groups for an empty list', () => {
    const groups = groupResidents([])
    expect(groups).toEqual({ requests: [], residents: [], notResidents: [] })
  })
})

describe('search', () => {
  const row = account('1', {
    full_name: 'Juan Dela Cruz',
    contact_number: '09171234567',
    purok: 'Purok 4',
  })

  it('matches case-insensitively on a partial name', () => {
    expect(matchesSearch(row, 'dela', RESIDENT_SEARCH_FIELDS)).toBe(true)
    expect(matchesSearch(row, 'DELA CRUZ', RESIDENT_SEARCH_FIELDS)).toBe(true)
  })

  it('matches on contact number and purok as well', () => {
    expect(matchesSearch(row, '0917', RESIDENT_SEARCH_FIELDS)).toBe(true)
    expect(matchesSearch(row, 'purok 4', RESIDENT_SEARCH_FIELDS)).toBe(true)
  })

  it('does not match an unrelated query', () => {
    expect(matchesSearch(row, 'santos', RESIDENT_SEARCH_FIELDS)).toBe(false)
  })

  it('treats an empty or whitespace query as no filter', () => {
    expect(matchesSearch(row, '', RESIDENT_SEARCH_FIELDS)).toBe(true)
    expect(matchesSearch(row, '   ', RESIDENT_SEARCH_FIELDS)).toBe(true)
  })

  it('does not throw on null fields', () => {
    const sparse = account('2', { contact_number: null, purok: null })
    expect(matchesSearch(sparse, '0917', RESIDENT_SEARCH_FIELDS)).toBe(false)
  })

  it('searches the household number on registry rows', () => {
    const registryRow = entry('1', { household_number: 'HH-0012' })
    expect(matchesSearch(registryRow, 'hh-00', REGISTRY_SEARCH_FIELDS)).toBe(true)
    expect(matchesSearch(registryRow, 'hh-99', REGISTRY_SEARCH_FIELDS)).toBe(false)
  })

  it('combines the query and the purok filter', () => {
    const rows = [
      account('1', { full_name: 'Ana Reyes', purok: 'Purok 1' }),
      account('2', { full_name: 'Ana Santos', purok: 'Purok 2' }),
    ]
    const filtered = filterRows(rows, {
      query: 'ana', purok: 'Purok 2', fields: RESIDENT_SEARCH_FIELDS,
    })
    expect(filtered.map((r) => r.id)).toEqual(['2'])
  })

  it('returns everything when neither control is set', () => {
    const rows = [account('1'), account('2')]
    expect(filterRows(rows, { fields: RESIDENT_SEARCH_FIELDS })).toHaveLength(2)
  })
})

describe('findReconciliationIssues', () => {
  const idsFor = (issues, id) =>
    (issues.find((i) => i.id === id)?.items || []).map((item) => item.key)

  it('reports nothing for data with no inconsistencies', () => {
    const issues = findReconciliationIssues({
      residents: [account('a', { full_name: 'Ana Reyes', verification_status: 'verified' })],
      registryEntries: [entry('r', { full_name: 'Ana Reyes' })],
    })
    expect(issues).toEqual([])
  })

  it('reports a verified account with no registry entry, and not one that has one', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('missing', { full_name: 'Ana Reyes', verification_status: 'verified' }),
        account('present', { full_name: 'Ben Cruz', verification_status: 'verified' }),
      ],
      registryEntries: [entry('r', { full_name: 'ben  CRUZ' })],
    })
    expect(idsFor(issues, 'verified-not-in-registry')).toEqual(['missing'])
  })

  it('does not report an unverified account as missing from the registry', () => {
    const issues = findReconciliationIssues({
      residents: [account('a', { full_name: 'Ana Reyes', verification_status: 'pending' })],
      registryEntries: [],
    })
    expect(idsFor(issues, 'verified-not-in-registry')).toEqual([])
  })

  it('reports a “not a resident” account whose name is in the registry', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('clash', { full_name: 'Ana Reyes', verification_status: 'ineligible' }),
        account('clean', { full_name: 'Ben Cruz', verification_status: 'ineligible' }),
      ],
      registryEntries: [entry('r', { full_name: 'Ana Reyes' })],
    })
    expect(idsFor(issues, 'not-resident-in-registry')).toEqual(['clash'])
  })

  it('reports duplicate names on each side separately', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('a1', { full_name: 'Ana Reyes', verification_status: 'verified' }),
        account('a2', { full_name: 'ana  reyes', verification_status: 'pending' }),
        account('b', { full_name: 'Ben Cruz', verification_status: 'pending' }),
      ],
      registryEntries: [
        entry('r1', { full_name: 'Ana Reyes' }),
        entry('r2', { full_name: 'Ana Reyes' }),
        entry('r3', { full_name: 'Ben Cruz' }),
      ],
    })
    expect(idsFor(issues, 'duplicate-account-names').sort()).toEqual(['a1', 'a2'])
    expect(idsFor(issues, 'duplicate-registry-names').sort()).toEqual(['r1', 'r2'])
  })

  it('reports an off-list or blank purok on both sides, and leaves valid ones alone', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('bad', { purok: 'purol 5' }),
        account('blank', { purok: null }),
        account('good', { purok: 'Purok 6' }),
      ],
      registryEntries: [
        entry('rbad', { purok: '4' }),
        entry('rgood', { purok: 'Purok 2' }),
      ],
    })
    expect(idsFor(issues, 'account-purok-unlisted').sort()).toEqual(['bad', 'blank'])
    expect(idsFor(issues, 'registry-purok-unlisted')).toEqual(['rbad'])
  })

  it('reports an unrecognised stored status', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('odd', { verification_status: 'archived' }),
        account('fine', { verification_status: 'pending' }),
      ],
      registryEntries: [],
    })
    expect(idsFor(issues, 'unrecognised-status')).toEqual(['odd'])
  })

  it('never reports a verified account merely for having no ID on file', () => {
    const issues = findReconciliationIssues({
      residents: [
        account('a', {
          full_name: 'Ana Reyes',
          verification_status: 'verified',
          id_document_url: null,
        }),
      ],
      registryEntries: [entry('r', { full_name: 'Ana Reyes' })],
    })
    expect(issues).toEqual([])
  })

  it('does not treat a similar-but-different name as a registry match', () => {
    // The row badge shows these as "similar"; reconciliation must not,
    // or it would assert an identity the system cannot know.
    const issues = findReconciliationIssues({
      residents: [account('a', { full_name: 'Juan Dela Cruz Jr.', verification_status: 'verified' })],
      registryEntries: [entry('r', { full_name: 'Juan Dela Cruz' })],
    })
    expect(idsFor(issues, 'verified-not-in-registry')).toEqual(['a'])
  })

  it('survives empty input', () => {
    expect(findReconciliationIssues()).toEqual([])
    expect(findReconciliationIssues({ residents: [], registryEntries: [] })).toEqual([])
  })
})
