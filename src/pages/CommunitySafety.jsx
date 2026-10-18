import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaShieldAlt } from 'react-icons/fa'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import PublicSafetyMap from '../safetymap/PublicSafetyMap'
import { monthLabel, trendSeries } from '../safetymap/safetyAnalytics'
import {
  loadPublicMonthly, loadPublicOverview, loadPublicTypeCounts, loadPublicZones, loadPublicZoneTypeCounts,
} from '../safetymap/publicSafetyApi'
import {
  AGGREGATION_NOTE, CONCENTRATION_LABEL, EMPTY_NOTHING_MAPPED,
  EMPTY_NOTHING_RECORDED, NO_LOCATION_NAMES_NOTE, PAGE_INTRO, PAGE_TITLE,
  EMPTY_NO_ZONES, PUBLIC_DISCLAIMER, SAFETY_ERRORS, SHADING_NOTE,
  THRESHOLD_NOTE, coverageSentence, incidentTypeLabel, publicObservation,
} from '../safetymap/publicSafetyLabels'
import './PageIntro.css'
import './CommunitySafety.css'

// Final Integration — the PUBLIC Community Safety Map.
//
// ─── ⚠️ ONE PUBLIC SURFACE, NOT A SECOND RESIDENT ONE ───────────────────────
//
// This page is reached at `/community-safety` with NO gate: an anonymous
// visitor and a signed-in resident load the same route, call the same four
// RPCs and see the same numbers. Measured as both: identical overview,
// identical zones. A resident-only copy would be a second data surface to
// keep in step, and the one that drifted would be the one nobody tested.
//
// ⚠️ IT IS NOT A SANITISED VIEW OF THE OFFICIAL MAP. Nothing here calls
// `incident_map_points`, `incident_queue`, `incident_location_frequency`,
// `tanod_roster` or `tanod_coverage_summary` -- anon is refused 42501 by
// every one of them, measured, and a test asserts their names appear in
// neither this file nor `publicSafetyApi.js`. The public numbers come from
// migration 045's own aggregate functions.
//
// ─── ⚠️ WHAT THIS PAGE CAN NEVER SHOW ───────────────────────────────────────
//
// No narrative, no reference, no street or place name, no date finer than a
// month, no status, no incident id, no complainant, respondent or witness,
// no contact number, no evidence, no complaint, no KP screening, no KP case,
// no blotter content, and nothing whatever about a Tanod or a patrol. Those
// are absent because the FUNCTIONS DO NOT RETURN THEM, not because this
// component filters them out -- so no edit here can expose one.

export const communityPeriods = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year').value)
  const month = Number(parts.find((part) => part.type === 'month').value)
  const options = [0, 1, 2].map((offset) => {
    const start = new Date(Date.UTC(year, month - 1 - offset, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    const from = start.toISOString().slice(0, 10)
    return {
      key: offset === 0 ? 'current' : from.slice(0, 7),
      label: offset === 0 ? 'This month' : new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC', month: 'long', year: 'numeric',
      }).format(start),
      monthName: new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC', month: 'long', year: 'numeric',
      }).format(start),
      from, to: end.toISOString().slice(0, 10),
    }
  })
  return [...options, { key: 'all', label: 'All recorded' }]
}

