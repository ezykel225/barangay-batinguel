// Accessible charts drawn from real query rows. No chart library: these are
// HTML bars sized by percentage, so they reflow on any width, need no canvas
// and no new dependency, and every value is also printed as text.
//
// Each chart carries the same facts three ways: the bars (decorative, hidden
// from assistive technology), a printed value beside every bar, and a data
// table behind a disclosure. A chart is never given a value it was not handed.
import { useId } from 'react'
import { seriesSummary } from './incidentAnalytics'
import DescriptiveInterpretation from './DescriptiveInterpretation'

// A zero is drawn as nothing; any non-zero value stays visible as at least a sliver.
const percent = (value, max) => (max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0)

export function DataTable({ caption, rows, valueLabel = 'Records' }) {
  return <details className="ai-table"><summary>Show data table</summary>
    <div className="ai-table-scroll" tabIndex={0} aria-label={`${caption} data table`}><table className="ai-data-table"><caption className="visually-hidden">{caption}</caption>
      <thead><tr><th scope="col">Label</th><th scope="col">{valueLabel}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.total}</td></tr>)}</tbody></table></div>
  </details>
}

// Presentation only: values and ordering come directly from the existing summary.
export function DistributionChart({ title, rows, columns = false, wide = false, shortLabels = false, interpretationNote }) {
  const id = useId()
  const max = Math.max(0, ...rows.map(row => row.total))
  return <section className={`ai-chart ai-distribution${wide ? ' ai-wide' : ''}`} aria-labelledby={`${id}-t`}>
    <h3 id={`${id}-t`}>{title}</h3>
    {!max ? <p className="ai-empty">No incidents in this selection.</p> : <ul className={columns ? 'ai-distribution-columns' : 'ai-status-distribution'}>
      {rows.map(row => <li key={row.key}>
        {columns && <span className="ai-distribution-track" aria-hidden="true"><span style={{ height: `${percent(row.total, max)}%` }} /></span>}
        <span className="ai-distribution-label">{shortLabels ? <abbr title={row.label} aria-label={row.label}>{row.label.slice(0, 3)}</abbr> : row.label}</span><strong>{row.total}</strong>
      </li>)}
    </ul>}
    <DataTable caption={title} rows={rows} valueLabel="Incidents" />
    <DescriptiveInterpretation title={title} rows={rows} unit="incidents" note={interpretationNote} />
  </section>
}

// Horizontal bars. With onSelect the rows are real buttons (aria-pressed says
// which one is chosen); without it they are plain list items, because a
// disabled-looking button that does nothing is worse than no button.
export function BarChart({ title, rows, unit = 'record', onSelect, selectedKey = '', note, hideZero = false, interpretationNote }) {
  const id = useId()
  const shown = hideZero ? rows.filter((row) => row.total > 0) : rows
  const max = Math.max(0, ...shown.map((row) => row.total))
  const total = shown.reduce((sum, row) => sum + row.total, 0)
  return <section className="ai-chart" aria-labelledby={`${id}-t`}>
    <h3 id={`${id}-t`}>{title}</h3>{note && <p className="ai-chart-note">{note}</p>}
    {!shown.length || !total ? <p className="ai-empty">No {unit}s in this selection.</p> : <>
      <ul className="ai-bars">{shown.map((row) => {
        const inner = <><span className="ai-bar-label">{row.label}</span><span className="ai-bar-track" aria-hidden="true"><span className="ai-bar-fill" style={{ width: `${percent(row.total, max)}%` }} /></span><strong className="ai-bar-value">{row.total}</strong></>
        return <li key={row.key}>{onSelect
          ? <button type="button" className="ai-bar-row" aria-pressed={selectedKey === row.key} onClick={() => onSelect(row.key)} aria-label={`${row.label}: ${row.total} ${unit}${row.total === 1 ? '' : 's'}${selectedKey === row.key ? ', selected' : ''}`}>{inner}</button>
          : <div className="ai-bar-row">{inner}</div>}</li>
      })}</ul>
      <DataTable caption={title} rows={shown} />
    </>}
    <DescriptiveInterpretation title={title} rows={shown} unit={`${unit}s`} note={interpretationNote} />
  </section>
}

// Columns over time. The bars are hidden from assistive technology; the
// sentence and the table carry the same numbers.
export function TrendChart({ title, series, granularityLabel, unit = 'incident', interpretationNote }) {
  const id = useId()
  const max = Math.max(0, ...series.map((row) => row.total))
  const summary = seriesSummary(series, unit)
  const dense = series.length > 16
  return <section className="ai-chart ai-trend" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
    <h3 id={`${id}-t`}>{title}</h3><p className="ai-chart-note">{granularityLabel}</p>
    <p id={`${id}-s`} className="ai-summary">{summary}</p>
    {series.length > 0 && <>
      <div className={`ai-columns${dense ? ' is-dense' : ''}`} aria-hidden="true">{series.map((row) => <div key={row.key} className="ai-column" title={`${row.label}: ${row.total}`}>
        <span className="ai-column-value">{row.total > 0 ? row.total : ''}</span>
        <span className="ai-column-bar" style={{ height: `${percent(row.total, max)}%` }} />
        <span className="ai-column-label">{row.label}</span></div>)}</div>
      <DataTable caption={title} rows={series} valueLabel="Incidents" />
    </>}
    <DescriptiveInterpretation title={title} rows={series} mode="time" unit={`${unit}s`} note={interpretationNote || 'Only displayed buckets are summarized; partial buckets are not normalized to equal exposure.'} />
  </section>
}
