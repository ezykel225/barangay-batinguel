import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FaMapMarkerAlt, FaUser, FaUserShield } from 'react-icons/fa'
import PortalDetailsDialog from '../components/PortalDetailsDialog'
import { residentName } from './directoryData'
import { describeVerification } from '../utils/residentGroups'
import { purokLabel } from './residentPresentation'
import { residentBirthDateLabel, residentMobileLabel } from './residentProfileDisplay'
import {
  PERIOD_PRESETS, analyticsUnavailableReason, customPeriodProblem, periodRange,
  profileSummary, residentAnalytics, uniqueIncidents, visibleTimeline,
} from './residentProfileData'
import { loadPersonAnalytics, loadPersonHistory } from '../people/peopleApi'
import { settlePersonRecord } from '../people/personRecord'
import { incidentDate, incidentStatusLabel, incidentTypeLabel } from '../incidents/incidentLabels'
import { complaintCategoryLabel, complaintStatusLabel } from '../complaints/complaintLabels'
import CreditProfile from '../communityCredit/CreditProfile'
import './ResidentProfileDialog.css'
import '../people/PeopleHistory.css'

// ONE resident profile: this dialog. It is opened from the Barangay Residents
// directory by the resident's directory id (barangay_residents.id), never by
// name. It reads only what it read before -- person_history, person_analytics
// and community_credit_profile -- and adds no query of its own.

export function ResidentAvatar({ resident, profile }) {
  const [failed, setFailed] = useState(false)
  let photo = ''
  try { const url=new URL(profile?.photo_url); if(['https:','http:'].includes(url.protocol)) photo=url.href } catch {}
  const initials = [resident.first_name?.trim()[0],resident.last_name?.trim()[0]].filter(Boolean).join('').toUpperCase() || 'R'
  return <div className="resident-profile-avatar">{photo && !failed ? <img src={photo} alt={`${residentName(resident)} profile`} onError={()=>setFailed(true)}/> : <span aria-label={`${residentName(resident)} initials`}>{initials}</span>}</div>
}

const TABS = [['information','Information'],['history','History'],['analytics','Analytics'],['credit','Community Credit']]
const ROLE_LABELS = { victim:'Victim', witness:'Witness', reporting_party:'Reporting party', respondent:'Respondent', subject:'Subject', other_involved:'Other involved person', complainant:'Complainant' }
const OUTCOME_LABELS = { not_determined:'Not determined', substantiated:'Substantiated', not_substantiated:'Not substantiated', referred:'Referred', closed:'Closed (procedural)', unknown:'Unknown' }
const roleLabel = value => ROLE_LABELS[value] || String(value || '').replaceAll('_',' ')
const outcomeLabel = value => OUTCOME_LABELS[value] || String(value || '').replaceAll('_',' ')
const dateLabel = value => incidentDate(value) || 'Date not recorded'

// A column the directory reader did not return is RESTRICTED for this
// account, not missing: community_credit_resident_directory() returns no
// birth date or mobile number, so "Not recorded" would be untrue.
const fieldLabel = (resident, key, format) => (key in resident ? format(resident[key]) : 'Not shown to your account')

const Figures = ({ title, rows, label = v => v, empty = 'No linked records in this period.' }) =>
  <section className="rp-figures"><h4>{title}</h4>{rows.length
    ? <ul>{rows.map(row => <li key={row.key}><span>{label(row.key)}</span><strong>{row.total}</strong></li>)}</ul>
    : <p>{empty}</p>}</section>

function SummaryCard({ label, value, status }) {
  return <div className="rp-summary-card"><dt>{label}</dt><dd>{status === 'ready' ? value : <span className="rp-summary-pending">{status === 'loading' ? 'Loading...' : 'Unavailable'}</span>}</dd></div>
}

