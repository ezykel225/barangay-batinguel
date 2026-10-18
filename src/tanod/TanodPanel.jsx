import { useCallback, useEffect, useRef, useState } from 'react'
import { FaInfoCircle, FaLock, FaPlus, FaShieldAlt, FaUserShield } from 'react-icons/fa'

import {
  PATROL_AREA_HINT, PATROL_TYPE_KEYS, TANOD_NO_LOGIN_NOTE, TANOD_NO_TRACKING_NOTE,
  TANOD_RESTRICTED_NOTE, assignmentDateLabel, assignmentWindow, patrolTypeLabel,
  tanodStateLabel,
} from './tanodLabels'
import {
  addTanodMember, loadTanodAssignments, loadTanodRoster, scheduleAssignment,
  setAssignmentActive, setTanodActive, tanodMessage, updateTanodMember,
} from './tanodApi'
import './Tanod.css'

// Combined Phase 2 — the Tanod roster and the patrol schedule.
//
// ⚠️ NO LOGIN AND NO TRACKING, and both are said on screen rather than only
// in a migration header. A Tanod is a person on a roster: no account, no
// password, no portal, and no coordinate column anywhere on them. The only
// latitude and longitude in this phase belong to an incident.

const blankMember = () => ({ fullName: '', areaNote: '', displayOrder: '' })
const blankAssignment = () => ({
  tanodId: '', assignmentDate: '', areaLabel: '',
  patrolType: 'roving', startTime: '', endTime: '',
})

