import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OfficialDashboard from './OfficialDashboard'
import { supabase } from '../supabase/supabaseClient'
import { filterPublishingAnnouncements, publishingDate, publishingEventPeriod, PublishingReadNotice, PublishingEventDate, PublishingTitle } from './OfficialPublishingUI'
jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}))
jest.mock('../context/AuthContext',()=>{const user={id:'unit-official'};return {useAuth:()=>({user})}})
jest.mock('../components/Sidebar',()=>({setActiveTab})=><nav>{['announcements','events'].map(tab=><button key={tab} onClick={()=>setActiveTab(tab)}>{tab} navigation</button>)}</nav>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),refresh:()=>{},markRead:()=>{},markAllRead:()=>{}})}))
jest.mock('../sms/SmsComposer',()=>()=> <p>Existing SMS composer</p>)
jest.mock('../sms/SmsHistory',()=>()=> <button type="button" className="btn-cancel btn-sm sms-history-button">SMS</button>)
let readError=null
const announcements=[{id:'unit-a',title:'TEST ONLY Road Advisory',badge:'PUBLIC WORKS',date_posted:'2026-11-06'},{id:'unit-b',title:'TEST ONLY Meeting',badge:'COMMUNITY',date_posted:'2026-11-05'},{id:'unit-long',title:'TEST ONLY '+ 'Long announcement title with readable words '.repeat(8),badge:'COMMUNITY',date_posted:'2026-11-04'}]
const events=[{id:'unit-e1',title:'TEST ONLY Future Event',event_date:'2099-01-02',event_time:'09:30:00',location:'TEST ONLY Hall'},{id:'unit-e2',title:'TEST ONLY Past Event',event_date:'2000-01-02',event_time:null,location:null},{id:'unit-e3',title:'TEST ONLY Unscheduled',event_date:null,location:'TEST ONLY Place'}]
beforeEach(()=>{
 readError=null;supabase.from.mockClear();supabase.rpc.mockResolvedValue({data:'unit-position',error:null})
 supabase.from.mockImplementation(table=>{
 let rows=table==='announcements'?announcements:table==='events'?events:table==='profiles'?[{id:'unit-official',full_name:'Unit Official',role:'official'}]:table==='barangay_officials'?[{id:'unit-position',full_name:'Unit Official',position:'Barangay Secretary'}]:[];let single=false
 const q=new Proxy({}, {get:(_,method)=>method==='then'?resolve=>resolve({data:single?rows[0]||null:rows,error:['announcements','events'].includes(table)?readError:null,count:rows.length}):(...args)=>{
 if(['insert','update','delete','upsert'].includes(method))throw new Error('Writes forbidden in publishing UI tests')
 if(method==='eq')rows=rows.filter(row=>row[args[0]]===args[1]);if(method==='is')rows=rows.filter(row=>row[args[0]]==null);if(method==='not')rows=rows.filter(row=>row[args[0]]!=null);if(['single','maybeSingle'].includes(method))single=true;return q
 }});return q
 })
})
const saveLayout=name=>{const dir=process.env.STAGE7N_LAYOUT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.html'),(document.querySelector('.official-content-page')?.outerHTML||'')+[...document.querySelectorAll('.action-menu-list.is-portal,.official-publishing-modal')].map(node=>node.outerHTML).join(''))}
const show=()=>render(<MemoryRouter><OfficialDashboard/></MemoryRouter>)
test('title search and category combine locally, reset, and keep SMS in a separate cell',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'announcements navigation'}));await screen.findByText('TEST ONLY Road Advisory')
 saveLayout('announcements')
 const calls=supabase.from.mock.calls.length
 fireEvent.change(screen.getByLabelText('Search announcement titles'),{target:{value:' meeting '}})
 expect(screen.queryByText('TEST ONLY Road Advisory')).not.toBeInTheDocument()
 expect(screen.getByText('TEST ONLY Meeting')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Category'),{target:{value:'PUBLIC WORKS'}})
 expect(screen.getByText('No announcements match this filter.')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Reset filters'}))
 const row=screen.getByText('TEST ONLY Road Advisory').closest('tr')
 expect(within(row).getByRole('button',{name:'SMS'}).closest('td')).toHaveAttribute('data-label','SMS')
 expect(screen.getByText('TEST ONLY Road Advisory')).toHaveAttribute('tabindex','0')
 expect(supabase.from.mock.calls).toHaveLength(calls)
})
test('announcement edit/add menus and modal Cancel preserve workflows without a write',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'announcements navigation'}));await screen.findByText('TEST ONLY Road Advisory')
 fireEvent.keyDown(screen.getByRole('button',{name:'More actions for TEST ONLY Road Advisory'}),{key:'ArrowDown'});saveLayout('announcement-menu')
 const editItem=screen.getByRole('menuitem',{name:'Edit TEST ONLY Road Advisory'});expect(editItem).toHaveFocus();fireEvent.keyDown(editItem,{key:'Escape'});expect(screen.getByRole('button',{name:'More actions for TEST ONLY Road Advisory'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'More actions for TEST ONLY Road Advisory'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'Edit TEST ONLY Road Advisory'}))
 expect(screen.getByRole('dialog',{name:'Edit Announcement'})).toBeInTheDocument()
 expect(screen.getByLabelText('Title')).toHaveValue('TEST ONLY Road Advisory');saveLayout('announcement-edit')
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Add Announcement'}));expect(screen.getByRole('dialog',{name:'New Announcement'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
})
test('event table filters valid dates, renders real time and honest missing values; calendar retains its month behavior',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'events navigation'}));await screen.findByText('TEST ONLY Future Event')
 saveLayout('events')
 expect(screen.getByText('9:30 AM')).toBeInTheDocument()
 expect(screen.getByText('Location not recorded')).toBeInTheDocument()
 const filter=screen.getByLabelText('Filter events by date (table)')
 fireEvent.change(filter,{target:{value:'past'}})
 expect(screen.getByText('TEST ONLY Past Event')).toBeInTheDocument()
 expect(screen.queryByText('TEST ONLY Unscheduled')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Calendar'}));expect(filter).toBeDisabled()
 expect(screen.getByText(/Date filtering applies to the table/)).toBeInTheDocument();saveLayout('event-calendar')
 fireEvent.click(screen.getByRole('button',{name:'Table'}));expect(filter).not.toBeDisabled();expect(filter).toHaveValue('past')
 fireEvent.click(screen.getByRole('button',{name:'More actions for TEST ONLY Past Event'}));fireEvent.click(screen.getByRole('menuitem',{name:'Edit TEST ONLY Past Event'}))
 expect(screen.getByRole('dialog',{name:'Edit Event'})).toBeInTheDocument();expect(screen.getByLabelText('Event Date')).toHaveValue('2000-01-02');saveLayout('event-edit')
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
})
test('read failure is explicit rather than a false empty collection',async()=>{
 readError={code:'42501'};show();fireEvent.click(screen.getByRole('button',{name:'announcements navigation'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('not available for your account')
 expect(screen.queryByText('No announcements yet.')).not.toBeInTheDocument()
})
test('delete confirmation remains cancellable without executing a write',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'announcements navigation'}));await screen.findByText('TEST ONLY Road Advisory')
 fireEvent.click(screen.getByRole('button',{name:'More actions for TEST ONLY Road Advisory'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'Delete TEST ONLY Road Advisory'}))
 const dialog=await screen.findByRole('dialog',{name:'Delete this announcement?'})
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(screen.getByText('TEST ONLY Road Advisory')).toBeInTheDocument()
})
test('pure title filtering is trimmed and case insensitive without mutating records',()=>{
 expect(filterPublishingAnnouncements(announcements,'road','all')).toEqual([announcements[0]])
 expect(filterPublishingAnnouncements(announcements,'','unknown')).toEqual([])
 expect(announcements).toHaveLength(3)
 render(<PublishingTitle>{announcements[2].title}</PublishingTitle>);expect(screen.getByText(announcements[2].title.trim())).toHaveAttribute('tabindex','0');expect(screen.getByText(announcements[2].title.trim())).toHaveAttribute('title',announcements[2].title)
})
test('calendar dates, invalid dates and Manila timestamps remain truthful',()=>{
 expect(publishingDate('2026-11-06')).toBe('Nov 6, 2026')
 expect(publishingDate('2026-11-05T18:00:00Z')).toBe('Nov 6, 2026')
 expect(publishingDate('2026-02-30')).toBe('Date not recorded')
 expect(publishingEventPeriod(null,'2026-11-06')).toBe('Unscheduled')
 expect(publishingEventPeriod('2026-11-06','2026-11-06')).toBe('Upcoming')
 expect(publishingEventPeriod('2026-11-05','2026-11-06')).toBe('Past')
})
test.each(['loading','incomplete','error','denied'])('read state %s is explicit',(status)=>{
 render(<PublishingReadNotice state={{status}} name="Events" hasRows={false}/> )
 expect(screen.getByRole(status==='loading'?'status':'alert')).toBeInTheDocument()
})
test('time is never parsed from a location string',()=>{
 const event=Object.freeze({event_date:null,location:'9:00 AM TEST ONLY Hall'})
 render(<PublishingEventDate event={event} today="2026-11-06"/> )
 expect(screen.getByLabelText('Event time not recorded')).toHaveTextContent('Time \u2014')
 expect(event.location).toBe('9:00 AM TEST ONLY Hall')
 expect(screen.queryByText('9:00 AM')).not.toBeInTheDocument()
 expect(screen.getByText('Unscheduled')).toBeInTheDocument()
})
test('both tables have deliberate five-column groups with separate compact SMS/actions',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'announcements navigation'}));await screen.findByText('TEST ONLY Road Advisory')
 let table=screen.getByRole('table')
 expect(table).toHaveClass('publishing-announcements');expect(table.querySelectorAll('colgroup col')).toHaveLength(5)
 expect(table.querySelectorAll('colgroup col')[3]).toHaveClass('publishing-col-sms')
 fireEvent.click(screen.getByRole('button',{name:'events navigation'}));await screen.findByText('TEST ONLY Future Event')
 table=screen.getByRole('table');expect(table).toHaveClass('publishing-events')
 expect(table.querySelectorAll('colgroup col')[2]).toHaveClass('publishing-col-location')
 const css=fs.readFileSync(path.join(process.cwd(),'src/dashboards/OfficialPublishing.css'),'utf8')
 expect(css).toMatch(/\.sms-history-button\{[^}]*white-space:nowrap[^}]*display:inline-flex[^}]*flex-shrink:0[^}]*min-width:52px/)
 expect(css).toContain('td.action-cell{display:table-cell}')
})
