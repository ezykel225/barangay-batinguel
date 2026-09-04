import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt,
  FaTachometerAlt,
  FaBullhorn,
  FaCalendarAlt,
  FaClipboardList,
  FaUserTie,
  FaUsers,
  FaUserFriends,
  FaAddressBook,
  FaChartBar,
  FaHistory,
  FaFileAlt,
  FaTrashAlt,
  FaCog,
  FaSignOutAlt,
  FaUser,
  FaHeartbeat,
  FaNotesMedical,
  FaHome,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import './Sidebar.css'

const Sidebar = ({ role, activeTab, setActiveTab, badges = {} }) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profileName, setProfileName] = useState('')
  const [profilePosition, setProfilePosition] = useState('')

  const fetchProfile = useCallback(async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    if (profile?.full_name) {
      setProfileName(profile.full_name)

      if (role === 'official') {
        const { data: official } = await supabase
          .from('barangay_officials')
          .select('position, committee')
          .eq('full_name', profile.full_name)
          .single()

        if (official) {
          const pos = official.committee
            ? `${official.position} — ${official.committee}`
            : official.position
          setProfilePosition(pos)
        } else {
          setProfilePosition('Barangay Official')
        }
      } else if (role === 'nurse') {
        setProfilePosition('Public Health Nurse')
      } else if (role === 'resident') {
        setProfilePosition('Resident')
      }
    }
  }, [user, role])

  useEffect(() => {
    if (user?.id) fetchProfile()
  }, [user, fetchProfile])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Error logging out!')
    } else {
      toast.success('Logged out successfully!')
      navigate('/login')
    }
  }

  const officialNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <FaTachometerAlt /> },
    { id: 'announcements', label: 'Announcements', icon: <FaBullhorn /> },
    { id: 'events', label: 'Events', icon: <FaCalendarAlt /> },
    { id: 'reservations', label: 'Reservations', icon: <FaClipboardList /> },
    { id: 'documents', label: 'Document Requests', icon: <FaFileAlt /> },
    { id: 'waste', label: 'Waste Management', icon: <FaTrashAlt /> },
    { id: 'kapitan', label: 'Kapitan Status', icon: <FaUserTie /> },
    { id: 'officials', label: 'Officials Directory', icon: <FaUsers /> },
    { id: 'residents', label: 'Residents', icon: <FaUserFriends /> },
    { id: 'registry', label: 'Residents Registry', icon: <FaAddressBook /> },
    { id: 'reports', label: 'Reports', icon: <FaChartBar /> },
    { id: 'activity', label: 'Activity Log', icon: <FaHistory /> },
    { id: 'settings', label: 'Settings', icon: <FaCog /> },
  ]

  const nurseNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <FaTachometerAlt /> },
    { id: 'availability', label: 'Availability', icon: <FaHeartbeat /> },
    { id: 'health-events', label: 'Health Events', icon: <FaNotesMedical /> },
    { id: 'settings', label: 'Settings', icon: <FaCog /> },
  ]

  const residentNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <FaTachometerAlt /> },
    { id: 'documents', label: 'Document Requests', icon: <FaFileAlt /> },
    { id: 'reservations', label: 'My Reservations', icon: <FaClipboardList /> },
    { id: 'settings', label: 'Settings', icon: <FaCog /> },
  ]

  const navItems =
    role === 'nurse' ? nurseNavItems
      : role === 'resident' ? residentNavItems
        : officialNavItems

  const portalName =
    role === 'nurse' ? 'Health Portal'
      : role === 'resident' ? 'Resident Portal'
        : 'Official Portal'

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <FaShieldAlt />
            </div>
            <div className="sidebar-logo-text">
              <span>{portalName}</span>
              <span>Barangay Batinguel</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Main Menu</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              {item.label}
              {badges[item.id] > 0 && (
                <span className="sidebar-nav-badge">{badges[item.id]}</span>
              )}
            </button>
          ))}

          {role === 'resident' && (
            <button
              className="sidebar-nav-item sidebar-nav-home"
              onClick={() => navigate('/')}
            >
              <FaHome />
              Back to Home
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {role === 'nurse' ? <FaHeartbeat /> : <FaUser />}
            </div>
            <div className="sidebar-user-info">
              <span>{profileName || 'Loading...'}</span>
              <span>{profilePosition || '...'}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <FaSignOutAlt />
            Logout
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-nav">
        <div className="mobile-nav-items">
          {navItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {badges[item.id] > 0 && (
                <span className="sidebar-nav-badge mobile-nav-badge">{badges[item.id]}</span>
              )}
            </button>
          ))}
          <button className="mobile-nav-logout" onClick={handleLogout}>
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default Sidebar