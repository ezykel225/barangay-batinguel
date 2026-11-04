import IncidentLocationPicker from './IncidentLocationPicker'
import OfficialTanodNotes from '../tanod/OfficialTanodNotes'
import DeviceLocation from './DeviceLocation'
import { DialogShell } from '../components/OfficialArchiveDialog'
import IncidentKpLink from '../casesupport/IncidentKpLink'
import IncidentParties from '../people/IncidentParties'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaClipboardList, FaExclamationTriangle, FaInfoCircle, FaLock, FaMapMarkerAlt, FaPlus,
  FaTimes,
} from 'react-icons/fa'

import {
  AREA_NOTE_HINT, AREA_NOTE_LABEL, BLOTTER_APPEND_ONLY_NOTE, BLOTTER_INTERNAL_NOTE,
  COORDINATES_HINT, INCIDENT_SOURCE_KEYS, INCIDENT_STATUS_KEYS, INCIDENT_TANOD_ROLE_KEYS,
  INCIDENT_TYPE_DISCLAIMER, INCIDENT_TYPE_KEYS, RECORDS_RESTRICTED_NOTE,
  blotterActionLabel, incidentDateTime, incidentSourceLabel, incidentStatusLabel,
  incidentStatusNote, incidentTanodRoleLabel, incidentTypeLabel,
} from './incidentLabels'
import {
  amendBlotterEntry, attributeIncidentTanod, incidentMessage, loadBlotterHistory,
  loadIncidentDetail, loadIncidentQueue, loadIncidentTanod, recordIncident, setIncidentStatus, setIncidentMapLocation,
} from './incidentApi'
import { loadTanodRoster } from '../tanod/tanodApi'
import './Incidents.css'

// Combined Phase 2 — the Official Portal's incident queue, the record form and
// the blotter entry behind each incident.
//
// ─── ⚠️ ALL INCIDENT STATE LIVES HERE ───────────────────────────────────────
//
// `OfficialDashboard.jsx` is ~5,640 lines and already holds every other tab's
// state; it gains one switch line per tab and nothing else. The same shape
// `OfficialComplaints`, `ScreeningPanel` and `KpCasePanel` take.
//
// ─── ⚠️ THE FLAGS DECIDE WHICH CONTROLS ARE PAINTED, NOTHING MORE ───────────
//
// `record_incident()` requires an ACTIVE official and the four records
// functions require the Barangay Secretary or the Punong Barangay -- all
// resolved through `official_account_links`, never a name and never
// `committee`. Measured: a Kagawad who rewrote his own committee to
// "Peace and Order and Blotter Records" was still refused all four. So the
// database decides, and this only avoids painting a control it would refuse.

const INCIDENTS_PER_PAGE = 10

const blankForm = () => ({
  incidentType: 'traffic_accident',
  occurredAt: '',
  narrative: '',
  locationText: '',
  source: 'official_report',
  latitude: '',
  longitude: '',
  areaNote: '',
  tanodId: '',
  tanodRole: 'reported',
})

