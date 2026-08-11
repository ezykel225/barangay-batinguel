import { useState } from 'react'
import { FaFacebook } from 'react-icons/fa'
import './Footer.css'

const Footer = () => {
  const [activeModal, setActiveModal] = useState(null)
  const currentYear = new Date().getFullYear()

  const modalContent = {
    contact: {
      title: 'Contact Us',
      content: (
        <>
          <p><strong>Address:</strong> Barangay Batinguel, Dumaguete City, Negros Oriental, Philippines</p>
          <p><strong>Office Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM</p>
          <p><strong>Contact Number:</strong> +63 XXX XXX XXXX</p>
          <p><strong>Email Address:</strong> batinguel@dumaguete.gov.ph</p>

          <div className="contact-facebook">
            <a
              href="https://www.facebook.com/barangaybatinguel2023/"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
            >
              <FaFacebook />
            </a>
          </div>
        </>
      ),
    },
    privacy: {
      title: 'Privacy Policy',
      content: (
        <>
          <p>
            Barangay Batinguel is committed to protecting the privacy of all users of this system.
          </p>
          <p>
            The system may collect personal information such as name, contact number, email address,
            reservation details, payment reference details, and uploaded supporting documents solely
            for processing barangay-related services.
          </p>
          <p>
            Submitted information will only be accessed by authorized barangay personnel and will be
            used for verification, record-keeping, and service delivery purposes.
          </p>
          <p>
            The barangay will take reasonable steps to protect submitted data from unauthorized access,
            misuse, or disclosure.
          </p>
        </>
      ),
    },
    terms: {
      title: 'Terms of Service',
      content: (
        <>
          <p>
            By using this system, users agree to provide accurate and truthful information in all
            forms and submissions.
          </p>
          <p>
            Reservations, payments, and uploaded documents are subject to barangay verification and approval.
          </p>
          <p>
            Submission of false, misleading, or fraudulent information may result in rejection of requests
            and possible administrative action in accordance with barangay rules.
          </p>
          <p>
            Barangay Batinguel reserves the right to review, approve, reject, or cancel requests when necessary
            for operational, administrative, or legal reasons.
          </p>
        </>
      ),
    },
    code: {
      title: 'Local Government Code',
      content: (
        <>
          <p>
            This system is intended to support barangay administrative functions and community service delivery
            in alignment with applicable local government policies, procedures, and public service responsibilities.
          </p>
          <p>
            Barangay operations, public service workflows, and community programs are carried out in accordance
            with relevant laws, ordinances, and administrative regulations.
          </p>
          <p>
            For official legal references, users may coordinate directly with the barangay office or the proper
            local government authorities.
          </p>
        </>
      ),
    },
  }

  return (
    <>
      <footer className="footer">
        <div className="footer-bottom">
          <p>© {currentYear} Barangay Batinguel. All Rights Reserved.</p>
          <div className="footer-bottom-links">
            <button onClick={() => setActiveModal('contact')}>Contact Us</button>
            <button onClick={() => setActiveModal('privacy')}>Privacy Policy</button>
            <button onClick={() => setActiveModal('terms')}>Terms of Service</button>
            <button onClick={() => setActiveModal('code')}>Local Government Code</button>
          </div>
        </div>
      </footer>

      {activeModal && (
        <div
          className="footer-modal-overlay"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="footer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{modalContent[activeModal].title}</h2>
            <div className="footer-modal-content">
              {modalContent[activeModal].content}
            </div>
            <button
              className="footer-modal-close"
              onClick={() => setActiveModal(null)}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default Footer