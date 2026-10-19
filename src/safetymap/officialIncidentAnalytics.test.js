import { aggregateIncidentLocations, filterSafetyIncidents, incidentDay, safetyAnalyticsFor } from './officialIncidentAnalytics'
import { bandFor } from './safetyAnalytics'
import { loadSafetyIncidents } from './safetyApi'
import { supabase } from '../supabase/supabaseClient'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { rpc: jest.fn() } }))
const point = (id, occurred_at, type = 'traffic_accident', location_text = 'Area A') => ({ id, reference: id, occurred_at, incident_type: type, status: 'recorded', location_text, latitude: 9.3, longitude: 123.3 })
const rows = [point('before','2026-10-19T15:59:59.999Z'),point('start','2026-10-19T16:00:00Z'),point('end','2026-10-20T15:59:59.999Z'),point('after','2026-10-20T16:00:00Z','disturbance')]

test('calendar filtering uses Manila, including inclusive end-of-day boundaries', () => {
  expect(incidentDay(rows[1].occurred_at)).toBe('2026-10-20')
  expect(filterSafetyIncidents(rows,{from:'2026-10-20',to:'2026-10-20'}).map(r=>r.id)).toEqual(['start','end'])
  expect(filterSafetyIncidents(rows,{from:'2026-10-20'})).toHaveLength(3)
  expect(filterSafetyIncidents(rows,{to:'2026-10-20'})).toHaveLength(3)
  expect(filterSafetyIncidents(rows,{type:'disturbance',from:'2026-10-20',to:'2026-10-20'})).toHaveLength(0)
  expect(filterSafetyIncidents(rows,{from:'2026-10-21',to:'2026-10-19'})).toEqual([])
})
test('removing either date recomputes the same dataset without retaining a prior bound', () => {
  expect(filterSafetyIncidents(rows,{from:'2026-10-20',to:'2026-10-20'})).toHaveLength(2)
  expect(filterSafetyIncidents(rows,{to:'2026-10-20'}).map(r=>r.id)).toEqual(['before','start','end'])
  expect(filterSafetyIncidents(rows,{from:'2026-10-20'}).map(r=>r.id)).toEqual(['start','end','after'])
  expect(filterSafetyIncidents(rows,{})).toHaveLength(4)
})
test('location grouping, tied types, centroids and bands use only the supplied filtered records', () => {
  const records = [point('a','2026-10-20T00:00Z'),point('b','2026-10-20T01:00Z','disturbance','  AREA   A '),{...point('c','2026-10-20T02:00Z'),latitude:9.4,longitude:123.4},point('d','2026-10-20T03:00Z','disturbance','Area B'),point('e','2026-10-20T04:00Z','disturbance','Area B')]
  const full = safetyAnalyticsFor(records)
  expect(full.mapHotspots).toHaveLength(2)
  expect(full.mapHotspots[0]).toMatchObject({total:3,centroid_latitude:9.333333})
  expect(bandFor(2,3).label).toBe('More recorded')
  const filtered = safetyAnalyticsFor(filterSafetyIncidents(records,{type:'disturbance'}))
  expect(filtered.mapHotspots).toHaveLength(1)
  expect(filtered.mapHotspots[0]).toMatchObject({location_label:'Area B',total:2})
  expect(bandFor(2,2).label).toBe('Most recorded')
  const tie = aggregateIncidentLocations([point('a','2026-10-20T00:00Z'),point('b','2026-10-20T00:00Z','disturbance')])[0]
  expect(tie.top_type).toBe('disturbance / traffic_accident')
})
test('no-coordinate records affect summaries but never centroids, map totals or hotspot eligibility', () => {
  const records = [point('mapped','2026-10-20T00:00Z'),{...point('unmapped','2026-10-20T00:00Z'),latitude:null,longitude:null}]
  const result = safetyAnalyticsFor(records)
  expect(result.locations[0]).toMatchObject({total:2,with_coordinates:1,centroid_latitude:9.3})
  expect(result.points).toHaveLength(1)
  expect(result.mapHotspots).toEqual([])
})
test('existing authorized readers are joined by UUID and projected to the original eight map fields', async () => {
  const mapped = point('mapped','2026-10-20T00:00Z')
  const unmapped = {...point('unmapped','2026-10-20T00:00Z'),latitude:null,longitude:null}
  supabase.rpc.mockImplementation(async name => ({data:name==='incident_map_points'?[mapped]:[mapped,unmapped].map(r=>({...r,latitude:undefined,longitude:undefined,recorded_by_name:'PRIVATE',area_note:'PRIVATE',blotter_reference:'PRIVATE'})),error:null}))
  const result = await loadSafetyIncidents()
  expect(result).toHaveLength(2)
  expect(result[0].latitude).toBe(9.3)
  expect(result[1].latitude).toBeNull()
  expect(Object.keys(result[0]).sort()).toEqual(['id','reference','incident_type','occurred_at','location_text','status','latitude','longitude'].sort())
  expect(JSON.stringify(result)).not.toContain('PRIVATE')
  expect(supabase.rpc).toHaveBeenCalledWith('incident_queue',{p_from:null,p_to:null,p_type:null})
})
test('a failed authorized reader rejects rather than displaying incomplete counts', async () => {
  const warn = jest.spyOn(console,'warn').mockImplementation(()=>{})
  supabase.rpc.mockResolvedValue({data:null,error:{code:'42501'}})
  await expect(loadSafetyIncidents()).rejects.toThrow('loadFailed')
  warn.mockRestore()
})
