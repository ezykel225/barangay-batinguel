import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficialDashboard from '../dashboards/OfficialDashboard'
import toast from 'react-hot-toast'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}))
jest.mock('react-hot-toast',()=>({__esModule:true,default:Object.assign(jest.fn(),{success:jest.fn(),error:jest.fn()})}))
jest.mock('../context/AuthContext',()=>{const user={id:'official',full_name:'Review Official'};return {useAuth:()=>({user})}})
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['residents','reports','reservations','waste','documents','activity'].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)}>{tab==='residents'?'Residents navigation':tab+' navigation'}</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>({onOpenTab})=><button onClick={()=>onOpenTab('reservations')}>Historical booking notification</button>)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
const accounts=[{id:'a',role:'resident',full_name:'Pending Example',purok:'1',verification_status:'pending'},{id:'b',role:'resident',full_name:'Verified Example',purok:'Purok 10',verification_status:'verified'},{id:'c',role:'resident',full_name:'Ineligible Example',purok:'2',verification_status:'ineligible'}]
let position = 'Barangay Secretary'
beforeEach(()=>{
 position = 'Barangay Secretary'
 supabase.from.mockClear()
 supabase.rpc.mockImplementation(async name=>({data:name==='official_id_for_current_user'?'position':[],error:null}))
 supabase.from.mockImplementation(table=>{let rows=table==='document_requests'?[{id:'doc1',document_type:'Barangay Clearance',status:'pending',created_at:'2026-11-01'}]:table==='profiles'?[{id:'official',full_name:'Review Official',role:'official'},...accounts]:table==='barangay_officials'?[{id:'position',position,full_name:'Review Official',archived_at:null}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?(resolve)=>resolve({data:single?rows[0]||null:rows,error:null,count:rows.length}):(...args)=>{if(method==='eq')rows=rows.filter(r=>r[args[0]]===args[1]);if(method==='is')rows=rows.filter(r=>r[args[0]]==null);if(method==='not')rows=rows.filter(r=>r[args[0]]!=null);if(method==='single'||method==='maybeSingle')single=true;return q}});return q})
})

test('official dashboard does not query retired services; Reports uses actual document data and stale links fall back',async()=>{
 render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)
 await screen.findByText('Review')
 expect(supabase.from.mock.calls.map(([name])=>name)).not.toEqual(expect.arrayContaining(['reservations']))
 expect(supabase.from.mock.calls.map(([name])=>name)).not.toContain('waste_schedule')
 fireEvent.click(screen.getByRole('button',{name:'reports navigation'}))
 expect(screen.getByRole('heading',{name:'Reports'})).toBeInTheDocument()
 expect(screen.getByText('Total Document Requests').parentElement).toHaveTextContent('1')
 expect(screen.getByText('Barangay Clearance').closest('.rank-row')).toHaveTextContent('1')
 expect(screen.getByText('Verified Resident Accounts')).toBeInTheDocument()
 expect(screen.getByText('Last 6 Months')).toBeInTheDocument()
 expect(screen.queryByText(/Busiest Booking|Total Reservations/)).not.toBeInTheDocument()
 fireEvent.click(screen.getAllByRole('button',{name:'Historical booking notification'})[0])
 expect(toast).toHaveBeenCalledWith(expect.stringContaining('Historical records are preserved'))
 expect(screen.getByRole('heading',{name:'Official Dashboard'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'waste navigation'}))
 expect(screen.getByRole('heading',{name:'Official Dashboard'})).toBeInTheDocument()
})
test('actual Official Residents defaults to directory; account groups, verification dialog and read-only cross-check remain',async()=>{
 render(<MemoryRouter><OfficialDashboard/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Residents navigation'}))
 await screen.findByRole('button',{name:'Add Resident'})
 expect(screen.queryByRole('button',{name:'Verify',exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Requests'}))
 const accountView=within(screen.getByRole('region',{name:'Requests'}))
 const requests=screen.getByRole('group',{name:'Residents views'})
 expect(within(requests).getByRole('button',{name:/Requests/})).toHaveAttribute('aria-pressed','true')
 expect(accountView.getByText('Pending Example')).toBeVisible()
 expect([...screen.getByLabelText('Filter resident accounts by purok').options].map(o=>o.text)).toEqual(['All Puroks','Purok 1','Purok 2','Purok 10'])
 fireEvent.click(screen.getByRole('button',{name:'More actions for Pending Example'}));fireEvent.click(screen.getByRole('menuitem',{name:'Verify Pending Example'}))
 const dialog=screen.getByRole('dialog');expect(within(dialog).getByText('Verify Pending Example?')).toBeInTheDocument()
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}))
 fireEvent.click(screen.getByRole('button',{name:'More actions for Pending Example'}));fireEvent.click(screen.getByRole('menuitem',{name:'Reject Pending Example'}));expect(screen.getByRole('heading',{name:"Reject Pending Example's Account"})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 fireEvent.click(screen.getByRole('button',{name:'More actions for Pending Example'}));fireEvent.click(screen.getByRole('menuitem',{name:'Not a Resident Pending Example'}));expect(screen.getByRole('heading',{name:'Mark Pending Example as Not a Resident'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 expect(within(requests).queryByRole('button',{name:/^Residents/})).not.toBeInTheDocument()
 fireEvent.click(within(requests).getByRole('button',{name:'Non-Residents'}));expect(accountView.getByText('Ineligible Example')).toBeVisible()
 expect(accountView.queryByText('Pending Example')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Voter Reference List'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cross-check'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Verify',exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Requests'}));expect(within(requests).getByRole('button',{name:'Requests'})).toHaveAttribute('aria-pressed','true')
 expect(accountView.getByText('Pending Example')).toBeVisible()
})

test.each(['Barangay Kagawad','Punong Barangay'])('resident mutation controls follow the frontend matrix for %s',async rolePosition=>{
 position=rolePosition
 render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Residents navigation'}))
 await screen.findByRole('button',{name:'Requests'})
 fireEvent.click(screen.getByRole('button',{name:'Requests'}))
 await screen.findByText('Pending Example')
 if(rolePosition==='Barangay Kagawad'){
  expect(screen.queryByRole('button',{name:'Add Resident'})).not.toBeInTheDocument()
  for(const name of ['Verify','Reject','Not a Resident'])expect(screen.queryByRole('button',{name,exact:true})).not.toBeInTheDocument()
  expect(screen.getByText('Read-only')).toBeVisible();expect(screen.queryByRole('button',{name:'More actions for Pending Example'})).not.toBeInTheDocument()
 }else{
  fireEvent.click(screen.getByRole('button',{name:'More actions for Pending Example'}));expect(screen.getByRole('menuitem',{name:'Verify Pending Example'})).toBeVisible()
 }
})
