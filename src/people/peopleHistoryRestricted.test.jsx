// People & History when migration 066 withholds complaint records from a viewer
// who is not records staff. The screen must say the records are restricted --
// never that the person has none -- and must show no count it was not given.
import { fireEvent, render, screen, within } from '@testing-library/react'
import PeopleHistory, { COMPLAINTS_RESTRICTED } from './PeopleHistory'
import * as api from './peopleApi'

jest.mock('./peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children }) => <div role="dialog" aria-label={title}>{children}</div>)

const identity = { kind: 'resident', id: 'r1', full_name: 'Ana Santos', purok: 'Purok 1', resident_status: 'active', credit_applicable: true }
const incident = { incident_id: 'i1', reference: 'INC-2026-AAAAAA', type: 'other', role: 'witness', outcome: 'not_determined' }
const complaint = { complaint_id: 'c1', reference: 'CMP-2026-CCCCCC', status: 'received', roles: ['respondent'] }
const analytics = (summary) => ({
  coverage: { message: 'Based on verified linked records.' }, filters: { window: 'all' }, summary,
  comparison: { current_period_qualifying_matters: 0, previous_period_qualifying_matters: 0 },
  roles: [], outcomes: [], categories: [], locations: [], weekdays: [], time_buckets: [], contributing_matters: [], indicators: [{}, {}],
})

const openPerson = async (history, summary) => {
  api.searchPeople.mockResolvedValue([{ person_kind: 'resident', person_id: 'r1', full_name: 'Ana Santos', secondary_text: 'Purok 1' }])
  api.loadPersonHistory.mockResolvedValue({ identity, incidents: [incident], timeline: [], ...history })
  api.loadPersonAnalytics.mockResolvedValue(analytics(summary))
  render(<PeopleHistory />)
  fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click(await screen.findByRole('button', { name: 'View history' }))
  return screen.findByRole('dialog', { name: 'Person History' })
}
const summaryValue = (dialog, label) => within(dialog).getByText(label).closest('div').querySelector('strong').textContent

beforeEach(() => jest.resetAllMocks())

describe('an official who is not records staff (066 restricted response)', () => {
  test('the Complaints & KP tab states the restriction, not an absence', async () => {
    const dialog = await openPerson({ complaints: [], complaints_restricted: true }, { distinct_linked_matters: 1, incident_matters: 1, complaint_kp_matters: null })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Complaints & KP' }))
    expect(within(dialog).getByRole('note')).toHaveTextContent(COMPLAINTS_RESTRICTED)
    expect(within(dialog).queryByText('No linked complaint or KP records yet.')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/CMP-/)).not.toBeInTheDocument()
  })

  test('the complaint count reads Restricted, never a number', async () => {
    const dialog = await openPerson({ complaints: [], complaints_restricted: true }, { distinct_linked_matters: 1, incident_matters: 1, complaint_kp_matters: null })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Analytics' }))
    expect(summaryValue(dialog, 'Complaint/KP matters')).toBe('Restricted')
    expect(summaryValue(dialog, 'Incident matters')).toBe('1')
  })

  test('the message is the same whether or not the person has complaints (it depends on the viewer only)', async () => {
    const dialog = await openPerson({ complaints: [], complaints_restricted: true }, { complaint_kp_matters: null })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Complaints & KP' }))
    const text = within(dialog).getByRole('note').textContent
    expect(text).toBe(COMPLAINTS_RESTRICTED)
    expect(text).not.toMatch(/\d|none|no complaint|has/i)
  })
})

describe('records staff (066 unrestricted response)', () => {
  test('complaints and their count are shown', async () => {
    const dialog = await openPerson({ complaints: [complaint], complaints_restricted: false }, { distinct_linked_matters: 2, incident_matters: 1, complaint_kp_matters: 1 })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Complaints & KP' }))
    expect(within(dialog).getByText('CMP-2026-CCCCCC')).toBeInTheDocument()
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Analytics' }))
    expect(summaryValue(dialog, 'Complaint/KP matters')).toBe('1')
  })

  test('a genuinely empty complaint history still says none, with a real 0', async () => {
    const dialog = await openPerson({ complaints: [], complaints_restricted: false }, { distinct_linked_matters: 1, incident_matters: 1, complaint_kp_matters: 0 })
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Complaints & KP' }))
    expect(within(dialog).getByText('No linked complaint or KP records yet.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Analytics' }))
    expect(summaryValue(dialog, 'Complaint/KP matters')).toBe('0')
  })
})

test('before 066 (no flag in the response) the screen behaves exactly as it did', async () => {
  const dialog = await openPerson({ complaints: [] }, { distinct_linked_matters: 1, incident_matters: 1, complaint_kp_matters: 0 })
  fireEvent.click(within(dialog).getByRole('tab', { name: 'Complaints & KP' }))
  expect(within(dialog).getByText('No linked complaint or KP records yet.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
})
