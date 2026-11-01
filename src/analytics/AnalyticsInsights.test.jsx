import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AnalyticsInsights from './AnalyticsInsights'
import { loadBarangayAnalytics, loadRepeatedDisputes } from './analyticsApi'
import { loadPersonAnalytics, loadPersonHistory } from '../people/peopleApi'
import { incidentDate } from '../incidents/incidentLabels'

jest.mock('./analyticsApi',()=>({loadBarangayAnalytics:jest.fn(),loadRepeatedDisputes:jest.fn()}))
jest.mock('../people/peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children }) => <div role="dialog" aria-label={title}>{children}</div>)

beforeEach(()=>{
  loadBarangayAnalytics.mockResolvedValue({overview:{distinct_incident_matters:0,linked_people:0,respondent_subject_matters:0,victim_matters:0,substantiated_outcomes:0,not_substantiated_outcomes:0},categories:[],locations:[],roles:[],outcomes:[],weekdays:[],monthly:[],repeat_people:[],community_credit:{configured:false,message:'Community Credit policy is not configured.'}})
  loadRepeatedDisputes.mockResolvedValue([])
})

test('labels incident-only filter scope and server time presets',async()=>{
  render(<AnalyticsInsights/>);await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalled())
  expect(screen.getByRole('option',{name:'Last 30 days'})).toBeInTheDocument()
  expect(screen.getByRole('option',{name:'Last 90 days'})).toBeInTheDocument()
  expect(screen.getByRole('option',{name:'Last 12 months'})).toBeInTheDocument()
  expect(screen.getByText(/Category and area apply only/)).toBeInTheDocument()
  expect(await screen.findByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
  expect(screen.getByText(/Incident category and area filters do not apply/)).toBeInTheDocument()
  expect(screen.getByText(/Uses the active policy only/)).toBeInTheDocument()
})

test('shows repeat-person and dispute review actions without raw keys',async()=>{
  loadBarangayAnalytics.mockResolvedValueOnce({overview:{distinct_incident_matters:1,linked_people:2,respondent_subject_matters:1,victim_matters:0,substantiated_outcomes:0,not_substantiated_outcomes:0},categories:[],locations:[],roles:[],outcomes:[],weekdays:[],monthly:[],repeat_people:[{person_kind:'resident',person_id:'hidden-person-uuid',display_name:'Juan Dela Cruz',qualifying_matters:2,substantiated:0,not_substantiated:0,not_determined:1,referred:0,closed:1,unknown:0}],community_credit:{configured:false,message:'Not configured'}})
  loadRepeatedDisputes.mockResolvedValueOnce([{person_a_key:'resident:hidden-a',person_b_key:'external:hidden-b',person_a:'Juan Dela Cruz',person_b:'Pedro Santos',matter_count:2,first_recorded:'2026-01-01',last_recorded:'2026-02-01',matter_references:['CMP-001','CMP-002']}])
  // A records administrator (Secretary or Punong Barangay) sees both named lists.
  render(<AnalyticsInsights canAdminister/>);expect(await screen.findByRole('button',{name:'View history'})).toBeInTheDocument();expect(await screen.findByRole('button',{name:'Review disputes'})).toBeInTheDocument()
  expect(screen.queryByText(/hidden-person-uuid|resident:hidden-a/)).not.toBeInTheDocument()
})

// Remediation B: what an ordinary official (Treasurer, Kagawad, SK Chairperson) sees.
const restrictedSummary=()=>({overview:{distinct_incident_matters:7,linked_people:3,respondent_subject_matters:2,victim_matters:1,substantiated_outcomes:1,not_substantiated_outcomes:0},categories:[{category:'other',total:4}],locations:[],roles:[],outcomes:[],weekdays:[],monthly:[],repeat_people:null,repeat_people_restricted:true,community_credit:{configured:false,message:'Community Credit policy is not configured.'}})
const deny=()=>Object.assign(new Error('Analytics are unavailable.'),{code:'42501'})

test('an ordinary official never requests the dispute list and keeps the general statistics',async()=>{
  loadBarangayAnalytics.mockResolvedValue(restrictedSummary())
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Distinct incident matters')).toBeInTheDocument()
  expect(screen.getByText('7',{selector:'strong'})).toBeInTheDocument()
  expect(screen.getByText(/barangay-wide list of people is restricted to authorized records staff/)).toBeInTheDocument()
  expect(screen.getByText(/barangay-wide list of complaint pairs is restricted to authorized records staff/)).toBeInTheDocument()
  expect(loadRepeatedDisputes).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:'View history'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Review disputes'})).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a NULL repeat_people list reads as restricted, never as "nobody repeats"',async()=>{
  loadBarangayAnalytics.mockResolvedValue({...restrictedSummary(),repeat_people_restricted:undefined})
  render(<AnalyticsInsights canAdminister/>)
  expect(await screen.findByText(/barangay-wide list of people is restricted/)).toBeInTheDocument()
  expect(screen.queryByText(/No verified linked records are available for this analysis/)).not.toBeInTheDocument()
})

test('a 42501 on the dispute list is shown as a restriction and does not hide the statistics',async()=>{
  loadRepeatedDisputes.mockRejectedValue(deny())
  render(<AnalyticsInsights canAdminister/>)
  expect(await screen.findByText(/barangay-wide list of complaint pairs is restricted/)).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('any other dispute failure is reported as unavailable, not as restricted',async()=>{
  loadRepeatedDisputes.mockRejectedValue(Object.assign(new Error('x'),{code:'08006'}))
  render(<AnalyticsInsights canAdminister/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Complaint pair analytics are unavailable')
  expect(screen.queryByText(/restricted to authorized records staff/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
})

test('a refused summary shows one message and does not stay on "Loading"',async()=>{
  loadBarangayAnalytics.mockRejectedValue(deny())
  render(<AnalyticsInsights/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Analytics are not available for this account.')
  expect(screen.queryByText(/Loading analytics/)).not.toBeInTheDocument()
})

// ---- Remediation C: requests, loading, history and display ----
const summaryWith=(extra={})=>({overview:{distinct_incident_matters:2,linked_people:1,respondent_subject_matters:1,victim_matters:0,substantiated_outcomes:0,not_substantiated_outcomes:0},categories:[{category:'other',total:2}],locations:[],roles:[],outcomes:[],weekdays:[],monthly:[],repeat_people:[],repeat_people_restricted:false,community_credit:{configured:false,message:'Community Credit policy is not configured.'},...extra})
const personRow={person_kind:'resident',person_id:'r1',display_name:'Juan Dela Cruz',qualifying_matters:2,substantiated:0,not_substantiated:0,not_determined:2,referred:0,closed:0,unknown:0}
const personHistory={identity:{kind:'resident',id:'r1',full_name:'Juan Dela Cruz',purok:'Purok 1',resident_status:'active',credit_applicable:true},incidents:[],complaints:[],timeline:[]}

test('choosing Custom range before any date sends no request and says what is missing',async()=>{
  render(<AnalyticsInsights canAdminister/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  loadBarangayAnalytics.mockClear();loadRepeatedDisputes.mockClear()
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  expect(await screen.findByText(/Choose a start date, an end date, or both/)).toBeInTheDocument()
  expect(loadBarangayAnalytics).not.toHaveBeenCalled()
  expect(loadRepeatedDisputes).not.toHaveBeenCalled()
  expect(screen.queryByText(/Loading analytics/)).not.toBeInTheDocument()
  // One date is enough, exactly as the database allows.
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-01-01'}})
  await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalledWith(expect.objectContaining({window:'custom',from:'2026-01-01',to:''})))
})

test('a reversed custom range sends no request',async()=>{
  render(<AnalyticsInsights/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-02-10'}})
  loadBarangayAnalytics.mockClear()
  fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-02-01'}})
  expect(await screen.findByText(/start date must be on or before the end date/)).toBeInTheDocument()
  expect(loadBarangayAnalytics).not.toHaveBeenCalled()
})

test('returning to a preset window drops the custom dates from the request',async()=>{
  render(<AnalyticsInsights/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-01-01'}})
  loadBarangayAnalytics.mockClear()
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'last_90_days'}})
  await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalledWith(expect.objectContaining({window:'last_90_days',from:'',to:''})))
})

test('the loading message disappears after success and after failure',async()=>{
  let resolve;loadBarangayAnalytics.mockReturnValueOnce(new Promise(r=>{resolve=r}))
  render(<AnalyticsInsights/>)
  expect(screen.getByRole('status')).toHaveTextContent('Loading analytics…')
  resolve(summaryWith())
  expect(await screen.findByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
  expect(screen.queryByText('Loading analytics…')).not.toBeInTheDocument()
  // A later failure replaces the old figures with one message, not a spinner.
  loadBarangayAnalytics.mockRejectedValueOnce(Object.assign(new Error('x'),{code:'08006'}))
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'last_30_days'}})
  expect(await screen.findByRole('alert')).toHaveTextContent('Analytics are unavailable. Check access and try again.')
  expect(screen.queryByText('Loading analytics…')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:/Incident analytics/})).not.toBeInTheDocument()
})

test('View history opens the history even when its analytics fail',async()=>{
  loadBarangayAnalytics.mockResolvedValue(summaryWith({repeat_people:[personRow]}))
  loadPersonHistory.mockResolvedValue(personHistory)
  loadPersonAnalytics.mockRejectedValue(Object.assign(new Error('x'),{code:'08006'}))
  render(<AnalyticsInsights canAdminister/>)
  fireEvent.click(await screen.findByRole('button',{name:'View history'}))
  expect(await screen.findByRole('dialog',{name:'Person History'})).toBeInTheDocument()
  expect(screen.queryByText(/Person history is unavailable/)).not.toBeInTheDocument()
})

test('a failed View history request is reported, and 42501 reads as a restriction',async()=>{
  loadBarangayAnalytics.mockResolvedValue(summaryWith({repeat_people:[personRow]}))
  loadPersonAnalytics.mockResolvedValue({})
  loadPersonHistory.mockRejectedValueOnce(Object.assign(new Error('x'),{code:'08006'}))
  render(<AnalyticsInsights canAdminister/>)
  fireEvent.click(await screen.findByRole('button',{name:'View history'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Person history is unavailable. Check access and try again.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('button',{name:'View history'})).not.toBeDisabled())
  loadPersonHistory.mockRejectedValueOnce(Object.assign(new Error('x'),{code:'42501'}))
  fireEvent.click(screen.getByRole('button',{name:'View history'}))
  expect(await screen.findByText('This person history is not available for this account.')).toBeInTheDocument()
})

test('dispute dates are Asia/Manila calendar dates, whatever the browser zone',async()=>{
  // 16:30 UTC on 31 January is 00:30 on 1 February in Manila.
  const stamp='2026-01-31T16:30:00Z'
  loadRepeatedDisputes.mockResolvedValue([{person_a_key:'resident:a',person_b_key:'resident:b',person_a:'A',person_b:'B',matter_count:2,first_recorded:stamp,last_recorded:null,matter_references:['CMP-1','CMP-2']}])
  render(<AnalyticsInsights canAdminister/>)
  expect(await screen.findByText(incidentDate(stamp))).toBeInTheDocument()
  expect(incidentDate(stamp)).toMatch(/Feb/)
  expect(screen.getByText('Not recorded')).toBeInTheDocument()
})

test('display-only breakdown rows are not buttons',async()=>{
  loadBarangayAnalytics.mockResolvedValue(summaryWith())
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Other')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Other/})).not.toBeInTheDocument()
  expect(document.querySelector('.analytics-bars button')).toBeNull()
})
