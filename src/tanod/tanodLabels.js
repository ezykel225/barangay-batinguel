// Combined Phase 2 — the Tanod roster and patrol vocabulary. Pure.
//
// ─── ⚠️ A TANOD IS NOT AN ACCOUNT ───────────────────────────────────────────
//
// `tanod_members` is a roster of people the barangay deploys. There is no
// `profile_id` on it, no auth link, no login, no password and no portal.
// `profiles_role_check` still permits exactly official / nurse / resident, and
// nothing in this phase asks it to permit a fourth.
//
// ⚠️ AND THERE IS NO TRACKING. No Tanod carries a coordinate column, no
// position is ever stored for one, and nothing polls a device. The only
// latitude and longitude in this phase belong to an INCIDENT -- a place
// something happened, recorded once by the official writing it down.

const lookup = (map, value, fallback) => (
  Object.prototype.hasOwnProperty.call(map, value) ? map[value] : fallback
)

export const PATROL_TYPES = Object.freeze({
  roving: 'Roving',
  static: 'Static post',
})

export const PATROL_TYPE_KEYS = Object.freeze(Object.keys(PATROL_TYPES))
export const patrolTypeLabel = (value) => lookup(PATROL_TYPES, value, value ?? '')

export const TANOD_STATE = Object.freeze({
  active: 'On the roster',
  inactive: 'Stood down',
})

export const tanodStateLabel = (active) => (active ? TANOD_STATE.active : TANOD_STATE.inactive)

export const TANOD_NO_LOGIN_NOTE = 'Tanod members are a roster the barangay keeps. They do not have system accounts and cannot sign in.'

export const TANOD_NO_TRACKING_NOTE = 'Assignments record who was scheduled where. The system does not track anyone’s location.'

export const TANOD_ERRORS = Object.freeze({
  loadFailed: 'The Tanod roster could not be loaded. Try again in a moment.',
  addFailed: 'That Tanod could not be added.',
  updateFailed: 'That change could not be saved.',
  scheduleFailed: 'That patrol assignment could not be saved.',
  notPermitted: 'The Tanod roster is managed by the barangay records staff.',
  nameRequired: 'Give the Tanod’s name.',
  areaRequired: 'Give the patrol area.',
  dateRequired: 'Give the assignment date.',
})

export const TANOD_RESTRICTED_NOTE = 'The Tanod roster and patrol schedule are managed by the barangay records staff.'

export const PATROL_AREA_HINT = 'Free text. This is matched to incident locations by exact wording only, so write it the same way the location is written.'

export const assignmentWindow = (startTime, endTime) => {
  if (!startTime || !endTime) return 'No time recorded'
  const trim = (value) => String(value).slice(0, 5)
  return `${trim(startTime)} – ${trim(endTime)}`
}

// A date-only column, so the characters are split rather than parsed into a
// `Date` -- `monthGrid.js`'s rule, for the same reason.
export const MONTH_SHORT = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
])

export const assignmentDateLabel = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (!match) return String(value ?? '')
  const monthIndex = Number(match[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) return String(value)
  return `${Number(match[3])} ${MONTH_SHORT[monthIndex]} ${match[1]}`
}
