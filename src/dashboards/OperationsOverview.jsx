import { FaBullhorn, FaCalendarAlt, FaClipboardList, FaUserCheck } from 'react-icons/fa'
import { countUpcoming, documentStatusLabel } from '../utils/displayLabels'
import './OperationsOverview.css'

// Exact count metadata is RLS-scoped. Never turn a capped/failed read into zero.
export function overviewReadState({ data, error, count }) {
  if (error) return { status: error.code === '42501' ? 'denied' : 'error' }
  return { status: Array.isArray(data) && Number.isInteger(count) && count >= 0 && data.length === count ? 'ready' : 'incomplete' }
}
// No client/query creation here: callers pass their existing authorized read.
export async function readOverviewRows(key, query, setRows, setSources) {
  setSources(previous => ({ ...previous, [key]: { status: 'loading' } }))
  try {
    const result = await query
    if (!result.error) setRows(result.data || [])
    setSources(previous => ({ ...previous, [key]: overviewReadState(result) }))
  } catch {
    setSources(previous => ({ ...previous, [key]: { status: 'error' } }))
  }
}
const stateLabel = state => state?.status === 'loading' || !state ? 'Loading...' : state.status === 'denied' ? 'Restricted' : 'Unavailable'

export default function OperationsOverview({ firstName, positionLabel, availability, documents, residents, announcements, events, sources, isSecretary, isKapitan, onNavigate, now = new Date() }) {
  const ready = key => sources[key]?.status === 'ready'
  const pendingDocuments = documents.filter(row => row.status === 'pending').length
  const pendingResidents = residents.filter(row => row.verification_status === 'pending').length
  const canVerify = isSecretary || isKapitan
  const metrics = [
    ['documents', 'Pending Document Requests', pendingDocuments, 'Awaiting review in your accessible queue', FaClipboardList],
    ['residents', 'Pending Resident Verification', pendingResidents, 'Accounts awaiting review, excluding returned requests', FaUserCheck],
    ['announcements', 'Announcements', announcements.length, 'Announcement records available to your account', FaBullhorn],
    ['events', 'Upcoming Events', countUpcoming(events, 'event_date'), 'Today onward, using Asia/Manila dates', FaCalendarAlt],
  ]
  const work = [
    ...(canVerify ? [{ key: 'residents', count: pendingResidents, title: 'Resident verification requests', note: 'Review pending accounts using the existing verification workflow.', tab: 'residents' }] : []),
    ...(isSecretary ? [{ key: 'documents', count: pendingDocuments, title: 'Document requests awaiting review', note: 'Process pending requests in the document queue.', tab: 'documents' }] : []),
  ]
  const pending = work.filter(item => ready(item.key) && item.count > 0)
  const uncertain = work.filter(item => !ready(item.key))
  const distribution = Object.entries(documents.reduce((counts, row) => {
    const key = row.status || 'not_recorded'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {}))
  return <div className="operations-overview">
    <header className="operations-header">
      <div><p className="operations-eyebrow">Barangay operations overview</p><h1>Official Dashboard</h1>
        <p>Good day, <strong>{firstName}</strong>{positionLabel ? ` | ${positionLabel}` : ''}.</p>
        <time dateTime={now.toISOString()}>{new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(now)}</time>
      </div>
      {availability}
    </header>
    <section className="operations-kpis" aria-label="Operational summary">
      {metrics.map(([key, title, count, note, Icon]) => <article className="operations-kpi" key={key}>
        <span className="operations-icon"><Icon aria-hidden="true" /></span>
        <h2>{title}</h2><strong className="operations-value" aria-live="polite">{ready(key) ? count : stateLabel(sources[key])}</strong><p>{note}</p>
        {!ready(key) && sources[key]?.status !== 'loading' && <small>{sources[key]?.status === 'incomplete' ? 'A complete read could not be confirmed.' : 'Check access or try again later.'}</small>}
      </article>)}
    </section>
    <div className={`operations-panels${ready('documents') ? '' : ' operations-panels-single'}`}>
      <section className="operations-panel" aria-labelledby="operations-attention-title">
        <div className="operations-panel-heading"><span className="operations-eyebrow">Work queue</span><h2 id="operations-attention-title">Needs Attention</h2></div>
        {pending.length > 0 && <ul className="operations-work">{pending.map(item => <li key={item.key}>
          <div><strong>{item.title}</strong><p>{item.note}</p></div><span className="operations-count">{item.count}</span>
          <button type="button" onClick={() => onNavigate(item.tab)}>Open {item.key === 'residents' ? 'resident workspace' : 'document queue'}</button>
        </li>)}</ul>}
        {uncertain.map(item => <p key={item.key} className="operations-notice">{item.title}: {stateLabel(sources[item.key])}. Pending work cannot be confirmed.</p>)}
        {!positionLabel && <p className="operations-notice">Your official position is unavailable or still loading; assigned work is not yet confirmed.</p>}
        {positionLabel && !pending.length && !uncertain.length && <p className="operations-empty">No pending items requiring your attention.</p>}
        {positionLabel && !canVerify && <p className="operations-permission-note">Verification decisions are reserved for the Secretary and Punong Barangay. Document processing is reserved for the Secretary.</p>}
      </section>
      {ready('documents') && <section className="operations-panel" aria-labelledby="operations-service-title">
        <div className="operations-panel-heading"><span className="operations-eyebrow">Service status</span><h2 id="operations-service-title">Document processing</h2></div>
        <p className="operations-context">Current statuses of {documents.length} accessible request{documents.length === 1 ? '' : 's'}; not processing-time estimates.</p>
        {documents.length ? <dl className="operations-distribution">{distribution.map(([status, total]) => <div key={status}><dt>{status === 'not_recorded' ? 'Status not recorded' : documentStatusLabel(status)}</dt><dd>{total}</dd><span className="operations-status-track" aria-hidden="true"><span style={{ width: `${total / documents.length * 100}%` }} /></span></div>)}</dl> : <p className="operations-empty">No document requests in your accessible queue.</p>}
      </section>}
    </div>
  </div>
}
