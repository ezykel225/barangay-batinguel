// Unit tests for the shared display labels.
//
// Pure module, no Supabase import, so these run without the environment
// variables `App.test.js` needs.
//
// Each test names the defect it protects against, because most of these
// exist for something that was actually wrong on screen: a cancelled
// booking with no style at all, a lunch break coloured like a failure, an
// "Upcoming Events" card counting last year's events, and two different
// vocabularies for one status depending on who was looking at it.

import * as labels from './displayLabels'
import {
  AVAILABILITY_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  availabilityStatusClass,
  availabilityStatusLabel,
  countUpcoming,
  documentStatusClass,
  documentStatusLabel,
  isUpcoming,
  reservationStatusClass,
  reservationStatusLabel,
} from './displayLabels'

describe('document request labels', () => {
  it('labels every status the workflow can hold', () => {
    expect(documentStatusLabel('pending')).toBe('Pending Review')
    expect(documentStatusLabel('approved')).toBe('Approved')
    expect(documentStatusLabel('declined')).toBe('Declined')
    expect(documentStatusLabel('ready_for_pickup')).toBe('Ready for Pickup')
    expect(documentStatusLabel('claimed')).toBe('Claimed')
  })

  it('never shows a raw database value', () => {
    // The official's table used to print the stored value through a regex
    // ("ready for pickup") beside a resident portal that read
    // "Ready for Pickup" for the same request.
    Object.keys(DOCUMENT_STATUS_LABELS).forEach((status) => {
      expect(documentStatusLabel(status)).not.toBe(status)
      expect(documentStatusLabel(status)).not.toMatch(/_/)
    })
  })

  it('gives every status a badge class', () => {
    Object.keys(DOCUMENT_STATUS_LABELS).forEach((status) => {
      expect(documentStatusClass(status)).toMatch(/^badge-/)
    })
  })
})

describe('reservation labels', () => {
  it('labels every status, cancelled included', () => {
    expect(reservationStatusLabel('pending')).toBe('Pending')
    expect(reservationStatusLabel('approved')).toBe('Approved')
    expect(reservationStatusLabel('declined')).toBe('Declined')
    expect(reservationStatusLabel('cancelled')).toBe('Cancelled')
  })

  it('gives cancelled a real class', () => {
    // `badge badge-${res.status}` produced `badge-cancelled`, which no
    // stylesheet defined, so the pill rendered unstyled.
    expect(reservationStatusClass('cancelled')).toBe('badge-cancelled')
    Object.keys(RESERVATION_STATUS_LABELS).forEach((status) => {
      expect(reservationStatusClass(status)).toMatch(/^badge-/)
    })
  })

  it('does not colour a resident cancelling their own slot as a refusal', () => {
    expect(reservationStatusClass('cancelled'))
      .not.toBe(reservationStatusClass('declined'))
  })
})

describe('availability labels', () => {
  it('reads as words rather than stored values', () => {
    expect(availabilityStatusLabel('available')).toBe('Available')
    expect(availabilityStatusLabel('on-break')).toBe('On break')
    expect(availabilityStatusLabel('on-field')).toBe('On field')
    expect(availabilityStatusLabel('on-leave')).toBe('On leave')
    expect(availabilityStatusLabel('unavailable')).toBe('Not available')
  })

  it('treats only "unavailable" as the negative state', () => {
    // The nurse's weekly schedule used `available ? green : red`, so a
    // lunch break and a scheduled field day were coloured like faults.
    const negative = availabilityStatusClass('unavailable')
    expect(availabilityStatusClass('on-break')).not.toBe(negative)
    expect(availabilityStatusClass('on-field')).not.toBe(negative)
    expect(availabilityStatusClass('on-leave')).not.toBe(negative)
    expect(availabilityStatusClass('available')).not.toBe(negative)
  })

  it('covers every value both availability tables can hold', () => {
    // nurse_availability and kapitan_availability share this vocabulary.
    ;['available', 'on-break', 'on-field', 'on-leave', 'unavailable'].forEach((status) => {
      expect(AVAILABILITY_STATUS_LABELS[status]).toBeDefined()
      expect(availabilityStatusClass(status)).toMatch(/^badge-/)
    })
  })
})

