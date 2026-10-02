// Where somebody is sent back to after signing in.
//
// ─── ⚠️ AN ALLOWLIST, NOT A SANITISER ─────────────────────────────────
//
// The E-Services pages deep-link a signed-out visitor to the login page
// as `/login?next=/resident?tab=documents`, so they land on the service
// they asked for instead of on the homepage. A `next` parameter is a
// redirect somebody else chose, which is the classic open-redirect
// shape: a phishing link reading
// `batinguel.example/login?next=https://evil.example/login` sends a
// resident who has just typed their password to a page that looks like
// this one and is not.
//
// Every open redirect ever shipped was a sanitiser that tried to spot
// the bad values. There is a long list of things that have defeated
// one: `//evil.example` (protocol-relative, no scheme to strip),
// `/\evil.example` (a backslash a browser normalises to a slash),
// `https:/evil.example`, `%2F%2Fevil.example` (decoded after the
// check), `/login/../../evil.example`, a userinfo `@` trick, and a
// unicode character that normalises to a slash.
//
// So this does not inspect the value at all. It compares it, after one
// decode, against a FIXED LIST of paths this application serves, and
// anything that is not exactly one of them becomes the fallback. A
// value that is not on the list cannot be made to pass by any encoding,
// because nothing is being parsed.
//
// ⚠️ It is also NOT authorization. `next` says where to go, never what
// may be seen there: ProtectedRoute still gates the route and RLS still
// decides what loads. A resident sent to `/official` by a crafted link
// would be bounced exactly as if they had typed it -- which is why
// `/official` and `/nurse` are absent from the list anyway: there is no
// public page that would ever link to them.

import { E_SERVICES } from '../constants/eServices'

// The public destinations a visitor can legitimately be returned to,
// plus the services the catalogue defines. Derived from the catalogue
// rather than written out again, so a new service is returnable without
// a second edit -- and so a service REMOVED from the catalogue stops
// being returnable at the same moment it stops being linked.
export const RETURN_TO_PATHS = [
  '/',
  '/e-services',
  '/officials',
  '/health-center',
  '/announcements',
  '/events',
  '/reservation',
  '/track-reservation',
  ...E_SERVICES.map((service) => service.to),
]

const ALLOWED = new Set(RETURN_TO_PATHS)

// One decode, because a link may arrive percent-encoded from an href.
// ⚠️ Exactly one: decoding in a loop until it stops changing is how a
// double-encoded payload gets past a check that ran before the last
// decode. A value that needs two decodes to look safe is not safe.
const decodeOnce = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    // A malformed sequence like '%E0%A4%A' throws. That is not a path
    // this application serves either way.
    return ''
  }
}

export const safeReturnTo = (raw, fallback = '/') => {
  if (typeof raw !== 'string' || raw === '') return fallback
  const candidate = decodeOnce(raw).trim()
  return ALLOWED.has(candidate) ? candidate : fallback
}

// The query string to put on a link to the login page, or '' when the
// destination is not one that can be returned to. Built here so a
// caller cannot hand-roll `?next=` and skip the list.
export const loginHrefFor = (destination) => {
  const safe = safeReturnTo(destination, '')
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login'
}
