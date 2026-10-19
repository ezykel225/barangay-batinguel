// P3-B1. The filing form as rendered.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('./complaintApi', () => ({ fileComplaintWithEvidence: jest.fn() }))
const { fileComplaintWithEvidence } = require('./complaintApi')
const FileComplaintForm = require('./FileComplaintForm').default

const noop = () => {}
const renderForm = (onFiled = noop) => render(
  <FileComplaintForm onFiled={onFiled} onCancel={noop} />
)

beforeEach(() => {
  fileComplaintWithEvidence.mockResolvedValue({
    reference: 'CMP-2026-AB12CD', complaintId: 'c1', failedFiles: [],
  })
})

const fillRequired = async () => {
  await userEvent.selectOptions(
    screen.getByLabelText(/What is this complaint about/i), 'noise'
  )
  await userEvent.type(screen.getByLabelText(/What happened/i), 'Loud karaoke past midnight.')
}

describe('the category control', () => {
  it('offers the eight human labels and no raw value', () => {
    renderForm()
    const select = screen.getByLabelText(/What is this complaint about/i)
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual([
      'Choose one', 'Noise Complaint', 'Debt / Unpaid Obligation',
      'Boundary Dispute', 'Physical Altercation', 'Theft', 'Threats',
      'Family Dispute', 'Other',
    ])
    labels.forEach((l) => expect(l).not.toContain('_'))
  })

  it('submits the STORED value, not the label', async () => {
    renderForm()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
    await waitFor(() => expect(fileComplaintWithEvidence).toHaveBeenCalled())
    expect(fileComplaintWithEvidence.mock.calls[0][0].category).toBe('noise')
  })
})

describe('required fields', () => {
  it('refuses a submission with no category and says so accessibly', async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText(/What happened/i), 'Something happened.')
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose what the complaint is about/i)
    expect(fileComplaintWithEvidence).not.toHaveBeenCalled()
  })

  it('refuses a submission with no narrative', async () => {
    renderForm()
    await userEvent.selectOptions(
      screen.getByLabelText(/What is this complaint about/i), 'theft'
    )
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/describe what happened/i)
    expect(fileComplaintWithEvidence).not.toHaveBeenCalled()
  })

  it('marks both required controls as required accessibly', () => {
    renderForm()
    expect(screen.getByLabelText(/What is this complaint about/i)).toBeRequired()
    expect(screen.getByLabelText(/What happened/i)).toBeRequired()
  })

  it('asks for nothing the server owns', () => {
    renderForm()
    ;[/status/i, /reference/i, /encoded/i, /filed by/i, /created/i, /actor/i]
      .forEach((label) => expect(screen.queryByLabelText(label)).toBeNull())
  })
})

describe('respondents', () => {
  it('starts with one block and never requires a name', async () => {
    renderForm()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).not.toBeRequired()
    // A respondent is optional end to end: filing with none succeeds.
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
    await waitFor(() => expect(fileComplaintWithEvidence).toHaveBeenCalled())
    expect(fileComplaintWithEvidence.mock.calls[0][0].respondents).toHaveLength(1)
  })

  it('adds and removes additional blocks, each named accessibly', async () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Remove person 1' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Add another person/i }))
    expect(screen.getAllByLabelText('Name')).toHaveLength(2)
    // ⚠️ Named with the person it removes -- identical "Remove"
    // buttons are what ActionMenu's `subject` prop exists to fix.
    expect(screen.getByRole('button', { name: 'Remove person 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove person 2' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove person 2' }))
    expect(screen.getAllByLabelText('Name')).toHaveLength(1)
  })

  it('sends every named respondent through', async () => {
    renderForm()
    await fillRequired()
    await userEvent.type(screen.getAllByLabelText('Name')[0], 'First Person')
    await userEvent.click(screen.getByRole('button', { name: /Add another person/i }))
    await userEvent.type(screen.getAllByLabelText('Name')[1], 'Second Person')
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))

    await waitFor(() => expect(fileComplaintWithEvidence).toHaveBeenCalled())
    const names = fileComplaintWithEvidence.mock.calls[0][0].respondents.map((r) => r.fullName)
    expect(names).toEqual(['First Person', 'Second Person'])
  })

  it('offers no registry or account lookup to a resident', () => {
    renderForm()
    // ⚠️ No search over residents_registry and no account picker: the
    // backend links a party only where a real link exists, and being
    // named in a complaint must create nothing.
    ;[/search/i, /registry/i, /voter/i, /look ?up/i, /select a resident/i]
      .forEach((label) => expect(screen.queryByLabelText(label)).toBeNull())
  })
})

