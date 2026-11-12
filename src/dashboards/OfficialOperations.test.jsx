import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import IncidentsPanel from '../incidents/IncidentsPanel'
import TanodPanel from '../tanod/TanodPanel'
import * as incidents from '../incidents/incidentApi'
import * as tanods from '../tanod/tanodApi'
import * as portal from '../tanod/tanodPortalApi'
import { dutyDate } from '../tanod/tanodDuty'
jest.mock('../incidents/incidentApi')
jest.mock('../tanod/tanodApi')
jest.mock('../tanod/tanodPortalApi')
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn(),from:jest.fn()}}))
const save=name=>{if(!process.env.STAGE7P_LAYOUT_DIR)return;fs.mkdirSync(process.env.STAGE7P_LAYOUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.STAGE7P_LAYOUT_DIR,name+'.html'),document.body.innerHTML)}
const queue=Array.from({length:11},(_,i)=>({id:'test-'+i,reference:'INC-TEST-'+i,incident_type:'traffic_accident',occurred_at:'2026-11-06T02:00:00Z',location_text:'TEST ONLY fictional junction',status:'recorded',has_coordinates:i===0,blotter_reference:i===0?'BLT-TEST-ONLY':null}))
beforeEach(()=>{
 incidents.loadIncidentQueue.mockResolvedValue(queue);incidents.incidentMessage.mockReturnValue('Test load failed')
 tanods.loadTanodRoster.mockResolvedValue([{id:'t-test',full_name:'TEST ONLY Tanod',active:true,area_note:'Fictional patrol area',assignment_count:1}])
 tanods.loadTanodAssignments.mockResolvedValue([{id:'a-test',tanod_id:'t-test',tanod_name:'TEST ONLY Tanod',active:true,assignment_date:dutyDate(),start_time:'06:00:00',end_time:'14:00:00',area_label:'TEST ONLY area',patrol_type:'roving'}])
 portal.loadAccountStates.mockResolvedValue([{tanod_id:'t-test',profile_id:'test-profile'}])
})
test('incident summaries, pagination, filter reset and record dialog preserve existing behavior',async()=>{
 render(<IncidentsPanel canAdminister={false} confirm={jest.fn()}/>);await screen.findByText('INC-TEST-0');save('incidents')
 expect(screen.getByLabelText('Current incident results')).toHaveTextContent('Total incidents11Mapped incidents1Without coordinates10Linked blotter records1')
 fireEvent.click(screen.getByRole('button',{name:'Next page'}));expect(screen.getByText('INC-TEST-10')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Filter by incident type'),{target:{value:'traffic_accident'}})
 await waitFor(()=>expect(incidents.loadIncidentQueue).toHaveBeenLastCalledWith({type:'traffic_accident',from:'',to:''}))
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));await waitFor(()=>expect(incidents.loadIncidentQueue).toHaveBeenLastCalledWith({type:'',from:'',to:''}))
 fireEvent.click(screen.getByRole('button',{name:'Record Incident'}));expect(screen.getByRole('dialog')).toBeInTheDocument();save('incident-form')
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(incidents.recordIncident).not.toHaveBeenCalled()
})
test('Tanod tabs, calendar/list, add and management remain interactive without writes',async()=>{
 render(<TanodPanel canAdminister/>);await screen.findByText('TEST ONLY Tanod');save('roster')
 expect(screen.getByLabelText('Tanod operations summary')).toHaveTextContent('Total Tanods1Accounts Linked1Scheduled Today1Shift Coverage1 shifts today')
 fireEvent.click(screen.getByRole('button',{name:'Manage TEST ONLY Tanod'}));expect(screen.getByRole('dialog')).toBeInTheDocument();save('tanod-manage');fireEvent.keyDown(document,{key:'Escape'})
 fireEvent.click(screen.getByRole('button',{name:'Add Tanod',exact:true}));expect(screen.getByLabelText('Name')).toBeRequired();save('tanod-add')
 fireEvent.click(screen.getByRole('button',{name:'Patrol Schedule',exact:true}));expect(screen.getByRole('button',{name:'Patrol Schedule',exact:true})).toHaveAttribute('aria-pressed','true');save('schedule-calendar')
 fireEvent.click(screen.getByRole('button',{name:'List',exact:true}));expect(screen.getByLabelText('Schedule month')).toBeInTheDocument();save('schedule-list')
 fireEvent.click(screen.getByRole('button',{name:'Schedule Patrol',exact:true}));expect(screen.getByLabelText('Patrol area')).toBeRequired();save('schedule-form')
 expect(tanods.addTanodMember).not.toHaveBeenCalled();expect(tanods.scheduleAssignment).not.toHaveBeenCalled()
})
test('read-only Tanod view does not gain roster, account or assignment actions',async()=>{
 render(<TanodPanel/>);await screen.findByText('TEST ONLY Tanod');save('roster-readonly')
 expect(portal.loadAccountStates).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:/Manage TEST/})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Add Tanod'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Patrol Schedule',exact:true}));expect(screen.queryByRole('button',{name:'Schedule Patrol'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Cancel assignment/})).not.toBeInTheDocument()
})