const CommunitySafety = () => {
  const [period, setPeriod] = useState('current')
  const [periods, setPeriods] = useState(() => communityPeriods())
  const chosen = periods.find((option) => option.key === period) || periods[0]
  const { from, to } = chosen
  const [overview, setOverview] = useState({
    total_incidents: 0, mapped_incidents: 0, zone_count: 0,
  })
  const [zones, setZones] = useState([])
  const [zoneTypes, setZoneTypes] = useState([])
  const [types, setTypes] = useState([])
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const timer = setInterval(() => {
      const next = communityPeriods()
      setPeriods((previous) => previous[0].from === next[0].from ? previous : next)
      setPeriod((previous) => next.some((option) => option.key === previous) ? previous : 'current')
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      setLoading(true)
      setProblem('')
      const opts = { from, to }
      try {
        const [o, z, t, m, zt] = await Promise.all([
          loadPublicOverview(opts),
          loadPublicZones(opts),
          loadPublicTypeCounts(opts),
          loadPublicMonthly(),
          loadPublicZoneTypeCounts(opts),
        ])
        if (cancelled) return
        setOverview(o); setZones(z); setTypes(t); setMonthly(m)
        setZoneTypes(zt)
      } catch (err) {
        if (!cancelled) setProblem(SAFETY_ERRORS.loadFailed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [from, to])

  const total = Number(overview.total_incidents) || 0
  const mapped = Number(overview.mapped_incidents) || 0
  const zoneCount = Number(overview.zone_count) || 0
  const typeTotal = types.reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const trend = trendSeries(monthly)
  const selectedMonth = from?.slice(0, 7)
  const selectedMonthTotal = trend.rows.find((row) => row.monthKey === selectedMonth)?.total ?? 0

  return (
    <div className="cs-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <section className="cs-section">
          <div className="cs-container">
            <div className="page-intro">
              <div className="page-intro-row">
                <div className="page-intro-main">
                  <span className="page-intro-icon" aria-hidden="true">
                    <FaShieldAlt />
                  </span>
                  <div className="page-intro-text">
                    <h1>{PAGE_TITLE}</h1>
                    <p>{PAGE_INTRO}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ⚠️ THE PRIVACY RULE IS ON THE PAGE, NOT ONLY IN A MIGRATION
                HEADER. A map that coarsens its data without saying so invites
                the reader to believe a circle is a place. */}
            <div className="cs-notice" role="note">
              <h2>How to use this map</h2>
              <p>This map shows general areas where incidents have been recorded in Barangay Batinguel. Darker colors mean more reports were recorded in that area.</p>
              <p>Tap or click a colored area to see the types of incidents reported. Exact incident locations and personal information are not shown.</p>
              <p>You can also read the same information in “Recorded areas as a list” below the map.</p>
              <details className="cs-privacy">
                <summary>How does this map protect privacy?</summary>
                <ul>
                <li>{AGGREGATION_NOTE}</li>
                <li>{THRESHOLD_NOTE}</li>
                {/* ⚠️ What the shading MEANS, beside the other three
                    rules rather than only in the key: a reader who has
                    not scrolled to the legend still needs to know that a
                    darker square is a bigger COUNT and not a verdict. */}
                <li>{SHADING_NOTE}</li>
                <li>{NO_LOCATION_NAMES_NOTE}</li>
                </ul>
                <p className="cs-disclaimer">{PUBLIC_DISCLAIMER}</p>
              </details>
            </div>

            {problem && (
              <p className="cs-problem" role="alert">{problem}</p>
            )}

            <div className="cs-filters">
              <label htmlFor="cs-period">Period</label>
              <select
                id="cs-period" className="filter-select" value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="cs-empty">Loading the community safety map...</p>
            ) : problem ? null : (
              <>
                <div className="cs-stats">
                  <div className="cs-stat">
                    <span className="cs-stat-value">{total}</span>
                    <span className="cs-stat-label">Incidents recorded</span>
                  </div>
                  <div className="cs-stat">
                    <span className="cs-stat-value">{zoneCount}</span>
                    <span className="cs-stat-label">Areas shown on the map</span>
                  </div>
                  <div className="cs-stat">
                    <span className="cs-stat-value">{mapped}</span>
                    <span className="cs-stat-label">Incidents inside those areas</span>
                  </div>
                </div>

                <h2>{CONCENTRATION_LABEL}</h2>
                <p className="cs-caption" aria-live="polite">
                  {chosen.monthName ? `Showing recorded incidents for ${chosen.monthName}. ` : 'Showing all recorded incidents. '}
                  <span>{coverageSentence(mapped, total)}</span>
                </p>

                {/* ⚠️ THE MAP RENDERS UNCONDITIONALLY, AND THAT IS A FIX.
                    It used to be inside the `zones.length > 0` branch, so a
                    period with nothing publishable showed a sentence where
                    the map had been -- and a reader could not tell "nothing
                    to show here" from "the map failed to load". The basemap
                    is the context that makes the empty answer legible, which
                    is the same reason the Archived Officials panel renders
                    when it finds nothing.
                    ⚠️ Passing `zones` empty is safe by construction: the
                    canvas builds its basemap in an effect that does not
                    depend on `zones` at all. */}
                <PublicSafetyMap zones={zones} zoneTypes={zoneTypes} />

                {/* ⚠️ THREE DIFFERENT FACTS, STILL NOT COLLAPSED. "Nothing
                    recorded", "recorded but nothing reaches the threshold"
                    and "nothing publishable in this period" are separate
                    answers, and the map is on screen for all three. */}
                {total === 0 ? (
                  <p className="cs-empty">{EMPTY_NOTHING_RECORDED}</p>
                ) : zones.length === 0 ? (
                  <>
                    <p className="cs-empty">{EMPTY_NO_ZONES}</p>
                    <p className="cs-caption">{EMPTY_NOTHING_MAPPED}</p>
                  </>
                ) : (
                  <>
                    {/* ⚠️ The legend moved INTO the map component with the
                        bands it describes. It used to be drawn here from
                        `INTENSITY_BANDS`, which is the official panel's
                        PEAK-RELATIVE scale -- so the key named a band the
                        public map's fixed thresholds no longer used. One
                        home for the bands, beside the thing they colour. */}
                    <h3>What the areas show</h3>
                    <ul className="cs-observations">
                      {zones.slice(0, 5).map((zone, index) => (
                        <li key={zone.zone_key || index}>
                          {publicObservation(zone, index + 1)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <h2>Recorded incidents by type</h2>
                {types.length === 0 ? (
                  <p className="cs-empty">{EMPTY_NOTHING_RECORDED}</p>
                ) : (
                  <ul className="cs-bars">
                    {types.map((row) => (
                      <li key={row.incident_type}>
                        <span className="cs-bar-label">
                          {incidentTypeLabel(row.incident_type)}
                        </span>
                        <span className="cs-bar-track">
                          <span
                            className="cs-bar-fill"
                            style={{
                              width: `${typeTotal
                                ? Math.round((row.total / typeTotal) * 100) : 0}%`,
                            }}
                          />
                        </span>
                        <span className="cs-bar-value">{row.total}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* ⚠️ These are the barangay's own OPERATIONAL categories, not
                    offence codes, and the page says so where a reader meets
                    them rather than only in a header. */}
                <p className="cs-note">
                  These are the categories the barangay uses to record what
                  happened. They are not criminal charges, and no finding has
                  been made about any of them.
                </p>

                <h2>Recorded incidents by month</h2>
                <p className="cs-note" aria-live="polite">
                  {selectedMonth
                    ? `${chosen.monthName} selected — ${selectedMonthTotal} recorded incident${selectedMonthTotal === 1 ? '' : 's'}.`
                    : 'All recorded months, for comparison.'}
                </p>
                {trend.rows.length === 0 ? (
                  <p className="cs-empty">{EMPTY_NOTHING_RECORDED}</p>
                ) : (
                  <ul className="cs-trend">
                    {trend.rows.map((row) => (
                      <li key={row.monthKey}
                        className={selectedMonth ? (row.monthKey === selectedMonth ? 'cs-trend-selected' : 'cs-trend-other') : undefined}
                        aria-current={row.monthKey === selectedMonth ? 'true' : undefined}>
                        <span
                          className="cs-trend-bar"
                          style={{
                            height: `${trend.peak
                              ? Math.max(6, Math.round((row.total / trend.peak) * 90)) : 6}px`,
                          }}
                          aria-hidden="true"
                        />
                        <span className="cs-trend-label">
                          {row.label || monthLabel(row.monthKey)}
                        </span>
                        <span className="cs-trend-value">{row.total}</span>
                        <span className="cs-trend-selection">{row.monthKey === selectedMonth ? 'Selected' : null}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ⚠️ NO PHONE NUMBER, for the reason the complaint form's
                emergency notice records: the only numbers this repository
                holds are the Barangay Hall's own office lines, which keep
                office hours with a lunch closure, and presenting those as
                emergency response would be untrue. Inventing a police or
                hotline number would be worse. */}
            <div className="cs-notice cs-notice-last" role="note">
              <h2>If you need to report something</h2>
              <p>
                This page is a record of what has already been reported. It is
                not an emergency service and nobody is alerted by it. For an
                emergency, contact your local emergency or police service
                directly. To report something to the barangay, visit the
                Barangay Hall, or{' '}
                <Link to="/resident?tab=complaints">file a complaint</Link>
                {' '}with a resident account.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default CommunitySafety
