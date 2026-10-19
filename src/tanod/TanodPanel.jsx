import TanodAccounts from './TanodAccounts'
import TanodManageDialog from './TanodManageDialog'
import OfficialTanodSchedule from './OfficialTanodSchedule'
import { loadAccountStates } from './tanodPortalApi'
import { dutyDate } from './tanodDuty'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaInfoCircle, FaLock, FaPlus, FaEdit, FaShieldAlt, FaUserShield } from 'react-icons/fa'

import {
  PATROL_AREA_HINT, PATROL_TYPE_KEYS, TANOD_NO_LOGIN_NOTE, TANOD_NO_TRACKING_NOTE,
  TANOD_RESTRICTED_NOTE, patrolTypeLabel,
  tanodStateLabel,
} from './tanodLabels'
import {
  addTanodMember, loadTanodAssignments, loadTanodRoster, scheduleAssignment,
  setAssignmentActive, setTanodActive, tanodMessage, updateTanodMember,
} from './tanodApi'
import './Tanod.css'

// Existing official roster and schedule management. Account linking is separate
// from roster membership; assignments never imply attendance or live tracking.

const blankMember = () => ({ fullName: '', areaNote: '', displayOrder: '' })
const blankAssignment = () => ({
  tanodId: '', assignmentDate: '', areaLabel: '',
  patrolType: 'roving', startTime: '', endTime: '',
})

