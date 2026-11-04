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

// Which honest state a failed analytics request is in. Never the raw error.
//   denied         42501 -- this account may not read the section.
//   not_installed  the function does not exist yet (PostgREST PGRST202, or
//                  PostgreSQL 42883): migration 062 is not applied.
//   network        the request never reached the database.
//   failed         anything else.
export const NOT_INSTALLED_CODES = Object.freeze(['PGRST202', '42883'])
export const analyticsProblem = (error) => {
  if (isAccessDenied(error)) return 'denied'
  if (NOT_INSTALLED_CODES.includes(error?.code)) return 'not_installed'
  if (error?.network) return 'network'
  return 'failed'
}
export const PROBLEM_MESSAGES = Object.freeze({
  denied: 'This section is not available for this account.',
  not_installed: 'This section needs the analytics database update (migration 062), which is not installed yet.',
  network: 'The analytics service could not be reached. Check the connection and try again.',
  failed: 'This section is unavailable right now. Try again.',
})
