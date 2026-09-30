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
  FaPills,
  FaNotesMedical,
  FaHome,
  FaBars,
  FaTimes,
  FaAngleLeft,
  FaAngleRight,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import './Sidebar.css'

// Remembers whether the desktop sidebar was left expanded or collapsed.
//
// Every access is wrapped: localStorage throws in a private window, when
// site data is blocked, and in some embedded browsers. A navigation
// sidebar must never fail to render because a preference could not be
// read, so both helpers swallow the error and fall back to expanded.
const COLLAPSE_KEY = 'bb.sidebarCollapsed'

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    /* storage unavailable -- default to expanded */
    return false
  }
}

const writeCollapsed = (value) => {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
  } catch {
    /* storage unavailable -- the preference simply is not remembered */
  }
}

// The breakpoint below which the desktop sidebar is hidden and the bottom
// bar takes over. Kept in one place because the drawer has to close when
// the viewport crosses it; the matching CSS value lives in Sidebar.css.
const DESKTOP_QUERY = '(min-width: 769px)'

const Sidebar = ({ role, activeTab, setActiveTab, badges = {} }) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profileName, setProfileName] = useState('')
  const [profilePosition, setProfilePosition] = useState('')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const drawerCloseRef = useRef(null)

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

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous
      writeCollapsed(next)
      return next
    })
  }

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Close the drawer if the viewport grows past the mobile breakpoint.
  // Without this, opening the drawer on a phone and then rotating to
  // landscape hides it by CSS while leaving the body scroll lock in
  // place -- the page would silently refuse to scroll.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event) => {
      if (event.matches) setDrawerOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Escape closes; Tab stays inside the panel. Same shape as
  // ConfirmDialog, which is the pattern this project already proved.
  useEffect(() => {
    if (!drawerOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = drawerRef.current?.querySelectorAll('button:not([disabled]), [href]')
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, closeDrawer])

  // Focus into the panel on open and back onto the menu button on
  // close, so a keyboard user is never dropped at the top of the page.
  useEffect(() => {
    if (!drawerOpen) return undefined
    drawerCloseRef.current?.focus()
    // Captured now rather than read in the cleanup: by the time cleanup
    // runs the ref may point somewhere else, and focus would land on the
    // wrong element or nothing at all.
    const returnFocusTo = menuButtonRef.current
    return () => returnFocusTo?.focus()
  }, [drawerOpen])

  // Stop the page behind scrolling while the drawer is up.
  useEffect(() => {
    if (!drawerOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [drawerOpen])

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
    { id: 'medicines', label: 'Medicines', icon: <FaPills /> },
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
      {/* The mobile entry point into navigation. Fixed at the top left on
          every tab of every portal, so it is in the same place whatever
          the page. Hidden above the breakpoint, where the sidebar itself
          is the navigation.

          .dashboard-main reserves room for it at mobile widths, so it
          never sits on top of a page heading. */}
      <button
        type="button"
        className="mobile-menu-button"
        onClick={() => setDrawerOpen(true)}
        aria-expanded={drawerOpen}
        aria-controls="nav-drawer"
        aria-label="Open navigation menu"
        ref={menuButtonRef}
      >
        <FaBars />
      </button>

      {/* Desktop Sidebar. `is-collapsed` narrows it to an icon rail; the
          matching margin on .dashboard-main is applied from CSS with a
          sibling selector, so no dashboard needs to know about it. That
          relies on .dashboard-main being a following sibling of .sidebar
          -- true in all three dashboards. Don't wrap <Sidebar /> in an
          element without updating Sidebar.css. */}
      <div className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
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
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <FaAngleRight /> : <FaAngleLeft />}
          </button>
        </div>

        <nav className="sidebar-nav" id="sidebar-nav">
          <div className="sidebar-nav-label">Main Menu</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              /* The label text is hidden when collapsed, so the
                 accessible name has to come from aria-label, and the
                 tooltip is what a sighted mouse user gets instead. */
              aria-label={item.label}
              aria-current={activeTab === item.id ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              <span className="sidebar-nav-text">{item.label}</span>
              {badges[item.id] > 0 && (
                <span className="sidebar-nav-badge">{badges[item.id]}</span>
              )}
            </button>
          ))}

          {role === 'resident' && (
            <button
              className="sidebar-nav-item sidebar-nav-home"
              onClick={() => navigate('/')}
              aria-label="Back to Home"
              title={collapsed ? 'Back to Home' : undefined}
            >
              <FaHome />
              <span className="sidebar-nav-text">Back to Home</span>
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
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            aria-label="Logout"
            title={collapsed ? 'Logout' : undefined}
          >
            <FaSignOutAlt />
            <span className="sidebar-nav-text">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer: the complete role navigation, so every
          destination is reachable on a phone. Same list as the desktop
          sidebar above -- one definition, nothing to drift. */}
      {drawerOpen && (
        <div
          className="nav-drawer-overlay"
          onClick={closeDrawer}
        >
          <div
            className="nav-drawer"
            id="nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${portalName} navigation`}
            ref={drawerRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nav-drawer-header">
              <span className="nav-drawer-title">{portalName}</span>
              <button
                type="button"
                className="nav-drawer-close"
                onClick={closeDrawer}
                aria-label="Close navigation"
                ref={drawerCloseRef}
              >
                <FaTimes />
              </button>
            </div>

            <nav className="nav-drawer-nav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`nav-drawer-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.id)
                    closeDrawer()
                  }}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {badges[item.id] > 0 && (
                    <span className="sidebar-nav-badge">{badges[item.id]}</span>
                  )}
                </button>
              ))}

              {role === 'resident' && (
                <button
                  className="nav-drawer-item nav-drawer-home"
                  onClick={() => {
                    closeDrawer()
                    navigate('/')
                  }}
                >
                  <FaHome />
                  <span>Back to Home</span>
                </button>
              )}

              <button className="nav-drawer-item nav-drawer-logout" onClick={handleLogout}>
                <FaSignOutAlt />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}

export default Sidebar