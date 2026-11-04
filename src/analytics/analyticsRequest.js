// Pure request rules for Analytics & Insights. No Supabase import, so they are
// unit-tested without the client.

// PostgreSQL's insufficient_privilege. The analytics functions raise it for a
// caller who may not read a section; the screen reads it as a restriction,
// never as an outage.
export const ACCESS_DENIED = '42501'

export const isAccessDenied = (error) => error?.code === ACCESS_DENIED

// A custom range needs at least one date, and an end on or after its start.
// The database refuses both cases ('Invalid analytics range'); checking first
// means the request is never sent and the reader is told what is missing.
export const customRangeProblem = ({ window, from, to } = {}) => {
  if (window !== 'custom') return ''
  if (!from && !to) return 'Choose a start date, an end date, or both to apply a custom range.'
  if (from && to && from > to) return 'The start date must be on or before the end date.'
  return ''
}

// Leaving the custom range clears its dates, so a preset window is never sent
// with leftover dates that the request would treat as a custom range.
export const nextFilters = (current, key, value) => {
  const next = { ...current, [key]: value }
  if (key === 'window' && value !== 'custom') {
    next.from = ''
    next.to = ''
  }
  return next
}
