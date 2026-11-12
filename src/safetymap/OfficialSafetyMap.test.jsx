import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import fs from 'fs'
import path from 'path'
import SafetyMapPanel from './SafetyMapPanel'
import { loadSafetyIncidents,loadCoverageSummary } from './safetyApi'
import { loadSupportedIncidentRecords } from '../analytics/supportedAnalyticsApi'
jest.mock('./safetyApi',()=>({...jest.requireActual('./safetyApi'),loadSafetyIncidents:jest.fn(),loadCoverageSummary:jest.fn()}))
jest.mock('../analytics/supportedAnalyticsApi')
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn(),from:jest.fn()}}))
const rows=[0,1].map(i=>({id:'test-'+i,reference:'INC-TEST-'+i,incident_type:'disturbance',occurred_at:'2026-11-01T02:00:00Z',latitude:i===0?9.3068:null,longitude:i===0?123.3054:null,location_text:'TEST ONLY area',area_note:'TEST ONLY area',status:'recorded',has_blotter:i===0}))
const save=name=>{if(!process.env.STAGE7Q_LAYOUT_DIR)return;fs.mkdirSync(process.env.STAGE7Q_LAYOUT_DIR,{recursive:true});const copy=document.body.cloneNode(true);document.body.querySelectorAll('select').forEach((el,i)=>[...copy.querySelectorAll('select')[i].options].forEach((option,j)=>{option.selected=el.options[j].selected;if(option.selected)option.setAttribute('selected','');else option.removeAttribute('selected')}));fs.writeFileSync(path.join(process.env.STAGE7Q_LAYOUT_DIR,name+'.html'),copy.innerHTML)}
beforeEach(()=>{L.Browser.svg=true;loadSafetyIncidents.mockResolvedValue(rows);loadCoverageSummary.mockResolvedValue([{area_key:'test only area',area_label:'TEST ONLY area',assignment_count:1,tanod_count:1}]);loadSupportedIncidentRecords.mockResolvedValue({rows,hasAreas:true,hasBlotters:true})})
test('keyboard tabs and independent filters retain their data sources, counts and accessible tables',async()=>{
 render(<SafetyMapPanel/>);await screen.findByText(/1 incident plotted/);save('map-populated')
 expect(screen.getByText('Filter scope and data limitations').closest('details')).not.toHaveAttribute('open')
 fireEvent.change(screen.getByLabelText('Filter the map by incident type'),{target:{value:'disturbance'}})
 expect(loadSafetyIncidents).toHaveBeenCalledTimes(1)
 fireEvent.keyDown(screen.getByRole('tab',{name:'Incident Map'}),{key:'ArrowRight'})
 expect(screen.getByRole('tab',{name:'Analytics & Insights'})).toHaveFocus()
 await screen.findByText('Incident records');save('analytics-populated')
 expect(screen.getByLabelText('Incident category')).toHaveValue('')
 fireEvent.click(screen.getByText('How these statistics are calculated'));expect(screen.getByText('How these statistics are calculated').closest('details')).toHaveAttribute('open')
 const details=document.querySelector('.ai-table');details.open=true;expect(details.querySelector('table')).toBeInTheDocument();save('analytics-methodology-table')
 fireEvent.keyDown(screen.getByRole('tab',{name:'Analytics & Insights'}),{key:'ArrowRight'})
 expect(screen.getByRole('tab',{name:'Patrol Coverage'})).toHaveFocus();expect(screen.getByText('Active patrol assignments')).toBeVisible();save('patrol-populated')
 expect(screen.getByText(/not attendance or live patrol locations/)).toBeVisible()
 fireEvent.keyDown(screen.getByRole('tab',{name:'Patrol Coverage'}),{key:'Home'});expect(screen.getByRole('tab',{name:'Incident Map'})).toHaveFocus()
 fireEvent.click(screen.getByRole('button',{name:'Reset filters'}));expect(screen.getByLabelText('Filter the map by incident type')).toHaveValue('')
})
test('map remeasures the canvas on resize and disconnects observer on unmount',async()=>{
 const prior=global.ResizeObserver;let resize;const disconnect=jest.fn(),observe=jest.fn();global.ResizeObserver=class{constructor(cb){resize=cb}observe=observe;disconnect=disconnect}
 const invalidate=jest.spyOn(L.Map.prototype,'invalidateSize')
 try{const {unmount}=render(<SafetyMapPanel/>);await screen.findByText(/1 incident plotted/);expect(observe).toHaveBeenCalledWith(screen.getByRole('application',{name:'Map of recorded incident locations'}));resize();expect(invalidate).toHaveBeenCalledWith({pan:false});unmount();expect(disconnect).toHaveBeenCalledTimes(1)}finally{invalidate.mockRestore();global.ResizeObserver=prior}
})
test('empty states retain truthful map, analytics and patrol disclosures',async()=>{
 loadSafetyIncidents.mockResolvedValue([]);loadCoverageSummary.mockResolvedValue([]);loadSupportedIncidentRecords.mockResolvedValue({rows:[],hasAreas:true,hasBlotters:true})
 render(<SafetyMapPanel/>);await screen.findByText(/No recorded incidents match/);save('map-empty')
 fireEvent.click(screen.getByRole('tab',{name:'Analytics & Insights'}));await screen.findByText('No incidents were recorded for this selection.');save('analytics-empty')
 fireEvent.click(screen.getByRole('tab',{name:'Patrol Coverage'}));expect(screen.getByText(/No location has more than one/)).toBeVisible();save('patrol-empty')
})
test('load and error states never substitute invented map or analytics totals',async()=>{
 loadSafetyIncidents.mockReturnValue(new Promise(()=>{}));loadCoverageSummary.mockReturnValue(new Promise(()=>{}));loadSupportedIncidentRecords.mockReturnValue(new Promise(()=>{}))
 const {unmount}=render(<SafetyMapPanel/>);save('map-loading');fireEvent.click(screen.getByRole('tab',{name:'Patrol Coverage'}));save('patrol-loading');fireEvent.click(screen.getByRole('tab',{name:'Analytics & Insights'}));save('analytics-loading');unmount()
 loadSafetyIncidents.mockRejectedValue(new Error('Unit denied'));loadCoverageSummary.mockRejectedValue(new Error('Unit denied'));loadSupportedIncidentRecords.mockRejectedValue({kind:'denied'})
 render(<SafetyMapPanel/>);await screen.findByText('Incident map data is unavailable.');save('map-error');fireEvent.click(screen.getByRole('tab',{name:'Patrol Coverage'}));expect(screen.getByText('Patrol comparisons are unavailable.')).toBeVisible();save('patrol-error');fireEvent.click(screen.getByRole('tab',{name:'Analytics & Insights'}));await waitFor(()=>expect(screen.getByText(/Incident analytics are not available for your account/)).toBeVisible());save('analytics-error')
})
