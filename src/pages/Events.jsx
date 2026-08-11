import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaCalendarAlt } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Events.css'

const Events = () => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })

      if (error) {
        console.error('Events error:', error)
      } else {
        setEvents(data || [])
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="events-page">
      <Navbar />

      <section className="events-page-section">
        <div className="events-page-container">
          <Link to="/" className="back-link">← Back to Home</Link>

          <div className="events-page-header">
            <h1><FaCalendarAlt /> All Events</h1>
            <p>Browse all scheduled barangay events and activities.</p>
          </div>

          {loading ? (
            <div className="loading-text">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="empty-text">No events found.</div>
          ) : (
            <div className="events-page-grid">
              {events.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="event-card-link"
                >
                  <div className="event-card">
                    <div className="event-date">
                      <div className="event-date-month">{event.event_month}</div>
                      <div className="event-date-day">{event.event_day}</div>
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

      <Footer />
    </div>
  )
}

export default Events