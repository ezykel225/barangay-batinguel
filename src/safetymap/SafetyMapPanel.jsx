import { useEffect, useMemo, useRef, useState } from 'react'
import { FaInfoCircle, FaMapMarkedAlt, FaShieldAlt } from 'react-icons/fa'

import { INCIDENT_TYPE_KEYS, commonTypeLabel, incidentTypeLabel } from '../incidents/incidentLabels'
import IncidentMap from './IncidentMap'
import {
  COVERAGE_CAVEAT, OBSERVATION_DISCLAIMER, bandFor, coverageGaps, coverageTotals,
  locationKey, observationFor, plottablePoints, rankHotspots, totalFrom,
} from './safetyAnalytics'
import {
  SAFETY_ERRORS, loadCoverageSummary, loadSafetyIncidents,
} from './safetyApi'
import { filterSafetyIncidents, safetyAnalyticsFor } from './officialIncidentAnalytics'
import AnalyticsInsights from '../analytics/AnalyticsInsights'
import './SafetyMap.css'

// Combined Phase 2 — the internal safety map and the descriptive analytics.
//
// ⚠️ ALL OF THIS IS INTERNAL. Every reader behind it is gated on
// `current_official_is_active()` and granted to `authenticated` only; `anon`
// is refused 42501 at the privilege layer -- measured against all six.
//
// ⚠️ THERE IS NOW A PUBLIC MAP, AND IT IS A DIFFERENT DATA SURFACE.
// `/community-safety` reads migration 045's four aggregate functions:
// grid-cell centres and counts, published only where two or more incidents
// share a cell, with no narrative, reference, location label, status or
// Tanod anywhere in their return types. It does NOT read
// `incident_map_points()`, and this panel must never be repointed at the
// public readers either -- an official looking at the operational map needs
// the precise point and the location label, which is the whole reason the
// two surfaces are separate rather than one component with a mode flag.
// See `safetymap/PublicSafetyMap.jsx`.
//
// ⚠️ ONE MODULE, THREE TABS, NO SECOND ANALYTICS. Analytics & Insights is the
// existing component, mounted only while its tab is open, with its filters held
// here so they survive tab changes. The map's own copy of the 062 roles,
// outcomes and time breakdowns, and its type/status/trend lists, were removed:
// Analytics & Insights shows the same facts from the same records.
//
// ⚠️ FILTERS ARE SHARED ONLY WHERE THEY MEAN THE SAME THING. The incident
// category is one stored incident_type everywhere, so all three tabs share it.
// Dates are not shared: the map and patrol tabs use explicit dates (and patrol
// assignments have their own date semantics), Analytics uses Manila presets.
// Area is Analytics-only: its rule (area note first, exact) differs from the
// map's location grouping (location text, case and spacing ignored).
//
// ⚠️ THE NUMBERS ARE COUNTS. No rate, no per-capita figure, no score and no
// prediction -- see `safetyAnalytics.js` for why, and for the rule that an
// observation may prompt a review and may never recommend an action.

export const SAFETY_SECTIONS = Object.freeze([['map', 'Incident Map'], ['analytics', 'Analytics & Insights'], ['patrol', 'Patrol Coverage']])
export const FILTER_SCOPE_NOTE = 'The incident category is shared by all three tabs. Incident Map and Patrol Coverage share these dates; Analytics & Insights has its own period and area filters.'
export const LOCATION_RULE_NOTE = 'Locations here are grouped by the location text, ignoring case and spacing. Analytics & Insights groups recorded areas by the area note first, exactly as typed, so the two lists can count the same incident under different labels.'
const ANALYTICS_BLANK = { window: 'all', from: '', to: '', area: '' }

