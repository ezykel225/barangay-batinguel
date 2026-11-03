import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AnalyticsInsights, { IDENTITY_COUNT_NOTE, SOURCE_INCOMPLETE } from './AnalyticsInsights'
import { loadBarangayAnalytics, loadIncidentRecords, loadIncidentTypeCounts, loadRepeatedDisputes } from './analyticsApi'
import { PROBLEM_MESSAGES } from './analyticsRequest'
import { periodRange } from './analyticsPeriods'
import { loadPersonAnalytics, loadPersonHistory } from '../people/peopleApi'
import { incidentDate } from '../incidents/incidentLabels'

jest.mock('./analyticsApi',()=>({loadBarangayAnalytics:jest.fn(),loadRepeatedDisputes:jest.fn(),loadIncidentRecords:jest.fn(),loadIncidentTypeCounts:jest.fn()}))
jest.mock('../people/peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children }) => <div role="dialog" aria-label={title}>{children}</div>)

const emptySummary=()=>({overview:{distinct_incident_matters:0,linked_people:0,respondent_subject_matters:0,victim_matters:0,substantiated_outcomes:0,not_substantiated_outcomes:0},categories:[],locations:[],roles:[],outcomes:[],weekdays:[],monthly:[],repeat_people:[],community_credit:{configured:false,message:'Community Credit policy is not configured.'}})
// Synthetic incident_queue rows (Manila: 2 Nov is a Monday).
const inc=(id,occurred_at,extra={})=>({id,reference:`INC-T-${id}`,incident_type:'traffic_accident',status:'recorded',location_text:'Rizal Street',area_note:'',occurred_at,blotter_reference:null,...extra})
const RECORDS=[inc('1','2026-11-02T01:00:00Z'),inc('2','2026-11-02T13:00:00Z',{status:'resolved',area_note:'Purok 2'}),inc('3','2026-11-04T04:00:00Z',{incident_type:'disturbance'})]
const countsFor=rows=>Object.entries(rows.reduce((m,r)=>({...m,[r.incident_type]:(m[r.incident_type]||0)+1}),{})).map(([incident_type,total])=>({incident_type,total}))
const useRecords=(rows)=>{
  loadIncidentRecords.mockImplementation(({category})=>Promise.resolve(rows.filter(r=>!category||r.incident_type===category)))
  loadIncidentTypeCounts.mockResolvedValue(countsFor(rows))
}

beforeEach(()=>{
  jest.clearAllMocks()
  loadBarangayAnalytics.mockResolvedValue(emptySummary())
  loadRepeatedDisputes.mockResolvedValue([])
  useRecords([])
})

test('labels incident-only filter scope and every period',async()=>{
  render(<AnalyticsInsights/>);await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalled())
  for(const name of ['This week','This month','This year','Last 30 days','Last 90 days','Last 12 months','Custom range','All available records'])
    expect(screen.getByRole('option',{name})).toBeInTheDocument()
  expect(screen.getByText(/Category and area apply only/)).toBeInTheDocument()
  expect(screen.getByText(/weeks start Monday/)).toBeInTheDocument()
  expect(await screen.findByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
  expect(screen.getByText(/Incident category and area filters do not apply/)).toBeInTheDocument()
  expect(screen.getByText(/Uses the active policy only/)).toBeInTheDocument()
})

test('shows repeat-person and dispute review actions without raw keys',async()=>{
  loadBarangayAnalytics.mockResolvedValueOnce({...emptySummary(),overview:{...emptySummary().overview,linked_people:2},repeat_people:[{person_kind:'resident',person_id:'hidden-person-uuid',display_name:'Juan Dela Cruz',qualifying_matters:2,substantiated:0,not_substantiated:0,not_determined:1,referred:0,closed:1,unknown:0}],community_credit:{configured:false,message:'Not configured'}})
  loadRepeatedDisputes.mockResolvedValueOnce([{person_a_key:'resident:hidden-a',person_b_key:'external:hidden-b',person_a:'Juan Dela Cruz',person_b:'Pedro Santos',matter_count:2,first_recorded:'2026-01-01',last_recorded:'2026-02-01',matter_references:['CMP-001','CMP-002']}])
  // A records administrator (Secretary or Punong Barangay) sees both named lists.
  render(<AnalyticsInsights canAdminister/>);expect(await screen.findByRole('button',{name:'View history'})).toBeInTheDocument();expect(await screen.findByRole('button',{name:'Review disputes'})).toBeInTheDocument()
  expect(screen.queryByText(/hidden-person-uuid|resident:hidden-a/)).not.toBeInTheDocument()
})

// Remediation B: what an ordinary official (Treasurer, Kagawad, SK Chairperson) sees.
const restrictedSummary=()=>({...emptySummary(),overview:{distinct_incident_matters:7,linked_people:3,respondent_subject_matters:2,victim_matters:1,substantiated_outcomes:1,not_substantiated_outcomes:0},categories:[{category:'other',total:4}],repeat_people:null,repeat_people_restricted:true})
const deny=()=>Object.assign(new Error('Analytics are unavailable.'),{code:'42501'})
const kpi=label=>screen.getByText(label).closest('div').querySelector('strong').textContent

test('an ordinary official never requests the dispute list and keeps the general statistics',async()=>{
  loadBarangayAnalytics.mockResolvedValue(restrictedSummary())
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Incidents with a respondent or subject')).toBeInTheDocument()
  expect(kpi('Incidents with a respondent or subject')).toBe('2')
  expect(screen.getByText(/barangay-wide list of people is restricted to authorized records staff/)).toBeInTheDocument()
  expect(screen.getByText(/barangay-wide list of complaint pairs is restricted to authorized records staff/)).toBeInTheDocument()
  expect(loadRepeatedDisputes).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:'View history'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Review disputes'})).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the linked-person figure is labelled as records, not unique people (known 062 duplicate-identity issue)',async()=>{
  loadBarangayAnalytics.mockResolvedValue(restrictedSummary())
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Linked person records')).toBeInTheDocument()
  expect(screen.getByText(IDENTITY_COUNT_NOTE)).toBeInTheDocument()
  expect(screen.queryByText('Linked people')).not.toBeInTheDocument()
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

// Redefined: the page now has two independent sources, so a refused 062 summary
// is a restriction note on the sections it feeds, never an alert or a zero.
test('a refused summary reads as a restriction on its sections and does not stay on "Loading"',async()=>{
  loadBarangayAnalytics.mockRejectedValue(deny())
  render(<AnalyticsInsights/>)
  expect((await screen.findAllByText(PROBLEM_MESSAGES.denied)).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Loading linked-record analytics/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Incidents with a victim')).not.toBeInTheDocument()
})

test('migration 062 not installed: incident charts still work, 062 sections say why they are missing, no fabricated 0',async()=>{
  useRecords(RECORDS)
  loadBarangayAnalytics.mockRejectedValue(Object.assign(new Error('x'),{code:'PGRST202'}))
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Incident records')).toBeInTheDocument()
  expect(kpi('Incident records')).toBe('3')
  expect((await screen.findAllByText(PROBLEM_MESSAGES.not_installed)).length).toBe(3)
  expect(screen.queryByText('Linked person records')).not.toBeInTheDocument()
  expect(screen.queryByText('Enrolled residents')).not.toBeInTheDocument()
})

test('a network failure on the incident records says so, distinct from a restriction',async()=>{
  loadIncidentRecords.mockRejectedValue(Object.assign(new Error('x'),{network:true}))
  render(<AnalyticsInsights/>)
  expect(await screen.findByRole('alert')).toHaveTextContent(PROBLEM_MESSAGES.network)
  expect(screen.queryByText('Incident records')).not.toBeInTheDocument()
})

test('a truncated record list is never charted as if complete',async()=>{
  loadIncidentRecords.mockResolvedValue(RECORDS.slice(0,2))
  loadIncidentTypeCounts.mockResolvedValue(countsFor(RECORDS))
  render(<AnalyticsInsights/>)
  expect(await screen.findByRole('alert')).toHaveTextContent(SOURCE_INCOMPLETE)
  expect(screen.getByRole('alert')).toHaveTextContent('2 of 3 records returned')
  expect(screen.queryByText('Incident records')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'Incidents over time'})).not.toBeInTheDocument()
})

test('an empty period says so in words',async()=>{
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('No incidents were recorded for this selection.')).toBeInTheDocument()
})

// ---- requests, loading, history and display ----
const summaryWith=(extra={})=>({...emptySummary(),overview:{distinct_incident_matters:2,linked_people:1,respondent_subject_matters:1,victim_matters:0,substantiated_outcomes:0,not_substantiated_outcomes:0},categories:[{category:'other',total:2}],repeat_people:[],repeat_people_restricted:false,...extra})
const personRow={person_kind:'resident',person_id:'r1',display_name:'Juan Dela Cruz',qualifying_matters:2,substantiated:0,not_substantiated:0,not_determined:2,referred:0,closed:0,unknown:0}
const personHistory={identity:{kind:'resident',id:'r1',full_name:'Juan Dela Cruz',purok:'Purok 1',resident_status:'active',credit_applicable:true},incidents:[],complaints:[],timeline:[]}

test('choosing Custom range before any date sends no request and says what is missing',async()=>{
  render(<AnalyticsInsights canAdminister/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  jest.clearAllMocks()
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  expect(await screen.findByText(/Choose a start date, an end date, or both/)).toBeInTheDocument()
  expect(loadBarangayAnalytics).not.toHaveBeenCalled()
  expect(loadRepeatedDisputes).not.toHaveBeenCalled()
  expect(loadIncidentRecords).not.toHaveBeenCalled()
  // One date is enough, exactly as the database allows.
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-01-01'}})
  await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalledWith(expect.objectContaining({window:'custom',from:'2026-01-01',to:''})))
  expect(loadIncidentRecords).toHaveBeenCalledWith(expect.objectContaining({from:'2026-01-01',to:''}))
})

test('a reversed custom range sends no request',async()=>{
  render(<AnalyticsInsights/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-02-10'}})
  jest.clearAllMocks()
  fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-02-01'}})
  expect(await screen.findByText(/start date must be on or before the end date/)).toBeInTheDocument()
  expect(loadBarangayAnalytics).not.toHaveBeenCalled()
  expect(loadIncidentRecords).not.toHaveBeenCalled()
})

// Redefined: a preset is now resolved to its Manila dates and sent to EVERY
// source as the same custom range, so all sections count the same days.
test('a preset period drops the custom dates and sends its own Manila dates to every source',async()=>{
  render(<AnalyticsInsights canAdminister/>)
  await screen.findByRole('heading',{name:/Incident analytics/})
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-01-01'}})
  jest.clearAllMocks()
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'last_90_days'}})
  const {from,to}=periodRange('last_90_days')
  await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalledWith(expect.objectContaining({window:'custom',from,to})))
  expect(loadIncidentRecords).toHaveBeenCalledWith(expect.objectContaining({from,to}))
  expect(loadIncidentTypeCounts).toHaveBeenCalledWith({from,to})
  expect(loadRepeatedDisputes).toHaveBeenCalledWith(expect.objectContaining({window:'custom',from,to}))
})

