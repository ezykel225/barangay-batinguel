// What a `profiles.role` lookup actually told us. Pure; no Supabase import.
//
// ⚠️ postgrest-js does NOT throw on a network failure. It returns
// `{ data: null, error: { code: '' }, status: 0 }`. Reading `data` alone made a
// dropped connection look exactly like a revoked role, which redirected a signed-in
// official to /login mid-session. So the error is classified before `data` is trusted.
//
//   role         a supported role came back                     -> definitive
//   unsupported  a role came back that no portal serves (nurse) -> definitive
//   missing      no profile row (PGRST116, or no data)         -> definitive
//   auth         the token was refused (401, PGRST30x, JWT)     -> never keep a role
//   transient    no connection, 408, 429 or 5xx                 -> may keep a CONFIRMED role
//   failed       any other error                                -> never keep a role
//
// Keeping a role is only ever a rendering decision. RLS and the SECURITY DEFINER
// predicates still check the live profiles.role on every query.
import { isSupportedRole } from './authRoles'

export const classifyRoleLookup = (result) => {
  const { data, error, status } = result || {}
  if (!error) {
    if (!data) return { kind: 'missing' }
    return isSupportedRole(data.role)
      ? { kind: 'role', role: data.role }
      : { kind: 'unsupported', role: data.role ?? null }
  }
  const code = typeof error.code === 'string' ? error.code : ''
  if (code === 'PGRST116') return { kind: 'missing' }
  if (status === 401 || /^PGRST30/.test(code) || /\bjwt\b/i.test(error.message || '')) return { kind: 'auth' }
  if (!status || status === 408 || status === 429 || status >= 500) return { kind: 'transient' }
  return { kind: 'failed' }
}

// Delays between automatic retries of a lookup that could not reach the database.
// Bounded: after the last one, recovery waits for the browser to come back online,
// for the tab to become visible again, or for the person to press Retry.
export const ROLE_RETRY_DELAYS_MS = Object.freeze([1000, 3000, 9000])
