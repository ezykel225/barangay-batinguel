// Presentation over an already-fetched authorized collection; no new reads.
const manilaMonth = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' })
export function reportingMonthKey(value) {
  const date = new Date(value)
  if (value == null || value === '' || !Number.isFinite(date.getTime())) return null
  const parts = manilaMonth.formatToParts(date)
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`
}
export function documentReportMonths(rows, now = new Date()) {
  const [year, month] = reportingMonthKey(now).split('-').map(Number)
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 6 + i, 1))
    return { key: date.toISOString().slice(0, 7), label: `${new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date)} ${String(date.getUTCFullYear()).slice(2)}`, documents: 0 }
  })
  rows.forEach(row => { const bucket = buckets.find(b => b.key === reportingMonthKey(row.created_at)); if (bucket) bucket.documents += 1 })
  return buckets
}
export const reportCount = (state, count) => state?.status === 'ready' ? count : state?.status === 'loading' || !state ? 'Loading...' : state.status === 'denied' ? 'Restricted' : 'Unavailable'
export function reportingDateTime(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date) : 'Not recorded'
}