describe('attachments', () => {
  it('constrains the picker to the four accepted types', () => {
    renderForm()
    const input = screen.getByLabelText(/Attach photos or a PDF/i)
    const accept = input.getAttribute('accept')
    expect(accept).not.toBe('*/*')
    expect(accept).not.toContain('*')
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('video/mp4')
  })

  it('tells the truth about video, in words', () => {
    renderForm()
    expect(screen.getByText(/Videos: MP4 or WebM/i)).toBeInTheDocument()
    expect(screen.getByText(/25 MB/)).toBeInTheDocument()
  })

  it('refuses an unsupported video file with a readable reason', async () => {
    renderForm()
    const file = new File(['x'], 'clip.mov', { type: 'video/quicktime' })
    await userEvent.upload(screen.getByLabelText(/Attach photos or a PDF/i), file)
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a supported type/i)
    expect(screen.queryByText('clip.mov')).toBeNull()
  })

  it('lists an accepted file with its name, kind and size, and removes it', async () => {
    renderForm()
    const file = new File(['abcd'], 'proof.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(/Attach photos or a PDF/i), file)

    expect(await screen.findByText('proof.png')).toBeInTheDocument()
    expect(screen.getByText(/Photo ·/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove proof.png' }))
    expect(screen.queryByText('proof.png')).toBeNull()
  })
})

describe('duplicate submission', () => {
  it('files once however many times the button is clicked', async () => {
    // ⚠️ A second click while the first request is in flight would file
    // a SECOND complaint with its own reference, and nothing
    // downstream could tell them apart -- the resident would simply
    // have two.
    let release
    fileComplaintWithEvidence.mockImplementation(
      () => new Promise((resolve) => { release = resolve })
    )
    renderForm()
    await fillRequired()

    const submit = screen.getByRole('button', { name: /Submit complaint/i })
    await userEvent.click(submit)
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent('Submitting...')

    await userEvent.click(submit)
    await userEvent.click(submit)
    expect(fileComplaintWithEvidence).toHaveBeenCalledTimes(1)

    release({ reference: 'CMP-2026-AB12CD', complaintId: 'c1', failedFiles: [] })
  })
})

describe('failure messages', () => {
  it('shows a neutral sentence and no database detail', async () => {
    const err = new Error('file-failed')
    err.kind = 'submitFailed'
    fileComplaintWithEvidence.mockRejectedValue(err)

    renderForm()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not submit your complaint/i)
    ;['42501', 'P0001', 'policy', 'rpc', 'supabase', 'file-failed']
      .forEach((leak) => expect(alert.textContent).not.toContain(leak))
  })

  it('re-enables the button so a real failure can be retried', async () => {
    const err = new Error('x'); err.kind = 'submitFailed'
    fileComplaintWithEvidence.mockRejectedValue(err)
    renderForm()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /Submit complaint/i }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /Submit complaint/i })).not.toBeDisabled()
  })
})

describe('the emergency notice', () => {
  it('appears, and names no phone number', () => {
    renderForm()
    expect(screen.getByText(/not an emergency service/i)).toBeInTheDocument()
    // ⚠️ NO NUMBER. The only numbers this repository holds are the
    // Barangay Hall's own office landline and mobile, which keep office
    // hours with a lunch closure -- presenting those as emergency
    // response would be untrue, and inventing a police or hotline
    // number would be worse.
    const text = screen.getByRole('note').textContent
    expect(text).not.toMatch(/\d{3}/)
    expect(text).not.toMatch(/911|117|tel:/)
    expect(text).toMatch(/emergency or police service/i)
  })
})

describe('neutral copy', () => {
  it('promises no legal outcome anywhere on the form', () => {
    const { container } = renderForm()
    const text = container.textContent.toLowerCase()
    ;['mediation', 'conciliation', 'hearing', 'summons', 'settlement',
      'lupon', 'pangkat', 'katarungan', 'arrest', 'we will resolve',
      'within 24 hours', 'guaranteed', 'your case', 'file a case',
      'jurisdiction', 'eligible']
      .forEach((promise) => expect(text).not.toContain(promise))
  })
})
