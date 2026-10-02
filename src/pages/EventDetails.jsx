import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import { eventTimeLabel } from '../utils/eventCalendar'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './EventDetails.css'

const EventDetails = () => {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchEvent = useCallback(async () => {
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
  }, [id])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])


  return (
    <div className="event-details-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>

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
                {/* ⚠️ THE WHOLE ROW GOES, not just its value. This
                    printed unconditionally, and `events.event_time` is
                    NULL on every row in the live table -- so every
                    event's detail page read "Time:" followed by
                    nothing, which looks like a value that failed to
                    load rather than one that was never recorded.

                    `eventTimeLabel` is the same function the Events
                    list card uses, so the two surfaces cannot disagree
                    about whether a row has a time or how it reads. It
                    returns '' for null, empty and whitespace, and it
                    does NOT dig a time out of `location` -- three
                    legacy rows begin their location with one
                    ("2:00 PM - Main Covered Court") and that stays part
                    of the location, exactly as somebody typed it. */}
                {eventTimeLabel(event.event_time) && (
                  <p><strong>Time:</strong> {eventTimeLabel(event.event_time)}</p>
                )}
                <p><strong>Location:</strong> {event.location}</p>
              </div>
              <p>{event.description || 'No event description available.'}</p>
            </div>
          )}
        </div>
      </section>

      </main>
      <Footer />
    </div>
  )
}

export default EventDetails