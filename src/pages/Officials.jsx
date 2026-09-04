import { useEffect, useState } from 'react'
import {
  FaUserTie,
  FaUserNurse,
  FaUser,
} from 'react-icons/fa'
import { MdVerified } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { PersonAvatar } from '../utils/officialPhotos'
import './Officials.css'

// Health Department — Maria Elena Santos is the barangay's only nurse
const healthDept = [
  {
    id: 1,
    name: 'Maria Elena R. Santos, RN',
    role: 'Public Health Nurse',
    desc: 'Oversees local community immunization drives, maternal care programs, and clinical health tracking.',
    liveAvailability: true,
  },
]

const DAY_ORDER = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5,
}

const getIcon = (position) => {
  if (position === 'Punong Barangay') return <FaUserTie />
  if (position === 'SK Chairperson') return <FaUser />
  return <FaUserTie />
}

const Officials = () => {
  const [officials, setOfficials] = useState([])
  const [schedule, setSchedule] = useState([])
  const [nurseStatus, setNurseStatus] = useState(null)
  const [kapitanStatus, setKapitanStatus] = useState('available')
  const [loadingOfficials, setLoadingOfficials] = useState(true)
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [loadingNurse, setLoadingNurse] = useState(true)

  useEffect(() => {
    fetchOfficials()
    fetchSchedule()
    fetchNurseAvailability()
    fetchKapitanStatus()
  }, [])

  const fetchOfficials = async () => {
    try {
      const { data, error } = await supabase
        .from('barangay_officials')
        .select('*')
        .order('display_order', { ascending: true })
      if (!error) setOfficials(data || [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoadingOfficials(false)
    }
  }

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('kapitan_availability')
        .select('*')
      if (!error) {
        const sorted = (data || []).sort(
          (a, b) =>
            (DAY_ORDER[a.day_of_week] || 99) -
            (DAY_ORDER[b.day_of_week] || 99)
        )
        setSchedule(sorted)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoadingSchedule(false)
    }
  }

  const fetchKapitanStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('kapitan_status')
        .select('status')
        .single()
      if (!error && data) setKapitanStatus(data.status)
    } catch (err) {
      console.error('Kapitan status error:', err)
    }
  }

  const fetchNurseAvailability = async () => {
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
  }

  const formatTime = (time) => {
    if (!time || time === '00:00') return null
    const [hour, minute] = time.split(':')
    const h = parseInt(hour)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${display}${minute !== '00' ? ':' + minute : ''}${suffix}`
  }

  const getScheduleDisplay = (day) => {
    if (day.status === 'on-field') return 'On Field'
    if (day.status === 'available') {
      const start = formatTime(day.time_start)
      const end = formatTime(day.time_end)
      if (start && end) return `${start}-${end}`
    }
    return 'Unavailable'
  }

  // Kapitan status badge config
  const kapitanStatusConfig = {
    'available': { label: 'Available', className: 'in-office' },
    'in-meeting': { label: 'In a Meeting', className: 'on-field' },
    'out-of-office': { label: 'Out of Office', className: 'on-field' },
    'on-leave': { label: 'On Leave', className: 'unavailable' },
  }
  const statusInfo = kapitanStatusConfig[kapitanStatus] || kapitanStatusConfig['available']

  const renderAvailabilityBadge = (person) => {
    if (person.liveAvailability) {
      if (loadingNurse) {
        return (
          <div className="health-badge health-badge-loading">
            Checking availability...
          </div>
        )
      }
      const isAvailable = nurseStatus === 'available'
      return (
        <div className={`health-badge ${isAvailable ? 'health-badge-available' : 'health-badge-unavailable'}`}>
          <span className={`health-badge-dot ${isAvailable ? 'dot-available' : 'dot-unavailable'}`}></span>
          {isAvailable ? 'Available Today' : 'Not Available Today'}
        </div>
      )
    }
    return (
      <div className="health-badge health-badge-available">
        <span className="health-badge-dot dot-available"></span>
        Available Today
      </div>
    )
  }

  const punong = officials.find((o) => o.position === 'Punong Barangay')
  const adminStaff = officials.filter(
    (o) => o.position === 'Barangay Secretary' || o.position === 'Barangay Treasurer'
  )
  const councilMembers = officials.filter(
    (o) => o.position === 'Kagawad' || o.position === 'SK Chairperson'
  )

  return (
    <div className="officials-page">
      <Navbar />

      {/* Hero */}
      <section className="officials-hero">
        <div className="officials-hero-container">
          <div>
            <h1>Kapitan's Office</h1>
            <p>
              Direct access to Punong Barangay's schedule and
              administrative availability. We promise transparency
              and resident-focused governance.
            </p>
          </div>
          <div className="officials-hero-badge available">
            <MdVerified />
            Official Portal
          </div>
        </div>
      </section>

      {/* Kapitan Card */}
      <section className="kapitan-section">
        <div className="kapitan-container">
          <div className="kapitan-card">
            <div className="kapitan-left">
              <div>
                {/* Live status badge from kapitan_status table */}
                <div className={`kapitan-status-badge ${statusInfo.className}`}>
                  <div className="kapitan-status-dot"></div>
                  {statusInfo.label}
                </div>
                <h2>Punong Barangay</h2>
                <h3>
                  {loadingOfficials
                    ? 'Loading...'
                    : punong?.full_name || 'Hon. Frankie Credo'}
                </h3>
                <p>Punong Barangay</p>
                <p className="kapitan-quote">
                  "Committed to serving every resident of Batinguel
                  with transparency and integrity."
                </p>
              </div>
            </div>

            <div className="kapitan-right">
              <h4>
                Consultation Schedule
              </h4>
              {loadingSchedule ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  Loading schedule...
                </p>
              ) : schedule.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  No schedule available.
                </p>
              ) : (
                <div className="consultation-schedule">
                  {schedule.map((day) => (
                    <div
                      key={day.id}
                      className={`schedule-day ${day.status === 'on-field' ? 'on-field' : 'available'}`}
                    >
                      <div className="schedule-day-name">
                        {day.day_of_week.slice(0, 3).toUpperCase()}
                      </div>
                      <div className="schedule-day-status">
                        {getScheduleDisplay(day)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Executive Council */}
      <section className="council-section">
        <div className="council-container">
          <h2 className="section-title">Executive Council</h2>
          <p className="section-subtitle">
            Meet the dedicated officials serving Barangay Batinguel
          </p>

          {loadingOfficials ? (
            <p style={{ fontSize: '14px', color: '#6b7280' }}>
              Loading officials...
            </p>
          ) : (
            <>
              {punong && (
                <div className="council-row-center">
                  <div className="council-card council-card-punong">
                    <div className="council-card-image">
                      <PersonAvatar
                        name={punong.full_name}
                        photoUrl={punong.photo_url}
                        fallbackIcon={<FaUserTie />}
                        className="council-card-photo"
                      />
                    </div>
                    <div className="council-card-body">
                      <div className="council-card-role">Punong Barangay</div>
                      <div className="council-card-name">{punong.full_name}</div>
                      <p className="council-card-desc">
                        Ready to help for all programs for our official.
                        Our official commitment to every resident with heart.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {adminStaff.length > 0 && (
                <div className="council-featured">
                  {adminStaff.map((official) => (
                    <div key={official.id} className="council-card">
                      <div className="council-card-image">
                        <PersonAvatar
                          name={official.full_name}
                          photoUrl={official.photo_url}
                          fallbackIcon={<FaUser />}
                          className="council-card-photo"
                        />
                      </div>
                      <div className="council-card-body">
                        <div className="council-card-role">{official.position}</div>
                        <div className="council-card-name">{official.full_name}</div>
                        <p className="council-card-desc">
                          {official.position === 'Barangay Secretary'
                            ? 'Manages all administrative documents and official records of the barangay.'
                            : 'Manages and oversees the financial affairs and funds of the barangay.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {councilMembers.length > 0 && (
                <div className="council-grid">
                  {councilMembers.map((member) => (
                    <div key={member.id} className="council-small-card">
                      <div className="council-small-avatar">
                        <PersonAvatar
                          name={member.full_name}
                          photoUrl={member.photo_url}
                          fallbackIcon={getIcon(member.position)}
                          className="council-small-photo"
                        />
                      </div>
                      <div className="council-small-name">{member.full_name}</div>
                      <div className="council-small-role">{member.position}</div>
                      {member.committee && (
                        <div className="council-small-role">{member.committee}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Health Department */}
      <section className="health-dept-section">
        <div className="health-dept-container">
          <h2 className="section-title">Health Department</h2>
          <p className="section-subtitle">
            Our dedicated health professionals serving the community
          </p>
          <div className="health-dept-grid">
            {healthDept.map((person) => (
              <div key={person.id} className="health-dept-card">
                <div className="health-dept-avatar">
                  <PersonAvatar
                    name={person.name}
                    fallbackIcon={<FaUserNurse />}
                    className="health-dept-photo"
                  />
                </div>
                <div className="health-dept-name">{person.name}</div>
                <div className="health-dept-role">{person.role}</div>
                <p className="health-dept-desc">{person.desc}</p>
                {renderAvailabilityBadge(person)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Officials