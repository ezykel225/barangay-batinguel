// Combined Phase 2 — the descriptive analytics as a pure module.
//
// ⚠️ THE LOAD-BEARING TESTS HERE ARE ABSENCES. What matters about this module
// is not that it can add up — it is that it never concludes, never
// recommends, never ranks risk and never produces a rate. Those are proved by
// scanning every sentence it can produce and by asserting that no function
// mapping counts to a decision exists by name.

import {
  COVERAGE_CAVEAT, INTENSITY_BANDS, OBSERVATION_DISCLAIMER, bandFor, coverageGaps,
  coverageTotals, intensityOf, isPlottable, locationKey, markerRadiusFor, monthLabel,
  observationFor, plottablePoints, rankHotspots, totalFrom, trendSeries,
} from './safetyAnalytics'
import * as analytics from './safetyAnalytics'

const loc = (label, total, extra = {}) => ({
  location_key: locationKey(label), location_label: label, total,
  with_coordinates: total, centroid_latitude: 9.3, centroid_longitude: 123.3,
  top_type: 'traffic_accident', ...extra,
})

// ── A. It counts; it does not conclude ───────────────────────────────────────

describe('A. no function maps counts to a decision', () => {
  // ⚠️ BY NAME, across the shapes a scoring or deciding helper would take.
  // The same proof `screeningChecklist.test.js` makes about the checklist.
  it.each([
    'riskScore', 'scoreLocation', 'severityOf', 'severityScore', 'priorityOf',
    'rankRisk', 'dangerLevel', 'threatLevel', 'predict', 'predictIncidents',
    'forecast', 'recommend', 'recommendation', 'recommendAction', 'decide',
    'classifyRisk', 'shouldPatrol', 'requiresAction', 'perCapita', 'incidentRate',
  ])('exports no %s', (name) => {
    expect(analytics[name]).toBeUndefined()
  })

  it('exports no function whose name suggests a verdict', () => {
    const suspicious = Object.keys(analytics).filter((key) => (
      /(risk|severity|danger|threat|predict|forecast|recommend|verdict|rate)/i.test(key)
    ))
    expect(suspicious).toEqual([])
  })
})

// ── B. Observations prompt a review; they never direct ───────────────────────

describe('B. the observation wording', () => {
  const sentences = () => {
    const hotspots = rankHotspots([
      loc('Rizal Street', 6), loc('Perdices Street', 3), loc('Colon Street', 2),
    ])
    return [
      ...hotspots.map((h) => observationFor(h, 'Traffic accident')),
      ...hotspots.map((h) => observationFor(h)),
      observationFor(null),
      COVERAGE_CAVEAT,
      OBSERVATION_DISCLAIMER,
    ]
  }

  // ⚠️ THE LOAD-BEARING ONE. "Repeated traffic incidents recorded — review for
  // possible road-safety intervention" is an observation. "The barangay must
  // install a road sign" is a decision this system has no standing to make.
  it.each([
    'must', 'should', 'need to', 'ought', 'install', 'build', 'construct',
    'purchase', 'buy', 'deploy more', 'hire', 'enforce', 'penalt', 'fine',
    'required to', 'we recommend', 'immediately',
  ])('never says %s', (word) => {
    sentences().forEach((sentence) => {
      expect(sentence.toLowerCase()).not.toContain(word)
    })
  })

  it('states the count and invites a review', () => {
    const [top] = rankHotspots([loc('Rizal Street', 6)])
    const sentence = observationFor(top, 'Traffic accident')
    expect(sentence).toContain('6')
    expect(sentence).toContain('Rizal Street')
    expect(sentence).toMatch(/review/i)
  })

  // ⚠️ COUNTS, NEVER RATES. No population figure exists in this database, so a
  // per-capita rate would need a denominator nobody has supplied.
  it.each(['per capita', 'per 1,000', 'per 1000', 'rate of', '%'])(
    'never expresses a rate (%s)', (token) => {
      sentences().forEach((sentence) => expect(sentence).not.toContain(token))
    }
  )

  it('names no person, no complaint and no narrative field', () => {
    sentences().forEach((sentence) => {
      expect(sentence.toLowerCase()).not.toContain('complain')
      expect(sentence.toLowerCase()).not.toContain('witness')
      expect(sentence.toLowerCase()).not.toContain('respondent')
      expect(sentence.toLowerCase()).not.toContain('narrative')
    })
  })
})

