import { render, screen, waitFor } from '@testing-library/react'
import AnalyticsInsights from './AnalyticsInsights'
import { loadBarangayAnalytics, loadRepeatedDisputes } from './analyticsApi'

jest.mock('./analyticsApi',()=>({loadBarangayAnalytics:jest.fn(),loadRepeatedDisputes:jest.fn()}))

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
  render(<AnalyticsInsights/>);expect(await screen.findByRole('button',{name:'View history'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Review disputes'})).toBeInTheDocument()
  expect(screen.queryByText(/hidden-person-uuid|resident:hidden-a/)).not.toBeInTheDocument()
})
