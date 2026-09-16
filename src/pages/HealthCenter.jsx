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
import { MEDICINE_CATEGORIES, statusOf } from '../constants/medicines'
import { BARANGAY_CONTACT, telHref } from '../constants/barangay'
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

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const HealthCenter = () => {
  const [healthEvents, setHealthEvents] = useState([])
  const [loadingNurse, setLoadingNurse] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [nurseStatus, setNurseStatus] = useState('unavailable')
  const [weekSchedule, setWeekSchedule] = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [medicines, setMedicines] = useState([])
  const [medicinesLoading, setMedicinesLoading] = useState(true)

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
      const { data, error } = await supabase
        .from('nurse_availability')
        .select('day_of_week, time_start, time_end, status')

      if (!error) {
        const sorted = (data || []).sort(
          (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
        )
        setWeekSchedule(sorted)
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

  // Grouped in the order the categories are declared, so the list reads
  // the same way every visit rather than reshuffling as stock changes.
  const medicinesByCategory = useMemo(() => {
    const groups = new Map()
    medicines.forEach((medicine) => {
      const key = MEDICINE_CATEGORIES.includes(medicine.category)
        ? medicine.category
        : 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(medicine)
    })
    return MEDICINE_CATEGORIES
      .filter((category) => groups.has(category))
      .map((category) => [category, groups.get(category)])
  }, [medicines])

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
  const todaySchedule = weekSchedule.find((d) => d.day_of_week === today) || null

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
            <h3>
                <a href={telHref(BARANGAY_CONTACT.landline)}>{BARANGAY_CONTACT.landline}</a>
              </h3>
              <h3 style={{ fontSize: '0.95em' }}>
                <a href={telHref(BARANGAY_CONTACT.mobile)}>{BARANGAY_CONTACT.mobile}</a>
              </h3>
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
                <div className="health-status-dot"></div>
                On-Duty Status
              </h4>

              {loadingNurse ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</p>
              ) : (
                <>
                  {/* Maria Elena — live from nurse_availability table */}
                  <div className="health-nurse-item">
                    <div className="health-nurse-avatar">
                      <FaUserNurse />
                    </div>
                    <div className="health-nurse-info">
                      <h5>Maria Elena R. Santos, RN</h5>
                      <p>Public Health Nurse</p>
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
              <h4>Clinic Hours</h4>

              {/* The one line a resident standing outside actually
                  needs. Shown above the week, because "are they open
                  right now" beats "what are Thursday's hours". */}
              {onBreakNow && (
                <div className="clinic-break-now">
                  <strong>On lunch break right now.</strong>{' '}
                  {onScheduledBreak && todaySchedule?.break_end
                    ? `The clinic reopens at ${formatTime(todaySchedule.break_end)}.`
                    : 'The nurse has stepped out — please come back shortly.'}
                </div>
              )}

              {loadingSchedule ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</p>
              ) : weekSchedule.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  Clinic hours have not been set yet.
                </p>
              ) : (
                weekSchedule.map((day) => {
                  const isToday = day.day_of_week === today
                  const open = day.status === 'available' && day.time_start && day.time_end
                  const hasBreak = Boolean(day.break_start && day.break_end)

                  return (
                    <div
                      className={`clinic-hours-item ${isToday ? 'is-today' : ''}`}
                      key={day.day_of_week}
                    >
                      <span className="clinic-hours-day">
                        {day.day_of_week}
                        {isToday && <span className="clinic-today-tag">Today</span>}
                      </span>

                      {open ? (
                        <span className="clinic-hours-time">
                          {/* Split into two blocks rather than one range,
                              so the closed hour is visible instead of
                              implied. */}
                          {hasBreak ? (
                            <>
                              <span className="clinic-hours-block">
                                {formatTime(day.time_start)} – {formatTime(day.break_start)}
                              </span>
                              <span className="clinic-hours-block">
                                {formatTime(day.break_end)} – {formatTime(day.time_end)}
                              </span>
                              <span className="clinic-hours-break">
                                Lunch {formatTime(day.break_start)} – {formatTime(day.break_end)}
                              </span>
                            </>
                          ) : (
                            <span className="clinic-hours-block">
                              {formatTime(day.time_start)} – {formatTime(day.time_end)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="clinic-hours-closed">
                          {day.status === 'on-leave' ? 'On Leave' : 'Closed'}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Walk-in vs Appointment */}
            <div className="health-visit-card">
              <h4><MdPersonSearch /> How to Visit</h4>
              <div className="visit-option">
                <div className="visit-option-icon visit-walkin">
                  <FaWalking />
                </div>
                <div className="visit-option-info">
                  <h5>Walk-in</h5>
                  <p>For consultations, first aid, and minor injuries. Served on a first-come, first-served basis.</p>
                </div>
              </div>
              <div className="visit-divider">or</div>
              <div className="visit-option">
                <div className="visit-option-icon visit-appointment">
                  <MdOutlineEventAvailable />
                </div>
                <div className="visit-option-info">
                  <h5>Prior Notice</h5>
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
                <h4>💊 Medicine Availability</h4>
                {lastUpdated && (
                  <span className="medicine-updated">Updated {lastUpdated}</span>
                )}
              </div>

              {medicinesLoading ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>Loading medicines...</p>
              ) : medicines.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  The medicine list has not been published yet.
                </p>
              ) : (
                <>
                  <p className="medicine-disclaimer">
                    Stock changes through the day. This shows what the health
                    center had when the nurse last updated it — please confirm at
                    the counter before relying on it.
                  </p>

                  {medicinesByCategory.map(([category, items]) => (
                    <div key={category} className="medicine-group">
                      <h5 className="medicine-group-title">{category}</h5>
                      <ul className="medicine-list">
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
                <h4>💉 Bakuna & Health Events</h4>
              </div>

              {eventsLoading ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>Loading events...</p>
              ) : healthEvents.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>No health events yet.</p>
              ) : (
                <div className="bakuna-grid">
                  {healthEvents.map((event) => (
                    <div key={event.id} className="bakuna-card">
                      <div className="bakuna-card-date">
                        <div className="month">{event.event_month}</div>
                        <div className="day">{event.event_day}</div>
                      </div>
                      <div className="bakuna-card-body">
                        <h5>{event.title}</h5>
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
                <h4><FaLightbulb style={{ color: '#d97706' }} /> Health Tips & Advisory</h4>
              </div>
              <div className="health-tips-grid">
                {healthTips.map((tip) => (
                  <div key={tip.id} className="health-tip-item">
                    <div className="health-tip-icon">{tip.icon}</div>
                    <div className="health-tip-info">
                      <h5>{tip.title}</h5>
                      <p>{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="health-quicklinks-card">
              <h4>Quick Links</h4>
              <div className="quicklinks-grid">
                <a href="/announcements" className="quicklink-item">
                  <div className="quicklink-icon quicklink-blue">
                    <FaBullhorn />
                  </div>
                  <div className="quicklink-info">
                    <h5>Announcements</h5>
                    <p>Latest barangay news and advisories</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
                <a href="/reservation" className="quicklink-item">
                  <div className="quicklink-icon quicklink-green">
                    <FaCalendarAlt />
                  </div>
                  <div className="quicklink-info">
                    <h5>Court Reservation</h5>
                    <p>Book the barangay sports court</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
                <a href="/officials" className="quicklink-item">
                  <div className="quicklink-icon quicklink-navy">
                    <FaGavel />
                  </div>
                  <div className="quicklink-info">
                    <h5>Officials</h5>
                    <p>Meet your barangay officials</p>
                  </div>
                  <FaChevronRight className="quicklink-arrow" />
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default HealthCenter