import { useState, useEffect } from 'react'
import {
  FaUserNurse,
  FaPlus,
  FaSave,
  FaEye,
  FaEyeSlash,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import '../components/Sidebar.css'
import './NurseDashboard.css'

const NurseDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [healthEvents, setHealthEvents] = useState([])
  const [nurseAvailability, setNurseAvailability] =
    useState([])
  const [loading, setLoading] = useState(true)
  const [nurseStatus, setNurseStatus] =
    useState('available')
  const [showPassword, setShowPassword] = useState(false)

  // Modal States
  const [showEventModal, setShowEventModal] =
    useState(false)
  const [showAvailabilityModal, setShowAvailabilityModal] =
    useState(false)

  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    event_date: '',
    location: '',
    target_audience: '',
  })

  const [newAvailability, setNewAvailability] = useState({
    nurse_name: 'Nurse Clara Reyes',
    day_of_week: '',
    time_start: '',
    time_end: '',
    status: 'available',
  })

  const [settings, setSettings] = useState({
    full_name: 'Nurse Clara Reyes',
    email: 'nurse@batinguel.com',
    contact_number: '',
    new_password: '',
  })

  const activePrograms = [
    {
      id: 1,
      title: 'Child Immunization',
      schedule: 'Every Tuesday',
      time: '8:00 AM - 12:00 PM',
    },
    {
      id: 2,
      title: 'Senior Wellness',
      schedule: 'Monthly 1st Fri',
      time: '1:00 PM - 4:00 PM',
    },
    {
      id: 3,
      title: 'Maternal Care',
      schedule: 'Every Wednesday',
      time: '9:00 AM - 3:00 PM',
    },
    {
      id: 4,
      title: 'NCD Screening',
      schedule: 'Daily Walk-in',
      time: 'Full Clinic Hours',
    },
  ]

  useEffect(() => {
    fetchHealthEvents()
    fetchNurseAvailability()
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

    if (!error) setNurseAvailability(data)
  }

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all required fields!')
      return
    }

    const date = new Date(newEvent.event_date)
    const month = date.toLocaleString('en-US', {
      month: 'short'
    }).toUpperCase()
    const day = String(date.getDate())
      .padStart(2, '0')

    const { error } = await supabase
      .from('health_events')
      .insert([{
        title: newEvent.title,
        description: newEvent.description,
        event_date: newEvent.event_date,
        event_month: month,
        event_day: day,
        location: newEvent.location,
        target_audience: newEvent.target_audience,
      }])

    if (error) {
      toast.error('Failed to add health event!')
    } else {
      toast.success('Health event added!')
      setShowEventModal(false)
      setNewEvent({
        title: '',
        description: '',
        event_date: '',
        location: '',
        target_audience: '',
      })
      fetchHealthEvents()
    }
  }

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase
      .from('health_events')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete event!')
    } else {
      toast.success('Event deleted!')
      fetchHealthEvents()
    }
  }

  const handleAddAvailability = async () => {
    if (!newAvailability.day_of_week ||
      !newAvailability.time_start ||
      !newAvailability.time_end) {
      toast.error('Please fill in all fields!')
      return
    }

    const { error } = await supabase
      .from('nurse_availability')
      .insert([newAvailability])

    if (error) {
      toast.error('Failed to add availability!')
    } else {
      toast.success('Availability added!')
      setShowAvailabilityModal(false)
      setNewAvailability({
        nurse_name: 'Nurse Clara Reyes',
        day_of_week: '',
        time_start: '',
        time_end: '',
        status: 'available',
      })
      fetchNurseAvailability()
    }
  }

  const handleDeleteAvailability = async (id) => {
    const { error } = await supabase
      .from('nurse_availability')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete!')
    } else {
      toast.success('Deleted!')
      fetchNurseAvailability()
    }
  }

  const handleSaveSettings = () => {
    toast.success('Settings saved successfully!')
  }

  return (
    <div className="dashboard-layout">

      {/* Sidebar */}
      <Sidebar
        role="nurse"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content */}
      <div className="dashboard-main">

        {/* ========================
            DASHBOARD TAB
        ======================== */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Header */}
            <div className="nurse-dashboard-header">
              <div>
                <h1>
                  Nurse Administrator Dashboard
                </h1>
                <p>
                  Managing community health and
                  medical services for
                  Barangay Batinguel.
                </p>
              </div>
              <div className="nurse-status-badge">
                <div className="nurse-status-dot">
                </div>
                STATUS: Available Now
              </div>
            </div>

            {/* Dashboard Grid */}
            <div className="nurse-dashboard-grid">

              {/* Bakuna Calendar */}
              <div className="bakuna-calendar-card">
                <div className="bakuna-calendar-header">
                  <h3>💉 Bakuna Calendar</h3>
                  <button
                    className="btn-add"
                    onClick={() =>
                      setShowEventModal(true)}>
                    Manage
                  </button>
                </div>

                {loading ? (
                  <p className="loading-text">
                    Loading...
                  </p>
                ) : healthEvents.length === 0 ? (
                  <p className="empty-text">
                    No health events yet.
                  </p>
                ) : (
                  healthEvents.slice(0, 3)
                    .map((event) => (
                    <div key={event.id}
                      className="bakuna-event-item">
                      <div className="bakuna-event-date">
                        <div className="month">
                          {event.event_month}
                        </div>
                        <div className="day">
                          {event.event_day}
                        </div>
                      </div>
                      <div className="bakuna-event-info">
                        <h5>{event.title}</h5>
                        <p>{event.location}</p>
                      </div>
                    </div>
                  ))
                )}

                <button
                  className="bakuna-add-btn"
                  onClick={() =>
                    setShowEventModal(true)}>
                  <FaPlus /> Schedule New Event
                </button>
              </div>

              {/* Active Medical Programs */}
              <div className="programs-card">
                <div className="programs-card-header">
                  <h3>Active Medical Programs</h3>
                </div>
                <p className="programs-subtitle">
                  Update schedules and program
                  availability
                </p>

                <div className="programs-grid">
                  {activePrograms.map((program) => (
                    <div key={program.id}
                      className="program-item">
                      <div className="program-item-title">
                        {program.title}
                      </div>
                      <div className="program-item-schedule">
                        {program.schedule}
                      </div>
                      <div className="program-item-time">
                        {program.time}
                      </div>
                      <button
                        className="program-edit-btn">
                        Edit Schedule →
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Outreach */}
              <div className="outreach-card">
                <div className="outreach-label">
                  Monthly Health Outreach
                </div>
                <div className="outreach-number">
                  1,248
                </div>
                <div className="outreach-sublabel">
                  Residents served this month
                </div>
              </div>

              {/* My Status */}
              <div className="nurse-my-status-card">
                <h3>My Status</h3>
                <div className="nurse-status-options">
                  {[
                    { value: 'available',
                      label: '✅ Available' },
                    { value: 'on-leave',
                      label: '🏖️ On Leave' },
                    { value: 'unavailable',
                      label: '❌ Unavailable' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`nurse-status-option-btn
                        ${nurseStatus === option.value
                          ? 'active'
                          : 'inactive'}`}
                      onClick={() =>
                        setNurseStatus(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================
            AVAILABILITY TAB
        ======================== */}
        {activeTab === 'availability' && (
          <div>
            <div className="availability-header">
              <h1>Nurse Availability</h1>
              <p>
                Configure your recurring schedule
                and manage time-off requests.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Weekly Schedule</h3>
                <button
                  className="btn-add"
                  onClick={() =>
                    setShowAvailabilityModal(true)}>
                  <FaPlus /> Update Schedule
                </button>
              </div>

              {nurseAvailability.length === 0 ? (
                <p className="empty-text">
                  No availability set yet.
                </p>
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
                          <td data-label="Day">
                            {avail.day_of_week}
                          </td>
                          <td data-label="Time Start">
                            {avail.time_start}
                          </td>
                          <td data-label="Time End">
                            {avail.time_end}
                          </td>
                          <td data-label="Status">
                            <span className={`badge
                              ${avail.status === 'available'
                                ? 'badge-approved'
                                : 'badge-declined'}`}>
                              {avail.status}
                            </span>
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() =>
                                handleDeleteAvailability(
                                  avail.id
                                )}>
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

        {/* ========================
            HEALTH EVENTS TAB
        ======================== */}
        {activeTab === 'health-events' && (
          <div>
            <div className="health-events-header">
              <h1>Health Events</h1>
              <p>
                Organize community wellness
                initiatives and vaccination schedules.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Health Events</h3>
                <button
                  className="btn-add"
                  onClick={() =>
                    setShowEventModal(true)}>
                  <FaPlus /> Add New Event
                </button>
              </div>

              {healthEvents.length === 0 ? (
                <p className="empty-text">
                  No health events yet.
                </p>
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
                      {healthEvents.map((event) => (
                        <tr key={event.id}>
                          <td data-label="Title">
                            {event.title}
                          </td>
                          <td data-label="Date">
                            {event.event_date}
                          </td>
                          <td data-label="Location">
                            {event.location}
                          </td>
                          <td data-label="Target">
                            {event.target_audience}
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() =>
                                handleDeleteEvent(
                                  event.id
                                )}>
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

        {/* ========================
            SETTINGS TAB
        ======================== */}
        {activeTab === 'settings' && (
          <div>
            <div className="settings-header">
              <h1>Settings</h1>
              <p>
                Manage your account preferences
                and security settings.
              </p>
            </div>

            <div className="settings-grid">

              {/* Profile Card */}
              <div className="profile-card">
                <div className="profile-card-header">
                  <h3>Profile Information</h3>
                </div>

                <div className="profile-avatar-section">
                  <div className="profile-avatar">
                    <FaUserNurse />
                  </div>
                  <div className="profile-name">
                    {settings.full_name}
                  </div>
                  <div className="profile-role">
                    Head Barangay Nurse
                  </div>
                </div>

                <div className="profile-form">
                  <div className="profile-form-group">
                    <label className="profile-form-label">
                      Full Name
                    </label>
                    <input
                      type="text"
                      className="profile-form-input"
                      value={settings.full_name}
                      onChange={(e) => setSettings({
                        ...settings,
                        full_name: e.target.value
                      })}
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-form-label">
                      Email Address
                    </label>
                    <input
                      type="email"
                      className="profile-form-input"
                      value={settings.email}
                      onChange={(e) => setSettings({
                        ...settings,
                        email: e.target.value
                      })}
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-form-label">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      className="profile-form-input"
                      placeholder="+63 9XX-XXX-XXXX"
                      value={settings.contact_number}
                      onChange={(e) => setSettings({
                        ...settings,
                        contact_number: e.target.value
                      })}
                    />
                  </div>
                  <button
                    className="profile-save-btn"
                    onClick={handleSaveSettings}>
                    <FaSave /> Save Profile
                  </button>
                </div>
              </div>

              {/* Security Card */}
              <div className="security-card">
                <div className="security-card-header">
                  <h3>Account Security</h3>
                </div>

                <div className="security-form">
                  <div>
                    <label className="security-label">
                      Change Password
                    </label>
                    <p className="security-desc">
                      Update your password regularly
                      for better security.
                    </p>
                    <input
                      type={showPassword
                        ? 'text' : 'password'}
                      className="security-input"
                      placeholder="New password"
                      value={settings.new_password}
                      onChange={(e) => setSettings({
                        ...settings,
                        new_password: e.target.value
                      })}
                    />
                    <button
                      className="security-toggle-btn"
                      onClick={() =>
                        setShowPassword(!showPassword)}>
                      {showPassword
                        ? <><FaEyeSlash /> Hide</>
                        : <><FaEye /> Show</>}
                    </button>
                  </div>

                  <div className="notification-section">
                    <label className="notification-label">
                      Notification Preferences
                    </label>
                    {[
                      'SMS Alerts',
                      'Email Alerts',
                      'System Announcements',
                    ].map((pref) => (
                      <div key={pref}
                        className="notification-item">
                        <span
                          className="notification-item-label">
                          {pref}
                        </span>
                        <button
                          className="notification-toggle">
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    className="security-save-btn"
                    onClick={handleSaveSettings}>
                    <FaSave /> Save Preferences
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ========================
          HEALTH EVENT MODAL
      ======================== */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Add New Health Event</h3>

            {[
              { label: 'Event Title *',
                key: 'title',
                type: 'text',
                placeholder: 'e.g. Vaccination Drive' },
              { label: 'Description',
                key: 'description',
                type: 'text',
                placeholder: 'Event description' },
              { label: 'Event Date *',
                key: 'event_date',
                type: 'date',
                placeholder: '' },
              { label: 'Location',
                key: 'location',
                type: 'text',
                placeholder: 'Event location' },
              { label: 'Target Audience',
                key: 'target_audience',
                type: 'text',
                placeholder:
                  'e.g. Target: Senior Citizens' },
            ].map((field) => (
              <div key={field.key}
                style={{ marginBottom: '16px' }}>
                <label style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#374151',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={newEvent[field.key]}
                  onChange={(e) => setNewEvent({
                    ...newEvent,
                    [field.key]: e.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'Poppins, sans-serif',
                    outline: 'none'
                  }}
                />
              </div>
            ))}

            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() =>
                  setShowEventModal(false)}>
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleAddEvent}>
                Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================
          AVAILABILITY MODAL
      ======================== */}
      {showAvailabilityModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Update Availability</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '6px'
              }}>
                Day of Week *
              </label>
              <select
                value={newAvailability.day_of_week}
                onChange={(e) => setNewAvailability({
                  ...newAvailability,
                  day_of_week: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Poppins, sans-serif',
                  outline: 'none',
                  backgroundColor: 'white'
                }}>
                <option value="">Select Day</option>
                {['Monday', 'Tuesday', 'Wednesday',
                  'Thursday', 'Friday', 'Saturday']
                  .map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '6px'
              }}>
                Time Start *
              </label>
              <input
                type="time"
                value={newAvailability.time_start}
                onChange={(e) => setNewAvailability({
                  ...newAvailability,
                  time_start: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Poppins, sans-serif',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '6px'
              }}>
                Time End *
              </label>
              <input
                type="time"
                value={newAvailability.time_end}
                onChange={(e) => setNewAvailability({
                  ...newAvailability,
                  time_end: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Poppins, sans-serif',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '6px'
              }}>
                Status
              </label>
              <select
                value={newAvailability.status}
                onChange={(e) => setNewAvailability({
                  ...newAvailability,
                  status: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Poppins, sans-serif',
                  outline: 'none',
                  backgroundColor: 'white'
                }}>
                <option value="available">
                  Available
                </option>
                <option value="on-leave">
                  On Leave
                </option>
                <option value="unavailable">
                  Unavailable
                </option>
              </select>
            </div>

            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() =>
                  setShowAvailabilityModal(false)}>
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleAddAvailability}>
                Save Availability
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default NurseDashboard