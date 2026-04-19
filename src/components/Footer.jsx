import { Link } from 'react-router-dom'
import { FaFacebook, FaTwitter, FaShieldAlt } from 'react-icons/fa'
import './Footer.css'

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">

        {/* Logo and Description */}
        <div className="footer-brand">
          <div className="footer-logo">
            <FaShieldAlt />
            <span>Barangay Batinguel</span>
          </div>
          <p>
            Your digital gateway for civic services, 
            community updates, and neighborhood 
            health wellness.
          </p>
          <div className="footer-socials">
            <a href="https://www.facebook.com/barangaybatinguel2023/"><FaFacebook /></a>
            <a href="#"><FaTwitter /></a>
          </div>
        </div>

        {/* Services */}
        <div className="footer-links">
          <h4>Services</h4>
          <ul>
            <li>
              <Link to="/officials">Officials</Link>
            </li>
            <li>
              <Link to="/health-center">
                Health Center
              </Link>
            </li>
            <li>
              <Link to="/reservation">
                Court Reservation
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div className="footer-links">
          <h4>Legal</h4>
          <ul>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
            <li><a href="#">Local Government Code</a></li>
          </ul>
        </div>

        {/* Socials */}
        <div className="footer-links">
          <h4>Socials</h4>
          <ul>
            <li><a href="https://www.facebook.com/barangaybatinguel2023/">Facebook</a></li>
            <li><a href="#">Twitter</a></li>
          </ul>
        </div>

      </div>

      {/* Bottom Bar */}
      <div className="footer-bottom">
        <p>
          © 2024 Barangay Batinguel. 
          All Rights Reserved.
        </p>
        <div className="footer-bottom-links">
          <a href="#">Contact Us</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Local Government Code</a>
        </div>
      </div>
    </footer>
  )
}

export default Footer