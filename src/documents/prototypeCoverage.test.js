// Complete prototype coverage: all SIX types the resident request form
// offers now resolve to a template.
//
// ⚠️ WHAT THESE TESTS DO AND DO NOT PROVE. They prove the registry
// resolves, the watermark renders, the gates are unmoved and nothing is
// invented. They do NOT prove the layouts are correct, because there is
// nothing to be correct against: Barangay Batinguel has not supplied its
// forms, and all six remain prototypes.

import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import DocumentPreview from './DocumentPreview'
import {
  SUPPORTED_DOCUMENT_TYPES,
  canGenerate,
  hasTemplate,
  templateFor,
} from './documentRegistry'
import { PROTOTYPE_WATERMARK, UNRECORDED_PLACEHOLDERS, isPrototypeMode } from './documentConfig'
import { buildDocumentData } from './documentData'

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8')

const REQUEST = {
  id: '3f9a2c71-5b40-4e2a-9c11-7d8e6f0a1b22',
  document_type: 'Business Clearance',
  full_name: 'Juan Dela Cruz',
  contact_number: '0919 896 2588',
  purok: 'Purok 4',
  purpose: 'Sari-sari store permit requirement',
  status: 'approved',
}

const show = (overrides = {}) => render(
  <DocumentPreview request={{ ...REQUEST, ...overrides }} open onClose={() => {}} />,
)

const page = (container) => container.querySelector('.doc-page')

const fieldsOf = (container) =>
  [...page(container).querySelectorAll('.doc-field')].map((row) => ({
    label: row.querySelector('dt').textContent,
    value: row.querySelector('dd').textContent,
    placeholder: row.querySelector('dd').getAttribute('data-placeholder') === 'true',
  }))

// ⚠️ WHAT THE SHEET *ASSERTS*, which is not the whole sheet, and the
// distinction cost three false failures before it was drawn.
//
// The title and the field area are where this system makes claims. The
// PROTOTYPE WORDING prose is where it DENIES making them -- Business
// Clearance's own prose reads "No permit number, fee, validity period,
// classification or regulatory approval is stated", so a scan over the
// whole sheet flags the disclaimer for containing the words it exists
// to disclaim.
//
// The resident's own free text is excluded too. `purpose` is printed
// verbatim as stored, by design; a resident who writes "for permit no.
// 5" has said that, and this system quoting them back is not this
// system inventing a permit number.
const RESIDENT_FREE_TEXT = ['Purpose', 'Stated purpose']

const assertedText = (container) => {
  const sheet = page(container)
  const title = sheet.querySelector('.doc-title').textContent
  const fields = [...sheet.querySelectorAll('.doc-field')]
    .filter((row) => !RESIDENT_FREE_TEXT.includes(row.querySelector('dt').textContent))
    .map((row) => row.textContent)
  return [title, ...fields].join(' | ')
}

const NEW_TYPES = ['Business Clearance', 'Other']
const ORIGINAL_FOUR = [
  'Barangay Clearance',
  'Barangay Certificate',
  'Certificate of Indigency',
  'Certificate of Residency',
]

// ─────────────────────────────────────────────────────────────────────

describe('every type the resident form offers resolves', () => {
  // ⚠️ THE LOAD-BEARING ONE. It reads the resident dashboard's own
  // `DOCUMENT_TYPES` array out of the source rather than restating it
  // here, so adding a seventh option to the dropdown without adding a
  // template fails in Jest instead of silently printing
  // "Printable template not configured" to a Secretary holding an
  // approved request. Same shape as the guards that read a migration.
  const residentFormTypes = () => {
    const source = read('../dashboards/ResidentDashboard.jsx')
    const block = source.slice(source.indexOf('const DOCUMENT_TYPES = ['))
    return [...block.slice(0, block.indexOf(']')).matchAll(/'([^']+)'/g)].map((m) => m[1])
  }

  it('reads six types from the request form, and every one has a template', () => {
    const types = residentFormTypes()
    expect(types).toHaveLength(6)
    types.forEach((type) => expect(hasTemplate(type)).toBe(true))
  })

  it('registers exactly those six and nothing a resident cannot request', () => {
    expect([...SUPPORTED_DOCUMENT_TYPES].sort()).toEqual([...residentFormTypes()].sort())
  })

  it('gives each of the six its own component', () => {
    const components = SUPPORTED_DOCUMENT_TYPES.map((t) => templateFor(t).Template)
    expect(new Set(components).size).toBe(6)
  })
})

