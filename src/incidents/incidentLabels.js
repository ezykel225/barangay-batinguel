// Combined Phase 2 — the words an official reads on the incident and blotter
// surfaces. Pure: no Supabase import, no fetching, no component.
//
// ─── ⚠️ THESE ARE OPERATIONAL CATEGORIES, NOT OFFENCE CLASSIFICATIONS ───────
//
// `incident_type` records what KIND of thing the barangay was called about so
// it can see what happens where. It is not a crime code, it assigns no fault,
// and nothing anywhere reads it to decide an outcome. The labels are
// deliberately plain -- "Physical altercation", not "Assault"; "Theft or
// property loss", not "Robbery" -- because the second word in each pair is a
// legal conclusion a barangay record cannot make on its own.
//
// `INCIDENT_TYPE_DISCLAIMER` is rendered wherever the list is offered, and a
// test scans every label for offence, penalty and fault vocabulary.

const lookup = (map, value, fallback) => (
  Object.prototype.hasOwnProperty.call(map, value) ? map[value] : fallback
)

export const INCIDENT_TYPES = Object.freeze({
  traffic_accident: 'Traffic accident',
  disturbance: 'Disturbance',
  physical_altercation: 'Physical altercation',
  theft_property: 'Theft or property loss',
  threat: 'Threat',
  public_safety_hazard: 'Public safety hazard',
  other: 'Other',
})

export const INCIDENT_TYPE_KEYS = Object.freeze(Object.keys(INCIDENT_TYPES))

// ⚠️ An unrecognised value comes back EXACTLY AS STORED rather than blank or
// guessed. A category nobody anticipated must stay visible on a record screen,
// which is the rule the Activity Log already follows.
export const incidentTypeLabel = (value) => lookup(INCIDENT_TYPES, value, value ?? '')

export const INCIDENT_TYPE_DISCLAIMER = 'These categories describe what the barangay was called about. They are not offence classifications and they assign no fault.'

export const INCIDENT_STATUSES = Object.freeze({
  recorded: 'Recorded',
  responding: 'Being attended to',
  resolved: 'Resolved',
  referred: 'Referred',
  closed: 'Closed',
})

export const INCIDENT_STATUS_KEYS = Object.freeze(Object.keys(INCIDENT_STATUSES))
export const incidentStatusLabel = (value) => lookup(INCIDENT_STATUSES, value, value ?? '')

export const INCIDENT_STATUS_NOTES = Object.freeze({
  recorded: 'Written into the blotter. Nothing has been decided yet.',
  responding: 'The barangay is attending to this.',
  resolved: 'The barangay considers this dealt with.',
  referred: 'Passed to another office or authority.',
  closed: 'Closed without further barangay action.',
})

export const incidentStatusNote = (value) => lookup(INCIDENT_STATUS_NOTES, value, '')

export const INCIDENT_SOURCES = Object.freeze({
  official_report: 'Recorded by an official',
  resident_walk_in: 'Reported by a resident at the hall',
  tanod_report: 'Reported by a Tanod',
  other: 'Other',
})

export const INCIDENT_SOURCE_KEYS = Object.freeze(Object.keys(INCIDENT_SOURCES))
export const incidentSourceLabel = (value) => lookup(INCIDENT_SOURCES, value, value ?? '')

// ⚠️ The blotter is INTERNAL. There is no public blotter lookup, no tracking
// page and no reference a resident is given -- unlike the complaint reference,
// which exists precisely so a resident can ask about their own filing. This
// sentence is rendered on the blotter panel so nobody wires one up later by
// analogy with `track_complaint`.
export const BLOTTER_INTERNAL_NOTE = 'The blotter is an internal barangay record. It is not published and there is no public lookup for it.'

export const BLOTTER_ACTIONS = Object.freeze({
  created: 'Entry created',
  amended: 'Entry amended',
})

export const blotterActionLabel = (value) => lookup(BLOTTER_ACTIONS, value, value ?? '')

export const BLOTTER_APPEND_ONLY_NOTE = 'Amendments are added to the history below. What was first written down is never overwritten.'

// ⚠️ Each refusal is this module's own sentence. The functions name the
// position that holds the permission ("Only the Barangay Secretary or the
// Punong Barangay can..."), and printing that would put an authorization model
// on a screen somebody may be standing beside.
export const INCIDENT_ERRORS = Object.freeze({
  loadFailed: 'The incident records could not be loaded. Try again in a moment.',
  recordFailed: 'That incident could not be recorded. Check the details and try again.',
  notPermittedRecord: 'Recording an incident is handled by the barangay officials.',
  notPermittedAdmin: 'Changing an incident record is handled by the barangay records staff.',
  statusFailed: 'That status change could not be saved.',
  amendFailed: 'That amendment could not be saved.',
  tanodFailed: 'That Tanod could not be linked to this incident.',
  futureIncident: 'An incident cannot be recorded as happening in the future.',
  narrativeRequired: 'Describe what happened.',
  locationRequired: 'Give the location.',
  occurredRequired: 'Give the date and time it happened.',
  coordinatesPaired: 'Give both a latitude and a longitude, or neither.',
})

// ⚠️ The neutral sentence an official who may not administer records reads.
// It names NO position, no policy, no function and no SQLSTATE -- the same
// rule the restricted complaint panel follows.
export const RECORDS_RESTRICTED_NOTE = 'Changing an incident record is handled by the barangay records staff.'

export const INCIDENT_TANOD_ROLES = Object.freeze({
  reported: 'Reported it',
  responded: 'Responded',
  attended: 'Attended',
})

export const INCIDENT_TANOD_ROLE_KEYS = Object.freeze(Object.keys(INCIDENT_TANOD_ROLES))
export const incidentTanodRoleLabel = (value) => lookup(INCIDENT_TANOD_ROLES, value, value ?? '')

// ⚠️ `area_note` is FREE TEXT and is deliberately not called a purok. P2
// established that no entry in the current purok list has a documentary
// source, so there is nothing canonical to choose from -- the same reason
// `complaints.location_note` is named the way it is.
export const AREA_NOTE_LABEL = 'Area or landmark (optional)'
export const AREA_NOTE_HINT = 'Free text. The barangay has not confirmed an official purok list, so this is recorded as written rather than chosen from one.'

export const COORDINATES_HINT = 'Optional. An incident with no coordinates is still recorded and still counted — it just does not appear on the map.'

// ⚠️ No `Date` is constructed from a stored string anywhere in this module.
// `occurred_at` is a timestamptz, which arrives as an ISO instant rather than
// a date-only string, so it is formatted rather than parsed into parts.
export const incidentDateTime = (value) => {
  if (!value) return ''
  const stamp = new Date(value)
  if (Number.isNaN(stamp.getTime())) return ''
  return stamp.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export const incidentDate = (value) => {
  if (!value) return ''
  const stamp = new Date(value)
  if (Number.isNaN(stamp.getTime())) return ''
  return stamp.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric',
  })
}
