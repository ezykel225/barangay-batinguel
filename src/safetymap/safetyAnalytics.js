// Combined Phase 2 — the descriptive analytics behind the safety map.
//
// ─── ⚠️ THIS MODULE COUNTS AND SORTS. IT DOES NOT CONCLUDE ───────────────────
//
// Every number here comes from a `count(*)` the database already did. There is
// no score, no weight, no severity ranking, no threshold that decides
// something, no model and no prediction. `rankHotspots` sorts by a count and
// `coverageGaps` performs one exact-equality set difference -- that is the
// whole of the arithmetic.
//
// ⚠️ AND IT NEVER WRITES A RECOMMENDATION. `observationFor()` produces a
// sentence that says what was COUNTED and invites a human to look; it never
// says what the barangay should do. "Repeated traffic incidents recorded here
// -- review for possible road-safety intervention." is an observation with a
// prompt. "The barangay must install a road sign." is a decision this system
// has no standing to make, and `safetyAnalytics.test.js` scans every sentence
// this module can produce for exactly that class of verb.
//
// ─── ⚠️ COUNTS, NEVER RATES ─────────────────────────────────────────────────
//
// No population figure exists anywhere in this database, so a per-capita rate
// would need a denominator nobody has supplied. Frequency is what the data
// supports, and frequency is what is shown -- the same reason the medicine
// list publishes a status rather than a quantity.

// The normalisation the SQL readers use, repeated here so a label typed into a
// filter and a label grouped in the database agree about what one place is.
//
// ⚠️ CASE AND INNER WHITESPACE, AND NOTHING ELSE. There is no fuzzy matching,
// no abbreviation expansion and no spelling correction: "Rizal St" and
// "Rizal Street" stay two labels. Declaring them one is the inference
// `barangay_term_members` refuses for names, and getting it wrong here would
// silently merge two places into one hotspot.
export const locationKey = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase()

export const totalFrom = (rows) => (rows || []).reduce(
  (sum, row) => sum + (Number(row.total) || 0), 0
)

// ─── Hotspots ───────────────────────────────────────────────────────────────

// ⚠️ A HOTSPOT IS "THIS LABEL WAS RECORDED MORE THAN ONCE", and nothing
// stronger. `minimum` defaults to 2 because one incident at a place is an
// incident, not a pattern -- and a page that called a single record a hotspot
// would be asserting something the count does not support.
export const rankHotspots = (locationRows, { minimum = 2 } = {}) => {
  const rows = (locationRows || []).filter(
    (row) => (Number(row.total) || 0) >= minimum
  )
  const sorted = [...rows].sort((a, b) => {
    const byTotal = (Number(b.total) || 0) - (Number(a.total) || 0)
    if (byTotal !== 0) return byTotal
    // A stable, readable tie-break, so two equal counts do not reorder
    // between renders and read as though the data moved.
    return String(a.location_label || '').localeCompare(String(b.location_label || ''))
  })
  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
    key: row.location_key || locationKey(row.location_label),
  }))
}

// A 0..1 share of the busiest label, for the map's graduated circles.
//
// ⚠️ IT IS A SHARE OF THE MAXIMUM, NOT A RISK LEVEL. Three incidents where the
// busiest place has six is 0.5 -- that is arithmetic about this data set, and
// it says nothing about how dangerous either place is.
export const intensityOf = (total, maximum) => {
  const n = Number(total) || 0
  const max = Number(maximum) || 0
  if (max <= 0 || n <= 0) return 0
  return Math.min(1, n / max)
}

// The circle a point gets on the map. Radius carries the count; colour is a
// second cue so the layer is not read by hue alone.
export const markerRadiusFor = (total, maximum) => (
  8 + Math.round(intensityOf(total, maximum) * 16)
)

export const INTENSITY_BANDS = Object.freeze([
  { key: 'low', label: 'Fewer recorded', upTo: 0.34 },
  { key: 'medium', label: 'More recorded', upTo: 0.67 },
  { key: 'high', label: 'Most recorded', upTo: 1 },
])

// ⚠️ The band names say HOW MANY WERE RECORDED, not how bad a place is.
// "High risk" would be a judgment; "Most recorded" is a count.
export const bandFor = (total, maximum) => {
  const intensity = intensityOf(total, maximum)
  return INTENSITY_BANDS.find((band) => intensity <= band.upTo) || INTENSITY_BANDS[0]
}