describe('the two new prototypes carry the watermark', () => {
  it('is still prototype mode for all six', () => {
    expect(isPrototypeMode()).toBe(true)
    SUPPORTED_DOCUMENT_TYPES.forEach((t) => expect(templateFor(t).prototype).toBe(true))
  })

  // All three layers, individually, for each new type -- the diagonal
  // mark, the banner under the heading, and the footer sentence.
  NEW_TYPES.forEach((type) => {
    it(`renders all three watermark layers for ${type}`, () => {
      const { container } = show({ document_type: type })
      const sheet = page(container)
      expect(sheet.querySelector('.doc-watermark').textContent)
        .toContain(PROTOTYPE_WATERMARK.heading)
      const banner = sheet.querySelector('.doc-sample-banner')
      expect(banner.textContent).toContain(PROTOTYPE_WATERMARK.heading)
      expect(banner.textContent).toContain(PROTOTYPE_WATERMARK.subheading)
      expect(sheet.querySelector('.doc-footer-sample').textContent)
        .toMatch(/not an official/i)
    })

    // ⚠️ The watermark words are INSIDE the sheet, not only in the
    // toolbar chip -- the toolbar is `no-print` and the sheet is what
    // leaves the printer.
    it(`keeps the SAMPLE wording inside the printable sheet for ${type}`, () => {
      const { container } = show({ document_type: type })
      expect(page(container).textContent).toContain(PROTOTYPE_WATERMARK.heading)
      expect(page(container).textContent).toContain(PROTOTYPE_WATERMARK.subheading)
    })

    it(`labels its prose as prototype wording for ${type}`, () => {
      const { container } = show({ document_type: type })
      expect(page(container).querySelector('.doc-prose-label').textContent)
        .toBe('PROTOTYPE WORDING')
    })
  })
})

