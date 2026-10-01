// The booking window and the office-hours exception.
//
// These mirror the SQL cases recorded in migration 020's header, so the
// client and the database are asserted to agree on the same boundaries
// rather than each being checked on its own. Where the two could drift
// -- the hour map, the closing time, the start-hour classification --
// there is a test here and a rolled-back SQL case there.
//
// Pure module, so this runs without the Supabase environment variables.

import {
  ALL_SLOTS,
  COURT_CLOSES_HOUR,
  COURT_OPENS_HOUR,
  EVENING_SLOTS,
  EXCEPTION_BADGE_LABEL,
  MAX_DURATION_HOURS,
  MAX_EXCEPTION_DURATION_HOURS,
  OFFICE_HOUR_SLOTS,
  SLOT_HOURS,
  canFitDuration,
  coveredHours,
  durationOptionsForSlot,
  endsWithinWindow,
  getCoveredSlots,
  hourLabel,
  isEveningSlot,
  isExceptionRequest,
  isLegacyDaytimeBooking,
  isOfficeHourSlot,
  maxDurationForSlot,
  residentStatusLabel,
  slotHour,
} from './reservationWindow'

describe('the hour map', () => {
  it('matches the database helper for every label it offers', () => {
    // reservation_slot_hour() in migration 020. If these drift, an
    // unrecognised label yields a NULL slot_hour and the overlap guard
    // silently stops covering those rows.
    expect(SLOT_HOURS).toEqual({
      '8:00 AM': 8, '9:00 AM': 9, '10:00 AM': 10, '11:00 AM': 11,
      '1:00 PM': 13, '2:00 PM': 14, '3:00 PM': 15, '4:00 PM': 16,
      '5:00 PM': 17, '6:00 PM': 18, '7:00 PM': 19, '8:00 PM': 20,
      '9:00 PM': 21,
    })
  })

  it('offers no 12 NN START, because the database offers none either', () => {
    // Not a closure -- a booking may RUN THROUGH noon (see the
    // noon-spanning block below). This is only about what can be stored
    // in `preferred_time`: reservation_slot_hour() has no '12:00 PM'
    // case, so a row starting at noon would carry a NULL slot_hour and
    // escape the overlap constraint's partial WHERE. The INSERT guard
    // rejects it instead, and this list never offers it.
    expect(ALL_SLOTS).not.toContain('12:00 PM')
    expect(ALL_SLOTS).not.toContain('12:00 NN')
    // 11 AM and 1 PM are adjacent in the start list, two hours apart.
    expect(SLOT_HOURS['1:00 PM'] - SLOT_HOURS['11:00 AM']).toBe(2)
  })

  it('returns null for a time the court does not offer', () => {
    expect(slotHour('9:30 PM')).toBeNull()
    expect(slotHour('3:00 AM')).toBeNull()
    expect(slotHour('12:00 PM')).toBeNull()
    expect(slotHour('')).toBeNull()
    expect(slotHour(undefined)).toBeNull()
  })

  it('does not treat inherited Object properties as slots', () => {
    expect(slotHour('constructor')).toBeNull()
    expect(slotHour('toString')).toBeNull()
  })
})

describe('the two slot lists', () => {
  it('splits at 5 PM with nothing lost or duplicated', () => {
    expect(EVENING_SLOTS).toEqual(['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'])
    expect(OFFICE_HOUR_SLOTS).toEqual([
      '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
      '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM',
    ])
    expect(EVENING_SLOTS.length + OFFICE_HOUR_SLOTS.length).toBe(ALL_SLOTS.length)
  })

  it('classifies by start hour, as the database guard does', () => {
    expect(isEveningSlot('5:00 PM')).toBe(true)
    expect(isEveningSlot('4:00 PM')).toBe(false)
    expect(isOfficeHourSlot('4:00 PM')).toBe(true)
    expect(isOfficeHourSlot('5:00 PM')).toBe(false)
    // A booking that starts in office hours and runs into the evening is
    // still an exception: it takes the court during office hours.
    expect(isOfficeHourSlot('4:00 PM')).toBe(true)
  })

  it('classifies an unknown label as neither', () => {
    expect(isEveningSlot('9:30 PM')).toBe(false)
    expect(isOfficeHourSlot('9:30 PM')).toBe(false)
  })
})

