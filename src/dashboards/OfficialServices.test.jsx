import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficialDashboard from './OfficialDashboard'
import OfficialComplaints from '../complaints/OfficialComplaints'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}))
jest.mock('../context/AuthContext',()=>{const user={id:'unit-official'};return {useAuth:()=>({user})}})
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['documents','complaints'].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
let position, queue, docs, queueError, documentError
const records=[{id:'unit-d1',full_name:'TEST ONLY First Resident',document_type:'Barangay Clearance',purpose:'TEST ONLY employment purpose with enough words to verify readable wrapping',contact_number:'09990000000',status:'pending',created_at:'2026-11-06T01:00:00Z'},{id:'unit-d2',full_name:'TEST ONLY Second Resident',document_type:'Certificate of Residency',purpose:'TEST ONLY application',contact_number:'09990000001',status:'ready_for_pickup',created_at:'2026-11-05T01:00:00Z'}]
const complaintRows=[{id:'unit-c1',reference:'CMP-2026-AB12CD',intake_channel:'online',status:'received',created_at:'2026-11-06T01:00:00Z',updated_at:'2026-11-06T01:00:00Z',narrative:'PRIVATE TEST MARKER'},{id:'unit-c2',reference:'CMP-2026-9XYZ70',intake_channel:'walk_in',status:'screened',created_at:'2026-11-05T01:00:00Z',updated_at:'2026-11-06T01:00:00Z'}]
beforeEach(()=>{
 position='Barangay Secretary';queue=[...complaintRows];docs=[...records];queueError=null;documentError=null;supabase.from.mockClear();supabase.rpc.mockClear()
 supabase.rpc.mockImplementation(async name=>({data:name==='official_id_for_current_user'?'unit-position':name==='complaint_queue'?queue:[],error:name==='complaint_queue'?queueError:null}))
 supabase.from.mockImplementation(table=>{
 let rows=table==='document_requests'?docs:table==='profiles'?[{id:'unit-official',full_name:'TEST ONLY Official',role:'official'}]:table==='barangay_officials'?[{id:'unit-position',full_name:'TEST ONLY Official',position,archived_at:null}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?resolve=>resolve({data:single?rows[0]||null:rows,error:table==='document_requests'?documentError:null,count:rows.length}):(...args)=>{
 if(['insert','update','delete','upsert'].includes(method))throw new Error('No writes permitted in service presentation tests')
 if(method==='eq')rows=rows.filter(row=>row[args[0]]===args[1]);if(method==='is')rows=rows.filter(row=>row[args[0]]==null);if(method==='not')rows=rows.filter(row=>row[args[0]]!=null);if(['single','maybeSingle'].includes(method))single=true;return q
 }});return q
 })
})
const save=name=>{const dir=process.env.STAGE7O_LAYOUT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.html'),(document.querySelector('.official-service-page')?.outerHTML||'')+[...document.querySelectorAll('.dr-details,.action-menu-list.is-portal')].map(el=>el.outerHTML).join(''))}
const dashboard=()=>render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)
test('document search/status/reset stay local and Secretary actions remain available',async()=>{
 dashboard();fireEvent.click(screen.getByRole('button',{name:'documents navigation'}));await screen.findByText('TEST ONLY First Resident');save('documents')
 const reads=supabase.from.mock.calls.length
 fireEvent.change(screen.getByLabelText(/Search document requests by resident/),{target:{value:'Second'}})
 expect(screen.queryByText('TEST ONLY First Resident')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Filter document requests by status'),{target:{value:'pending'}})
 expect(screen.getByText('No document requests match this search.')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Reset'}));expect(screen.getByText('TEST ONLY First Resident')).toBeInTheDocument()
 const row=screen.getByText('TEST ONLY First Resident').closest('tr');fireEvent.click(within(row).getByRole('button',{name:/actions/i}));save('document-menu')
 expect(screen.getByRole('menuitem',{name:/Approve/})).toBeInTheDocument()
 fireEvent.keyDown(screen.getByRole('menuitem',{name:/Approve/}),{key:'Escape'})
 expect(supabase.from.mock.calls).toHaveLength(reads)
})
test('Punong keeps read-only processing access and existing request-detail viewing',async()=>{
 position='Punong Barangay';dashboard();fireEvent.click(screen.getByRole('button',{name:'documents navigation'}));await screen.findByText('TEST ONLY First Resident');save('documents-readonly')
 expect(screen.getByText(/Only the Secretary can process/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/More actions/})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/View document request from TEST ONLY First Resident/}))
 expect(await screen.findByRole('dialog',{name:'Document Request'})).toBeInTheDocument();save('document-detail')
 expect(screen.queryByRole('button',{name:/Approve/})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Close document request details'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('document failed read does not claim an empty queue',async()=>{
 documentError={code:'42501'};dashboard();fireEvent.click(screen.getByRole('button',{name:'documents navigation'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('not available for your account');save('documents-error')
 expect(screen.queryByText('No document requests yet.')).not.toBeInTheDocument()
})
test('complaint summary, reference-only filters and reset preserve privacy',async()=>{
 render(<OfficialComplaints isSecretary/>);save('complaints-loading');await screen.findByText('CMP-2026-AB12CD');save('complaints')
 expect(screen.getByText(/2 total/)).toBeInTheDocument()
 const calls=supabase.rpc.mock.calls.length
 expect(screen.queryByText('PRIVATE TEST MARKER')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Search complaints by reference number'),{target:{value:'PRIVATE TEST MARKER'}})
 expect(screen.queryByText('CMP-2026-AB12CD')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Reset filters'}))
 fireEvent.change(screen.getByLabelText('Filter by status'),{target:{value:'screened'}})
 expect(screen.getByText('CMP-2026-9XYZ70')).toBeInTheDocument();expect(screen.queryByText('CMP-2026-AB12CD')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Reset filters'}));fireEvent.change(screen.getByLabelText('Filter by how the complaint arrived'),{target:{value:'online'}})
 expect(screen.getByText('CMP-2026-AB12CD')).toBeInTheDocument();expect(screen.queryByText('CMP-2026-9XYZ70')).not.toBeInTheDocument()
 expect(supabase.rpc.mock.calls).toHaveLength(calls)
})
test('ordinary official View retains restricted detail without adding intake or private previews',async()=>{
 render(<OfficialComplaints/>);await screen.findByText('CMP-2026-AB12CD')
 expect(screen.queryByRole('button',{name:'Record Walk-in Complaint'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View complaint CMP-2026-AB12CD'}))
 await waitFor(()=>expect(document.querySelector('.complaint-restricted')).toBeInTheDocument());save('complaint-restricted')
 expect(document.body).not.toHaveTextContent('PRIVATE TEST MARKER')
 fireEvent.click(screen.getByRole('button',{name:'Close complaint details'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('queue badges retain stored statuses and reviewed is informational, not resolved',async()=>{
 render(<OfficialComplaints/>);await screen.findByText('CMP-2026-9XYZ70')
 expect(document.querySelector('.status-badge[data-status=screened]')).toHaveTextContent('Reviewed by the barangay')
 const css=fs.readFileSync(path.join(process.cwd(),'src/dashboards/OfficialServices.css'),'utf8')
 expect(css).toContain('[data-status="screened"]{color:#275686;background:#edf4fd')
 expect(css).toContain('container-type:inline-size')
 expect(css).toContain('td.action-cell{display:table-cell}')
})
test('complaint empty and failure states stay distinct',async()=>{
 queue=[];const {unmount}=render(<OfficialComplaints/>);await screen.findByText(/No complaints/);save('complaints-empty');unmount()
 queueError={code:'42501',message:'Unit denied'};render(<OfficialComplaints/>);expect(await screen.findByRole('alert')).toBeInTheDocument();save('complaints-error')
})
