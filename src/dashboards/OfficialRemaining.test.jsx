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
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['community-credit','reports','activity','settings'].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
let position, queue, docs, queueError, documentError, documentCount, residentCount
const records=[{id:'unit-d1',full_name:'TEST ONLY First Resident',document_type:'Barangay Clearance',purpose:'TEST ONLY employment purpose with enough words to verify readable wrapping',contact_number:'09990000000',status:'pending',created_at:'2026-11-06T01:00:00Z'},{id:'unit-d2',full_name:'TEST ONLY Second Resident',document_type:'Certificate of Residency',purpose:'TEST ONLY application',contact_number:'09990000001',status:'ready_for_pickup',created_at:'2026-11-05T01:00:00Z'}]
const complaintRows=[{id:'unit-c1',reference:'CMP-2026-AB12CD',intake_channel:'online',status:'received',created_at:'2026-11-06T01:00:00Z',updated_at:'2026-11-06T01:00:00Z',narrative:'PRIVATE TEST MARKER'},{id:'unit-c2',reference:'CMP-2026-9XYZ70',intake_channel:'walk_in',status:'screened',created_at:'2026-11-05T01:00:00Z',updated_at:'2026-11-06T01:00:00Z'}]
beforeEach(()=>{
 documentCount=null;residentCount=null;position='Barangay Secretary';queue=[...complaintRows];docs=[...records];queueError=null;documentError=null;supabase.from.mockClear();supabase.rpc.mockClear()
 supabase.rpc.mockImplementation(async name=>({data:name==='official_id_for_current_user'?'unit-position':name==='complaint_queue'?queue:name.includes('resident_directory')?[resident]:name==='community_credit_profile'?credit:name==='community_credit_admin_state'?admin:[],error:name==='complaint_queue'?queueError:null}))
 supabase.from.mockImplementation(table=>{
 let rows=table==='activity_log'?[{id:'test-log',created_at:'2026-11-07T01:00:00Z',actor_name:'TEST ONLY Official',action:'verified',entity_type:'resident_account',subject:'TEST ONLY audit subject',details:'TEST ONLY recorded note'}]:table==='document_requests'?docs:table==='profiles'?[{id:'unit-official',full_name:'TEST ONLY Official',role:'official'},...accounts]:table==='barangay_officials'?[{id:'unit-position',full_name:'TEST ONLY Official with a longer name',position,committee:'TEST ONLY committee with a longer description',contact_number:'09990000002',display_order:1,archived_at:null}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?resolve=>resolve({data:single?rows[0]||null:rows,error:table==='document_requests'?documentError:null,count:table==='document_requests'?(documentCount??rows.length):table==='profiles'?(residentCount??rows.length):rows.length}):(...args)=>{
 if(['insert','update','delete','upsert'].includes(method))throw new Error('No writes permitted in service presentation tests')
 if(method==='eq')rows=rows.filter(row=>row[args[0]]===args[1]);if(method==='is')rows=rows.filter(row=>row[args[0]]==null);if(method==='not')rows=rows.filter(row=>row[args[0]]!=null);if(['single','maybeSingle'].includes(method))single=true;return q
 }});return q
 })
})
const admin={policies:[{id:'p-active',name:'TEST ONLY V1 policy',status:'active',base_score:100,minimum_score:0,maximum_score:100},{id:'p-draft',name:'TEST ONLY draft',status:'draft',base_score:100,minimum_score:0,maximum_score:100}],rules:[{id:'r-unit',policy_id:'p-active',rule_code:'TEST_RULE',title:'TEST ONLY rule',category:'positive',source_domain:'community_activity',points_delta:1,active:false}]};const resident={id:'r-test',first_name:'TEST ONLY',last_name:'Resident',purok:'Purok 1',resident_status:'active',birth_date:'2000-01-01',mobile_number:'09990000000',profile_id:'a-pending'};const accounts=[{id:'a-pending',role:'resident',full_name:'TEST ONLY Pending Account',verification_status:'pending',purok:'Purok 1'},{id:'a-nonresident',role:'resident',full_name:'TEST ONLY Nonresident',verification_status:'ineligible',verification_notes:'TEST ONLY decision note',purok:'Purok 2'}];const credit={configured:true,current_score:87,maximum_score:100,starting_score:100,base_score:100,policy_name:'TEST ONLY V1',positive_event_count:0,negative_event_count:0,repair_event_count:0,event_total:0,ledger:[]};const save=name=>{const dir=process.env.STAGE7S_LAYOUT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});const body=document.body.cloneNode(true);document.querySelectorAll('select').forEach((el,i)=>[...body.querySelectorAll('select')[i].options].forEach((option,j)=>{if(el.options[j].selected)option.setAttribute('selected','');else option.removeAttribute('selected')}));fs.writeFileSync(path.join(dir,name+'.html'),body.querySelector('.dashboard-main')?.innerHTML||body.innerHTML)}
const dashboard=()=>render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)


