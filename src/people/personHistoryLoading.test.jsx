import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PeopleHistory from './PeopleHistory'
import ResidentHistory from './ResidentHistory'
import * as api from './peopleApi'

jest.mock('./peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children, onClose }) => <div role="dialog" aria-label={title}>{children}<button onClick={onClose}>Close</button></div>)

// Remediation C: a failed analytics request must not hide a person's history.
const history = {
  identity: { kind: 'resident', id: 'r1', full_name: 'Ana Santos', purok: 'Purok 1', resident_status: 'active', credit_applicable: true },
  incidents: [{ incident_id: 'i1', reference: 'INC-2026-AAAAAA', type: 'other', role: 'respondent', outcome: 'not_determined' }],
  complaints: [], timeline: [],
}
const analytics = {
  coverage: { message: 'Based on verified linked records.' }, filters: { window: 'all' },
  summary: { distinct_linked_matters: 1, incident_matters: 1, complaint_kp_matters: 0 },
  comparison: { current_period_qualifying_matters: 1, previous_period_qualifying_matters: 0 },
  roles: [], outcomes: [], categories: [], locations: [], weekdays: [], time_buckets: [], contributing_matters: [], indicators: [{}, {}],
}
const down = () => Object.assign(new Error('The people-history operation could not be completed.'), { code: '08006' })

beforeEach(() => {
  jest.resetAllMocks()
  api.searchPeople.mockResolvedValue([{ person_kind: 'resident', person_id: 'r1', full_name: 'Ana Santos', secondary_text: 'Purok 1' }])
  api.loadPersonHistory.mockResolvedValue(history)
  api.loadPersonAnalytics.mockResolvedValue(analytics)
})

const searchAndOpen = async () => {
  render(<PeopleHistory />)
  fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click(await screen.findByRole('button', { name: 'View history' }))
}

describe('People & History', () => {
  test('the history opens even when its analytics request fails', async () => {
    api.loadPersonAnalytics.mockRejectedValue(down())
    await searchAndOpen()
    expect(await screen.findByRole('dialog', { name: 'Person History' })).toBeInTheDocument()
    expect(screen.queryByText(/Unable to complete that operation/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Incidents & Blotter' }))
    expect(screen.getByText('INC-2026-AAAAAA')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Analytics are unavailable for this person right now/)
    expect(screen.queryByText(/Loading factual analytics/)).not.toBeInTheDocument()
  })

  test('retrying unavailable analytics loads them into the open history', async () => {
    api.loadPersonAnalytics.mockRejectedValueOnce(down()).mockResolvedValue(analytics)
    await searchAndOpen()
    await screen.findByRole('dialog', { name: 'Person History' })
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Distinct linked matters')).toBeInTheDocument()
    expect(api.loadPersonAnalytics).toHaveBeenLastCalledWith('resident', 'r1', { window: 'all' })
  })

  test('a failed history reports an error and opens nothing', async () => {
    api.loadPersonHistory.mockRejectedValue(down())
    await searchAndOpen()
    expect(await screen.findByText(/Unable to complete that operation/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('a failed time-window change is reported and the figures already shown are kept', async () => {
    await searchAndOpen()
    await screen.findByRole('dialog', { name: 'Person History' })
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }))
    api.loadPersonAnalytics.mockRejectedValue(down())
    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: 'last_30_days' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics for that time window are unavailable. Try again.')
    expect(screen.getByText('Distinct linked matters')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Time window')).not.toBeDisabled())
    expect(screen.queryByText('Updating analytics…')).not.toBeInTheDocument()
  })
})

describe('Resident profile linked history', () => {
  test('shows the history when only the analytics fail', async () => {
    api.loadPersonAnalytics.mockRejectedValue(down())
    render(<ResidentHistory residentId="r1" />)
    expect(await screen.findByText('INC-2026-AAAAAA')).toBeInTheDocument()
    expect(screen.queryByText(/History is unavailable/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Analytics are unavailable for this person right now/)
  })

  test('a failed history replaces the loading message with the unavailable message', async () => {
    api.loadPersonHistory.mockRejectedValue(down())
    render(<ResidentHistory residentId="r1" />)
    expect(screen.getByText('Loading verified links…')).toBeInTheDocument()
    expect(await screen.findByText(/History is unavailable or your account cannot view it/)).toBeInTheDocument()
    expect(screen.queryByText('Loading verified links…')).not.toBeInTheDocument()
  })
})