const TanodPanel = ({ canAdminister = false }) => {
  const [tab, setTab] = useState('roster')
  const [managedId, setManagedId] = useState(null)
  const [memberOpen, setMemberOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [accountStates, setAccountStates] = useState(null)
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
      const [people, shifts, links] = await Promise.all([
        loadTanodRoster({ includeInactive: true }),
        loadTanodAssignments({}),
        canAdminister ? loadAccountStates().catch(() => null) : Promise.resolve(null),
      ])
      setAccountStates(links)
      setRoster(people)
      setAssignments(shifts)
    } catch (err) {
      setProblem(tanodMessage(err, 'loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [canAdminister])

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
      setMemberOpen(false)
    }
  }

  const handleSchedule = async (event) => {
    event.preventDefault()
    if (!assignment.tanodId || !assignment.assignmentDate || !String(assignment.areaLabel).trim()) return
    const ok = await run('assign', () => scheduleAssignment(assignment), 'scheduleFailed')
    if (ok) { setAssignment(blankAssignment()); setScheduleOpen(false) }
  }

  const activeRoster = roster.filter((t) => t.active)
  const managed = roster.find((t) => t.id === managedId)
  const today = dutyDate()
  const todayAssignments = assignments.filter((a) => a.active && a.assignment_date === today)
  const coverage = new Set(todayAssignments.filter((a) => a.start_time && a.end_time).map((a) => a.start_time + '/' + a.end_time)).size
  const beginEdit = (t) => {
    setEditingId(t.id)
    setMember({ fullName: t.full_name, areaNote: t.area_note || '', displayOrder: t.display_order })
    setMemberOpen(true); setProblem('')
  }
  const closeManagement = () => { setManagedId(null); setEditingId(null); setMemberOpen(false); setMember(blankMember()); setProblem('') }
  const memberForm = (
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
                  onClick={() => { setEditingId(null); setMember(blankMember()); setMemberOpen(false); setProblem('') }}>
                  Cancel
                </button>
              )}
            </div>
            </fieldset>
          </form>
  )
  return <div className="tnd-operations">
    <div className="official-dashboard-header"><h1>Tanod Operations</h1><p>Manage the Tanod roster, account access, and patrol schedules.</p></div>
    {problem && !managed && <p className="tnd-problem" role="alert"><FaInfoCircle aria-hidden="true" /> {problem}</p>}
    <div className="tnd-summary" aria-label="Tanod operations summary">
      {[["Total Tanods", loading ? 'Loading' : roster.length], ['Accounts Linked', loading ? 'Loading' : accountStates === null ? 'Unavailable' : roster.filter((t) => accountStates.some((a) => a.tanod_id === t.id && a.profile_id)).length], ['Scheduled Today', loading ? 'Loading' : todayAssignments.length], ['Shift Coverage', loading ? 'Loading' : coverage + ' shifts today']].map(([label,value]) => <div className="dashboard-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <p className="tnd-note" role="note"><FaLock aria-hidden="true" /> {TANOD_NO_LOGIN_NOTE} {TANOD_NO_TRACKING_NOTE}</p>
    <div className="view-toggle tnd-tabs" role="group" aria-label="Tanod operations view">
      <button type="button" aria-pressed={tab === 'roster'} onClick={() => setTab('roster')}>Roster &amp; Accounts</button>
      <button type="button" aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>Patrol Schedule</button>
    </div>
    {tab === 'roster' ? <section className="dashboard-card" aria-labelledby="tnd-roster-heading">
      <div className="dashboard-card-header"><h2 id="tnd-roster-heading" className="section-heading"><FaUserShield aria-hidden="true" /> Roster &amp; Accounts</h2>
        {canAdminister && <button type="button" className="btn-add" disabled={Boolean(busy)} aria-expanded={memberOpen && !editingId} aria-controls="tnd-member-form" onClick={() => { setMemberOpen(!memberOpen || Boolean(editingId)); setEditingId(null); setMember(blankMember()) }}><FaPlus aria-hidden="true" /> {memberOpen && !editingId ? 'Close Add form' : 'Add Tanod'}</button>}
      </div>
      {loading ? <p role="status">Loading roster...</p> : !roster.length ? <p className="complaint-empty">No Tanod members on the roster yet.</p> : <div className="table-wrapper"><table className="dashboard-table">
        <thead><tr><th scope="col">Tanod</th><th scope="col">Account</th><th scope="col">State</th><th scope="col">Active assignments</th>{canAdminister && <th scope="col">Actions</th>}</tr></thead>
        <tbody>{roster.map((t) => <tr key={t.id}>
          <td data-label="Tanod"><strong>{t.full_name}</strong><small className="tnd-subline">{t.area_note || 'Not recorded'}</small></td>
          <td data-label="Account"><span className="kp-badge">{accountStates === null ? 'Not confirmed' : accountStates.some((a) => a.tanod_id === t.id && a.profile_id) ? 'Linked' : 'Not linked'}</span></td>
          <td data-label="State"><span className={'kp-badge kp-badge-' + (t.active ? 'open' : 'concluded')}>{tanodStateLabel(t.active)}</span></td>
          <td data-label="Active assignments">{t.assignment_count}</td>
          {canAdminister && <td data-label="Actions"><button type="button" className="btn-add btn-sm" disabled={Boolean(busy)} id={'tnd-manage-' + t.id} aria-haspopup="dialog" aria-label={'Manage ' + t.full_name} aria-expanded={managedId === t.id} aria-controls="tnd-management-dialog" onClick={() => { setManagedId(managedId === t.id ? null : t.id); setMemberOpen(false); setEditingId(null) }}>Manage</button></td>}
        </tr>)}</tbody>
      </table></div>}
      {canAdminister && managed && <TanodManageDialog member={managed} linked={accountStates === null ? null : accountStates.some((a) => a.tanod_id === managed.id && a.profile_id)} onClose={closeManagement}
        editAction={<button type="button" className="btn-add btn-sm" disabled={Boolean(busy)} aria-label={'Edit ' + managed.full_name} aria-expanded={memberOpen && editingId === managed.id} aria-controls="tnd-member-form" onClick={() => beginEdit(managed)}><FaEdit aria-hidden="true" /> Edit Tanod</button>}>
        {problem && <p className="tnd-problem" role="alert"><FaInfoCircle aria-hidden="true" /> {problem}</p>}
        <dl className="tnd-manage-summary"><div><dt>Usual Area</dt><dd>{managed.area_note || 'Not recorded'}</dd></div><div><dt>Active Assignments</dt><dd>{managed.assignment_count}</dd></div></dl>
        {memberOpen && editingId === managed.id && memberForm}
        <TanodAccounts key={managed.id} roster={roster} selectedMember={managed} accountStates={accountStates} onStatesChange={setAccountStates}
          rosterAction={<button type="button" className={(managed.active ? 'btn-deny' : 'btn-add') + ' btn-sm'} disabled={Boolean(busy)} aria-label={(managed.active ? 'Stand down ' : 'Reactivate ') + managed.full_name} onClick={() => run('toggle', () => setTanodActive({ tanodId: managed.id, active: !managed.active }), 'updateFailed')}>{managed.active ? 'Stand down Tanod' : 'Reactivate Tanod'}</button>} />
      </TanodManageDialog>}
      {canAdminister && memberOpen && !managed && memberForm}
      {!canAdminister && <p className="complaint-no-actions" role="note">{TANOD_RESTRICTED_NOTE}</p>}
    </section> : <section className="dashboard-card" aria-labelledby="tnd-schedule-heading">
      <div className="dashboard-card-header"><h2 id="tnd-schedule-heading" className="section-heading"><FaShieldAlt aria-hidden="true" /> Patrol Schedule</h2>
        {canAdminister && <button type="button" className="btn-add" disabled={Boolean(busy)} aria-expanded={scheduleOpen} aria-controls="tnd-assign-form" onClick={() => setScheduleOpen(!scheduleOpen)}><FaPlus aria-hidden="true" /> {scheduleOpen ? 'Close schedule form' : 'Schedule Patrol'}</button>}
      </div>
      {canAdminister && scheduleOpen && (
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
      {loading ? <p role="status">Loading assignments...</p> : <OfficialTanodSchedule assignments={assignments} canAdminister={canAdminister} busy={busy} onToggle={(a) => run('toggleAssign', () => setAssignmentActive({ assignmentId: a.id, active: !a.active }), 'updateFailed')} />}
    </section>}
  </div>
}
export default TanodPanel