describe('Business Clearance — placeholders, never invented values', () => {
  it('prints the three business values as bracketed placeholders', () => {
    const { container } = show()
    const fields = fieldsOf(container)
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f]))

    expect(byLabel['Business name'].value).toBe(UNRECORDED_PLACEHOLDERS.businessName)
    expect(byLabel['Nature of business'].value).toBe(UNRECORDED_PLACEHOLDERS.natureOfBusiness)
    expect(byLabel['Business address'].value).toBe(UNRECORDED_PLACEHOLDERS.businessAddress)
    expect(byLabel['Business name'].placeholder).toBe(true)
    expect(byLabel['Nature of business'].placeholder).toBe(true)
    expect(byLabel['Business address'].placeholder).toBe(true)
  })

  it('marks only the business values as placeholders — the stored ones are real', () => {
    const { container } = show()
    const placeholders = fieldsOf(container).filter((f) => f.placeholder).map((f) => f.label)
    expect(placeholders.sort()).toEqual(['Business address', 'Business name', 'Nature of business'])
  })

  it('prints the stored request values as themselves', () => {
    const { container } = show()
    const byLabel = Object.fromEntries(fieldsOf(container).map((f) => [f.label, f.value]))
    expect(byLabel['Requested by']).toBe('Juan Dela Cruz')
    expect(byLabel["Requester's purok"]).toBe('Purok 4')
    expect(byLabel['Contact number']).toBe('0919 896 2588')
    expect(byLabel['Purpose']).toBe('Sari-sari store permit requirement')
  })

  // ⚠️ `full_name` IS THE REQUESTER. The row records who filed the
  // request and nothing about who owns the business, so no label may
  // assert ownership.
  it('does not call the requester the business owner', () => {
    const { container } = show()
    expect(page(container).textContent).not.toMatch(/owner|proprietor|operator/i)
  })

  // ⚠️ The purok is the RESIDENT's, not the business address. Two
  // different facts; the schema holds only the first.
  it('does not present the requester purok as the business address', () => {
    const { container } = show()
    const byLabel = Object.fromEntries(fieldsOf(container).map((f) => [f.label, f.value]))
    expect(byLabel['Business address']).not.toBe('Purok 4')
    expect(byLabel['Business address']).toBe(UNRECORDED_PLACEHOLDERS.businessAddress)
  })

  // ⚠️ NOT EVEN AS A PLACEHOLDER. A `[PERMIT NO.]` bracket still
  // asserts that the barangay's real form HAS that field, which nobody
  // has told this project.
  it('states no permit number, OR, fee, tax, validity or classification', () => {
    const { container } = show()
    const text = assertedText(container)
    ;[
      /permit\s*(no|number|#)/i,
      /\bO\.?R\.?\s*(no|number|#)/i,
      /\bfee\b/i, /\bamount\b/i, /₱|\bpeso/i,
      /\btax\b/i,
      /valid\s*(until|for|through)|validity|expir/i,
      /classification|inspect|compli|approved by|license/i,
    ].forEach((pattern) => expect(text).not.toMatch(pattern))
  })

  // The other direction, so the exclusion above cannot hide a
  // regression: the prose must still DENY those things in words.
  it('says in the prose that none of them is stated', () => {
    const { container } = show()
    const prose = page(container).querySelector('.doc-prose').textContent
    expect(prose).toMatch(/no permit number, fee, validity period, classification or regulatory approval is stated/i)
    expect(prose).toMatch(/placeholders rather than values/i)
    expect(prose).toMatch(/has not been supplied/i)
  })

  it('leaves no blank line for a value it does not have', () => {
    const { container } = show()
    fieldsOf(container).forEach((f) => expect(f.value.trim()).not.toBe(''))
  })

  // ⚠️ A STRUCTURAL PLACEHOLDER IS NOT A MISSING FIELD. Routing the
  // business values through the missing-field path would disable Print
  // on every Business Clearance forever, while telling the Secretary to
  // correct a field that is not on the request form.
  it('does not block printing over values the schema cannot hold', () => {
    const { container } = show()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /print/i })).not.toBeDisabled()
    expect(page(container)).not.toBeNull()
  })

  // The missing-field path still works for values that ARE columns.
  it('still blocks on a genuinely missing stored value', () => {
    const { container } = show({ full_name: '   ' })
    expect(screen.getByRole('alert').textContent).toContain("full name is missing")
    expect(page(container)).toBeNull()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
  })

  it('requires no purok — only the residency certificate does', () => {
    expect(templateFor('Business Clearance').requiredFields).not.toContain('purok')
    const { container } = show({ purok: null })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(page(container)).not.toBeNull()
  })
})

describe('Other — a custom request, not a form the system picked', () => {
  const showOther = (o = {}) => show({ document_type: 'Other', ...o })

  it('prints a clearly non-official title', () => {
    const { container } = showOther()
    const title = page(container).querySelector('.doc-title').textContent
    expect(title).toBe('Prototype Custom Barangay Document')
  })

  // ⚠️ The whole risk of this type: printing it under the name of a
  // real form is the system deciding which document was requested.
  it('never names a real barangay form', () => {
    const { container } = showOther()
    expect(page(container).querySelector('.doc-title').textContent)
      .not.toMatch(/clearance|certificate|indigency|residency|permit/i)
  })

  it('shows the document title as a placeholder and the purpose as stored', () => {
    const { container } = showOther({ purpose: 'Scholarship requirement' })
    const byLabel = Object.fromEntries(fieldsOf(container).map((f) => [f.label, f]))
    expect(byLabel['Document requested'].value).toBe(UNRECORDED_PLACEHOLDERS.documentTitle)
    expect(byLabel['Document requested'].placeholder).toBe(true)
    expect(byLabel['Stated purpose'].value).toBe('Scholarship requirement')
    expect(byLabel['Stated purpose'].placeholder).toBe(false)
  })

  // ⚠️ The purpose is QUOTED BACK, not acted on. Turning it into a
  // certification sentence would be this system writing a barangay
  // document, which is what the Secretary is for.
  it('generates no certification text from the purpose', () => {
    const { container } = showOther({ purpose: 'proof I live here' })
    const text = page(container).textContent
    expect(text).not.toMatch(/this is to certify|hereby certif|it is certified/i)
  })

  it('carries the resident values it genuinely has', () => {
    const { container } = showOther()
    const byLabel = Object.fromEntries(fieldsOf(container).map((f) => [f.label, f.value]))
    expect(byLabel['Name']).toBe('Juan Dela Cruz')
    expect(byLabel['Purok']).toBe('Purok 4')
    expect(byLabel['Contact number']).toBe('0919 896 2588')
  })

  it('omits an absent optional field rather than bracketing it', () => {
    const { container } = showOther({ contact_number: null, purok: '' })
    const labels = fieldsOf(container).map((f) => f.label)
    expect(labels).not.toContain('Contact number')
    expect(labels).not.toContain('Purok')
    expect(labels).toContain('Name')
  })
})

