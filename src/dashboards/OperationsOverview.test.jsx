import { fireEvent, render, screen, within } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import OperationsOverview, { overviewReadState, readOverviewRows } from './OperationsOverview'

const ready=Object.fromEntries(['documents','residents','announcements','events'].map(key=>[key,{status:'ready'}]))
const props=()=>({firstName:'Unit',positionLabel:'Barangay Secretary',isSecretary:true,isKapitan:false,onNavigate:jest.fn(),documents:[],residents:[],announcements:[],events:[],sources:ready,now:new Date('2026-11-05T18:00:00Z')})
const value=title=>screen.getByRole('heading',{name:title}).parentElement.querySelector('.operations-value').textContent

test.each([
 [{data:[],error:null,count:0},'ready'],
 [{data:[{}],error:null,count:1},'ready'],
 [{data:[{}],error:null,count:2},'incomplete'],
 [{data:[],error:null,count:null},'incomplete'],
 [{data:null,error:null,count:0},'incomplete'],
 [{data:[],error:{code:'42501'},count:0},'denied'],
 [{data:[],error:{code:'network'},count:0},'error'],
])('read completeness is explicit: %j',(result,status)=>expect(overviewReadState(result)).toEqual({status}))

test('Manila date, four real metrics, no private details and no duplicate navigation',()=>{
 const p=props();p.documents=[{id:'a',status:'pending',full_name:'PRIVATE NAME'},{id:'b',status:'approved'}];p.residents=[{verification_status:'pending'},{verification_status:'rejected'}];p.announcements=[{id:'notice'}]
 render(<OperationsOverview {...p}/> )
 expect(value('Pending Document Requests')).toBe('1');expect(value('Pending Resident Verification')).toBe('1');expect(value('Announcements')).toBe('1')
 expect(document.querySelector('time')).toHaveTextContent('Nov 6, 2026')
 expect(screen.queryByText('PRIVATE NAME')).not.toBeInTheDocument()
 expect(screen.queryByText(/Quick Access|Recent Activity/)).not.toBeInTheDocument()
 expect(screen.getAllByRole('article')).toHaveLength(4)
 const attention=within(screen.getByRole('region',{name:'Needs Attention'}))
 const buttons=attention.getAllByRole('button');expect(buttons.map(b=>b.textContent)).toEqual(['Open resident workspace','Open document queue'])
 fireEvent.click(buttons[0]);expect(p.onNavigate).toHaveBeenCalledWith('residents')
 fireEvent.click(buttons[1]);expect(p.onNavigate).toHaveBeenCalledWith('documents')
})

