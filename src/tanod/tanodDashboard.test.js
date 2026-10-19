import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TanodDashboard from '../dashboards/TanodDashboard'
import PublicTanodDuty from './PublicTanodDuty'
import TanodAccounts from './TanodAccounts'
import { dutyDate, dutyState, manilaInputNow, shiftIsCurrent } from './tanodDuty'
import * as api from './tanodPortalApi'
import { recordIncident } from '../incidents/incidentApi'

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), auth: { signOut: jest.fn() } } }))
jest.mock('./tanodPortalApi', () => ({ loadMyTanodIdentity: jest.fn(), loadMyDuty: jest.fn(), loadMyReports: jest.fn(), checkIn: jest.fn(), checkOut: jest.fn(), loadMyFollowups: jest.fn(), addFollowup: jest.fn(), loadPublicTanodDuty: jest.fn(), loadAccountStates: jest.fn(), setAccountLink: jest.fn() }))
jest.mock('../incidents/incidentApi', () => ({ recordIncident: jest.fn() }))
const shift = { assignment_id: 'shift-a', assignment_date: '2026-10-19', shift_start: '2026-10-19T10:00:00Z', shift_end: '2026-10-19T14:00:00Z', area_label: 'General road area', active: true, attendance_id: null, checked_in_at: null, checked_out_at: null }
const reports = [
  { incident_id: 'own', reference: 'INC-OWN', incident_type: 'traffic_accident', occurred_at: '2026-10-19T10:30:00Z', general_location: 'Road area', status: 'recorded', submitted_by_me: true, assigned_to_me: false, kp_linked: false },
  { incident_id: 'assigned', reference: 'INC-ASSIGNED', incident_type: 'disturbance', occurred_at: '2026-10-19T10:40:00Z', general_location: 'Residential area', status: 'responding', submitted_by_me: false, assigned_to_me: true, kp_linked: true },
]
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-19T11:00:00Z'))
  jest.clearAllMocks()
  require('../context/AuthContext').useAuth.mockReturnValue({ logout: jest.fn() })
  window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() })
  api.loadMyTanodIdentity.mockResolvedValue({ display_name: 'Sample Tanod', usual_area: 'General area', reports_today: 2 })
  api.loadMyDuty.mockResolvedValue([shift]); api.loadMyReports.mockResolvedValue(reports)
  api.loadMyFollowups.mockResolvedValue([]); api.checkIn.mockResolvedValue(); api.checkOut.mockResolvedValue(); api.addFollowup.mockResolvedValue()
  api.loadAccountStates.mockResolvedValue([{ tanod_id: 'member', account_state: 'Not linked', profile_id: null }])
  api.setAccountLink.mockResolvedValue(); api.loadPublicTanodDuty.mockResolvedValue([])
  recordIncident.mockResolvedValue('INC-NEW-REFERENCE')
})
afterEach(() => { jest.useRealTimers() })
const show = () => render(<MemoryRouter><TanodDashboard /></MemoryRouter>)
const ready = async () => { await screen.findByRole('heading', { name: 'Good evening, Sample Tanod' }) }
test('shows four focused navigation choices and never infers attendance from a schedule', async () => {
  show(); await ready()
  const nav = screen.getByRole('navigation', { name: 'Tanod dashboard' })
  expect(within(nav).getAllByRole('button')).toHaveLength(4)
  expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0)
  expect(screen.queryByText('Currently on duty')).toBeNull()
  expect(screen.getByText('2 reports submitted today')).toBeInTheDocument()
  expect(screen.queryByText(/approve clearance|jurisdiction|CTFA/i)).toBeNull()
})

test('main header has no redundant portal label and retains its refresh action', async () => {
  show(); await ready()
  const main = screen.getByRole('main')
  expect(within(main).queryByText('Tanod Portal')).toBeNull()
  expect(within(main).getByRole('button', { name: 'Refresh my information' })).toBeEnabled()
  const summary = screen.getByRole('region', { name: 'Duty summary' })
  expect(within(summary).getByText('Scheduled')).toHaveClass('td-state-scheduled')
})

