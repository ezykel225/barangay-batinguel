import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaCalendarAlt, FaList, FaMapMarkerAlt, FaRegClock } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import MonthCalendar from '../components/MonthCalendar'
import {
  buildEventCalendar, describeEventDay, eventTimeLabel, eventsOnDate,
} from '../utils/eventCalendar'
import { manilaToday } from '../utils/displayLabels'
import { MONTH_NAMES, parseDateKey } from '../utils/monthGrid'
import './PageIntro.css'
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
          {/* One header row: the intro on the left, the view switcher at
              the end of the same line. It used to sit in a band of its
              own 28px below the intro, 181px of control stranded against
              the right edge of a 1200px empty row. `.page-intro-row`
              wraps, so on a phone the switcher drops under the text
              rather than squeezing it. */}
          <div className="page-intro">
            <Link to="/" className="back-link">← Back to Home</Link>
            <div className="page-intro-row">
              <div className="page-intro-main">
                <span className="page-intro-icon" aria-hidden="true">
                  <FaCalendarAlt />
                </span>
                <div className="page-intro-text">
                  <h1>All Events</h1>
                  <p>Browse all scheduled barangay events and activities.</p>
                </div>
              </div>

              {/* Buttons rather than a select, so both views are one
                  keystroke away and `aria-pressed` carries the state
                  instead of colour alone. Moved, not rebuilt: the
                  markup, the handlers and the semantics are unchanged. */}
              <div className="page-intro-aside events-view-toggle">
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
              {/* ⚠️ The empty state is a STATE, not a missing panel.
                  Unselected, this was a 46px box beside a 532px
                  calendar, which reads as something that failed to
                  render rather than as a panel waiting for a click. The
                  class lets it be styled as a waiting panel; the words
                  are unchanged. */}
              <div className={`mcal-day-panel ${selectedDate ? '' : 'is-waiting'}`}>
                {!selectedDate ? (
                  <p className="mcal-day-empty">
                    Select a date above to see what is scheduled.
                  </p>
                ) : (
                  <>
                    {/* ⚠️ h2, not h4. This page's only other heading is
                        its <h1>, so an <h4> skips TWO levels and a
                        screen-reader user navigating by heading hears a
                        gap. It was never caught because every earlier
                        audit measured this view with NO DATE SELECTED,
                        where this heading does not render at all. The
                        dashboards' panels keep <h4>; they sit under
                        their own tab headings. */}
                    <h2 className="mcal-day-heading">{selectedLabel}</h2>
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
                      {/* ⚠️ h2 here, h3 on Home. Same card, two pages:
                          on Home it sits under the section's <h2> and
                          h3 is correct; here the page's only other
                          heading is its <h1>. Exactly the split the
                          announcement card already carries, and the
                          stylesheet matches both tags. Pre-existing, and
                          invisible to every earlier audit because they
                          measured the CALENDAR view. */}
                      <h2>{event.title}</h2>
                      {/* ⚠️ EACH LINE RENDERS ONLY IF ITS COLUMN HOLDS
                          SOMETHING. `events.event_time` is NULL on every
                          row in the live table, so today the time line
                          is simply absent -- a "Time:" label with a
                          blank after it reads as a value that failed to
                          load. Nothing is invented and nothing is dug
                          out of `location`, which on three legacy rows
                          begins with a time somebody typed into it. */}
                      <div className="event-meta">
                        {eventTimeLabel(event.event_time) && (
                          <span className="event-meta-item">
                            <FaRegClock aria-hidden="true" />
                            {eventTimeLabel(event.event_time)}
                          </span>
                        )}
                        {event.location && (
                          <span className="event-meta-item">
                            <FaMapMarkerAlt aria-hidden="true" />
                            {event.location}
                          </span>
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

      </main>
      <Footer />
    </div>
  )
}

export default Events
