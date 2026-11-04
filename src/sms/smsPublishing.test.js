import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import OfficialDashboard from '../dashboards/OfficialDashboard'
import {supabase} from '../supabase/supabaseClient'
import {useAuth} from '../context/AuthContext'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn(),functions:{invoke:jest.fn()},storage:{from:jest.fn()}}}))
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}))
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['announcements','events'].map(t=><button key={t} onClick={()=>setActiveTab(t)}>{t} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),badges:{},refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
jest.mock('react-hot-toast',()=>({__esModule:true,default:Object.assign(jest.fn(),{success:jest.fn(),error:jest.fn()})}))
let writes,order
beforeEach(()=>{
 writes=[];order=[];Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:()=> 'request'}})
 useAuth.mockReturnValue({user:{id:'actor',full_name:'Test Staff'}})
 supabase.from.mockImplementation(table=>{let rows=table==='profiles'?[{id:'actor',role:'official',full_name:'Test Staff'}]:table==='barangay_officials'?[{id:'position',position:'Barangay Secretary',full_name:'Test Staff',archived_at:null}]:[];let mode='read',payload,single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?(resolve)=>{if(mode!=='read'){writes.push({table,mode,payload});order.push('publish');rows=[{id:'published'}]}resolve({data:single?rows[0]||null:rows,error:null,count:rows.length})}:(...args)=>{if(method==='eq')rows=rows.filter(r=>r[args[0]]===args[1]);if(method==='is')rows=rows.filter(r=>r[args[0]]==null);if(method==='single'||method==='maybeSingle')single=true;if(['insert','update'].includes(method)){mode=method;payload=args[0]}return q}});return q})
 supabase.rpc.mockImplementation(async(name)=>{order.push(name);return{data:name==='official_id_for_current_user'?'position':name==='sms_audience_options'?['Purok 1']:name==='sms_source_history'?{audience:null,broadcasts:[]}:name==='sms_preview'?{audience:{type:'all_residents'},eligible:2,recipients:2,skipped:0,message:'Public test message',preview_token:'token'}:name==='sms_prepare_broadcast'?'broadcast':name==='sms_broadcast_state'?{counts:{pending:2}}:[],error:null}})
 supabase.functions.invoke.mockImplementation(async()=>{order.push('provider-mock');return{data:{counts:{pending:0,accepted:2}},error:null}})
})
test.each([
 ['announcement','announcements','Add Announcement','announcements'],
 ['event','events','Add Event','events'],
])('%s actual form publishes once then requests confirmed SMS',async(type,tab,button,table)=>{
 render(<MemoryRouter><OfficialDashboard/></MemoryRouter>);await userEvent.click(screen.getByRole('button',{name:tab+' navigation'}));await userEvent.click(await screen.findByRole('button',{name:button}))
 const dialog=screen.getByRole('dialog')
 const set=(selector,value)=>fireEvent.change(dialog.querySelector(selector),{target:{value}})
 if(type==='announcement'){set('#off-title','Public notice');set('#off-description','Public description')}
 if(type==='event'){set('#off-event-title','Public event');set('#off-event-date','2026-11-01')}
 fireEvent.click(within(dialog).getByLabelText('Send SMS when this content is published'))
 // Cannot publish/send with an unconfirmed draft.
 const save=()=>within(dialog).getByRole('button',{name:/Save & Send SMS|Publish & Send SMS/})
 fireEvent.click(save());expect(writes.filter(w=>w.table===table)).toHaveLength(0)
 await userEvent.click(within(dialog).getByRole('button',{name:'Preview SMS'}));await within(dialog).findByText(/2 eligible residents/);fireEvent.click(within(dialog).getByLabelText(/I confirm/))
 const submit=save();fireEvent.click(submit);fireEvent.click(submit)
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
 expect(writes.filter(w=>w.table===table)).toHaveLength(1)
 expect(supabase.rpc).toHaveBeenCalledWith('sms_prepare_broadcast',expect.objectContaining({p_source_type:type,p_source_id:'published',p_dry_run:false}))
 expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
 expect(order.indexOf('publish')).toBeLessThan(order.indexOf('sms_prepare_broadcast'));expect(order.indexOf('sms_prepare_broadcast')).toBeLessThan(order.indexOf('provider-mock'))
})