test('overview separates today and next duty with no redundant Quick Actions', async () => {
  show(); await ready()
  const main = screen.getByRole('main')
  expect(main.querySelector('.td-content')).toBeInTheDocument()
  expect(within(main).getByRole('heading', { name: "Today's Duty" })).toBeInTheDocument()
  expect(within(main).getByRole('heading', { name: 'Next Duty' })).toBeInTheDocument()
  expect(within(main).queryByRole('heading', { name: 'Quick Actions' })).toBeNull()
  expect(main.querySelector('.td-overview-grid')).toBeNull()
})

test.each([false, true])('overview reuses completed duty today when a later assignment exists: %s', async (includeFuture) => {
  const completed = { ...shift, attendance_id: 'done', checked_in_at: shift.shift_start, checked_out_at: '2026-10-19T10:45:00Z' }
  const future = { ...shift, assignment_id: 'tomorrow', assignment_date: '2026-10-20', area_label: 'Tomorrow area', shift_start: '2026-10-20T10:00:00Z', shift_end: '2026-10-20T14:00:00Z' }
  api.loadMyDuty.mockResolvedValue(includeFuture ? [completed, future] : [completed])
  show(); await ready()
  const duty = screen.getByRole('region', { name: "Today's Duty" })
  expect(within(duty).getByText('Completed')).toBeInTheDocument()
  expect(within(duty).getByText('Checked out')).toBeInTheDocument()
  expect(within(duty).queryByRole('button', { name: 'Check In' })).toBeNull()
  expect(within(duty).queryByText('Tomorrow area')).toBeNull()
  const nextDuty = screen.getByRole('region', { name: 'Next Duty' })
  expect(within(nextDuty).queryByRole('button', { name: 'Check In' })).toBeNull()
  if (includeFuture) {
    expect(within(nextDuty).getByText('Tomorrow area')).toBeInTheDocument()
    expect(within(nextDuty).getByText('Scheduled')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Duty summary' })
    expect(within(summary).getByText('Completed')).toBeInTheDocument()
    expect(within(summary).getByText('Next shift')).toBeInTheDocument()
    expect(within(summary).getByText('20 October 2026')).toBeInTheDocument()
  }
  expect(api.loadMyDuty).toHaveBeenCalledTimes(1)
})

test('overview with no loaded duty shows compact independent empty states', async () => {
  api.loadMyDuty.mockResolvedValue([])
  show(); await ready()
  const duty = screen.getByRole('region', { name: "Today's Duty" })
  expect(within(duty).getByText('No duty recorded for today.')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Next Duty' })).getByText('No upcoming duty.')).toBeInTheDocument()
  expect(duty.querySelectorAll('.dashboard-card')).toHaveLength(1)
})

test('successful submission keeps the reference banner separate and can navigate to existing reports', async () => {
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Report Incident' }))
  fireEvent.change(screen.getByLabelText('General location'), { target: { value: 'General road area' } })
  fireEvent.change(screen.getByLabelText('Incident description'), { target: { value: 'Operational concern.' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Submit incident report' }).closest('form'))
  await screen.findByText('INC-NEW-REFERENCE')
  fireEvent.click(screen.getByRole('button', { name: 'View My Reports' }))
  expect(screen.getByRole('heading', { name: 'My Reports' })).toBeInTheDocument()
  expect(screen.getByText('INC-OWN')).toBeInTheDocument()
  expect(recordIncident).toHaveBeenCalledTimes(1)
})

test.each([[0, '0 reports submitted today'], [1, '1 report submitted today'], [2, '2 reports submitted today']])(
  'reports today uses correct pluralization for %i', async (count, label) => {
    api.loadMyTanodIdentity.mockResolvedValue({ display_name: 'Sample Tanod', reports_today: count })
    show(); await ready()
    expect(screen.getByText(label)).toBeInTheDocument()
  }
)

test('report cards group existing status, attribution and location metadata without extra case details', async () => {
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  const report = screen.getByRole('heading', { name: 'INC-ASSIGNED' }).closest('article')
  expect(within(report).getByText('Assigned to me')).toBeInTheDocument()
  expect(within(report).getByText('Residential area')).toBeInTheDocument()
  expect(within(report).getByText('Being attended to')).toBeInTheDocument()
  expect(within(report).getByText(/KP case linked/)).toBeInTheDocument()
  expect(report.querySelector('time')).toHaveAttribute('dateTime', reports[1].occurred_at)
  expect(within(report).queryByText(/Incident status:/)).toBeNull()
  const ownReport = screen.getByRole('heading', { name: 'INC-OWN' }).closest('article')
  expect(ownReport.querySelector('.td-report-header > .td-state')).toHaveTextContent('Recorded')
  expect(within(ownReport).getByText('No KP case linked')).toBeInTheDocument()
  expect(screen.getByText('Showing up to 100 relevant reports. Restricted case details remain visible only to authorized staff.')).toBeInTheDocument()
})

test('follow-up disclosure presents its empty state and timestamped entries using existing readers', async () => {
  api.loadMyReports.mockResolvedValue([reports[0]])
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  const disclosure = screen.getByText('Operational follow-up notes').closest('details')
  const footer = disclosure.querySelector('summary')
  expect(footer.querySelectorAll('svg')).toHaveLength(2)
  expect(footer.querySelectorAll('.td-followup-chevron')).toHaveLength(1)
  expect(disclosure).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('Operational follow-up notes'))
  expect(disclosure).toHaveAttribute('open')
  expect(within(disclosure).getByText('No follow-up notes')).toBeInTheDocument()
  expect(within(disclosure).getByLabelText('Operational follow-up')).toBeInTheDocument()
  api.loadMyFollowups.mockResolvedValue([{ id: 'note-a', note: 'Routine update.', created_at: '2026-10-19T11:00:00Z' }])
  fireEvent.change(within(disclosure).getByLabelText('Operational follow-up'), { target: { value: 'Routine update.' } })
  fireEvent.submit(within(disclosure).getByRole('button', { name: 'Add follow-up note' }).closest('form'))
  await waitFor(() => expect(disclosure.querySelector('time')).toHaveAttribute('dateTime', '2026-10-19T11:00:00Z'))
  expect(within(disclosure).queryByText('No follow-up notes')).toBeNull()
  expect(disclosure.querySelector('time')).toHaveAttribute('dateTime', '2026-10-19T11:00:00Z')
})

test('report form has one incident-description label without a competing heading', async () => {
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Report Incident' }))
  expect(screen.queryByRole('heading', { name: 'What happened' })).toBeNull()
  expect(screen.getByLabelText('Incident description')).toBeRequired()
  expect(screen.queryByLabelText('What happened')).toBeNull()
})

test('reports render an empty-state card, including when the selected filter has no matches', async () => {
  api.loadMyReports.mockResolvedValue([reports[1]])
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  expect(screen.queryByRole('heading', { name: 'No reports found' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Show reports'), { target: { value: 'submitted' } })
  expect(screen.getByRole('heading', { name: 'No reports found' }).closest('.dashboard-card')).toBeInTheDocument()
  expect(screen.getByText('Incidents you submit or that are assigned to you will appear here.')).toBeInTheDocument()
})

test('an empty report collection also shows the new empty state', async () => {
  api.loadMyReports.mockResolvedValue([])
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  expect(screen.getByRole('heading', { name: 'No reports found' })).toBeInTheDocument()
})

test('My Duty keeps current actions above the read-only schedule', async () => {
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Duty' }))
  const schedule = screen.getByRole('region', { name: 'Duty Schedule' })
  expect(within(schedule).getByRole('heading', { name: '19 October 2026' })).toBeInTheDocument()
  expect(within(schedule).queryByRole('button', { name: 'Check In' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Check In' })).toBeEnabled()
})

test('future duty appears on its selected calendar date', async () => {
  api.loadMyDuty.mockResolvedValue([shift, { ...shift, assignment_id: 'next-day', assignment_date: '2026-10-20', shift_start: '2026-10-20T10:00:00Z', shift_end: '2026-10-20T14:00:00Z' }])
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'My Duty' }))
  fireEvent.click(screen.getByRole('button', { name: /Tuesday 20 October 2026, 1 assignment/ }))
  expect(screen.getByRole('heading', { name: '20 October 2026' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check In' })).toBeEnabled()
  expect(api.checkIn).not.toHaveBeenCalled()
})

test('overview reuses the sidebar shell and prioritizes the assigned patrol area', async () => {
  show(); await ready()
  expect(screen.getByRole('complementary', { name: 'Tanod Portal sidebar' })).toBeInTheDocument()
  const summary = screen.getByRole('region', { name: 'Duty summary' })
  expect(within(summary).getByText('General road area')).toBeInTheDocument()
  expect(within(summary).queryByText('General area')).toBeNull()
  expect(screen.queryByText('Usual area: Not recorded')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Report Incident' }))
  expect(screen.getByLabelText('Incident type')).toBeInTheDocument()
})

test.each([375, 480, 768, 1280])('shared navigation remains operable at %ipx', async (width) => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  window.matchMedia.mockReturnValue({ matches: width >= 769, addEventListener: jest.fn(), removeEventListener: jest.fn() })
  try {
    show(); await ready()
    if (width >= 769) {
      fireEvent.click(screen.getByRole('button', { name: 'My Duty' }))
      expect(screen.getByRole('heading', { name: 'My Duty' })).toBeInTheDocument()
    } else {
      const menu = screen.getByRole('button', { name: 'Open navigation menu' })
      fireEvent.click(menu)
      const drawer = screen.getByRole('dialog', { name: 'Tanod Portal navigation' })
      expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(menu).toHaveFocus()
      fireEvent.click(menu)
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'My Reports' }))
      expect(drawer).not.toBeInTheDocument()
      expect(screen.getByText('INC-OWN')).toBeInTheDocument()
      expect(document.body.style.overflow).not.toBe('hidden')
    }
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})

test('sidebar logout preserves the existing authenticated logout action', async () => {
  const logout = jest.fn().mockResolvedValue()
  require('../context/AuthContext').useAuth.mockReturnValue({ logout })
  show(); await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
})
test('own duty reader takes no identity parameter; check-in is explicit and duplicate clicks are prevented', async () => {
  let finish
  api.checkIn.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  show(); await ready()
  expect(api.loadMyDuty).toHaveBeenCalledWith()
  expect(api.checkIn).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Check In')); fireEvent.click(screen.getByText('Check In'))
  expect(api.checkIn).toHaveBeenCalledTimes(1)
  expect(api.checkIn).toHaveBeenCalledWith('shift-a')
  api.loadMyDuty.mockResolvedValue([{ ...shift, attendance_id: 'attendance-a', checked_in_at: '2026-10-19T11:00:00Z' }])
  await act(async () => finish())
  expect(await screen.findByText('Check Out')).toBeInTheDocument()
  expect(screen.getAllByText('Currently on duty').length).toBeGreaterThan(0)
})
test('explicit checkout uses only the own attendance ID and refreshes completion', async () => {
  api.loadMyDuty.mockResolvedValue([{ ...shift, attendance_id: 'attendance-a', checked_in_at: '2026-10-19T10:00:00Z' }])
  show(); await ready()
  api.loadMyDuty.mockResolvedValue([{ ...shift, attendance_id: 'attendance-a', checked_in_at: '2026-10-19T10:00:00Z', checked_out_at: '2026-10-19T11:00:00Z' }])
  fireEvent.click(screen.getByText('Check Out'))
  await waitFor(() => expect(api.checkOut).toHaveBeenCalledWith('attendance-a'))
  fireEvent.click(screen.getByRole('button', { name: 'My Duty' }))
  expect((await screen.findAllByText('Completed')).length).toBeGreaterThan(0)
})
test('missing shift times cannot be checked in and an expired unclosed shift needs checkout', () => {
  expect(shiftIsCurrent({ ...shift, shift_start: null })).toBe(false)
  expect(dutyState(shift)).toBe('Scheduled')
  expect(dutyState({ ...shift, checked_in_at: '2026-10-19T10:00:00Z' }, new Date('2026-10-19T15:00:00Z'))).toBe('Check-out needed')
})
test.each(['unlinked','inactive','wrong role'])('%s operational refusal shows no private duty or reporting controls', async () => {
  api.loadMyTanodIdentity.mockRejectedValue(new Error('Access denied'))
  show()
  await screen.findByRole('alert')
  expect(screen.queryByText('Sample Tanod')).toBeNull()
  expect(screen.queryByText('Check In')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Report Incident' }))
  expect(screen.queryByLabelText('Incident description')).toBeNull()
})
test('incident report reuses the existing writer, Philippine time and optional manual GPS without a Tanod ID', async () => {
  show(); await ready()
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Report Incident' }))
  fireEvent.change(screen.getByLabelText('General location'), { target: { value: 'Road area' } })
  fireEvent.change(screen.getByLabelText('Incident description'), { target: { value: 'Operational observation' } })
  fireEvent.change(screen.getByLabelText('Latitude (optional)'), { target: { value: '9.310' } })
  fireEvent.change(screen.getByLabelText('Longitude (optional)'), { target: { value: '123.280' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Submit incident report' }).closest('form'))
  await screen.findByText('INC-NEW-REFERENCE')
  expect(screen.getByText('Incident recorded successfully').closest('[role="status"]')).toHaveTextContent('INC-NEW-REFERENCE')
  const args = recordIncident.mock.calls[0][0]
  expect(args).toEqual(expect.objectContaining({ source: 'tanod_report', occurredAt: '2026-10-19T11:00:00.000Z', latitude: '9.310', longitude: '123.280' }))
  expect(args).not.toHaveProperty('tanodId'); expect(args).not.toHaveProperty('recorded_by')
})
test('half coordinates stop submission and preserve manual correction', async () => {
  show(); await ready()
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Report Incident' }))
  fireEvent.change(screen.getByLabelText('General location'), { target: { value: 'Road area' } })
  fireEvent.change(screen.getByLabelText('Incident description'), { target: { value: 'Observation' } })
  fireEvent.change(screen.getByLabelText('Latitude (optional)'), { target: { value: '9.31' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Submit incident report' }).closest('form'))
  expect(screen.getByRole('alert')).toHaveTextContent('both coordinates')
  expect(recordIncident).not.toHaveBeenCalled()
})
test('My Reports filters own submissions/attributions and shows no legal case details', async () => {
  show(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  expect(screen.getByText('INC-OWN')).toBeInTheDocument(); expect(screen.getByText('INC-ASSIGNED')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Show reports'), { target: { value: 'submitted' } })
  expect(screen.getByText('INC-OWN')).toBeInTheDocument(); expect(screen.queryByText('INC-ASSIGNED')).toBeNull()
  fireEvent.change(screen.getByLabelText('Show reports'), { target: { value: 'assigned' } })
  expect(screen.queryByText('INC-OWN')).toBeNull(); expect(screen.getByText('INC-ASSIGNED')).toBeInTheDocument()
  expect(screen.getByText(/KP case linked — contact authorized/)).toBeInTheDocument()
})
test('operational note uses the relevant incident ID, stamps no actor from the client, and writes once', async () => {
  show(); await ready(); fireEvent.click(screen.getByRole('button', { name: 'My Reports' }))
  fireEvent.change(screen.getByLabelText('Show reports'), { target: { value: 'assigned' } })
  fireEvent.click(screen.getByText('Operational follow-up notes'))
  fireEvent.change(screen.getByLabelText('Operational follow-up'), { target: { value: 'Situation was calm.' } })
  let finish
  api.addFollowup.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const form = screen.getByText('Add follow-up note').closest('form')
  fireEvent.submit(form); fireEvent.submit(form)
  expect(api.addFollowup).toHaveBeenCalledTimes(1)
  expect(api.addFollowup).toHaveBeenCalledWith('assigned','Situation was calm.')
  await act(async () => finish())
  expect(await screen.findByText(/Operational note recorded/)).toBeInTheDocument()
})
test('public duty renders only approved fields and never upgrades scheduled to currently on duty', async () => {
  api.loadPublicTanodDuty.mockResolvedValue([{ display_name: 'Public Tanod', general_area: 'General area', shift_start: shift.shift_start, shift_end: shift.shift_end, duty_state: 'scheduled', profile_id: 'SECRET-PROFILE', contact_number: 'SECRET-PHONE', latitude: 9.123456, note: 'SECRET-NOTE' }])
  const { container } = render(<PublicTanodDuty />)
  await screen.findByText('Public Tanod')
  expect(screen.getByText('Scheduled')).toBeInTheDocument()
  expect(screen.queryByText('Currently on duty')).toBeNull()
  expect(container).not.toHaveTextContent(/SECRET|9.123456/)
  expect(api.loadPublicTanodDuty).toHaveBeenCalledWith()
})
test('public reader shows checked-in current duty as On Duty', async () => {
  api.loadPublicTanodDuty.mockResolvedValue([{ display_name: 'Checked-in Tanod', general_area: 'Area', shift_start: shift.shift_start, shift_end: shift.shift_end, duty_state: 'currently_on_duty' }])
  render(<PublicTanodDuty />)
  expect(await screen.findByText('On Duty')).toBeInTheDocument()
})

test('public reader includes overnight Manila shift only until its exclusive end', async () => {
  jest.setSystemTime(new Date('2026-10-20T01:00:00+08:00'))
  const overnight = { display_name: 'Overnight member', shift_start: '2026-10-19T22:00:00+08:00', shift_end: '2026-10-20T06:00:00+08:00', duty_state: 'scheduled' }
  api.loadPublicTanodDuty.mockResolvedValue([overnight, { ...overnight, display_name: 'Future member', shift_start: '2026-10-20T06:00:00+08:00', shift_end: '2026-10-20T14:00:00+08:00' }])
  render(<PublicTanodDuty />)
  expect(await screen.findByText('Overnight member')).toBeInTheDocument()
  expect(screen.queryByText('Future member')).toBeNull()
  jest.setSystemTime(new Date('2026-10-20T06:00:00+08:00'))
  api.loadPublicTanodDuty.mockResolvedValue([overnight])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh duty status' }))
  expect(await screen.findByText('No Tanods are assigned to the current shift.')).toBeInTheDocument()
  expect(screen.queryByText('Overnight member')).toBeNull()
})

test('public reader includes exact start and excludes expired, future and invalid windows', async () => {
  api.loadPublicTanodDuty.mockResolvedValue([
    { display_name: 'Starting now', shift_start: '2026-10-19T19:00:00+08:00', shift_end: '2026-10-19T22:00:00+08:00', duty_state: 'scheduled' },
    { display_name: 'Expired', shift_start: '2026-10-19T06:00:00+08:00', shift_end: '2026-10-19T14:00:00+08:00', duty_state: 'currently_on_duty' },
    { display_name: 'Tomorrow', shift_start: '2026-10-20T06:00:00+08:00', shift_end: '2026-10-20T14:00:00+08:00', duty_state: 'scheduled' },
    { display_name: 'Unknown time', shift_start: null, shift_end: null, duty_state: 'scheduled' },
  ])
  render(<PublicTanodDuty />)
  expect(await screen.findByText('Starting now')).toBeInTheDocument()
  expect(screen.queryByText(/Expired|Tomorrow|Unknown time/)).toBeNull()
  expect(screen.getByText('Scheduled')).toBeInTheDocument()
  expect(screen.queryByText('On Duty')).toBeNull()
})

test('account linking selects existing stable IDs without creating Auth users or changing roles', async () => {
  render(<TanodAccounts roster={[{ id: 'member', full_name: 'Roster person', active: true }]} />)
  await screen.findByText('Not linked')
  fireEvent.change(screen.getByLabelText('Tanod member'), { target: { value: 'member' } })
  const id = '00000000-0000-4000-8000-000000000001'
  fireEvent.change(screen.getByLabelText('Provisioned Tanod profile UUID'), { target: { value: id } })
  fireEvent.click(screen.getByText('Link account'))
  await waitFor(() => expect(api.setAccountLink).toHaveBeenCalledWith('member',id))
  expect(screen.queryByLabelText(/Password/)).toBeNull()
})
test('Manila dates are independent of browser UTC calendar date', () => {
  expect(dutyDate(new Date('2026-10-18T18:00:00Z'))).toBe('2026-10-19')
  expect(manilaInputNow(new Date('2026-10-18T18:00:00Z'))).toBe('2026-10-19T02:00')
})

test('overview selects the nearest active future row without inventing duty or exposing attendance actions', async () => {
  const future = { ...shift, assignment_date: '2026-10-20', shift_start: '2026-10-20T10:00:00Z', shift_end: '2026-10-20T14:00:00Z', area_label: 'Nearest area', assignment_id: 'nearest' }
  api.loadMyDuty.mockResolvedValue([
    { ...future, assignment_id: 'later', assignment_date: '2026-10-22', shift_start: '2026-10-22T10:00:00Z', shift_end: '2026-10-22T14:00:00Z', area_label: 'Later area' },
    { ...future, assignment_id: 'inactive', active: false, area_label: 'Inactive area' }, future,
  ])
  show(); await ready()
  const next = screen.getByRole('region', { name: 'Next Duty' })
  expect(within(next).getByText('Nearest area')).toBeInTheDocument()
  expect(within(next).queryByText('Later area')).toBeNull()
  expect(within(next).queryByText('Inactive area')).toBeNull()
  expect(within(next).queryByRole('button', { name: /Check In|Check Out/ })).toBeNull()
  expect(screen.getByText('No duty recorded for today.')).toBeInTheDocument()
})

test('day off status stays separate from the next stored afternoon shift', async () => {
  api.loadMyDuty.mockResolvedValue([{ ...shift, assignment_date: '2026-10-20', shift_start: '2026-10-20T14:00:00+08:00', shift_end: '2026-10-20T22:00:00+08:00' }])
  show(); await ready()
  const summary = screen.getByRole('region', { name: 'Duty summary' })
  expect(within(summary).getByText('Off duty today')).toBeInTheDocument()
  expect(within(summary).queryByText('Scheduled')).toBeNull()
  expect(within(summary).getByText('Next shift')).toBeInTheDocument()
  expect(within(summary).getByText('Shift 2')).toBeInTheDocument()
  expect(within(summary).getByText('20 October 2026')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Next Duty' })).getByText('Shift 2')).toBeInTheDocument()
})

test.each([
  ['06:00', '14:00', '2026-10-19', 'Shift 1'],
  ['14:00', '22:00', '2026-10-19', 'Shift 2'],
  ['22:00', '06:00', '2026-10-20', 'Shift 3'],
])("today's duty uses its stored %s window label", async (start, end, endDate, label) => {
  api.loadMyDuty.mockResolvedValue([{ ...shift, shift_start: '2026-10-19T' + start + ':00+08:00', shift_end: endDate + 'T' + end + ':00+08:00' }])
  show(); await ready()
  expect(within(screen.getByRole('region', { name: "Today's Duty" })).getByText(label)).toBeInTheDocument()
})
