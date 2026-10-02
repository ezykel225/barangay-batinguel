import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import toast from 'react-hot-toast'
import { PUROKS } from '../constants/barangay'
import { isKnownPurok } from '../utils/residentGroups'
import {
  RESERVATION_STEPS,
  missingDetailMessage,
  missingTimeMessage,
} from '../utils/reservationSteps'
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
  // ⚠️ The flow is four steps now, not two. `step` is the single
  // source of where the person is:
  //   1 date & time   2 your details   3 review   4 success
  //
  // All four render from ONE `formData`, so going Back never clears
  // anything -- the fields are not unmounted-and-remounted, only
  // hidden. That is the whole reason this is a step index rather than
  // separate routes.
  const [step, setStep] = useState(1)
  // Set only after a successful submit, and the only thing step 4 has
  // that the others do not. A guest cannot read their own booking back
  // (no anonymous SELECT policy), so this comes from the
  // create_court_reservation RPC's return value -- see migration 025.
  const [submittedReference, setSubmittedReference] = useState('')
  // ⚠️ A SNAPSHOT, because the form is cleared on success. Step 4 has to
  // keep showing what was booked, and formData is empty by then -- the
  // reset is what lets somebody file a second booking without a reload.
  const [submittedBooking, setSubmittedBooking] = useState(null)

  // The calendar and the slot grid lock once the person has moved past
  // picking a time, so a stale selection cannot be changed underneath a
  // review they are reading.
  //
  // ⚠️ Defence in depth rather than the control. Step 1 is the only step
  // that RENDERS the calendar and the slot grid, so these handlers are
  // unreachable past it -- but they are also the handlers that mutate
  // `preferred_time`, and a guard on the mutation is worth more than a
  // guard on the markup.
  const timeLocked = step > 1

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
    if (timeLocked) return
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
    if (timeLocked) return
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
    // The presence checks live in reservationSteps.js, which is where a
    // test can reach them; the window, duration and overlap checks stay
    // below, because they are reservationWindow.js's and the database's.
    const missing = missingTimeMessage(formData)
    if (missing) {
      toast.error(missing)
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
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 2 -> 3. The requester fields, checked here rather than at
  // step 1 so somebody is never told their NAME is missing while they
  // are choosing a date.
  const handleContinueToReview = () => {
    // One message per field, from the module: "Please fill in all your
    // contact details" did not say which of five was blank.
    const missing = missingDetailMessage(formData)
    if (missing) {
      toast.error(missing)
      return
    }
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBackTo = (target) => {
    setStep(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 4 -> step 1. The form itself was already cleared on success, so
  // this only has to put the step back and drop the snapshot -- keeping
  // the old reference on screen beside a fresh empty form would be
  // actively misleading.
  const startAnotherReservation = () => {
    setSubmittedReference('')
    setSubmittedBooking(null)
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ⚠️ Guarded, not assumed. `navigator.clipboard` is undefined outside a
  // secure context and absent in jsdom, and an unguarded call throws
  // inside a click handler -- which on this particular page would break
  // the one screen that shows a reference the person cannot get back.
  const copyReference = async () => {
    if (!navigator.clipboard?.writeText) {
      toast('Please write the reference number down - copying is not available in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(submittedReference)
      toast.success('Reference number copied.')
    } catch (error) {
      console.error('Copy reference error:', error)
      toast('Please write the reference number down instead.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // ⚠️ Re-checked here even though steps 1 and 2 already passed. This
    // is the handler that writes, and the step index is client state: a
    // check at the gate is not a check at the door. The database is the
    // real control either way -- `create_court_reservation` declares
    // every one of these NOT NULL -- but a sentence beats a 23502.
    const missingTime = missingTimeMessage(formData)
    if (missingTime) {
      toast.error(missingTime)
      goBackTo(1)
      return
    }

    const missingDetail = missingDetailMessage(formData)
    if (missingDetail) {
      toast.error(missingDetail)
      goBackTo(2)
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

      // ⚠️ An RPC, not a table insert, and the reason is measured
      // rather than stylistic. A guest has no SELECT policy on
      // `reservations`, and PostgREST's `.insert().select()` is
      // INSERT ... RETURNING -- so asking for the reference back over
      // the table API is refused 42501 even though the insert itself is
      // allowed. The success step needs that reference, and the fix is
      // NOT to open up anonymous SELECT. See migration 025.
      //
      // The function is stricter than the policy it replaces: `status`,
      // `reviewed_by` and `resident_id` are not parameters at all, so a
      // caller cannot ask for an approved booking or attribute one to
      // somebody else. resident_id comes from auth.uid() inside the
      // function -- which is exactly what the old
      // `role === 'resident' ? user?.id : null` line was computing here,
      // only now the client cannot get it wrong.
      //
      // Every trigger still runs: the window guard (020/021), the
      // reference stamp (024), the overlap constraint (010) and the
      // Treasurer's notification (022).
      const { data: newReference, error } = await supabase.rpc(
        'create_court_reservation',
        {
          p_full_name: formData.full_name,
          p_purok: formData.purok,
          p_contact_number: formData.contact_number,
          p_email: formData.email,
          p_residency_status: formData.residency_status,
          p_preferred_date: formData.preferred_date,
          p_preferred_time: formData.preferred_time,
          p_duration_hours: Number(formData.duration_hours),
          p_end_time: calculatedEndTime,
          p_purpose: formData.purpose,
          p_activity_type: formData.activity_type,
          p_additional_notes: formData.additional_notes,
          // Null for an ordinary evening booking. The database refuses a
          // reason on one, and refuses a daytime booking without one --
          // so this is not a hint the trigger takes on trust, it is the
          // same rule written on both sides.
          p_exception_reason: needsExceptionReason
            ? formData.exception_reason.trim()
            : null,
        }
      )

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

      // ⚠️ Step 4 is the ONLY place the reference is shown, and it is
      // the only way a guest can ever track this booking -- there is no
      // email and no SMS on this path. So it is rendered on the page
      // rather than announced in a toast that disappears.
      // ⚠️ Coerced and type-checked, not just `|| ''`. The function
      // returns `text`, so this is a string in practice -- but the
      // failure this guards against was MEASURED, in the harness that
      // drove this step: a stub that answered the RPC with `[]` gave
      // `newReference = []`, which is truthy, so the reference panel
      // rendered its heading, its Copy button and its "write this down"
      // warning around an EMPTY code. A panel that says "here is your
      // reference number" and shows nothing is worse than no panel.
      // Anything that is not a non-empty string is treated as absent,
      // and step 4 says so in words instead.
      const reference = typeof newReference === 'string' ? newReference.trim() : ''
      setSubmittedReference(reference)
      setSubmittedBooking({
        date: formData.preferred_date,
        startTime: formData.preferred_time,
        endTime: calculatedEndTime,
        hours: Number(formData.duration_hours),
        activity: formData.activity_type,
        contact: formData.contact_number,
        isException: needsExceptionReason,
      })
      setStep(4)
      window.scrollTo({ top: 0, behavior: 'smooth' })

      toast.success('Reservation request submitted.')

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
      // NOT setStep(1): the person is on the success step and the
      // snapshot above is what it renders. Step 1 is one click away via
      // "Make another reservation".
    } catch (error) {
      console.error('Submit reservation error:', error)
      toast.error(error.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // The sentence under the step heading. One per step, so the heading
  // can stay two words and the explanation does not have to.
  const stepIntro = {
    1: 'Pick a date, then a start time and how long you need the court.',
    2: 'Tell us who the booking is for and what the court will be used for.',
    3: 'Check everything below. Nothing is submitted until you confirm.',
  }

  return (
    <div className="reservation-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>

      {/* ⚠️ Deliberately shorter than the informational pages' heroes.
          This one was `min-height: 500px`, which put the first step of
          the booking flow below the fold on a laptop -- somebody who
          reaches this page has already decided to book something. The
          photograph, the dark-blue overlay, the badge and the type scale
          are unchanged; only the height came down. */}
      <section className="reservation-hero reservation-hero-compact">
        <div className="reservation-hero-content">
          <span className="reservation-badge">
            🏛️ Barangay Batinguel E-Services
          </span>
          <h1>Covered Court Reservation</h1>
          <p>
            Free to use, and no account needed. Choose a time, give your
            contact details, and the barangay reviews your request.
          </p>
        </div>
      </section>

      <section className="reservation-section">
        <div className="reservation-container">

          {step === 4 ? (
            <div className="res-single">
              {/* ⚠️ This panel is the ONLY place the reference is ever
                  shown. A guest has no account to look it up in, and
                  this path sends no email and no SMS -- so it is on the
                  page, not in a toast that disappears. */}
              <div className="res-success-card">
                <p className="res-success-eyebrow">
                  <span aria-hidden="true">✓</span> Request submitted
                </p>
                <h2>Your reservation request is with the barangay</h2>
                <p className="res-success-text">
                  It is recorded as <strong>pending</strong>. The hours you
                  chose are held for you while an official reviews it, so
                  nobody else can book them in the meantime.
                </p>

                {!submittedReference ? (
                  /* The booking IS filed -- the write came back without an
                     error, which is the only way this step is reached. Only
                     the reference did not. So this says what is true and
                     what to do, rather than showing an empty code box. */
                  <div className="res-reference res-reference-missing">
                    <p className="res-reference-label">Reference number</p>
                    <p className="res-reference-warning">
                      Your request is filed, but the reference number did not
                      come back to this page. Please contact the Barangay Hall
                      with your name, your contact number and the date and time
                      below, and they can find the booking.
                    </p>
                  </div>
                ) : (
                  <div className="res-reference">
                    <p className="res-reference-label">Your reference number</p>
                    <p className="res-reference-code">{submittedReference}</p>
                    <button
                      type="button"
                      className="res-reference-copy"
                      onClick={copyReference}
                    >
                      Copy reference number
                    </button>
                    <p className="res-reference-warning">
                      <strong>Please write this down.</strong> It is not emailed
                      or texted to you, and this is the only time it is shown.
                      Checking on this booking later needs the reference number
                      <em> and </em> the contact number you gave
                      {submittedBooking?.contact ? ` (${submittedBooking.contact})` : ''}.
                    </p>
                    {/* ⚠️ The reference is deep-linked, the contact number
                        is NOT. Half of a two-factor lookup in a URL is a
                        convenience; both halves in a URL put the lookup
                        itself into browser history and the referrer
                        header. The tracking page still asks for the
                        number. */}
                    <Link
                      className="res-reference-track"
                      to={`/track-reservation?ref=${encodeURIComponent(submittedReference)}`}
                    >
                      Check on this booking later →
                    </Link>
                  </div>
                )}

                {submittedBooking && (
                  <dl className="res-review-list">
                    <div className="res-review-row">
                      <dt>Date</dt>
                      <dd>{submittedBooking.date}</dd>
                    </div>
                    <div className="res-review-row">
                      <dt>Time</dt>
                      <dd>
                        {submittedBooking.startTime} – {submittedBooking.endTime}
                        {' '}({submittedBooking.hours} hour{submittedBooking.hours === 1 ? '' : 's'})
                      </dd>
                    </div>
                    <div className="res-review-row">
                      <dt>Activity</dt>
                      <dd>{submittedBooking.activity}</dd>
                    </div>
                    {submittedBooking.isException && (
                      <div className="res-review-row">
                        <dt>Office-hours request</dt>
                        <dd>Yes — an official decides this one individually.</dd>
                      </div>
                    )}
                  </dl>
                )}

                <h3 className="res-next-heading">What happens next</h3>
                <ol className="res-next-steps">
                  <li>
                    The Barangay Treasurer reviews the request. Only the
                    Treasurer can approve or decline a court booking.
                  </li>
                  <li>
                    You will be contacted on the number you gave. If the
                    barangay cannot reach you, visit the Barangay Hall with
                    your reference number.
                  </li>
                  <li>
                    If it is declined, or if you cancel, the hours are released
                    for somebody else straight away.
                  </li>
                </ol>

                <div className="res-actions">
                  <button
                    type="button"
                    className="reservation-submit-btn res-btn-secondary"
                    onClick={startAnotherReservation}
                  >
                    Make another reservation
                  </button>
                  <Link to="/e-services" className="reservation-submit-btn res-btn-link">
                    Back to E-Services
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* An ordered list, because the steps are a sequence and a
                  screen reader should say how many there are. The number
                  in each bubble is decorative -- the visible step name is
                  the label, and `aria-current="step"` is what says where
                  the person is. */}
              <ol className="res-steps" aria-label="Reservation progress">
                {RESERVATION_STEPS.map((entry, index) => {
                  const number = index + 1
                  const state = number === step
                    ? 'is-current'
                    : number < step ? 'is-done' : 'is-todo'
                  return (
                    <li
                      key={entry.key}
                      className={`res-step ${state}`}
                      aria-current={number === step ? 'step' : undefined}
                    >
                      <span className="res-step-num" aria-hidden="true">
                        {number < step ? '✓' : number}
                      </span>
                      <span className="res-step-label">
                        <span className="visually-hidden">
                          {number < step
                            ? 'Completed: '
                            : number === step ? 'Current step: ' : 'Not started: '}
                        </span>
                        {entry.label}
                      </span>
                    </li>
                  )
                })}
              </ol>

              <div className="reservation-header">
                <h2>
                  Step {step} of {RESERVATION_STEPS.length} — {RESERVATION_STEPS[step - 1].label}
                </h2>
                <p>{stepIntro[step]}</p>
              </div>

              {/* ─── STEP 1 ─ DATE & TIME ─────────────────────────────
                  Two cards: the month calendar, then the day's slots.
                  They were already these two blocks; what changed is
                  that the requester's own details are no longer beside
                  them competing for attention. */}
              {step === 1 && (
                <div className="reservation-grid">
                  <div className="reservation-slots-card">
                    <h3>1. Choose a date</h3>
                    {/* A cell is greyed when `cell.isPast || cell.isFull`, so
                        most greyed dates in the current month are simply past.
                        The note used to say only "fully booked", which the
                        cell's own tooltip ("Past date") contradicted. */}
                    <p className="slots-note">
                      Past dates and fully-booked dates are greyed out. Pick an
                      open date to see its time slots.
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

                    {/* ⚠️ There is no `<input type="date">` here any more.
                        The page carried both, and both wrote the same
                        `formData.preferred_date` -- so a date typed into
                        the input silently moved the calendar's selection
                        and vice versa, and the two could show different
                        things while the calendar was on another month.
                        The calendar is authoritative because it is the
                        only one of the two that knows what is already
                        booked. */}
                  </div>

                  <div className="reservation-slots-card">
                    <h3>2. Choose a start time</h3>
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
                          disabled={timeLocked}
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
                            disabled={timeLocked}
                          >
                            ← Back to the {hourLabel(COURT_OPENS_HOUR)} – {hourLabel(COURT_CLOSES_HOUR)} slots
                          </button>
                        </>
                      )}
                    </div>

                    <form
                      className="reservation-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleContinueToPayment()
                      }}
                    >
                      <div className="form-group">
                        <label htmlFor="res-duration_hours">How long do you need the court?</label>
                        <select id="res-duration_hours"
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
                        <p className="field-note">
                          Changing this clears the start time below, because a
                          longer booking may no longer fit where a shorter one did.
                        </p>
                      </div>

                      {!formData.preferred_date ? (
                        <div className="slots-empty">
                          Select a date to see its time slots.
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
                                  disabled={isReserved || timeLocked}
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

                          {availableSlots.length === 0 && (
                            <div className="no-slots-box">
                              No available time slots for this date. Please choose another date.
                            </div>
                          )}
                        </>
                      )}

                      {/* Only rendered while the exception panel is open, and
                          required there. The database applies the same rule
                          from the other side: it refuses a daytime booking
                          with no reason, and refuses an evening one that
                          carries one. */}
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
                            Required for a booking that starts before {hourLabel(COURT_OPENS_HOUR)}. An
                            official reads this and decides — a reason is a request,
                            not an approval.
                          </p>
                        </div>
                      )}

                      <div className="selected-slot-box">
                        <h4>Your preferred schedule</h4>
                        <p><strong>Date:</strong> {formData.preferred_date || 'Not selected'}</p>
                        <p><strong>Start Time:</strong> {formData.preferred_time || 'Not selected'}</p>
                        <p><strong>Covered Slots:</strong> {selectedSlots.length ? selectedSlots.join(', ') : 'Not selected'}</p>
                        <p><strong>Ends At:</strong> {calculatedEndTime || 'Not selected'}</p>
                      </div>

                      <div className="res-actions">
                        <button type="submit" className="reservation-submit-btn">
                          Continue to your details →
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ─── STEP 2 ─ YOUR DETAILS ───────────────────────────── */}
              {step === 2 && (
                <div className="res-single">
                  <div className="reservation-form-card">
                    <div className="res-chosen-summary">
                      <p className="res-chosen-label">Booking</p>
                      <p className="res-chosen-value">
                        {formData.preferred_date} · {formData.preferred_time} – {calculatedEndTime}
                        {' '}({formData.duration_hours} hour{Number(formData.duration_hours) === 1 ? '' : 's'})
                      </p>
                      <button
                        type="button"
                        className="res-chosen-change"
                        onClick={() => goBackTo(1)}
                      >
                        Change date or time
                      </button>
                    </div>

                    <form
                      className="reservation-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleContinueToReview()
                      }}
                    >
                      <div className="form-group">
                        <label htmlFor="res-full_name">Full Name</label>
                        <input id="res-full_name"
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
                              {formData.purok} (as recorded — not on the list)
                            </option>
                          )}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="res-contact_number">Contact Number</label>
                        <input id="res-contact_number"
                          type="text"
                          name="contact_number"
                          value={formData.contact_number}
                          onChange={handleChange}
                          placeholder="09XXXXXXXXX"
                          required
                        />
                        <p className="field-note">
                          This is how the barangay reaches you about this booking,
                          and — with your reference number — how you check on it
                          later. Please make sure it is right.
                        </p>
                      </div>

                      <div className="form-group">
                        <label htmlFor="res-email">Email Address</label>
                        <input id="res-email"
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="Enter your email"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="res-residency_status">Residency Status</label>
                        <select id="res-residency_status"
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
                        <label htmlFor="res-activity_type">Type of Activity</label>
                        <select id="res-activity_type"
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
                        <p className="field-note">
                          Shown publicly on the availability calendar so others can
                          see what the court is booked for. Your name and purpose
                          stay private.
                        </p>
                      </div>

                      <div className="form-group">
                        <label htmlFor="res-purpose">Purpose</label>
                        <input id="res-purpose"
                          type="text"
                          name="purpose"
                          value={formData.purpose}
                          onChange={handleChange}
                          placeholder="Purpose of reservation"
                          required
                        />
                        <p className="field-note">
                          Read by barangay officials only. It is never shown on the
                          public availability calendar.
                        </p>
                      </div>

                      <div className="form-group">
                        <label htmlFor="res-additional_notes">Additional Notes</label>
                        <textarea id="res-additional_notes"
                          name="additional_notes"
                          value={formData.additional_notes}
                          onChange={handleChange}
                          placeholder="Optional notes"
                          rows="4"
                        />
                      </div>

                      <div className="res-actions">
                        <button
                          type="button"
                          className="reservation-submit-btn res-btn-secondary"
                          onClick={() => goBackTo(1)}
                        >
                          ← Back
                        </button>
                        <button type="submit" className="reservation-submit-btn">
                          Review your request →
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ─── STEP 3 ─ REVIEW ─────────────────────────────────── */}
              {step === 3 && (
                <div className="res-single">
                  <div className="reservation-form-card">
                    <form onSubmit={handleSubmit} className="reservation-form">
                      <dl className="res-review-list">
                        <div className="res-review-row">
                          <dt>Date</dt>
                          <dd>{formData.preferred_date}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Time</dt>
                          <dd>
                            {formData.preferred_time} – {calculatedEndTime}
                            {' '}({formData.duration_hours} hour{Number(formData.duration_hours) === 1 ? '' : 's'})
                          </dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Activity</dt>
                          <dd>{formData.activity_type}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Purpose</dt>
                          <dd>{formData.purpose}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Name</dt>
                          <dd>{formData.full_name}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Purok</dt>
                          <dd>{formData.purok}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Contact number</dt>
                          <dd>{formData.contact_number}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Email</dt>
                          <dd>{formData.email}</dd>
                        </div>
                        <div className="res-review-row">
                          <dt>Residency status</dt>
                          <dd>{formData.residency_status === 'resident' ? 'Resident' : 'Non-Resident'}</dd>
                        </div>
                        {formData.additional_notes && (
                          <div className="res-review-row">
                            <dt>Notes</dt>
                            <dd>{formData.additional_notes}</dd>
                          </div>
                        )}
                        {needsExceptionReason && (
                          <>
                            <div className="res-review-row">
                              <dt>Office-hours request</dt>
                              <dd>Yes — awaiting a barangay decision</dd>
                            </div>
                            <div className="res-review-row">
                              <dt>Reason given</dt>
                              <dd>{formData.exception_reason}</dd>
                            </div>
                          </>
                        )}
                      </dl>

                      <p className="res-review-note">
                        Submitting records this as a <strong>pending</strong>
                        {' '}request and holds the hours while the Barangay
                        Treasurer reviews it. It is not an approval.
                      </p>

                      <div className="res-actions">
                        <button
                          type="button"
                          className="reservation-submit-btn res-btn-secondary"
                          onClick={() => goBackTo(2)}
                          disabled={loading}
                        >
                          ← Back
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
                  </div>
                </div>
              )}

              {/* ─── COURT INFORMATION ───────────────────────────────────
                  Secondary, and below the flow rather than inside it. The
                  donation message used to sit in the middle of the form,
                  between the notes field and the submit button, where it
                  read as a step -- which for a facility that is free, and
                  whose database has no money columns at all, is the one
                  thing it must not do. */}
              <div className="res-info" aria-labelledby="court-info-heading">
                <h2 id="court-info-heading">Court information</h2>
                <div className="res-info-grid">
                  <div className="res-info-card">
                    <h3>Reserving the court is free</h3>
                    <p>
                      There is nothing to pay and nothing to upload. Any
                      donation — big or small, in cash or in kind, given in
                      person at the Barangay Hall — helps keep the court clean
                      and well-maintained for every family in the barangay.
                      Giving is completely optional and has no effect on whether
                      a reservation is approved.
                    </p>
                    <p className="res-info-quote">
                      "Ang tunay na yaman ay hindi sa kung ano ang natatanggap,
                      kundi sa kung ano ang naibabahagi."
                    </p>
                  </div>

                  <div className="res-info-card">
                    <h3>Hours and rules</h3>
                    <ul>
                      <li>
                        Reservable {hourLabel(COURT_OPENS_HOUR)} – {hourLabel(COURT_CLOSES_HOUR)};
                        a booking has to finish by {hourLabel(COURT_CLOSES_HOUR)}.
                      </li>
                      <li>
                        Up to {MAX_DURATION_HOURS} hours for an ordinary evening
                        booking.
                      </li>
                      <li>
                        A daytime booking is an <strong>exception</strong> the
                        barangay decides one at a time, needs a written reason,
                        and may run up to {MAX_EXCEPTION_DURATION_HOURS} hours.
                      </li>
                      <li>
                        Your hours are held as soon as you submit, so nobody
                        else can take them while the request is pending.
                      </li>
                      <li>
                        Only the Barangay Treasurer approves or declines a court
                        reservation.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      </main>
      <Footer />
    </div>
  )
}

export default Reservation
