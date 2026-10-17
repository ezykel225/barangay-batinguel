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
export const PAGE_TITLE = 'Community Safety Map'
export const PAGE_INTRO = 'Where incidents have been recorded across Barangay Batinguel, shown as general areas rather than exact places.'

export const CONCENTRATION_LABEL = 'Recorded incident concentration'

// ─── ⚠️ THE AGGREGATION RULE, IN THE READER'S OWN WORDS ─────────────────────
//
// A map that coarsens its data and does not say so invites the reader to
// believe the circle is the place. These two sentences are rendered on the
// page, not kept in a migration header.
export const AGGREGATION_NOTE = 'Incidents are grouped into areas of about 220 metres across, and each circle is drawn at the centre of its area — not at any incident’s own location.'

export const THRESHOLD_NOTE = 'An area appears only when two or more incidents have been recorded in it. A place with a single recorded incident is never shown, so this map cannot point to one household or one report.'

export const NO_LOCATION_NAMES_NOTE = 'Street and place names are not published here, because an officer’s own note about where something happened can name a neighbour or a house.'

// ⚠️ NOT A FINDING, AND NOT ADVICE. The public page carries the same
// disclaimer discipline the official analytics does, in plainer words.
export const PUBLIC_DISCLAIMER = 'These are counts of what the barangay has recorded. They are not a crime rate, not a ranking of which places are dangerous, and not a prediction.'

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
