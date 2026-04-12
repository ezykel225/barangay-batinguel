import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { FaBars, FaTimes, FaShieldAlt } from 'react-icons/fa'
import './Navbar.css'

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  const toggleMenu = () => {
    setIsOpen(!isOpen)
  }

  return (
    <nav className="navbar">

      {/* Navbar Container */}
      <div className="navbar-container">

        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <div className="navbar-logo-icon">
            <FaShieldAlt />
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
          <li>
            <Link
              to="/login"
              className="navbar-login-btn">
              Login
            </Link>
          </li>
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
        <li>
          <Link
            to="/login"
            onClick={toggleMenu}
            className="navbar-mobile-login">
            Login
          </Link>
        </li>
      </ul>

    </nav>
  )
}

export default Navbar