const SafetyMapPanel = ({ canAdminister = false, section: controlledSection, onSectionChange }) => {
  const [ownSection, setOwnSection] = useState('map')
  const section = SAFETY_SECTIONS.some(([key]) => key === controlledSection) ? controlledSection : ownSection
  const setSection = (key) => { if (onSectionChange) onSectionChange(key); else setOwnSection(key) }
  const tabRefs = useRef({})

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // The one filter every tab shares: the same stored incident_type.
  const [type, setType] = useState('')
  const [analyticsFilters, setAnalyticsFilters] = useState(ANALYTICS_BLANK)

  // Map and patrol data load the first time one of those tabs is shown, never
  // for a reader who only opened Analytics.
  const [mapRequested, setMapRequested] = useState(section !== 'analytics')
  useEffect(() => { if (section !== 'analytics') setMapRequested(true) }, [section])

  const [incidents, setIncidents] = useState([])
  const [coverageResult, setCoverage] = useState(null)
  const [coverageProblem, setCoverageProblem] = useState('')
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    if (!mapRequested) return undefined
    let live = true
    loadSafetyIncidents().then(rows => { if (live) setIncidents(rows) })
      .catch(() => { if (live) setProblem(SAFETY_ERRORS.loadFailed) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [mapRequested])
  // Patrol assignments retain their independent date semantics. A late response
  // must never overwrite the coverage for a newer date selection.
  useEffect(() => {
    if (!mapRequested) return undefined
    let live = true
    setCoverage(null)
    setCoverageProblem('')
    loadCoverageSummary({ from, to }).then(rows => { if (live) setCoverage({ from, to, rows }) })
      .catch(() => { if (live) setCoverageProblem(SAFETY_ERRORS.analyticsFailed) })
    return () => { live = false }
  }, [from, to, mapRequested])
  const filteredIncidents = useMemo(() => filterSafetyIncidents(incidents, { type, from, to }), [incidents, type, from, to])
  const { points, byType, locations, mapHotspots } = useMemo(() => safetyAnalyticsFor(filteredIncidents), [filteredIncidents])
  const coverage = coverageResult?.from === from && coverageResult?.to === to ? coverageResult.rows : []
  const total = totalFrom(byType)
  const hotspots = rankHotspots(locations)
  const gaps = coverageGaps(locations, coverage)
  const cover = coverageTotals(coverage)
  const peak = hotspots.reduce((max, h) => Math.max(max, Number(h.total) || 0), 0)
  const coveredKeys = coverage.map((row) => row.area_key || locationKey(row.area_label))

  const plotted = plottablePoints(points).length
  const unmapped = filteredIncidents.length - plotted

  // Arrow keys move between tabs and select them (WAI-ARIA tabs, automatic activation).
  const onTabKey = (event, index) => {
    const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: SAFETY_SECTIONS.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    const next = SAFETY_SECTIONS[(keys[event.key] + SAFETY_SECTIONS.length) % SAFETY_SECTIONS.length][0]
    setSection(next)
    tabRefs.current[next]?.focus()
  }
  const analyticsValue = { ...analyticsFilters, category: type }
  const onAnalyticsFilters = (next) => { setType(next.category || ''); setAnalyticsFilters({ window: next.window, from: next.from, to: next.to, area: next.area }) }

  return (
    <div className="smap-module">
      <div className="official-dashboard-header">
        <h1>Safety Map &amp; Analytics</h1>
        <p>Where incidents were recorded, what the records show over time, and which areas have patrols.</p>
      </div>

      <div className="smap-tabs" role="tablist" aria-label="Safety Map and Analytics sections">
        {SAFETY_SECTIONS.map(([key, label], index) => (
          <button key={key} type="button" role="tab" id={`smap-tab-${key}`} aria-controls={`smap-panel-${key}`}
            aria-selected={section === key} tabIndex={section === key ? 0 : -1}
            ref={(el) => { tabRefs.current[key] = el }}
            onClick={() => setSection(key)} onKeyDown={(e) => onTabKey(e, index)}>{label}</button>
        ))}
      </div>
      <p className="smap-scope" role="note"><FaInfoCircle aria-hidden="true" /> {FILTER_SCOPE_NOTE}</p>

      {section !== 'analytics' && <>
        {(problem || coverageProblem) && (
          <p className="smap-problem" role="alert">
            <FaInfoCircle aria-hidden="true" /> {problem || coverageProblem}
          </p>
        )}
        <div className="resident-filter-bar smap-filters" aria-label="Map and patrol filters" role="group">
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="smap-type">Filter the map by incident type</label>
            <select id="smap-type" className="filter-select" value={type}
              onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {INCIDENT_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>{incidentTypeLabel(key)}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="smap-from">Map from date</label>
            <input id="smap-from" className="filter-select" type="date" value={from}
              onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="smap-to">Map up to date</label>
            <input id="smap-to" className="filter-select" type="date" value={to}
              onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" className="btn-cancel" onClick={() => { setType(''); setFrom(''); setTo('') }}>Reset filters</button>
        </div>
      </>}

      {section === 'map' && (
        <section className="dashboard-card" role="tabpanel" id="smap-panel-map" aria-labelledby="smap-tab-map">
          <div className="dashboard-card-header">
            <h2 className="section-heading"><FaMapMarkedAlt aria-hidden="true" /> Incident map</h2>
          </div>
          {loading ? (
            <p className="complaint-empty">Loading the map...</p>
          ) : (
            <>
              <IncidentMap points={points} hotspots={mapHotspots} coveredKeys={coveredKeys} />
              <p className="smap-caption">
                {plotted} incident{plotted === 1 ? '' : 's'} plotted.
                {filteredIncidents.length === 0 ? ' No recorded incidents match these filters.' : unmapped > 0 ? ` ${unmapped} matching incident${unmapped === 1 ? ' has' : 's have'} no usable coordinates and ${unmapped === 1 ? 'is' : 'are'} not on the map; ${unmapped === 1 ? 'it is' : 'they are'} still recorded and counted.` : ''}
              </p>
              <ul className="smap-legend">
                <li><span className="smap-key smap-key-low" aria-hidden="true" /> Fewer recorded</li>
                <li><span className="smap-key smap-key-medium" aria-hidden="true" /> More recorded</li>
                <li><span className="smap-key smap-key-high" aria-hidden="true" /> Most recorded</li>
                <li><span className="smap-key smap-key-covered" aria-hidden="true" /> Solid ring: a patrol area matches</li>
              </ul>
              <p className="smap-note" role="note">
                <FaInfoCircle aria-hidden="true" /> {OBSERVATION_DISCLAIMER}
              </p>
              <div className="smap-stats">
                <div className="smap-stat">
                  <span className="smap-stat-value">{total}</span>
                  <span className="smap-stat-label">Incidents recorded</span>
                </div>
                <div className="smap-stat">
                  <span className="smap-stat-value">{hotspots.length}</span>
                  <span className="smap-stat-label">Locations with more than one</span>
                </div>
              </div>
              <p className="smap-crosslink">Categories, statuses, trends, weekdays and times of day are in{' '}
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setSection('analytics'); tabRefs.current.analytics?.focus() }}>Analytics &amp; Insights</button>.</p>
            </>
          )}
        </section>
      )}

      {section === 'analytics' && (
        <section role="tabpanel" id="smap-panel-analytics" aria-labelledby="smap-tab-analytics">
          <AnalyticsInsights embedded canAdminister={canAdminister} filters={analyticsValue} onFiltersChange={onAnalyticsFilters} />
        </section>
      )}

      {section === 'patrol' && (
        <section className="dashboard-card" role="tabpanel" id="smap-panel-patrol" aria-labelledby="smap-tab-patrol">
          <div className="dashboard-card-header">
            <h2 className="section-heading"><FaShieldAlt aria-hidden="true" /> Repeated locations and patrol coverage</h2>
          </div>
          <p className="smap-note" role="note"><FaInfoCircle aria-hidden="true" /> {LOCATION_RULE_NOTE}</p>
          {loading ? <p className="complaint-empty">Loading patrol coverage...</p> : <>
          <div className="smap-stats">
            <div className="smap-stat">
              <span className="smap-stat-value">{cover.assignments}</span>
              <span className="smap-stat-label">Active patrol assignments</span>
            </div>
            <div className="smap-stat">
              <span className="smap-stat-value">{cover.areas}</span>
              <span className="smap-stat-label">Areas with a patrol</span>
            </div>
          </div>

          {hotspots.length === 0 ? (
            <p className="complaint-empty">
              No location has more than one recorded incident in this range.
            </p>
          ) : (
            <>
              <h3>Repeated locations</h3>
              <div className="table-wrapper">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Location</th><th>Recorded</th><th>Most common type</th>
                      <th>Band</th><th>On the map</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotspots.map((spot) => (
                      <tr key={spot.key}>
                        <td data-label="Location">{spot.location_label}</td>
                        <td data-label="Recorded">{spot.total}</td>
                        <td data-label="Most common type">{commonTypeLabel(spot.top_type)}</td>
                        <td data-label="Band">{bandFor(spot.total, peak).label}</td>
                        <td data-label="On the map">
                          {Number(spot.with_coordinates) > 0
                            ? `${spot.with_coordinates} of ${spot.total}`
                            : 'No coordinates'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>Observations</h3>
              <ul className="smap-observations">
                {hotspots.slice(0, 5).map((spot) => (
                  <li key={spot.key}>
                    {observationFor(spot, spot.top_type?.includes(' / ') ? '' : incidentTypeLabel(spot.top_type))}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Repeated locations with no matching patrol area</h3>
          {/* ⚠️ THE CAVEAT IS RENDERED WITH THE LIST, ALWAYS. An assignment area
              and an incident location are two free-text labels typed on two
              screens, so a "gap" can mean the wording differs rather than that
              nobody was assigned. A test asserts the two are never separated. */}
          <p className="smap-note" role="note">
            <FaInfoCircle aria-hidden="true" /> {COVERAGE_CAVEAT}
          </p>
          {gaps.length === 0 ? (
            <p className="complaint-empty">
              {hotspots.length ? 'Every repeated location has a patrol area with matching wording.' : 'No repeated locations to match for these filters.'}
            </p>
          ) : (
            <ul className="smap-gaps">
              {gaps.map((spot) => (
                <li key={spot.key}>
                  <strong>{spot.location_label}</strong> &mdash; {spot.total} recorded,
                  {' '}no patrol area written this way.
                </li>
              ))}
            </ul>
          )}
          </>}
        </section>
      )}
    </div>
  )
}

export default SafetyMapPanel
