import { useEffect, useState } from 'react'
import {
  FaUserNurse,
  FaFileMedical,
  FaPills,
  FaChevronRight,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './HealthCenter.css'

const HealthCenter = () => {
  const [nurseAvailability, setNurseAvailability] = useState([])
  const [healthEvents, setHealthEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNurseAvailability()
    fetchHealthEvents()
  }, [])

  const fetchNurseAvailability = async () => {
    const { data, error } = await supabase
      .from('nurse_availability')
      .select('*')
      .order('day_of_week', { ascending: true })

    if (error) {
      console.error('Error fetching nurse availability:', error)
    } else {
      setNurseAvailability(data)
    }
  }

  const fetchHealthEvents = async () => {
    const { data, error } = await supabase
      .from('health_events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(3)

    if (error) {
      console.error('Error fetching health events:', error)
    } else {
      setHealthEvents(data)
      setLoading(false)
    }
  }

  const resources = [

    {
      id: 2,
      title: 'Free Medicine Program',
      desc: 'Learn about our free medicine distribution program.',
    },
  ]

  return (
    <div className="health-page">

      {/* Navbar */}
      <Navbar />

      {/* Hero */}
      <section className="health-hero">
        <div className="health-hero-container">
          <div className="health-hero-left">
            <p style={{
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#99f6e4',
              marginBottom: '8px'
            }}>
              Community Wellness Hub
            </p>
            <h1>
              Your Health,
              <span>Our Priority.</span>
            </h1>
            <p>
              Access essential medical services,
              real-time nurse availability, and
              upcoming health events for every
              resident of Barangay Batinguel.
            </p>
          </div>

          {/* Emergency Hotline */}
          <div className="health-emergency-card">
            <p>Emergency Hotline</p>
            <h3>(+63) 912 345 6789</h3>
            <span>Available 24/7</span>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="health-main">
        <div className="health-main-container">

          {/* Left Sidebar */}
          <div className="health-sidebar">

            {/* On Duty Status */}
            <div className="health-status-card">
              <h4>
                <div className="health-status-dot">
                </div>
                On-Duty Status
              </h4>

              {loading ? (
                <p style={{ fontSize: '13px',
                  color: '#6b7280' }}>
                  Loading...
                </p>
              ) : nurseAvailability.length === 0 ? (
                <p style={{ fontSize: '13px',
                  color: '#6b7280' }}>
                  No availability data yet.
                </p>
              ) : (
                nurseAvailability
                  .filter((n, index, self) =>
                    index === self.findIndex(
                      (t) => t.nurse_name === n.nurse_name
                    )
                  )
                  .map((nurse) => (
                    <div key={nurse.id}
                      className="health-nurse-item">
                      <div className="health-nurse-avatar">
                        <FaUserNurse />
                      </div>
                      <div className="health-nurse-info">
                        <h5>{nurse.nurse_name}</h5>
                        <p>Barangay Nurse</p>
                      </div>
                      <div className="health-nurse-status">
                        <span className={`status-badge 
                          ${nurse.status === 'available'
                            ? 'available'
                            : 'unavailable'}`}>
                          {nurse.status === 'available'
                            ? 'Available'
                            : nurse.status === 'on-leave'
                            ? 'On Leave'
                            : 'Unavailable'}
                        </span>
                      </div>
                    </div>
                  ))
              )}

            </div>

            {/* Clinic Hours */}
            <div className="health-clinic-card">
              <h4>Clinic Hours</h4>
              <div className="clinic-hours-item">
                <span className="clinic-hours-day">
                  Monday - Thursday
                </span>
                <span className="clinic-hours-time">
                  8:00 AM - 5:00 PM
                </span>
              </div>
              <div className="clinic-hours-item">
                <span className="clinic-hours-day">
                  Friday (Special Cases)
                </span>
                <span className="clinic-hours-time">
                  8:00 AM - 12:00 PM
                </span>
              </div>
              <div className="clinic-hours-item">
                <span className="clinic-hours-day">
                  Saturday - Sunday
                </span>
                <span className="clinic-hours-closed">
                  Closed
                </span>
              </div>
              <div className="clinic-hours-item">
                <span className="clinic-hours-day">
                  Holidays
                </span>
                <span className="clinic-hours-closed">
                  Closed
                </span>
              </div>
            </div>

          </div>

          {/* Right Content */}
          <div className="health-content">

            {/* Bakuna Events */}
            <div className="health-bakuna-card">
              <div className="health-card-header">
                <h4>💉 Bakuna & Health Events</h4>
                <a href="#">View Full Calendar</a>
              </div>

              {loading ? (
                <p style={{ fontSize: '13px',
                  color: '#6b7280' }}>
                  Loading events...
                </p>
              ) : healthEvents.length === 0 ? (
                <p style={{ fontSize: '13px',
                  color: '#6b7280' }}>
                  No health events yet.
                </p>
              ) : (
                <div className="bakuna-grid">
                  {healthEvents.map((event) => (
                    <div key={event.id}
                      className="bakuna-card">
                      <div className="bakuna-card-date">
                        <div className="month">
                          {event.event_month}
                        </div>
                        <div className="day">
                          {event.event_day}
                        </div>
                      </div>
                      <div className="bakuna-card-body">
                        <h5>{event.title}</h5>
                        <p>{event.description}</p>
                        <span className="bakuna-target">
                          {event.target_audience}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Patient Resources */}
            <div className="health-resources-card">
              <h4>Patient Resources</h4>
              {resources.map((resource) => (
                <div key={resource.id}
                  className="resource-item">
                  <div className="resource-icon">
                    {resource.id === 1
                      ? <FaFileMedical />
                      : <FaPills />}
                  </div>
                  <div className="resource-info">
                    <h5>{resource.title}</h5>
                    <p>{resource.desc}</p>
                  </div>
                  <FaChevronRight
                    style={{
                      marginLeft: 'auto',
                      color: '#9ca3af'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Community Stats */}
            <div className="health-stats-card">
              <h4>Community Stats</h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px'
              }}>
                <div>
                  <div className="health-stats-number">
                    94%
                  </div>
                  <div className="health-stats-label">
                    Fully Vaccinated
                  </div>
                </div>
                <div>
                  <div className="health-stats-number">
                    120+
                  </div>
                  <div className="health-stats-label">
                    Daily Consultations
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default HealthCenter