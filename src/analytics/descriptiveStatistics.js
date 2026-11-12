// Pure summaries of displayed count buckets. No queries, identity inference or rates.
export function describeCounts(rows) {
  if (!Array.isArray(rows)) return { status: 'unavailable' }
  const valid = rows.every(row => row &&
    (typeof row.total === 'number' || (typeof row.total === 'string' && /^\d+$/.test(row.total))) &&
    Number.isSafeInteger(Number(row.total)) && Number(row.total) >= 0)
  if (!valid) return { status: 'unavailable' }
  const values = rows.map(row => Number(row.total))
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(total)) return { status: 'unavailable' }
  if (!rows.length || total === 0) return { status: 'empty', total, buckets: rows.length }
  const sorted = [...values].sort((a, b) => a - b)
  const maximum = sorted[sorted.length - 1]
  const middle = Math.floor(sorted.length / 2)
  return {
    status: 'ready', total, buckets: rows.length, minimum: sorted[0], maximum,
    mean: total / rows.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    leaders: rows.filter(row => Number(row.total) === maximum).map(row => String(row.label || 'Not recorded')),
    share: maximum / total * 100,
    first: values[0], last: values[values.length - 1],
  }
}
