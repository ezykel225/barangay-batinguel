import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaCalendarAlt, FaList } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import MonthCalendar from '../components/MonthCalendar'
import { buildEventCalendar, describeEventDay, eventsOnDate } from '../utils/eventCalendar'
import { manilaToday } from '../utils/displayLabels'
import { MONTH_NAMES, parseDateKey } from '../utils/monthGrid'
import './Events.css'

// The public events page, browsable as a calendar or as the card list it
// has always been.
//
// ⚠️ CALENDAR IS THE DEFAULT. The IT feedback asked for events "changed
// and updated to calendar", and arriving here from the homepage's
// "View All Events" should land on the calendar rather than on a list
// that has to be switched. The cards are not gone -- they are the List
// view, unchanged.
//
// ⚠️ Dates come from `event_date` through the date-only helpers, never
// from `event_month`/`event_day`. Those two are denormalised copies
// written as `new Date(dateString).getDate()`, which reads a UTC
// midnight back in the browser's zone and so describes the previous day
// west of UTC. See src/utils/monthGrid.js.
const Events = () => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('calendar')

  // Today in Manila, read once per mount. The grid uses it to mark today
  // and to grey the past, and it decides which month opens.
  const today = useMemo(() => manilaToday(), [])
  const [{ year, month }, setMonth] = useState(() => {
    const parsed = parseDateKey(today)
    return parsed
      ? { year: parsed.year, month: parsed.month }
      : { year: new Date().getFullYear(), month: new Date().getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState('')

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

  const calendar = useMemo(() => buildEventCalendar(events), [events])
  const selectedEvents = useMemo(
    () => eventsOnDate(calendar, selectedDate),
    [calendar, selectedDate]
  )

  const selectedLabel = useMemo(() => {
    const parsed = parseDateKey(selectedDate)
    if (!parsed) return ''
    return `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}`
  }, [selectedDate])

  return (
    <div className="events-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>

      <section className="events-page-section">
        <div className="events-page-container">
          <Link to="/" className="back-link">← Back to Home</Link>

          <div className="events-page-header">
            <h1><FaCalendarAlt /> All Events</h1>
            <p>Browse all scheduled barangay events and activities.</p>
          </div>

          {/* Buttons rather than a select, so both views are one keystroke
              away and `aria-pressed` carries the state instead of colour
              alone. */}
          <div className="events-view-toggle">
            <div className="view-toggle" role="group" aria-label="How to browse events">
              <button
                type="button"
                onClick={() => setView('calendar')}
                aria-pressed={view === 'calendar'}
              >
                <FaCalendarAlt aria-hidden="true" /> Calendar
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <FaList aria-hidden="true" /> List
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-text">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="empty-text">No events yet.</div>
          ) : view === 'calendar' ? (
            <div className="events-calendar-layout">
              <MonthCalendar
                year={year}
                month={month}
                onMonthChange={setMonth}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                today={today}
                idPrefix="public-events"
                renderDay={(cell) => describeEventDay(cell, calendar)}
                caption="Dates with a marker have events. Select a date to see them."
              />

              {/* The selected day's events live OUTSIDE the grid. A title
                  and a location cannot go inside a cell that has to stay
                  square and legible on a 320px phone. */}
              <div className="mcal-day-panel">
                {!selectedDate ? (
                  <p className="mcal-day-empty">
                    Select a date above to see what is scheduled.
                  </p>
                ) : (
                  <>
                    <h4>{selectedLabel}</h4>
                    {selectedEvents.length === 0 ? (
                      <p className="mcal-day-empty">Nothing scheduled on this date.</p>
                    ) : (
                      <div className="mcal-day-list">
                        {selectedEvents.map((event) => (
                          <Link
                            key={event.id}
                            to={`/events/${event.id}`}
                            className="mcal-day-item"
                          >
                            <span className="mcal-day-item-title">{event.title}</span>
                            {event.location && (
                              <span className="mcal-day-item-meta">{event.location}</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
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

      </main>
      <Footer />
    </div>
  )
}

export default Events