test('All available records sends no dates and the "all" window',async()=>{
  render(<AnalyticsInsights/>)
  await waitFor(()=>expect(loadBarangayAnalytics).toHaveBeenCalledWith(expect.objectContaining({window:'all',from:'',to:''})))
  expect(loadIncidentRecords).toHaveBeenCalledWith(expect.objectContaining({from:'',to:''}))
})

// Redefined: each section has its own loading line now, so they are read by text.
test('loading lines disappear after success and after failure',async()=>{
  let resolve;loadBarangayAnalytics.mockReturnValueOnce(new Promise(r=>{resolve=r}))
  render(<AnalyticsInsights/>)
  expect(screen.getByText('Loading linked-record analytics…')).toBeInTheDocument()
  resolve(summaryWith())
  expect(await screen.findByText('Incidents with a victim')).toBeInTheDocument()
  expect(screen.queryByText('Loading linked-record analytics…')).not.toBeInTheDocument()
  // A later failure replaces the old figures with a message, not a spinner and not zeros.
  loadBarangayAnalytics.mockRejectedValueOnce(Object.assign(new Error('x'),{code:'08006'}))
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'last_30_days'}})
  expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(PROBLEM_MESSAGES.failed)
  expect(screen.queryByText('Loading linked-record analytics…')).not.toBeInTheDocument()
  expect(screen.queryByText('Incidents with a victim')).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:/Incident analytics/})).toBeInTheDocument()
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

