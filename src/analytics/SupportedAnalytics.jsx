import { useEffect, useMemo, useState } from 'react'
import { INCIDENT_TYPE_KEYS, incidentTypeLabel } from '../incidents/incidentLabels'
import { filterSafetyIncidents } from '../safetymap/officialIncidentAnalytics'
import { parseDateKey } from '../utils/monthGrid'
import { loadSupportedIncidentRecords } from './supportedAnalyticsApi'
import { PERIODS, periodRange, GRANULARITY_LABELS } from './analyticsPeriods'
import { areaOptions, filterRecords, incidentSummary, NOT_RECORDED } from './incidentAnalytics'
import { BarChart, TrendChart, DistributionChart } from './AnalyticsCharts'
import './SupportedAnalytics.css'

export const EMPTY_ANALYTICS_FILTERS = Object.freeze({ window: 'all', category: '', area: '', from: '', to: '' })

export default function SupportedAnalytics({ filters, onFiltersChange }) {
  const { from, to } = useMemo(() => periodRange(filters.window, undefined, { from: filters.from, to: filters.to }), [filters.window, filters.from, filters.to])
  const rangeProblem = filters.window === 'custom' &&
    ((!from && !to) || (from && !parseDateKey(from)) || (to && !parseDateKey(to)) || (from && to && from > to))
  const key = `${from}|${to}`
  const [source, setSource] = useState({ key: '', status: 'loading', rows: [] })
  useEffect(() => {
    let live = true
    if (rangeProblem) return () => { live = false }
    setSource({ key, status: 'loading', rows: [] })
    loadSupportedIncidentRecords({ from, to }).then(data => {
      if (live) setSource({ ...data, key, status: 'ready' })
    }).catch(error => {
      if (live) setSource({ key, status: 'error', rows: [], problem: error.kind })
    })
    return () => { live = false }
  }, [from, to, key, rangeProblem])
  const periodRows = useMemo(() => filterSafetyIncidents(source.rows, { from, to }), [source.rows, from, to])
  const rows = useMemo(() => filterRecords(periodRows, { category: filters.category, area: source.hasAreas ? filters.area : '' }), [periodRows, filters.category, filters.area, source.hasAreas])
  const stats = useMemo(() => incidentSummary(rows, { from, to }), [rows, from, to])
  const areas = useMemo(() => areaOptions(periodRows, filters.category), [periodRows, filters.category])
  const change = (field, value) => onFiltersChange({ ...filters, [field]: value, ...(field === 'area' ? {} : { area: '' }) })
  const ready = source.key === key && source.status === 'ready' && !rangeProblem
  return <div className="supported-analytics">
    <section className="dashboard-card ai-toolbar">
      <h2>Analytics &amp; Insights</h2>
      <p className="ai-intro">Explore patterns in recorded incidents using the filters below.</p>
      <div className="ai-filter-grid">
        <label>Period<select value={filters.window} onChange={event => change('window', event.target.value)}>{PERIODS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {filters.window === 'custom' && <>
          <label>Analytics from date<input type="date" value={filters.from} onChange={event => change('from', event.target.value)} /></label>
          <label>Analytics up to date<input type="date" value={filters.to} onChange={event => change('to', event.target.value)} /></label>
        </>}
        <label>Incident category<select value={filters.category} onChange={event => change('category', event.target.value)}><option value="">All categories</option>{INCIDENT_TYPE_KEYS.map(type => <option key={type} value={type}>{incidentTypeLabel(type)}</option>)}</select></label>
        <label>Recorded area<select value={filters.area} disabled={!ready || !source.hasAreas} onChange={event => change('area', event.target.value)}><option value="">All recorded areas</option>{areas.map(area => <option key={area} value={area}>{area}</option>)}</select></label>
        <button type="button" className="btn-cancel" onClick={() => onFiltersChange({ ...EMPTY_ANALYTICS_FILTERS })}>Reset analytics filters</button>
      </div>
      <p className="ai-filter-summary" aria-live="polite">{PERIODS.find(([value]) => value === filters.window)?.[1]}{filters.window === 'custom' ? ` | ${filters.from || 'Open start'} to ${filters.to || 'Open end'}` : ''} | {filters.category ? incidentTypeLabel(filters.category) : 'All categories'} | {source.hasAreas && filters.area ? filters.area : 'All recorded areas'}</p>
      <p className="ai-scope">Recorded incidents are not crime-risk predictions or proof of wrongdoing.</p>
      <details className="ai-methodology"><summary>How these statistics are calculated</summary>
        <ul>
          <li>Filters apply to all charts here, independently of Incident Map and Patrol Coverage. Dates use incident occurrence in Asia/Manila, not record creation.</li>
          <li>Time charts use daily buckets up to 31 days, Monday-start weeks up to 92 days, and calendar months beyond. Partial buckets count only selected days. For an unbounded period, usable occurrence dates define the chart extent.</li>
          <li>Recorded area means a nonblank area note, otherwise location text, trimmed and otherwise exactly as recorded. It is not a coordinate or an administrative boundary. Missing areas are shown separately and excluded from the distinct-area count.</li>
          <li>Each incident ID is counted once, including incidents without coordinates. Blotter links do not add incident records; the linked count requires reader-supplied metadata.</li>
          <li>Statistics describe only records available to the incident reader, not all events in the community. Missing dates and unavailable metadata are identified below; incomplete reads do not produce analytical totals.</li>
        </ul>
      </details>
    </section>
    {rangeProblem ? <p role="alert">Choose a valid analytics date range.</p> : source.key !== key || source.status === 'loading' ? <p role="status">Loading incident analytics...</p> : source.status === 'error' ? <p role="alert">{source.problem === 'denied' ? 'Incident analytics are not available for your account. Check your session and permissions.' : source.problem === 'incomplete' ? 'Complete incident data could not be verified. No analytical totals are shown. Narrow the period or try again.' : 'Incident analytics could not be loaded. Try again.'}</p> : <>
      <section className="ai-results" aria-label="Incident analytics">
        <h2 className="visually-hidden">Incident analytics</h2>
        <div className="analytics-summary">
          <div><strong>{stats.total}</strong><span>Incident records</span></div>
          <div><strong>{source.hasBlotters ? rows.filter(row => row.has_blotter).length : 'Unavailable'}</strong><span>With a blotter entry</span></div>
          <div><strong>{source.hasAreas ? stats.areas.filter(area => area.key !== NOT_RECORDED).length : 'Unavailable'}</strong><span>Distinct recorded areas</span></div>
        </div>
        {!source.hasBlotters && <p>The incident reader did not supply blotter-link metadata; no linked count is inferred.</p>}
        {!source.hasAreas && <p>Recorded-area metadata is unavailable; area filtering and breakdown are omitted.</p>}
        {stats.total === 0 && <p>No incidents were recorded for this selection.</p>}
        <TrendChart title="Incidents over time" series={stats.series} granularityLabel={GRANULARITY_LABELS[stats.granularity]} />
        <div className="analytics-insights-grid">
          <BarChart title="Incident categories" rows={stats.categories} unit="incident" interpretationNote="The denominator is the incident records in the current analytics selection." />
          <DistributionChart title="Incident statuses" rows={stats.statuses} />
          {source.hasAreas && <BarChart title="Recorded areas" rows={stats.areas} unit="incident" interpretationNote="Areas are recorded text groups, not administrative boundaries. Not recorded is missing area information, not a place." />}
          <DistributionChart title="Day of week" rows={stats.weekdays} columns shortLabels interpretationNote="Only records with usable occurrence dates are included, using Asia/Manila weekdays; these are counts, not rates per weekday." />
          <DistributionChart title="Time of day" rows={stats.timeBands} columns wide interpretationNote="Only records with usable occurrence times are included, using Asia/Manila four-hour bands." />
        </div>
        {stats.undated > 0 && <p>{stats.undated} incident record(s) have no usable occurrence date. They are included in unbounded totals, but excluded from time, weekday and time-of-day charts. Bounded periods exclude undated records.</p>}

      </section>
    </>}
  </div>
}
