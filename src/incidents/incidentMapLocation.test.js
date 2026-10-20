import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import L from 'leaflet'
import IncidentsPanel from './IncidentsPanel'
import IncidentLocationPicker from './IncidentLocationPicker'
import { setIncidentMapLocation, incidentMessage } from './incidentApi'
import { supabase } from '../supabase/supabaseClient'

jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))
jest.mock('../casesupport/IncidentKpLink',()=>()=>null)
jest.mock('../tanod/OfficialTanodNotes',()=>()=>null)
jest.mock('leaflet',()=>({__esModule:true,default:{map:jest.fn(),tileLayer:jest.fn(),circleMarker:jest.fn()}}))
let map, events, current, originalGeo
const base={id:'existing-id',reference:'INC-ORIGINAL',incident_type:'other',occurred_at:'2026-10-20T02:00:00Z',location_text:'Existing area',status:'recorded',source:'official_report',blotter_reference:'BLT-ORIGINAL',narrative:'Original narrative',blotter_summary:'Original snapshot',latitude:null,longitude:null}
beforeEach(()=>{
 current={...base};events={}
 map={setView:jest.fn(),on:jest.fn(),getCenter:jest.fn(),invalidateSize:jest.fn(),remove:jest.fn()}
 map.setView.mockReturnValue(map);map.on.mockImplementation((name,fn)=>{events[name]=fn;return map});map.getCenter.mockReturnValue({lat:9.301,lng:123.302})
 L.map.mockReturnValue(map);L.tileLayer.mockReturnValue({addTo:jest.fn()});L.circleMarker.mockReturnValue({addTo:jest.fn().mockReturnValue({remove:jest.fn()})})
 originalGeo=navigator.geolocation;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:jest.fn()}})
 supabase.rpc.mockImplementation(async(name,args)=>{
  if(name==='incident_queue')return{data:[{...current,has_coordinates:current.latitude!==null}],error:null}
  if(name==='incident_detail')return{data:[{...current}],error:null}
  if(name==='set_incident_map_location'){current={...current,latitude:args.p_latitude,longitude:args.p_longitude};return{data:[{latitude:current.latitude,longitude:current.longitude}],error:null}}
  return{data:[],error:null}
 })
})
afterEach(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:originalGeo}))
const opens=async(admin=true)=>{
 render(<IncidentsPanel canAdminister={admin} confirm={async()=>false}/>);await userEvent.click(await screen.findByRole('button',{name:'View incident INC-ORIGINAL'}));return screen.findByRole('dialog',{name:'Incident Details'})
}
const writes=()=>supabase.rpc.mock.calls.filter(([name])=>name==='set_incident_map_location')

