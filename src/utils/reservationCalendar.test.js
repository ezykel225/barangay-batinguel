// The court calendar's occupancy rules.
//
// Pure module, no Supabase import, so these run without the environment
// variables `App.test.js` needs.
//
// ⚠️ The load-bearing assertion in this file is that `declined` and
// `cancelled` do NOT make a date look occupied. The definition of
// "held" is `status IN ('pending','approved')` in four places that must
// agree: the exclusion constraint's partial WHERE, both public RPCs,
// the booking form, and this module. If one drifts, an official's
// calendar and the court's actual availability stop matching.

import {
  HOLDING_STATUSES,
  SLOTS_PER_DAY,
  buildReservationCalendar,
  describeReservationDay,
  holdsSlot,
  reservationsOnDate,
} from './reservationCalendar'
import { ALL_SLOTS } from './reservationWindow'
import { buildMonthGrid } from './monthGrid'

const booking = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  preferred_date: '2026-10-15',
  preferred_time: '7:00 PM',
  duration_hours: 2,
  status: 'approved',
  exception_reason: null,
  full_name: 'ZZ Test Booking',
  ...overrides,
})

const cellFor = (key, { today = '' } = {}) => {
  const [year, month] = key.split('-').map(Number)
  return buildMonthGrid(year, month - 1, { today }).filter(Boolean)
    .find((c) => c.key === key)
}

describe('which statuses hold the court', () => {
  it('is pending and approved, and nothing else', () => {
    expect(HOLDING_STATUSES).toEqual(['pending', 'approved'])
    expect(holdsSlot(booking({ status: 'pending' }))).toBe(true)
    expect(holdsSlot(booking({ status: 'approved' }))).toBe(true)
  })

  it('does NOT include declined or cancelled', () => {
    // ⚠️ Slots are held on submission and freed by a decline or a
    // cancellation. A declined booking making a date look busy would
    // turn the court away from people who could have had it.
    expect(holdsSlot(booking({ status: 'declined' }))).toBe(false)
    expect(holdsSlot(booking({ status: 'cancelled' }))).toBe(false)
  })

  it('does not throw on a malformed row', () => {
    expect(holdsSlot(undefined)).toBe(false)
    expect(holdsSlot({})).toBe(false)
  })

  it("counts the court's slots rather than hard-coding them", () => {
    expect(SLOTS_PER_DAY).toBe(ALL_SLOTS.length)
  })
})

describe('building a month of reservations', () => {
  it('holds the hours a booking actually occupies', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_time: '7:00 PM', duration_hours: 2 }),
    ])
    // 7 PM for 2 hours is hours 19 and 20.
    expect([...calendar.get('2026-10-15').held].sort()).toEqual([19, 20])
  })

  it('holds every hour of a multi-hour booking', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_time: '5:00 PM', duration_hours: 4 }),
    ])
    expect([...calendar.get('2026-10-15').held].sort()).toEqual([17, 18, 19, 20])
  })

  it('runs an office-hours exception straight through noon', () => {
    // ⚠️ The barangay's 2026-09-30 decision. Walking slot labels would
    // stop at the 11 AM / 1 PM gap and report two hours instead of four.
    const calendar = buildReservationCalendar([
      booking({
        preferred_time: '11:00 AM',
        duration_hours: 4,
        exception_reason: 'Ayuda distribution',
      }),
    ])
    const day = calendar.get('2026-10-15')
    expect([...day.held].sort((a, b) => a - b)).toEqual([11, 12, 13, 14])
    expect(day.exceptions).toHaveLength(1)
  })

  it('holds all eight hours of a full-day exception', () => {
    const calendar = buildReservationCalendar([
      booking({
        preferred_time: '8:00 AM',
        duration_hours: 8,
        exception_reason: 'Ayuda distribution, all day',
      }),
    ])
    expect(calendar.get('2026-10-15').held.size).toBe(8)
  })

  it('holds nothing for a declined or cancelled booking', () => {
    const calendar = buildReservationCalendar([
      booking({ status: 'declined' }),
      booking({ status: 'cancelled' }),
    ])
    const day = calendar.get('2026-10-15')
    expect(day.held.size).toBe(0)
    expect(day.holding).toHaveLength(0)
    // ...but they are still ON the date. An official looking at the day
    // should see that two bookings were refused, not an empty panel.
    expect(day.rows).toHaveLength(2)
  })

  it('merges several bookings on one date', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_time: '5:00 PM', duration_hours: 1 }),
      booking({ preferred_time: '8:00 PM', duration_hours: 2, status: 'pending' }),
      booking({ preferred_time: '6:00 PM', duration_hours: 1, status: 'declined' }),
    ])
    const day = calendar.get('2026-10-15')
    expect([...day.held].sort((a, b) => a - b)).toEqual([17, 20, 21])
    expect(day.holding).toHaveLength(2)
    expect(day.pending).toHaveLength(1)
    expect(day.rows).toHaveLength(3)
  })

  it('keeps separate dates separate', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_date: '2026-10-15' }),
      booking({ preferred_date: '2026-10-16' }),
    ])
    expect(calendar.size).toBe(2)
    expect(calendar.get('2026-10-15').holding).toHaveLength(1)
  })

  it('skips a booking with no usable date', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_date: null }),
      booking({ preferred_date: 'soon' }),
    ])
    expect(calendar.size).toBe(0)
  })

  it('survives an empty or missing list', () => {
    expect(buildReservationCalendar([]).size).toBe(0)
    expect(buildReservationCalendar(undefined).size).toBe(0)
  })
})

