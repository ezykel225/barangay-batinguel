import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficialDashboard from './OfficialDashboard'
import ResidentDirectory from '../residents/ResidentDirectory'
import ResidentProfileDialog from '../residents/ResidentProfileDialog'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}))
jest.mock('../context/AuthContext',()=>{const user={id:'unit-official'};return {useAuth:()=>({user})}})
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['officials','residents'].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
let position, queue, docs, queueError, documentError
const records=[{id:'unit-d1',full_name:'TEST ONLY First Resident',document_type:'Barangay Clearance',purpose:'TEST ONLY employment purpose with enough words to verify readable wrapping',contact_number:'09990000000',status:'pending',created_at:'2026-11-06T01:00:00Z'},{id:'unit-d2',full_name:'TEST ONLY Second Resident',document_type:'Certificate of Residency',purpose:'TEST ONLY application',contact_number:'09990000001',status:'ready_for_pickup',created_at:'2026-11-05T01:00:00Z'}]
const complaintRows=[{id:'unit-c1',reference:'CMP-2026-AB12CD',intake_channel:'online',status:'received',created_at:'2026-11-06T01:00:00Z',updated_at:'2026-11-06T01:00:00Z',narrative:'PRIVATE TEST MARKER'},{id:'unit-c2',reference:'CMP-2026-9XYZ70',intake_channel:'walk_in',status:'screened',created_at:'2026-11-05T01:00:00Z',updated_at:'2026-11-06T01:00:00Z'}]
beforeEach(()=>{
 position='Barangay Secretary';queue=[...complaintRows];docs=[...records];queueError=null;documentError=null;supabase.from.mockClear();supabase.rpc.mockClear()
 supabase.rpc.mockImplementation(async name=>({data:name==='official_id_for_current_user'?'unit-position':name==='complaint_queue'?queue:name.includes('resident_directory')?[resident]:name==='community_credit_profile'?credit:[],error:name==='complaint_queue'?queueError:null}))
 supabase.from.mockImplementation(table=>{
 let rows=table==='document_requests'?docs:table==='profiles'?[{id:'unit-official',full_name:'TEST ONLY Official',role:'official'},...accounts]:table==='barangay_officials'?[{id:'unit-position',full_name:'TEST ONLY Official with a longer name',position,committee:'TEST ONLY committee with a longer description',contact_number:'09990000002',display_order:1,archived_at:null}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?resolve=>resolve({data:single?rows[0]||null:rows,error:table==='document_requests'?documentError:null,count:rows.length}):(...args)=>{
 if(['insert','update','delete','upsert'].includes(method))throw new Error('No writes permitted in service presentation tests')
 if(method==='eq')rows=rows.filter(row=>row[args[0]]===args[1]);if(method==='is')rows=rows.filter(row=>row[args[0]]==null);if(method==='not')rows=rows.filter(row=>row[args[0]]!=null);if(['single','maybeSingle'].includes(method))single=true;return q
 }});return q
 })
})
const resident={id:'r-test',first_name:'TEST ONLY',last_name:'Resident',purok:'Purok 1',resident_status:'active',birth_date:'2000-01-01',mobile_number:'09990000000',profile_id:'a-pending'};const accounts=[{id:'a-pending',role:'resident',full_name:'TEST ONLY Pending Account',verification_status:'pending',purok:'Purok 1'},{id:'a-nonresident',role:'resident',full_name:'TEST ONLY Nonresident',verification_status:'ineligible',verification_notes:'TEST ONLY decision note',purok:'Purok 2'}];const credit={configured:true,current_score:87,maximum_score:100,starting_score:100,base_score:100,policy_name:'TEST ONLY V1',positive_event_count:0,negative_event_count:0,repair_event_count:0,event_total:0,ledger:[]};const save=name=>{const dir=process.env.STAGE7R_LAYOUT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});const body=document.body.cloneNode(true);document.querySelectorAll('select').forEach((el,i)=>[...body.querySelectorAll('select')[i].options].forEach((option,j)=>{if(el.options[j].selected)option.setAttribute('selected','');else option.removeAttribute('selected')}));const page=body.querySelector('.official-service-page');fs.writeFileSync(path.join(dir,name+'.html'),page?page.outerHTML+[...body.querySelectorAll('.modal-overlay,.action-menu-list.is-portal')].map(el=>el.outerHTML).join(''):body.innerHTML)}
const dashboard=()=>render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)

