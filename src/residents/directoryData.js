import { matchesResidentPurok } from './residentPresentation'
export const emptyResident = () => ({ first_name: '', middle_name: '', last_name: '', suffix: '', birth_date: '', mobile_number: '', purok: '', resident_status: 'active' })
export const residentName = r => [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' ')
export const validMobile = value => !value || /^(09\d{9}|\+639\d{9}|639\d{9})$/.test(value.replace(/[\s()-]/g, ''))
export const filterResidents = (rows, search, status, purok) => rows.filter(r =>
  (!status || r.resident_status === status) && matchesResidentPurok(r.purok, purok) &&
  [residentName(r), r.mobile_number, r.purok].some(v => String(v || '').toLowerCase().includes(search.trim().toLowerCase())))
export const residentPayload = r => ({ p_id: r.id || null, ...Object.fromEntries(Object.keys(emptyResident()).map(k => [`p_${k}`, r[k] || null])) })