describe('a booking must finish by 10 PM', () => {
  it('accepts the boundary exactly', () => {
    // Mirrors the SQL cases "6 PM 4h -> ends 10 PM" and "9 PM 1h".
    expect(endsWithinWindow('6:00 PM', 4)).toBe(true)
    expect(endsWithinWindow('9:00 PM', 1)).toBe(true)
    expect(SLOT_HOURS['6:00 PM'] + 4).toBe(COURT_CLOSES_HOUR)
  })

  it('refuses anything that runs past it', () => {
    expect(endsWithinWindow('7:00 PM', 4)).toBe(false)
    expect(endsWithinWindow('9:00 PM', 2)).toBe(false)
    expect(endsWithinWindow('8:00 PM', 3)).toBe(false)
  })

  it('accepts a 5 PM booking for the full four hours', () => {
    expect(endsWithinWindow('5:00 PM', 4)).toBe(true)
  })

  it('refuses a time the court does not offer', () => {
    expect(endsWithinWindow('9:30 PM', 1)).toBe(false)
  })
})

describe('durations offered per slot', () => {
  it('shrinks as the evening runs out', () => {
    expect(maxDurationForSlot('5:00 PM')).toBe(4)
    expect(maxDurationForSlot('6:00 PM')).toBe(4)
    expect(maxDurationForSlot('7:00 PM')).toBe(3)
    expect(maxDurationForSlot('8:00 PM')).toBe(2)
    expect(maxDurationForSlot('9:00 PM')).toBe(1)
  })

  it('never exceeds the 4-hour cap, even with a whole day left', () => {
    // 8 AM has 14 hours before closing; the cap is what decides.
    expect(maxDurationForSlot('8:00 AM')).toBe(MAX_DURATION_HOURS)
    expect(MAX_DURATION_HOURS).toBe(4)
  })

  it('offers an exception more hours, up to the database CHECK', () => {
    // ⚠️ 8 is the ceiling of reservations_duration_hours_check, not a
    // number picked here. An ayuda activity can take most of the day;
    // an ordinary resident booking is still 4.
    expect(MAX_EXCEPTION_DURATION_HOURS).toBe(8)
    expect(maxDurationForSlot('8:00 AM', { exception: true })).toBe(8)
    expect(maxDurationForSlot('8:00 AM')).toBe(4)
  })

  it('still refuses to let an exception run past closing', () => {
    // 4 PM has six hours before 10 PM, so the window decides, not the
    // 8-hour cap.
    expect(maxDurationForSlot('4:00 PM', { exception: true })).toBe(6)
    expect(maxDurationForSlot('3:00 PM', { exception: true })).toBe(7)
    expect(maxDurationForSlot('1:00 PM', { exception: true })).toBe(8)
  })

  it('does not widen the evening by asking for the exception cap', () => {
    // An evening start is never an exception, so nothing offers it 8
    // hours -- but even if a caller passed the flag, closing still
    // decides.
    expect(maxDurationForSlot('9:00 PM', { exception: true })).toBe(1)
    expect(maxDurationForSlot('6:00 PM', { exception: true })).toBe(4)
  })

  it('offers 0 for a time the court does not offer', () => {
    expect(maxDurationForSlot('9:30 PM')).toBe(0)
    expect(durationOptionsForSlot('9:30 PM')).toEqual([])
  })

  it('lists the options a control can render', () => {
    expect(durationOptionsForSlot('9:00 PM')).toEqual([1])
    expect(durationOptionsForSlot('7:00 PM')).toEqual([1, 2, 3])
    expect(durationOptionsForSlot('5:00 PM')).toEqual([1, 2, 3, 4])
  })

  it('lists the longer options for an exception', () => {
    expect(durationOptionsForSlot('8:00 AM', { exception: true }))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(durationOptionsForSlot('4:00 PM', { exception: true }))
      .toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('what a booking occupies', () => {
  it('is a continuous run of hours, like the database range', () => {
    expect(coveredHours('5:00 PM', 3)).toEqual([17, 18, 19])
    expect(getCoveredSlots('5:00 PM', 3)).toEqual(['5:00 PM', '6:00 PM', '7:00 PM'])
  })

  it('runs straight through noon', () => {
    // ⚠️ The barangay's decision of 2026-09-30: an exception may occupy
    // 12 NN - 1 PM continuously, because an ayuda activity can take most
    // of the day. The old walk stopped dead at the label gap and
    // returned ['11:00 AM'] for this.
    expect(coveredHours('11:00 AM', 3)).toEqual([11, 12, 13])
    expect(getCoveredSlots('11:00 AM', 3))
      .toEqual(['11:00 AM', '12:00 NN', '1:00 PM'])
    expect(canFitDuration('11:00 AM', 3, { exception: true })).toBe(true)
  })

  it('reports the hours of the noon-spanning row already in the data', () => {
    // An approved 10:00 AM / 3-hour booking predates all of this. The
    // database's exclusion constraint holds hours 10, 11 and 12 for it;
    // the old walk reported two labels, so the form printed the wrong
    // end time and the grid under-reported what was held.
    expect(coveredHours('10:00 AM', 3)).toEqual([10, 11, 12])
    expect(getCoveredSlots('10:00 AM', 3))
      .toEqual(['10:00 AM', '11:00 AM', '12:00 NN'])
  })

  it('covers a whole daytime ayuda activity', () => {
    expect(coveredHours('8:00 AM', 8)).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
    expect(canFitDuration('8:00 AM', 8, { exception: true })).toBe(true)
    // ...but not as an ordinary resident booking.
    expect(canFitDuration('8:00 AM', 8)).toBe(false)
  })

  it('lets an exception run from office hours into the evening', () => {
    // 4 PM for 3 hours ends at 7 PM. The database accepted this case.
    expect(getCoveredSlots('4:00 PM', 3)).toEqual(['4:00 PM', '5:00 PM', '6:00 PM'])
    expect(canFitDuration('4:00 PM', 3, { exception: true })).toBe(true)
  })

  it('refuses a duration that runs past closing', () => {
    expect(canFitDuration('9:00 PM', 2)).toBe(false)
    expect(canFitDuration('8:00 PM', 2)).toBe(true)
    expect(canFitDuration('4:00 PM', 7, { exception: true })).toBe(false)
    expect(canFitDuration('4:00 PM', 6, { exception: true })).toBe(true)
  })

  it('returns nothing for an unknown start', () => {
    expect(coveredHours('9:30 PM', 1)).toEqual([])
    expect(getCoveredSlots('9:30 PM', 1)).toEqual([])
    expect(canFitDuration('9:30 PM', 1)).toBe(false)
    expect(canFitDuration('9:30 PM', 1, { exception: true })).toBe(false)
  })

  it('treats a missing or zero duration as one hour', () => {
    expect(getCoveredSlots('5:00 PM', 0)).toEqual(['5:00 PM'])
    expect(getCoveredSlots('5:00 PM', undefined)).toEqual(['5:00 PM'])
    expect(coveredHours('5:00 PM', -3)).toEqual([17])
  })
})

describe('naming an hour for display', () => {
  it('calls the middle of the day 12:00 NN', () => {
    // Deliberately not "12:00 PM": that string is not in SLOT_HOURS and
    // must never look like a value this app would store.
    expect(hourLabel(12)).toBe('12:00 NN')
    expect(SLOT_HOURS['12:00 NN']).toBeUndefined()
  })

  it('agrees with the slot labels for every startable hour', () => {
    ALL_SLOTS.forEach((slot) => {
      expect(hourLabel(SLOT_HOURS[slot])).toBe(slot)
    })
  })

  it('names closing time, which no slot starts at', () => {
    expect(hourLabel(COURT_CLOSES_HOUR)).toBe('10:00 PM')
  })

  it('returns nothing for a non-hour', () => {
    expect(hourLabel(undefined)).toBe('')
    expect(hourLabel('8')).toBe('')
  })
})

describe('what counts as an exception request', () => {
  const row = (overrides = {}) => ({
    preferred_time: '8:00 AM', status: 'pending', exception_reason: null, ...overrides,
  })

  it('is decided by the reason, never by the hour', () => {
    expect(isExceptionRequest(row({ exception_reason: 'Ayuda distribution' }))).toBe(true)
    expect(isExceptionRequest(row({ exception_reason: null }))).toBe(false)
  })

  it('does NOT relabel a historical daytime booking', () => {
    // ⚠️ The regression this predicate exists to prevent. Every one of
    // the 21 reservations that existed before migration 020 starts
    // before 5 PM with no reason. Classifying by hour would badge all of
    // them as exception requests and bury the real ones.
    const legacy = row({ preferred_time: '8:00 AM', exception_reason: null })
    expect(isExceptionRequest(legacy)).toBe(false)
    expect(isLegacyDaytimeBooking(legacy)).toBe(true)
  })

  it('treats whitespace as no reason at all', () => {
    // The database normalises this to NULL; the client must agree.
    expect(isExceptionRequest(row({ exception_reason: '   ' }))).toBe(false)
    expect(isExceptionRequest(row({ exception_reason: '\n\t' }))).toBe(false)
  })

  it('does not throw on a missing or malformed row', () => {
    expect(isExceptionRequest(undefined)).toBe(false)
    expect(isExceptionRequest({})).toBe(false)
    expect(isExceptionRequest({ exception_reason: 42 })).toBe(false)
    expect(isLegacyDaytimeBooking(undefined)).toBe(false)
  })

  it('does not call an evening booking legacy', () => {
    expect(isLegacyDaytimeBooking(row({ preferred_time: '7:00 PM' }))).toBe(false)
  })
})

describe('resident-facing wording', () => {
  it('distinguishes a pending exception from an ordinary pending booking', () => {
    expect(residentStatusLabel({ status: 'pending', exception_reason: 'Health activity' }))
      .toMatch(/awaiting barangay decision/i)
    // An ordinary pending booking keeps whatever the shared status map
    // already says, so this returns null rather than inventing a label.
    expect(residentStatusLabel({ status: 'pending', exception_reason: null })).toBeNull()
  })

  it('says nothing once a decision has been made', () => {
    expect(residentStatusLabel({ status: 'approved', exception_reason: 'Health activity' })).toBeNull()
    expect(residentStatusLabel({ status: 'declined', exception_reason: 'Health activity' })).toBeNull()
    expect(residentStatusLabel({ status: 'cancelled', exception_reason: 'Health activity' })).toBeNull()
  })

  it('has one badge label for officials', () => {
    expect(EXCEPTION_BADGE_LABEL).toBe('Office-hours exception')
  })
})

describe('the caps the database now enforces too', () => {
  // ⚠️ Mirrors migration 021's SQL cases one for one. Before 021 the
  // 4-hour ordinary limit lived ONLY here, and a direct API call with
  // the publishable key could file a 5:00 PM / 5-hour booking --
  // verified accepted at the time. These assertions and that
  // migration's header have to move together.
  it('accepts the ordinary cases the server accepts', () => {
    expect(canFitDuration('5:00 PM', 4)).toBe(true)
    expect(canFitDuration('6:00 PM', 4)).toBe(true)
    expect(canFitDuration('9:00 PM', 1)).toBe(true)
  })

  it('refuses an ordinary 5 PM / 5h, exactly as the guard does', () => {
    // Ends at 10:00 PM precisely, so the window cannot be what refuses
    // it -- only the 4-hour cap can. That is why this is the case worth
    // asserting rather than 5 PM / 8h, which the closing time catches
    // first on both sides.
    expect(endsWithinWindow('5:00 PM', 5)).toBe(true)
    expect(canFitDuration('5:00 PM', 5)).toBe(false)
  })

  it('refuses an ordinary booking that runs past closing', () => {
    expect(canFitDuration('7:00 PM', 4)).toBe(false)
  })

  it('lets an exception have the 8 hours the CHECK allows', () => {
    expect(canFitDuration('8:00 AM', 8, { exception: true })).toBe(true)
    expect(canFitDuration('1:00 PM', 8, { exception: true })).toBe(true)
  })

  it('never offers a 9th hour, which the CHECK refuses as 23514', () => {
    // reservations_duration_hours_check is BETWEEN 1 AND 8, and 021
    // deliberately does not restate that number in the guard. The form
    // must therefore never produce a 9, or the resident meets a raw
    // constraint error instead of a sentence.
    expect(durationOptionsForSlot('8:00 AM', { exception: true }))
      .not.toContain(9)
    expect(Math.max(
      ...ALL_SLOTS.map((slot) => maxDurationForSlot(slot, { exception: true }))
    )).toBe(MAX_EXCEPTION_DURATION_HOURS)
  })

  it('offers no ordinary duration above the ordinary cap, at any slot', () => {
    ALL_SLOTS.forEach((slot) => {
      expect(maxDurationForSlot(slot)).toBeLessThanOrEqual(MAX_DURATION_HOURS)
    })
  })
})

describe('the window constants', () => {
  it('are 5 PM and 10 PM', () => {
    expect(COURT_OPENS_HOUR).toBe(17)
    expect(COURT_CLOSES_HOUR).toBe(22)
  })
})
