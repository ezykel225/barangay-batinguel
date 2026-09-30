import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import toast from 'react-hot-toast'
import { PUROKS } from '../constants/barangay'
import { isKnownPurok } from '../utils/residentGroups'
import {
  COURT_CLOSES_HOUR,
  COURT_OPENS_HOUR,
  EVENING_SLOTS,
  MAX_DURATION_HOURS,
  MAX_EXCEPTION_DURATION_HOURS,
  OFFICE_HOUR_SLOTS,
  canFitDuration,
  coveredHours,
  durationOptionsForSlot,
  getCoveredSlots,
  hourLabel,
  isOfficeHourSlot,
  maxDurationForSlot,
  slotHour,
} from '../utils/reservationWindow'
import './Reservation.css'

// The slot list, the hour map, the 5-10 PM window and the
// office-hours exception rules now live in utils/reservationWindow.js,
// because the Official queue and the Resident portal need the same
// answers and because they are unit-testable there. The lunch-gap
// behaviour is unchanged and is asserted by those tests.

// The public-facing category for a booking. This appears on the
// availability calendar for anyone to see, so it can only ever be one
// of these fixed values -- never anything a resident typed freehand.
// That's what `purpose` is for, and it stays visible to officials only.
//
// The last three are the kinds of activity the barangay mentioned when
// it described office-hours exceptions. ⚠️ They are DESCRIPTIONS ONLY.
// Choosing one grants nothing: an official decides every exception, and
// no code anywhere reads activity_type to make that decision.
const ACTIVITY_TYPES = [
  'Basketball',
  'Volleyball',
  'Badminton',
  'E-sports / Gaming',
  'Practice / Training',
  'Meeting / Assembly',
  'Community Event',
  'Private Event',
  'Ayuda / Distribution',
  'Health Activity',
  'City / Government Activity',
  'Other',
]

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
    activity_type: '',
    additional_notes: '',
    exception_reason: '',
  })
  // 'evening' is the ordinary 5-10 PM booking. 'office-hours' is the
  // exception, which a resident has to choose deliberately -- it is not
  // reachable by scrolling the slot list.
  const [bookingMode, setBookingMode] = useState('evening')
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

  // Which start times the grid offers. Held slots are still computed
  // over EVERY hour below, so an evening booking blocked by an approved
  // office-hours event shows as taken, and the other way round.
  const offeredSlots = useMemo(
    () => (bookingMode === 'office-hours' ? OFFICE_HOUR_SLOTS : EVENING_SLOTS),
    [bookingMode]
  )

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
  }, [reservations])

  // Which activity is holding each taken slot, so the slot button can
  // say "Basketball" instead of just "Reserved". Bookings made before
  // this feature have no category, so they fall back to "Booked".
  const slotActivity = useMemo(() => {
    const map = {}
    reservations.forEach((reservation) => {
      getCoveredSlots(reservation.preferred_time, reservation.duration_hours || 1)
        .forEach((slot) => {
          map[slot] = reservation.activity_type || 'Booked'
        })
    })
    return map
  }, [reservations])

  const selectedSlots = useMemo(() => {
    return getCoveredSlots(
      formData.preferred_time,
      formData.duration_hours
    )
  }, [formData.preferred_time, formData.duration_hours])

  // Scoped to the slots currently on offer, not to every hour. In
  // evening mode a day whose daytime hours are taken is not "fully
  // booked" to this resident, and saying so would send them away from a
  // free evening.
  const availableSlots = useMemo(() => {
    return offeredSlots.filter((slot) => !reservedSlots.has(slot))
  }, [reservedSlots, offeredSlots])

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

      getCoveredSlots(res.preferred_time, res.duration_hours || 1)
        .forEach((slot) => map[dateKey].add(slot))
    })
    return map
  }, [monthReservations])

  // Distinct activities on each day of the visible month, for the
  // calendar tooltip. A Set because a day often holds several bookings
  // of the same kind, and "Basketball, Basketball" reads badly.
  const activitiesByDate = useMemo(() => {
    const map = {}
    monthReservations.forEach((res) => {
      if (!map[res.preferred_date]) map[res.preferred_date] = new Set()
      map[res.preferred_date].add(res.activity_type || 'Booked')
    })
    return map
  }, [monthReservations])

  const activityList = (dateStr) => {
    const activities = activitiesByDate[dateStr]
    if (!activities || activities.size === 0) return ''
    return ` — ${[...activities].join(', ')}`
  }

  const calendarDays = useMemo(() => {
    const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay()
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    const cells = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateString(calendarYear, calendarMonth, day)
      const taken = slotsTakenByDate[dateStr] || new Set()
      // Counted over the slots this resident can actually choose, not
      // over all thirteen hours. In evening mode a day whose daytime
      // hours are held is not a full day, and a tooltip reading "8
      // slots available" when every evening hour is gone would send
      // somebody to a date they cannot book. `taken` itself is still
      // built from every hour, so an office-hours event does hold the
      // evening hours it runs into.
      const remaining = offeredSlots.filter((slot) => !taken.has(slot)).length
      const isPast = new Date(calendarYear, calendarMonth, day) < todayMidnight
      cells.push({
        day,
        dateStr,
        isPast,
        isFull: remaining === 0,
        remaining,
      })
    }
    return cells
  }, [calendarYear, calendarMonth, slotsTakenByDate, offeredSlots])

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

  // Whether this booking needs a reason, read from the START hour --
  // exactly the condition enforce_reservation_window() applies. Derived
  // from the chosen time rather than from `bookingMode` so the two
  // cannot disagree: a resident who opens the exception panel and then
  // picks 7:00 PM is making an ordinary booking.
  const needsExceptionReason = isOfficeHourSlot(formData.preferred_time)

  // Which cap applies. Read from the mode the resident is in, not from
  // the chosen hour, because the duration is usually picked BEFORE the
  // start time -- so the control has to know which list it is offering
  // for while `preferred_time` is still empty.
  const isExceptionMode = bookingMode === 'office-hours'

  // Only the durations that actually fit the chosen start time. Before a
  // slot is picked the mode's full cap is offered, because changing the
  // duration clears the slot (see handleChange) -- so this narrows the
  // moment a start time exists and widens again when it is cleared.
  const durationOptions = useMemo(() => {
    const options = durationOptionsForSlot(
      formData.preferred_time, { exception: isExceptionMode }
    )
    if (options.length) return options
    const cap = isExceptionMode ? MAX_EXCEPTION_DURATION_HOURS : MAX_DURATION_HOURS
    return Array.from({ length: cap }, (_, index) => index + 1)
  }, [formData.preferred_time, isExceptionMode])

  const calculatedEndTime = useMemo(() => {
    // Start hour + duration, which is what `end_time` means and what
    // the database's int4range upper bound is. Derived from the hours
    // rather than from the last slot's label, because a booking running
    // through noon occupies an hour that has no startable label.
    const hours = coveredHours(formData.preferred_time, formData.duration_hours)
    if (!hours.length) return ''
    return hourLabel(hours[hours.length - 1] + 1)
  }, [formData.preferred_time, formData.duration_hours])

  const fits = (startSlot, duration) =>
    canFitDuration(startSlot, duration, { exception: isExceptionMode })

  // ⚠️ Checked over the covered HOURS, not the covered start labels, so
  // an exception running through noon is tested against the noon hour
  // too -- the same extent the database's exclusion constraint uses.
  const hasConflict = (startSlot, duration) => {
    if (!fits(startSlot, duration)) return true
    return getCoveredSlots(startSlot, duration).some((slot) => reservedSlots.has(slot))
  }

  // Why a duration does not fit, in the resident's own terms. Only two
  // things can now cause it -- the cap for this kind of booking, and
  // closing time -- so the message names whichever one bit. The lunch
  // closure is no longer among them: an exception may run through noon.
  const durationFitMessage = (startSlot, duration) => {
    const longest = maxDurationForSlot(startSlot, { exception: isExceptionMode })
    if (longest === 0) {
      return 'That is not a time the covered court offers. Please pick a slot from the list.'
    }
    const plural = longest === 1 ? '' : 's'
    const because = slotHour(startSlot) + longest >= COURT_CLOSES_HOUR
      ? `the court closes at ${hourLabel(COURT_CLOSES_HOUR)}`
      : isExceptionMode
        ? `${MAX_EXCEPTION_DURATION_HOURS} hours is the longest single booking the court takes`
        : `${MAX_DURATION_HOURS} hours is the most an ordinary booking may run`
    return `A booking starting at ${startSlot} can run for at most ${longest} hour${plural}`
      + ` — ${because}. You asked for ${duration}.`
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

  // Switching between the ordinary evening slots and the office-hours
  // exception. The chosen start time is cleared either way -- it belongs
  // to the list that is going away -- and leaving 'office-hours' also
  // clears the reason, because the database rejects an evening booking
  // that carries one (there is nothing for an official to decide).
  const switchBookingMode = (mode) => {
    if (showPaymentStep) return
    setBookingMode(mode)
    setFormData((prev) => ({
      ...prev,
      preferred_time: '',
      // ⚠️ Clamped, not carried over. Leaving the exception panel with 8
      // hours selected would otherwise submit an ordinary evening
      // booking of 8 hours -- which the form's own rule forbids, and
      // which the database would currently accept, since the 4-hour
      // ordinary cap lives only here.
      duration_hours: Math.min(
        Number(prev.duration_hours) || 1,
        mode === 'office-hours' ? MAX_EXCEPTION_DURATION_HOURS : MAX_DURATION_HOURS
      ),
      exception_reason: mode === 'office-hours' ? prev.exception_reason : '',
    }))
  }

  const handleTimeSelect = (slot) => {
    if (showPaymentStep) return
    if (!fits(slot, formData.duration_hours)) {
      toast.error(durationFitMessage(slot, formData.duration_hours))
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


  // Step 1 -> Step 2. Step 2 is a plain review-and-confirm screen; it
  // is only reached once the reservation details are valid.
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
    if (!formData.activity_type) {
      toast.error('Please choose what the court will be used for.')
      return
    }
    if (!fits(formData.preferred_time, formData.duration_hours)) {
      toast.error(durationFitMessage(formData.preferred_time, formData.duration_hours))
      return
    }
    if (hasConflict(formData.preferred_time, formData.duration_hours)) {
      toast.error('One or more selected time slots are already reserved.')
      return
    }
    // The same condition the database trigger applies: decided by the
    // START hour, not by which list the resident was looking at.
    if (needsExceptionReason && !formData.exception_reason.trim()) {
      toast.error(
        'Please explain why you need the court during office hours — an official reads this and decides.'
      )
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

    if (!fits(formData.preferred_time, formData.duration_hours)) {
      toast.error(durationFitMessage(formData.preferred_time, formData.duration_hours))
      return
    }

    if (needsExceptionReason && !formData.exception_reason.trim()) {
      toast.error(
        'Please go back and explain why you need the court during office hours.'
      )
      return
    }

    if (hasConflict(formData.preferred_time, formData.duration_hours)) {
      toast.error('One or more selected time slots are already reserved.')
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
          activity_type: formData.activity_type,
          additional_notes: formData.additional_notes,
          // Null for an ordinary evening booking. The database refuses a
          // reason on one, and refuses a daytime booking without one --
          // so this is not a hint the trigger takes on trust, it is the
          // same rule written on both sides.
          exception_reason: needsExceptionReason
            ? formData.exception_reason.trim()
            : null,
          // No payment fields are sent, and none exist on the table any
          // more (migration 006). The court is free to use; donations are
          // voluntary, handed over in person, and recorded in the
          // Treasurer's own ledger rather than in this system.
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

        // 23P01 is the exclusion constraint in migration 010 firing:
        // somebody else's booking already covers one of these hours.
        // It is the only error here that is a normal outcome rather
        // than a fault, and it is what the re-check above cannot catch
        // -- two submissions landing in the same instant both pass that
        // check, and the database refuses the second one. Postgres's
        // own wording ("conflicting key value violates exclusion
        // constraint") means nothing to a resident, so say what
        // happened and reload the slots so the form shows the truth.
        if (error.code === '23P01') {
          toast.error(
            'Someone else just booked one of those hours. The times below have been refreshed — please pick another slot.'
          )
          fetchReservationsByDate(formData.preferred_date)
          return
        }

        // P0001 is enforce_reservation_window() in migration 020. Its
        // RAISE messages are written for a resident to read -- the
        // closing time, the missing reason, a time the court does not
        // offer -- so they are shown as they are rather than replaced
        // with a generic failure. Reaching one means the form and the
        // database disagreed, which is worth seeing rather than hiding.
        if (error.code === 'P0001') {
          toast.error(error.message)
          return
        }

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
        activity_type: '',
        additional_notes: '',
        exception_reason: '',
      })

      setReservations([])
      setBookingMode('evening')
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

      <main id="main-content">

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
                ? 'Step 2 of 2 — review your details and confirm your booking.'
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
                    <label htmlFor="reservation-purok">Purok</label>
                    {/* The barangay's own list rather than a text box. This
                        field is open to anonymous walk-ins as well as signed-in
                        residents, so it was the last resident-facing place a
                        new free-text purok could still enter the database --
                        the signup and settings forms already offer the list.

                        A prefilled value the list does not contain is kept as
                        an extra option and stays selected: a resident opening
                        the booking form must not have what the barangay already
                        holds about them quietly blanked. */}
                    <select
                      id="reservation-purok"
                      name="purok"
                      value={formData.purok}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select your purok</option>
                      {PUROKS.map((purok) => (
                        <option key={purok} value={purok}>{purok}</option>
                      ))}
                      {formData.purok && !isKnownPurok(formData.purok) && (
                        <option value={formData.purok}>
                          {formData.purok} (as recorded)
                        </option>
                      )}
                    </select>
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
                    <label>Type of Activity</label>
                    <select
                      name="activity_type"
                      value={formData.activity_type}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select activity</option>
                      {ACTIVITY_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                      Shown publicly on the availability calendar so others can see
                      what the court is booked for. Your name and purpose stay private.
                    </p>
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

                  {bookingMode === 'office-hours' && (
                    <div className="form-group">
                      <label htmlFor="exception-reason">
                        Reason for using the court during office hours
                      </label>
                      <textarea
                        id="exception-reason"
                        name="exception_reason"
                        value={formData.exception_reason}
                        onChange={handleChange}
                        placeholder="Describe the activity and why it has to happen during the day."
                        rows="3"
                        required
                      />
                      <p className="field-note">
                        Required for a booking that starts before 5:00 PM. An
                        official reads this and decides — a reason is a request,
                        not an approval.
                      </p>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Preferred Date</label>
                    <input
                      type="date"
                      name="preferred_date"
                      value={formData.preferred_date}
                      onChange={handleChange}
                      min={toDateString(today.getFullYear(), today.getMonth(), today.getDate())}
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
                      {/* Only the durations that actually fit: the cap for
                          this kind of booking, then closing time. An
                          ordinary evening booking is up to 4 hours and one
                          hour at 9:00 PM; an office-hours request is up to
                          8 -- the ceiling the reservations table's own
                          CHECK has always had. */}
                      {durationOptions.map((hour) => (
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
                      in cash or in kind, given in person at the Barangay Hall — helps
                      keep it clean and well-maintained for every family in the
                      barangay. Giving is completely optional and won't affect whether
                      your reservation is approved.
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
                    <p><strong>Activity:</strong> {formData.activity_type}</p>
                    {needsExceptionReason && (
                      <>
                        <p><strong>Office-hours request:</strong> yes — awaiting a barangay decision</p>
                        <p><strong>Reason given:</strong> {formData.exception_reason}</p>
                      </>
                    )}
                  </div>

                  <div className="payment-box">
                    <h3>Reserving the Court is Free</h3>
                    <p style={{ fontSize: 13, color: '#6b7280' }}>
                      There is nothing to pay and nothing to upload — just submit
                      your reservation. If you'd like to support the court's
                      upkeep, donations are welcome in person at the Barangay
                      Hall, in cash or in kind. Giving is entirely optional and
                      has no effect on whether your reservation is approved.
                    </p>
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
                          ${!unavailable && cell.remaining < offeredSlots.length ? 'partial' : ''}`}
                        onClick={() => handleCalendarDayClick(cell)}
                        disabled={unavailable}
                        title={
                          cell.isPast ? 'Past date'
                            : cell.isFull ? `Fully booked${activityList(cell.dateStr)}`
                              : `${cell.remaining} slot${cell.remaining === 1 ? '' : 's'} available${activityList(cell.dateStr)}`
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

              {/* The window, and the way into the exception. The daytime
                  slots are deliberately not just further down the same
                  list: an office-hours booking is something the barangay
                  decides one at a time, so asking for one has to be a
                  deliberate act rather than a scroll. */}
              <div className="booking-window-note">
                <p>
                  The covered court is reservable{' '}
                  <strong>
                    {hourLabel(COURT_OPENS_HOUR)} – {hourLabel(COURT_CLOSES_HOUR)}
                  </strong>
                  . It is made available for booking after office hours, so a
                  booking has to <em>finish</em> by {hourLabel(COURT_CLOSES_HOUR)}.
                </p>

                {bookingMode === 'evening' ? (
                  <button
                    type="button"
                    className="exception-toggle"
                    onClick={() => switchBookingMode('office-hours')}
                    disabled={showPaymentStep}
                  >
                    Need the court during office hours? Request an exception
                  </button>
                ) : (
                  <>
                    <p className="exception-explainer">
                      You are asking for an <strong>office-hours exception</strong>.
                      The barangay may allow a daytime booking depending on the
                      activity and on which officials are available that day —
                      an ayuda or distribution activity, a health activity, or a
                      city or government activity are the kinds of thing it gave
                      as examples. Picking one of those categories approves
                      nothing: an official reads your reason and decides.
                    </p>
                    <p className="exception-explainer">
                      A daytime request may run for up to{' '}
                      <strong>{MAX_EXCEPTION_DURATION_HOURS} hours</strong> and may
                      run straight through {hourLabel(12)} — an activity that takes
                      most of the day does not have to stop for lunch. It still has
                      to finish by {hourLabel(COURT_CLOSES_HOUR)}.
                    </p>
                    <button
                      type="button"
                      className="exception-toggle"
                      onClick={() => switchBookingMode('evening')}
                      disabled={showPaymentStep}
                    >
                      ← Back to the {hourLabel(COURT_OPENS_HOUR)} – {hourLabel(COURT_CLOSES_HOUR)} slots
                    </button>
                  </>
                )}
              </div>

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
                    {offeredSlots.map((slot) => {
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
                            {isReserved ? (slotActivity[slot] || 'Reserved') : 'Available'}
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
                    <p><strong>Ends At:</strong> {calculatedEndTime || 'Not selected'}</p>
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

      </main>
      <Footer />
    </div>
  )
}

export default Reservation
