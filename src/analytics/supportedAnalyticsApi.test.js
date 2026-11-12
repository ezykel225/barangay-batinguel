import { supabase } from '../supabase/supabaseClient'
import { loadSupportedIncidentRecords } from './supportedAnalyticsApi'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))
const row=(id,extra={})=>({id,occurred_at:'2026-11-01T00:00:00Z',incident_type:'disturbance',status:'recorded',area_note:'',location_text:'Unit area',blotter_reference:null,...extra})
const install=pages=>{const range=jest.fn();pages.forEach(page=>range.mockResolvedValueOnce(page));const order=jest.fn(()=>({range}));supabase.rpc.mockReturnValue({order});return{order,range}}
beforeEach(()=>jest.resetAllMocks())

test('paginates the existing queue and projects no narrative, coordinates or actor identity',async()=>{
 const {range,order}=install([{data:[row('a',{narrative:'PRIVATE',recorded_by_name:'PRIVATE',created_at:'1999-01-01',latitude:9})],count:2,error:null},{data:[row('b')],count:2,error:null}])
 const result=await loadSupportedIncidentRecords({from:'2026-11-01',to:'2026-11-02'})
 expect(supabase.rpc).toHaveBeenCalledWith('incident_queue',{p_from:'2026-11-01',p_to:'2026-11-02',p_type:null},{count:'exact'})
 expect(order).toHaveBeenCalledWith('id',{ascending:true})
 expect(range.mock.calls).toEqual([[0,499],[1,500]])
 expect(result.rows).toHaveLength(2)
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|latitude|created_at/)
})
test('duplicate joins count one incident and preserve presence of any blotter link',async()=>{
 install([{data:[row('a'),row('a',{blotter_reference:'UNIT-BLOTTER'})],count:2,error:null}])
 const result=await loadSupportedIncidentRecords()
 expect(result.rows).toHaveLength(1);expect(result.rows[0].has_blotter).toBe(true)
})
test.each([
 [{data:[row('a')],error:null}],
 [{data:[],count:1,error:null}],
 [{data:[],count:10001,error:null}],
 [{data:[row('a'),row('a',{status:'resolved'})],count:2,error:null}],
 [{data:[row('a')],count:2,error:null},{data:[row('b')],count:3,error:null}],
])('rejects unknown, incomplete, excessive or changing input instead of charting partial totals',async(...pages)=>{
 install(pages);await expect(loadSupportedIncidentRecords()).rejects.toMatchObject({kind:'incomplete'})
})
test('permission failure remains distinct and no private error detail is returned',async()=>{
 install([{data:null,count:null,error:{code:'42501',message:'PRIVATE'}}])
 await expect(loadSupportedIncidentRecords()).rejects.toMatchObject({kind:'denied',message:'Incident analytics are unavailable.'})
})
test('missing metadata is explicitly reported as unavailable, not inferred from coordinates',async()=>{
 const r=row('a');delete r.area_note;delete r.blotter_reference
 install([{data:[r],count:1,error:null}]);expect(await loadSupportedIncidentRecords()).toMatchObject({hasAreas:false,hasBlotters:false})
})
