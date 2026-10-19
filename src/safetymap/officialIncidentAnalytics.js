import { isPlottable, locationKey, plottablePoints, rankHotspots } from './safetyAnalytics'

// Match the existing RPC calendar-date semantics, never the browser's timezone.
export const incidentDay = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const part = key => parts.find(p => p.type === key).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export const filterSafetyIncidents = (incidents, { type = '', from = '', to = '' } = {}) => incidents.filter(row => {
  if (type && row.incident_type !== type) return false
  const day = incidentDay(row.occurred_at)
  return (!from || (day && day >= from)) && (!to || (day && day <= to))
})

const countsBy = (rows, field) => {
  const counts = new Map()
  rows.forEach(row => counts.set(row[field], (counts.get(row[field]) || 0) + 1))
  return [...counts].map(([key,total]) => ({ [field]: key, total })).sort((a,b) => b.total - a.total || String(a[field]).localeCompare(String(b[field])))
}

export function aggregateIncidentLocations(incidents) {
  const groups = new Map()
  incidents.forEach(row => {
    const key = locationKey(row.location_text)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })
  return [...groups].map(([key,rows]) => {
    const mapped = plottablePoints(rows)
    const types = countsBy(rows, 'incident_type')
    const top = types.filter(t => t.total === types[0].total).map(t => t.incident_type).sort().join(' / ')
    return {
      location_key: key, location_label: rows.map(r => r.location_text || '').sort()[0], total: rows.length,
      with_coordinates: mapped.length, top_type: top,
      centroid_latitude: mapped.length ? Number((mapped.reduce((n,r) => n + Number(r.latitude),0) / mapped.length).toFixed(6)) : null,
      centroid_longitude: mapped.length ? Number((mapped.reduce((n,r) => n + Number(r.longitude),0) / mapped.length).toFixed(6)) : null,
    }
  })
}

export function safetyAnalyticsFor(filteredIncidents) {
  const points = filteredIncidents.filter(isPlottable)
  return {
    points,
    byType: countsBy(filteredIncidents, 'incident_type'),
    byStatus: countsBy(filteredIncidents, 'status'),
    monthly: countsBy(filteredIncidents.map(row => ({ month_key: incidentDay(row.occurred_at).slice(0,7) })), 'month_key').filter(row => row.month_key).sort((a,b) => a.month_key.localeCompare(b.month_key)),
    locations: aggregateIncidentLocations(filteredIncidents),
    // A circle counts mapped records only; unmapped records remain in summaries.
    mapHotspots: rankHotspots(aggregateIncidentLocations(points)),
  }
}
