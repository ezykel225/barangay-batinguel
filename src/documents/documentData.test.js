import {
  REQUIRED_FIELD_LABELS,
  buildDocumentData,
  fieldValue,
  manilaLongDate,
  missingFieldMessages,
  sampleReference,
} from './documentData'
import { SIGNATORY_PLACEHOLDER } from './documentConfig'

// A row shaped exactly like `document_requests`: the resident's details
// are the SNAPSHOT the Resident Portal copied from their profile at
// submission, which is what the Secretary approved.
const REQUEST = {
  id: '3f9a2c71-5b40-4e2a-9c11-7d8e6f0a1b22',
  resident_id: 'r-1',
  document_type: 'Barangay Clearance',
  full_name: 'Juan Dela Cruz',
  contact_number: '0919 896 2588',
  purok: 'Purok 4',
  purpose: 'Employment requirement',
  additional_notes: null,
  status: 'approved',
}

const REQUIRED = ['fullName', 'purpose']

describe('sampleReference', () => {
  // ⚠️ VISIBLY A SAMPLE. `document_requests` has no public reference
  // number, and inventing an official numbering convention is exactly
  // what a prototype must not do.
  it('is the SAMPLE prefix plus eight characters of the row id', () => {
    expect(sampleReference(REQUEST.id)).toBe('SAMPLE-3F9A2C71')
  })

  it('traces back to one exact request', () => {
    const a = sampleReference('3f9a2c71-5b40-4e2a-9c11-7d8e6f0a1b22')
    const b = sampleReference('ab000000-0000-0000-0000-000000000000')
    expect(a).not.toBe(b)
  })

  it('always carries the SAMPLE prefix, so it cannot read as official', () => {
    expect(sampleReference('abcdefgh-1234')).toMatch(/^SAMPLE-/)
  })

  it('is empty rather than a bare prefix when there is no id', () => {
    expect(sampleReference(null)).toBe('')
    expect(sampleReference('')).toBe('')
    expect(sampleReference(undefined)).toBe('')
    expect(sampleReference('   ')).toBe('')
  })
})

describe('manilaLongDate', () => {
  // ⚠️ MANILA, NEVER THE BROWSER'S CLOCK. The printed date is a claim
  // about when the barangay issued something.
  it('reads the Manila day, not the UTC one', () => {
    // 17:30Z on 30 September is 01:30 on 1 October in Manila.
    expect(manilaLongDate(new Date('2026-09-30T17:30:00Z'))).toBe('1 October 2026')
    expect(manilaLongDate(new Date('2026-09-30T15:00:00Z'))).toBe('30 September 2026')
  })

  it('is empty for an unusable value rather than printing "Invalid Date"', () => {
    expect(manilaLongDate(new Date('nope'))).toBe('')
    expect(manilaLongDate('not a date')).toBe('')
  })
})