const IncidentsPanel = ({ canAdminister = false, confirm }) => {
  const recordCloseRef = useRef(null)
  const detailCloseRef = useRef(null)
  const [confirming, setConfirming] = useState(false)
  const [rows, setRows] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')

  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankForm)

  const [detail, setDetail] = useState(null)
  const [history, setHistory] = useState([])
  const [attending, setAttending] = useState([])
  const [amendNote, setAmendNote] = useState('')
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationFeedback, setLocationFeedback] = useState('')
  const locationActionRef = useRef(null)
  const returnLocationFocus = useRef(false)
  useEffect(() => {
    if (!editingLocation && !busy && returnLocationFocus.current) {
      returnLocationFocus.current = false
      locationActionRef.current?.focus()
    }
  }, [editingLocation, busy])

  // ⚠️ A REF, NOT THE `busy` STATE. React batches `setBusy`, so a guard read
  // from the render closure lets two submits in one tick both run -- which is
  // the case it exists for, a keyboard Enter beating the re-render. Combined
  // Phase 1 measured exactly that, 3 calls where 1 was expected.
  const inFlight = useRef(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const [queue, tanods] = await Promise.all([
        loadIncidentQueue({ from: filterFrom, to: filterTo, type: filterType }),
        loadTanodRoster({ includeInactive: false }).catch(() => []),
      ])
      setRows(queue)
      setRoster(tanods)
    } catch (err) {
      setProblem(incidentMessage(err, 'loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [filterFrom, filterTo, filterType])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { setPage(1) }, [filterType, filterFrom, filterTo])
  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(rows.length / INCIDENTS_PER_PAGE))))
  }, [rows.length])

  const run = async (key, work, fallbackKey) => {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(key)
    setProblem('')
    try {
      await work()
      return true
    } catch (err) {
      setProblem(incidentMessage(err, fallbackKey))
      return false
    } finally {
      inFlight.current = false
      setBusy('')
    }
  }

  const openDetail = async (incidentId) => {
    setProblem('')
    try {
      const [row, trail, tanods] = await Promise.all([
        loadIncidentDetail(incidentId),
        loadBlotterHistory(incidentId),
        loadIncidentTanod(incidentId),
      ])
      setDetail(row)
      setHistory(trail)
      setAttending(tanods)
      setAmendNote('')
    } catch (err) {
      setProblem(incidentMessage(err, 'loadFailed'))
    }
  }

  const closeLocationEditor = () => {
    setEditingLocation(false)
    returnLocationFocus.current = true
  }
  const saveLocation = async (coordinates) => {
    await run('location', async () => {
      await setIncidentMapLocation({ incidentId: detail.id, ...coordinates })
      closeLocationEditor()
      setLocationFeedback('Map location saved. Safety Map will use it on its next refresh.')
      await Promise.all([fetchAll(), openDetail(detail.id)])
    }, 'mapLocationFailed')
  }

  const handleRecord = async (event) => {
    event.preventDefault()
    const hasLat = String(form.latitude).trim() !== ''
    const hasLng = String(form.longitude).trim() !== ''
    if (hasLat !== hasLng) {
      setProblem(incidentMessage({ kind: 'coordinatesPaired' }, 'coordinatesPaired'))
      return
    }
    const ok = await run('record', async () => {
      await recordIncident({
        incidentType: form.incidentType,
        occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : null,
        narrative: form.narrative,
        locationText: form.locationText,
        source: form.source,
        latitude: hasLat ? Number(form.latitude) : null,
        longitude: hasLng ? Number(form.longitude) : null,
        areaNote: form.areaNote,
        tanodId: form.tanodId || null,
        tanodRole: form.tanodRole,
      })
      await fetchAll()
    }, 'recordFailed')
    if (ok) { setForm(blankForm()); setShowForm(false) }
  }

  const handleStatus = async (incidentId, status) => {
    setConfirming(true)
    let ok
    try { ok = await confirm({
      title: 'Change this incident record?',
      message: `The incident will be recorded as "${incidentStatusLabel(status)}".`
        + ' The change is added to the blotter history, which cannot be rewritten.',
      confirmLabel: 'Save change',
      cancelLabel: 'Go back',
      destructive: false,
    })
    } finally { setConfirming(false) }
    if (!ok) return
    await run('status', async () => {
      await setIncidentStatus({ incidentId, status })
      await Promise.all([fetchAll(), openDetail(incidentId)])
    }, 'statusFailed')
  }

  const handleAmend = async (event) => {
    event.preventDefault()
    if (!String(amendNote).trim()) return
    const ok = await run('amend', async () => {
      await amendBlotterEntry({ incidentId: detail.id, note: amendNote })
      await openDetail(detail.id)
    }, 'amendFailed')
    if (ok) setAmendNote('')
  }

  const handleAttribute = async (tanodId, role) => {
    await run('tanod', async () => {
      await attributeIncidentTanod({ incidentId: detail.id, tanodId, role })
      await Promise.all([fetchAll(), openDetail(detail.id)])
    }, 'tanodFailed')
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / INCIDENTS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * INCIDENTS_PER_PAGE
  const visibleRows = rows.slice(pageStart, pageStart + INCIDENTS_PER_PAGE)
  const withoutCoordinates = rows.filter((row) => !row.has_coordinates).length

  const hasFilters = Boolean(filterType || filterFrom || filterTo)
  const clearFilters = () => { setFilterType(''); setFilterFrom(''); setFilterTo(''); setPage(1) }

  return (
    <div className="inc-page">
      <div className="official-dashboard-header">
        <h1>Incidents &amp; Blotter</h1>
        <p>Review recorded incidents and their linked barangay blotter records.</p>
      </div>

      {problem && !showForm && !detail && (
        <p className="inc-problem" role="alert">
          <FaInfoCircle aria-hidden="true" /> {problem}
        </p>
      )}

      {!loading && !problem && <section className="inc-overview" aria-label="Current incident results">
        {[[hasFilters ? 'Matching incidents' : 'Total incidents', rows.length], ['Mapped incidents', rows.length - withoutCoordinates], ['Without coordinates', withoutCoordinates], ['Linked blotter records', rows.filter(row => row.blotter_reference).length]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>}
      <div className="dashboard-card inc-records-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaClipboardList aria-hidden="true" /> Incident records</h2>
          <button
            type="button"
            className="btn-add"
            onClick={() => setShowForm(true)}
            aria-expanded={showForm}
            aria-controls="inc-record-form"
          >
            <FaPlus aria-hidden="true" /> Record Incident
          </button>

        </div>

        <div className="resident-filter-bar inc-filters">
          <div className="filter-select-wrap">
            <label htmlFor="inc-filter-type">Incident type</label>
            <select
              aria-label="Filter by incident type" id="inc-filter-type" className="filter-select" value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All types</option>
              {INCIDENT_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>{incidentTypeLabel(key)}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-wrap">
            <label htmlFor="inc-filter-from">From</label>
            <input aria-label="Incidents from" id="inc-filter-from" className="filter-select" type="date" value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div className="filter-select-wrap">
            <label htmlFor="inc-filter-to">To</label>
            <input aria-label="Incidents up to" id="inc-filter-to" className="filter-select" type="date" value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && <button type="button" className="btn-cancel inc-clear" onClick={clearFilters}>Clear filters</button>}

        </div>

        {loading ? (
          <p className="complaint-empty">Loading incidents...</p>
        ) : rows.length === 0 ? (
          <p className="complaint-empty">
            {filterType || filterFrom || filterTo
              ? 'No incidents match the current filters.'
              : 'No incident records have been created yet.'}
          </p>
        ) : (
          <>
            <p className="inc-summary" aria-live="polite">
              Showing {pageStart + 1}&ndash;{Math.min(pageStart + INCIDENTS_PER_PAGE, rows.length)} of {rows.length} {hasFilters ? 'matching ' : ''}{rows.length === 1 ? 'incident' : 'incidents'}
            </p>
            {withoutCoordinates > 0 && <p className="inc-coordinate-note"><FaInfoCircle aria-hidden="true" /><span>
              {withoutCoordinates} {withoutCoordinates === 1 ? 'incident has' : 'incidents have'} no coordinates and {withoutCoordinates === 1 ? 'does' : 'do'} not appear on the map.</span>
            </p>}
            <div className="table-wrapper">
              <table className="dashboard-table inc-records-table">
                <colgroup>
                  <col className="inc-col-reference" />
                  <col className="inc-col-type" />
                  <col className="inc-col-when" />
                  <col className="inc-col-location" />
                  <col className="inc-col-status" />
                  <col className="inc-col-blotter" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Reference</th><th>Type</th><th>When</th>
                    <th>Location</th><th>Status</th><th>Blotter</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Reference"><button type="button" className="inc-reference" onClick={() => { setEditingLocation(false); setLocationFeedback(''); openDetail(row.id) }} aria-label={`View incident ${row.reference}`}>{row.reference}</button></td>
                      <td data-label="Type">{incidentTypeLabel(row.incident_type)}</td>
                      <td data-label="When">{incidentDateTime(row.occurred_at)}</td>
                      <td data-label="Location">
                        {row.location_text}
                        <span className="inc-location-state">{row.has_coordinates ? <><FaMapMarkerAlt aria-hidden="true" /> Mapped location</> : 'No map coordinates'}</span>
                      </td>
                      <td data-label="Status">
                        <span className={`kp-badge kp-badge-${row.status}`}>
                          {incidentStatusLabel(row.status)}
                        </span>
                      </td>
                      <td data-label="Blotter">
                        <span className="inc-blotter">{row.blotter_reference ? <><span>Linked</span><strong>{row.blotter_reference}</strong></> : 'Not recorded'}</span>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && <nav className="inc-pagination" aria-label="Incident records pagination">
              <button type="button" className="btn-cancel btn-sm" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>&lsaquo; Previous</button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" className="btn-cancel btn-sm" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next &rsaquo;</button>
            </nav>}
          </>
        )}
      </div>

      {showForm && <div className="inc-modal inc-record-modal">
        <DialogShell open titleId="inc-record-title" title="Record Incident" busy={Boolean(busy)} onCancel={() => setShowForm(false)} initialFocusRef={recordCloseRef}
          header={<header className="inc-modal-header">
            <h3 className="confirm-dialog-title" id="inc-record-title">Record Incident</h3>
            <p>Record an incident for the barangay's internal incident and blotter records.</p>
            <button type="button" className="btn-cancel inc-modal-close" ref={recordCloseRef} aria-label="Close record incident" disabled={Boolean(busy)} onClick={() => setShowForm(false)}><FaTimes aria-hidden="true" /></button>
          </header>}>
          <form id="inc-record-form" className="kp-form inc-form" onSubmit={handleRecord}>
            <div className="inc-modal-body">
            {problem && <p className="inc-problem" role="alert">{problem}</p>}
            <p className="inc-hint"><FaInfoCircle aria-hidden="true" /> {INCIDENT_TYPE_DISCLAIMER}</p>

            <div className="inc-grid">
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-type">What kind of incident</label>
                <select
                  id="inc-type" className="modal-form-input" value={form.incidentType}
                  onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                >
                  {INCIDENT_TYPE_KEYS.map((key) => (
                    <option key={key} value={key}>{incidentTypeLabel(key)}</option>
                  ))}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-occurred">When it happened</label>
                <input
                  id="inc-occurred" className="modal-form-input" type="datetime-local"
                  value={form.occurredAt} required
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-source">How it reached the barangay</label>
                <select
                  id="inc-source" className="modal-form-input" value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                >
                  {INCIDENT_SOURCE_KEYS.map((key) => (
                    <option key={key} value={key}>{incidentSourceLabel(key)}</option>
                  ))}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-location">Location</label>
                <input
                  id="inc-location" className="modal-form-input" type="text" required
                  value={form.locationText} placeholder="Road, street or landmark"
                  onChange={(e) => setForm({ ...form, locationText: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-area">{AREA_NOTE_LABEL}</label>
                <input
                  id="inc-area" className="modal-form-input" type="text"
                  value={form.areaNote} aria-describedby="inc-area-hint"
                  onChange={(e) => setForm({ ...form, areaNote: e.target.value })}
                />
                <p className="field-note" id="inc-area-hint">{AREA_NOTE_HINT}</p>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-tanod">Tanod involved (optional)</label>
                <select
                  id="inc-tanod" className="modal-form-input" value={form.tanodId}
                  onChange={(e) => setForm({ ...form, tanodId: e.target.value })}
                >
                  <option value="">None recorded</option>
                  {roster.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>

              {form.tanodId && (
                <div className="modal-form-group">
                  <label className="modal-form-label" htmlFor="inc-tanod-role">How that Tanod was involved</label>
                  <select
                    id="inc-tanod-role" className="modal-form-input" value={form.tanodRole}
                    onChange={(e) => setForm({ ...form, tanodRole: e.target.value })}
                  >
                    {INCIDENT_TANOD_ROLE_KEYS.map((key) => (
                      <option key={key} value={key}>{incidentTanodRoleLabel(key)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-lat">Latitude (optional)</label>
                <input
                  id="inc-lat" className="modal-form-input" type="number" step="0.000001"
                  value={form.latitude} aria-describedby="inc-coord-hint"
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="inc-lng">Longitude (optional)</label>
                <input
                  id="inc-lng" className="modal-form-input" type="number" step="0.000001"
                  value={form.longitude} aria-describedby="inc-coord-hint"
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                />
              </div>
            </div>

            <DeviceLocation onLocation={(coordinates) => setForm((current) => ({ ...current, ...coordinates }))} />
            <p className="field-note" id="inc-coord-hint">{COORDINATES_HINT}</p>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="inc-narrative">What happened</label>
              <textarea
                id="inc-narrative" className="modal-form-input" rows={4} required
                value={form.narrative}
                onChange={(e) => setForm({ ...form, narrative: e.target.value })}
              />
            </div>

            </div>
            <div className="modal-actions inc-modal-footer">
              <button type="button" className="btn-cancel" disabled={Boolean(busy)} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {busy === 'record' ? 'Recording...' : 'Record incident'}
              </button>
            </div>
          </form>
        </DialogShell>
      </div>}

      {detail && (
        <div className="inc-modal inc-view-modal" aria-hidden={confirming || undefined} inert={confirming || undefined}>
        <DialogShell open titleId="inc-detail-title" title="Incident Details" initialFocusRef={detailCloseRef}
          busy={Boolean(busy)} keyboardSuspended={confirming} onCancel={() => setDetail(null)}
          header={<header className="inc-modal-header">
            <h3 className="confirm-dialog-title" id="inc-detail-title">Incident Details</h3>
            <button type="button" className="btn-cancel btn-sm inc-modal-close" ref={detailCloseRef} aria-label="Close incident details" disabled={Boolean(busy)} onClick={() => setDetail(null)}><FaTimes aria-hidden="true" /></button>
            <div className="inc-modal-identity"><strong>{detail.reference}</strong><span className={`kp-badge kp-badge-${detail.status}`}>{incidentStatusLabel(detail.status)}</span>
              {detail.blotter_reference && <span>Blotter {detail.blotter_reference}</span>}
            </div>
          </header>}>
          <div className="inc-modal-body inc-detail" key={detail.id}>
          {problem && <p className="inc-problem" role="alert">{problem}</p>}
          <section className="inc-section" aria-label="Incident summary">
          <dl className="kp-summary">
            <div><dt>Type</dt><dd>{incidentTypeLabel(detail.incident_type)}</dd></div>
            <div><dt>When</dt><dd>{incidentDateTime(detail.occurred_at)}</dd></div>
            <div><dt>How it reached us</dt><dd>{incidentSourceLabel(detail.source)}</dd></div>
            <div><dt>Recorded by</dt><dd>{detail.recorded_by_name || 'Not recorded'}</dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`kp-badge kp-badge-${detail.status}`}>
                  {incidentStatusLabel(detail.status)}
                </span>
                <span className="field-note">{incidentStatusNote(detail.status)}</span>
              </dd>
            </div>
          </dl>

          </section>
          <IncidentParties incidentId={detail.id} canManage={canAdminister} />
          <section className="inc-section" aria-label="Location"><h3>Location</h3>
            <p className="inc-location-description">{detail.location_text}</p>
            <p className="field-note">{detail.latitude !== null && detail.latitude !== undefined ? 'Map location recorded' : 'No map location has been set for this incident.'}</p>
            <dl className="kp-summary">
              <div><dt>Area note</dt><dd>{detail.area_note || 'None recorded'}</dd></div>
              <div><dt>Coordinates</dt><dd>{detail.latitude !== null && detail.latitude !== undefined ? `${detail.latitude}, ${detail.longitude}` : 'None recorded - not shown on the map'}</dd></div>
            </dl>
            {locationFeedback && <p role="status" className="inc-location-feedback">{locationFeedback}</p>}
            {canAdminister && <>
              {!editingLocation && <button type="button" className="btn-add inc-location-action" ref={locationActionRef} disabled={Boolean(busy)} onClick={() => { setEditingLocation(true); setLocationFeedback('') }}>{detail.latitude !== null && detail.latitude !== undefined ? 'Edit map location' : 'Add map location'}</button>}
              {editingLocation && <IncidentLocationPicker key={detail.id} latitude={detail.latitude} longitude={detail.longitude} busy={Boolean(busy)} onSave={saveLocation} onCancel={closeLocationEditor} />}
            </>}
          </section>
          <section className="inc-section" aria-label="What happened"><h3>What happened</h3>
          <p className="inc-narrative">{detail.narrative}</p></section>
          {canAdminister && <><section className="inc-section" aria-label="Linked KP Case"><IncidentKpLink key={detail.id} incidentId={detail.id} /></section><section className="inc-section" aria-label="Tanod operational follow-up"><OfficialTanodNotes key={`notes-${detail.id}`} incidentId={detail.id} /></section></>}

          <section className="inc-section" aria-label="Blotter Entry"><h3>Blotter entry {detail.blotter_reference}</h3>
          <p className="inc-hint"><FaLock aria-hidden="true" /> {BLOTTER_INTERNAL_NOTE}</p>
          <p className="inc-narrative inc-snapshot">{detail.blotter_summary}</p>
          <p className="field-note">{BLOTTER_APPEND_ONLY_NOTE}</p>

          <h4>History</h4>
          <ul className="inc-history">
            {history.map((row) => (
              <li key={row.id}>
                <strong>{blotterActionLabel(row.action)}</strong>
                {' '}&middot; {incidentDateTime(row.created_at)}
                {row.actor_name && <> &middot; {row.actor_name}</>}
                {row.note && <div className="inc-history-note">{row.note}</div>}
              </li>
            ))}
          </ul>

          </section>
          <section className="inc-section" aria-label="Tanod involvement"><h4>Tanod involved</h4>
          {attending.length === 0 ? (
            <p className="complaint-empty">No Tanod recorded for this incident.</p>
          ) : (
            <ul className="inc-tanod-list">
              {attending.map((row) => (
                <li key={row.id}>
                  {row.tanod_name} &middot; {incidentTanodRoleLabel(row.role)}
                </li>
              ))}
            </ul>
          )}

          {/* ⚠️ ABSENT, NOT DISABLED. An official who may not administer
              records gets one neutral sentence that names no position, no
              policy and no SQLSTATE -- `ActionMenu`'s own rule, and the same
              shape the restricted complaint panel takes. */}
          </section>
          {canAdminister ? (
            <>
              <section className="inc-section" aria-label="Record Actions"><h4>Record Actions</h4>
              <div className="inc-actions">
                {INCIDENT_STATUS_KEYS.filter((key) => key !== detail.status).map((key) => (
                  <button
                    key={key} type="button" className="btn-add btn-sm"
                    disabled={Boolean(busy)}
                    onClick={() => handleStatus(detail.id, key)}
                  >
                    Mark {incidentStatusLabel(key).toLowerCase()}
                  </button>
                ))}
              </div>

              </section>
              <section className="inc-section" aria-label="Blotter amendment"><form className="kp-form" onSubmit={handleAmend}>
                <label className="modal-form-label" htmlFor="inc-amend">Add a blotter amendment</label>
                <textarea
                  id="inc-amend" className="modal-form-input" rows={2}
                  value={amendNote} onChange={(e) => setAmendNote(e.target.value)}
                />
                <div className="modal-actions">
                  <button type="submit" className="btn-add btn-sm" disabled={Boolean(busy)}>
                    {busy === 'amend' ? 'Saving...' : 'Add amendment'}
                  </button>
                </div>
              </form></section>

              {roster.length > 0 && (
                <div className="inc-attribute inc-section">
                  <label className="modal-form-label" htmlFor="inc-add-tanod">Record another Tanod</label>
                  <select
                    id="inc-add-tanod" className="modal-form-input" defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAttribute(e.target.value, 'attended')
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="">Choose a Tanod</option>
                    {roster.map((t) => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <p className="complaint-no-actions" role="note">
              <FaExclamationTriangle aria-hidden="true" /> {RECORDS_RESTRICTED_NOTE}
            </p>
          )}
          </div>
        </DialogShell>
        </div>
      )}
    </div>
  )
}

export default IncidentsPanel
