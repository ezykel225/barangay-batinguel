import { useEffect, useMemo, useState } from 'react'
import { FaChartBar, FaInfoCircle, FaMapMarkedAlt, FaShieldAlt } from 'react-icons/fa'

import { INCIDENT_TYPE_KEYS, commonTypeLabel, incidentStatusLabel, incidentTypeLabel } from '../incidents/incidentLabels'
import IncidentMap from './IncidentMap'
import {
  COVERAGE_CAVEAT, OBSERVATION_DISCLAIMER, bandFor, coverageGaps, coverageTotals,
  locationKey, observationFor, plottablePoints, rankHotspots, totalFrom, trendSeries,
} from './safetyAnalytics'
import {
  SAFETY_ERRORS, loadCoverageSummary, loadSafetyIncidents,
} from './safetyApi'
import { filterSafetyIncidents, safetyAnalyticsFor } from './officialIncidentAnalytics'
import { loadBarangayAnalytics } from '../analytics/analyticsApi'
import { displayLabel } from '../people/PeopleHistory'
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
// ⚠️ THE NUMBERS ARE COUNTS. No rate, no per-capita figure, no score and no
// prediction -- see `safetyAnalytics.js` for why, and for the rule that an
// observation may prompt a review and may never recommend an action.

const SafetyMapPanel = () => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')

  const [incidents, setIncidents] = useState([])
  const [coverageResult, setCoverage] = useState(null)
  const [coverageProblem, setCoverageProblem] = useState('')
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [linkedAnalytics, setLinkedAnalytics] = useState(null)
  useEffect(() => {
    let live = true
    loadSafetyIncidents().then(rows => { if (live) setIncidents(rows) })
      .catch(() => { if (live) setProblem(SAFETY_ERRORS.loadFailed) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])
  // Patrol assignments retain their independent date semantics. A late response
  // must never overwrite the coverage for a newer date selection.
  useEffect(() => {
    let live = true
    setCoverage(null)
    setCoverageProblem('')
    loadCoverageSummary({ from, to }).then(rows => { if (live) setCoverage({ from, to, rows }) })
      .catch(() => { if (live) setCoverageProblem(SAFETY_ERRORS.analyticsFailed) })
    return () => { live = false }
  }, [from, to])
  useEffect(() => {
    let live = true
    loadBarangayAnalytics({ from, to, category: type }).then(result => { if (live) setLinkedAnalytics(result) })
      .catch(() => { if (live) setLinkedAnalytics(null) })
    return () => { live = false }
  }, [from, to, type])
  const filteredIncidents = useMemo(() => filterSafetyIncidents(incidents, { type, from, to }), [incidents, type, from, to])
  const { points, byType, byStatus, monthly, locations, mapHotspots } = useMemo(() => safetyAnalyticsFor(filteredIncidents), [filteredIncidents])
  const coverage = coverageResult?.from === from && coverageResult?.to === to ? coverageResult.rows : []
  const total = totalFrom(byType)
  const hotspots = rankHotspots(locations)
  const gaps = coverageGaps(locations, coverage)
  const cover = coverageTotals(coverage)
  const trend = trendSeries(monthly)
  const peak = hotspots.reduce((max, h) => Math.max(max, Number(h.total) || 0), 0)
  const coveredKeys = coverage.map((row) => row.area_key || locationKey(row.area_label))

  const plotted = plottablePoints(points).length
  const unmapped = filteredIncidents.length - plotted

  return (
    <div>
      <div className="official-dashboard-header">
        <h1>Safety Map &amp; Analytics</h1>
        <p>Where incidents were recorded, how often, and which areas have patrols.</p>
      </div>

      {(problem || coverageProblem) && (
        <p className="smap-problem" role="alert">
          <FaInfoCircle aria-hidden="true" /> {problem || coverageProblem}
        </p>
      )}

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaMapMarkedAlt aria-hidden="true" /> Incident map</h2>
        </div>

        <div className="resident-filter-bar smap-filters">
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
          </>
        )}
      </div>

      <div className="dashboard-card" aria-label="Linked record insights">
        <div className="dashboard-card-header"><h2 className="section-heading"><FaChartBar aria-hidden="true" /> Linked role, outcome and time insights</h2></div>
        <p className="smap-note" role="note"><FaInfoCircle aria-hidden="true" /> These descriptive counts use the same date and incident-type filters as the map. Person-related counts include only verified UUID links.</p>
        {!linkedAnalytics?<p className="complaint-empty">Linked-record insights are unavailable.</p>:<div className="analytics-insights-grid">
          {[['Roles',linkedAnalytics.roles,'role'],['Outcomes',linkedAnalytics.outcomes,'outcome'],['Weekdays',linkedAnalytics.weekdays,'weekday'],['Recorded time periods',linkedAnalytics.time_buckets,'bucket']].map(([title,rows,field])=><section className="analytics-block" key={title}><h3>{title}</h3>{rows?.length?<ul className="analytics-bars">{rows.map((row,index)=><li key={`${row[field]}-${index}`}><div className="analytics-bar"><span>{field==='bucket'?`${Number(row.bucket)*4}:00–${Number(row.bucket)*4+3}:59`:displayLabel(row[field])}</span><strong>{row.total}</strong></div></li>)}</ul>:<p>No matching verified records.</p>}</section>)}
        </div>}
      </div>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaChartBar aria-hidden="true" /> Incident summary</h2>
        </div>

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
          <div className="smap-stat">
            <span className="smap-stat-value">{cover.assignments}</span>
            <span className="smap-stat-label">Active patrol assignments</span>
          </div>
          <div className="smap-stat">
            <span className="smap-stat-value">{cover.areas}</span>
            <span className="smap-stat-label">Areas with a patrol</span>
          </div>
        </div>

        <h3>By type</h3>
        {byType.length === 0 ? (
          <p className="complaint-empty">No incidents in this range.</p>
        ) : (
          <ul className="smap-bars">
            {byType.map((row) => (
              <li key={row.incident_type}>
                <span className="smap-bar-label">{incidentTypeLabel(row.incident_type)}</span>
                <span className="smap-bar-track">
                  <span
                    className="smap-bar-fill"
                    style={{ width: `${total ? Math.round((row.total / total) * 100) : 0}%` }}
                  />
                </span>
                <span className="smap-bar-value">{row.total}</span>
              </li>
            ))}
          </ul>
        )}

        <h3>By status</h3>
        {byStatus.length === 0 ? (
          <p className="complaint-empty">No incidents in this range.</p>
        ) : (
          <ul className="smap-chips">
            {byStatus.map((row) => (
              <li key={row.status}>
                <span className={`kp-badge kp-badge-${row.status}`}>
                  {incidentStatusLabel(row.status)}
                </span>
                <strong>{row.total}</strong>
              </li>
            ))}
          </ul>
        )}

        <h3>Over time</h3>
        {trend.rows.length === 0 ? (
          <p className="complaint-empty">No incidents in this range.</p>
        ) : (
          <ul className="smap-trend">
            {trend.rows.map((row) => (
              <li key={row.monthKey}>
                <span className="smap-trend-bar"
                  style={{ height: `${trend.peak ? Math.max(6, Math.round((row.total / trend.peak) * 90)) : 6}px` }}
                  aria-hidden="true" />
                <span className="smap-trend-label">{row.label}</span>
                <span className="smap-trend-value">{row.total}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaShieldAlt aria-hidden="true" /> Repeated locations and patrol coverage</h2>
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
      </div>
    </div>
  )
}

export default SafetyMapPanel
