import { useState, useEffect } from 'react'
import {
  FaClipboardList,
  FaBullhorn,
  FaCalendarAlt,
  FaUsers,
  FaPlus,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import '../components/Sidebar.css'
import './OfficialDashboard.css'

const OfficialDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [reservations, setReservations] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [kapitanStatus, setKapitanStatus] =
    useState('in-office')
  const [loading, setLoading] = useState(true)

  // Modal States
  const [showAnnouncementModal, setShowAnnouncementModal] =
    useState(false)
  const [showEventModal, setShowEventModal] =
    useState(false)

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    description: '',
    badge: '',
  })

  const [newEvent, setNewEvent] = useState({
    title: '',
    location: '',
    event_date: '',
  })

  useEffect(() => {
    fetchReservations()
    fetchAnnouncements()
    fetchEvents()
    fetchKapitanStatus()
  }, [])

  const fetchReservations = async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setReservations(data)
    setLoading(false)
  }

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('date_posted', { ascending: false })

    if (!error) setAnnouncements(data)
  }

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    if (!error) setEvents(data)
  }

  const fetchKapitanStatus = async () => {
    const { data, error } = await supabase
      .from('kapitan_status')
      .select('*')
      .single()

    if (!error && data) setKapitanStatus(data.status)
  }

  const handleApproveReservation = async (id) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'approved' })
      .eq('id', id)

    if (error) {
      toast.error('Failed to approve reservation!')
    } else {
      toast.success('Reservation approved!')
      fetchReservations()
    }
  }

  const handleDeclineReservation = async (id) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'declined' })
      .eq('id', id)

    if (error) {
      toast.error('Failed to decline reservation!')
    } else {
      toast.success('Reservation declined!')
      fetchReservations()
    }
  }

  const handleUpdateKapitanStatus = async (status) => {
    const { data } = await supabase
      .from('kapitan_status')
      .select('id')
      .single()

    const { error } = await supabase
      .from('kapitan_status')
      .update({ status: status })
      .eq('id', data.id)

    if (error) {
      toast.error('Failed to update status!')
    } else {
      setKapitanStatus(status)
      toast.success('Kapitan status updated!')
    }
  }

  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title ||
      !newAnnouncement.description) {
      toast.error('Please fill in all fields!')
      return
    }

    const { error } = await supabase
      .from('announcements')
      .insert([{
        title: newAnnouncement.title,
        description: newAnnouncement.description,
        badge: newAnnouncement.badge,
      }])

    if (error) {
      toast.error('Failed to add announcement!')
    } else {
      toast.success('Announcement added!')
      setShowAnnouncementModal(false)
      setNewAnnouncement({
        title: '',
        description: '',
        badge: '',
      })
      fetchAnnouncements()
    }
  }

  const handleDeleteAnnouncement = async (id) => {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete announcement!')
    } else {
      toast.success('Announcement deleted!')
      fetchAnnouncements()
    }
  }

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all fields!')
      return
    }

    const date = new Date(newEvent.event_date)
    const month = date.toLocaleString('en-US', {
      month: 'short'
    }).toUpperCase()
    const day = String(date.getDate())
      .padStart(2, '0')

    const { error } = await supabase
      .from('events')
      .insert([{
        title: newEvent.title,
        location: newEvent.location,
        event_date: newEvent.event_date,
        event_month: month,
        event_day: day,
      }])

    if (error) {
      toast.error('Failed to add event!')
    } else {
      toast.success('Event added!')
      setShowEventModal(false)
      setNewEvent({
        title: '',
        location: '',
        event_date: '',
      })
      fetchEvents()
    }
  }

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete event!')
    } else {
      toast.success('Event deleted!')
      fetchEvents()
    }
  }

  const pendingReservations = reservations
    .filter(r => r.status === 'pending')

  return (
    <div className="dashboard-layout">

      {/* Sidebar */}
      <Sidebar
        role="official"
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
            <div className="official-dashboard-header">
              <h1>Administrative Hub</h1>
              <p>
                Good day, Official. Here is the
                current pulse of Barangay Batinguel.
              </p>
            </div>

            {/* Stats Cards */}
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon blue">
                    <FaClipboardList />
                  </div>
                </div>
                <div className="stat-card-value">
                  {pendingReservations.length}
                </div>
                <div className="stat-card-label">
                  Pending Reservations
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon green">
                    <FaBullhorn />
                  </div>
                </div>
                <div className="stat-card-value">
                  {announcements.length}
                </div>
                <div className="stat-card-label">
                  Announcements
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon yellow">
                    <FaCalendarAlt />
                  </div>
                </div>
                <div className="stat-card-value">
                  {events.length}
                </div>
                <div className="stat-card-label">
                  Upcoming Events
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon red">
                    <FaUsers />
                  </div>
                </div>
                <div className="stat-card-value">
                  {reservations.length}
                </div>
                <div className="stat-card-label">
                  Total Reservations
                </div>
              </div>
            </div>

            {/* Kapitan Status */}
            <div className="kapitan-status-section">
              <h3>Kapitan's Status</h3>
              <div className="kapitan-status-grid">
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'in-office'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'in-office'
                    )}>
                  ✅ In Office
                </button>
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'on-field'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'on-field'
                    )}>
                  🚗 On Field
                </button>
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'unavailable'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'unavailable'
                    )}>
                  ❌ Unavailable
                </button>
              </div>
              <div className="kapitan-current-status">
                Current Status:
                <strong>
                  {kapitanStatus === 'in-office'
                    ? '✅ In Office'
                    : kapitanStatus === 'on-field'
                    ? '🚗 On Field'
                    : '❌ Unavailable'}
                </strong>
              </div>
            </div>

            {/* Pending Reservations */}
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Pending Court Reservations</h3>
                <button
                  className="view-all-link"
                  onClick={() =>
                    setActiveTab('reservations')}>
                  View All
                </button>
              </div>

              {loading ? (
                <p className="dashboard-loading">
                  Loading...
                </p>
              ) : pendingReservations.length === 0 ? (
                <p className="dashboard-empty">
                  No pending reservations.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Purpose</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingReservations
                        .slice(0, 5)
                        .map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">
                            {res.full_name}
                          </td>
                          <td data-label="Date">
                            {res.preferred_date}
                          </td>
                          <td data-label="Time">
                            {res.preferred_time}
                          </td>
                          <td data-label="Purpose">
                            {res.purpose}
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-approve"
                              onClick={() =>
                                handleApproveReservation(
                                  res.id
                                )}>
                              Approve
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() =>
                                handleDeclineReservation(
                                  res.id
                                )}>
                              Deny
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
            ANNOUNCEMENTS TAB
        ======================== */}
        {activeTab === 'announcements' && (
          <div>
            <div className="announcements-header">
              <h1>Community Voice</h1>
              <p>
                Manage your broadcast communications
                and keep the community informed.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Announcements</h3>
                <button
                  className="btn-add"
                  onClick={() =>
                    setShowAnnouncementModal(true)}>
                  <FaPlus /> New Announcement
                </button>
              </div>

              {announcements.length === 0 ? (
                <p className="dashboard-empty">
                  No announcements yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Badge</th>
                        <th>Date Posted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements.map((ann) => (
                        <tr key={ann.id}>
                          <td data-label="Title">
                            {ann.title}
                          </td>
                          <td data-label="Badge">
                            {ann.badge}
                          </td>
                          <td data-label="Date Posted">
                            {new Date(ann.date_posted)
                              .toLocaleDateString()}
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() =>
                                handleDeleteAnnouncement(
                                  ann.id
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
            EVENTS TAB
        ======================== */}
        {activeTab === 'events' && (
          <div>
            <div className="events-header">
              <h1>Community Events</h1>
              <p>
                Manage upcoming neighborhood
                activities and events.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Events</h3>
                <button
                  className="btn-add"
                  onClick={() =>
                    setShowEventModal(true)}>
                  <FaPlus /> Add New Event
                </button>
              </div>

              {events.length === 0 ? (
                <p className="dashboard-empty">
                  No events yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
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
            RESERVATIONS TAB
        ======================== */}
        {activeTab === 'reservations' && (
          <div>
            <div className="reservations-header">
              <h1>Facility Booking Queue</h1>
              <p>
                Review pending court reservations
                and manage time slots.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Reservations</h3>
              </div>

              {reservations.length === 0 ? (
                <p className="dashboard-empty">
                  No reservations yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Purok</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">
                            {res.full_name}
                          </td>
                          <td data-label="Purok">
                            {res.purok}
                          </td>
                          <td data-label="Date">
                            {res.preferred_date}
                          </td>
                          <td data-label="Time">
                            {res.preferred_time}
                          </td>
                          <td data-label="Purpose">
                            {res.purpose}
                          </td>
                          <td data-label="Status">
                            <span className={`badge
                              badge-${res.status}`}>
                              {res.status}
                            </span>
                          </td>
                          <td data-label="Action">
                            {res.status === 'pending' && (
                              <>
                                <button
                                  className="btn-approve"
                                  onClick={() =>
                                    handleApproveReservation(
                                      res.id
                                    )}>
                                  Approve
                                </button>
                                <button
                                  className="btn-deny"
                                  onClick={() =>
                                    handleDeclineReservation(
                                      res.id
                                    )}>
                                  Deny
                                </button>
                              </>
                            )}
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
            KAPITAN STATUS TAB
        ======================== */}
        {activeTab === 'kapitan' && (
          <div>
            <div className="kapitan-page-header">
              <h1>Kapitan Status Tracker</h1>
              <p>
                Maintain transparency by providing
                real-time updates on availability.
              </p>
            </div>

            <div className="kapitan-status-section">
              <h3>Current Active Status</h3>
              <div className="kapitan-current-display">
                {kapitanStatus === 'in-office'
                  ? '✅ In Office'
                  : kapitanStatus === 'on-field'
                  ? '🚗 On Field'
                  : '❌ Unavailable'}
              </div>
              <div className="kapitan-status-grid">
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'in-office'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'in-office'
                    )}>
                  ✅ In Office
                </button>
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'on-field'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'on-field'
                    )}>
                  🚗 On Field
                </button>
                <button
                  className={`kapitan-status-option
                    ${kapitanStatus === 'unavailable'
                      ? 'active' : ''}`}
                  onClick={() =>
                    handleUpdateKapitanStatus(
                      'unavailable'
                    )}>
                  ❌ Unavailable
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================
            OFFICIALS DIRECTORY TAB
        ======================== */}
        {activeTab === 'officials' && (
          <div>
            <div className="officials-dir-header">
              <h1>Leadership Directory</h1>
              <p>
                Manage the digital face of your
                community leadership.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Barangay Officials</h3>
              </div>
              <p className="dashboard-empty">
                Officials directory will be
                managed here.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* ========================
          ANNOUNCEMENT MODAL
      ======================== */}
      {showAnnouncementModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Announcement</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Title
              </label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Announcement title"
                value={newAnnouncement.title}
                onChange={(e) =>
                  setNewAnnouncement({
                    ...newAnnouncement,
                    title: e.target.value
                  })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Badge / Category
              </label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. PUBLIC WORKS, HEALTH"
                value={newAnnouncement.badge}
                onChange={(e) =>
                  setNewAnnouncement({
                    ...newAnnouncement,
                    badge: e.target.value
                  })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Description
              </label>
              <textarea
                className="modal-form-textarea"
                placeholder="Announcement description"
                value={newAnnouncement.description}
                onChange={(e) =>
                  setNewAnnouncement({
                    ...newAnnouncement,
                    description: e.target.value
                  })}
              />
            </div>

            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() =>
                  setShowAnnouncementModal(false)}>
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleAddAnnouncement}>
                Save Announcement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================
          EVENT MODAL
      ======================== */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Add New Event</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Event Title
              </label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({
                  ...newEvent,
                  title: e.target.value
                })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Location
              </label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({
                  ...newEvent,
                  location: e.target.value
                })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">
                Event Date
              </label>
              <input
                type="date"
                className="modal-form-input"
                value={newEvent.event_date}
                onChange={(e) => setNewEvent({
                  ...newEvent,
                  event_date: e.target.value
                })}
              />
            </div>

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

    </div>
  )
}

export default OfficialDashboard