// An unpublished optional row is legitimate; duplicate rows and backend errors
// remain errors for the caller to surface.
export const readKapitanStatus = client => client
  .from('kapitan_status')
  .select('status')
  .maybeSingle()
