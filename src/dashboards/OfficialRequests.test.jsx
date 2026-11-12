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
const resident={id:'r-test',first_name:'TEST ONLY',last_name:'Resident',purok:'Purok 1',resident_status:'active',birth_date:'2000-01-01',mobile_number:'09990000000',profile_id:'a-pending'};const accounts=[{id:'a-pending',role:'resident',full_name:'TEST ONLY Pending Account',verification_status:'pending',purok:'Purok 1'},{id:'a-nonresident',role:'resident',full_name:'TEST ONLY Nonresident',verification_status:'ineligible',verification_notes:'TEST ONLY decision note',purok:'Purok 2'}];const credit={configured:true,current_score:87,maximum_score:100,starting_score:100,base_score:100,policy_name:'TEST ONLY V1',positive_event_count:0,negative_event_count:0,repair_event_count:0,event_total:0,ledger:[]};const save=name=>{const dir=process.env.STAGE7R1_LAYOUT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});const body=document.body.cloneNode(true);document.querySelectorAll('select').forEach((el,i)=>[...body.querySelectorAll('select')[i].options].forEach((option,j)=>{if(el.options[j].selected)option.setAttribute('selected','');else option.removeAttribute('selected')}));const page=body.querySelector('.official-service-page');fs.writeFileSync(path.join(dir,name+'.html'),page?page.outerHTML+[...body.querySelectorAll('.modal-overlay,.action-menu-list.is-portal')].map(el=>el.outerHTML).join(''):body.innerHTML)}
const dashboard=()=>render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)


const openRequests=async()=>{dashboard();fireEvent.click(screen.getByRole('button',{name:'residents navigation'}));await screen.findByRole('button',{name:'TEST ONLY Resident'});fireEvent.click(screen.getByRole('button',{name:'Requests',exact:true}));await screen.findByText('TEST ONLY Pending Account')}
const menu=()=>screen.getByRole('button',{name:'More actions for TEST ONLY Pending Account'})
test('Requests uses a portaled keyboard menu with Escape/focus restoration and outside dismissal',async()=>{
 await openRequests();save('requests-after');expect(document.querySelector('.resident-requests-table thead')).toHaveTextContent('Actions');expect(screen.queryByRole('button',{name:'Verify',exact:true})).not.toBeInTheDocument()
 fireEvent.click(menu());const verify=screen.getByRole('menuitem',{name:'Verify TEST ONLY Pending Account'});expect(verify.closest('.table-wrapper')).toBeNull();save('requests-menu')
 fireEvent.keyDown(verify,{key:'ArrowDown'});expect(screen.getByRole('menuitem',{name:'Reject TEST ONLY Pending Account'})).toHaveFocus()
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(menu()).toHaveFocus()
 fireEvent.click(menu());fireEvent.mouseDown(document.body);expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
test.each(['Barangay Secretary','Punong Barangay'])('%s retains all existing handler confirmation flows without submitting',async role=>{
 position=role;await openRequests();fireEvent.click(menu());fireEvent.click(screen.getByRole('menuitem',{name:'Verify TEST ONLY Pending Account'}));expect(await screen.findByRole('dialog',{name:'Verify TEST ONLY Pending Account?'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 fireEvent.click(menu());fireEvent.click(screen.getByRole('menuitem',{name:'Reject TEST ONLY Pending Account'}));expect(screen.getByRole('dialog',{name:/Reject TEST ONLY Pending Account/})).toBeInTheDocument();expect(screen.getByLabelText('Reason')).toHaveValue('');fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 fireEvent.click(menu());fireEvent.click(screen.getByRole('menuitem',{name:'Not a Resident TEST ONLY Pending Account'}));expect(screen.getByRole('button',{name:'Confirm Not a Resident'})).toBeInTheDocument();save('request-confirmation');fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 expect(supabase.rpc.mock.calls.some(([name])=>name==='set_barangay_resident_eligibility')).toBe(false)
})
test('ordinary official stays read-only with no verification menu or decision controls',async()=>{
 position='Kagawad';await openRequests();save('requests-readonly');expect(screen.queryByRole('button',{name:/More actions for TEST ONLY Pending/})).not.toBeInTheDocument();expect(screen.getByText('Read-only')).toBeVisible();expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
})
