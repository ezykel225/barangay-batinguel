// The preview, the four prototype templates and the SAMPLE watermark,
// rendered.
//
// ⚠️ No Supabase mock is needed and none is present: `DocumentPreview`
// takes the request as a PROP and reads nothing. That is the point of
// the data adapter -- a template cannot reach the database, so these
// run without `.env` like the rest of the suite.

import { render, screen, fireEvent, within } from '@testing-library/react'
import DocumentPreview from './DocumentPreview'
import { DOCUMENT_TEMPLATES, SUPPORTED_DOCUMENT_TYPES } from './documentRegistry'
import { buildDocumentData } from './documentData'
import { PROTOTYPE_WATERMARK, DOCUMENT_TEMPLATE_MODE, isPrototypeMode } from './documentConfig'

const REQUEST = {
  id: '3f9a2c71-5b40-4e2a-9c11-7d8e6f0a1b22',
  document_type: 'Barangay Clearance',
  full_name: 'Juan Dela Cruz',
  contact_number: '0919 896 2588',
  purok: 'Purok 4',
  purpose: 'Employment requirement',
  status: 'approved',
}

const show = (overrides = {}, props = {}) => render(
  <DocumentPreview
    request={{ ...REQUEST, ...overrides }}
    open
    onClose={() => {}}
    {...props}
  />,
)

describe('prototype mode', () => {
  // ⚠️ ONE CONSTANT DECIDES IT, so switching to verified forms is one
  // line rather than deleting a banner from four template files and
  // missing the fifth.
  it('is on, and is the single switch', () => {
    expect(DOCUMENT_TEMPLATE_MODE).toBe('prototype')
    expect(isPrototypeMode()).toBe(true)
  })

  it('puts the SAMPLE watermark on every configured template', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      const page = container.querySelector('.doc-page')
      expect(page).toBeTruthy()
      // The diagonal mark, the banner and the footer line.
      expect(page.querySelector('.doc-watermark').textContent)
        .toContain(PROTOTYPE_WATERMARK.heading)
      const banner = page.querySelector('.doc-sample-banner')
      expect(banner.textContent).toContain(PROTOTYPE_WATERMARK.heading)
      expect(banner.textContent).toContain(PROTOTYPE_WATERMARK.subheading)
      expect(page.querySelector('.doc-footer-sample')).toBeTruthy()
      unmount()
    })
  })

  // The words appear inside the document itself, so they survive print
  // -- the toolbar chip does not.
  it('carries the watermark INSIDE the printable page, not only in the toolbar', () => {
    const { container } = show()
    const page = container.querySelector('.doc-page')
    expect(within(page).getAllByText(PROTOTYPE_WATERMARK.heading).length)
      .toBeGreaterThanOrEqual(1)
  })

  // ⚠️ The prose label survives a premature mode flip ON PURPOSE.
  // The replacement procedure is: replace the template bodies, THEN
  // flip the mode. Flipping first would otherwise leave prototype
  // wording on a page with no watermark; this label is what still says
  // so, and it disappears when the template body is replaced.
  it('labels the sample prose as prototype wording on every template', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      expect(container.querySelector('.doc-prose-label').textContent)
        .toBe('PROTOTYPE WORDING')
      unmount()
    })
  })
})

describe('each template', () => {
  it('renders its own title for its own type', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach((type) => {
      const { container, unmount } = show({ document_type: type })
      expect(container.querySelector('.doc-title').textContent)
        .toBe(DOCUMENT_TEMPLATES[type].displayName)
      unmount()
    })
  })

  it('renders the supplied request data', () => {
    const { container } = show()
    const page = container.querySelector('.doc-page')
    expect(page.textContent).toContain('Juan Dela Cruz')
    expect(page.textContent).toContain('Purok 4')
    expect(page.textContent).toContain('Employment requirement')
    expect(page.textContent).toContain('SAMPLE-3F9A2C71')
  })

  // ⚠️ NOTHING IS FABRICATED FOR AN ABSENT OPTIONAL FIELD.
  it('omits an absent optional field instead of printing a placeholder', () => {
    const { container } = show({ contact_number: null })
    const page = container.querySelector('.doc-page')
    expect(page.textContent).not.toContain('N/A')
    expect(page.textContent).not.toContain('UNKNOWN')
    expect(page.textContent).not.toContain('TBD')
    expect(page.querySelector('.doc-fields').textContent)
      .not.toContain('Contact number')
  })

  it('renders a very long name, purok and purpose without dropping them', () => {
    const longName = 'Maria Concepcion Magdalena de los Santos Villanueva-Buenaventura'
    const longPurpose = 'Requirement for the processing of a scholarship application. '.repeat(8)
    const { container } = show({
      full_name: longName,
      purok: 'Purok 7, Sitio Kalubihan, beside the covered court',
      purpose: longPurpose,
    })
    const page = container.querySelector('.doc-page')
    expect(page.textContent).toContain(longName)
    expect(page.textContent).toContain('Sitio Kalubihan')
    expect(page.textContent).toContain(longPurpose.trim().slice(0, 40))
  })

  it('renders accented characters and a suffix as stored', () => {
    const { container } = show({ full_name: 'Nicholas Khyle R. Mondoñedo Jr.' })
    expect(container.querySelector('.doc-page').textContent)
      .toContain('Nicholas Khyle R. Mondoñedo Jr.')
  })

  // ⚠️ No real official's name appears: nothing in the repository
  // establishes who signs which document.
  it('prints a placeholder signatory and no real name', () => {
    const { container } = show()
    const page = container.querySelector('.doc-page')
    expect(page.querySelector('.doc-sign-name').textContent).toBe('[AUTHORIZED SIGNATORY]')
    expect(page.querySelector('.doc-sign-position').textContent).toBe('[POSITION]')
    expect(page.textContent).not.toContain('Frankie Credo')
    expect(page.textContent).not.toContain('Alexis')
  })

  // ⚠️ THE INDIGENCY TEMPLATE ASSERTS NOTHING ECONOMIC. A resident
  // requesting the document is not evidence of any circumstance.
  it('states no income, bracket or finding on the indigency certificate', () => {
    const { container } = show({ document_type: 'Certificate of Indigency' })
    const body = container.querySelector('.doc-page').textContent.toLowerCase()
    expect(body).not.toMatch(/monthly income|income of|indigent family|below the poverty/)
    expect(body).not.toMatch(/\bphp\b|₱/)
  })

  // ⚠️ And the residency template claims no duration: the schema
  // stores no move-in date and no street address.
  it('states no residency duration on the residency certificate', () => {
    const { container } = show({ document_type: 'Certificate of Residency' })
    const body = container.querySelector('.doc-page').textContent.toLowerCase()
    expect(body).not.toMatch(/resident since|years of residen|bona fide resident of/)
  })

  it('exposes no ID document url even when the row carries one', () => {
    const { container } = show({ id_document_url: 'https://example.test/id.jpg' })
    expect(container.innerHTML).not.toContain('example.test')
  })
})

