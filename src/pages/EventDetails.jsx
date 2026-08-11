import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './EventDetails.css'

const EventDetails = () => {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvent()
  }, [id])

  const fetchEvent = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Event details error:', error)
      } else {
        setEvent(data)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="event-details-page">
      <Navbar />

      <section className="event-details-section">
        <div className="event-details-container">
          <Link to="/events" className="back-link">
            ← Back to Events
          </Link>

          {loading ? (
            <div className="loading-text">Loading event...</div>
          ) : !event ? (
            <div className="empty-text">Event not found.</div>
          ) : (
            <div className="event-details-card">
              <h1>{event.title}</h1>
              <div className="event-details-meta">
                <p><strong>Date:</strong> {event.event_date}</p>
                <p><strong>Time:</strong> {event.event_time}</p>
                <p><strong>Location:</strong> {event.location}</p>
              </div>
              <p>{event.description || 'No event description available.'}</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default EventDetails