import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import toast from 'react-hot-toast'
import gcashQr from '../assets/images/gcash-qr.jpg'
import './Reservation.css'

const timeSlots = [
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
]

const MAX_DURATION = 4

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const toDateString = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const Reservation = () => {
  const { user, role } = useAuth()
  const [formData, setFormData] = useState({
    full_name: '',
    purok: '',
    contact_number: '',
    email: '',
    residency_status: '',
    preferred_date: '',
    preferred_time: '',
    duration_hours: 1,
    purpose: '',
    additional_notes: '',
    payment_method: 'GCash',
    payment_reference: '',
  })

  const [paymentFile, setPaymentFile] = useState(null)
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetchingSlots, setFetchingSlots] = useState(false)
  const [showPaymentStep, setShowPaymentStep] = useState(false)

  // Availability calendar: shows which days in the visible month are
  // fully booked before the resident has to pick a date, instead of
  // making them guess and check one date at a time.
  const today = new Date()
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth())
  const [calendarYear, setCalendarYear] = useState(today.getFullYear())
  const [monthReservations, setMonthReservations] = useState([])

  const slotIndexMap = useMemo(() => {
    const map = {}
    timeSlots.forEach((slot, index) => {
      map[slot] = index
    })
    return map
  }, [])

  useEffect(() => {
    if (formData.preferred_date) {
      fetchReservationsByDate(formData.preferred_date)
    } else {
      setReservations([])
    }
  }, [formData.preferred_date])

  // Pre-fill the form for a logged-in resident so they don't have to
  // retype their own details. Anonymous/non-resident visitors are
  // completely unaffected — this only runs when a resident session
  // exists, and only fills fields the person hasn't already touched.
  useEffect(() => {
    if (role !== 'resident' || !user?.id) return

    const prefillFromProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, contact_number, purok')
        .eq('id', user.id)
        .single()

      if (data) {
        setFormData((prev) => ({
          ...prev,
          full_name: prev.full_name || data.full_name || '',
          contact_number: prev.contact_number || data.contact_number || '',
          purok: prev.purok || data.purok || '',
          email: prev.email || user.email || '',
        }))
      }
    }

    prefillFromProfile()
  }, [role, user])

  const fetchReservationsByDate = async (selectedDate) => {
    try {
      setFetchingSlots(true)

      const { data, error } = await supabase
        .rpc('get_reservation_slots', { p_date: selectedDate })

      if (error) {
        console.error('Fetch reservations by date error:', error)
        toast.error('Failed to fetch reservations.')
        return
      }

      setReservations(data || [])
    } catch (error) {
      console.error('Fetch reservations by date error:', error)
      toast.error('Something went wrong while loading slots.')
    } finally {
      setFetchingSlots(false)
    }
  }

  const getCoveredSlots = (startSlot, duration) => {
    const startIndex = slotIndexMap[startSlot]
    const slots = []

    if (startIndex === undefined) return slots

    for (let i = 0; i < Number(duration); i++) {
      const slot = timeSlots[startIndex + i]
      if (slot) {
        slots.push(slot)
      }
    }

    return slots
  }

  const reservedSlots = useMemo(() => {
    const taken = new Set()

    reservations.forEach((reservation) => {
      const coveredSlots = getCoveredSlots(
        reservation.preferred_time,
        reservation.duration_hours || 1
      )

      coveredSlots.forEach((slot) => taken.add(slot))
    })

    return taken
  }, [reservations, slotIndexMap])

  const selectedSlots = useMemo(() => {
    return getCoveredSlots(
      formData.preferred_time,
      formData.duration_hours
    )
  }, [formData.preferred_time, formData.duration_hours, slotIndexMap])

  const availableSlots = useMemo(() => {
    return timeSlots.filter((slot) => !reservedSlots.has(slot))
  }, [reservedSlots])

  // Fetch every held slot for the visible month in one request, so the
  // calendar can mark fully-booked days without one call per day.
  useEffect(() => {
    const fetchMonth = async () => {
      const start = toDateString(calendarYear, calendarMonth, 1)
      const lastDay = new Date(calendarYear, calendarMonth + 1, 0).getDate()
      const end = toDateString(calendarYear, calendarMonth, lastDay)

      const { data, error } = await supabase
        .rpc('get_reservation_slots_range', { p_start: start, p_end: end })

      if (error) {
        console.error('Fetch month availability error:', error)
        return
      }
      setMonthReservations(data || [])
    }

    fetchMonth()
  }, [calendarMonth, calendarYear])

  // How many of the day's slots are still open. A day counts as fully
  // booked only when every slot is held — partially booked days stay
  // selectable so people can still grab the remaining hours.
  const slotsTakenByDate = useMemo(() => {
    const map = {}
    monthReservations.forEach((res) => {
      const dateKey = res.preferred_date
      if (!map[dateKey]) map[dateKey] = new Set()

      const startIndex = timeSlots.indexOf(res.preferred_time)
      if (startIndex === -1) return
      for (let i = 0; i < Number(res.duration_hours || 1); i++) {
        const slot = timeSlots[startIndex + i]
        if (slot) map[dateKey].add(slot)
      }
    })
    return map
  }, [monthReservations])

  const calendarDays = useMemo(() => {
    const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay()
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    const cells = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateString(calendarYear, calendarMonth, day)
      const taken = slotsTakenByDate[dateStr]?.size || 0
      const isPast = new Date(calendarYear, calendarMonth, day) < todayMidnight
      cells.push({
        day,
        dateStr,
        isPast,
        isFull: taken >= timeSlots.length,
        remaining: timeSlots.length - taken,
      })
    }
    return cells
  }, [calendarYear, calendarMonth, slotsTakenByDate])

  const goToPreviousMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11)
      setCalendarYear((y) => y - 1)
    } else {
      setCalendarMonth((m) => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0)
      setCalendarYear((y) => y + 1)
    } else {
      setCalendarMonth((m) => m + 1)
    }
  }

  const handleCalendarDayClick = (cell) => {
    if (!cell || cell.isPast || cell.isFull) return
    setFormData((prev) => ({
      ...prev,
      preferred_date: cell.dateStr,
      preferred_time: '',
    }))
  }

  const calculatedEndTime = useMemo(() => {
    if (!selectedSlots.length) return ''
    return selectedSlots[selectedSlots.length - 1]
  }, [selectedSlots])

  const canFitDuration = (startSlot, duration) => {
    const startIndex = slotIndexMap[startSlot]
    if (startIndex === undefined) return false

    const lastIndex = startIndex + Number(duration) - 1
    return lastIndex < timeSlots.length
  }

  const hasConflict = (startSlot, duration) => {
    const slotsToCheck = getCoveredSlots(startSlot, duration)

    if (slotsToCheck.length !== Number(duration)) return true

    return slotsToCheck.some((slot) => reservedSlots.has(slot))
  }

  const handleChange = (e) => {
    const { name, value } = e.target

    if (name === 'preferred_date') {
      setFormData((prev) => ({
        ...prev,
        preferred_date: value,
        preferred_time: '',
      }))
      return
    }

    if (name === 'duration_hours') {
      setFormData((prev) => ({
        ...prev,
        duration_hours: Number(value),
        preferred_time: '',
      }))
      return
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleTimeSelect = (slot) => {
    if (showPaymentStep) return
    if (!canFitDuration(slot, formData.duration_hours)) {
      toast.error('Selected duration does not fit in the available schedule.')
      return
    }

    if (hasConflict(slot, formData.duration_hours)) {
      toast.error('One or more selected time slots are already reserved.')
      return
    }

    setFormData((prev) => ({
      ...prev,
      preferred_time: slot,
    }))
  }

  const handlePaymentFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) setPaymentFile(file)
  }

  const uploadFile = async (bucketName, file, folderName) => {
    if (!file) return null

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}.${fileExt}`

    const filePath = `${folderName}/${fileName}`

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file)

    if (error) {
      // A failed upload here is almost always: the storage bucket
      // named `reservation-payments` doesn't exist yet, or its policy
      // doesn't allow anon/public uploads. Check the console for which.
      console.error('Payment screenshot upload error:', error)
      throw error
    }

    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  // Step 1 -> Step 2. The GCash QR code is only revealed here, once the
  // reservation details are valid, instead of being shown on page load.
  const handleContinueToPayment = () => {
    if (!formData.full_name || !formData.purok || !formData.contact_number || !formData.email) {
      toast.error('Please fill in all your contact details.')
      return
    }
    if (!formData.residency_status) {
      toast.error('Please select your residency status.')
      return
    }
    if (!formData.preferred_date) {
      toast.error('Please select a date.')
      return
    }
    if (!formData.preferred_time) {
      toast.error('Please select a start time.')
      return
    }
    if (!formData.purpose) {
      toast.error('Please tell us the purpose of your reservation.')
      return
    }
    if (!canFitDuration(formData.preferred_time, formData.duration_hours)) {
      toast.error('Selected duration does not fit in the available schedule.')
      return
    }
    if (hasConflict(formData.preferred_time, formData.duration_hours)) {
      toast.error('One or more selected time slots are already reserved.')
      return
    }
    setShowPaymentStep(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.preferred_date || !formData.preferred_time) {
      toast.error('Please go back and select a date and time.')
      return
    }

    if (!canFitDuration(formData.preferred_time, formData.duration_hours)) {
      toast.error('Selected duration does not fit in the available schedule.')
      return
    }

    if (hasConflict(formData.preferred_time, formData.duration_hours)) {
      toast.error('One or more selected time slots are already reserved.')
      return
    }

    if (!paymentFile) {
      toast.error('Please upload your payment screenshot.')
      return
    }

    if (!formData.payment_reference) {
      toast.error('Please enter your GCash reference number.')
      return
    }

    try {
      setLoading(true)

      // Re-check for conflicts right before submitting. This narrows
      // (but does not eliminate) the race window where two people could
      // submit for the same slot at nearly the same time — a database-level
      // uniqueness constraint on (preferred_date, preferred_time) is the
      // only way to fully prevent that. See the project README/notes.
      const { data: latestReservations, error: recheckError } = await supabase
        .rpc('get_reservation_slots', { p_date: formData.preferred_date })

      if (recheckError) {
        // If this fires, it usually means the get_reservation_slots RPC
        // function doesn't exist in the connected Supabase project, or
        // anon/public access to it is blocked — check the message below.
        console.error('Slot recheck error:', {
          message: recheckError.message,
          details: recheckError.details,
          hint: recheckError.hint,
          code: recheckError.code,
        })
        toast.error('Could not verify slot availability. Please try again.')
        setLoading(false)
        return
      }

      const stillConflicts = (latestReservations || []).some((reservation) => {
        const covered = getCoveredSlots(
          reservation.preferred_time,
          reservation.duration_hours || 1
        )
        return covered.includes(formData.preferred_time)
          ? true
          : getCoveredSlots(formData.preferred_time, formData.duration_hours).some(
              (slot) => covered.includes(slot)
            )
      })

      if (stillConflicts) {
        toast.error(
          'That slot was just booked by someone else. Please pick another time.'
        )
        setLoading(false)
        fetchReservationsByDate(formData.preferred_date)
        return
      }

      const paymentScreenshotUrl = await uploadFile(
        'reservation-payments',
        paymentFile,
        'proofs'
      )

      const { error } = await supabase.from('reservations').insert([
        {
          full_name: formData.full_name,
          purok: formData.purok,
          contact_number: formData.contact_number,
          email: formData.email,
          residency_status: formData.residency_status,
          preferred_date: formData.preferred_date,
          preferred_time: formData.preferred_time,
          end_time: calculatedEndTime,
          duration_hours: Number(formData.duration_hours),
          purpose: formData.purpose,
          additional_notes: formData.additional_notes,
          payment_method: formData.payment_method,
          payment_reference: formData.payment_reference || null,
          payment_screenshot: paymentScreenshotUrl,
          // Nothing was required, so only mark as "pending verification"
          // if they actually indicated a donation — otherwise this is a
          // plain free reservation with no donation, not something
          // awaiting anyone's review.
          payment_status: (paymentScreenshotUrl || formData.payment_reference) ? 'pending_verification' : 'unpaid',
          // Amount is left at 0 rather than assuming a rate: the donation
          // is voluntary, no fixed figure is shown to the resident
          // anymore, and it may be in-kind rather than cash. The
          // Treasurer records the actual value when they verify the
          // proof, instead of the system inventing a number.
          amount: 0,
          discount_percentage: 0,
          discount_amount: 0,
          final_amount: 0,
          residency_verification_status: 'not_required',
          status: 'pending',
          // Only set for a logged-in resident so they can see this
          // booking under "My Reservations" — null for anonymous/
          // walk-in bookings, which keep working exactly as before.
          resident_id: role === 'resident' ? user?.id ?? null : null,
        },
      ])

      if (error) {
        // Logged in full (message/details/hint/code) because a failed
        // insert here is almost always a schema or RLS mismatch between
        // this form and the live reservations table — the browser
        // console is the fastest way to see which column or policy
        // rejected it.
        console.error('Insert reservation error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        toast.error(error.message || 'Failed to submit reservation.')
        return
      }

      toast.success(
        'Reservation submitted successfully. It is now pending verification.'
      )

      setFormData({
        full_name: '',
        purok: '',
        contact_number: '',
        email: '',
        residency_status: '',
        preferred_date: '',
        preferred_time: '',
        duration_hours: 1,
        purpose: '',
        additional_notes: '',
        payment_method: 'GCash',
        payment_reference: '',
      })

      setPaymentFile(null)
      setReservations([])
      setShowPaymentStep(false)
    } catch (error) {
      console.error('Submit reservation error:', error)
      toast.error(error.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="reservation-page">
      <Navbar />

      <section className="reservation-hero">
        <div className="reservation-hero-content">
          <span className="reservation-badge">
            🏛️ Barangay Batinguel E-Processing
          </span>
          <h1>Covered Court Reservation</h1>
          <p>
            Reserve the covered court by selecting a date, start time, and
            duration.
          </p>
        </div>
      </section>

      <section className="reservation-section">
        <div className="reservation-container">
          <div className="reservation-header">
            <h2>Court Reservation Form</h2>
            <p>
              {showPaymentStep
                ? 'Step 2 of 2 — complete your GCash payment to confirm your booking.'
                : 'Step 1 of 2 — fill in your details and pick a time slot.'}
            </p>
          </div>

          <div className="reservation-grid">
            <div className="reservation-form-card">
              {!showPaymentStep ? (
                <form
                  className="reservation-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleContinueToPayment()
                  }}
                >
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Purok</label>
                    <input
                      type="text"
                      name="purok"
                      value={formData.purok}
                      onChange={handleChange}
                      placeholder="Enter your purok"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Number</label>
                    <input
                      type="text"
                      name="contact_number"
                      value={formData.contact_number}
                      onChange={handleChange}
                      placeholder="09XXXXXXXXX"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Enter your email"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Residency Status</label>
                    <select
                      name="residency_status"
                      value={formData.residency_status}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select status</option>
                      <option value="resident">Resident</option>
                      <option value="non-resident">Non-Resident</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Purpose</label>
                    <input
                      type="text"
                      name="purpose"
                      value={formData.purpose}
                      onChange={handleChange}
                      placeholder="Purpose of reservation"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Date</label>
                    <input
                      type="date"
                      name="preferred_date"
                      value={formData.preferred_date}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Duration (Hours)</label>
                    <select
                      name="duration_hours"
                      value={formData.duration_hours}
                      onChange={handleChange}
                      required
                    >
                      {[1, 2, 3, 4].map((hour) => (
                        <option key={hour} value={hour}>
                          {hour} Hour{hour > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Additional Notes</label>
                    <textarea
                      name="additional_notes"
                      value={formData.additional_notes}
                      onChange={handleChange}
                      placeholder="Optional notes"
                      rows="4"
                    />
                  </div>

                  <div className="payment-box">
                    <p style={{ fontStyle: 'italic', color: '#374151', marginBottom: 8 }}>
                      "Ang tunay na yaman ay hindi sa kung ano ang natatanggap,
                      kundi sa kung ano ang naibabahagi."
                    </p>
                    <p style={{ fontSize: 13, color: '#6b7280' }}>
                      This covered court is free to use. Any donation — big or small,
                      in cash or in kind — helps keep it clean and well-maintained for
                      every family in the barangay. Giving is completely optional and
                      won't affect whether your reservation is approved.
                    </p>
                  </div>

                  <button type="submit" className="reservation-submit-btn">
                    Continue →
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="reservation-form">
                  <div className="selected-slot-box" style={{ marginBottom: 16 }}>
                    <h4>Your Reservation Details</h4>
                    <p><strong>Name:</strong> {formData.full_name}</p>
                    <p><strong>Date:</strong> {formData.preferred_date}</p>
                    <p><strong>Time:</strong> {formData.preferred_time} ({formData.duration_hours}h)</p>
                    <p><strong>Purpose:</strong> {formData.purpose}</p>
                  </div>

                  <div className="payment-box">
                    <h3>Optional Donation</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                      This court is free to reserve. If you'd like to support its
                      upkeep, any donation — cash via GCash, or something in kind —
                      is appreciated but entirely optional. You can skip this and
                      submit your reservation as-is.
                    </p>
                    <p><strong>GCash Number:</strong> 09XX XXX XXXX</p>
                    <p><strong>Account Name:</strong> Barangay Batinguel</p>

                    <div className="gcash-qr-box">
                      <img
                        src={gcashQr}
                        alt="GCash QR Code"
                        className="gcash-qr-image"
                      />
                      <p className="gcash-qr-text">
                        If donating via GCash, you can scan this QR code, then fill
                        in the details below. Not donating? Just leave these blank.
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Donation Details (optional)</label>
                      <input
                        type="text"
                        name="payment_reference"
                        value={formData.payment_reference}
                        onChange={handleChange}
                        placeholder="GCash reference number, or describe an in-kind donation (e.g. snacks, cleaning supplies)"
                      />
                    </div>

                    <div className="form-group">
                      <label>Upload Proof (optional, if donating via GCash)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePaymentFileChange}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      className="reservation-submit-btn"
                      style={{ background: '#6b7280' }}
                      onClick={() => setShowPaymentStep(false)}
                    >
                      ← Back to Details
                    </button>
                    <button
                      type="submit"
                      className="reservation-submit-btn"
                      disabled={loading}
                    >
                      {loading ? 'Submitting...' : 'Submit Reservation'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="reservation-slots-card">
              <h3>Check Availability</h3>
              <p className="slots-note">
                Grayed-out dates are fully booked. Pick an open date to see its time slots.
              </p>

              <div className="availability-calendar">
                <div className="calendar-header">
                  <button type="button" onClick={goToPreviousMonth} className="calendar-nav-btn">‹</button>
                  <span className="calendar-month-label">
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </span>
                  <button type="button" onClick={goToNextMonth} className="calendar-nav-btn">›</button>
                </div>

                <div className="calendar-weekdays">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <div key={d} className="calendar-weekday">{d}</div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {calendarDays.map((cell, idx) => {
                    if (!cell) return <div key={`empty-${idx}`} className="calendar-cell empty" />
                    const isSelected = formData.preferred_date === cell.dateStr
                    const unavailable = cell.isPast || cell.isFull
                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        className={`calendar-cell
                          ${unavailable ? 'unavailable' : ''}
                          ${isSelected ? 'selected' : ''}
                          ${!unavailable && cell.remaining < timeSlots.length ? 'partial' : ''}`}
                        onClick={() => handleCalendarDayClick(cell)}
                        disabled={unavailable}
                        title={
                          cell.isPast ? 'Past date'
                            : cell.isFull ? 'Fully booked'
                              : `${cell.remaining} slot${cell.remaining === 1 ? '' : 's'} available`
                        }
                      >
                        {cell.day}
                      </button>
                    )
                  })}
                </div>

                <div className="calendar-legend">
                  <span><i className="legend-dot legend-open" /> Open</span>
                  <span><i className="legend-dot legend-partial" /> Partly booked</span>
                  <span><i className="legend-dot legend-full" /> Fully booked</span>
                </div>
              </div>

              <h3 style={{ marginTop: 24 }}>Available Time Slots</h3>
              <p className="slots-note">
                Pending and approved reservations hold their covered slots.
              </p>

              {!formData.preferred_date ? (
                <div className="slots-empty">
                  Select a date above to see its time slots.
                </div>
              ) : fetchingSlots ? (
                <div className="slots-empty">
                  Loading available slots...
                </div>
              ) : (
                <>
                  <div className="slots-grid">
                    {timeSlots.map((slot) => {
                      const isReserved = reservedSlots.has(slot)
                      const isSelected = selectedSlots.includes(slot)

                      return (
                        <button
                          key={slot}
                          type="button"
                          className={`slot-btn ${isReserved ? 'reserved' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleTimeSelect(slot)}
                          disabled={isReserved || showPaymentStep}
                        >
                          {slot}
                          <span className="slot-status">
                            {isReserved ? 'Reserved' : 'Available'}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="slot-legend">
                    <div className="legend-item">
                      <span className="legend-box available"></span>
                      Available
                    </div>
                    <div className="legend-item">
                      <span className="legend-box selected"></span>
                      Selected
                    </div>
                    <div className="legend-item">
                      <span className="legend-box reserved"></span>
                      Reserved
                    </div>
                  </div>

                  <div className="selected-slot-box">
                    <h4>Your Preferred Schedule</h4>
                    <p><strong>Date:</strong> {formData.preferred_date || 'Not selected'}</p>
                    <p><strong>Start Time:</strong> {formData.preferred_time || 'Not selected'}</p>
                    <p><strong>Covered Slots:</strong> {selectedSlots.length ? selectedSlots.join(', ') : 'Not selected'}</p>
                    <p><strong>Last Covered Slot:</strong> {calculatedEndTime || 'Not selected'}</p>
                  </div>

                  {availableSlots.length === 0 && (
                    <div className="no-slots-box">
                      No available time slots for this date. Please choose another date.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Reservation