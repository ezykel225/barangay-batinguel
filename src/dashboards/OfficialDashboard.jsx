import { useState, useEffect } from 'react'
import {
  FaClipboardList,
  FaBullhorn,
  FaCalendarAlt,
  FaUsers,
  FaUser,
  FaPlus,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaEdit,
  FaTrash,
  FaFilter,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import { PersonAvatar } from '../utils/officialPhotos'
import '../components/Sidebar.css'
import './OfficialDashboard.css'

const OfficialDashboard = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [reservations, setReservations] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [officialsList, setOfficialsList] = useState([])
  const [kapitanStatus, setKapitanStatus] = useState('available')
  const [loading, setLoading] = useState(true)

  // Filters
  const [reservationFilter, setReservationFilter] = useState('all')
  const [announcementFilter, setAnnouncementFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')

  // Logged-in user info from profiles + barangay_officials
  const [userProfile, setUserProfile] = useState(null)
  const [officialInfo, setOfficialInfo] = useState(null)

  // Modal States
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showOfficialModal, setShowOfficialModal] = useState(false)
  const [editingOfficial, setEditingOfficial] = useState(null)

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

  const [newOfficial, setNewOfficial] = useState({
    full_name: '',
    position: '',
    committee: '',
    contact_number: '',
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
    fetchReservations()
    fetchAnnouncements()
    fetchEvents()
    fetchKapitanStatus()
    fetchOfficialsList()
    if (user?.id) fetchUserInfo(user.id)
  }, [user])

  const fetchUserInfo = async (userId) => {
    // Get profile (name, role)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single()

    if (profile) {
      setUserProfile(profile)

      // Get position/committee from barangay_officials
      const { data: official } = await supabase
        .from('barangay_officials')
        .select('position, committee')
        .eq('full_name', profile.full_name)
        .single()

      if (official) setOfficialInfo(official)
    }
  }

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

  const fetchOfficialsList = async () => {
    const { data, error } = await supabase
      .from('barangay_officials')
      .select('*')
      .order('display_order', { ascending: true })

    if (!error) setOfficialsList(data || [])
  }

  // Only Punong Barangay can update kapitan status
  const isKapitan = officialInfo?.position === 'Punong Barangay'

  // Display name: first name only for greeting
  const firstName = userProfile?.full_name
    ? userProfile.full_name.replace(/^Hon\.\s*/i, '').split(' ')[0]
    : 'Official'

  // Position label shown under greeting
  const positionLabel = officialInfo
    ? officialInfo.committee
      ? `${officialInfo.position} — ${officialInfo.committee}`
      : officialInfo.position
    : ''

  const notifyResident = async (reservation, status) => {
    try {
      const { data, error } = await supabase.functions.invoke('notify-reservation-sms', {
        body: {
          contact_number: reservation.contact_number,
          full_name: reservation.full_name,
          status,
          preferred_date: reservation.preferred_date,
          preferred_time: reservation.preferred_time,
        },
      })
      if (error) {
        console.error('SMS notify error:', error)
      } else if (data?.skipped) {
        // SMS not configured yet — this is expected until SEMAPHORE_API_KEY is set.
        console.warn('SMS skipped:', data.reason)
      }
    } catch (err) {
      console.error('SMS notify error:', err)
    }
  }

  const handleApproveReservation = async (reservation) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'approved', reviewed_by: user?.id ?? null })
      .eq('id', reservation.id)

    if (error) {
      toast.error('Failed to approve reservation!')
    } else {
      toast.success('Reservation approved!')
      notifyResident(reservation, 'approved')
      fetchReservations()
    }
  }

  const handleDeclineReservation = async (reservation) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'declined', reviewed_by: user?.id ?? null })
      .eq('id', reservation.id)

    if (error) {
      toast.error('Failed to decline reservation!')
    } else {
      toast.success('Reservation declined!')
      notifyResident(reservation, 'declined')
      fetchReservations()
    }
  }

  const handleUpdateKapitanStatus = async (status) => {
    if (!isKapitan) return

    const { data } = await supabase
      .from('kapitan_status')
      .select('id')
      .single()

    const { error } = await supabase
      .from('kapitan_status')
      .update({ status })
      .eq('id', data.id)

    if (error) {
      toast.error('Failed to update status!')
    } else {
      setKapitanStatus(status)
      toast.success('Status updated!')
    }
  }

  const KAPITAN_STATUS_OPTIONS = [
    { value: 'available', label: 'Available', emoji: '✅' },
    { value: 'in-meeting', label: 'In a Meeting', emoji: '📋' },
    { value: 'out-of-office', label: 'Out of Office', emoji: '🚗' },
    { value: 'on-leave', label: 'On Leave', emoji: '🏖️' },
  ]

  const kapitanStatusDisplay = (statusValue) => {
    const found = KAPITAN_STATUS_OPTIONS.find((o) => o.value === statusValue)
    return found ? `${found.emoji} ${found.label}` : 'Unknown'
  }

  const handleAddOfficial = async () => {
    if (!newOfficial.full_name || !newOfficial.position) {
      toast.error('Full name and position are required!')
      return
    }

    if (editingOfficial) {
      const { error } = await supabase
        .from('barangay_officials')
        .update({
          full_name: newOfficial.full_name,
          position: newOfficial.position,
          committee: newOfficial.committee || null,
          contact_number: newOfficial.contact_number || null,
          display_order: Number(newOfficial.display_order) || 0,
          updated_by: user?.id ?? null,
        })
        .eq('id', editingOfficial.id)

      if (error) {
        toast.error('Failed to update official!')
      } else {
        toast.success('Official updated!')
        setShowOfficialModal(false)
        fetchOfficialsList()
      }
    } else {
      const { error } = await supabase.from('barangay_officials').insert([{
        full_name: newOfficial.full_name,
        position: newOfficial.position,
        committee: newOfficial.committee || null,
        contact_number: newOfficial.contact_number || null,
        display_order: Number(newOfficial.display_order) || 0,
        created_by: user?.id ?? null,
      }])

      if (error) {
        toast.error('Failed to add official!')
      } else {
        toast.success('Official added!')
        setShowOfficialModal(false)
        fetchOfficialsList()
      }
    }

    setEditingOfficial(null)
    setNewOfficial({ full_name: '', position: '', committee: '', contact_number: '', display_order: 0 })
  }

  const handleEditOfficial = (official) => {
    setEditingOfficial(official)
    setNewOfficial({
      full_name: official.full_name || '',
      position: official.position || '',
      committee: official.committee || '',
      contact_number: official.contact_number || '',
      display_order: official.display_order || 0,
    })
    setShowOfficialModal(true)
  }

  const handleOpenAddOfficial = () => {
    setEditingOfficial(null)
    setNewOfficial({ full_name: '', position: '', committee: '', contact_number: '', display_order: 0 })
    setShowOfficialModal(true)
  }

  const handleDeleteOfficial = async (id) => {
    const { error } = await supabase.from('barangay_officials').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete official!')
    } else {
      toast.success('Official removed from directory.')
      fetchOfficialsList()
    }
  }

  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.description) {
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
      setNewAnnouncement({ title: '', description: '', badge: '' })
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
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    const day = String(date.getDate()).padStart(2, '0')

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
      setNewEvent({ title: '', location: '', event_date: '' })
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

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both fields!')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match!')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters!')
      return
    }

    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordLoading(false)

    if (error) {
      toast.error('Failed to update password!')
    } else {
      toast.success('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const pendingReservations = reservations.filter(r => r.status === 'pending')

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
                Good day, <strong>{firstName}</strong>
                {positionLabel ? ` · ${positionLabel}` : ''}.
                Here is the current pulse of Barangay Batinguel.
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
                <div className="stat-card-label">Pending Reservations</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon green">
                    <FaBullhorn />
                  </div>
                </div>
                <div className="stat-card-value">{announcements.length}</div>
                <div className="stat-card-label">Announcements</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon yellow">
                    <FaCalendarAlt />
                  </div>
                </div>
                <div className="stat-card-value">{events.length}</div>
                <div className="stat-card-label">Upcoming Events</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon red">
                    <FaUsers />
                  </div>
                </div>
                <div className="stat-card-value">{reservations.length}</div>
                <div className="stat-card-label">Total Reservations</div>
              </div>
            </div>

            {/* Kapitan Status — compact summary only. Full controls live on
                the dedicated "Kapitan Status" tab to avoid duplicating the
                same control in two places. */}
            <div className="kapitan-status-section">
              <h3>{isKapitan ? 'My Status' : "Kapitan's Status"}</h3>
              <div className="kapitan-current-display">
                {kapitanStatusDisplay(kapitanStatus)}
              </div>
              {isKapitan && (
                <button
                  className="view-all-link"
                  style={{ marginTop: 8 }}
                  onClick={() => setActiveTab('kapitan')}
                >
                  Update Status →
                </button>
              )}
            </div>

            {/* Pending Reservations */}
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Pending Court Reservations</h3>
                <button
                  className="view-all-link"
                  onClick={() => setActiveTab('reservations')}>
                  View All
                </button>
              </div>

              {loading ? (
                <p className="dashboard-loading">Loading...</p>
              ) : pendingReservations.length === 0 ? (
                <p className="dashboard-empty">No pending reservations.</p>
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
                      {pendingReservations.slice(0, 5).map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">{res.full_name}</td>
                          <td data-label="Date">{res.preferred_date}</td>
                          <td data-label="Time">{res.preferred_time}</td>
                          <td data-label="Purpose">{res.purpose}</td>
                          <td data-label="Action">
                            <button
                              className="btn-approve"
                              onClick={() => handleApproveReservation(res)}>
                              Approve
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() => handleDeclineReservation(res)}>
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
              <p>Manage your broadcast communications and keep the community informed.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Announcements</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={announcementFilter}
                      onChange={(e) => setAnnouncementFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {[...new Set(announcements.map((a) => a.badge).filter(Boolean))].map((badge) => (
                        <option key={badge} value={badge}>{badge}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-add" onClick={() => setShowAnnouncementModal(true)}>
                    <FaPlus /> New Announcement
                  </button>
                </div>
              </div>

              {(() => {
                const filteredAnnouncements = announcementFilter === 'all'
                  ? announcements
                  : announcements.filter((a) => a.badge === announcementFilter)

                return filteredAnnouncements.length === 0 ? (
                  <p className="dashboard-empty">No announcements found.</p>
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
                      {filteredAnnouncements.map((ann) => (
                        <tr key={ann.id}>
                          <td data-label="Title">{ann.title}</td>
                          <td data-label="Badge">{ann.badge}</td>
                          <td data-label="Date Posted">
                            {new Date(ann.date_posted).toLocaleDateString()}
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteAnnouncement(ann.id)}>
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

        {/* ========================
            EVENTS TAB
        ======================== */}
        {activeTab === 'events' && (
          <div>
            <div className="events-header">
              <h1>Community Events</h1>
              <p>Manage upcoming neighborhood activities and events.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Events</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
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
                const filteredEvents = eventFilter === 'all'
                  ? events
                  : eventFilter === 'upcoming'
                    ? events.filter((ev) => ev.event_date >= todayStr)
                    : events.filter((ev) => ev.event_date < todayStr)

                return filteredEvents.length === 0 ? (
                  <p className="dashboard-empty">No events found.</p>
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
                      {filteredEvents.map((event) => (
                        <tr key={event.id}>
                          <td data-label="Title">{event.title}</td>
                          <td data-label="Date">{event.event_date}</td>
                          <td data-label="Location">{event.location}</td>
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteEvent(event.id)}>
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

        {/* ========================
            RESERVATIONS TAB
        ======================== */}
        {activeTab === 'reservations' && (
          <div>
            <div className="reservations-header">
              <h1>Facility Booking Queue</h1>
              <p>Review pending court reservations and manage time slots.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Reservations</h3>
                <div className="filter-select-wrap">
                  <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                  <select
                    className="filter-select"
                    value={reservationFilter}
                    onChange={(e) => setReservationFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
              </div>

              {(() => {
                // fetchReservations already orders by created_at desc, so
                // "All Statuses" shows most recent first by default.
                const filteredReservations = reservationFilter === 'all'
                  ? reservations
                  : reservations.filter((r) => r.status === reservationFilter)

                return filteredReservations.length === 0 ? (
                  <p className="dashboard-empty">No reservations found.</p>
                ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Purok</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Duration</th>
                        <th>Purpose</th>
                        <th>Amount</th>
                        <th>Payment</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReservations.map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">{res.full_name}</td>
                          <td data-label="Phone">{res.contact_number || '—'}</td>
                          <td data-label="Email">{res.email || '—'}</td>
                          <td data-label="Purok">{res.purok}</td>
                          <td data-label="Date">{res.preferred_date}</td>
                          <td data-label="Time">{res.preferred_time}</td>
                          <td data-label="Duration">{res.duration_hours}h</td>
                          <td data-label="Purpose">{res.purpose}</td>
                          <td data-label="Amount">₱{res.final_amount ?? res.amount}</td>
                          <td data-label="Payment">
                            <span className={`badge badge-${res.payment_status === 'paid' ? 'approved' : res.payment_status === 'rejected' ? 'declined' : 'pending'}`}>
                              {res.payment_status}
                            </span>
                            {res.payment_reference && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                Ref: {res.payment_reference}
                              </div>
                            )}
                          </td>
                          <td data-label="Submitted">
                            {res.created_at ? new Date(res.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td data-label="Status">
                            <span className={`badge badge-${res.status}`}>
                              {res.status}
                            </span>
                          </td>
                          <td data-label="Action">
                            {res.status === 'pending' && (
                              <>
                                <button
                                  className="btn-approve"
                                  onClick={() => handleApproveReservation(res)}>
                                  Approve
                                </button>
                                <button
                                  className="btn-deny"
                                  onClick={() => handleDeclineReservation(res)}>
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
                )
              })()}
            </div>
          </div>
        )}

        {/* ========================
            KAPITAN STATUS TAB
            (Only visible to Punong Barangay via Sidebar)
        ======================== */}
        {activeTab === 'kapitan' && (
          <div>
            <div className="kapitan-page-header">
              <h1>Kapitan Status Tracker</h1>
              <p>Maintain transparency by providing real-time updates on your availability.</p>
            </div>

            {isKapitan ? (
              <div className="kapitan-status-section">
                <h3>Set Your Status</h3>
                <div className="kapitan-current-display">
                  {kapitanStatusDisplay(kapitanStatus)}
                </div>
                <div className="kapitan-status-grid">
                  {KAPITAN_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`kapitan-status-option ${kapitanStatus === option.value ? 'active' : ''}`}
                      onClick={() => handleUpdateKapitanStatus(option.value)}>
                      {option.emoji} {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kapitan-status-section">
                <h3>Kapitan's Current Status</h3>
                <div className="kapitan-current-display">
                  {kapitanStatusDisplay(kapitanStatus)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================
            OFFICIALS DIRECTORY TAB
        ======================== */}
        {activeTab === 'officials' && (
          <div>
            <div className="officials-dir-header">
              <h1>Leadership Directory</h1>
              <p>Manage the digital face of your community leadership.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Barangay Officials</h3>
                <button className="btn-add" onClick={handleOpenAddOfficial}>
                  <FaPlus /> Add Official
                </button>
              </div>

              {officialsList.length === 0 ? (
                <p className="dashboard-empty">No officials in the directory yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>Order</th>
                        <th>Name</th>
                        <th>Position</th>
                        <th>Committee</th>
                        <th>Contact</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officialsList.map((official) => (
                        <tr key={official.id}>
                          <td data-label="Photo">
                            <PersonAvatar
                              name={official.full_name}
                              fallbackIcon={<FaUser style={{ fontSize: 18, color: '#9ca3af' }} />}
                              className="official-row-photo"
                            />
                          </td>
                          <td data-label="Order">{official.display_order ?? '—'}</td>
                          <td data-label="Name">{official.full_name}</td>
                          <td data-label="Position">{official.position}</td>
                          <td data-label="Committee">{official.committee || '—'}</td>
                          <td data-label="Contact">{official.contact_number || '—'}</td>
                          <td data-label="Action" style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-add"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => handleEditOfficial(official)}>
                              <FaEdit /> Edit
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteOfficial(official.id)}>
                              <FaTrash /> Delete
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
            <div className="official-dashboard-header">
              <h1>Settings</h1>
              <p>Manage your account preferences.</p>
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaLock style={{ color: '#1e3a8a' }} /> Change Password
                </h3>
              </div>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                Choose a strong password at least 6 characters long.
              </p>

              <div className="modal-form-group">
                <label className="modal-form-label">New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    onClick={() => setShowNew(!showNew)}
                    style={{
                      position: 'absolute', right: 12, background: 'none',
                      border: 'none', cursor: 'pointer', color: '#94a3b8',
                      fontSize: 15, display: 'flex', alignItems: 'center', padding: 0,
                    }}>
                    {showNew ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label">Confirm New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute', right: 12, background: 'none',
                      border: 'none', cursor: 'pointer', color: '#94a3b8',
                      fontSize: 15, display: 'flex', alignItems: 'center', padding: 0,
                    }}>
                    {showConfirm ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                    Passwords match ✓
                  </p>
                )}
              </div>

              <button
                className="btn-save"
                onClick={handleChangePassword}
                disabled={passwordLoading}
                style={{ marginTop: 8 }}>
                {passwordLoading ? 'Saving...' : 'Save Password'}
              </button>
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
              <label className="modal-form-label">Title</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Announcement title"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Badge / Category</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. PUBLIC WORKS, HEALTH"
                value={newAnnouncement.badge}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, badge: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Description</label>
              <textarea
                className="modal-form-textarea"
                placeholder="Announcement description"
                value={newAnnouncement.description}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, description: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowAnnouncementModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddAnnouncement}>
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
              <label className="modal-form-label">Event Title</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Location</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Event Date</label>
              <input
                type="date"
                className="modal-form-input"
                value={newEvent.event_date}
                onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowEventModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddEvent}>
                Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================
          OFFICIAL MODAL (Add / Edit)
      ======================== */}
      {showOfficialModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingOfficial ? 'Edit Official' : 'Add Official'}</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Full Name</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Hon. Frankie Credo"
                value={newOfficial.full_name}
                onChange={(e) => setNewOfficial({ ...newOfficial, full_name: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Position</label>
              <select
                className="modal-form-input"
                value={newOfficial.position}
                onChange={(e) => setNewOfficial({ ...newOfficial, position: e.target.value })}
              >
                <option value="">Select position</option>
                <option value="Punong Barangay">Punong Barangay</option>
                <option value="Barangay Secretary">Barangay Secretary</option>
                <option value="Barangay Treasurer">Barangay Treasurer</option>
                <option value="Kagawad">Kagawad</option>
                <option value="SK Chairperson">SK Chairperson</option>
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Committee (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Health and Sanitation"
                value={newOfficial.committee}
                onChange={(e) => setNewOfficial({ ...newOfficial, committee: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Contact Number (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="09XXXXXXXXX"
                value={newOfficial.contact_number}
                onChange={(e) => setNewOfficial({ ...newOfficial, contact_number: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Display Order</label>
              <input
                type="number"
                className="modal-form-input"
                placeholder="Lower numbers appear first"
                value={newOfficial.display_order}
                onChange={(e) => setNewOfficial({ ...newOfficial, display_order: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowOfficialModal(false); setEditingOfficial(null) }}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddOfficial}>
                {editingOfficial ? 'Update Official' : 'Save Official'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default OfficialDashboard