// Final Integration — the words the PUBLIC Community Safety Map uses.
//
// ⚠️ THIS MODULE IS PURE AND IMPORTS NOTHING FROM THE OFFICIAL SURFACE.
// It deliberately does not re-export anything from `safetyAnalytics.js` or
// `incidentLabels.js`: a public page that imported the official vocabulary
// could pick up a word meant for staff the moment either changed. The one
// thing it does share is the INCIDENT TYPE labels, because a resident and an
// official must not be shown two different words for one stored value -- the
// rule `residentGroups` has followed since D6.

import { INCIDENT_TYPES, incidentTypeLabel } from '../incidents/incidentLabels'

export { incidentTypeLabel, INCIDENT_TYPES }

// ─── ⚠️ CONCENTRATION, NOT A RATE ───────────────────────────────────────────
//
// There is no population denominator anywhere in this database -- no
// household count, no resident roll (`residents_registry` is the voter
// reference list, not a census). So "crime rate", "incidents per 1,000" and
// "per capita" are numbers this project cannot compute, and printing one
// would be inventing a denominator. Everything here is a COUNT.
//
// ⚠️ And "crime" is the wrong word regardless. `incident_type` is an
// operational category the barangay records; it is not an offence code, no
// court has found anything, and the public page must not read as a crime
// statistic.
export const PAGE_TITLE = 'Community Safety & Incident Trends'
export const PAGE_INTRO = 'View privacy-protected incident patterns and recorded trends across Barangay Batinguel. Exact incident locations and personal information are not shown.'

export const CONCENTRATION_LABEL = 'Recorded incident concentration'

// ─── ⚠️ THE AGGREGATION RULE, IN THE READER'S OWN WORDS ─────────────────────
//
// A map that coarsens its data and does not say so invites the reader to
// believe the circle is the place. These two sentences are rendered on the
// page, not kept in a migration header.
export const AGGREGATION_NOTE = 'Incidents are grouped into square areas of about 220 metres across, and each square covers a whole area — not any incident’s own location.'

export const THRESHOLD_NOTE = 'An area appears only when two or more incidents have been recorded in it. A place with a single recorded incident is never shown, so this map cannot point to one household or one report.'

export const NO_LOCATION_NAMES_NOTE = 'Street and place names are not published here, because an officer’s own note about where something happened can name a neighbour or a house.'

// ⚠️ NOT A FINDING, AND NOT ADVICE. The public page carries the same
// disclaimer discipline the official analytics does, in plainer words.
export const PUBLIC_DISCLAIMER = 'These are counts of what the barangay has recorded. They are not a crime rate, not a ranking of which places are dangerous, and not a prediction.'

// ─── ⚠️ THE GRID CELL, AND WHY THE SQUARE IS THE HONEST SHAPE ───────────────
//
// Migration 045 floors every coordinate onto a 0.002° grid and publishes the
// CELL CENTRE. A circle drawn at that centre says "around here, roughly",
// which a reader can reasonably read as a point estimate. A square drawn on
// the grid the SQL actually used says exactly what the aggregation did: this
// 0.002° cell holds this many records, and nothing finer is known.
//
// ⚠️ IT PUBLISHES NO NEW PRECISION. The rectangle's corners are the centre
// ± half a cell, so every number it draws is already implied by the centre
// the function returns. Nothing here reads a latitude the RPC did not give.
export const ZONE_CELL_DEGREES = 0.002

// ─── ⚠️ DETERMINISTIC BANDS, NOT PEAK-RELATIVE ONES ─────────────────────────
//
// The official panel's `bandFor` scales against the busiest cell in the
// current filter, which is right for a staff tool comparing one period with
// itself -- but on a public page it means the SAME count changes colour when
// the date range changes, and a reader comparing two visits is misled.
//
// These four bands are fixed thresholds, so a cell holding 5 looks the same
// in every period, on every visit, forever.
//
// ⚠️ THEY ARE NAMED BY HOW MANY WERE RECORDED, NEVER BY DANGER. There is no
// "high risk", no "unsafe area", no "crime level" -- those are findings this
// system has not made and could not make. The lowest band starts at 2
// because a cell below that is not published at all.
export const CONCENTRATION_BANDS = Object.freeze([
  { key: 'lowest', min: 2, max: 2, label: '2 recorded', tone: '#93c5fd' },
  { key: 'moderate', min: 3, max: 4, label: '3 to 4 recorded', tone: '#60a5fa' },
  { key: 'high', min: 5, max: 7, label: '5 to 7 recorded', tone: '#2563eb' },
  { key: 'highest', min: 8, max: Infinity, label: '8 or more recorded', tone: '#1e3a8a' },
])

// ⚠️ A count below the published threshold still resolves to the lowest
// band rather than to `null`. The map never receives one -- the SQL refuses
// to publish it -- so a null here would be an unreachable branch that a
// later caller could trip over, and a crash is a worse answer than a colour.
export const concentrationBand = (total) => {
  const n = Number(total)
  if (!Number.isFinite(n)) return CONCENTRATION_BANDS[0]
  return CONCENTRATION_BANDS.find((band) => n >= band.min && n <= band.max)
    || CONCENTRATION_BANDS[0]
}

export const SHADING_NOTE = 'Stronger shading means more incidents were recorded in that area. The shading is a count, not a danger level.'

export const EMPTY_NO_ZONES = 'No public incident concentrations are available for this period.'

export const SAFETY_ERRORS = Object.freeze({
  loadFailed: 'The community safety map could not be loaded. Please try again in a moment.',
})

// ─── Empty states, which are three different facts ──────────────────────────
//
// ⚠️ "Nothing recorded", "nothing shareable" and "nothing in this filter" are
// not the same sentence. A reader told "no incidents" when the barangay has
// recorded four would be misinformed, and X1's two-empty-states rule is the
// project's own precedent for refusing to collapse them.
export const EMPTY_NOTHING_RECORDED = 'No incidents have been recorded for this period.'
export const EMPTY_NOTHING_MAPPED = 'Incidents have been recorded for this period, but no area yet has the two or more needed to be shown on the map.'

// ─── ⚠️ AN OBSERVATION REPORTS; IT NEVER PRESCRIBES ─────────────────────────
//
// The public sentence is deliberately weaker than the official one. The
// official version invites the barangay to "review for possible local safety
// intervention"; a resident is not the one who reviews, so the public version
// states the count and stops. No `must`, no `should`, no action.
export const publicObservation = (zone, rank) => {
  const total = Number(zone?.total) || 0
  const place = rank === 1 ? 'the area with the most recorded incidents' : `area ${rank}`
  return `${total} incidents recorded in ${place} for this period.`
}

// How many incidents are shown versus how many exist. ⚠️ Said plainly,
// because the difference is the privacy rule doing its job and a reader who
// notices the gap deserves the reason rather than a silent discrepancy.
export const coverageSentence = (mapped, total) => {
  const m = Number(mapped) || 0
  const t = Number(total) || 0
  if (t === 0) return EMPTY_NOTHING_RECORDED
  const hidden = Math.max(0, t - m)
  if (hidden === 0) {
    return `All ${t} recorded incident${t === 1 ? '' : 's'} for this period fall in an area shown below.`
  }
  return `${m} of ${t} recorded incident${t === 1 ? '' : 's'} fall in an area shown below.`
    + ` The other ${hidden} ${hidden === 1 ? 'is' : 'are'} not shown, because ${hidden === 1 ? 'it has' : 'they have'}`
    + ` no recorded coordinates or ${hidden === 1 ? 'sits alone in its area' : 'sit alone in their areas'}.`
}