// ---- charts and the category drill-down ----
const chart=title=>screen.getByRole('heading',{name:title}).closest('section')
const bars=title=>chart(title).querySelector('.ai-bars')

test('charts are drawn from the records, every value printed, and display-only charts are not buttons',async()=>{
  useRecords(RECORDS)
  render(<AnalyticsInsights/>)
  expect(await screen.findByText('Incident records')).toBeInTheDocument()
  expect(kpi('Incident records')).toBe('3')
  expect(kpi('Distinct recorded areas')).toBe('2')
  for(const title of ['Current status','Day of week','Time of day','Recorded areas']) expect(within(chart(title)).queryByRole('button')).not.toBeInTheDocument()
  expect(within(bars('Day of week')).getByText('Monday').closest('.ai-bar-row')).toHaveTextContent('2')
  expect(within(bars('Recorded areas')).getByText('Purok 2')).toBeInTheDocument()
  // Every chart has a data table carrying the same numbers.
  expect(within(chart('Current status')).getByRole('table')).toBeInTheDocument()
})

test('choosing a category drills down: the filter, the charts and the record list stay in step',async()=>{
  useRecords(RECORDS)
  render(<AnalyticsInsights/>)
  const traffic=await screen.findByRole('button',{name:/^Traffic accident: 2 incidents$/})
  expect(traffic).toHaveAttribute('aria-pressed','false')
  fireEvent.click(traffic)
  await waitFor(()=>expect(loadIncidentRecords).toHaveBeenLastCalledWith(expect.objectContaining({category:'traffic_accident'})))
  expect(loadBarangayAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({category:'traffic_accident'}))
  expect(screen.getByLabelText('Incident category')).toHaveValue('traffic_accident')
  const drill=await screen.findByRole('heading',{name:'Traffic accident — 2 records'})
  const table=within(drill.closest('section')).getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3) // header + 2 records
  expect(within(table).getByText('INC-T-2')).toBeInTheDocument()
  expect(within(table).queryByText('INC-T-3')).not.toBeInTheDocument()
  expect(kpi('Incident records')).toBe('2')
  expect(screen.getByRole('button',{name:/^Traffic accident: 2 incidents, selected$/})).toHaveAttribute('aria-pressed','true')
  // Back to all categories, from the drill-down itself.
  fireEvent.click(within(drill.closest('section')).getByRole('button',{name:'All categories'}))
  await waitFor(()=>expect(screen.getByLabelText('Incident category')).toHaveValue(''))
  await waitFor(()=>expect(kpi('Incident records')).toBe('3'))
})