describe('how a day is described to the calendar', () => {
  const today = '2026-10-10'

  it('says so when nothing is booked', () => {
    const calendar = buildReservationCalendar([])
    const day = describeReservationDay(cellFor('2026-10-15', { today }), calendar)
    expect(day).toMatchObject({ count: 0, tone: 'default' })
    expect(day.label).toMatch(/no bookings/i)
  })

  it('counts bookings, not hours, and names the hours in the label', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_time: '5:00 PM', duration_hours: 2 }),
      booking({ preferred_time: '8:00 PM', duration_hours: 1 }),
    ])
    const day = describeReservationDay(cellFor('2026-10-15', { today }), calendar)
    expect(day.count).toBe(2)
    expect(day.label).toMatch(/2 bookings/)
    expect(day.label).toMatch(/3 hours held/)
  })

  it('is amber while a booking still needs an official', () => {
    const calendar = buildReservationCalendar([booking({ status: 'pending' })])
    const day = describeReservationDay(cellFor('2026-10-15', { today }), calendar)
    expect(day.tone).toBe('warn')
    expect(day.label).toMatch(/1 awaiting a decision/)
  })

  it('is green once every booking on the day is decided', () => {
    const calendar = buildReservationCalendar([booking({ status: 'approved' })])
    expect(describeReservationDay(cellFor('2026-10-15', { today }), calendar).tone).toBe('has')
  })

  it('names office-hours requests in the accessible label', () => {
    const calendar = buildReservationCalendar([
      booking({
        preferred_time: '9:00 AM',
        duration_hours: 3,
        exception_reason: 'Health activity',
      }),
    ])
    const day = describeReservationDay(cellFor('2026-10-15', { today }), calendar)
    expect(day.label).toMatch(/1 office-hours request/)
  })

  it('greys a past day but still shows its count', () => {
    const calendar = buildReservationCalendar([
      booking({ preferred_date: '2026-10-01' }),
    ])
    const day = describeReservationDay(cellFor('2026-10-01', { today }), calendar)
    expect(day.tone).toBe('muted')
    expect(day.count).toBe(1)
  })
})

describe("the selected day's reservations", () => {
  it('returns every row on the date, in clock order', () => {
    const calendar = buildReservationCalendar([
      booking({ id: 'late', preferred_time: '9:00 PM' }),
      booking({ id: 'early', preferred_time: '5:00 PM' }),
      booking({ id: 'mid', preferred_time: '7:00 PM', status: 'declined' }),
    ])
    expect(reservationsOnDate(calendar, '2026-10-15').map((r) => r.id))
      .toEqual(['early', 'mid', 'late'])
  })

  it('puts an unrecognised time last rather than dropping it', () => {
    const calendar = buildReservationCalendar([
      booking({ id: 'odd', preferred_time: '9:30 PM' }),
      booking({ id: 'ok', preferred_time: '5:00 PM' }),
    ])
    expect(reservationsOnDate(calendar, '2026-10-15').map((r) => r.id))
      .toEqual(['ok', 'odd'])
  })

  it('returns nothing for a date with no bookings or a bad key', () => {
    const calendar = buildReservationCalendar([booking()])
    expect(reservationsOnDate(calendar, '2026-10-16')).toEqual([])
    expect(reservationsOnDate(calendar, 'nonsense')).toEqual([])
    expect(reservationsOnDate(calendar, null)).toEqual([])
  })
})
