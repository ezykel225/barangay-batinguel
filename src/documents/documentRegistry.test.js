import {
  DOCUMENT_TEMPLATES,
  GENERATABLE_STATUSES,
  SUPPORTED_DOCUMENT_TYPES,
  UNSUPPORTED_MESSAGE,
  canGenerate,
  canGenerateForStatus,
  hasTemplate,
  templateFor,
} from './documentRegistry'

// The exact six strings the Resident Portal's DOCUMENT_TYPES dropdown
// writes, which are the exact strings the live table holds. Copied
// verbatim, not re-spelled -- a key that merely looks right matches
// nothing, which is how the officials' photo map lost two portraits.
const RESIDENT_FORM_TYPES = [
  'Barangay Clearance',
  'Barangay Certificate',
  'Certificate of Indigency',
  'Certificate of Residency',
  'Business Clearance',
  'Other',
]

describe('the template registry', () => {
  it('resolves a template for every type the resident form offers', () => {
    RESIDENT_FORM_TYPES.forEach((type) => {
      expect(hasTemplate(type)).toBe(true)
      const entry = templateFor(type)
      expect(typeof entry.Template).toBe('function')
      expect(entry.displayName).toBe(type)
      expect(entry.prototype).toBe(true)
    })
    expect(SUPPORTED_DOCUMENT_TYPES).toEqual(RESIDENT_FORM_TYPES)
  })

  // ⚠️ EVERY ONE OF THE SIX IS STILL A PROTOTYPE. The two added here
  // did not arrive as finished forms, and the four that were already
  // here were not promoted by their company. Until Barangay Batinguel
  // supplies its real forms this must stay true of all six.
  it('marks all six as prototypes, not just the original four', () => {
    expect(SUPPORTED_DOCUMENT_TYPES).toHaveLength(6)
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      expect(templateFor(type).prototype).toBe(true)
    })
  })

  // ⚠️ Every configured template is a DIFFERENT component. One entry
  // pointing at another's template would print the wrong document
  // under the right heading.
  it('gives each type its own component', () => {
    const components = SUPPORTED_DOCUMENT_TYPES.map((t) => templateFor(t).Template)
    expect(new Set(components).size).toBe(components.length)
  })

  // ⚠️ THIS ASSERTION USED TO SAY THE OPPOSITE, and the reversal is
  // the point of this pass. Business Clearance and Other were
  // deliberately unconfigured in X6 because the schema cannot supply
  // what they need -- which is still exactly true, and is why both
  // print bracketed placeholders rather than values.
  it('now configures Business Clearance and Other, which X6 left out', () => {
    ;['Business Clearance', 'Other'].forEach((type) => {
      expect(hasTemplate(type)).toBe(true)
      expect(templateFor(type)).not.toBeNull()
      expect(typeof templateFor(type).Template).toBe('function')
    })
  })

  it('covers all six types the resident form offers, and no type it does not', () => {
    expect(RESIDENT_FORM_TYPES.filter(hasTemplate)).toHaveLength(6)
    // Nothing is configured that a resident cannot actually request.
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      expect(RESIDENT_FORM_TYPES).toContain(type)
    })
  })

  // `document_type` is FREE TEXT in the database -- no CHECK
  // constraint -- so an unrecognised value is not hypothetical.
  it('is safe for an unrecognised, empty or missing type', () => {
    expect(hasTemplate('Certificate of Vibes')).toBe(false)
    expect(hasTemplate('')).toBe(false)
    expect(hasTemplate(null)).toBe(false)
    expect(hasTemplate(undefined)).toBe(false)
    expect(templateFor(undefined)).toBeNull()
  })

  // ⚠️ `hasOwnProperty`, not a bare lookup: 'constructor' would
  // otherwise resolve to a function off Object.prototype and be
  // rendered as a template.
  it('does not resolve an inherited property name as a template', () => {
    expect(hasTemplate('constructor')).toBe(false)
    expect(hasTemplate('toString')).toBe(false)
    expect(templateFor('constructor')).toBeNull()
  })

  it('has one message for the unsupported case', () => {
    expect(UNSUPPORTED_MESSAGE).toBe('Printable template not configured for this document type.')
  })

  // Only the residency certificate requires a purok -- a residency
  // document with no address is meaningless, where the others are
  // merely shorter.
  it('requires a purok for the residency certificate and for nothing else', () => {
    expect(templateFor('Certificate of Residency').requiredFields).toContain('purok')
    const others = SUPPORTED_DOCUMENT_TYPES.filter((t) => t !== 'Certificate of Residency')
    others.forEach((type) => {
      expect(templateFor(type).requiredFields).not.toContain('purok')
    })
  })

  it('requires a name and a purpose everywhere', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      expect(templateFor(type).requiredFields).toEqual(
        expect.arrayContaining(['fullName', 'purpose']),
      )
    })
  })

  it('is frozen, so a caller cannot register a template at runtime', () => {
    expect(Object.isFrozen(DOCUMENT_TEMPLATES)).toBe(true)
  })
})

