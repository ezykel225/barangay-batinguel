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
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ENTITY_LABELS,
  AVAILABILITY_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  activityActionLabel,
  activityEntityLabel,
  availabilityStatusClass,
  availabilityStatusLabel,
  countUpcoming,
  documentStatusClass,
  documentStatusLabel,
  isUpcoming,
  reservationStatusClass,
  reservationStatusLabel,
} from './displayLabels'
import { ACTIONS, ENTITY_TYPES } from './activityLog'
import { VERIFICATION_STATES } from './residentGroups'

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

describe('the date boundary the event filters use', () => {
  // ⚠️ The bug these protect against: the Announcements/Events tab and
  // the nurse's Health Events tab classified upcoming vs past with
  // `new Date().toISOString().slice(0, 10)`, which is the UTC date.
  // Manila is UTC+8, so between midnight and 8 AM Philippine time the
  // UTC date is still YESTERDAY -- and an event dated today was filed
  // under "past" while the Upcoming Events card on the same dashboard,
  // which already used manilaToday(), counted it as upcoming. Two
  // surfaces, one dataset, different answers, every morning.

  afterEach(() => {
    jest.useRealTimers()
  })

  it("is Manila's date, which differs from UTC early in the morning", () => {
    // 01:30 Manila on 2026-10-01 is 17:30 UTC on 2026-09-30.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T17:30:00Z'))

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(labels.manilaToday()).toBe('2026-10-01')
  })

  it('counts an event dated today as upcoming inside that window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T17:30:00Z'))

    const event = { event_date: '2026-10-01' }

    // What the filters do now.
    expect(isUpcoming(event.event_date, labels.manilaToday())).toBe(true)
    expect(countUpcoming([event], 'event_date')).toBe(1)

    // What they did before: the same event read as past.
    const utcToday = new Date().toISOString().slice(0, 10)
    expect(event.event_date >= utcToday).toBe(true)
    expect(isUpcoming('2026-09-30', labels.manilaToday())).toBe(false)
  })

  it('agrees with UTC once Manila and UTC share a date', () => {
    // 20:00 Manila on 2026-10-01 is 12:00 UTC the same day.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'))

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-01')
    expect(labels.manilaToday()).toBe('2026-10-01')
  })
})

describe('the Activity Log vocabulary', () => {
  // ⚠️ These exist because the Activity Log tab rendered the stored
  // values straight to the screen through `replace(/_/g, ' ')`. On live
  // data that produced "ready for pickup", "marked ineligible",
  // "resident account" and "medical program" in an official's table.
  it('covers every action the audit trail may hold', () => {
    // Against activityLog.js's own list, so widening the vocabulary in a
    // migration without adding a label here fails here rather than on
    // screen. Migration 016 widened it and 017 widened the trigger; this
    // is the third place that has to keep up.
    ACTIONS.forEach((action) => {
      expect(ACTIVITY_ACTION_LABELS[action]).toBeTruthy()
    })
  })

  it('covers every entity type', () => {
    ENTITY_TYPES.forEach((type) => {
      expect(ACTIVITY_ENTITY_LABELS[type]).toBeTruthy()
    })
  })

  it('never puts the words "registry entry" on screen', () => {
    // The whole point of the Voter Reference List naming. There are no
    // `registry_entry` rows in the log yet, so this leak had never been
    // seen -- which is exactly why it needs a test rather than a look.
    expect(ACTIVITY_ENTITY_LABELS.registry_entry).toBe('Voter reference entry')
    expect(activityEntityLabel('registry_entry')).not.toMatch(/registry/i)
  })

  it('shows no raw stored value for the two that leaked', () => {
    expect(activityActionLabel('ready_for_pickup')).toBe('Ready for pickup')
    expect(activityActionLabel('marked ineligible')).not.toMatch(/ineligible/i)
    expect(activityEntityLabel('resident_account')).toBe('Resident account')
    expect(activityEntityLabel('medical_program')).toBe('Medical program')
  })

  it('agrees with the approved verification wording', () => {
    // `ineligible` is "Not a resident" to a user, so the action that
    // sets it cannot say "ineligible". Asserted against residentGroups
    // rather than importing it into displayLabels, which would couple
    // two modules that are independent on purpose.
    expect(activityActionLabel('marked ineligible').toLowerCase())
      .toContain(VERIFICATION_STATES.ineligible.label.toLowerCase())
  })

  it('returns an unknown value EXACTLY as stored', () => {
    // The audit trail is the one surface where a word nobody
    // anticipated must stay visible. Not blank, not guessed.
    expect(activityActionLabel('escalated')).toBe('escalated')
    expect(activityEntityLabel('barangay_term')).toBe('barangay_term')
    expect(activityActionLabel(undefined)).toBe('')
    expect(activityEntityLabel(null)).toBe('')
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

  it('still exports no verification map, now that it has action labels', () => {
    // The Activity Log maps label an ACTION recorded in the audit trail,
    // not `profiles.verification_status`. Re-checked here so adding them
    // cannot be read as permission to bring the status map back.
    expect(labels.VERIFICATION_STATUS_LABELS).toBeUndefined()
    expect(labels.ACTIVITY_ACTION_LABELS.verified).toBe('Verified')
  })
})