test('ordinary officials get read-only metrics without actionable pending work',()=>{
 render(<OperationsOverview {...props()} isSecretary={false} isKapitan={false} positionLabel="Kagawad" documents={[{status:'pending'}]} residents={[{verification_status:'pending'}]}/> )
 expect(value('Pending Resident Verification')).toBe('1')
 expect(screen.queryByRole('button')).not.toBeInTheDocument()
 expect(screen.getByText('No pending items requiring your attention.')).toBeInTheDocument()
 expect(screen.getByText(/Verification decisions are reserved/)).toBeInTheDocument()
})
test('Punong has resident-review work without Secretary document processing actions',()=>{
 render(<OperationsOverview {...props()} isSecretary={false} isKapitan documents={[{status:'pending'}]} residents={[{verification_status:'pending'}]}/> )
 expect(screen.getByRole('button',{name:'Open resident workspace'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Open document queue'})).not.toBeInTheDocument()
})
test('loading error restricted and incomplete states never appear as zero or empty work',()=>{
 render(<OperationsOverview {...props()} sources={{documents:{status:'loading'},residents:{status:'error'},announcements:{status:'denied'},events:{status:'incomplete'}}}/> )
 expect(value('Pending Document Requests')).toBe('Loading...');expect(value('Pending Resident Verification')).toBe('Unavailable');expect(value('Announcements')).toBe('Restricted');expect(value('Upcoming Events')).toBe('Unavailable')
 expect(screen.queryByText('No pending items requiring your attention.')).not.toBeInTheDocument()
 expect(screen.queryByRole('region',{name:'Document processing'})).not.toBeInTheDocument()
})
test('confirmed empty data shows true zero, empty work and empty service queue',()=>{
 render(<OperationsOverview {...props()}/> )
 expect(value('Pending Document Requests')).toBe('0')
 expect(screen.getByText('No pending items requiring your attention.')).toBeInTheDocument()
 expect(screen.getByText('No document requests in your accessible queue.')).toBeInTheDocument()
})
test('unresolved position does not falsely claim an empty assigned work queue',()=>{
 render(<OperationsOverview {...props()} positionLabel="" isSecretary={false}/> )
 expect(screen.getByText(/assigned work is not yet confirmed/)).toBeInTheDocument()
 expect(screen.queryByText('No pending items requiring your attention.')).not.toBeInTheDocument()
})
test('document distribution uses actual statuses without percentages or record identities',()=>{
 render(<OperationsOverview {...props()} documents={[{status:'approved'},{status:'approved'},{status:'claimed'}]}/> )
 const panel=screen.getByRole('region',{name:'Document processing'})
 expect(panel).toHaveTextContent('3 accessible requests')
 expect(within(panel).getByText('Approved').parentElement).toHaveTextContent('2')
 expect(within(panel).getByText('Claimed').parentElement).toHaveTextContent('1')
 expect(panel).not.toHaveTextContent('%')
 const bars=panel.querySelectorAll('.operations-status-track>span')
 expect(bars[0]).toHaveStyle({width:`${2/3*100}%`})
 expect(bars[1]).toHaveStyle({width:`${1/3*100}%`})
 expect(panel.querySelector('.operations-status-track')).toHaveAttribute('aria-hidden','true')
})
test('distribution bars are omitted for empty or incomplete collections and retain unknown statuses',()=>{
 const p=props();const {container,rerender}=render(<OperationsOverview {...p}/> )
 expect(container.querySelector('.operations-status-track')).toBeNull()
 rerender(<OperationsOverview {...p} documents={[{status:'pending'}]} sources={{...ready,documents:{status:'incomplete'}}}/> )
 expect(container.querySelector('.operations-status-track')).toBeNull()
 rerender(<OperationsOverview {...p} documents={[{status:null}]}/> )
 expect(screen.getByText('Status not recorded')).toBeInTheDocument()
 expect(container.querySelector('.operations-status-track>span')).toHaveStyle({width:'100%'})
})
test('passed availability control retains its handler and accessible label',()=>{
 const onChange=jest.fn()
 render(<OperationsOverview {...props()} availability={<label>Set your availability status<select onChange={onChange} defaultValue="available"><option value="available">Available</option><option value="busy">Busy</option></select></label>}/> )
 fireEvent.change(screen.getByLabelText('Set your availability status'),{target:{value:'busy'}})
 expect(onChange).toHaveBeenCalledTimes(1)
})
test('overview availability retains the real options and owner-only handler while avoiding owner repetition',()=>{
 const source=fs.readFileSync(path.join(process.cwd(),'src/dashboards/OfficialDashboard.jsx'),'utf8')
 const options=source.slice(source.indexOf('const KAPITAN_STATUS_OPTIONS'),source.indexOf('const kapitanStatusDisplay'))
 for(const value of ['available','in-meeting','out-of-office','on-leave']) expect(options).toContain(`value: '${value}'`)
 expect(source).toContain("isKapitan ? 'Your availability' : PUNONG_BARANGAY_LABEL")
 expect(source).toContain('{!isKapitan && <span className="kapitan-compact-name">')
 expect(source).toContain('onChange={(event) => handleUpdateKapitanStatus(event.target.value)}')
 expect(source).toContain("if (!isKapitan) return")
})
test('integration reuses four reads with count metadata, no overview feed or incident request',()=>{
 const source=fs.readFileSync(path.join(process.cwd(),'src/dashboards/OfficialDashboard.jsx'),'utf8')
 expect(source).toContain(".select('*', { count: 'exact' })")
 expect(source).toContain('readOverviewRows')
 expect(source).toContain("if (activeTab === 'activity') fetchActivityLog()")
 const css=fs.readFileSync(path.join(process.cwd(),'src/dashboards/OperationsOverview.css'),'utf8')
 expect(css).toContain('prefers-reduced-motion:reduce')
 expect(css).toContain(':focus-visible')
 expect(css).toContain('min-height:44px')
})
test('read wrapper reports loading then completion and preserves prior module rows on failure',async()=>{
 let sources={};const setSources=update=>{sources=update(sources)};const setRows=jest.fn()
 let resolve
 const request=readOverviewRows('documents',new Promise(done=>{resolve=done}),setRows,setSources)
 expect(sources.documents.status).toBe('loading')
 resolve({data:[],error:null,count:0});await request
 expect(sources.documents.status).toBe('ready');expect(setRows).toHaveBeenCalledWith([])
 setRows.mockClear()
 await readOverviewRows('documents',Promise.resolve({data:null,error:{code:'42501'},count:null}),setRows,setSources)
 expect(sources.documents.status).toBe('denied');expect(setRows).not.toHaveBeenCalled()
 await readOverviewRows('documents',Promise.reject(new Error('offline')),setRows,setSources)
 expect(sources.documents.status).toBe('error');expect(setRows).not.toHaveBeenCalled()
})
