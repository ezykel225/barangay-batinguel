import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt,
  FaTachometerAlt,
  FaBullhorn,
  FaCalendarAlt,
  FaClipboardList,
  FaUserTie,
  FaUserNurse,
  FaUsers,
  FaSignOutAlt,
  FaCheck,
  FaTimes,
  FaPlus,
  FaTrash,
  FaEdit,
  FaUserCog,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import './AdminDashboard.css'

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('dashboard')
  const [reservations, setReservations] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [officials, setOfficials] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalReservations: 0,
    pendingReservations: 0,
    totalAnnouncements: 0,
    totalEvents: 0,
    totalUsers: 0,
  })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([
      fetchReservations(),
      fetchAnnouncements(),
      fetchEvents(),
      fetchOfficials(),
      fetchUsers(),
    ])
    setLoading(false)
  }

  const fetchReservations = async () => {
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })
    setReservations(data || [])
    setStats(prev => ({
      ...prev,
      totalReservations: data?.length || 0,
      pendingReservations:
        data?.filter(r => r.status === 'pending').length || 0,
    }))
  }

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('date_posted', { ascending: false })
    setAnnouncements(data || [])
    setStats(prev => ({
      ...prev,
      totalAnnouncements: data?.length || 0,
    }))
  }

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    setEvents(data || [])
    setStats(prev => ({
      ...prev,
      totalEvents: data?.length || 0,
    }))
  }

  const fetchOfficials = async () => {
    const { data } = await supabase
      .from('barangay_officials')
      .select('*')
    setOfficials(data || [])
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
    setUsers(data || [])
    setStats(prev => ({
      ...prev,
      totalUsers: data?.length || 0,
    }))
  }

  const handleApprove = async (id) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'approved' })
      .eq('id', id)
    if (!error) {
      toast.success('Reservation approved!')
      fetchReservations()
    }
  }

  const handleDeny = async (id) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'declined' })
      .eq('id', id)
    if (!error) {
      toast.error('Reservation declined!')
      fetchReservations()
    }
  }

  const handleDeleteAnnouncement = async (id) => {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)
    if (!error) {
      toast.success('Announcement deleted!')
      fetchAnnouncements()
    }
  }

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
    if (!error) {
      toast.success('Event deleted!')
      fetchEvents()
    }
  }

  const handleDeleteOfficial = async (id) => {
    const { error } = await supabase
      .from('barangay_officials')
      .delete()
      .eq('id', id)
    if (!error) {
      toast.success('Official deleted!')
      fetchOfficials()
    }
  }

  const handleDeleteUser = async (id) => {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)
    if (!error) {
      toast.success('User deleted!')
      fetchUsers()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Logged out successfully!')
    navigate('/login')
  }

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <FaTachometerAlt />
    },
    {
      id: 'reservations',
      label: 'Reservations',
      icon: <FaClipboardList />
    },
    {
      id: 'announcements',
      label: 'Announcements',
      icon: <FaBullhorn />
    },
    {
      id: 'events',
      label: 'Events',
      icon: <FaCalendarAlt />
    },
    {
      id: 'officials',
      label: 'Officials Directory',
      icon: <FaUserTie />
    },
    {
      id: 'users',
      label: 'User Accounts',
      icon: <FaUsers />
    },
  ]

  return (
    <div className="admin-layout">

      {/* Sidebar */}
      <aside className="admin-sidebar">

        {/* Sidebar Header */}
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">
            <FaShieldAlt />
          </div>
          <div className="admin-sidebar-title">
            <span>Admin Portal</span>
            <span>Barangay Batinguel</span>
          </div>
        </div>

        <div className="admin-sidebar-role">
          System Administrator
        </div>

        {/* Menu */}
        <div className="admin-sidebar-menu-label">
          MAIN MENU
        </div>
        <nav className="admin-sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`admin-nav-item
                ${activePage === item.id
                  ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <div className="admin-sidebar-user-icon">
              <FaUserCog />
            </div>
            <div className="admin-sidebar-user-info">
              <span>System Admin</span>
              <span>BTG-ADMIN-2024</span>
            </div>
          </div>
          <button
            className="admin-logout-btn"
            onClick={handleLogout}>
            <FaSignOutAlt />
            Logout
          </button>
        </div>

      </aside>

      {/* Main Content */}
      <main className="admin-main">

        {/* ===== DASHBOARD PAGE ===== */}
        {activePage === 'dashboard' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>System Dashboard</h1>
              <p>
                Good day, Admin. Here is the
                full overview of Barangay Batinguel.
              </p>
            </div>

            {/* Stats Cards */}
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="admin-stat-icon blue">
                  <FaClipboardList />
                </div>
                <div className="admin-stat-info">
                  <h3>{stats.pendingReservations}</h3>
                  <p>Pending Reservations</p>
                </div>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon green">
                  <FaCheck />
                </div>
                <div className="admin-stat-info">
                  <h3>{stats.totalReservations}</h3>
                  <p>Total Reservations</p>
                </div>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon yellow">
                  <FaBullhorn />
                </div>
                <div className="admin-stat-info">
                  <h3>{stats.totalAnnouncements}</h3>
                  <p>Announcements</p>
                </div>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon purple">
                  <FaCalendarAlt />
                </div>
                <div className="admin-stat-info">
                  <h3>{stats.totalEvents}</h3>
                  <p>Upcoming Events</p>
                </div>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon red">
                  <FaUsers />
                </div>
                <div className="admin-stat-info">
                  <h3>{stats.totalUsers}</h3>
                  <p>System Users</p>
                </div>
              </div>
            </div>

            {/* Recent Reservations Table */}
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>Recent Reservations</h2>
                <button
                  className="admin-view-all"
                  onClick={() =>
                    setActivePage('reservations')}>
                  View All
                </button>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations
                    .filter(r => r.status === 'pending')
                    .slice(0, 5)
                    .map((r) => (
                    <tr key={r.id}>
                      <td>{r.full_name}</td>
                      <td>{r.preferred_date}</td>
                      <td>{r.preferred_time}</td>
                      <td>{r.purpose}</td>
                      <td>
                        <span className={`admin-status-badge
                          ${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="admin-action-btns">
                        <button
                          className="admin-approve-btn"
                          onClick={() =>
                            handleApprove(r.id)}>
                          <FaCheck /> Approve
                        </button>
                        <button
                          className="admin-deny-btn"
                          onClick={() =>
                            handleDeny(r.id)}>
                          <FaTimes /> Deny
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== RESERVATIONS PAGE ===== */}
        {activePage === 'reservations' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>Court Reservations</h1>
              <p>Manage all court reservation requests</p>
            </div>
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>All Reservations</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.id}>
                      <td>{r.full_name}</td>
                      <td>{r.contact_number}</td>
                      <td>{r.preferred_date}</td>
                      <td>{r.preferred_time}</td>
                      <td>{r.purpose}</td>
                      <td>
                        <span className={`admin-status-badge
                          ${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="admin-action-btns">
                        {r.status === 'pending' && (
                          <>
                            <button
                              className="admin-approve-btn"
                              onClick={() =>
                                handleApprove(r.id)}>
                              <FaCheck /> Approve
                            </button>
                            <button
                              className="admin-deny-btn"
                              onClick={() =>
                                handleDeny(r.id)}>
                              <FaTimes /> Deny
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== ANNOUNCEMENTS PAGE ===== */}
        {activePage === 'announcements' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>Announcements</h1>
              <p>Manage all barangay announcements</p>
            </div>
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>All Announcements</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Date Posted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {announcements.map((a) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td className="admin-desc-cell">
                        {a.description}
                      </td>
                      <td>
                        {new Date(a.date_posted)
                          .toLocaleDateString()}
                      </td>
                      <td className="admin-action-btns">
                        <button
                          className="admin-delete-btn"
                          onClick={() =>
                            handleDeleteAnnouncement(a.id)}>
                          <FaTrash /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== EVENTS PAGE ===== */}
        {activePage === 'events' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>Events</h1>
              <p>Manage all barangay events</p>
            </div>
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>All Events</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Location</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td className="admin-desc-cell">
                        {e.description}
                      </td>
                      <td>{e.event_date}</td>
                      <td>{e.event_time}</td>
                      <td>{e.location}</td>
                      <td className="admin-action-btns">
                        <button
                          className="admin-delete-btn"
                          onClick={() =>
                            handleDeleteEvent(e.id)}>
                          <FaTrash /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== OFFICIALS PAGE ===== */}
        {activePage === 'officials' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>Officials Directory</h1>
              <p>Manage barangay officials information</p>
            </div>
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>All Officials</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Position</th>
                    <th>Contact</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {officials.map((o) => (
                    <tr key={o.id}>
                      <td>{o.full_name}</td>
                      <td>{o.position}</td>
                      <td>{o.contact_number}</td>
                      <td className="admin-action-btns">
                        <button
                          className="admin-delete-btn"
                          onClick={() =>
                            handleDeleteOfficial(o.id)}>
                          <FaTrash /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== USER ACCOUNTS PAGE ===== */}
        {activePage === 'users' && (
          <div className="admin-content">
            <div className="admin-page-header">
              <h1>User Accounts</h1>
              <p>Manage system user accounts</p>
            </div>
            <div className="admin-table-card">
              <div className="admin-table-header">
                <h2>All Users</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`admin-role-badge
                          ${u.role}`}>
                          {u.role === 'admin' && '👨‍💻'}
                          {u.role === 'official' && '👮'}
                          {u.role === 'nurse' && '💉'}
                          {' '}{u.role}
                        </span>
                      </td>
                      <td>
                        {new Date(u.created_at)
                          .toLocaleDateString()}
                      </td>
                      <td className="admin-action-btns">
                        <button
                          className="admin-delete-btn"
                          onClick={() =>
                            handleDeleteUser(u.id)}>
                          <FaTrash /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default AdminDashboard