describe('status gating', () => {
  // ⚠️ THE REAL VOCABULARY, from the live CHECK constraint:
  // pending / approved / declined / ready_for_pickup / claimed.
  // There is no 'released' and no 'rejected' on this table.
  const ALL_STATUSES = ['pending', 'approved', 'declined', 'ready_for_pickup', 'claimed']

  it('opens generation only after approval, and closes it once claimed', () => {
    expect(GENERATABLE_STATUSES).toEqual(['approved', 'ready_for_pickup'])
    expect(canGenerateForStatus('approved')).toBe(true)
    expect(canGenerateForStatus('ready_for_pickup')).toBe(true)
  })

  it('refuses every other status, including ones that never reach approval', () => {
    const refused = ALL_STATUSES.filter((s) => !GENERATABLE_STATUSES.includes(s))
    expect(refused).toEqual(['pending', 'declined', 'claimed'])
    refused.forEach((status) => expect(canGenerateForStatus(status)).toBe(false))
  })

  it('refuses an unknown or absent status rather than defaulting open', () => {
    expect(canGenerateForStatus('released')).toBe(false)
    expect(canGenerateForStatus('')).toBe(false)
    expect(canGenerateForStatus(null)).toBe(false)
    expect(canGenerateForStatus(undefined)).toBe(false)
  })
})

describe('canGenerate — all three gates', () => {
  const ok = { status: 'approved', documentType: 'Barangay Clearance', isSecretary: true }

  it('allows the Secretary on an approved request with a template', () => {
    expect(canGenerate(ok)).toBe(true)
  })

  // ⚠️ THE LOAD-BEARING ONE. Only the Barangay Secretary may act on a
  // document request -- in the dashboard and in the RLS UPDATE policy.
  // Generation must not widen that by one position.
  it('refuses an official who is not the Secretary', () => {
    expect(canGenerate({ ...ok, isSecretary: false })).toBe(false)
  })

  it('refuses when the role flag is absent entirely', () => {
    expect(canGenerate({ status: 'approved', documentType: 'Barangay Clearance' })).toBe(false)
    expect(canGenerate({})).toBe(false)
    expect(canGenerate({ ...ok, isSecretary: undefined })).toBe(false)
    expect(canGenerate({ ...ok, isSecretary: null })).toBe(false)
  })

  it('refuses a pending request even for the Secretary', () => {
    expect(canGenerate({ ...ok, status: 'pending' })).toBe(false)
  })

  it('refuses a declined request, and a claimed one', () => {
    expect(canGenerate({ ...ok, status: 'declined' })).toBe(false)
    expect(canGenerate({ ...ok, status: 'claimed' })).toBe(false)
  })

  // ⚠️ The template gate is unchanged -- what changed is which types
  // pass it. `document_type` is free text, so an unrecognised value is
  // still refused; the six a resident can choose are not.
  it('refuses a type with no configured template', () => {
    expect(canGenerate({ ...ok, documentType: 'Certificate of Vibes' })).toBe(false)
    expect(canGenerate({ ...ok, documentType: 'Barangay Permit' })).toBe(false)
    expect(canGenerate({ ...ok, documentType: '' })).toBe(false)
    expect(canGenerate({ ...ok, documentType: 'constructor' })).toBe(false)
  })

  it('returns a boolean, never a truthy object', () => {
    expect(canGenerate(ok)).toBe(true)
    expect(typeof canGenerate({ ...ok, isSecretary: 'yes' })).toBe('boolean')
  })
})