describe('the unsupported case', () => {
  // `document_type` is free text, so this is reachable.
  it('says so plainly instead of crashing', () => {
    expect(() => show({ document_type: 'Business Clearance' })).not.toThrow()
    expect(screen.getByText('Printable template not configured for this document type.'))
      .toBeInTheDocument()
  })

  it('renders no document page and disables Print', () => {
    const { container } = show({ document_type: 'Other' })
    expect(container.querySelector('.doc-page')).toBeNull()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
  })
})

describe('a missing required value', () => {
  // ⚠️ THE WARNING IS OUTSIDE THE DOCUMENT and printing is refused --
  // a blank line inside an official-looking field is a false statement.
  it('blocks the document and explains what is missing', () => {
    const { container } = show({ full_name: '   ' })
    expect(screen.getByRole('alert').textContent)
      .toContain("the resident's full name is missing")
    expect(container.querySelector('.doc-page')).toBeNull()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
  })

  it('blocks a residency certificate with no purok, but not a clearance', () => {
    const { unmount } = show({ document_type: 'Certificate of Residency', purok: null })
    expect(screen.getByRole('alert').textContent).toContain("resident's purok is missing")
    unmount()

    const { container } = show({ document_type: 'Barangay Clearance', purok: null })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('.doc-page')).toBeTruthy()
  })

  it('points at the existing workflow rather than offering an edit box', () => {
    show({ purpose: '' })
    expect(screen.getByRole('alert').textContent)
      .toContain('Correct the request through the existing workflow')
    // No field inside the preview is editable.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})

describe('the preview shell', () => {
  it('is a labelled modal dialog', () => {
    show()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('doc-preview-title')
    expect(document.getElementById('doc-preview-title').textContent)
      .toContain('Barangay Clearance')
  })

  it('renders nothing at all when closed, or with no request', () => {
    const { container: a } = render(
      <DocumentPreview request={REQUEST} open={false} onClose={() => {}} />,
    )
    expect(a.querySelector('.doc-preview')).toBeNull()
    const { container: b } = render(
      <DocumentPreview request={null} open onClose={() => {}} />,
    )
    expect(b.querySelector('.doc-preview')).toBeNull()
  })

  it('closes through Back to request', () => {
    const onClose = jest.fn()
    show({}, { onClose })
    fireEvent.click(screen.getByRole('button', { name: /back to request/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = jest.fn()
    show({}, { onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  // ⚠️ Browser-native printing, with no PDF dependency and no
  // automatic download: the Secretary reviews first.
  it('calls window.print and nothing else', () => {
    const print = jest.fn()
    const original = window.print
    window.print = print
    show()
    fireEvent.click(screen.getByRole('button', { name: /print/i }))
    expect(print).toHaveBeenCalledTimes(1)
    window.print = original
  })

  // The toolbar is screen chrome; the print stylesheet hides it.
  it('marks every control as no-print', () => {
    const { container } = show()
    expect(container.querySelector('.doc-preview-bar').className).toContain('no-print')
    ;['back to request', 'print'].forEach((name) => {
      const button = screen.getByRole('button', { name: new RegExp(name, 'i') })
      expect(button.closest('.no-print')).toBeTruthy()
    })
  })

  // The preview must not become a second heading-order defect.
  it('has exactly one document title inside the page', () => {
    const { container } = show()
    expect(container.querySelectorAll('.doc-page h1')).toHaveLength(1)
  })
})

describe('the data the preview hands a template', () => {
  it('is the adapter output, not the raw row', () => {
    const data = buildDocumentData(REQUEST, { requiredFields: ['fullName', 'purpose'] })
    expect(data.resident.fullName).toBe('Juan Dela Cruz')
    expect(data).not.toHaveProperty('resident_id')
    expect(data).not.toHaveProperty('reviewed_by')
  })
})
