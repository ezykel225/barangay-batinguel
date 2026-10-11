import { Link, useNavigate } from 'react-router-dom'
import {
  FaShieldAlt,
  FaTachometerAlt,
  FaBullhorn,
  FaCalendarAlt,
  FaClipboardList,
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
import { HEALTH_NURSE_ROLE } from '../constants/barangay'
import { PersonAvatar } from '../utils/officialPhotos'
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

// The breakpoint below which the desktop sidebar is hidden and mobile
// navigation is reached through the hamburger button and its drawer.
// Kept in one place because the drawer has to close when the viewport
// crosses it; the matching CSS value lives in Sidebar.css.
const DESKTOP_QUERY = '(min-width: 769px)'

// `mobileHeaderAction` is rendered in the mobile header, immediately left
// of the menu button. The Resident and Official portals pass their
// notification bell; the nurse passes nothing, because there is
// deliberately no nurse bell (see Notifications in CLAUDE.md), and the
// header simply has brand + menu.
const Sidebar = ({ role, activeTab, setActiveTab, badges = {}, mobileHeaderAction = null }) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profileName, setProfileName] = useState('')
  const [profilePosition, setProfilePosition] = useState('')
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const drawerCloseRef = useRef(null)

  const fetchProfile = useCallback(async () => {
    // photo_url as well as the name: the sidebar showed a generic icon for
    // everybody while the same person's photo was already on their
    // Settings page and, for an official, on the public directory. One
    // column more on a query that already runs.
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, photo_url')
      .eq('id', user.id)
      .single()

    if (profile?.full_name) {
      setProfileName(profile.full_name)
      // A resident's photo lives on their profile. An official's lives on
      // their directory row and is read below instead, because that is the
      // one shown publicly and the one their Settings page edits.
      if (role === 'resident') setProfilePhoto(profile.photo_url || null)

      if (role === 'official') {
        // ⚠️ BY STABLE ID SINCE A5, NOT BY NAME.
        //
        // This was `.eq('full_name', profile.full_name)` — the same
        // string join migrations 031 and 032 removed from the database
        // and A5 removed from the dashboard. It only sets a label and a
        // photo, so it was never an authorization path; but it IS a
        // resolution of "which directory row is the signed-in official",
        // and leaving one of those behind would mean a rename still
        // silently changed what an official sees in their own drawer.
        //
        // `official_id_for_current_user()` already requires the caller's
        // own linked row to be ACTIVE, which is exactly what the old
        // `.is('archived_at', null)` filter wanted: an archived official
        // is no longer serving, so their position must stop resolving
        // here too. They fall back to the generic label below, as before.
        //
        // ⚠️ Fails closed and never falls back to the name. The client
        // holds no privilege on `official_account_links` (030) and must
        // not: the helper answers one question about the caller.
        const { data: officialId } = await supabase
          .rpc('official_id_for_current_user')

        const { data: official } = officialId
          ? await supabase
            .from('barangay_officials')
            .select('position, committee, photo_url')
            .eq('id', officialId)
            .is('archived_at', null)
            .maybeSingle()
          : { data: null }

        if (official) {
          const pos = official.committee
            ? `${official.position} — ${official.committee}`
            : official.position
          setProfilePosition(pos)
          setProfilePhoto(official.photo_url || null)
        } else {
          setProfilePosition('Barangay Official')
        }
      } else if (role === 'nurse') {
        setProfilePosition(HEALTH_NURSE_ROLE)
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
    // ⚠️ There is no `kapitan` tab here any more. The Punong Barangay's
    // status was a whole destination for one value that changes a few
    // times a day; it now lives as a compact row on the Dashboard
    // overview. NOTHING about the feature was removed -- the data, the
    // `kapitan_status` policy and the `isKapitan` gate are untouched,
    // and PUNONG_BARANGAY_LABEL still supplies the wording there.
    { id: 'officials', label: 'Officials Directory', icon: <FaUsers /> },
    { id: 'residents', label: 'Residents', icon: <FaUserFriends /> },
    // Voter Reference List, not "Residents Registry": the table holds the
    // voter records the barangay has available, not a complete list of who
    // lives here, and the city may supply a broader dataset later. The tab
    // id stays 'registry' -- it is the switch value the dashboard matches
    // on, not something anybody reads.
    { id: 'registry', label: 'Voter Reference List', icon: <FaAddressBook /> },
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
    role === 'nurse' ? 'Health Center Portal'
      : role === 'resident' ? 'Resident Portal'
        : 'Official Portal'

  // Who is signed in. Rendered in the desktop footer and, since it was
  // missing there entirely, in the mobile drawer -- on a phone the
  // logged-in name and role appeared nowhere in navigation at all.
  //
  // `PersonAvatar` falls back to the same role icon the sidebar always
  // showed, so an account with no photo looks exactly as it did.
  const identity = (
    <>
      <div className="sidebar-user-avatar">
        <PersonAvatar
          name={profileName}
          photoUrl={profilePhoto}
          fallbackIcon={role === 'nurse' ? <FaHeartbeat /> : <FaUser />}
          className="sidebar-user-photo"
        />
      </div>
      <div className="sidebar-user-info">
        <span>{profileName || 'Loading...'}</span>
        <span>{profilePosition || '...'}</span>
      </div>
    </>
  )

  // The collapsed rail hides the two lines above, so without this the
  // only thing left is a generic icon -- while every nav item beside it
  // does get a tooltip. Same text, so nothing is invented for it.
  const identityTitle = [profileName, profilePosition].filter(Boolean).join(' — ')

  return (
    <>
      {/* ── The mobile dashboard header ──────────────────────────────
          Fixed at the top on every tab of every portal, so the brand,
          the bell and the menu are in the same place whatever the page.
          Hidden above the breakpoint, where the sidebar is the
          navigation and the bell sits in .dashboard-topbar.

          This strip used to hold the menu button alone, floating over an
          otherwise empty band, while the notification bell floated
          separately above the page content. Both are now in one row.

          .dashboard-main reserves the strip's height at mobile widths,
          so a page heading never starts underneath it.

          ⚠️ The brand goes to the PUBLIC home page, not to the
          dashboard's own Dashboard tab. It is the system's identity, and
          a resident reading their portal is still a citizen browsing a
          public site -- the same reason residents land on Home after
          login rather than on their dashboard. */}
      <header className="dash-mobile-header">
        <Link to="/" className="dash-mobile-brand">
          <img
            src={require('../assets/images/logo.png')}
            alt=""
            className="dash-mobile-brand-logo"
          />
          <span className="dash-mobile-brand-name">
            Barangay Batinguel E-Services
          </span>
        </Link>

        <div className="dash-mobile-actions">
          {mobileHeaderAction}
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
        </div>
      </header>

      {/* Desktop Sidebar. `is-collapsed` narrows it to an icon rail; the
          matching margin on .dashboard-main is applied from CSS with a
          sibling selector, so no dashboard needs to know about it. That
          relies on .dashboard-main being a following sibling of .sidebar
          -- true in all three dashboards. Don't wrap <Sidebar /> in an
          element without updating Sidebar.css. */}
      <div
        className={`sidebar${collapsed ? ' is-collapsed' : ''}`}
        /* ⚠️ (X3) The portal name and the signed-in account sit outside
           the inner <nav>, so they belonged to no landmark at all and a
           screen-reader user browsing by region could not reach them.
           role="complementary" wraps the whole rail without changing the
           tag -- every sidebar selector is class-based, including
           `.sidebar.is-collapsed ~ .dashboard-main`, so nothing in the
           layout depends on it being a <div>. */
        role="complementary"
        aria-label={`${portalName} sidebar`}>
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
          <div
            className="sidebar-user"
            title={collapsed ? identityTitle || undefined : undefined}
          >
            {identity}
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

            {/* Who is signed in, before the destinations. The drawer is
                the whole of navigation on a phone, and it used to end at
                Logout without ever naming the account it would log out. */}
            <div className="nav-drawer-user">
              {identity}
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