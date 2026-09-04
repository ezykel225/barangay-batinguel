import { useState, useEffect } from 'react'
import {
  FaUserNurse,
  FaPlus,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaFilter,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import { PersonAvatar } from '../utils/officialPhotos'
import '../components/Sidebar.css'
import './NurseDashboard.css'

const NurseDashboard = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [healthEvents, setHealthEvents] = useState([])
  const [nurseAvailability, setNurseAvailability] = useState([])
  const [medicalPrograms, setMedicalPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [nurseStatus, setNurseStatus] = useState('available')
  const [savingStatus, setSavingStatus] = useState(false)
  const [healthEventFilter, setHealthEventFilter] = useState('all')
  // Guards Save/Add modal actions against double-fires from fast repeated
  // clicks (this is what caused entries to silently duplicate or the
  // Bakuna Calendar to look like it "didn't save").
  const [submitting, setSubmitting] = useState(false)

  const nurseName = 'Maria Elena R. Santos, RN'

  // Modal States
  const [showEventModal, setShowEventModal] = useState(false)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [editingAvail, setEditingAvail] = useState(null)
  const [showProgramModal, setShowProgramModal] = useState(false)
  const [editingProgram, setEditingProgram] = useState(null)

  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    event_date: '',
    location: '',
    target_audience: '',
  })

  const [newAvailability, setNewAvailability] = useState({
    nurse_name: nurseName,
    day_of_week: '',
    time_start: '',
    time_end: '',
    status: 'available',
  })

  const [newProgram, setNewProgram] = useState({
    title: '',
    schedule_label: '',
    time_label: '',
    display_order: 0,
  })

  // ── Settings: Change Password ──────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  // ──────────────────────────────────────────────────────

  useEffect(() => {
    fetchHealthEvents()
    fetchNurseAvailability()
    fetchMedicalPrograms()
  }, [])

  const fetchHealthEvents = async () => {
    const { data, error } = await supabase
      .from('health_events')
      .select('*')
      .order('event_date', { ascending: true })
    if (!error) setHealthEvents(data)
    setLoading(false)
  }

  const fetchNurseAvailability = async () => {
    const { data, error } = await supabase
      .from('nurse_availability')
      .select('*')
      .order('day_of_week', { ascending: true })
    if (!error) {
      setNurseAvailability(data)
      // Set current status from today's record
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const today = days[new Date().getDay()]
      const todayRecord = data?.find((r) => r.day_of_week === today)
      if (todayRecord) setNurseStatus(todayRecord.status)
    }
  }

  // Save status to today's record in Supabase
  const handleStatusChange = async (newStatusValue) => {
    setSavingStatus(true)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const today = days[new Date().getDay()]

    const todayRecord = nurseAvailability.find((r) => r.day_of_week === today)

    if (!todayRecord) {
      toast.error(`No availability record found for ${today}. Add one in the Availability tab.`)
      setSavingStatus(false)
      return
    }

    const { error } = await supabase
      .from('nurse_availability')
      .update({ status: newStatusValue })
      .eq('id', todayRecord.id)

    if (error) {
      toast.error('Failed to update status!')
    } else {
      setNurseStatus(newStatusValue)
      toast.success('Status updated!')
      fetchNurseAvailability()
    }
    setSavingStatus(false)
  }

  const handleAddEvent = async () => {
    if (submitting) return
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all required fields!')
      return
    }
    setSubmitting(true)
    try {
      const date = new Date(newEvent.event_date)
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      const day = String(date.getDate()).padStart(2, '0')

      const { error } = await supabase.from('health_events').insert([{
        title: newEvent.title,
        description: newEvent.description,
        event_date: newEvent.event_date,
        event_month: month,
        event_day: day,
        location: newEvent.location,
        target_audience: newEvent.target_audience,
      }])

      if (error) {
        console.error('Add health event error:', error)
        toast.error(error.message || 'Failed to add health event!')
      } else {
        toast.success('Health event added!')
        setShowEventModal(false)
        setNewEvent({ title: '', description: '', event_date: '', location: '', target_audience: '' })
        // Re-fetch immediately so the calendar reflects the new entry
        // right away instead of waiting for the next natural refresh.
        await fetchHealthEvents()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase.from('health_events').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete event!')
    } else {
      toast.success('Event deleted!')
      fetchHealthEvents()
    }
  }

  // Open modal for editing existing availability
  const handleEditAvailability = (avail) => {
    setEditingAvail(avail)
    setNewAvailability({
      nurse_name: nurseName,
      day_of_week: avail.day_of_week,
      time_start: avail.time_start,
      time_end: avail.time_end,
      status: avail.status,
    })
    setShowAvailabilityModal(true)
  }

  // Open modal for adding new availability
  const handleOpenAddAvailability = () => {
    setEditingAvail(null)
    setNewAvailability({
      nurse_name: nurseName,
      day_of_week: '',
      time_start: '',
      time_end: '',
      status: 'available',
    })
    setShowAvailabilityModal(true)
  }

  const handleSaveAvailability = async () => {
    if (submitting) return
    if (!newAvailability.day_of_week || !newAvailability.time_start || !newAvailability.time_end) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      if (editingAvail) {
        // UPDATE existing record
        const { error } = await supabase
          .from('nurse_availability')
          .update({
            time_start: newAvailability.time_start,
            time_end: newAvailability.time_end,
            status: newAvailability.status,
          })
          .eq('id', editingAvail.id)

        if (error) {
          toast.error('Failed to update availability!')
        } else {
          toast.success('Availability updated!')
          setShowAvailabilityModal(false)
          fetchNurseAvailability()
        }
      } else {
        // INSERT new record
        const { error } = await supabase
          .from('nurse_availability')
          .insert([{ ...newAvailability, nurse_name: nurseName }])

        if (error) {
          toast.error('Failed to add availability!')
        } else {
          toast.success('Availability added!')
          setShowAvailabilityModal(false)
          fetchNurseAvailability()
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAvailability = async (id) => {
    const { error } = await supabase.from('nurse_availability').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete!')
    } else {
      toast.success('Deleted!')
      fetchNurseAvailability()
    }
  }

  const fetchMedicalPrograms = async () => {
    const { data, error } = await supabase
      .from('medical_programs')
      .select('*')
      .order('display_order', { ascending: true })
    if (!error) setMedicalPrograms(data || [])
  }

  const handleOpenAddProgram = () => {
    setEditingProgram(null)
    setNewProgram({ title: '', schedule_label: '', time_label: '', display_order: 0 })
    setShowProgramModal(true)
  }

  const handleEditProgram = (program) => {
    setEditingProgram(program)
    setNewProgram({
      title: program.title,
      schedule_label: program.schedule_label,
      time_label: program.time_label,
      display_order: program.display_order || 0,
    })
    setShowProgramModal(true)
  }

  const handleSaveProgram = async () => {
    if (submitting) return
    if (!newProgram.title || !newProgram.schedule_label || !newProgram.time_label) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      if (editingProgram) {
        const { error } = await supabase
          .from('medical_programs')
          .update({
            title: newProgram.title,
            schedule_label: newProgram.schedule_label,
            time_label: newProgram.time_label,
            display_order: Number(newProgram.display_order) || 0,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProgram.id)

        if (error) {
          toast.error('Failed to update program!')
        } else {
          toast.success('Program updated!')
          setShowProgramModal(false)
          fetchMedicalPrograms()
        }
      } else {
        const { error } = await supabase.from('medical_programs').insert([{
          title: newProgram.title,
          schedule_label: newProgram.schedule_label,
          time_label: newProgram.time_label,
          display_order: Number(newProgram.display_order) || 0,
          updated_by: user?.id ?? null,
        }])

        if (error) {
          toast.error('Failed to add program!')
        } else {
          toast.success('Program added!')
          setShowProgramModal(false)
          fetchMedicalPrograms()
        }
      }
      setEditingProgram(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProgram = async (id) => {
    const { error } = await supabase.from('medical_programs').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete program!')
    } else {
      toast.success('Program removed!')
      fetchMedicalPrograms()
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both password fields!')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters!')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match!')
      return
    }

    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordLoading(false)

    if (error) {
      toast.error(error.message || 'Failed to update password!')
    } else {
      toast.success('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const getStatusLabel = () => {
    if (nurseStatus === 'available') return 'Available Now'
    if (nurseStatus === 'on-leave') return 'On Leave'
    return 'Unavailable'
  }

  const getStatusStyle = () => {
    if (nurseStatus === 'available') return { background: '#dcfce7', color: '#16a34a' }
    if (nurseStatus === 'on-leave') return { background: '#fef9c3', color: '#b45309' }
    return { background: '#fee2e2', color: '#dc2626' }
  }

  return (
    <div className="dashboard-layout">
      <Sidebar role="nurse" activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="dashboard-main">

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="nurse-dashboard-header">
              <div>
                <h1>Nurse Administrator Dashboard</h1>
                <p>Managing community health and medical services for Barangay Batinguel.</p>
              </div>
              <div className="nurse-status-badge" style={getStatusStyle()}>
                <div className="nurse-status-dot" style={{ backgroundColor: getStatusStyle().color }}></div>
                STATUS: {getStatusLabel()}
              </div>
            </div>

            <div className="nurse-dashboard-grid">

              {/* Bakuna Calendar */}
              <div className="bakuna-calendar-card">
                <div className="bakuna-calendar-header">
                  <h3>💉 Bakuna Calendar</h3>
                  <button className="btn-add" onClick={() => setShowEventModal(true)}>Manage</button>
                </div>
                {loading ? (
                  <p className="loading-text">Loading...</p>
                ) : healthEvents.length === 0 ? (
                  <p className="empty-text">No health events yet.</p>
                ) : (
                  healthEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="bakuna-event-item">
                      <div className="bakuna-event-date">
                        <div className="month">{event.event_month}</div>
                        <div className="day">{event.event_day}</div>
                      </div>
                      <div className="bakuna-event-info">
                        <h5>{event.title}</h5>
                        <p>{event.location}</p>
                      </div>
                    </div>
                  ))
                )}
                <button className="bakuna-add-btn" onClick={() => setShowEventModal(true)}>
                  <FaPlus /> Schedule New Event
                </button>
              </div>

              {/* Active Medical Programs — now backed by the medical_programs table */}
              <div className="programs-card">
                <div className="programs-card-header">
                  <h3>Active Medical Programs</h3>
                  <button className="btn-add" onClick={handleOpenAddProgram}>
                    <FaPlus /> Add
                  </button>
                </div>
                <p className="programs-subtitle">Update schedules and program availability</p>
                <div className="programs-grid">
                  {medicalPrograms.length === 0 ? (
                    <p className="empty-text">No programs set up yet.</p>
                  ) : (
                    medicalPrograms.map((program) => (
                      <div key={program.id} className="program-item">
                        <div className="program-item-title">{program.title}</div>
                        <div className="program-item-schedule">{program.schedule_label}</div>
                        <div className="program-item-time">{program.time_label}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="program-edit-btn" onClick={() => handleEditProgram(program)}>
                            Edit Schedule →
                          </button>
                          <button
                            className="program-edit-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleDeleteProgram(program.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* My Status — now saves to Supabase */}
              <div className="nurse-my-status-card">
                <h3>My Status</h3>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Updates live on the Officials and Health Center pages.
                </p>
                <div className="nurse-status-options">
                  {[
                    { value: 'available', label: '✅ Available Today' },
                    { value: 'on-leave', label: '🏖️ On Leave' },
                    { value: 'unavailable', label: '❌ Not Available Today' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`nurse-status-option-btn ${nurseStatus === option.value ? 'active' : 'inactive'}`}
                      onClick={() => handleStatusChange(option.value)}
                      disabled={savingStatus}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {savingStatus && (
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>Saving...</p>
                )}
              </div>

            </div>
          </div>
        )}

        {/* AVAILABILITY TAB */}
        {activeTab === 'availability' && (
          <div>
            <div className="availability-header">
              <h1>Nurse Availability</h1>
              <p>Configure your recurring schedule. Click a row to edit its status.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Weekly Schedule</h3>
                <button className="btn-add" onClick={handleOpenAddAvailability}>
                  <FaPlus /> Add Schedule
                </button>
              </div>

              {nurseAvailability.length === 0 ? (
                <p className="empty-text">No availability set yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time Start</th>
                        <th>Time End</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nurseAvailability.map((avail) => (
                        <tr key={avail.id}>
                          <td data-label="Day">{avail.day_of_week}</td>
                          <td data-label="Time Start">{avail.time_start}</td>
                          <td data-label="Time End">{avail.time_end}</td>
                          <td data-label="Status">
                            <span className={`badge ${avail.status === 'available' ? 'badge-approved' : 'badge-declined'}`}>
                              {avail.status}
                            </span>
                          </td>
                          <td data-label="Action" style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn-add"
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              onClick={() => handleEditAvailability(avail)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteAvailability(avail.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* HEALTH EVENTS TAB */}
        {activeTab === 'health-events' && (
          <div>
            <div className="health-events-header">
              <h1>Health Events</h1>
              <p>Organize community wellness initiatives and vaccination schedules.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Health Events</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={healthEventFilter}
                      onChange={(e) => setHealthEventFilter(e.target.value)}
                    >
                      <option value="all">All Events</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="past">Past</option>
                    </select>
                  </div>
                  <button className="btn-add" onClick={() => setShowEventModal(true)}>
                    <FaPlus /> Add New Event
                  </button>
                </div>
              </div>

              {(() => {
                const todayStr = new Date().toISOString().slice(0, 10)
                const filteredHealthEvents = healthEventFilter === 'all'
                  ? healthEvents
                  : healthEventFilter === 'upcoming'
                    ? healthEvents.filter((ev) => ev.event_date >= todayStr)
                    : healthEvents.filter((ev) => ev.event_date < todayStr)

                return filteredHealthEvents.length === 0 ? (
                <p className="empty-text">No health events found.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Target</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHealthEvents.map((event) => (
                        <tr key={event.id}>
                          <td data-label="Title">{event.title}</td>
                          <td data-label="Date">{event.event_date}</td>
                          <td data-label="Location">{event.location}</td>
                          <td data-label="Target">{event.target_audience}</td>
                          <td data-label="Action">
                            <button className="btn-deny" onClick={() => handleDeleteEvent(event.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <div className="settings-header">
              <h1>Settings</h1>
              <p>Manage your account preferences and security settings.</p>
            </div>

            <div className="settings-grid">
              <div className="profile-card">
                <div className="profile-card-header">
                  <h3>Profile Information</h3>
                </div>
                <div className="profile-avatar-section">
                  <div className="profile-avatar">
                    <PersonAvatar
                      name={nurseName}
                      fallbackIcon={<FaUserNurse />}
                      className="profile-avatar-photo"
                    />
                  </div>
                  <div className="profile-name">{nurseName}</div>
                  <div className="profile-role">Head Barangay Nurse</div>
                </div>
                <div className="profile-form">
                  <div className="profile-form-group">
                    <label className="profile-form-label">Email Address</label>
                    <input
                      type="email"
                      className="profile-form-input"
                      value={user?.email || ''}
                      disabled
                    />
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Name and email are managed by the barangay directory. Contact an official if these need updating.
                  </p>
                </div>
              </div>

              <div className="security-card">
                <div className="security-card-header">
                  <h3>Account Security</h3>
                </div>
                <div className="security-form">
                  <div>
                    <label className="security-label">Change Password</label>
                    <p className="security-desc">Update your password regularly for better security.</p>

                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <input
                        type={showNew ? 'text' : 'password'}
                        className="security-input"
                        placeholder="New password (min. 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="security-toggle-btn"
                        onClick={() => setShowNew(!showNew)}
                      >
                        {showNew ? <><FaEyeSlash /> Hide</> : <><FaEye /> Show</>}
                      </button>
                    </div>

                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        className="security-input"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="security-toggle-btn"
                        onClick={() => setShowConfirm(!showConfirm)}
                      >
                        {showConfirm ? <><FaEyeSlash /> Hide</> : <><FaEye /> Show</>}
                      </button>
                    </div>
                  </div>

                  <button
                    className="security-save-btn"
                    onClick={handleChangePassword}
                    disabled={passwordLoading}
                  >
                    <FaLock /> {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HEALTH EVENT MODAL */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Add New Health Event</h3>
            {[
              { label: 'Event Title *', key: 'title', type: 'text', placeholder: 'e.g. Vaccination Drive' },
              { label: 'Description', key: 'description', type: 'text', placeholder: 'Event description' },
              { label: 'Event Date *', key: 'event_date', type: 'date', placeholder: '' },
              { label: 'Location', key: 'location', type: 'text', placeholder: 'Event location' },
              { label: 'Target Audience', key: 'target_audience', type: 'text', placeholder: 'e.g. Senior Citizens' },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={newEvent[field.key]}
                  onChange={(e) => setNewEvent({ ...newEvent, [field.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'Poppins, sans-serif', outline: 'none' }}
                />
              </div>
            ))}
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowEventModal(false)}>Cancel</button>
              <button className="btn-save" onClick={handleAddEvent} disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVAILABILITY MODAL */}
      {showAvailabilityModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingAvail ? `Edit ${editingAvail.day_of_week}` : 'Add Availability'}</h3>

            {!editingAvail && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Day of Week *
                </label>
                <select
                  value={newAvailability.day_of_week}
                  onChange={(e) => setNewAvailability({ ...newAvailability, day_of_week: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'Poppins, sans-serif', outline: 'none', backgroundColor: 'white' }}
                >
                  <option value="">Select Day</option>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}

            {[
              { label: 'Time Start *', key: 'time_start' },
              { label: 'Time End *', key: 'time_end' },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {field.label}
                </label>
                <input
                  type="time"
                  value={newAvailability[field.key]}
                  onChange={(e) => setNewAvailability({ ...newAvailability, [field.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'Poppins, sans-serif', outline: 'none' }}
                />
              </div>
            ))}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Status
              </label>
              <select
                value={newAvailability.status}
                onChange={(e) => setNewAvailability({ ...newAvailability, status: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'Poppins, sans-serif', outline: 'none', backgroundColor: 'white' }}
              >
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
                <option value="on-leave">On Leave</option>
              </select>
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowAvailabilityModal(false)}>Cancel</button>
              <button className="btn-save" onClick={handleSaveAvailability} disabled={submitting}>
                {submitting ? 'Saving...' : editingAvail ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEDICAL PROGRAM MODAL */}
      {showProgramModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingProgram ? 'Edit Program' : 'Add Program'}</h3>
            {[
              { label: 'Program Title *', key: 'title', placeholder: 'e.g. Child Immunization' },
              { label: 'Schedule *', key: 'schedule_label', placeholder: 'e.g. Every Tuesday' },
              { label: 'Time *', key: 'time_label', placeholder: 'e.g. 8:00 AM - 12:00 PM' },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {field.label}
                </label>
                <input
                  type="text"
                  placeholder={field.placeholder}
                  value={newProgram[field.key]}
                  onChange={(e) => setNewProgram({ ...newProgram, [field.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontFamily: 'Poppins, sans-serif', outline: 'none' }}
                />
              </div>
            ))}
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowProgramModal(false); setEditingProgram(null) }}>Cancel</button>
              <button className="btn-save" onClick={handleSaveProgram} disabled={submitting}>
                {submitting ? 'Saving...' : editingProgram ? 'Update Program' : 'Save Program'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default NurseDashboard