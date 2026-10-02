import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { FaBars, FaTimes, FaUser } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import EServicesMenu from './EServicesMenu'
import { SERVICE_GROUPS } from '../constants/eServices'
import { supabase } from '../supabase/supabaseClient'
import './Navbar.css'

// Every destination the E-Services menu can reach, so the navbar can
// tell when the visitor is already on one. Derived from the catalogue
// rather than written out again -- a service added there lights the
// trigger here with no second edit. Query strings are stripped: a
// resident service deep-links with ?tab=, and location.pathname has no
// query to compare against.
const E_SERVICE_PATHS = [
  '/e-services',
  ...SERVICE_GROUPS.flatMap((group) =>
    group.services.map((service) => service.to.split('?')[0])),
]

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, role, logout } = useAuth()
  const [residentProfile, setResidentProfile] = useState(null)

  useEffect(() => {
    if (role === 'resident' && user?.id) {
      supabase
        .from('profiles')
        .select('full_name, photo_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setResidentProfile(data)
        })
    } else {
      setResidentProfile(null)
    }
  }, [role, user])

  const toggleMenu = () => {
    setIsOpen(!isOpen)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const isLoggedInResident = role === 'resident' && !!user

  return (
    <nav className="navbar">

      {/* Navbar Container */}
      <div className="navbar-container">

        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <div className="navbar-logo-icon">
              <img
              src={require('../assets/images/logo.png')}
              alt="Barangay Batinguel Logo"
              />
          </div>
          <div className="navbar-logo-text">
            <span>Barangay Batinguel</span>
            <span>Dumaguete City</span>
          </div>
        </Link>

        {/* Desktop Menu */}
        <ul className="navbar-menu">
          <li>
            <Link
              to="/"
              className={location.pathname === '/'
                ? 'active' : ''}>
              Home
            </Link>
          </li>
          <li>
            <Link
              to="/officials"
              className={location.pathname === '/officials'
                ? 'active' : ''}>
              Officials
            </Link>
          </li>
          <li>
            <Link
              to="/health-center"
              className={location.pathname === '/health-center'
                ? 'active' : ''}>
              Health Center
            </Link>
          </li>
          {/* ⚠️ This was a `Court Reservation` link. One service does
              not deserve a top-level navigation slot while three others
              have none, so the slot now opens the whole catalogue and
              Court Reservation is the first item inside it.
              `isActive` covers every e-services destination, so the
              trigger stays underlined while somebody is on one. */}
          <li>
            <EServicesMenu
              isActive={E_SERVICE_PATHS.some((path) => location.pathname === path)}
            />
          </li>
          {isLoggedInResident ? (
            <li className="navbar-profile-item">
              <Link to="/resident" className="navbar-profile-btn">
                {residentProfile?.photo_url ? (
                  <img
                    src={residentProfile.photo_url}
                    alt={residentProfile.full_name}
                    className="navbar-profile-photo"
                  />
                ) : (
                  <span className="navbar-profile-icon"><FaUser /></span>
                )}
                <span>{residentProfile?.full_name?.split(' ')[0] || 'My Account'}</span>
              </Link>
            </li>
          ) : (
            <li>
              <Link
                to="/login"
                className="navbar-login-btn">
                Login
              </Link>
            </li>
          )}
        </ul>

        {/* Mobile Toggle Button.
            ⚠️ (X3) This had NO accessible name at all -- an icon-only
            button whose only content is an <svg>, so a screen reader
            announced it as "button" and nothing else. It is the only way
            into navigation on a phone.
            The dashboard's own menu button has carried aria-label,
            aria-expanded and aria-controls all along; this one is the
            public twin of it and now matches. */}
        <button
          type="button"
          className="navbar-toggle"
          onClick={toggleMenu}
          aria-expanded={isOpen}
          aria-controls="navbar-mobile-menu"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}>
          {isOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
        </button>

      </div>

      {/* Mobile Menu. The id is what the toggle's aria-controls
          points at. */}
      <ul
        id="navbar-mobile-menu"
        className={`navbar-mobile ${isOpen ? 'open' : ''}`}>
        <li>
          <Link to="/" onClick={toggleMenu}>
            Home
          </Link>
        </li>
        <li>
          <Link to="/officials" onClick={toggleMenu}>
            Officials
          </Link>
        </li>
        <li>
          <Link to="/health-center" onClick={toggleMenu}>
            Health Center
          </Link>
        </li>
        {/* The SAME catalogue the desktop dropdown renders. Neither
            surface owns the list, so a service cannot exist on one and
            not the other. The drawer is already a disclosure, so these
            are inline rather than behind a second tap. */}
        <li>
          <Link to="/e-services" onClick={toggleMenu}>
            E-Services
          </Link>
        </li>
        {SERVICE_GROUPS.map((group) => (
          <li key={group.access}>
            <p className="eservices-mobile-label">{group.groupLabel}</p>
            <ul className="navbar-mobile-sublist">
              {group.services.map((service) => (
                <li key={service.key}>
                  <Link to={service.to} onClick={toggleMenu}>
                    {service.label}
                    <span className="eservices-mobile-access">{group.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {isLoggedInResident ? (
          <>
            <li>
              <Link to="/resident" onClick={toggleMenu}>
                My Account
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="navbar-mobile-login"
                onClick={() => { toggleMenu(); handleLogout() }}
              >
                Logout
              </button>
            </li>
          </>
        ) : (
          <li>
            <Link
              to="/login"
              onClick={toggleMenu}
              className="navbar-mobile-login">
              Login
            </Link>
          </li>
        )}
      </ul>

    </nav>
  )
}

export default Navbar