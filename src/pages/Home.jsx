import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { 
  FaBullhorn, 
  FaCalendarAlt, 
} from 'react-icons/fa'
import { MdAnnouncement } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Home.css'

const Home = () => {
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnnouncements()
    fetchEvents()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('date_posted', { ascending: false })
        .limit(3)

      if (error) {
        console.error('Announcements error:', error)
        setLoading(false)
      } else {
        setAnnouncements(data || [])
        setLoading(false)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setLoading(false)
    }
  }

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
        .limit(4)

      if (error) {
        console.error('Events error:', error)
        setLoading(false)
      } else {
        setEvents(data || [])
        setLoading(false)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="home">

      {/* Navbar */}
      <Navbar />

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <span className="hero-badge">
            🏛️ Official Barangay Portal
          </span>
          <h1>Welcome to Barangay Batinguel</h1>
          <p>
            Your digital gateway for civic services,
            community updates, and neighborhood
            health wellness.
          </p>
          <div className="hero-buttons">
            <Link
              to="/reservation"
              className="hero-btn-primary">
              Reserve Covered Court
            </Link>
            <Link
              to="/health-center"
              className="hero-btn-secondary">
              Health Center
            </Link>
          </div>
        </div>
      </section>

      {/* About Section with Google Map */}
      <section className="about">
        <div className="about-container">

          {/* Left - About Content */}
          <div className="about-content">
            <h2>About Barangay Batinguel</h2>
            <p>
              <strong>Our History</strong>
              <br />
              Barangay Batinguel is one of the
              thriving barangays of Dumaguete City.
              Our community has grown from a quiet
              settlement into a thriving community.
            </p>
            <p>
              <strong>Our Mission</strong>
              <br />
              To provide transparent, efficient, and
              compassionate public service. We are
              committed to keeping a quality, healthy,
              and digitally-empowered environment
              where every resident can participate
              in building a sustainable future together.
            </p>
          </div>

          {/* Right - Google Map */}
          <div className="about-map">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3937.2635274848303!2d123.2873436758287!3d9.30990198452701!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33ab6f17b3b1d6ab%3A0xcb78463dddd5353b!2sBatinguel%20Barangay%20Hall!5e0!3m2!1sen!2sph!4v1775801628036!5m2!1sen!2sph"
              width="100%"
              height="100%"
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="about-map-iframe"
              title="Barangay Batinguel Location"
            />
          </div>

        </div>
      </section>

      {/* Contact Info Section */}
      <section className="contact-info">
        <div className="contact-info-container">

          {/* Address Card */}
          <div className="contact-card">
            <div className="contact-icon">📍</div>
            <div className="contact-content">
              <h4>Address</h4>
              <p>Barangay Batinguel,</p>
              <p>Dumaguete City,</p>
              <p>Negros Oriental, Philippines</p>
            </div>
          </div>

          {/* Office Hours Card */}
          <div className="contact-card">
            <div className="contact-icon">🕐</div>
            <div className="contact-content">
              <h4>Office Hours</h4>
              <p>Monday - Friday</p>
              <p>8:00 AM - 5:00 PM</p>
              <p className="closed-text">
                Closed on Weekends & Holidays
              </p>
            </div>
          </div>

          {/* Contact Card */}
          <div className="contact-card">
            <div className="contact-icon">📞</div>
            <div className="contact-content">
              <h4>Contact Number</h4>
              <p>+63 XXX XXX XXXX</p>
            </div>
          </div>

          {/* Email Card */}
          <div className="contact-card">
            <div className="contact-icon">📧</div>
            <div className="contact-content">
              <h4>Email Address</h4>
              <p>batinguel@dumaguete.gov.ph</p>
            </div>
          </div>

        </div>
      </section>

      {/* Announcements Section */}
      <section className="announcements">
        <div className="section-container">
          <div className="section-header">
            <h2>
              <MdAnnouncement /> Latest Announcements
            </h2>
            <a href="#top">View All Updates</a>
          </div>

          {loading ? (
            <div className="loading-text">
              Loading announcements...
            </div>
          ) : announcements.length === 0 ? (
            <div className="empty-text">
              No announcements yet.
            </div>
          ) : (
            <div className="announcements-grid">
              {announcements.map((item) => (
                <div
                  key={item.id}
                  className="announcement-card">
                  <div className="announcement-card-image">
                    <FaBullhorn />
                  </div>
                  <div className="announcement-card-body">
                    <span className="announcement-badge">
                      {item.badge}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="announcement-card-footer">
                      {new Date(item.date_posted)
                        .toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Events Section */}
      <section className="events">
        <div className="section-container">
          <div className="section-header">
            <h2>
              <FaCalendarAlt /> Upcoming Events
            </h2>
            <a href="#top">View All Events</a>
          </div>

          {loading ? (
            <div className="loading-text">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="empty-text">
              No upcoming events yet.
            </div>
          ) : (
            <div className="events-grid">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="event-card">
                  <div className="event-date">
                    <div className="event-date-month">
                      {event.event_month}
                    </div>
                    <div className="event-date-day">
                      {event.event_day}
                    </div>
                  </div>
                  <div className="event-info">
                    <h3>{event.title}</h3>
                    <p>{event.location}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/reservation"
            className="events-calendar-btn">
            📅 Full Calendar
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default Home