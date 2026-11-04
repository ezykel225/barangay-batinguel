import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PersonAnalytics from './PersonAnalytics'

const data=(qualifying,requiresReview)=>({
  coverage:{message:'Based on verified linked records.'},filters:{window:'all'},
  summary:{distinct_linked_matters:1,incident_matters:1,complaint_kp_matters:0},
  comparison:{current_period_qualifying_matters:1,previous_period_qualifying_matters:0},
  roles:[{role:'respondent',total:1}],outcomes:[{outcome:'substantiated',total:1}],
  categories:[{category:'public_disturbance',total:1}],locations:[{area_label:'Purok 1',total:1}],weekdays:[],time_buckets:[],
  contributing_matters:[{matter_key:'incident:hidden-uuid',reference:'INC-001',category:'public_disturbance',area:'Purok 1',role:'respondent',outcome:'substantiated'}],
  indicators:[{}, {contributing_matters:[{matter_key:'incident:hidden-uuid',reference:'INC-001',role:'respondent',outcome:'substantiated'}]}],
  historical_review:{available:true,requires_review:requiresReview,qualifying_count:qualifying,message:"These historical records do not affect the resident's starting Community Credit score of 100.",contributing_matters:[{matter_key:'incident:hidden-uuid',reference:'INC-001',role:'respondent'}]},
})

test('hides Historical Records Review for five qualifying matters',()=>{
  render(<PersonAnalytics data={data(5,false)}/>)
  expect(screen.queryByText('Historical Records Review')).not.toBeInTheDocument()
})

test('shows review, starting-100 wording, and exact contributing references at six',()=>{
  render(<PersonAnalytics data={data(6,true)}/>)
  expect(screen.getByText('Historical Records Review')).toBeInTheDocument()
  expect(screen.getByText(/starting Community Credit score of 100/)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button',{name:'Review contributing records'})[1])
  expect(screen.getByText('INC-001')).toBeInTheDocument()
  expect(screen.queryByText(/hidden-uuid/)).not.toBeInTheDocument()
})

test('offers server time-window presets and category/outcome drill-down',async()=>{
  const onWindowChange=jest.fn();render(<PersonAnalytics data={data(0,false)} onWindowChange={onWindowChange}/>)
  expect(screen.getByRole('option',{name:'Last 30 days'})).toBeInTheDocument()
  expect(screen.getByRole('option',{name:'Last 90 days'})).toBeInTheDocument()
  expect(screen.getByRole('option',{name:'Last 12 months'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Time window'),{target:{value:'last_90_days'}})
  expect(onWindowChange).toHaveBeenCalledWith('last_90_days')
  // The window change settles asynchronously; wait for the control to be usable again.
  await waitFor(()=>expect(screen.getByLabelText('Time window')).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button',{name:/Public Disturbance/}));expect(screen.getByText('INC-001')).toBeInTheDocument()
})

test('rows that open no records are not buttons; rows that do are (Remediation C)',()=>{
  const withWeekdays={...data(0,false),weekdays:[{weekday:'Monday',weekday_number:1,total:2}]}
  render(<PersonAnalytics data={withWeekdays}/>)
  expect(screen.getByText('Monday')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Monday/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Public Disturbance/})).toBeEnabled()
  expect(document.querySelector('.analytics-bars button:disabled')).toBeNull()
})

test('unavailable analytics say so instead of loading forever',()=>{
  render(<PersonAnalytics data={null} unavailable/>)
  expect(screen.getByRole('alert')).toHaveTextContent(/Analytics are unavailable for this person right now/)
  expect(screen.queryByText(/Loading factual analytics/)).not.toBeInTheDocument()
})
