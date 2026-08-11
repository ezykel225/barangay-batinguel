import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
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

const HOURLY_RATE = 150
const MAX_DURATION = 4

const Reservation = () => {
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

  const totalAmount = Number(formData.duration_hours) * HOURLY_RATE

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

    if (error) throw error

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
        console.error('Slot recheck error:', recheckError)
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
          payment_reference: formData.payment_reference,
          payment_screenshot: paymentScreenshotUrl,
          payment_status: 'pending_verification',
          amount: totalAmount,
          discount_percentage: 0,
          discount_amount: 0,
          final_amount: totalAmount,
          residency_verification_status: 'not_required',
          status: 'pending',
        },
      ])

      if (error) {
        console.error('Insert reservation error:', error)
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
                    <p><strong>Hourly Rate:</strong> ₱{HOURLY_RATE}</p>
                    <p><strong>Duration:</strong> {formData.duration_hours} hour(s)</p>
                    <p><strong>Total Amount:</strong> ₱{totalAmount}</p>
                  </div>

                  <button type="submit" className="reservation-submit-btn">
                    Continue to Payment →
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
                    <h3>GCash Payment</h3>
                    <p><strong>Amount to Pay:</strong> ₱{totalAmount}</p>
                    <p><strong>GCash Number:</strong> 09XX XXX XXXX</p>
                    <p><strong>Account Name:</strong> Barangay Batinguel</p>

                    <div className="gcash-qr-box">
                      <img
                        src={gcashQr}
                        alt="GCash QR Code"
                        className="gcash-qr-image"
                      />
                      <p className="gcash-qr-text">
                        Scan this QR code using GCash to pay ₱{totalAmount}, then fill in the details below.
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Payment Reference Number</label>
                      <input
                        type="text"
                        name="payment_reference"
                        value={formData.payment_reference}
                        onChange={handleChange}
                        placeholder="Enter GCash reference number"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Upload Payment Screenshot</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePaymentFileChange}
                        required
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
              <h3>Available Time Slots</h3>
              <p className="slots-note">
                Pending and approved reservations hold their covered slots.
              </p>

              {!formData.preferred_date ? (
                <div className="slots-empty">
                  Please select a preferred date first.
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
                    <p><strong>Amount to Pay:</strong> ₱{totalAmount}</p>
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