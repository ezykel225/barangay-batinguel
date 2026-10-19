import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadMyTanodIdentity, loadMyDuty, loadMyReports, checkIn, checkOut } from '../tanod/tanodPortalApi'
import { attendanceOpen, dutyDate, dutyState, dutyTime, manilaInputNow, shiftIsCurrent } from '../tanod/tanodDuty'
import { INCIDENT_TYPE_KEYS, incidentTypeLabel, incidentStatusLabel } from '../incidents/incidentLabels'
import { recordIncident } from '../incidents/incidentApi'
import DeviceLocation from '../incidents/DeviceLocation'
import TanodFollowups from '../tanod/TanodFollowups'
import TanodDutySchedule from '../tanod/TanodDutySchedule'
import { portalAttendanceTime, portalDutyDate, portalShiftWindow, portalShiftLabel } from '../tanod/tanodPresentation'
import Sidebar from '../components/Sidebar'
import TanodSettings from '../tanod/TanodSettings'
import TanodArea from '../tanod/TanodArea'
import { compactTanodName, loadTanodProfile } from '../tanod/tanodProfile'
import { FaClock, FaMapMarkerAlt, FaClipboardList, FaShieldAlt, FaSyncAlt, FaCalendarAlt, FaInfoCircle, FaCheckCircle, FaFilter, FaCommentAlt } from 'react-icons/fa'
import './ResidentDashboard.css'
import '../tanod/TanodPortal.css'

const blankReport = () => ({ incidentType: 'traffic_accident', occurredAt: manilaInputNow(), narrative: '', locationText: '', latitude: '', longitude: '' })
const statusTone = (label) => label === 'Currently on duty' ? 'on' : label === 'Check-out needed' ? 'warning' : label === 'Completed' ? 'completed' : 'scheduled'
const tabs = [['overview','Overview'],['duty','My Duty'],['report','Report Incident'],['reports','My Reports'],['settings','Settings']]

