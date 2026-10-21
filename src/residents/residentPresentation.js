// Display/filter normalization only. Never rewrites source purok values.
import { purokShortLabel } from '../utils/residentGroups'
export const purokLabel = value => {
  const raw = purokShortLabel(value)
  return /^\d+$/.test(raw) ? `Purok ${raw}` : raw
}
export const purokKey = value => purokLabel(value).trim().replace(/\s+/g,' ').toLowerCase()
export const matchesResidentPurok = (value, selected) => !selected || purokKey(value) === purokKey(selected)
export const residentPurokOptions = rows => {
  const labels = new Map()
  rows.forEach(row => { const label=purokLabel(row.purok); const key=purokKey(row.purok); if(key && !labels.has(key)) labels.set(key,label) })
  return [...labels].map(([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}))
}
export const directorySummary = rows => [
  ['Total Residents',rows.length],
  ['Active Residents',rows.filter(r=>r.resident_status==='active').length],
  ['With Mobile Number',rows.filter(r=>String(r.mobile_number||'').trim()).length],
  ['Linked Online Accounts',rows.filter(r=>r.profile_id).length],
]
