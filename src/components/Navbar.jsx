import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { FaBars, FaTimes, FaUser } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import './Navbar.css'

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
          <li>
            <Link
              to="/reservation"
              className={location.pathname === '/reservation'
                ? 'active' : ''}>
              Court Reservation
            </Link>
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

        {/* Mobile Toggle Button */}
        <button
          className="navbar-toggle"
          onClick={toggleMenu}>
          {isOpen ? <FaTimes /> : <FaBars />}
        </button>

      </div>

      {/* Mobile Menu */}
      <ul className={`navbar-mobile 
        ${isOpen ? 'open' : ''}`}>
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
        <li>
          <Link to="/reservation" onClick={toggleMenu}>
            Court Reservation
          </Link>
        </li>
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