function HistoryTab({ status, history, canViewRestricted }) {
  const [view, setView] = useState('incidents')
  if (status === 'loading') return <p role="status">Loading linked history...</p>
  if (status === 'failed') return <p role="alert">Linked history is unavailable or your account cannot view it.</p>
  const incidents = uniqueIncidents(history)
  const complaints = canViewRestricted ? history.complaints || [] : []
  const timeline = visibleTimeline(history, { canViewComplaints: canViewRestricted })
  const views = [['incidents','Incidents & Blotter'], ...(canViewRestricted ? [['complaints','Complaints & KP']] : []), ['timeline','Timeline']]
  return <div className="rp-history">
    <div className="rp-subviews" role="group" aria-label="History records">{views.map(([id,text]) =>
      <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{text}</button>)}</div>
    {!canViewRestricted && <p className="rp-note">Complaint and KP records are shown only to authorized records staff, as in the Complaints module.</p>}
    {view === 'incidents' && (!incidents.length ? <p>No linked incident or blotter records yet.</p> : <ul className="rp-records">{incidents.map(r =>
      <li key={r.incident_id}><strong>{r.reference}</strong><span>{incidentTypeLabel(r.type)} · {dateLabel(r.occurred_at)}</span>
        <span>Status: {incidentStatusLabel(r.status) || 'Not recorded'}</span><span>Role: {r.roles.map(roleLabel).join(', ') || 'Not recorded'}</span>
        <span>Recorded outcome: {outcomeLabel(r.outcome)}</span>
        {r.blotter_reference && <span>Blotter: {r.blotter_reference}</span>}{r.kp_reference && <span>Linked KP case: {r.kp_reference}</span>}</li>)}</ul>)}
    {view === 'complaints' && canViewRestricted && (!complaints.length ? <p>No linked complaint or KP records yet.</p> : <ul className="rp-records">{complaints.map(r =>
      <li key={r.complaint_id}><strong>{r.reference}</strong><span>{complaintCategoryLabel(r.category)} · {dateLabel(r.created_at)}</span>
        <span>Status: {complaintStatusLabel(r.status)}</span><span>Role: {(r.roles || []).map(roleLabel).join(', ')}</span>
        {r.kp_reference && <span>KP case: {r.kp_reference}</span>}
        {r.linked_incident_references?.length > 0 && <span>Linked incidents: {r.linked_incident_references.join(', ')}</span>}</li>)}</ul>)}
    {view === 'timeline' && (!timeline.length ? <p>No linked history is available yet.</p> : <ol className="rp-timeline">{timeline.map((entry, i) =>
      <li key={`${entry.matter_key || entry.kind}-${i}`}><time>{dateLabel(entry.occurred_at)}</time><strong>{entry.kind === 'incident' ? 'Incident' : 'Complaint'}</strong><span>{entry.record?.reference || 'Recorded matter'}</span></li>)}</ol>)}
  </div>
}

const UNAVAILABLE = {
  not_installed: 'Resident analytics are not available yet. They need a database update (migration 062) that has not been installed.',
  not_permitted: 'Resident analytics are not available for this account.',
  failed: 'Resident analytics are unavailable right now. The rest of the profile is still shown.',
}

