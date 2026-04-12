import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FaCheckCircle,
  FaInfoCircle,
  FaCalendarAlt,
  FaClock,
  FaMapMarkerAlt,
  FaMoneyBillWave,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
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
]

const Reservation = () => {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    full_name: '',
    purok: '',
    contact_number: '',
    email: '',
    residency_status: 'resident',
    preferred_date: '',
    preferred_time: '',
    purpose: '',
    additional_notes: '',
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleResidency = (status) => {
    setFormData({
      ...formData,
      residency_status: status,
    })
  }

  const handleTimeSlot = (time) => {
    setFormData({
      ...formData,
      preferred_time: time,
    })
  }

  const handleNext = () => {
    if (step === 1) {
      if (!formData.full_name ||
        !formData.purok ||
        !formData.contact_number) {
        toast.error('Please fill in all required fields!')
        return
      }
    }
    if (step === 2) {
      if (!formData.preferred_date ||
        !formData.preferred_time ||
        !formData.purpose) {
        toast.error('Please fill in all required fields!')
        return
      }
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase
        .from('reservations')
        .insert([{
          full_name: formData.full_name,
          purok: formData.purok,
          contact_number: formData.contact_number,
          email: formData.email,
          residency_status: formData.residency_status,
          preferred_date: formData.preferred_date,
          preferred_time: formData.preferred_time,
          purpose: formData.purpose,
          additional_notes: formData.additional_notes,
          status: 'pending',
        }])

      if (error) throw error

      setSuccess(true)
      toast.success('Reservation submitted successfully!')
    } catch (error) {
      toast.error('Failed to submit reservation!')
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="reservation-page">

      {/* Navbar */}
      <Navbar />

      {/* Hero */}
      <section className="reservation-hero">
        <div className="reservation-hero-container">
          <h1>Court Reservation</h1>
          <p>
            Secure your slot at the Barangay
            Community Court. Our modern facilities
            are available for residents and visitors.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="reservation-main">
        <div className="reservation-main-container">

          {/* Form Card */}
          <div className="reservation-form-card">

            {success ? (
              /* Success Message */
              <div className="reservation-success">
                <div className="reservation-success-icon">
                  <FaCheckCircle />
                </div>
                <h3>Reservation Submitted!</h3>
                <p>
                  Your reservation has been submitted
                  successfully. Please wait for the
                  barangay official to approve your
                  request. You will be notified
                  through your contact number.
                </p>
                <Link to="/" className="btn-home">
                  Back to Home
                </Link>
              </div>
            ) : (
              <>
                {/* Steps Indicator */}
                <div className="reservation-steps">
                  <div className="step-item">
                    <div className={`step-circle 
                      ${step > 1 ? 'completed' : 
                        step === 1 ? 'active' : ''}`}>
                      {step > 1 ? '✓' : '1'}
                    </div>
                    <span className={`step-label 
                      ${step === 1 ? 'active' : 
                        step > 1 ? 'completed' : ''}`}>
                      Personal Info
                    </span>
                  </div>
                  <div className={`step-divider 
                    ${step > 1 ? 'completed' : ''}`}>
                  </div>
                  <div className="step-item">
                    <div className={`step-circle 
                      ${step > 2 ? 'completed' : 
                        step === 2 ? 'active' : ''}`}>
                      {step > 2 ? '✓' : '2'}
                    </div>
                    <span className={`step-label 
                      ${step === 2 ? 'active' : 
                        step > 2 ? 'completed' : ''}`}>
                      Schedule
                    </span>
                  </div>
                  <div className={`step-divider 
                    ${step > 2 ? 'completed' : ''}`}>
                  </div>
                  <div className="step-item">
                    <div className={`step-circle 
                      ${step === 3 ? 'active' : ''}`}>
                      3
                    </div>
                    <span className={`step-label 
                      ${step === 3 ? 'active' : ''}`}>
                      Review
                    </span>
                  </div>
                </div>

                {/* Step 1 - Personal Info */}
                {step === 1 && (
                  <div>
                    <h3 className="form-section-title">
                      Personal Information
                    </h3>

                    {/* Payment Notice */}
                    <div className="payment-notice">
                      <div className="payment-notice-icon">
                        <FaInfoCircle />
                      </div>
                      <p>
                        <strong>
                          Face-to-Face Payment Policy
                        </strong>
                        Approved reservations are
                        temporarily held for 24 hours.
                        You must present your Resident ID
                        and complete payment at the
                        Barangay Hall.
                      </p>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label>Full Name *</label>
                        <input
                          type="text"
                          name="full_name"
                          placeholder="Enter your full name"
                          value={formData.full_name}
                          onChange={handleChange}
                          className="form-input"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Purok *</label>
                        <select
                          name="purok"
                          value={formData.purok}
                          onChange={handleChange}
                          className="form-select"
                          required>
                          <option value="">
                            Select Purok
                          </option>
                          <option value="Purok 1">
                            Purok 1
                          </option>
                          <option value="Purok 2">
                            Purok 2
                          </option>
                          <option value="Purok 3">
                            Purok 3
                          </option>
                          <option value="Purok 4">
                            Purok 4
                          </option>
                          <option value="Purok 5">
                            Purok 5
                          </option>
                          <option value="Purok 6">
                            Purok 6
                          </option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Contact Number *</label>
                        <input
                          type="text"
                          name="contact_number"
                          placeholder="09XX-XXX-XXXX"
                          value={formData.contact_number}
                          onChange={handleChange}
                          className="form-input"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          name="email"
                          placeholder="your@email.com"
                          value={formData.email}
                          onChange={handleChange}
                          className="form-input"
                        />
                      </div>

                      <div className="form-group full-width">
                        <label>Residency Status *</label>
                        <div className="residency-options">
                          <button
                            type="button"
                            className={`residency-btn 
                              ${formData.residency_status
                                === 'resident'
                                ? 'active' : ''}`}
                            onClick={() =>
                              handleResidency('resident')}>
                            ✅ Resident
                          </button>
                          <button
                            type="button"
                            className={`residency-btn 
                              ${formData.residency_status
                                === 'non-resident'
                                ? 'active' : ''}`}
                            onClick={() =>
                              handleResidency('non-resident')}>
                            Non-Resident
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="form-buttons">
                      <button
                        type="button"
                        className="btn-next"
                        onClick={handleNext}>
                        Next Step →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2 - Schedule */}
                {step === 2 && (
                  <div>
                    <h3 className="form-section-title">
                      Preferred Date & Time
                    </h3>

                    <div className="form-grid">
                      <div className="form-group full-width">
                        <label>Preferred Date *</label>
                        <input
                          type="date"
                          name="preferred_date"
                          value={formData.preferred_date}
                          onChange={handleChange}
                          className="form-input"
                          min={new Date()
                            .toISOString()
                            .split('T')[0]}
                          required
                        />
                      </div>

                      <div className="form-group full-width">
                        <label>Preferred Time *</label>
                        <div className="time-slots">
                          {timeSlots.map((time) => (
                            <button
                              key={time}
                              type="button"
                              className={`time-slot-btn 
                                ${formData.preferred_time
                                  === time
                                  ? 'active' : ''}`}
                              onClick={() =>
                                handleTimeSlot(time)}>
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="form-group full-width">
                        <label>Purpose of Reservation *</label>
                        <input
                          type="text"
                          name="purpose"
                          placeholder="e.g. Basketball Practice, Barangay Tournament"
                          value={formData.purpose}
                          onChange={handleChange}
                          className="form-input"
                          required
                        />
                      </div>

                      <div className="form-group full-width">
                        <label>Additional Notes</label>
                        <textarea
                          name="additional_notes"
                          placeholder="Any additional information..."
                          value={formData.additional_notes}
                          onChange={handleChange}
                          className="form-textarea"
                        />
                      </div>
                    </div>

                    <div className="form-buttons">
                      <button
                        type="button"
                        className="btn-back"
                        onClick={handleBack}>
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="btn-next"
                        onClick={handleNext}>
                        Next Step →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3 - Review */}
                {step === 3 && (
                  <div>
                    <h3 className="form-section-title">
                      Review Your Reservation
                    </h3>

                    <div className="review-section">
                      <h4>Personal Information</h4>
                      <div className="review-item">
                        <span className="review-item-label">
                          Full Name
                        </span>
                        <span className="review-item-value">
                          {formData.full_name}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Purok
                        </span>
                        <span className="review-item-value">
                          {formData.purok}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Contact Number
                        </span>
                        <span className="review-item-value">
                          {formData.contact_number}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Email
                        </span>
                        <span className="review-item-value">
                          {formData.email || 'N/A'}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Residency Status
                        </span>
                        <span className="review-item-value">
                          {formData.residency_status
                            === 'resident'
                            ? '✅ Resident'
                            : 'Non-Resident'}
                        </span>
                      </div>
                    </div>

                    <div className="review-section">
                      <h4>Schedule Details</h4>
                      <div className="review-item">
                        <span className="review-item-label">
                          Preferred Date
                        </span>
                        <span className="review-item-value">
                          {new Date(formData.preferred_date)
                            .toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Preferred Time
                        </span>
                        <span className="review-item-value">
                          {formData.preferred_time}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-item-label">
                          Purpose
                        </span>
                        <span className="review-item-value">
                          {formData.purpose}
                        </span>
                      </div>
                      {formData.additional_notes && (
                        <div className="review-item">
                          <span className="review-item-label">
                            Additional Notes
                          </span>
                          <span className="review-item-value">
                            {formData.additional_notes}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="form-buttons">
                      <button
                        type="button"
                        className="btn-back"
                        onClick={handleBack}>
                        ← Back
                      </button>
                      <button
                        type="button"
                        className="btn-submit"
                        onClick={handleSubmit}
                        disabled={loading}>
                        {loading
                          ? 'Submitting...'
                          : '✅ Submit Reservation'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="reservation-sidebar">

            {/* Court Info */}
            <div className="reservation-info-card">
              <h4>📋 Court Information</h4>
              <div className="info-item">
                <div className="info-item-icon">
                  <FaMapMarkerAlt />
                </div>
                <p>
                  <strong>Location</strong>
                  Barangay Batinguel Covered Court,
                  Dumaguete City
                </p>
              </div>
              <div className="info-item">
                <div className="info-item-icon">
                  <FaClock />
                </div>
                <p>
                  <strong>Available Hours</strong>
                  8:00 AM - 5:00 PM
                  Monday to Saturday
                </p>
              </div>
              <div className="info-item">
                <div className="info-item-icon">
                  <FaCalendarAlt />
                </div>
                <p>
                  <strong>Booking Period</strong>
                  Reservations must be made
                  at least 1 day in advance
                </p>
              </div>
              <div className="info-item">
                <div className="info-item-icon">
                  <FaMoneyBillWave />
                </div>
                <p>
                  <strong>Payment</strong>
                  Face-to-face payment required
                  at the Barangay Hall
                </p>
              </div>
            </div>

            {/* Rules */}
            <div className="reservation-info-card">
              <h4>📌 Court Rules</h4>
              <div className="info-item">
                <p>✅ Proper sports attire required</p>
              </div>
              <div className="info-item">
                <p>✅ No alcohol or smoking allowed</p>
              </div>
              <div className="info-item">
                <p>✅ Clean up after use</p>
              </div>
              <div className="info-item">
                <p>✅ Respect other users</p>
              </div>
              <div className="info-item">
                <p>✅ Follow barangay guidelines</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

    </div>
  )
}

export default Reservation