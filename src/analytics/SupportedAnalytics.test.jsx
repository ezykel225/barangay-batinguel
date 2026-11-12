import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SupportedAnalytics,{EMPTY_ANALYTICS_FILTERS} from './SupportedAnalytics'
import { loadSupportedIncidentRecords } from './supportedAnalyticsApi'
jest.mock('./supportedAnalyticsApi')
const row=(id,extra={})=>({id,occurred_at:'2026-11-01T00:00:00Z',incident_type:'disturbance',status:'recorded',location_text:'Unit street',area_note:'Unit area',has_blotter:false,...extra})
const rows=[row('1',{has_blotter:true}),row('2',{incident_type:'traffic_accident'}),row('3',{location_text:'',area_note:'',occurred_at:null})]
function Harness(){const [filters,setFilters]=useState({...EMPTY_ANALYTICS_FILTERS});return <SupportedAnalytics filters={filters} onFiltersChange={setFilters}/>}
beforeEach(()=>{jest.resetAllMocks();loadSupportedIncidentRecords.mockResolvedValue({rows,hasAreas:true,hasBlotters:true})})
const value=label=>screen.getByText(label).previousSibling.textContent
test('uses one incident collection for all charts, linked counts and exact recorded-area counts',async()=>{
 render(<Harness/>);await screen.findByText('Incident records')
 expect(value('Incident records')).toBe('3');expect(value('With a blotter entry')).toBe('1');expect(value('Distinct recorded areas')).toBe('1')
 for(const name of ['Incidents over time','Incident categories','Incident statuses','Recorded areas','Day of week','Time of day'])expect(screen.getByRole('heading',{name})).toBeInTheDocument()
 expect(screen.getByText(/1 incident record\(s\) have no usable occurrence date/)).toBeInTheDocument()
})
test('category and area filter locally; period and reset use independent occurrence-date requests',async()=>{
 render(<Harness/>);await screen.findByText('Incident records')
 fireEvent.change(screen.getByLabelText('Incident category'),{target:{value:'traffic_accident'}})
 expect(value('Incident records')).toBe('1');expect(value('With a blotter entry')).toBe('0')
 fireEvent.change(screen.getByLabelText('Recorded area'),{target:{value:'Unit area'}})
 expect(loadSupportedIncidentRecords).toHaveBeenCalledTimes(1)
 fireEvent.change(screen.getByLabelText('Period'),{target:{value:'custom'}})
 expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid analytics date range')
 fireEvent.change(screen.getByLabelText('Analytics from date'),{target:{value:'2026-11-01'}})
 fireEvent.change(screen.getByLabelText('Analytics up to date'),{target:{value:'2026-11-02'}})
 await waitFor(()=>expect(loadSupportedIncidentRecords).toHaveBeenLastCalledWith({from:'2026-11-01',to:'2026-11-02'}))
 fireEvent.click(screen.getByRole('button',{name:'Reset analytics filters'}))
 await waitFor(()=>expect(value('Incident records')).toBe('3'))
 expect(screen.getByLabelText('Incident category')).toHaveValue('')
})
test('authorization failure hides every analytical total rather than rendering zeros',async()=>{
 loadSupportedIncidentRecords.mockRejectedValue({kind:'denied'});render(<Harness/>)
 expect(await screen.findByRole('alert')).toHaveTextContent('not available for your account')
 expect(screen.queryByText('Incident records')).not.toBeInTheDocument()
})
test('missing area and blotter metadata produces unavailable cards and no speculative area filter',async()=>{
 loadSupportedIncidentRecords.mockResolvedValue({rows,hasAreas:false,hasBlotters:false});render(<Harness/>);await screen.findByText('Incident records')
 expect(value('With a blotter entry')).toBe('Unavailable');expect(value('Distinct recorded areas')).toBe('Unavailable')
 expect(screen.getByLabelText('Recorded area')).toBeDisabled()
 expect(screen.queryByRole('heading',{name:'Recorded areas'})).not.toBeInTheDocument()
})

test('methodology is collapsed while ethical warning and active filter summary remain visible',async()=>{
 const {container}=render(<Harness/>);await screen.findByText('Incident records')
 const methodology=screen.getByText('How these statistics are calculated').closest('details')
 expect(methodology).not.toHaveAttribute('open')
 expect(screen.getByText(/not crime-risk predictions or proof of wrongdoing/)).toBeVisible()
 expect(container.querySelector('.ai-filter-summary')).toHaveTextContent('All categories')
 fireEvent.change(screen.getByLabelText('Incident category'),{target:{value:'traffic_accident'}})
 expect(container.querySelector('.ai-filter-summary')).toHaveTextContent('Traffic')
 expect(container.querySelectorAll('.analytics-summary>div')).toHaveLength(3)
 expect(container.querySelectorAll('.ai-distribution')).toHaveLength(3)
})

test('interpretations follow category, area and date filters without extra data calls', async () => {
  render(<Harness />)
  await screen.findByText('Incident records')
  const interpretation = () => screen.getByRole('region', { name: 'Incident categories: descriptive interpretation' })
  expect(interpretation()).toHaveTextContent('3 incidents across')
  fireEvent.change(screen.getByLabelText('Incident category'), { target: { value: 'traffic_accident' } })
  expect(interpretation()).toHaveTextContent('1 incident across')
  fireEvent.change(screen.getByLabelText('Recorded area'), { target: { value: 'Unit area' } })
  expect(interpretation()).toHaveTextContent('1 incident across')
  expect(loadSupportedIncidentRecords).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
  expect(screen.queryByRole('region', { name: /descriptive interpretation/ })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Analytics from date'), { target: { value: '2026-12-01' } })
  await waitFor(() => expect(interpretation()).toHaveTextContent('0 incidents across'))
  expect(within(interpretation()).getByText(/No positive counts/)).toBeInTheDocument()
})

test('failed or incomplete reads expose no interpretation conclusions', async () => {
  loadSupportedIncidentRecords.mockRejectedValue({ kind: 'incomplete' })
  render(<Harness />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('region', { name: /descriptive interpretation/ })).not.toBeInTheDocument()
})