const TanodPanel = ({ canAdminister = false }) => {
  const [roster, setRoster] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')

  const [member, setMember] = useState(blankMember)
  const [editingId, setEditingId] = useState(null)
  const [assignment, setAssignment] = useState(blankAssignment)

  const inFlight = useRef(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setProblem('')
    try {
      const [people, shifts] = await Promise.all([
        loadTanodRoster({ includeInactive: true }),
        loadTanodAssignments({}),
      ])
      setRoster(people)
      setAssignments(shifts)
    } catch (err) {
      setProblem(tanodMessage(err, 'loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const run = async (key, work, fallbackKey) => {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(key)
    setProblem('')
    try {
      await work()
      await fetchAll()
      return true
    } catch (err) {
      setProblem(tanodMessage(err, fallbackKey))
      return false
    } finally {
      inFlight.current = false
      setBusy('')
    }
  }

  const handleAddMember = async (event) => {
    event.preventDefault()
    if (!canAdminister) return
    if (!String(member.fullName).trim()) {
      setProblem(tanodMessage({ kind: 'nameRequired' }))
      return
    }
    const ok = await run('member', () => editingId
      ? updateTanodMember({ ...member, tanodId: editingId })
      : addTanodMember(member), editingId ? 'updateFailed' : 'addFailed')
    if (ok) {
      setMember(blankMember())
      setEditingId(null)
    }
  }

  const handleSchedule = async (event) => {
    event.preventDefault()
    if (!assignment.tanodId || !assignment.assignmentDate || !String(assignment.areaLabel).trim()) return
    const ok = await run('assign', () => scheduleAssignment(assignment), 'scheduleFailed')
    if (ok) setAssignment(blankAssignment())
  }

  const activeRoster = roster.filter((t) => t.active)

  return (
    <div>
      <div className="official-dashboard-header">
        <h1>Tanod Operations</h1>
        <p>Who is on the roster, and which areas are covered.</p>
      </div>

      {problem && (
        <p className="tnd-problem" role="alert">
          <FaInfoCircle aria-hidden="true" /> {problem}
        </p>
      )}

      <p className="tnd-note" role="note">
        <FaLock aria-hidden="true" /> {TANOD_NO_LOGIN_NOTE} {TANOD_NO_TRACKING_NOTE}
      </p>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaUserShield aria-hidden="true" /> Tanod roster</h2>
        </div>

        {loading ? (
          <p className="complaint-empty">Loading roster...</p>
        ) : roster.length === 0 ? (
          <p className="complaint-empty">No Tanod members on the roster yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Name</th><th>Usual area</th><th>State</th>
                  <th>Active assignments</th>{canAdminister && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {roster.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Name">{t.full_name}</td>
                    <td data-label="Usual area">{t.area_note || 'Not recorded'}</td>
                    <td data-label="State">
                      <span className={`kp-badge kp-badge-${t.active ? 'open' : 'concluded'}`}>
                        {tanodStateLabel(t.active)}
                      </span>
                    </td>
                    <td data-label="Active assignments">{t.assignment_count}</td>
                    {canAdminister && (
                      <td data-label="Action">
                        <button
                          type="button" className="btn-add btn-sm" disabled={Boolean(busy)}
                          aria-label={`Edit ${t.full_name}`}
                          onClick={() => {
                            setEditingId(t.id)
                            setMember({ fullName: t.full_name, areaNote: t.area_note || '', displayOrder: t.display_order })
                            setProblem('')
                            document.getElementById('tnd-name')?.focus()
                          }}
                        >Edit</button>
                        <button
                          type="button" className={`${t.active ? 'btn-deny' : 'btn-add'} btn-sm`} disabled={Boolean(busy)}
                          aria-label={`${t.active ? 'Stand down' : 'Reactivate'} ${t.full_name}`}
                          onClick={() => run('toggle',
                            () => setTanodActive({ tanodId: t.id, active: !t.active }), 'updateFailed')}
                        >
                          {t.active ? 'Stand down' : 'Reactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canAdminister ? (
          <form id="tnd-member-form" className="kp-form tnd-form" onSubmit={handleAddMember}>
            <h3>{editingId ? 'Edit Tanod' : 'Add a Tanod'}</h3>
            <fieldset disabled={Boolean(busy)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="tnd-grid">
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-name">Name</label>
                <input
                  id="tnd-name" className="modal-form-input" type="text" required
                  value={member.fullName}
                  onChange={(e) => setMember({ ...member, fullName: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-area">Usual area (optional)</label>
                <input
                  id="tnd-area" className="modal-form-input" type="text"
                  value={member.areaNote}
                  onChange={(e) => setMember({ ...member, areaNote: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-order">Display order</label>
                <input
                  id="tnd-order" className="modal-form-input" type="number"
                  value={member.displayOrder}
                  onChange={(e) => setMember({ ...member, displayOrder: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {!editingId && <FaPlus aria-hidden="true" />} {busy === 'member' ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save' : 'Add Tanod')}
              </button>
              {editingId && (
                <button type="button" className="btn-cancel" disabled={Boolean(busy)}
                  onClick={() => { setEditingId(null); setMember(blankMember()); setProblem('') }}>
                  Cancel
                </button>
              )}
            </div>
            </fieldset>
          </form>
        ) : (
          <p className="complaint-no-actions" role="note">{TANOD_RESTRICTED_NOTE}</p>
        )}
      </div>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2 className="section-heading"><FaShieldAlt aria-hidden="true" /> Patrol assignments</h2>
        </div>

        {loading ? (
          <p className="complaint-empty">Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <p className="complaint-empty">No patrol assignments recorded yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Date</th><th>Tanod</th><th>Area</th>
                  <th>Patrol</th><th>Window</th><th>State</th>{canAdminister && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Date">{assignmentDateLabel(a.assignment_date)}</td>
                    <td data-label="Tanod">{a.tanod_name}</td>
                    <td data-label="Area">{a.area_label}</td>
                    <td data-label="Patrol">{patrolTypeLabel(a.patrol_type)}</td>
                    <td data-label="Window">{assignmentWindow(a.start_time, a.end_time)}</td>
                    <td data-label="State">
                      <span className={`kp-badge kp-badge-${a.active ? 'open' : 'concluded'}`}>
                        {a.active ? 'Active' : 'Stood down'}
                      </span>
                    </td>
                    {canAdminister && (
                      <td data-label="Action">
                        <button
                          type="button" className="btn-deny btn-sm" disabled={Boolean(busy)}
                          aria-label={`${a.active ? 'Stand down' : 'Reactivate'} assignment for ${a.tanod_name} on ${assignmentDateLabel(a.assignment_date)}`}
                          onClick={() => run('toggleAssign',
                            () => setAssignmentActive({ assignmentId: a.id, active: !a.active }), 'updateFailed')}
                        >
                          {a.active ? 'Stand down' : 'Reactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canAdminister && (
          <form id="tnd-assign-form" className="kp-form tnd-form" onSubmit={handleSchedule}>
            <h3>Schedule a patrol</h3>
            <div className="tnd-grid">
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-who">Tanod</label>
                <select
                  id="tnd-who" className="modal-form-input" required value={assignment.tanodId}
                  onChange={(e) => setAssignment({ ...assignment, tanodId: e.target.value })}
                >
                  <option value="">Choose a Tanod</option>
                  {activeRoster.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-date">Date</label>
                <input
                  id="tnd-date" className="modal-form-input" type="date" required
                  value={assignment.assignmentDate}
                  onChange={(e) => setAssignment({ ...assignment, assignmentDate: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-patrol">Patrol type</label>
                <select
                  id="tnd-patrol" className="modal-form-input" value={assignment.patrolType}
                  onChange={(e) => setAssignment({ ...assignment, patrolType: e.target.value })}
                >
                  {PATROL_TYPE_KEYS.map((key) => (
                    <option key={key} value={key}>{patrolTypeLabel(key)}</option>
                  ))}
                </select>
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-start">Start time (optional)</label>
                <input
                  id="tnd-start" className="modal-form-input" type="time"
                  value={assignment.startTime}
                  onChange={(e) => setAssignment({ ...assignment, startTime: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label" htmlFor="tnd-end">End time (optional)</label>
                <input
                  id="tnd-end" className="modal-form-input" type="time"
                  value={assignment.endTime}
                  onChange={(e) => setAssignment({ ...assignment, endTime: e.target.value })}
                />
              </div>
              <div className="modal-form-group tnd-area-field">
                <label className="modal-form-label" htmlFor="tnd-area-label">Patrol area</label>
                <input
                  id="tnd-area-label" className="modal-form-input" type="text" required
                  value={assignment.areaLabel} aria-describedby="tnd-area-hint"
                  onChange={(e) => setAssignment({ ...assignment, areaLabel: e.target.value })}
                />
                <p className="field-note" id="tnd-area-hint">{PATROL_AREA_HINT}</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="submit" className="btn-add" disabled={Boolean(busy)}>
                {busy === 'assign' ? 'Saving...' : 'Schedule patrol'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default TanodPanel
