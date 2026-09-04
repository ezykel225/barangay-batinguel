import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { FaBullhorn, FaCalendarAlt, FaLeaf, FaRecycle, FaTrashAlt } from 'react-icons/fa'
import { MdAnnouncement } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Home.css'

const wasteTypeIcon = (type = '') => {
  const t = type.toLowerCase()
  if (t.includes('bio')) return <FaLeaf />
  if (t.includes('recycl')) return <FaRecycle />
  return <FaTrashAlt />
}

const Home = () => {
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [wasteSchedule, setWasteSchedule] = useState([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingWaste, setLoadingWaste] = useState(true)

  useEffect(() => {
    fetchAnnouncements()
    fetchEvents()
    fetchWasteSchedule()
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
      } else {
        setAnnouncements(data || [])
      }
    } catch (err) {
      console.error('Fetch announcements error:', err)
    } finally {
      setLoadingAnnouncements(false)
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
      } else {
        setEvents(data || [])
      }
    } catch (err) {
      console.error('Fetch events error:', err)
    } finally {
      setLoadingEvents(false)
    }
  }

  const fetchWasteSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('waste_schedule')
        .select('*')
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Waste schedule error:', error)
      } else {
        setWasteSchedule(data || [])
      }
    } catch (err) {
      console.error('Fetch waste schedule error:', err)
    } finally {
      setLoadingWaste(false)
    }
  }

  return (
    <div className="home">
      <Navbar />

      <section className="hero">
        <div className="hero-container">
          <span className="hero-badge">
            🏛️ Official Barangay Portal
          </span>
          <h1>Welcome to Barangay Batinguel</h1>
          <p>
            Your digital gateway for community updates and neighborhood
            health wellness.
          </p>
          <div className="hero-buttons">
            <Link to="/reservation" className="hero-btn-primary">
              Book a Reservation
            </Link>
            <Link to="/health-center" className="hero-btn-secondary">
              Health Center
            </Link>
          </div>
        </div>
      </section>

      <section className="about">
        <div className="about-container">
          <div className="about-content">
            <h2>About Barangay Batinguel</h2>
            <p>
              <strong>Our History</strong>
              <br />
              Barangay Batinguel is one of the thriving barangays of
              Dumaguete City. Our community has grown from a quiet
              settlement into a thriving community.
            </p>
            <p>
              <strong>Our Mission</strong>
              <br />
              To provide transparent, efficient, and compassionate public
              service. We are committed to keeping a quality, healthy, and
              digitally-empowered environment where every resident can
              participate in building a sustainable future together.
            </p>
          </div>

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

      <section className="contact-info">
        <div className="contact-info-container">
          <div className="contact-card">
            <div className="contact-icon">📍</div>
            <div className="contact-content">
              <h4>Address</h4>
              <p>Barangay Batinguel,</p>
              <p>Dumaguete City,</p>
              <p>Negros Oriental, Philippines</p>
            </div>
          </div>

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

          <div className="contact-card">
            <div className="contact-icon">📞</div>
            <div className="contact-content">
              <h4>Contact Number</h4>
              <p>+63 XXX XXX XXXX</p>
            </div>
          </div>

          <div className="contact-card">
            <div className="contact-icon">📧</div>
            <div className="contact-content">
              <h4>Email Address</h4>
              <p>batinguel@dumaguete.gov.ph</p>
            </div>
          </div>
        </div>
      </section>

      <section className="announcements">
        <div className="section-container">
          <div className="section-header">
            <h2>
              <MdAnnouncement /> Latest Announcements
            </h2>
            <Link to="/announcements">View All Announcements</Link>
          </div>

          {loadingAnnouncements ? (
            <div className="loading-text">Loading announcements...</div>
          ) : announcements.length === 0 ? (
            <div className="empty-text">No announcements yet.</div>
          ) : (
            <div className="announcements-grid">
              {announcements.map((item) => (
                <Link
                  key={item.id}
                  to={`/announcements/${item.id}`}
                  className="announcement-card-link"
                >
                  <div className="announcement-card">
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
                        {new Date(item.date_posted).toLocaleDateString(
                          'en-US',
                          {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="events">
        <div className="section-container">
          <div className="section-header">
            <h2>
              <FaCalendarAlt /> Upcoming Events
            </h2>
            <Link to="/events">View All Events</Link>
          </div>

          {loadingEvents ? (
            <div className="loading-text">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="empty-text">No upcoming events yet.</div>
          ) : (
            <div className="events-grid">
              {events.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="event-card-link"
                >
                  <div className="event-card">
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
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="waste-schedule-section">
        <div className="section-container">
          <div className="section-header">
            <h2>
              <FaTrashAlt /> Waste Collection Schedule
            </h2>
          </div>

          {loadingWaste ? (
            <div className="loading-text">Loading schedule...</div>
          ) : wasteSchedule.length === 0 ? (
            <div className="empty-text">No waste collection schedule has been posted yet.</div>
          ) : (
            <div className="waste-schedule-home-grid">
              {Object.entries(
                wasteSchedule.reduce((acc, row) => {
                  const key = row.purok || 'Other'
                  if (!acc[key]) acc[key] = []
                  acc[key].push(row)
                  return acc
                }, {})
              ).map(([purok, rows]) => (
                <div key={purok} className="waste-schedule-home-card">
                  <h3>{purok}</h3>
                  {rows.map((row) => (
                    <div key={row.id} className="waste-schedule-home-row">
                      <span className="waste-schedule-home-icon">
                        {wasteTypeIcon(row.waste_type)}
                      </span>
                      <div>
                        <div className="waste-schedule-home-type">{row.waste_type}</div>
                        <div className="waste-schedule-home-time">
                          {row.day_of_week}{row.time_label ? ` — ${row.time_label}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="waste-schedule-home-notice">
            Please segregate your waste at source. Uncollected or unsegregated waste
            may be left behind by collection trucks.
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Home