test('the area filter narrows the incident charts and is sent to 062 as the same exact label',async()=>{
  useRecords(RECORDS)
  render(<AnalyticsInsights/>)
  await screen.findByText('Incident records')
  const select=screen.getByLabelText('Recorded area')
  expect(within(select).getAllByRole('option').map(o=>o.textContent)).toEqual(['All areas','Purok 2','Rizal Street'])
  fireEvent.change(select,{target:{value:'Purok 2'}})
  await waitFor(()=>expect(kpi('Incident records')).toBe('1'))
  expect(loadBarangayAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({area:'Purok 2'}))
})

test('a week shows daily counts and says so',async()=>{
  useRecords(RECORDS)
  render(<AnalyticsInsights/>)
  fireEvent.change(await screen.findByLabelText('Time window'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-11-02'}})
  fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-11-08'}})
  const trend=(await screen.findByRole('heading',{name:'Incidents over time'})).closest('section')
  expect(within(trend).getByText('Daily counts')).toBeInTheDocument()
  expect(within(trend).getByText('3 incidents from Nov 2 to Nov 8. Highest: Nov 2, 2 incidents.')).toBeInTheDocument()
  expect(within(within(trend).getByRole('table')).getAllByRole('row')).toHaveLength(8)
})

test('Community Credit distribution is charted from the returned rows only',async()=>{
  loadBarangayAnalytics.mockResolvedValue(summaryWith({community_credit:{configured:true,enrolled_residents:3,residents_with_events:1,event_count:2,starting_score_distribution:[{score:100,residents:3}],current_score_distribution:[{score:95,residents:1},{score:100,residents:2}]}}))
  render(<AnalyticsInsights/>)
  await screen.findByRole('heading',{name:'Current score distribution'})
  const current=bars('Current score distribution')
  expect(within(current).getByText('Score 95').closest('.ai-bar-row')).toHaveTextContent('1')
  expect(within(current).getByText('Score 100').closest('.ai-bar-row')).toHaveTextContent('2')
  expect(within(current).queryByText(/Score (?!95|100)/)).not.toBeInTheDocument()
})