// ── C. Hotspots ──────────────────────────────────────────────────────────────

describe('C. rankHotspots', () => {
  // ⚠️ ONE INCIDENT AT A PLACE IS AN INCIDENT, NOT A PATTERN. Calling a single
  // record a hotspot asserts something the count does not support.
  it('excludes a location with only one recorded incident', () => {
    const ranked = rankHotspots([loc('Rizal Street', 3), loc('Quiet Lane', 1)])
    expect(ranked.map((r) => r.location_label)).toEqual(['Rizal Street'])
  })

  it('orders by count, highest first', () => {
    const ranked = rankHotspots([loc('A road', 2), loc('B road', 7), loc('C road', 4)])
    expect(ranked.map((r) => r.location_label)).toEqual(['B road', 'C road', 'A road'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  // A stable tie-break, so two equal counts do not reorder between renders and
  // read as though the data moved.
  it('breaks ties by label rather than by input order', () => {
    const one = rankHotspots([loc('Zulueta Street', 3), loc('Alfonso Street', 3)])
    const two = rankHotspots([loc('Alfonso Street', 3), loc('Zulueta Street', 3)])
    expect(one.map((r) => r.location_label)).toEqual(two.map((r) => r.location_label))
    expect(one[0].location_label).toBe('Alfonso Street')
  })

  it('returns an empty list rather than throwing on no data', () => {
    expect(rankHotspots(null)).toEqual([])
    expect(rankHotspots([])).toEqual([])
    expect(totalFrom(null)).toBe(0)
  })
})

describe('C2. locationKey', () => {
  it('folds case and inner whitespace', () => {
    expect(locationKey('  Rizal   STREET ')).toBe('rizal street')
  })

  // ⚠️ NO FUZZY MATCHING, DELIBERATELY. "Rizal St" and "Rizal Street" stay two
  // labels: declaring them one is the inference `barangay_term_members`
  // refuses for names, and getting it wrong merges two places into one
  // hotspot.
  it('does not treat an abbreviation as the same place', () => {
    expect(locationKey('Rizal St')).not.toBe(locationKey('Rizal Street'))
  })
})

// ── D. Intensity is a share of the maximum, not a risk level ────────────────

describe('D. intensity', () => {
  it('is zero when there is nothing to compare against', () => {
    expect(intensityOf(5, 0)).toBe(0)
    expect(intensityOf(0, 5)).toBe(0)
  })

  it('is a share of the busiest label', () => {
    expect(intensityOf(3, 6)).toBe(0.5)
    expect(intensityOf(6, 6)).toBe(1)
  })

  it('never exceeds one, even on inconsistent input', () => {
    expect(intensityOf(99, 3)).toBe(1)
  })

  it('grows the marker radius with the count', () => {
    expect(markerRadiusFor(1, 10)).toBeLessThan(markerRadiusFor(10, 10))
  })

  // ⚠️ THE BAND NAMES SAY HOW MANY WERE RECORDED, NOT HOW BAD A PLACE IS.
  it('names bands by what was counted, never by danger', () => {
    INTENSITY_BANDS.forEach((band) => {
      expect(band.label).toMatch(/recorded/i)
      expect(band.label).not.toMatch(/risk|danger|severe|critical|unsafe/i)
    })
  })

  it('places a count in the band its share falls into', () => {
    expect(bandFor(1, 10).key).toBe('low')
    expect(bandFor(5, 10).key).toBe('medium')
    expect(bandFor(10, 10).key).toBe('high')
  })
})

// ── E. Only real coordinates reach the map ───────────────────────────────────

describe('E. plottable points', () => {
  const point = (latitude, longitude) => ({ id: 'x', latitude, longitude })

  // ⚠️ A point with half a coordinate must be LEFT OFF rather than drawn at
  // (0, 0), which is a spot in the Gulf of Guinea.
  it.each([
    ['no latitude', point(null, 123.3)],
    ['no longitude', point(9.3, null)],
    ['neither', point(null, null)],
    ['text where a number belongs', point('somewhere', 'else')],
    ['latitude out of range', point(120, 123.3)],
    ['longitude out of range', point(9.3, 200)],
  ])('refuses a point with %s', (_label, bad) => {
    expect(isPlottable(bad)).toBe(false)
  })

  it('accepts a real pair, including zero', () => {
    expect(isPlottable(point(9.3068, 123.3054))).toBe(true)
    expect(isPlottable(point(0, 0))).toBe(true)
  })

  it('filters a mixed list down to the plottable ones', () => {
    expect(plottablePoints([point(9.3, 123.3), point(null, null)])).toHaveLength(1)
    expect(plottablePoints(null)).toEqual([])
  })
})

// ── F. Coverage gaps ─────────────────────────────────────────────────────────

describe('F. coverage gaps', () => {
  const area = (label, assignments = 1, tanods = 1) => ({
    area_key: locationKey(label), area_label: label,
    assignment_count: assignments, tanod_count: tanods,
  })

  it('lists a repeated location with no matching patrol area', () => {
    const gaps = coverageGaps([loc('Rizal Street', 5), loc('Colon Street', 3)], [area('Colon Street')])
    expect(gaps.map((g) => g.location_label)).toEqual(['Rizal Street'])
  })

  it('lists nothing when every repeated location is covered', () => {
    const gaps = coverageGaps([loc('Rizal Street', 5)], [area('rizal   STREET')])
    expect(gaps).toEqual([])
  })

  // ⚠️ THE LIMITATION, ASSERTED. An assignment area and an incident location
  // are two free-text labels typed on two screens, so differing wording
  // produces a gap that is about spelling rather than about neglect.
  it('treats differently worded labels as uncovered, which is why the caveat exists', () => {
    const gaps = coverageGaps([loc('Rizal Street', 4)], [area('Rizal St')])
    expect(gaps).toHaveLength(1)
    expect(COVERAGE_CAVEAT).toMatch(/wording/i)
    expect(COVERAGE_CAVEAT).toMatch(/not because no one was assigned/i)
  })

  it('never calls a gap neglect, a failure or a fault', () => {
    expect(COVERAGE_CAVEAT.toLowerCase()).not.toMatch(/neglect|failure|fault|blame|negligen/)
  })

  it('counts coverage without inventing one', () => {
    expect(coverageTotals([area('A', 2, 1), area('B', 3, 2)]))
      .toEqual({ areas: 2, assignments: 5, tanods: 3 })
    expect(coverageTotals(null)).toEqual({ areas: 0, assignments: 0, tanods: 0 })
  })
})

// ── G. Trend ─────────────────────────────────────────────────────────────────

describe('G. the monthly trend', () => {
  it('labels a month key without constructing a Date', () => {
    expect(monthLabel('2026-03')).toBe('Mar 2026')
  })

  // ⚠️ An unparseable key comes back EXACTLY AS GIVEN rather than guessed --
  // the Activity Log's rule, for the same reason.
  it.each(['', null, 'not-a-month', '2026-13', '2026'])(
    'returns %s unchanged rather than guessing', (value) => {
      expect(monthLabel(value)).toBe(String(value ?? ''))
    }
  )

  it('summarises a series with its peak and total', () => {
    const series = trendSeries([
      { month_key: '2026-01', total: 2 },
      { month_key: '2026-02', total: 5 },
    ])
    expect(series.peak).toBe(5)
    expect(series.total).toBe(7)
    expect(series.rows[1].label).toBe('Feb 2026')
  })

  it('survives no data', () => {
    expect(trendSeries(null)).toEqual({ rows: [], peak: 0, total: 0 })
  })
})

// ── H. The module reaches nothing ────────────────────────────────────────────

describe('H. it is pure', () => {
  const fs = require('fs')
  const path = require('path')
  const source = fs.readFileSync(path.join(__dirname, 'safetyAnalytics.js'), 'utf8')
  const code = source.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

  it('imports nothing at all', () => {
    expect(code).not.toMatch(/\bimport\b/)
    expect(code).not.toMatch(/\brequire\(/)
  })

  it('never constructs a Date from a stored string', () => {
    expect(code).not.toMatch(/new Date\(/)
  })

  it('reads no complaint, screening or KP surface', () => {
    ;['complaint', 'screening', 'kp_', 'party', 'witness', 'vawc', 'minor']
      .forEach((term) => expect(code.toLowerCase()).not.toContain(term))
  })
})
