import {
  FaUserTie,
  FaUserNurse,
  FaUser,
  FaPhone,
  FaCheckCircle,
  FaFilePdf,
} from 'react-icons/fa'
import { MdVerified } from 'react-icons/md'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Officials.css'

// Placeholder Council Members
const councilMembers = [
  {
    id: 1,
    name: 'Antonio G. Reyes',
    role: 'Kagawad',
    committee: 'Peace and Order',
  },
  {
    id: 2,
    name: 'Lucia B. Castro',
    role: 'Kagawad',
    committee: 'Health and Sanitation',
  },
  {
    id: 3,
    name: 'Mark J. Villanueva',
    role: 'Kagawad',
    committee: 'Education',
  },
  {
    id: 4,
    name: 'Patricia S. Lim',
    role: 'Kagawad',
    committee: 'Environment',
  },
]

// Placeholder Health Department
const healthDept = [
  {
    id: 1,
    name: 'Dr. Felicity Garcia',
    role: 'Chief Medical Officer',
    desc: 'Oversees all medical programs and community health initiatives.',
    btn: 'View Clinic Hours',
  },
  {
    id: 2,
    name: 'Nurse Remedios Cruz',
    role: 'Barangay Nurse',
    desc: 'Manages daily health consultations and immunization schedules.',
    btn: 'Immunization Info',
  },
  {
    id: 3,
    name: 'John Paul Diona',
    role: 'Public Health Officer',
    desc: 'Coordinates public health programs and sanitation drives.',
    btn: 'Find Out More',
  },
  {
    id: 4,
    name: 'Dr. Samuel Rivera',
    role: 'Public Health Specialist',
    desc: 'Specialist in community disease prevention and wellness programs.',
    btn: 'Find Out More',
  },
]

const Officials = () => {
  return (
    <div className="officials-page">

      {/* Navbar */}
      <Navbar />

      {/* Hero */}
      <section className="officials-hero">
        <div className="officials-hero-container">
          <div>
            <h1>Kapitan's Office</h1>
            <p>
              Direct access to Punong Barangay's 
              schedule and administrative availability.
              We promise transparency and 
              resident-focused governance.
            </p>
          </div>
          <div className="officials-hero-badge available">
            <MdVerified />
            Official Portal
          </div>
        </div>
      </section>

      {/* Kapitan Section */}
      <section className="kapitan-section">
        <div className="kapitan-container">
          <div className="kapitan-card">

            {/* Left */}
            <div className="kapitan-left">
              <div>
                <div className="kapitan-status-badge in-office">
                  <div className="kapitan-status-dot">
                  </div>
                  In Office
                </div>
                <h2>Punong Barangay</h2>
                <h3>Hon. [Kapitan Name]</h3>
                <p>Punong Barangay</p>
                <p className="kapitan-quote">
                  "Committed to serving every 
                  resident of Batinguel with 
                  transparency and integrity."
                </p>
              </div>
            </div>

            {/* Right */}
            <div className="kapitan-right">
              <h4>
                Consultation Schedule
                <a href="#">
                  <FaFilePdf /> Download PDF
                </a>
              </h4>
              <div className="consultation-schedule">
                <div className="schedule-day available">
                  <div className="schedule-day-name">
                    Mon
                  </div>
                  <div className="schedule-day-status">
                    9AM-12PM
                  </div>
                </div>
                <div className="schedule-day on-field">
                  <div className="schedule-day-name">
                    Tue
                  </div>
                  <div className="schedule-day-status">
                    On Field
                  </div>
                </div>
                <div className="schedule-day available">
                  <div className="schedule-day-name">
                    Wed
                  </div>
                  <div className="schedule-day-status">
                    9AM-12PM
                  </div>
                </div>
                <div className="schedule-day on-field">
                  <div className="schedule-day-name">
                    Thu
                  </div>
                  <div className="schedule-day-status">
                    On Field
                  </div>
                </div>
                <div className="schedule-day available">
                  <div className="schedule-day-name">
                    Fri
                  </div>
                  <div className="schedule-day-status">
                    2PM-5PM
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Executive Council */}
      <section className="council-section">
        <div className="council-container">
          <h2 className="section-title">
            Executive Council
          </h2>
          <p className="section-subtitle">
            Meet the dedicated officials serving 
            Barangay Batinguel
          </p>

          {/* Featured Two */}
          <div className="council-featured">
            <div className="council-card">
              <div className="council-card-image">
                <FaUserTie />
              </div>
              <div className="council-card-body">
                <div className="council-card-role">
                  Punong Barangay
                </div>
                <div className="council-card-name">
                  Hon. [Kapitan Name]
                </div>
                <p className="council-card-desc">
                  Ready to help for all programs 
                  for our official. Our official 
                  commitment to every resident 
                  with heart.
                </p>
                <a href="#" className="council-card-btn">
                  <FaPhone /> Contact Office
                </a>
              </div>
            </div>

            <div className="council-card">
              <div className="council-card-image">
                <FaUser />
              </div>
              <div className="council-card-body">
                <div className="council-card-role">
                  Barangay Secretary
                </div>
                <div className="council-card-name">
                  Maria Elena C. Reyes
                </div>
                <p className="council-card-desc">
                  Manages all administrative 
                  documents and official records 
                  of the barangay.
                </p>
                <a href="#" className="council-card-btn">
                  <FaPhone /> Contact Office
                </a>
              </div>
            </div>
          </div>

          {/* Council Grid */}
          <div className="council-grid">
            {councilMembers.map((member) => (
              <div
                key={member.id}
                className="council-small-card">
                <div className="council-small-avatar">
                  <FaUserTie />
                </div>
                <div className="council-small-name">
                  {member.name}
                </div>
                <div className="council-small-role">
                  {member.role}
                </div>
                <div className="council-small-role">
                  {member.committee}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Health Department */}
      <section className="health-dept-section">
        <div className="health-dept-container">
          <h2 className="section-title">
            Health Department
          </h2>
          <p className="section-subtitle">
            Our dedicated health professionals 
            serving the community
          </p>

          <div className="health-dept-grid">
            {healthDept.map((person) => (
              <div
                key={person.id}
                className="health-dept-card">
                <div className="health-dept-avatar">
                  <FaUserNurse />
                </div>
                <div className="health-dept-name">
                  {person.name}
                </div>
                <div className="health-dept-role">
                  {person.role}
                </div>
                <p className="health-dept-desc">
                  {person.desc}
                </p>
                <a href="#" className="health-dept-btn">
                  {person.btn}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default Officials