import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { FaBullhorn, FaCalendarAlt } from 'react-icons/fa'
import { MdAnnouncement } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import { announcementExcerpt } from '../utils/homeSections'
import {
  BARANGAY_CONTACT, BARANGAY_NAME, BARANGAY_OFFICE_HOURS, telHref,
} from '../constants/barangay'
import { E_SERVICES, SERVICE_ACCESS } from '../constants/eServices'
import {
  BARANGAY_PROFILE,
} from '../constants/about'
import { upcomingEvents } from '../utils/eventCalendar'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Home.css'

const Home = () => {
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)

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
      } else {
        setAnnouncements(data || [])
      }
    } catch (err) {
      console.error('Fetch announcements error:', err)
    } finally {
      setLoadingAnnouncements(false)
    }
  }

  const HOME_EVENT_LIMIT = 4

  const fetchEvents = async () => {
    try {
      // ⚠️ No .limit() here, and that is deliberate.
      //
      // This section is headed "Upcoming Events" and used to run
      // `.order('event_date').limit(4)` with no date filter at all. On
      // live data that showed three events from 2024 FIRST and the one
      // genuinely upcoming event last -- the heading promising the
      // opposite of what was under it. The same defect as the
      // "Upcoming Events" count fixed in PR #22, in the list beside it.
      //
      // Filter, THEN limit. Limiting in SQL first would hand four rows
      // to a filter that then has nothing upcoming left to show.
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })

      if (error) {
        console.error('Events error:', error)
      } else {
        // Filtered to what is still to come, then limited. Today in
        // Manila counts as upcoming -- an event this afternoon has not
        // happened yet.
        setEvents(upcomingEvents(data || [], { limit: HOME_EVENT_LIMIT }))
      }
    } catch (err) {
      console.error('Fetch events error:', err)
    } finally {
      setLoadingEvents(false)
    }
  }

  return (
    <div className="home">
      <Navbar />

      <main id="main-content" tabIndex={-1}>

      <section className="hero">
        <div className="hero-container">
          {/* ⚠️ The system's own name, not a description of the kind
              of thing it is. "Official Barangay Portal" could sit on
              any barangay's homepage; the heading below already says
              which barangay this is, so the badge was spending the
              most prominent line on the site saying nothing. */}
          <span className="hero-badge">
            🏛️ Barangay Batinguel E-Services
          </span>
          <h1>Welcome to Barangay Batinguel</h1>
          <p>
            Your digital gateway for community updates, safety information,
            documents, and complaint services.
          </p>
          {/* ⚠️ THE PRIMARY ACTION IS THE CATALOGUE, NOT ONE SERVICE.
              It previously promoted one retired service above
              the headline errand of the whole barangay -- above
              requesting a document, which is the reason most residents
              open this site, and above tracking a request they have
              already filed. `/e-services` is the one doorway that
              reaches all of them. */}
          <div className="hero-buttons">
            <Link to="/e-services" className="hero-btn-primary">
              View E-Services
            </Link>
          </div>
        </div>
      </section>

      {/* ⚠️ E-SERVICES SITS WHERE THE HISTORY USED TO. Somebody arriving
          at a barangay portal is usually there to DO something --
          request a document, file a complaint, check on a request --
          and the home page opened with three paragraphs of history, a
          map, a facts table and a school card before any of it.

          The cards come from `constants/eServices.js`, the same
          catalogue behind the navbar dropdown, the mobile drawer and
          the /e-services page, so a service added once appears in all
          four and a route cannot drift between them. */}
      <section className="home-services">
        <div className="home-services-container">
          <div className="section-header">
            <h2>Popular E-Services</h2>
            <Link to="/e-services" className="section-link">
              View All E-Services →
            </Link>
          </div>

          <div className="home-services-grid">
            {E_SERVICES.filter(service => ['file-complaint', 'track-complaint', 'request-document', 'my-requests'].includes(service.key)).map((service) => (
              <Link
                key={service.key}
                to={service.to}
                className="home-service-card"
              >
                <span className="home-service-name">{service.label}</span>
                <span className="home-service-summary">{service.summary}</span>
                {/* ⚠️ In WORDS, not a colour or an icon. Somebody has to
                    learn an account is needed BEFORE they click, which
                    is the whole point of the catalogue's `access`
                    field -- and it is a promise to the reader, never a
                    gate: ProtectedRoute and RLS decide what is actually
                    reachable. */}
                <span className="home-service-access">
                  {SERVICE_ACCESS[service.access].label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ⚠️ The doorway to the PUBLIC Community Safety Map, and
          deliberately not an E-Services card above: that catalogue is
          transactions a visitor asks the barangay to perform, each
          stating an access requirement, and this is published
          information with no account and nothing to submit.
          It says AREAS, never addresses: the published map is built
          from aggregated cells, so promising a precise location here
          would describe something the page cannot show. */}
      <section className="home-safety-teaser">
        <div className="home-safety-teaser-container">
          <div>
            <h2>Community Safety</h2>
            <p>View privacy-protected incident patterns across Barangay Batinguel.</p>
          </div>
          <Link to="/community-safety" className="home-about-teaser-btn">
            View Safety Map
          </Link>
        </div>
      </section>

      {/* The history, the map, Barangay at a Glance and the Batinguel
          Elementary card now live on /about. This is the doorway to
          them, not a second copy -- two copies of the barangay's own
          history is two places for it to drift. */}
      <section className="home-about-teaser">
        <div className="home-about-teaser-container">
          <div>
            <h2>About {BARANGAY_NAME}</h2>
            <p>{BARANGAY_PROFILE.intro}</p>
          </div>
          <Link to="/about" className="home-about-teaser-btn">
            About the Barangay
          </Link>
        </div>
      </section>

      <section className="contact-info">
        <div className="contact-info-container">
          <div className="contact-card">
            <div className="contact-icon">📍</div>
            <div className="contact-content">
              <h3>Address</h3>
              <p>Barangay Batinguel,</p>
              <p>Dumaguete City,</p>
              <p>Negros Oriental, Philippines</p>
            </div>
          </div>

          <div className="contact-card">
            <div className="contact-icon">🕐</div>
            <div className="contact-content">
              <h3>Office Hours</h3>
              <p>{BARANGAY_OFFICE_HOURS.days}</p>
              {/* Two lines rather than one range, so the closed hour is
                  stated instead of left to be discovered on arrival. */}
              <p>{BARANGAY_OFFICE_HOURS.morning}</p>
              <p>{BARANGAY_OFFICE_HOURS.afternoon}</p>
              <p className="office-break-text">{BARANGAY_OFFICE_HOURS.breakNote}</p>
              <p className="closed-text">{BARANGAY_OFFICE_HOURS.closedNote}</p>
            </div>
          </div>

          <div className="contact-card">
            <div className="contact-icon">📞</div>
            <div className="contact-content">
              <h3>Contact Number</h3>
              <p>
                Landline:{' '}
                <a href={telHref(BARANGAY_CONTACT.landline)}>
                  {BARANGAY_CONTACT.landline}
                </a>
              </p>
              <p>
                Mobile:{' '}
                <a href={telHref(BARANGAY_CONTACT.mobile)}>
                  {BARANGAY_CONTACT.mobile}
                </a>
              </p>
            </div>
          </div>

          <div className="contact-card">
            <div className="contact-icon">📧</div>
            <div className="contact-content">
              <h3>Email Address</h3>
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
                      {/* ⚠️ AN EXCERPT, AND THE ROW IS NOT TOUCHED.
                          `/announcements/:id` reads the same
                          `description` column, so the full notice is
                          one click away and unchanged. The card printed
                          the whole body, so one long announcement made
                          its card several times the height of the two
                          beside it and pushed later sections
                          sections off the screen. */}
                      <p className="announcement-card-excerpt">
                        {announcementExcerpt(item.description)}
                      </p>
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

      </main>
      <Footer />
    </div>
  )
}

export default Home