describe('buildDocumentData', () => {
  const build = (overrides = {}, opts = {}) =>
    buildDocumentData({ ...REQUEST, ...overrides }, {
      requiredFields: REQUIRED,
      now: new Date('2026-10-02T04:00:00Z'),
      ...opts,
    })

  it('carries the resident details the request stored', () => {
    const d = build()
    expect(d.resident.fullName).toBe('Juan Dela Cruz')
    expect(d.resident.purok).toBe('Purok 4')
    expect(d.resident.contactNumber).toBe('0919 896 2588')
    expect(d.purpose).toBe('Employment requirement')
    expect(d.documentType).toBe('Barangay Clearance')
    expect(d.reference).toBe('SAMPLE-3F9A2C71')
  })

  it('prints the generation date, and records that that is what it is', () => {
    const d = build()
    expect(d.issueDate).toBe('2 October 2026')
    // The schema stores no approval timestamp, so "the date this was
    // approved" is not a value it can give. Recorded, not assumed.
    expect(d.issueDateBasis).toBe('generated')
  })

  it('keeps a name with no middle name, and one with a suffix, exactly as stored', () => {
    expect(build({ full_name: 'Ana Reyes' }).resident.fullName).toBe('Ana Reyes')
    expect(build({ full_name: 'Jose Dela Cruz Jr.' }).resident.fullName)
      .toBe('Jose Dela Cruz Jr.')
  })

  it('keeps accented and special characters intact', () => {
    const d = build({ full_name: 'Nicholas Khyle R. Mondoñedo', purok: 'Purok 7 — Sitio Ñ' })
    expect(d.resident.fullName).toBe('Nicholas Khyle R. Mondoñedo')
    expect(d.resident.purok).toBe('Purok 7 — Sitio Ñ')
  })

  it('trims whitespace without altering the value', () => {
    expect(build({ full_name: '  Juan Dela Cruz  ' }).resident.fullName).toBe('Juan Dela Cruz')
  })

  it('renders a very long name and a very long purpose unchanged', () => {
    const longName = 'Maria Concepcion Magdalena de los Santos Villanueva-Buenaventura'
    const longPurpose = 'Requirement for the processing of an application. '.repeat(10)
    const d = build({ full_name: longName, purpose: longPurpose })
    expect(d.resident.fullName).toBe(longName)
    expect(d.purpose).toBe(longPurpose.trim())
  })

  // ⚠️ AN ABSENT OPTIONAL VALUE IS EMPTY, NEVER "N/A". A placeholder
  // inside a field that looks official reads as a statement.
  it('leaves an absent optional field empty rather than filling it', () => {
    const d = build({ contact_number: null, purok: null })
    expect(d.resident.contactNumber).toBe('')
    expect(d.resident.purok).toBe('')
    const printed = JSON.stringify(d)
    expect(printed).not.toContain('N/A')
    expect(printed).not.toContain('UNKNOWN')
    expect(printed).not.toContain('TBD')
  })

  it('reports nothing missing when every required field is present', () => {
    expect(build().missing).toEqual([])
    expect(missingFieldMessages(build())).toEqual([])
  })

  // `full_name` is NOT NULL in the database, but the Resident Portal
  // inserts `userProfile?.full_name || ''` -- so an empty one is
  // reachable, and it must block rather than print a blank line.
  it('reports a blank required name as missing', () => {
    const d = build({ full_name: '   ' })
    expect(d.missing).toEqual(['fullName'])
    expect(missingFieldMessages(d)).toEqual([
      "Cannot generate this document: the resident's full name is missing from the request.",
    ])
  })

  it('reports several missing required fields at once, in the order declared', () => {
    const d = buildDocumentData(
      { ...REQUEST, full_name: '', purpose: '', purok: '' },
      { requiredFields: ['fullName', 'purpose', 'purok'] },
    )
    expect(d.missing).toEqual(['fullName', 'purpose', 'purok'])
    expect(missingFieldMessages(d)).toHaveLength(3)
  })

  // The residency certificate is the one type that requires a purok.
  it('reports a missing purok only when the template asked for one', () => {
    expect(build({ purok: null }).missing).toEqual([])
    const residency = buildDocumentData(
      { ...REQUEST, purok: null },
      { requiredFields: ['fullName', 'purpose', 'purok'] },
    )
    expect(residency.missing).toEqual(['purok'])
  })

  // ⚠️ A PLACEHOLDER, because nothing in this repository establishes
  // who signs which document. No real official's name is printed.
  it('carries the placeholder signatory by default', () => {
    const d = build()
    expect(d.signatory.name).toBe(SIGNATORY_PLACEHOLDER.name)
    expect(d.signatory.position).toBe(SIGNATORY_PLACEHOLDER.position)
    expect(d.signatory.name).toBe('[AUTHORIZED SIGNATORY]')
  })

  it('never reads the resident id, the reviewer, or anything not printable', () => {
    const d = build()
    const printed = JSON.stringify(d)
    expect(printed).not.toContain('r-1')
    expect(d.resident.id).toBeUndefined()
    expect(d.residentId).toBeUndefined()
  })

  // The uploaded ID is verification material, not document artwork,
  // and its Storage URL must never reach a printed page.
  it('exposes no ID document or photo url, even if the row carries one', () => {
    const d = buildDocumentData(
      { ...REQUEST, id_document_url: 'https://example.test/id.jpg', photo_url: 'x.jpg' },
      { requiredFields: REQUIRED },
    )
    const printed = JSON.stringify(d)
    expect(printed).not.toContain('id.jpg')
    expect(printed).not.toContain('example.test')
  })

  it('survives a null, empty or malformed request without throwing', () => {
    expect(() => buildDocumentData(null, { requiredFields: REQUIRED })).not.toThrow()
    expect(() => buildDocumentData(undefined)).not.toThrow()
    expect(buildDocumentData({}, { requiredFields: REQUIRED }).missing)
      .toEqual(['fullName', 'purpose'])
    expect(buildDocumentData(null).reference).toBe('')
  })
})

describe('fieldValue and the field labels', () => {
  it('reads each declared field off the normalized shape', () => {
    const d = buildDocumentData(REQUEST, { requiredFields: [] })
    expect(fieldValue(d, 'fullName')).toBe('Juan Dela Cruz')
    expect(fieldValue(d, 'purok')).toBe('Purok 4')
    expect(fieldValue(d, 'contactNumber')).toBe('0919 896 2588')
    expect(fieldValue(d, 'purpose')).toBe('Employment requirement')
  })

  it('is empty for an unknown field and for no data', () => {
    expect(fieldValue({}, 'birthDate')).toBe('')
    expect(fieldValue(null, 'fullName')).toBe('')
  })

  // Every field a template may require has a sentence a reader can act
  // on -- otherwise the warning would print a variable name.
  it('has a readable label for every field a template can require', () => {
    ;['fullName', 'purok', 'purpose', 'contactNumber'].forEach((field) => {
      expect(REQUIRED_FIELD_LABELS[field]).toBeTruthy()
      expect(REQUIRED_FIELD_LABELS[field]).not.toBe(field)
    })
  })
})
