import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaUserNurse,
  FaChevronRight,
  FaCalendarAlt,
  FaBullhorn,
  FaGavel,
  FaLightbulb,
  FaHandsWash,
  FaBug,
  FaAppleAlt,
  FaWalking,
  FaPhoneAlt,
  FaMapMarkerAlt,
} from 'react-icons/fa'
import { MdOutlineEventAvailable, MdPersonSearch } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import { MEDICINE_CATEGORIES, MEDICINE_STATUS, statusOf } from '../constants/medicines'
import { buildWeekSchedule } from '../utils/clinicSchedule'
import { countByStatus, filterMedicines, groupByCategory } from '../utils/medicineFilter'
import {
  BARANGAY_CONTACT, HEALTH_NURSE_ROLE, telHref,
} from '../constants/barangay'
import {
  formatTime, isOnScheduledBreak, manilaWeekday,
} from '../utils/clinicHours'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './HealthCenter.css'

const healthTips = [
  {
    id: 1,
    icon: <FaHandsWash />,
    title: 'Wash Hands Regularly',
    desc: 'Use soap and water for at least 20 seconds especially before eating and after using the restroom.',
  },
  {
    id: 2,
    icon: <FaBug />,
    title: 'Prevent Dengue',
    desc: 'Remove stagnant water around your home. Use mosquito repellent especially during early morning and evening.',
  },
  {
    id: 3,
    icon: <FaAppleAlt />,
    title: 'Eat Balanced Meals',
    desc: 'Include fruits and vegetables in your daily diet. Stay hydrated with at least 8 glasses of water a day.',
  },
  {
    id: 4,
    icon: <FaWalking />,
    title: 'Stay Active',
    desc: 'At least 30 minutes of physical activity daily helps prevent lifestyle diseases like hypertension and diabetes.',
  },
]

// ⚠️ DAY_ORDER moved to utils/clinicSchedule.js, which is the module
// that now decides what a week looks like. Two copies of a weekday
// order is two places for Sunday to end up in the wrong half.