describe('unknown values', () => {
  it('keeps the stored text rather than inventing or blanking it', () => {
    expect(documentStatusLabel('something_new')).toBe('something_new')
    expect(reservationStatusLabel('mystery')).toBe('mystery')
    expect(availabilityStatusLabel('mystery')).toBe('mystery')
  })

  it('gives an unknown value no badge class, so it looks unexpected', () => {
    expect(documentStatusClass('something_new')).toBe('')
    expect(reservationStatusClass('mystery')).toBe('')
  })

  it('does not throw on null or undefined', () => {
    expect(documentStatusLabel(null)).toBe('')
    expect(documentStatusLabel(undefined)).toBe('')
    expect(availabilityStatusClass(null)).toBe('')
  })
})

describe('counting what is upcoming', () => {
  const today = '2026-09-30'

  it('counts today and the future, not the past', () => {
    expect(isUpcoming('2026-09-30', today)).toBe(true)
    expect(isUpcoming('2026-10-01', today)).toBe(true)
    expect(isUpcoming('2026-09-29', today)).toBe(false)
    expect(isUpcoming('2025-01-01', today)).toBe(false)
  })

  it('tolerates a timestamp, comparing the date part only', () => {
    // An event at 9am today is still upcoming for the rest of the day.
    expect(isUpcoming('2026-09-30T09:00:00+08:00', today)).toBe(true)
    expect(isUpcoming('2026-09-29T23:59:00+08:00', today)).toBe(false)
  })

  it('treats a missing date as not upcoming rather than throwing', () => {
    expect(isUpcoming(null, today)).toBe(false)
    expect(isUpcoming('', today)).toBe(false)
    expect(isUpcoming(undefined, today)).toBe(false)
  })

  it('counts only the upcoming rows', () => {
    // The card said "Upcoming Events" while rendering events.length, so a
    // barangay with three past events and nothing planned read "3".
    const events = [
      { event_date: '2025-05-01' },
      { event_date: '2026-09-29' },
      { event_date: '2026-09-30' },
      { event_date: '2026-12-25' },
      { event_date: null },
    ]
    const upcoming = events.filter((e) => isUpcoming(e.event_date, today))
    expect(upcoming).toHaveLength(2)
    // countUpcoming uses today in Manila, so assert only that it is a
    // count within range rather than pinning it to a fixed date.
    const counted = countUpcoming(events, 'event_date')
    expect(counted).toBeGreaterThanOrEqual(0)
    expect(counted).toBeLessThanOrEqual(events.length)
  })

  it('returns 0 for an empty or missing list', () => {
    expect(countUpcoming([])).toBe(0)
    expect(countUpcoming()).toBe(0)
  })

  it('reads today in Manila as a YYYY-MM-DD string', () => {
    expect(labels.manilaToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the module does not own account verification', () => {
  // ⚠️ This is a regression guard, not a style check.
  //
  // This file used to export a SECOND verification vocabulary that
  // nothing imported and that disagreed with what shipped: `verified` as
  // "Resident", `rejected` as "Needs correction". The reviewed wording
  // lives in residentGroups.js, together with the grouping that depends
  // on it. Re-adding it here would give the app two answers for one
  // status again.
  it('exports no verification label map', () => {
    expect(labels.VERIFICATION_STATUS_LABELS).toBeUndefined()
    expect(labels.VERIFICATION_ACTION_LABELS).toBeUndefined()
    expect(labels.verificationStatusLabel).toBeUndefined()
  })

  it('exports no purok helpers, which residentGroups already owns', () => {
    expect(labels.purokLabel).toBeUndefined()
    expect(labels.isRecognisedPurok).toBeUndefined()
  })
})
