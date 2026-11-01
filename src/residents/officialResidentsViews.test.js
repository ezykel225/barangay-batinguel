import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficialDashboard from '../dashboards/OfficialDashboard'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}))
jest.mock('../context/AuthContext',()=>{const user={id:'official',full_name:'Review Official'};return {useAuth:()=>({user})}})
jest.mock('../components/Sidebar',()=>({setActiveTab})=><button onClick={()=>setActiveTab('residents')}>Residents navigation</button>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
const accounts=[{id:'a',role:'resident',full_name:'Pending Example',purok:'1',verification_status:'pending'},{id:'b',role:'resident',full_name:'Verified Example',purok:'Purok 10',verification_status:'verified'},{id:'c',role:'resident',full_name:'Ineligible Example',purok:'2',verification_status:'ineligible'}]
beforeEach(()=>{
 supabase.rpc.mockImplementation(async name=>({data:name==='official_id_for_current_user'?'position':[],error:null}))
 supabase.from.mockImplementation(table=>{let rows=table==='profiles'?[{id:'official',full_name:'Review Official',role:'official'},...accounts]:table==='barangay_officials'?[{id:'position',position:'Barangay Secretary',full_name:'Review Official',archived_at:null}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?(resolve)=>resolve({data:single?rows[0]||null:rows,error:null}):(...args)=>{if(method==='eq')rows=rows.filter(r=>r[args[0]]===args[1]);if(method==='is')rows=rows.filter(r=>r[args[0]]==null);if(method==='not')rows=rows.filter(r=>r[args[0]]!=null);if(method==='single'||method==='maybeSingle')single=true;return q}});return q})
})
test('actual Official Residents defaults to directory; account groups, verification dialog and read-only cross-check remain',async()=>{
 render(<MemoryRouter><OfficialDashboard/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Residents navigation'}))
 await screen.findByRole('button',{name:'Add Resident'})
 expect(screen.queryByRole('button',{name:'Verify',exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Account Verification'}))
 const accountView=within(screen.getByRole('region',{name:'Account Verification'}))
 const requests=screen.getByRole('group',{name:'Resident account groups'})
 expect(within(requests).getByRole('button',{name:/Requests/})).toHaveAttribute('aria-pressed','true')
 expect(accountView.getByText('Pending Example')).toBeVisible()
 expect([...screen.getByLabelText('Filter resident accounts by purok').options].map(o=>o.text)).toEqual(['All Puroks','Purok 1','Purok 2','Purok 10'])
 fireEvent.click(screen.getByRole('button',{name:'Verify',exact:true}))
 const dialog=screen.getByRole('dialog');expect(within(dialog).getByText('Verify Pending Example?')).toBeInTheDocument()
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}))
 fireEvent.click(screen.getByRole('button',{name:'Reject',exact:true}));expect(screen.getByRole('heading',{name:"Reject Pending Example's Account"})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 fireEvent.click(screen.getByRole('button',{name:'Not a Resident',exact:true}));expect(screen.getByRole('heading',{name:'Mark Pending Example as Not a Resident'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 expect(within(requests).queryByRole('button',{name:/^Residents/})).not.toBeInTheDocument()
 fireEvent.click(within(requests).getByRole('button',{name:/Not Residents/}));expect(accountView.getByText('Ineligible Example')).toBeVisible()
 expect(screen.queryByRole('button',{name:'Voter Reference List'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Verify',exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Account Verification'}));expect(within(requests).getByRole('button',{name:/Not Residents/})).toHaveAttribute('aria-pressed','true')
})