test('Reports retains actual loaded document and account summaries without adding exports',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'reports navigation'}));await screen.findByText('Barangay Clearance');expect(screen.getByText('Total Document Requests').parentElement).toHaveTextContent('2');expect(screen.getByText('Open Verification Requests').parentElement).toHaveTextContent('1');expect(screen.queryByRole('button',{name:/Export|Download/})).not.toBeInTheDocument();save('reports')
})
test('Activity Log retains stored actor, labels, notes and immutable display',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'activity navigation'}));await screen.findByText('TEST ONLY audit subject');expect(screen.getByText('TEST ONLY recorded note')).toBeVisible();expect(document.querySelectorAll('table thead th')).toHaveLength(6);save('activity')
})
test('Settings retains own hours and password visibility without saves',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'settings navigation'}));await screen.findByText(/Shown on the public Officials page/);expect(screen.getByLabelText('New Password')).toHaveAttribute('type','password');fireEvent.click(screen.getByRole('button',{name:'Show the new password'}));expect(screen.getByLabelText('New Password')).toHaveAttribute('type','text');fireEvent.click(screen.getByRole('button',{name:'Hide the new password'}));expect(document.querySelector('#avatar-upload')).toHaveClass('visually-hidden');expect(document.querySelector('#avatar-upload').style.display).not.toBe('none');save('settings')
})
test('Community Credit keeps V1 policy/rule data and draft forms without mutations',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'community-credit navigation'}));await screen.findByText('TEST ONLY rule');expect(screen.getByText('Active: TEST ONLY V1 policy')).toBeVisible();save('credit');fireEvent.click(screen.getByRole('button',{name:'Create policy'}));expect(screen.getByRole('dialog',{name:'Create policy'})).toBeInTheDocument();save('credit-dialog');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(supabase.rpc.mock.calls.some(([name])=>name.startsWith('save_')||name.startsWith('activate_'))).toBe(false)
})
test('Community Credit administration remains unavailable to ordinary officials',async()=>{
 position='Kagawad';dashboard();fireEvent.click(screen.getByRole('button',{name:'community-credit navigation'}));await screen.findByText(/manages credit policies and rules/);expect(screen.queryByRole('button',{name:'Create policy'})).not.toBeInTheDocument();expect(supabase.rpc.mock.calls.some(([name])=>name==='community_credit_admin_state')).toBe(false);save('credit-readonly')
})

test.each(['incomplete','denied','error'])('Reports hides incomplete/failed %s document totals and rankings',async kind=>{
 if(kind==='incomplete')documentCount=2000;else documentError={code:kind==='denied'?'42501':'XX000'}
 dashboard();fireEvent.click(screen.getByRole('button',{name:'reports navigation'}));await waitFor(()=>expect(screen.getByText('Total Document Requests').parentElement).toHaveTextContent(kind==='denied'?'Restricted':'Unavailable'))
 expect(screen.getByText('Document rankings require a complete authorized read.')).toBeVisible();expect(document.querySelector('.bar-chart')).toBeNull();expect(document.querySelector('.rank-list')).toBeNull()
})
test('Reports distinguishes account counts from directory links and masks capped account reads',async()=>{
 residentCount=5000;dashboard();fireEvent.click(screen.getByRole('button',{name:'reports navigation'}));await waitFor(()=>expect(screen.getByText('Verified Resident Accounts').parentElement).toHaveTextContent('Unavailable'));expect(screen.getByText('Open Verification Requests').parentElement).toHaveTextContent('Unavailable');expect(screen.getByText(/Verified accounts and linked directory records measure different things/)).toBeVisible()
})

test('Reports interpretations use the authorized chart collections and suppress unavailable statistics', async () => {
  dashboard()
  fireEvent.click(screen.getByRole('button', { name: 'reports navigation' }))
  await screen.findByText('Barangay Clearance')
  expect(screen.getByRole('region', { name: 'Most requested documents: descriptive interpretation' })).toHaveTextContent('2 document requests across')
  expect(screen.getByRole('region', { name: 'Document requests over the last six months: descriptive interpretation' })).toHaveTextContent('current month may be partial')
})
