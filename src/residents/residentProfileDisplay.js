import { MONTH_NAMES, parseDateKey } from '../utils/monthGrid'
// Presentation only: calendar dates never pass through timezone conversion.
export const residentBirthDateLabel = value => {
  if (!value) return 'Not recorded'
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : null
  return date ? `${MONTH_NAMES[date.month]} ${date.day}, ${date.year}` : String(value)
}
export const residentMobileLabel = value => {
  if (value == null || !String(value).trim()) return 'Not recorded'
  const raw = String(value)
  const compact = raw.replace(/[\s()-]/g, '')
  if (/^09\d{9}$/.test(compact)) return `${compact.slice(0,4)} ${compact.slice(4,7)} ${compact.slice(7)}`
  const international = /^(\+?63)(9\d{2})(\d{3})(\d{4})$/.exec(compact)
  return international ? `${international[1]} ${international[2]} ${international[3]} ${international[4]}` : raw
}