function AnalyticsTab({ status, record, canViewRestricted }) {
  const [preset, setPreset] = useState('all')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const problem = customPeriodProblem(preset, from, to)
  const range = problem ? null : periodRange(preset, { from, to })
  const rangeFrom = range ? range.from : null, rangeTo = range ? range.to : null
  const result = useMemo(() => (record?.analytics
    ? residentAnalytics(record.analytics, { canViewComplaints: canViewRestricted, range: rangeFrom === null ? null : { from: rangeFrom, to: rangeTo } })
    : null), [record, canViewRestricted, rangeFrom, rangeTo])
  if (status === 'loading') return <p role="status">Loading resident analytics...</p>
  if (status === 'failed' || !result) return <p role="alert">{UNAVAILABLE[status === 'failed' ? 'failed' : analyticsUnavailableReason(record?.analyticsError)]}</p>
  return <div className="rp-analytics">
    <p className="rp-note">Descriptive counts from verified linked records only. Records not linked to this resident are not counted. These figures do not rate the resident or establish wrongdoing.</p>
    <div className="rp-period">
      <label>Period<select value={preset} onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') { setFrom(''); setTo('') } }}>
        {PERIOD_PRESETS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      {preset === 'custom' && <><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}
      <small>Dates follow Philippine time (Asia/Manila). Weeks run Monday to Sunday.</small>
    </div>
    {problem ? <p role="status">{problem}</p> : <>
      <dl className="rp-summary rp-analytics-summary"><div className="rp-summary-card"><dt>Linked incidents</dt><dd>{result.incidentCount}</dd></div>
        {canViewRestricted && <div className="rp-summary-card"><dt>Linked complaints</dt><dd>{result.complaintCount}</dd></div>}</dl>
      {result.pattern && <p className="rp-pattern">{result.pattern}</p>}
      <div className="rp-figures-grid">
        <Figures title="Incident categories" rows={result.incidentCategories} label={incidentTypeLabel} />
        {canViewRestricted && <Figures title="Complaint categories" rows={result.complaintCategories} label={complaintCategoryLabel} />}
        <Figures title="Recorded outcomes (incidents)" rows={result.outcomes} label={outcomeLabel} />
        <Figures title="Day of week (incidents)" rows={result.weekdays} />
        <Figures title="Time of day (incidents)" rows={result.timePeriods} />
        <Figures title="Monthly trend (incidents)" rows={result.monthly} />
        <Figures title="Recorded incident locations" rows={result.incidentLocations} />
        {canViewRestricted && <Figures title="Recorded complaint locations" rows={result.complaintLocations} />}
      </div></>}
  </div>
}

export default function ResidentProfileDialog({ resident, profile, onClose, onEdit, canViewRestricted = false }) {
  const linked = resident.account_linked || resident.profile_id ? 'Linked' : 'Not linked'
  const active = resident.resident_status === 'active'
  const [tab, setTab] = useState('information')
  const [creditOpened, setCreditOpened] = useState(false)
  const [load, setLoad] = useState({ status: 'loading', record: null })
  const tabRefs = useRef({})
  const base = useId()

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading', record: null })
    settlePersonRecord(() => loadPersonHistory('resident', resident.id), () => loadPersonAnalytics('resident', resident.id))
      .then(record => { if (live) setLoad({ status: 'ready', record }) })
      .catch(() => { if (live) setLoad({ status: 'failed', record: null }) })
    return () => { live = false }
  }, [resident.id])

  const select = id => { setTab(id); if (id === 'credit') setCreditOpened(true) }
  const onTabKey = event => {
    const ids = TABS.map(([id]) => id)
    const at = ids.indexOf(tab)
    const next = { ArrowRight: (at + 1) % ids.length, ArrowLeft: (at - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    select(ids[next])
    tabRefs.current[ids[next]]?.focus()
  }
  const summary = load.status === 'ready' ? profileSummary(load.record, { canViewComplaints: canViewRestricted }) : null

  return <div className="resident-profile-dialog"><PortalDetailsDialog title="Resident Profile" onClose={onClose}>
    <div className="resident-profile-heading">
      <ResidentAvatar resident={resident} profile={profile}/>
      <div className="resident-profile-summary">
        <h3 className="resident-profile-name">{residentName(resident)}</h3>
        <div className="resident-profile-status"><span className={`badge ${active?'badge-approved':'badge-pending'}`}>{active?'Active':'Inactive'}</span></div>
        <p className="resident-profile-purok"><FaMapMarkerAlt aria-hidden="true"/><span>{purokLabel(resident.purok) || 'Purok not recorded'}</span></p>
      </div>
      {onEdit&&<button type="button" className="confirm-dialog-confirm" onClick={onEdit}>Edit Resident</button>}
    </div>

    <dl className="rp-summary" aria-label="Linked record summary">
      <SummaryCard label="Incident records" value={summary?.incidents} status={load.status} />
      {canViewRestricted && <SummaryCard label="Complaint records" value={summary?.complaints} status={load.status} />}
      <SummaryCard label="Resolved or closed incidents" value={summary?.resolvedIncidents} status={load.status} />
    </dl>

    <div className="rp-tabs" role="tablist" aria-label="Resident profile sections" onKeyDown={onTabKey}>{TABS.map(([id, text]) =>
      <button key={id} ref={el => { tabRefs.current[id] = el }} type="button" role="tab" id={`${base}-tab-${id}`} aria-controls={`${base}-panel-${id}`}
        aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => select(id)}>{text}</button>)}</div>

    <div role="tabpanel" id={`${base}-panel-information`} aria-labelledby={`${base}-tab-information`} hidden={tab !== 'information'} tabIndex={0} className="rp-panel">
      <div className="resident-profile-sections">
        <section className="resident-profile-section" aria-label="Personal Information">
          <h3><FaUser aria-hidden="true"/>Personal Information</h3>
          <dl><div><dt>Full name</dt><dd>{residentName(resident)}</dd></div>
            <div><dt>Purok</dt><dd>{purokLabel(resident.purok) || 'Not recorded'}</dd></div>
            <div><dt>Birth date</dt><dd>{fieldLabel(resident, 'birth_date', residentBirthDateLabel)}</dd></div>
            <div><dt>Mobile number</dt><dd>{fieldLabel(resident, 'mobile_number', residentMobileLabel)}</dd></div>
            <div><dt>Resident status</dt><dd>{active ? 'Active' : 'Inactive'}</dd></div></dl>
        </section>
        <section className="resident-profile-section" aria-label="Account Information">
          <h3><FaUserShield aria-hidden="true"/>Account Information</h3>
          <dl><div><dt>Online account</dt><dd>{linked}</dd></div><div><dt>Account verification</dt><dd><span className="resident-profile-verification">{profile ? describeVerification(profile.verification_status).label : 'Not available'}</span></dd></div></dl>
        </section>
      </div>
    </div>
    <div role="tabpanel" id={`${base}-panel-history`} aria-labelledby={`${base}-tab-history`} hidden={tab !== 'history'} tabIndex={0} className="rp-panel">
      <HistoryTab status={load.status} history={load.record} canViewRestricted={canViewRestricted} />
    </div>
    <div role="tabpanel" id={`${base}-panel-analytics`} aria-labelledby={`${base}-tab-analytics`} hidden={tab !== 'analytics'} tabIndex={0} className="rp-panel">
      {tab === 'analytics' && <AnalyticsTab status={load.status} record={load.record} canViewRestricted={canViewRestricted} />}
    </div>
    <div role="tabpanel" id={`${base}-panel-credit`} aria-labelledby={`${base}-tab-credit`} hidden={tab !== 'credit'} tabIndex={0} className="rp-panel">
      {/* Loaded on first open, then kept: the score is the existing CreditProfile, unchanged. */}
      {creditOpened && <CreditProfile residentId={resident.id} />}
    </div>
  </PortalDetailsDialog></div>
}