test('Officials directory retains portal menu and edit/add forms without writes',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'officials navigation'}));await screen.findByRole('heading',{name:'Officials Directory'});await screen.findAllByText('TEST ONLY Official with a longer name');save('officials')
 const table=document.querySelector('.official-directory-page table');expect(table.querySelectorAll('thead th')).toHaveLength(7)
 fireEvent.click(within(table).getByRole('button',{name:/actions/i}));save('official-menu');expect(screen.getByRole('menuitem',{name:/^Edit TEST ONLY/})).toBeInTheDocument();fireEvent.click(screen.getByRole('menuitem',{name:/^Edit TEST ONLY/}));expect(screen.getByRole('dialog',{name:'Edit Official'})).toBeInTheDocument();save('official-edit');expect(screen.getByLabelText('Full Name')).toHaveValue('TEST ONLY Official with a longer name')
})
test('resident directory and account views remain separate and filters stay local',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'residents navigation'}));await screen.findByRole('button',{name:'TEST ONLY Resident'});save('residents')
 expect(screen.getByText('Directory records and account verification').closest('details')).not.toHaveAttribute('open');expect(screen.getByText('Inactive directory history', {exact:false})).toBeInTheDocument()
 const group=screen.getByRole('group',{name:'Residents views'});fireEvent.click(within(group).getByRole('button',{name:'Non-Residents'}));await screen.findByText('TEST ONLY Nonresident');save('nonresidents');expect(screen.queryByText('TEST ONLY Pending Account')).not.toBeInTheDocument()
 fireEvent.click(within(group).getByRole('button',{name:'Requests'}));await screen.findByText('TEST ONLY Pending Account');save('requests');expect(screen.queryByText('TEST ONLY Nonresident')).not.toBeInTheDocument()
 fireEvent.click(within(group).getByRole('button',{name:'Batinguel Residents'}));fireEvent.click(screen.getByRole('button',{name:'Add Resident'}));expect(screen.getByRole('dialog',{name:'Add Resident'})).toBeInTheDocument();save('resident-add')
})
test('profile retains identity once, deferred privacy tabs, live adapter score and close handling',async()=>{
 const close=jest.fn();render(<ResidentProfileDialog resident={resident} profile={null} onClose={close} onEdit={null}/>);save('resident-profile');expect(screen.getAllByRole('heading',{name:'TEST ONLY Resident'})).toHaveLength(1);expect(screen.queryByRole('button',{name:'Edit Resident'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('tab',{name:'History'}));expect(screen.getByText('Linked resident history unavailable')).toBeVisible()
 fireEvent.click(screen.getByRole('tab',{name:'Community Credit'}));await screen.findByText('TEST ONLY V1',{exact:false});expect(document.querySelector('.credit-gauge-number')).toHaveTextContent('87');save('resident-credit');expect(supabase.rpc).toHaveBeenCalledWith('community_credit_profile',{p_resident_id:'r-test'})
 fireEvent.click(screen.getByRole('button',{name:'Close resident profile'}));expect(close).toHaveBeenCalledTimes(1)
})



test('directory load, empty and failure states remain distinct',async()=>{
 supabase.rpc.mockReturnValue(new Promise(()=>{}));const pending=render(<div className="residents-workspace"><ResidentDirectory/></div>);save('directory-loading');pending.unmount()
 supabase.rpc.mockResolvedValue({data:[],error:null});const empty=render(<div className="residents-workspace"><ResidentDirectory/></div>);await waitFor(()=>expect(document.querySelector('.directory-summary')).toBeInTheDocument());save('directory-empty');empty.unmount()
 supabase.rpc.mockResolvedValue({data:null,error:{code:'42501'}});render(<div className="residents-workspace"><ResidentDirectory/></div>);expect(await screen.findByRole('alert')).toHaveTextContent('Resident directory unavailable');save('directory-error')
})
