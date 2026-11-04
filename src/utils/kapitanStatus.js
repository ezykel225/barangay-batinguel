// A fresh database may have no published availability row. Duplicate rows and
// permission/schema errors must still reach the caller as errors.
export const readKapitanStatus = client => client
  .from('kapitan_status')
  .select('status')
  .maybeSingle()
