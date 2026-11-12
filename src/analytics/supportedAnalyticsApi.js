import { supabase } from '../supabase/supabaseClient'

const failure = kind => Object.assign(new Error('Incident analytics are unavailable.'), { kind })
const denied = code => ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)

// Existing 044 Official reader only. Exact counts prevent charting a capped result.
// Marker data keeps its separate, unchanged eight-field privacy projection.
export async function loadSupportedIncidentRecords({ from = '', to = '' } = {}) {
  const records = new Map()
  let received = 0, expected = null, hasAreas = true, hasBlotters = true
  do {
    let result
    try {
      result = await supabase.rpc('incident_queue', {
        p_from: from || null, p_to: to || null, p_type: null,
      }, { count: 'exact' }).order('id', { ascending: true }).range(received, received + 499)
    } catch { throw failure('network') }
    const { data, error, count } = result
    if (error) throw failure(denied(error.code) ? 'denied' : 'source')
    if (!Number.isSafeInteger(count) || count < 0 || count > 10000 ||
      (expected !== null && expected !== count) || !Array.isArray(data)) throw failure('incomplete')
    expected = count
    if ((!data.length && received < expected) || received + data.length > expected) throw failure('incomplete')
    for (const row of data) {
      if (!row.id) throw failure('incomplete')
      hasAreas = hasAreas && Object.prototype.hasOwnProperty.call(row, 'area_note')
      hasBlotters = hasBlotters && Object.prototype.hasOwnProperty.call(row, 'blotter_reference')
      const incident = {
        id: row.id, occurred_at: row.occurred_at, incident_type: row.incident_type,
        status: row.status, location_text: row.location_text, area_note: row.area_note,
        has_blotter: Boolean(String(row.blotter_reference ?? '').trim()),
      }
      const prior = records.get(row.id)
      if (prior) {
        for (const field of ['occurred_at', 'incident_type', 'status', 'location_text', 'area_note']) {
          if (prior[field] !== incident[field]) throw failure('incomplete')
        }
        incident.has_blotter = prior.has_blotter || incident.has_blotter
      }
      records.set(row.id, incident)
    }
    received += data.length
  } while (received < expected)
  return { rows: [...records.values()], hasAreas, hasBlotters }
}