export default function TanodDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [identity, setIdentity] = useState(null)
  const [profile, setProfile] = useState(null)
  const userId = user?.id
  useEffect(() => {
    let live = true
    setProfile(null)
    if (userId) loadTanodProfile(userId).then(value => { if (live) setProfile(value) }).catch(() => {})
    return () => { live = false }
  }, [userId])
  const [duties, setDuties] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')
  const [clock, setClock] = useState(new Date())
  const [form, setForm] = useState(blankReport)
  const [reference, setReference] = useState('')
  const [filter, setFilter] = useState('all')
  const pending = useRef(false)
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const generation = ++request.current
    try {
      const [person, shifts, incidents] = await Promise.all([loadMyTanodIdentity(),loadMyDuty(),loadMyReports()])
      if (generation !== request.current) return
      if (!person) throw new Error('No active Tanod identity')
      setIdentity(person); setDuties(shifts); setReports(incidents); setProblem('')
    } catch {
      if (generation !== request.current) return
      setIdentity(null); setDuties([]); setReports([])
      setProblem('Your Tanod information is unavailable. An active roster entry and linked Tanod account are required. Contact barangay records staff, then refresh.')
    } finally { if (generation === request.current) setLoading(false) }
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(() => { setClock(new Date()); refresh() }, 60000)
    return () => { clearInterval(timer); request.current += 1 }
  }, [refresh])
  const run = async (key, work) => {
    if (pending.current) return
    pending.current = true; setBusy(key); setProblem('')
    try { await work(); setClock(new Date()); await refresh() }
    catch { setProblem('The operation could not be confirmed. Refresh before trying again. Access requires an active linked Tanod account.') }
    finally { pending.current = false; setBusy('') }
  }
  const today = dutyDate(clock)
  const openDuty = duties.find(attendanceOpen)
  const upcoming = duties.filter((d) => d.active && !d.checked_out_at && (!d.shift_end ? d.assignment_date >= today : new Date(d.shift_end) > clock))
    .sort((a,b) => `${a.assignment_date} ${a.shift_start || ''}`.localeCompare(`${b.assignment_date} ${b.shift_start || ''}`))
  // Overview presentation only: reuse today's completed rows already returned by the reader.
  const completedToday = duties.filter((d) => d.assignment_date === today && d.checked_out_at)
    .sort((a, b) => Date.parse(b.checked_out_at) - Date.parse(a.checked_out_at))[0]
  const next = openDuty || upcoming.find((d) => d.assignment_date === today) || completedToday || upcoming[0]
  const todayDuty = openDuty || upcoming.find((d) => d.assignment_date === today) || completedToday
    || duties.find((d) => d.assignment_date === today)
  const futureDuty = upcoming.find((d) => d !== todayDuty && !attendanceOpen(d)
    && (d.shift_start ? new Date(d.shift_start) > clock : d.assignment_date > today))
  const summaryShift = openDuty || upcoming.find((d) => shiftIsCurrent(d,clock)) || futureDuty
  const visibleReports = reports.filter((r) => filter === 'all' || (filter === 'submitted' ? r.submitted_by_me : r.assigned_to_me))
  const dutyCard = (d, options = {}) => <article className={"dashboard-card td-card td-duty-card td-duty-" + statusTone(dutyState(d,clock))} key={d.assignment_id}>
    <div className="td-duty-kicker"><span><FaShieldAlt aria-hidden="true" /> {options.label || (d.assignment_date === today ? "Today's Duty" : 'Duty Details')}</span><span className={`td-state td-state-${statusTone(dutyState(d,clock))}`}>{dutyState(d,clock)}</span></div>
    <div className="td-duty-heading"><h3><TanodArea>{d.area_label}</TanodArea></h3></div>
    <dl className="td-duty-info"><div><dt><FaCalendarAlt aria-hidden="true" /> Date</dt><dd>{portalDutyDate(d.assignment_date)}</dd></div><div><dt><FaClock aria-hidden="true" /> Shift</dt><dd><span title="Demonstration shift label based on stored times; actual times are authoritative.">{portalShiftLabel(d, duties)}</span>{portalShiftLabel(d, duties) && ' \u00b7 '}{portalShiftWindow(d)}</dd></div></dl>
    {(d.checked_in_at || d.checked_out_at) && <div className="td-attendance-group"><h4>Attendance</h4><dl className="td-attendance">
      {d.checked_in_at && <div><dt>Checked in</dt><dd><time dateTime={d.checked_in_at}>{portalAttendanceTime(d.checked_in_at, d)}</time></dd></div>}
      {d.checked_out_at && <div><dt>Checked out</dt><dd><time dateTime={d.checked_out_at}>{portalAttendanceTime(d.checked_out_at, d)}</time></dd></div>}
    </dl></div>}
    {options.readOnly ? null : attendanceOpen(d) ? <button className="btn-add" type="button" disabled={Boolean(busy)} onClick={() => run('checkout', () => checkOut(d.attendance_id))}>Check Out</button>
      : !d.checked_in_at && d.active && <><button className="btn-add" type="button" disabled={Boolean(busy) || !!openDuty || !shiftIsCurrent(d,clock)} onClick={() => run('checkin', () => checkIn(d.assignment_id))}>Check In</button>
        <p className="td-help">Check in during your scheduled shift. Missing shift times must be recorded by barangay staff first.</p></>}
  </article>
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(clock))
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return <div className="dashboard-layout tanod-portal">
    <Sidebar role="tanod" activeTab={tab} setActiveTab={setTab} tanodName={identity ? compactTanodName(profile, identity.display_name) : ''} tanodPhoto={profile?.photo_url || ''}
      onTanodLogout={async () => { await logout(); navigate('/login', { replace: true }) }} />
    <main id="main-content" className="dashboard-main" tabIndex={-1}><div className="td-content">
      <header className="resident-dashboard-header td-page-header">
        <div>
        <h1>{tab === 'overview' && identity ? greeting + ', ' + compactTanodName(profile, identity.display_name) : tabs.find(([key]) => key === tab)[1]}</h1>
        <p>{tab === 'overview' ? 'Here is your duty information for today.' : tab === 'duty' ? 'Your schedules, attendance and recent duty history.' : tab === 'report' ? 'Record an operational incident encountered during duty.' : tab === 'settings' ? 'Manage your profile photo, account details and password.' : 'Review your submitted and assigned incidents.'}</p>
        </div><button className="td-refresh" type="button" disabled={Boolean(busy)} onClick={() => { refresh(); if (userId) loadTanodProfile(userId).then(setProfile).catch(() => {}) }} aria-label="Refresh my information"><FaSyncAlt aria-hidden="true" /> Refresh</button>
      </header>
      {problem && <p className="td-error" role="alert">{problem}</p>}
      {loading ? <p role="status">Loading your duty information…</p> : !identity ? <p>No operational information is shown until your active account link can be confirmed.</p> : <>
        {tab === 'overview' && <>
          <section className="td-summary-grid" aria-label="Duty summary">
            <article className="dashboard-card td-summary"><span className="td-icon"><FaShieldAlt aria-hidden="true" /></span><div className="td-summary-body"><span>Duty status</span><strong><span className={'td-state td-state-' + (todayDuty ? statusTone(dutyState(todayDuty,clock)) : 'scheduled')}>{todayDuty ? dutyState(todayDuty,clock) : 'Off duty today'}</span></strong></div></article>
            <article className="dashboard-card td-summary"><span className="td-icon"><FaClock aria-hidden="true" /></span><div className="td-summary-body"><span>{summaryShift && (attendanceOpen(summaryShift) || shiftIsCurrent(summaryShift,clock)) ? 'Current shift' : 'Next shift'}</span>{summaryShift && <span className="td-summary-shift">{portalShiftLabel(summaryShift, duties)}</span>}<strong>{summaryShift ? portalShiftWindow(summaryShift) : 'No upcoming shift'}</strong>{summaryShift && <span>{portalDutyDate(summaryShift.assignment_date)}</span>}</div></article>
            <article className="dashboard-card td-summary"><span className="td-icon"><FaMapMarkerAlt aria-hidden="true" /></span><div className="td-summary-body"><span>Patrol area</span><strong>{next?.area_label || identity.usual_area || 'No assignment recorded'}</strong></div></article>
            <article className="dashboard-card td-summary"><span className="td-icon"><FaClipboardList aria-hidden="true" /></span><div className="td-summary-body"><span>Reports today</span><strong className="td-report-count">{identity.reports_today}</strong><span>{identity.reports_today} {Number(identity.reports_today) === 1 ? 'report' : 'reports'} submitted today</span></div></article>
          </section>
          <div className="td-overview-duty-grid">
            <section aria-labelledby="td-today-duty-heading"><h2 id="td-today-duty-heading">Today's Duty</h2>
              {todayDuty ? dutyCard(todayDuty) : <div className="dashboard-card td-card td-duty-empty"><FaCalendarAlt aria-hidden="true" /><p>No duty recorded for today.</p></div>}
            </section>
            <section aria-labelledby="td-next-duty-heading"><h2 id="td-next-duty-heading">Next Duty</h2>
              {futureDuty ? dutyCard(futureDuty, { label: 'Next Duty', readOnly: true }) : <div className="dashboard-card td-card td-duty-empty"><FaCalendarAlt aria-hidden="true" /><p>No upcoming duty.</p></div>}
            </section>
          </div>
        </>}
        {tab === 'duty' && <><aside className="td-info"><FaInfoCircle aria-hidden="true" /><div><strong>Attendance note</strong><p>A scheduled shift becomes Currently on duty only after check-in. Check-in and check-out times are recorded by the server.</p></div></aside>
          <h2>Today and current check-in</h2>{duties.filter((d) => d.assignment_date === today || attendanceOpen(d) || shiftIsCurrent(d,clock)).map(dutyCard)}
          <TanodDutySchedule duties={duties} today={today} now={clock} /></>}
        {tab === 'report' && <section className="dashboard-card td-card td-report-form" aria-label="Record an operational incident">
          {reference && <div className="td-success" role="status"><FaCheckCircle aria-hidden="true" /><div><strong>Incident recorded successfully</strong><p>Reference: <strong>{reference}</strong></p><button type="button" className="btn-cancel" onClick={() => setTab('reports')}>View My Reports</button></div></div>}
          <form className="td-form-inner" onSubmit={(e) => {
            e.preventDefault()
            if (!form.narrative.trim() || !form.locationText.trim() || !form.occurredAt) return
            if ((form.latitude === '') !== (form.longitude === '')) { setProblem('Enter both coordinates or leave both blank.'); return }
            run('report', async () => {
              const result = await recordIncident({ ...form, occurredAt: new Date(`${form.occurredAt}+08:00`).toISOString(), source: 'tanod_report' })
              if (typeof result !== 'string' || !result.trim()) throw new Error('Reference not confirmed')
              setReference(result); setForm(blankReport())
            })
          }}><fieldset disabled={Boolean(busy)}><legend><FaClipboardList aria-hidden="true" /> Incident details</legend><div className="td-form-section td-form-details">
            <label>Incident type<select value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value })}>{INCIDENT_TYPE_KEYS.map((key) => <option key={key} value={key}>{incidentTypeLabel(key)}</option>)}</select></label>
            <label>Date and time (Philippines)<input type="datetime-local" required value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} /></label>
            <label className="td-field-wide">General location<input required value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} /></label>
            </div><div className="td-form-section"><label><span className="td-section-title"><FaCommentAlt aria-hidden="true" /> Incident description</span><textarea required rows={5} value={form.narrative} onChange={(e) => setForm({ ...form, narrative: e.target.value })} /></label>
            <p className="td-help">Avoid unnecessary personal or sensitive case details. Incident evidence uploads are not offered; complaint evidence remains a separate restricted workflow.</p>
            </div><div className="td-form-section td-location-panel"><h3 className="td-section-title"><FaMapMarkerAlt aria-hidden="true" /> Location assistance</h3><p className="td-help">Use your device location once, or enter the location manually. Your movement is never continuously tracked.</p>
            <DeviceLocation onLocation={(coordinates) => setForm((current) => ({ ...current, ...coordinates }))} />
            <div className="td-grid"><label>Latitude (optional)<input type="number" step="0.000001" min="-90" max="90" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></label>
              <label>Longitude (optional)<input type="number" step="0.000001" min="-180" max="180" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></label></div>
            <p className="td-help">Optional one-time incident location only. No background or continuous tracking.</p>
            </div><button className="btn-add td-submit" type="submit">{busy === 'report' ? 'Submitting…' : 'Submit incident report'}</button>
          </fieldset></form>
        </section>}
        {tab === 'settings' && <TanodSettings userId={userId} profile={profile} rosterName={identity.display_name} onProfileChange={setProfile} />}
        {tab === 'reports' && <div className="td-reports"><div className="td-filter-toolbar filter-select-wrap"><FaFilter aria-hidden="true" /><label>Show reports<select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All</option><option value="submitted">Submitted by me</option><option value="assigned">Assigned to me</option></select></label></div>
          <p className="td-help td-reports-help">Showing up to 100 relevant reports. Restricted case details remain visible only to authorized staff.</p>
          {!visibleReports.length ? <div className="dashboard-card td-card td-empty"><FaClipboardList aria-hidden="true" /><h3>No reports found</h3><p>Incidents you submit or that are assigned to you will appear here.</p></div> : visibleReports.map((r) => <article className="dashboard-card td-card td-report-card" key={r.incident_id}>
            <header className="td-report-header"><h2>{r.reference}</h2><span className="td-state">{incidentStatusLabel(r.status)}</span></header>
            <p className="td-report-type">{incidentTypeLabel(r.incident_type)}</p><p className="td-meta"><FaClock aria-hidden="true" /><time dateTime={r.occurred_at}>{dutyTime(r.occurred_at)}</time></p>
            <p className="td-meta"><FaMapMarkerAlt aria-hidden="true" />{r.general_location}</p>
            <div className="td-report-chips">{r.submitted_by_me && <span>Submitted by me</span>}{r.assigned_to_me && <span>Assigned to me</span>}<span>{r.kp_linked ? 'KP case linked — contact authorized case staff for details.' : 'No KP case linked'}</span></div>
            <TanodFollowups incidentId={r.incident_id} />
          </article>)}</div>}
      </>}
    </div></main>
  </div>
}