test('authorized add selects manually and saves same incident once; detail, row, summary refresh',async()=>{
 const dialog=await opens()
 await userEvent.click(within(dialog).getByRole('button',{name:'Add map location'}))
 expect(within(dialog).getByRole('button',{name:'Save map location'})).toBeDisabled()
 expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
 fireEvent.click(within(dialog).getByRole('button',{name:'Select map center'}))
 expect(screen.getByText(/Selected location:/)).toHaveTextContent('9.301000, 123.302000')
 const save=screen.getByRole('button',{name:'Save map location'});fireEvent.click(save);fireEvent.click(save)
 await screen.findByRole('button',{name:'Edit map location'})
 expect(writes()).toEqual([['set_incident_map_location',{p_incident_id:'existing-id',p_latitude:9.301,p_longitude:123.302}]])
 expect(within(dialog).getByText('9.301, 123.302')).toBeVisible()
 expect(within(screen.getByRole('table')).getByText('Mapped location')).toBeVisible()
 expect(screen.getByText('Mapped incidents').parentElement).toHaveTextContent('1')
 expect(screen.getByText('Without coordinates').parentElement).toHaveTextContent('0')
 expect(screen.getByRole('dialog')).toBe(dialog)
 expect(within(dialog).getByText('Original narrative')).toBeVisible()
})
test('unauthorized viewer has no Add or Edit control for either coordinate state',async()=>{
 const {unmount}=render(<IncidentsPanel canAdminister={false}/>);await userEvent.click(await screen.findByRole('button',{name:'View incident INC-ORIGINAL'}));expect(screen.queryByRole('button',{name:/map location/i})).not.toBeInTheDocument();unmount()
 current={...base,latitude:9.3,longitude:123.3};await opens(false);expect(screen.getByText('Map location recorded')).toBeVisible();expect(screen.queryByRole('button',{name:/map location/i})).not.toBeInTheDocument()
})
test('existing position initializes editor; clicking map updates selection; Cancel preserves data and returns focus',async()=>{
 current={...base,latitude:9.3,longitude:123.3};await opens();await userEvent.click(screen.getByRole('button',{name:'Edit map location'}))
 expect(map.setView).toHaveBeenCalledWith([9.3,123.3],16)
 expect(screen.getByText(/Selected location:/)).toHaveTextContent('9.300000, 123.300000')
 fireEvent.click(screen.getByRole('button',{name:'Select map center'}))
 await userEvent.click(screen.getByRole('button',{name:'Cancel'}))
 expect(writes()).toHaveLength(0);expect(current.latitude).toBe(9.3)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Edit map location'})).toHaveFocus())
})
test('optional GPS and deliberate map click select without saving',async()=>{
 const onSave=jest.fn();render(<IncidentLocationPicker onSave={onSave} onCancel={()=>{}}/> )
 expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Use current location'}))
 const success=navigator.geolocation.getCurrentPosition.mock.calls[0][0]
 await waitFor(()=>expect(success).toBeDefined())
 // Simulate browser callback via the existing one-shot DeviceLocation component.
 const {act}=require('@testing-library/react')
 act(()=>success({coords:{latitude:9.32,longitude:123.32}}))
 expect(screen.getByText(/Selected location:/)).toHaveTextContent('9.320000, 123.320000');expect(onSave).not.toHaveBeenCalled()
 act(()=>events.click({latlng:{lat:9.33,lng:123.33}}))
 expect(screen.getByText(/Selected location:/)).toHaveTextContent('9.330000, 123.330000')
 fireEvent.click(screen.getByRole('button',{name:'Save map location'}));expect(onSave).toHaveBeenCalledWith({latitude:9.33,longitude:123.33})
})
test('pending save disables repeat submits; failure retains editor and selected location',async()=>{
 const original=supabase.rpc.getMockImplementation();let reject
 supabase.rpc.mockImplementation((name,args)=>name==='set_incident_map_location'?new Promise((_,r)=>{reject=r}):original(name,args))
 await opens();await userEvent.click(screen.getByRole('button',{name:'Add map location'}));fireEvent.click(screen.getByRole('button',{name:'Select map center'}));fireEvent.click(screen.getByRole('button',{name:'Save map location'}))
 expect(screen.getByRole('button',{name:'Saving map location...'})).toBeDisabled()
 expect(writes()).toHaveLength(1)
 const {act}=require('@testing-library/react');await act(async()=>reject(new Error('network failed')))
 expect(screen.getByRole('alert')).toHaveTextContent('The map location could not be saved.')
 expect(screen.getByRole('button',{name:'Save map location'})).toBeEnabled()
 expect(screen.getByRole('region',{name:'Choose incident map location'})).toBeVisible()
})
test('editor remains inside existing focus trap; Escape restores reference focus and scroll',async()=>{
 await opens();await userEvent.click(screen.getByRole('button',{name:'Add map location'}));expect(document.body.style.overflow).toBe('hidden')
 screen.getByRole('button',{name:'Close incident details'}).focus();await userEvent.tab({shift:true});expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
 await userEvent.keyboard('{Escape}');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'View incident INC-ORIGINAL'})).toHaveFocus();expect(document.body.style.overflow).not.toBe('hidden')
})
test('API normalizes numeric strings and returns narrow RPC result',async()=>{
 const result=await setIncidentMapLocation({incidentId:'existing-id',latitude:'9.31',longitude:'123.31'})
 expect(writes()[0][1]).toEqual({p_incident_id:'existing-id',p_latitude:9.31,p_longitude:123.31});expect(result).toEqual({latitude:9.31,longitude:123.31})
})
test.each([[null,123],['',123],[91,123],[9,181],[NaN,123]])('API rejects invalid coordinates %s %s',async(latitude,longitude)=>{
 await expect(setIncidentMapLocation({incidentId:'existing-id',latitude,longitude})).rejects.toThrow('mapLocationInvalid');expect(writes()).toHaveLength(0)
})
test('API maps server authorization error to existing neutral wording',async()=>{
 supabase.rpc.mockResolvedValue({data:null,error:{message:'Only the Barangay Secretary or the Punong Barangay can change an incident map location.'}})
 try{await setIncidentMapLocation({incidentId:'existing-id',latitude:9,longitude:123})}catch(e){expect(incidentMessage(e,'mapLocationFailed')).toBe('Changing an incident record is handled by the barangay records staff.')}
})

test('saving preserves active query filters and valid pagination', async()=>{
 const original=supabase.rpc.getMockImplementation()
 const records=Array.from({length:11},(_,i)=>({...base,id:i===10?'existing-id':`row-${i}`,reference:i===10?'INC-ORIGINAL':`INC-ROW-${i}`,has_coordinates:current.latitude!==null}))
 supabase.rpc.mockImplementation((name,args)=>name==='incident_queue'?Promise.resolve({data:records.map(r=>({...r,has_coordinates:r.id==='existing-id'&&current.latitude!==null})),error:null}):original(name,args))
 render(<IncidentsPanel canAdminister confirm={async()=>false}/> )
 await screen.findByText('Page 1 of 2')
 await userEvent.selectOptions(screen.getByLabelText('Filter by incident type'),'other')
 await userEvent.type(screen.getByLabelText('Incidents from'),'2026-10-20')
 await screen.findByText('Page 1 of 2')
 await userEvent.click(screen.getByRole('button',{name:'Next page'}))
 await userEvent.click(screen.getByRole('button',{name:'View incident INC-ORIGINAL'}))
 await screen.findByRole('dialog',{name:'Incident Details'})
 await userEvent.click(screen.getByRole('button',{name:'Add map location'}));fireEvent.click(screen.getByRole('button',{name:'Select map center'}));await userEvent.click(screen.getByRole('button',{name:'Save map location'}))
 await screen.findByRole('button',{name:'Edit map location'})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Edit map location'})).toHaveFocus())
 expect(screen.getByText('Page 2 of 2')).toBeVisible()
 expect(supabase.rpc.mock.calls.filter(([n])=>n==='incident_queue').slice(-1)[0][1]).toEqual({p_type:'other',p_from:'2026-10-20',p_to:null})
})
