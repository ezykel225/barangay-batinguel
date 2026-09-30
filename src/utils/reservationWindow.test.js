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
  OFFICE_HOUR_SLOTS,
  SLOT_HOURS,
  canFitDuration,
  durationOptionsForSlot,
  endsWithinWindow,
  getCoveredSlots,
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

  it('has no 12 NN slot, because the court closes for lunch', () => {
    expect(ALL_SLOTS).not.toContain('12:00 PM')
    expect(ALL_SLOTS).not.toContain('12:00 NN')
    // 11 AM and 1 PM are adjacent in the list and two hours apart.
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

  it('offers 0 for a time the court does not offer', () => {
    expect(maxDurationForSlot('9:30 PM')).toBe(0)
    expect(durationOptionsForSlot('9:30 PM')).toEqual([])
  })

  it('lists the options a control can render', () => {
    expect(durationOptionsForSlot('9:00 PM')).toEqual([1])
    expect(durationOptionsForSlot('7:00 PM')).toEqual([1, 2, 3])
    expect(durationOptionsForSlot('5:00 PM')).toEqual([1, 2, 3, 4])
  })
})

describe('covered slots and the lunch gap', () => {
  it('walks consecutive hours', () => {
    expect(getCoveredSlots('5:00 PM', 3)).toEqual(['5:00 PM', '6:00 PM', '7:00 PM'])
  })

  it('stops at the lunch gap instead of spanning it', () => {
    // 11 AM for 3 hours would be 11-12, then a closed hour. The walk
    // returns short, which every caller treats as "does not fit".
    expect(getCoveredSlots('11:00 AM', 3)).toEqual(['11:00 AM'])
    expect(canFitDuration('11:00 AM', 3)).toBe(false)
    expect(canFitDuration('11:00 AM', 1)).toBe(true)
  })

  it('lets an exception run from office hours into the evening', () => {
    // 4 PM for 3 hours ends at 7 PM. The database accepted this case.
    expect(getCoveredSlots('4:00 PM', 3)).toEqual(['4:00 PM', '5:00 PM', '6:00 PM'])
    expect(canFitDuration('4:00 PM', 3)).toBe(true)
  })

  it('refuses a duration that runs past closing even when slots remain', () => {
    // There is no slot after 9 PM, so the walk returns short too -- but
    // canFitDuration must refuse on the window as well, not only on the
    // list running out.
    expect(canFitDuration('9:00 PM', 2)).toBe(false)
    expect(canFitDuration('8:00 PM', 2)).toBe(true)
  })

  it('returns nothing for an unknown start', () => {
    expect(getCoveredSlots('9:30 PM', 1)).toEqual([])
    expect(canFitDuration('9:30 PM', 1)).toBe(false)
  })

  it('treats a missing or zero duration as one hour', () => {
    expect(getCoveredSlots('5:00 PM', 0)).toEqual(['5:00 PM'])
    expect(getCoveredSlots('5:00 PM', undefined)).toEqual(['5:00 PM'])
  })

  it('can be restricted to one list', () => {
    // Given only the evening list, a 4 PM start is not in it at all.
    expect(getCoveredSlots('4:00 PM', 2, EVENING_SLOTS)).toEqual([])
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

describe('the window constants', () => {
  it('are 5 PM and 10 PM', () => {
    expect(COURT_OPENS_HOUR).toBe(17)
    expect(COURT_CLOSES_HOUR).toBe(22)
  })
})