const HealthCenter = () => {
  const [healthEvents, setHealthEvents] = useState([])
  const [loadingNurse, setLoadingNurse] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [nurseStatus, setNurseStatus] = useState('unavailable')
  const [weekSchedule, setWeekSchedule] = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [scheduleRows, setScheduleRows] = useState([])
  const [medicines, setMedicines] = useState([])
  const [medicinesLoading, setMedicinesLoading] = useState(true)
  // Narrowing the medicine list. All client-side, over rows already
  // fetched -- no second query, so the counts and the list cannot
  // disagree about what is published.
  const [medicineQuery, setMedicineQuery] = useState('')
  const [medicineCategory, setMedicineCategory] = useState('all')
  const [medicineStatus, setMedicineStatus] = useState('all')
  // Which category groups are folded away. Collapsed by key, so a
  // group that appears later starts open rather than inheriting a
  // collapse nobody asked for.
  const [collapsedCategories, setCollapsedCategories] = useState({})

  const fetchNurseAvailability = useCallback(async () => {
    try {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const today = days[new Date().getDay()]

      const { data, error } = await supabase
        .from('nurse_availability')
        .select('status')
        .eq('day_of_week', today)
        .limit(1)

      if (error) {
        console.error('Nurse fetch error:', error)
        setNurseStatus('unavailable')
      } else {
        setNurseStatus(data?.[0]?.status || 'unavailable')
      }
    } catch (err) {
      console.error('Nurse fetch error:', err)
      setNurseStatus('unavailable')
    } finally {
      setLoadingNurse(false)
    }
  }, [])

  // Pulls the same weekly schedule the nurse edits in her dashboard's
  // Availability tab, so "Clinic Hours" here is never out of sync.
  const fetchWeekSchedule = useCallback(async () => {
    try {
      // ⚠️ `break_start` and `break_end` were NOT in this select, and
      // the page's whole "work the lunch break out from the Manila
      // clock so nobody has to press anything at noon" behaviour reads
      // them. `isOnScheduledBreak` got `undefined` for both, returned
      // null, and the `=== true` test below was therefore ALWAYS
      // false: the automatic half of the two-ways-of-being-on-break
      // design has never once fired on this page.
      //
      // The weekly list rendered the break correctly only because it
      // read `day.break_start` from these same rows -- which is to say
      // it printed nothing, and "no break recorded" looks exactly like
      // a day that has none.
      const { data, error } = await supabase
        .from('nurse_availability')
        .select('day_of_week, time_start, time_end, break_start, break_end, status')

      if (!error) {
        // ⚠️ Sorting is no longer enough, because a day can have more
        // than one ROW -- Friday has two in the live table, and the
        // list showed Friday twice. `buildWeekSchedule` gives one
        // entry per weekday carrying every session recorded for it.
        setWeekSchedule(buildWeekSchedule(data || []))
        setScheduleRows(data || [])
      }
    } catch (err) {
      console.error('Schedule fetch error:', err)
    } finally {
      setLoadingSchedule(false)
    }
  }, [])


  const fetchHealthEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('health_events')
        .select('*')
        .order('event_date', { ascending: true })
        .limit(3)
      if (!error) setHealthEvents(data || [])
    } catch (err) {
      console.error('Error fetching health events:', err)
    } finally {
      setEventsLoading(false)
    }
  }, [])

  const fetchMedicines = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('medicine_stock')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true })
      if (!error) setMedicines(data || [])
    } catch (err) {
      console.error('Error fetching medicines:', err)
    } finally {
      setMedicinesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNurseAvailability()
    fetchWeekSchedule()
    fetchHealthEvents()
    fetchMedicines()
  }, [fetchNurseAvailability, fetchWeekSchedule, fetchHealthEvents, fetchMedicines])

  const filteredMedicines = useMemo(
    () => filterMedicines(medicines, {
      query: medicineQuery,
      category: medicineCategory,
      status: medicineStatus,
    }),
    [medicines, medicineQuery, medicineCategory, medicineStatus],
  )

  // Grouped in the order the categories are declared, so the list reads
  // the same way every visit rather than reshuffling as stock changes.
  const medicinesByCategory = useMemo(
    () => groupByCategory(filteredMedicines),
    [filteredMedicines],
  )

  // ⚠️ Counted over EVERYTHING published, not over what is on screen.
  // A summary that shrinks as you type is answering a different
  // question from the one it appears to answer, and "2 available"
  // under a search for "para" would be read as the health centre
  // having two medicines.
  const statusCounts = useMemo(() => countByStatus(medicines), [medicines])
  const isFiltered = medicineQuery.trim() !== ''
    || medicineCategory !== 'all'
    || medicineStatus !== 'all'

  const clearMedicineFilters = () => {
    setMedicineQuery('')
    setMedicineCategory('all')
    setMedicineStatus('all')
  }

  // Only the categories that actually have something in them, so the
  // dropdown cannot offer a filter that yields nothing.
  const availableCategories = useMemo(
    () => MEDICINE_CATEGORIES.filter(
      (category) => groupByCategory(medicines).some(([key]) => key === category),
    ),
    [medicines],
  )

  const toggleCategory = (category) =>
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }))

  // Stale stock information is worse than none -- a resident who
  // trusts it and walks for nothing stops trusting the whole site. So
  // say plainly when it was last touched and let them judge.
  const lastUpdated = useMemo(() => {
    const stamps = medicines
      .map((m) => m.updated_at)
      .filter(Boolean)
      .sort()
    if (!stamps.length) return null
    return new Date(stamps[stamps.length - 1]).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }, [medicines])

  const today = manilaWeekday()
  // ⚠️ The RAW row for today, because `isOnScheduledBreak` reads
  // `break_start`/`break_end` as stored. A day with two rows uses the
  // one covering the moment being asked about; failing that, the first.
  const todaySchedule = useMemo(() => {
    const rows = scheduleRows.filter((row) => row.day_of_week === today)
    if (rows.length === 0) return null
    return rows.find((row) => isOnScheduledBreak(row) !== null) || rows[0]
  }, [scheduleRows, today])

  // Two ways of being on break. The scheduled one is worked out from
  // the clock, so nobody has to remember to press anything at noon;
  // 'on-break' is the nurse saying so for an unscheduled absence.
  const onScheduledBreak =
    todaySchedule?.status === 'available' && isOnScheduledBreak(todaySchedule) === true
  const onBreakNow = nurseStatus === 'on-break' || onScheduledBreak

  const isAvailable = nurseStatus === 'available' && !onBreakNow

  return (
    <div className="health-page">

      <Navbar />

      <main id="main-content" tabIndex={-1}>

      {/* Hero */}
      <section className="health-hero">
        <div className="health-hero-container">
          <div className="health-hero-left">
            <p style={{
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#bfdbfe',
              marginBottom: '8px',
              display: 'inline-block',
              background: 'rgba(255,255,255,0.12)',
              padding: '7px 16px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.22)',
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

          <div className="health-emergency-card">
            <p>Emergency Hotline</p>
            <h2>
                <a href={telHref(BARANGAY_CONTACT.landline)}>{BARANGAY_CONTACT.landline}</a>
              </h2>
              <h2 style={{ fontSize: '0.95em' }}>
                <a href={telHref(BARANGAY_CONTACT.mobile)}>{BARANGAY_CONTACT.mobile}</a>
              </h2>
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
              <h3>
                <div className="health-status-dot"></div>
                On-Duty Status
              </h3>

              {loadingNurse ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>Loading...</p>
              ) : (
                <>
                  {/* Status is live from the nurse_availability table */}
                  <div className="health-nurse-item">
                    <div className="health-nurse-avatar">
                      <FaUserNurse />
                    </div>
                    <div className="health-nurse-info">
                      {/* One role, not two. This read
                          "Barangay Health Nurse" over "Public Health
                          Nurse" -- two near-identical strings stacked,
                          which reads as a fault. */}
                      <h4>{HEALTH_NURSE_ROLE}</h4>
                      <p>Barangay Health Center</p>
                    </div>
                    <div className="health-nurse-status">
                      <span className={`status-badge ${isAvailable ? 'available' : 'unavailable'}`}>
                        {isAvailable ? 'Available Today' : 'Not Available Today'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Clinic Hours — pulled live from the nurse's own weekly schedule */}
            <div className="health-clinic-card">
              <h3>Clinic Hours</h3>

              {/* The one line a resident standing outside actually
                  needs. Shown above the week, because "are they open
                  right now" beats "what are Thursday's hours". */}
              {/* ⚠️ Two different states reach this block, and it used to
                  assert a lunch break for both. `onBreakNow` is true for
                  the SCHEDULED break worked out from break_start /
                  break_end, and also for the manual `on-break` status,
                  which the shared availability vocabulary calls simply
                  "On break" -- the nurse may have stepped out for
                  anything. Only the scheduled case names lunch. */}
              {onBreakNow && (
                <div className="clinic-break-now">
                  {onScheduledBreak && todaySchedule?.break_end ? (
                    <>
                      <strong>On lunch break right now.</strong>{' '}
                      {`The clinic reopens at ${formatTime(todaySchedule.break_end)}.`}
                    </>
                  ) : (
                    <>
                      <strong>On break right now.</strong>{' '}
                      The nurse has stepped out — please come back shortly.
                    </>
                  )}
                </div>
              )}

              {loadingSchedule ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>Loading...</p>
              ) : weekSchedule.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>
                  Clinic hours have not been set yet.
                </p>
              ) : (
                weekSchedule.map((entry) => {
                  const isToday = entry.day === today
                  const open = entry.status === 'available' && entry.hasHours

                  return (
                    <div
                      className={`clinic-hours-item ${isToday ? 'is-today' : ''}`}
                      key={entry.day}
                    >
                      <span className="clinic-hours-day">
                        {entry.day}
                        {isToday && <span className="clinic-today-tag">Today</span>}
                      </span>

                      {open ? (
                        <span className="clinic-hours-time">
                          {/* ⚠️ One block per SESSION. Friday is recorded
                              as two rows in the live table -- 8-12 and
                              1-5 -- and the list used to render the day
                              twice, which reads as a rendering fault
                              rather than as two sessions. A lunch break
                              is printed only when it actually falls
                              inside the session it was stored against;
                              Friday's second row carries one that ends
                              as that session begins. */}
                          {entry.sessions.map((session) => (
                            <span className="clinic-hours-block" key={session.label}>
                              {session.label}
                            </span>
                          ))}
                          {entry.sessions
                            .filter((session) => session.breakLabel)
                            .map((session) => (
                              <span className="clinic-hours-break" key={`b-${session.label}`}>
                                Lunch {session.breakLabel}
                              </span>
                            ))}
                          {entry.isSplit && !entry.sessions.some((s) => s.breakLabel) && (
                            <span className="clinic-hours-break">
                              Two sessions — closed in between
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="clinic-hours-closed">
                          {entry.status === 'on-leave' ? 'On Leave' : 'Closed'}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Walk-in vs Appointment */}
            <div className="health-visit-card">
              <h3><MdPersonSearch /> How to Visit</h3>
              <div className="visit-option">
                <div className="visit-option-icon visit-walkin">
                  <FaWalking />
                </div>
                <div className="visit-option-info">
                  <h4>Walk-in</h4>
                  <p>For consultations, first aid, and minor injuries. Served on a first-come, first-served basis.</p>
                </div>
              </div>
              <div className="visit-divider">or</div>
              <div className="visit-option">
                <div className="visit-option-icon visit-appointment">
                  <MdOutlineEventAvailable />
                </div>
                <div className="visit-option-info">
                  <h4>Prior Notice</h4>
                  <p>For maternal care, immunization, and scheduled check-ups. Contact the clinic beforehand.</p>
                </div>
              </div>
              <div className="visit-contact">
                <span>
                  <FaPhoneAlt />{' '}
                  <a href={telHref(BARANGAY_CONTACT.landline)}>{BARANGAY_CONTACT.landline}</a>
                  {' · '}
                  <a href={telHref(BARANGAY_CONTACT.mobile)}>{BARANGAY_CONTACT.mobile}</a>
                </span>
                <span><FaMapMarkerAlt /> Barangay Hall, Batinguel</span>
              </div>
            </div>

          </div>

          {/* Right Content */}
          <div className="health-content">

            {/* Medicine availability — the reason a resident checks this
                page before walking to the health center. */}
            <div className="health-medicine-card">
              <div className="health-card-header">
                <h3>💊 Medicine Availability</h3>
                {lastUpdated && (
                  <span className="medicine-updated">Updated {lastUpdated}</span>
                )}
              </div>

              {medicinesLoading ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>Loading medicines...</p>
              ) : medicines.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>
                  The medicine list has not been published yet.
                </p>
              ) : (
                <>
                  <p className="medicine-disclaimer">
                    Stock changes through the day. This shows what the health
                    center had when the nurse last updated it — please confirm at
                    the counter before relying on it.
                  </p>

                  {/* ⚠️ Counted over everything PUBLISHED, not over what
                      is on screen. A summary that shrinks as you type
                      answers a different question from the one it looks
                      like it answers -- "2 available" under a search for
                      "para" reads as the health centre having two
                      medicines.

                      And these are counts of LIST ENTRIES, never of
                      boxes on a shelf. Medicine availability is a status
                      and not a quantity, because a published count is a
                      promise the barangay cannot keep without logging
                      every tablet dispensed. The wording says "listed". */}
                  <ul className="medicine-summary" aria-label="What is on the list today">
                    <li>
                      <strong>{statusCounts.total}</strong> medicines listed
                    </li>
                    {Object.entries(MEDICINE_STATUS).map(([key, meta]) => (
                      <li key={key}>
                        <span className={`medicine-summary-dot ${meta.className}`} aria-hidden="true" />
                        <strong>{statusCounts[key]}</strong> {meta.label.toLowerCase()}
                      </li>
                    ))}
                  </ul>

                  <div className="medicine-filters">
                    <div className="medicine-field">
                      <label htmlFor="medicine-search">Search medicines</label>
                      <input
                        id="medicine-search"
                        type="search"
                        value={medicineQuery}
                        onChange={(e) => setMedicineQuery(e.target.value)}
                        placeholder="Name, generic name, or what it is for"
                      />
                    </div>

                    <div className="medicine-field">
                      <label htmlFor="medicine-category">Category</label>
                      <select
                        id="medicine-category"
                        value={medicineCategory}
                        onChange={(e) => setMedicineCategory(e.target.value)}
                      >
                        <option value="all">All categories</option>
                        {availableCategories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>

                    <div className="medicine-field">
                      <label htmlFor="medicine-status">Availability</label>
                      {/* ⚠️ The words come from MEDICINE_STATUS, the map
                          the badges below already read, so the filter and
                          the badge beside it cannot say different things.
                          The VALUES are the stored ones, which is what
                          the filter compares against. */}
                      <select
                        id="medicine-status"
                        value={medicineStatus}
                        onChange={(e) => setMedicineStatus(e.target.value)}
                      >
                        <option value="all">Any availability</option>
                        {Object.entries(MEDICINE_STATUS).map(([key, meta]) => (
                          <option key={key} value={key}>{meta.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Only offered when there is something to clear.
                        A control that does nothing is worse than no
                        control: it makes somebody doubt the one they
                        just used. */}
                    {isFiltered && (
                      <button
                        type="button"
                        className="medicine-clear-btn"
                        onClick={clearMedicineFilters}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {isFiltered && (
                    <p className="medicine-filtered-note" role="status">
                      Showing {filteredMedicines.length} of {statusCounts.total} medicines.
                    </p>
                  )}

                  {/* ⚠️ Two different empty states, because they are two
                      different facts. Telling somebody the list is empty
                      while a filter is applied is the one wrong thing
                      this card can say -- they would stop looking for a
                      medicine the health centre has. */}
                  {filteredMedicines.length === 0 ? (
                    <p className="medicine-empty">
                      No medicines match this search. Try a different name, or
                      clear the filters to see the whole list.
                    </p>
                  ) : medicinesByCategory.map(([category, items]) => (
                    <div key={category} className="medicine-group">
                      {/* A disclosure, not a heading with a click
                          handler: `aria-expanded` is what tells somebody
                          not looking at the arrow whether the group is
                          open, and `aria-controls` points at the list it
                          opens. */}
                      <h4 className="medicine-group-title">
                        <button
                          type="button"
                          className="medicine-group-toggle"
                          aria-expanded={!collapsedCategories[category]}
                          aria-controls={`medicine-group-${category.replace(/\W+/g, '-')}`}
                          onClick={() => toggleCategory(category)}
                        >
                          <span className="medicine-group-chevron" aria-hidden="true">
                            {collapsedCategories[category] ? '▸' : '▾'}
                          </span>
                          {category}
                          <span className="medicine-group-count">
                            {items.length} {items.length === 1 ? 'medicine' : 'medicines'}
                          </span>
                        </button>
                      </h4>
                      <ul
                        className="medicine-list"
                        id={`medicine-group-${category.replace(/\W+/g, '-')}`}
                        hidden={Boolean(collapsedCategories[category])}
                      >
                        {items.map((medicine) => {
                          const meta = statusOf(medicine.status)
                          return (
                            <li key={medicine.id} className="medicine-item">
                              <div className="medicine-item-main">
                                <span className="medicine-name">{medicine.name}</span>
                                {medicine.form && (
                                  <span className="medicine-form">{medicine.form}</span>
                                )}
                              </div>
                              {medicine.generic_name
                                && medicine.generic_name !== medicine.name && (
                                <span className="medicine-generic">{medicine.generic_name}</span>
                              )}
                              {medicine.notes && (
                                <span className="medicine-note">{medicine.notes}</span>
                              )}
                              <span
                                className={`medicine-badge ${meta.className}`}
                                title={meta.hint}
                              >
                                {meta.label}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Bakuna Events */}
            <div className="health-bakuna-card">
              <div className="health-card-header">
                <h3>💉 Bakuna & Health Events</h3>
              </div>

              {eventsLoading ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>Loading events...</p>
              ) : healthEvents.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#5f6775' }}>No health events yet.</p>
              ) : (
                <div className="bakuna-grid">
                  {healthEvents.map((event) => (
                    <div key={event.id} className="bakuna-card">
                      <div className="bakuna-card-date">
                        <div className="month">{event.event_month}</div>
                        <div className="day">{event.event_day}</div>
                      </div>
                      <div className="bakuna-card-body">
                        <h4>{event.title}</h4>
                        <p>{event.description}</p>
                        <span className="bakuna-target">{event.target_audience}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Health Tips */}
            <div className="health-tips-card">
              <div className="health-card-header">
                <h3><FaLightbulb style={{ color: '#d97706' }} /> Health Tips & Advisory</h3>
              </div>
              <div className="health-tips-grid">
                {healthTips.map((tip) => (
                  <div key={tip.id} className="health-tip-item">
                    <div className="health-tip-icon">{tip.icon}</div>
                    <div className="health-tip-info">
                      <h4>{tip.title}</h4>
                      <p>{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="health-quicklinks-card">
              <h3>Quick Links</h3>
              <div className="quicklinks-grid">
                <a href="/announcements" className="quicklink-item">
                  <div className="quicklink-icon quicklink-blue">
                    <FaBullhorn />
                  </div>
                  <div className="quicklink-info">
                    <h4>Announcements</h4>
                    <p>Latest barangay news and advisories</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
                <a href="/reservation" className="quicklink-item">
                  <div className="quicklink-icon quicklink-green">
                    <FaCalendarAlt />
                  </div>
                  <div className="quicklink-info">
                    <h4>Court Reservation</h4>
                    <p>Book the barangay sports court</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
                <a href="/officials" className="quicklink-item">
                  <div className="quicklink-icon quicklink-navy">
                    <FaGavel />
                  </div>
                  <div className="quicklink-info">
                    <h4>Officials</h4>
                    <p>Meet your barangay officials</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  )
}

export default HealthCenter