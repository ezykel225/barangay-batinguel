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
  loadIncidentDetail, loadIncidentQueue, loadIncidentTanod, recordIncident, setIncidentStatus,
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
  const [rows, setRows] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')

  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankForm)

  const [detail, setDetail] = useState(null)
  const [history, setHistory] = useState([])
  const [attending, setAttending] = useState([])
  const [amendNote, setAmendNote] = useState('')

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
    const ok = await confirm({
      title: 'Change this incident record?',
      message: `The incident will be recorded as "${incidentStatusLabel(status)}".`
        + ' The change is added to the blotter history, which cannot be rewritten.',
      confirmLabel: 'Save change',
      cancelLabel: 'Go back',
      destructive: false,
    })
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

  const withoutCoordinates = rows.filter((row) => !row.has_coordinates).length

  return (
    <div>
      <div className="official-dashboard-header">
        <h1>Incidents &amp; Blotter</h1>
        <p>Record what happened, and keep the barangay&rsquo;s internal blotter.</p>
      </div>

      {problem && (
        <p className="inc-problem" role="alert">
          <FaInfoCircle aria-hidden="true" /> {problem}
        </p>
      )}

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaClipboardList aria-hidden="true" /> Incident records</h2>
          <button
            type="button"
            className="btn-add"
            onClick={() => setShowForm((open) => !open)}
            aria-expanded={showForm}
            aria-controls="inc-record-form"
          >
            {/* ⚠️ THE ICON FOLLOWS THE LABEL. This was `<FaPlus>` in both
                states, so the open form offered a PLUS sign beside the word
                "Close" -- an icon asserting the opposite of its own label,
                which is the same fault as an ✕ used for navigation. */}
            {showForm
              ? <><FaTimes aria-hidden="true" /> Close form</>
              : <><FaPlus aria-hidden="true" /> Record Incident</>}
          </button>
        </div>

        {showForm && (
          <form id="inc-record-form" className="kp-form inc-form" onSubmit={handleRecord}>
            <h3>Record an incident</h3>
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

            <p className="field-note" id="inc-coord-hint">{COORDINATES_HINT}</p>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="inc-narrative">What happened</label>
              <textarea
                id="inc-narrative" className="modal-form-input" rows={4} required
                value={form.narrative}
                onChange={(e) => setForm({ ...form, narrative: e.target.value })}
              />
            </div>

            <div className="modal-actions">
              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {busy === 'record' ? 'Recording...' : 'Record incident'}
              </button>
            </div>
          </form>
        )}

        <div className="resident-filter-bar inc-filters">
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="inc-filter-type">Filter by incident type</label>
            <select
              id="inc-filter-type" className="filter-select" value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All types</option>
              {INCIDENT_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>{incidentTypeLabel(key)}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="inc-filter-from">Incidents from</label>
            <input id="inc-filter-from" className="filter-select" type="date" value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div className="filter-select-wrap">
            <label className="visually-hidden" htmlFor="inc-filter-to">Incidents up to</label>
            <input id="inc-filter-to" className="filter-select" type="date" value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <p className="complaint-empty">Loading incidents...</p>
        ) : rows.length === 0 ? (
          <p className="complaint-empty">
            {filterType || filterFrom || filterTo
              ? 'No incidents match this filter.'
              : 'No incidents recorded yet.'}
          </p>
        ) : (
          <>
            <p className="inc-summary">
              {rows.length} recorded
              {withoutCoordinates > 0 && (
                <> &middot; <strong>{withoutCoordinates}</strong> without coordinates, so not on the map</>
              )}
            </p>
            <div className="table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Reference</th><th>Type</th><th>When</th>
                    <th>Location</th><th>Status</th><th>Blotter</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Reference"><span className="complaint-reference">{row.reference}</span></td>
                      <td data-label="Type">{incidentTypeLabel(row.incident_type)}</td>
                      <td data-label="When">{incidentDateTime(row.occurred_at)}</td>
                      <td data-label="Location">
                        {row.location_text}
                        {row.has_coordinates && (
                          <> <FaMapMarkerAlt aria-label="Has coordinates" className="inc-pin" /></>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`kp-badge kp-badge-${row.status}`}>
                          {incidentStatusLabel(row.status)}
                        </span>
                      </td>
                      <td data-label="Blotter">
                        <span className="complaint-reference">{row.blotter_reference || 'Not recorded'}</span>
                      </td>
                      <td data-label="Action">
                        <button
                          type="button" className="btn-add btn-sm"
                          onClick={() => openDetail(row.id)}
                          aria-label={`View incident ${row.reference}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {detail && (
        <div className="dashboard-card inc-detail">
          <div className="dashboard-card-header">
            <h2>{detail.reference}</h2>
            {/* ⚠️ `btn-cancel`, NOT `btn-deny`. Dismissing a read-only
                detail panel destroys nothing, and the red class is what
                Stand down and Remove use -- so this read as a dangerous
                action and looked unlike the Complaint queue's own Close,
                which is the same control one tab away. */}
            <button type="button" className="btn-cancel btn-sm" onClick={() => setDetail(null)}>
              <FaTimes aria-hidden="true" /> Close
            </button>
          </div>

          <dl className="kp-summary">
            <div><dt>Type</dt><dd>{incidentTypeLabel(detail.incident_type)}</dd></div>
            <div><dt>When</dt><dd>{incidentDateTime(detail.occurred_at)}</dd></div>
            <div><dt>Location</dt><dd>{detail.location_text}</dd></div>
            <div><dt>Area note</dt><dd>{detail.area_note || 'None recorded'}</dd></div>
            <div><dt>How it reached us</dt><dd>{incidentSourceLabel(detail.source)}</dd></div>
            <div><dt>Recorded by</dt><dd>{detail.recorded_by_name || 'Not recorded'}</dd></div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                {detail.latitude !== null && detail.latitude !== undefined
                  ? `${detail.latitude}, ${detail.longitude}`
                  : 'None recorded — not shown on the map'}
              </dd>
            </div>
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

          <h3>What happened</h3>
          <p className="inc-narrative">{detail.narrative}</p>

          <h3>Blotter entry {detail.blotter_reference}</h3>
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

          <h4>Tanod involved</h4>
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
          {canAdminister ? (
            <>
              <h4>Records actions</h4>
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

              <form className="kp-form" onSubmit={handleAmend}>
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
              </form>

              {roster.length > 0 && (
                <div className="inc-attribute">
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
      )}
    </div>
  )
}

export default IncidentsPanel