// Only points that carry a usable coordinate pair are plottable. A point with
// half a coordinate, or with text where a number should be, is left off the
// map rather than drawn at (0, 0) -- which is a spot in the Gulf of Guinea.
// ⚠️ THE `blank` GUARD IS NOT BELT AND BRACES, IT IS THE WHOLE POINT, and a
// test caught its absence. `Number(null)` is `0` and `Number.isFinite(0)` is
// `true`, so coercing first lets a row with NO latitude through as a perfectly
// valid zero -- and (0, 0) is a spot in the Gulf of Guinea, roughly 10,000 km
// from Dumaguete. The same holds for `undefined` and for the empty string an
// unfilled form field produces.
const blank = (value) => value === null || value === undefined || value === ''

export const isPlottable = (point) => {
  if (blank(point?.latitude) || blank(point?.longitude)) return false
  const lat = Number(point.latitude)
  const lng = Number(point.longitude)
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export const plottablePoints = (points) => (points || []).filter(isPlottable)

// ─── Tanod coverage ─────────────────────────────────────────────────────────

// Locations with repeated incidents and no patrol assignment whose area label
// matches.
//
// ⚠️ THIS IS A PROMPT TO CHECK, NOT A FINDING OF NEGLECT, and the limitation
// is the reason: an assignment area and an incident location are two free-text
// labels typed by two people on two screens. "Rizal Street" and "Rizal St."
// do not match here, so a gap can mean the wording differs rather than that
// nobody was assigned. `COVERAGE_CAVEAT` says so on screen, every time, and a
// test asserts the list is never rendered without it.
export const coverageGaps = (locationRows, coverageRows, { minimum = 2 } = {}) => {
  const covered = new Set(
    (coverageRows || []).map((row) => row.area_key || locationKey(row.area_label))
  )
  return rankHotspots(locationRows, { minimum })
    .filter((row) => !covered.has(row.key))
}

export const COVERAGE_CAVEAT = 'Matched by exact area wording only. A location can appear here because the patrol area was written differently, not because no one was assigned — check the patrol schedule before acting on this.'

export const coverageTotals = (coverageRows) => {
  const rows = coverageRows || []
  return {
    areas: rows.length,
    assignments: rows.reduce((n, row) => n + (Number(row.assignment_count) || 0), 0),
    tanods: rows.reduce((n, row) => n + (Number(row.tanod_count) || 0), 0),
  }
}

// ─── Observations ───────────────────────────────────────────────────────────

// ⚠️ EVERY SENTENCE THIS CAN PRODUCE IS AN OBSERVATION WITH A REVIEW PROMPT.
// None of them tells the barangay what to build, buy, install, fix, enforce or
// require, and none says "must" or "should". The barangay decides what to do;
// this says what was counted and suggests somebody look.
export const observationFor = (hotspot, typeLabel) => {
  const total = Number(hotspot?.total) || 0
  const place = hotspot?.location_label || 'this location'
  const kind = typeLabel ? `${typeLabel.toLowerCase()} ` : ''
  return `${total} ${kind}incidents recorded at ${place} — review for possible local safety intervention.`
}

export const OBSERVATION_DISCLAIMER = 'These are counts of what officials recorded, for review by the barangay. They are not a finding, a ranking of risk, or a recommended action.'

// ─── Trend ──────────────────────────────────────────────────────────────────

// ⚠️ The month keys come from the database, already computed in Asia/Manila.
// Nothing here parses a date or constructs a `Date` from a string -- the trap
// `monthGrid.js` exists to avoid.
export const MONTH_SHORT = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
])

export const monthLabel = (monthKey) => {
  const raw = String(monthKey ?? '')
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!match) return raw
  const index = Number(match[2]) - 1
  if (index < 0 || index > 11) return raw
  return `${MONTH_SHORT[index]} ${match[1]}`
}

export const trendSeries = (monthlyRows) => {
  const rows = (monthlyRows || []).map((row) => ({
    monthKey: row.month_key,
    label: monthLabel(row.month_key),
    total: Number(row.total) || 0,
  }))
  const peak = rows.reduce((max, row) => Math.max(max, row.total), 0)
  return { rows, peak, total: rows.reduce((n, row) => n + row.total, 0) }
}