describe('the three gates did not move for the two new types', () => {
  const STATUSES = ['pending', 'approved', 'declined', 'ready_for_pickup', 'claimed']

  NEW_TYPES.forEach((documentType) => {
    it(`lets the Secretary generate ${documentType} at approved and ready_for_pickup`, () => {
      expect(canGenerate({ status: 'approved', documentType, isSecretary: true })).toBe(true)
      expect(canGenerate({ status: 'ready_for_pickup', documentType, isSecretary: true })).toBe(true)
    })

    it(`refuses pending, declined and claimed for ${documentType}`, () => {
      ;['pending', 'declined', 'claimed'].forEach((status) => {
        expect(canGenerate({ status, documentType, isSecretary: true })).toBe(false)
      })
    })

    // ⚠️ THE LOAD-BEARING GATE. Adding two document types must not
    // widen authorization by one position. Only the Barangay Secretary
    // may act on a document request -- in the dashboard and in the RLS
    // UPDATE policy.
    it(`refuses a non-Secretary at every status for ${documentType}`, () => {
      STATUSES.forEach((status) => {
        expect(canGenerate({ status, documentType, isSecretary: false })).toBe(false)
        expect(canGenerate({ status, documentType })).toBe(false)
      })
    })
  })

  it('still closes generation on claimed for every one of the six', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((documentType) => {
      expect(canGenerate({ status: 'claimed', documentType, isSecretary: true })).toBe(false)
    })
  })
})

describe('generating still changes no status, and writes nothing', () => {
  // ⚠️ A sheet leaving a printer is not "the resident may collect this"
  // (Mark Ready) or "the resident has it" (Mark Claimed). Both stay the
  // deliberate actions they already were.
  it('files no write anywhere in the preview or the two new templates', () => {
    ;['DocumentPreview.jsx',
      'templates/BusinessClearanceTemplate.jsx',
      'templates/CustomDocumentTemplate.jsx'].forEach((file) => {
      const source = read(file)
      expect(source).not.toContain('supabase')
      expect(source).not.toContain('logActivity')
      expect(source).not.toContain('.update(')
      expect(source).not.toContain('.insert(')
      expect(source).not.toContain('useEffect')
      expect(source).not.toContain('fetch(')
    })
  })

  it('leaves the request object untouched when it builds the data', () => {
    const request = { ...REQUEST }
    const before = JSON.stringify(request)
    buildDocumentData(request, {
      documentType: 'Business Clearance',
      requiredFields: templateFor('Business Clearance').requiredFields,
    })
    expect(JSON.stringify(request)).toBe(before)
    expect(request.status).toBe('approved')
  })

  // ⚠️ Two different claims, and only the second covers the whole
  // sheet. The stored status is not printed as a VALUE anywhere (the
  // prose may describe the workflow in English) -- and the raw stored
  // token `ready_for_pickup` appears nowhere at all, prose included,
  // which is the project's "no raw database value reaches a user" rule.
  it('prints the request status as a value nowhere on either new sheet', () => {
    NEW_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type, status: 'ready_for_pickup' })
      expect(assertedText(container)).not.toMatch(/ready_for_pickup|approved|pending|claimed/i)
      unmount()
    })
  })

  it('never prints a raw stored status token, anywhere on any of the six', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type, status: 'ready_for_pickup' })
      expect(page(container).textContent).not.toContain('ready_for_pickup')
      unmount()
    })
  })
})

