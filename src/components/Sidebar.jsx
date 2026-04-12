import { useNavigate } from 'react-router-dom'
import {
  FaShieldAlt,
  FaTachometerAlt,
  FaBullhorn,
  FaCalendarAlt,
  FaClipboardList,
  FaUserTie,
  FaUsers,
  FaCog,
  FaSignOutAlt,
  FaUser,
  FaHeartbeat,
  FaNotesMedical,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import './Sidebar.css'

const Sidebar = ({ role, activeTab, setActiveTab }) => {
  const navigate = useNavigate()

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
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <FaTachometerAlt />,
    },
    {
      id: 'announcements',
      label: 'Announcements',
      icon: <FaBullhorn />,
    },
    {
      id: 'events',
      label: 'Events',
      icon: <FaCalendarAlt />,
    },
    {
      id: 'reservations',
      label: 'Reservations',
      icon: <FaClipboardList />,
    },
    {
      id: 'kapitan',
      label: 'Kapitan Status',
      icon: <FaUserTie />,
    },
    {
      id: 'officials',
      label: 'Officials Directory',
      icon: <FaUsers />,
    },
  ]

  const nurseNavItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <FaTachometerAlt />,
    },
    {
      id: 'availability',
      label: 'Availability',
      icon: <FaHeartbeat />,
    },
    {
      id: 'health-events',
      label: 'Health Events',
      icon: <FaNotesMedical />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <FaCog />,
    },
  ]

  const navItems = role === 'nurse'
    ? nurseNavItems
    : officialNavItems

  const portalName = role === 'nurse'
    ? 'Health Portal'
    : 'Official Portal'

  const portalRole = role === 'nurse'
    ? 'Barangay Nurse'
    : 'Barangay Admin'

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="sidebar">

        {/* Header */}
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
          <div className="sidebar-role">
            {portalRole}
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">
            Main Menu
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item
                ${activeTab === item.id
                  ? 'active' : ''}`}
              onClick={() =>
                setActiveTab(item.id)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              <FaUser />
            </div>
            <div className="sidebar-user-info">
              <span>
                {role === 'nurse'
                  ? 'Nurse Clara Reyes'
                  : 'Barangay Official'}
              </span>
              <span>
                {role === 'nurse'
                  ? 'BTG-0002-2024'
                  : 'BTG-0001-2024'}
              </span>
            </div>
          </div>
          <button
            className="sidebar-logout"
            onClick={handleLogout}>
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
              className={`mobile-nav-item
                ${activeTab === item.id
                  ? 'active' : ''}`}
              onClick={() =>
                setActiveTab(item.id)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <button
            className="mobile-nav-logout"
            onClick={handleLogout}>
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>
      </div>

    </>
  )
}

export default Sidebar