describe('the original four are unchanged', () => {
  // ⚠️ The pass added two templates; it must not have edited four. The
  // field list each of them prints is the whole of what they say about
  // a resident, so pinning it catches an accidental edit.
  const ORIGINAL_LABELS = ['Name', 'Purok', 'Contact number', 'Purpose']

  ORIGINAL_FOUR.forEach((type) => {
    it(`${type} still prints exactly its original four fields`, () => {
      const { container } = show({ document_type: type })
      expect(fieldsOf(container).map((f) => f.label)).toEqual(ORIGINAL_LABELS)
    })

    it(`${type} contains no placeholder field`, () => {
      const { container } = show({ document_type: type })
      expect(fieldsOf(container).every((f) => f.placeholder === false)).toBe(true)
      Object.values(UNRECORDED_PLACEHOLDERS).forEach((value) => {
        expect(page(container).textContent).not.toContain(value)
      })
    })
  })

  it('leaves the original four template sources free of the new placeholders', () => {
    ;['BarangayClearanceTemplate', 'BarangayCertificateTemplate',
      'CertificateOfIndigencyTemplate', 'CertificateOfResidencyTemplate'].forEach((name) => {
      const source = read(`templates/${name}.jsx`)
      expect(source).not.toContain('unrecorded')
      expect(source).not.toContain('placeholder: true')
    })
  })

  it('keeps the residency certificate as the only one requiring a purok', () => {
    expect(templateFor('Certificate of Residency').requiredFields).toContain('purok')
    SUPPORTED_DOCUMENT_TYPES
      .filter((t) => t !== 'Certificate of Residency')
      .forEach((t) => expect(templateFor(t).requiredFields).not.toContain('purok'))
  })
})

describe('no barangay requirement was invented anywhere', () => {
  // Across all six sheets at once, so a future template cannot quietly
  // introduce one of these without failing here.
  const FORBIDDEN = [
    /permit\s*(no|number|#)/i,
    /\bO\.?R\.?\s*(no|number|#)/i,
    /\bfee\b/i, /₱/, /\bpeso/i,
    /valid\s*(until|for|through)|validity|expir/i,
    /this is to certify|hereby certif/i,
    /notar|affidavit|sworn/i,
    /\bincome\b|\bindigen(t|cy)\b.*\bis\b/i,
    /resident since|years of residen/i,
  ]

  it('asserts none of the invented-requirement patterns on any of the six', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      const text = assertedText(container)
      FORBIDDEN.forEach((pattern) => {
        expect({ type, pattern: String(pattern), matched: pattern.test(text) })
          .toEqual({ type, pattern: String(pattern), matched: false })
      })
      unmount()
    })
  })

  // ⚠️ CERTIFICATION LANGUAGE IS BANNED EVERYWHERE, prose included --
  // it is the one thing no part of a prototype may say, because a
  // reader does not care which element it appeared in.
  it('writes no certification clause anywhere on any of the six', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      const whole = page(container).textContent
      ;[/this is to certify/i, /hereby certif/i, /it is certified/i,
        /notar/i, /\bsworn\b/i, /affidavit/i].forEach((pattern) => {
        expect({ type, matched: pattern.test(whole) }).toEqual({ type, matched: false })
      })
      unmount()
    })
  })

  // ⚠️ The signatory stays a rule and two brackets on all six. A real
  // official's name here would assert authority nobody has recorded.
  it('keeps the placeholder signatory and generates no signature image', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      const sheet = page(container)
      expect(sheet.querySelector('.doc-sign-name').textContent).toBe('[AUTHORIZED SIGNATORY]')
      expect(sheet.querySelector('.doc-sign-position').textContent).toBe('[POSITION]')
      expect(sheet.querySelector('.doc-signatory img')).toBeNull()
      unmount()
    })
  })

  // The seal is the project's own existing logo asset, on all six --
  // no government seal is generated, altered or redrawn.
  it('uses the one existing logo asset as the seal, decoratively', () => {
    NEW_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      const seal = page(container).querySelector('.doc-seal')
      expect(seal.getAttribute('alt')).toBe('')
      expect(seal.getAttribute('aria-hidden')).toBe('true')
      unmount()
    })
  })

  it('still marks the reference SAMPLE- on both new types', () => {
    NEW_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      expect(page(container).textContent).toContain('SAMPLE-3F9A2C71')
      unmount()
    })
  })
})
