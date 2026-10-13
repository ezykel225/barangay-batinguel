// Events on a calendar, and which of them are still to come.
//
// Pure module, no Supabase import, so these run without the environment
// variables `App.test.js` needs.
//
// ⚠️ Two defects these hold against:
//
// 1. The homepage's "Upcoming Events" section ordered every event by
//    date and took the first four, with no date filter. On live data
//    that meant three events from 2024 shown FIRST and the single
//    genuinely upcoming one last, under a heading promising the
//    opposite. Filter, then limit.
// 2. A stored 'YYYY-MM-DD' must not shift a day because somebody fed it
//    to `new Date()`. `event_month`/`event_day` are written with exactly
//    that pattern and are not read here.

import {
  buildEventCalendar,
  describeEventDay,
  eventCardDate,
  eventTimeLabel,
  eventsOnDate,
  pastEvents,
  upcomingEvents,
} from './eventCalendar'
import { buildMonthGrid } from './monthGrid'
import fs from 'fs'
import path from 'path'

const ev = (id, date, overrides = {}) => ({
  id,
  title: `Event ${id}`,
  event_date: date,
  event_time: null,
  ...overrides,
})

const cellFor = (key, { today = '' } = {}) => {
  const [year, month] = key.split('-').map(Number)
  return buildMonthGrid(year, month - 1, { today }).filter(Boolean)
    .find((c) => c.key === key)
}

describe('placing events on dates', () => {
  it('places an event on its event_date', () => {
    const calendar = buildEventCalendar([ev('a', '2026-10-15')])
    expect(calendar.get('2026-10-15').map((e) => e.id)).toEqual(['a'])
  })

  it('does NOT shift the date through UTC parsing', () => {
    // ⚠️ The regression. `new Date('2026-10-01')` is UTC midnight, so
    // `.getDate()` west of UTC gives 30 September. An event on the 1st
    // must appear on the 1st in every runtime.
    const calendar = buildEventCalendar([ev('first', '2026-10-01')])
    expect(calendar.has('2026-10-01')).toBe(true)
    expect(calendar.has('2026-09-30')).toBe(false)
  })

  it('ignores the denormalised display columns entirely', () => {
    // event_month/event_day are a client-side copy and can disagree.
    // The calendar must follow event_date even when they do.
    const calendar = buildEventCalendar([
      ev('a', '2026-10-15', { event_month: 'JAN', event_day: '01' }),
    ])
    expect(calendar.has('2026-10-15')).toBe(true)
    expect(calendar.has('2026-01-01')).toBe(false)
  })

  it('puts several events on the same date', () => {
    const calendar = buildEventCalendar([
      ev('a', '2026-10-15'), ev('b', '2026-10-15'), ev('c', '2026-10-16'),
    ])
    expect(calendar.get('2026-10-15')).toHaveLength(2)
    expect(calendar.get('2026-10-16')).toHaveLength(1)
  })

  it('leaves out an event with no usable date', () => {
    const calendar = buildEventCalendar([ev('a', null), ev('b', 'sometime')])
    expect(calendar.size).toBe(0)
  })

  it('survives an empty or missing list', () => {
    expect(buildEventCalendar([]).size).toBe(0)
    expect(buildEventCalendar(undefined).size).toBe(0)
  })
})

describe('how an event day is described', () => {
  const today = '2026-10-10'

  it('says so when a day is empty', () => {
    const day = describeEventDay(cellFor('2026-10-15', { today }), buildEventCalendar([]))
    expect(day).toMatchObject({ count: 0, tone: 'default' })
    expect(day.label).toMatch(/no events/i)
  })

  it('counts the events and names them in the label', () => {
    const calendar = buildEventCalendar([ev('a', '2026-10-15'), ev('b', '2026-10-15')])
    const day = describeEventDay(cellFor('2026-10-15', { today }), calendar)
    expect(day).toMatchObject({ count: 2, tone: 'has' })
    expect(day.label).toBe('2 events')
  })

  it('uses the singular for one event', () => {
    const calendar = buildEventCalendar([ev('a', '2026-10-15')])
    expect(describeEventDay(cellFor('2026-10-15', { today }), calendar).label).toBe('1 event')
  })

  it('greys a past day but keeps its count', () => {
    const calendar = buildEventCalendar([ev('a', '2026-10-01')])
    const day = describeEventDay(cellFor('2026-10-01', { today }), calendar)
    expect(day).toMatchObject({ count: 1, tone: 'muted' })
  })
})

describe('the selected day\'s events', () => {
  it('sorts by time, then title, so the order is stable', () => {
    const calendar = buildEventCalendar([
      ev('late', '2026-10-15', { event_time: '14:00:00', title: 'Zebra' }),
      ev('early', '2026-10-15', { event_time: '08:00:00', title: 'Apple' }),
    ])
    expect(eventsOnDate(calendar, '2026-10-15').map((e) => e.id)).toEqual(['early', 'late'])
  })

  it('puts a timed event before an untimed one', () => {
    const calendar = buildEventCalendar([
      ev('untimed', '2026-10-15', { event_time: null, title: 'Aaa' }),
      ev('timed', '2026-10-15', { event_time: '09:00:00', title: 'Zzz' }),
    ])
    expect(eventsOnDate(calendar, '2026-10-15').map((e) => e.id)).toEqual(['timed', 'untimed'])
  })

  it('falls back to the title when neither has a time', () => {
    const calendar = buildEventCalendar([
      ev('b', '2026-10-15', { title: 'Beta' }),
      ev('a', '2026-10-15', { title: 'Alpha' }),
    ])
    expect(eventsOnDate(calendar, '2026-10-15').map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('returns nothing for an empty date or a bad key', () => {
    const calendar = buildEventCalendar([ev('a', '2026-10-15')])
    expect(eventsOnDate(calendar, '2026-10-16')).toEqual([])
    expect(eventsOnDate(calendar, 'nonsense')).toEqual([])
    expect(eventsOnDate(calendar, undefined)).toEqual([])
  })
})

describe('upcoming events', () => {
  // The live data this was found on: three 2024 events and one in 2026.
  const live = [
    ev('oct28', '2024-10-28'),
    ev('oct30', '2024-10-30'),
    ev('nov02', '2024-11-02'),
    ev('dec19', '2026-12-19'),
  ]
  const today = '2026-10-01'

  it('EXCLUDES past events before applying the limit', () => {
    // ⚠️ The defect, exactly. Sorting all four and taking the first
    // four returns the three 2024 events first. Filtering first
    // returns only the one that is genuinely upcoming.
    const naive = [...live].sort((a, b) =>
      a.event_date < b.event_date ? -1 : 1).slice(0, 4)
    expect(naive.map((e) => e.id)).toEqual(['oct28', 'oct30', 'nov02', 'dec19'])

    expect(upcomingEvents(live, { limit: 4, today }).map((e) => e.id)).toEqual(['dec19'])
  })

  it('counts today itself as upcoming', () => {
    const events = [ev('today', '2026-10-01'), ev('yesterday', '2026-09-30')]
    expect(upcomingEvents(events, { today }).map((e) => e.id)).toEqual(['today'])
  })

  it('applies the limit only after filtering', () => {
    const events = [
      ev('past', '2024-01-01'),
      ev('a', '2026-10-02'), ev('b', '2026-10-03'), ev('c', '2026-10-04'),
    ]
    expect(upcomingEvents(events, { limit: 2, today }).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('returns everything upcoming when no limit is given', () => {
    const events = [ev('a', '2026-10-02'), ev('b', '2026-10-03')]
    expect(upcomingEvents(events, { today })).toHaveLength(2)
  })

  it('sorts soonest first', () => {
    const events = [ev('later', '2026-12-01'), ev('sooner', '2026-10-05')]
    expect(upcomingEvents(events, { today }).map((e) => e.id)).toEqual(['sooner', 'later'])
  })

  it('treats an event with no date as unscheduled, not upcoming', () => {
    // Putting it under a heading that says Upcoming would assert a date
    // the row does not have.
    const events = [ev('nodate', null), ev('real', '2026-10-05')]
    expect(upcomingEvents(events, { today }).map((e) => e.id)).toEqual(['real'])
  })

  it('survives an empty or missing list', () => {
    expect(upcomingEvents([], { today })).toEqual([])
    expect(upcomingEvents(undefined, { today })).toEqual([])
  })

  it('defaults to the Manila date when none is given', () => {
    // Not pinned to a value -- only that it runs and filters against
    // the project's one answer to "what day is it".
    expect(Array.isArray(upcomingEvents(live))).toBe(true)
  })
})

describe('past events', () => {
  const today = '2026-10-01'

  it('is the complement, most recent first', () => {
    const events = [
      ev('old', '2024-01-01'), ev('recent', '2026-09-30'), ev('future', '2026-12-01'),
    ]
    expect(pastEvents(events, { today }).map((e) => e.id)).toEqual(['recent', 'old'])
  })

  it('does not count today as past', () => {
    expect(pastEvents([ev('today', '2026-10-01')], { today })).toEqual([])
  })
})

describe('eventTimeLabel', () => {
  // PostgREST hands a `time` column back as HH:MM:SS, which
  // `clinicHours.formatTime` does not recognise on its own.
  it('reads the HH:MM:SS a `time` column actually returns', () => {
    expect(eventTimeLabel('14:00:00')).toBe('2:00 PM')
    expect(eventTimeLabel('08:30:00')).toBe('8:30 AM')
    expect(eventTimeLabel('00:00:00')).toBe('12:00 MN')
    expect(eventTimeLabel('12:00:00')).toBe('12:00 NN')
  })

  it('reads it with no seconds, and with fractional seconds', () => {
    expect(eventTimeLabel('14:00')).toBe('2:00 PM')
    expect(eventTimeLabel('14:00:00.5')).toBe('2:00 PM')
  })

  // ⚠️ THE ONE THAT MATTERS TODAY. `events.event_time` is NULL on every
  // row in the live table, so the caller must be able to render nothing
  // at all -- a "Time:" label with a blank after it reads as a value
  // that failed to load.
  it('is empty for null, undefined and blank', () => {
    expect(eventTimeLabel(null)).toBe('')
    expect(eventTimeLabel(undefined)).toBe('')
    expect(eventTimeLabel('')).toBe('')
    expect(eventTimeLabel('   ')).toBe('')
  })

  // ⚠️ It does NOT dig a time out of a location. Three legacy rows
  // store one there -- "2:00 PM - Main Covered Court" -- and splitting
  // that string would be guessing at a format nothing guarantees.
  it('drops anything that is not a time rather than printing it', () => {
    expect(eventTimeLabel('2:00 PM - Main Covered Court')).toBe('')
    expect(eventTimeLabel('Barangay Covered Court')).toBe('')
    expect(eventTimeLabel('all day')).toBe('')
  })

  it('still reads a display string somebody typed by hand', () => {
    expect(eventTimeLabel('2:00 PM')).toBe('2:00 PM')
    expect(eventTimeLabel('8:30 am')).toBe('8:30 AM')
  })
})


describe('eventCardDate', () => {
  // The public Health Center card printed `event_month`/`event_day`
  // alone, so it showed "NOV 05" and "OCT 15" with no year -- and on
  // the live table the two NOV rows are 2024. A correctly sorted list
  // read as shuffled, which is how the missing upcoming filter hid.

  it('derives the month, day and year from event_date', () => {
    expect(eventCardDate({ event_date: '2026-10-20' }))
      .toEqual({ month: 'OCT', day: '20', year: '2026' })
    expect(eventCardDate({ event_date: '2024-11-05' }))
      .toEqual({ month: 'NOV', day: '05', year: '2024' })
  })

  it('pads a single-digit day, so the tile does not jump width', () => {
    expect(eventCardDate({ event_date: '2026-03-07' }).day).toBe('07')
  })

  it('names every month the same way the write path does', () => {
    // ⚠️ Same derivation as the two dashboards' `displayPartsFor`:
    // MONTH_NAMES, first three letters, uppercased. If these drift, a
    // card and the column it was written from disagree.
    const months = Array.from({ length: 12 }, (_, i) =>
      eventCardDate({ event_date: `2026-${String(i + 1).padStart(2, '0')}-01` }).month)
    expect(months).toEqual([
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ])
  })

  it('IGNORES the stored display copies when event_date is usable', () => {
    // ⚠️ The load-bearing one. `event_month`/`event_day` are
    // denormalised copies; mixing them with a year taken from
    // `event_date` could print a date that exists in neither.
    expect(eventCardDate({
      event_date: '2026-10-20',
      event_month: 'XXX',
      event_day: '99',
    })).toEqual({ month: 'OCT', day: '20', year: '2026' })
  })

  it('falls back to the stored copies ONLY when event_date is unusable', () => {
    // The one case where they are all there is.
    expect(eventCardDate({ event_date: null, event_month: 'NOV', event_day: '05' }))
      .toEqual({ month: 'NOV', day: '05', year: '' })
    expect(eventCardDate({ event_date: 'not a date', event_month: 'JAN', event_day: '01' }))
      .toEqual({ month: 'JAN', day: '01', year: '' })
  })

  it('returns an EMPTY year rather than guessing one', () => {
    // Inventing a year for a row whose date the database could not give
    // us would assert something no column holds -- and the caller
    // renders the element only when the year is non-empty.
    expect(eventCardDate({ event_date: null, event_month: 'NOV', event_day: '05' }).year).toBe('')
    expect(eventCardDate({}).year).toBe('')
    expect(eventCardDate(null).year).toBe('')
  })

  it('survives a missing row and a row with nothing on it', () => {
    expect(eventCardDate(null)).toEqual({ month: '', day: '', year: '' })
    expect(eventCardDate(undefined)).toEqual({ month: '', day: '', year: '' })
    expect(eventCardDate({})).toEqual({ month: '', day: '', year: '' })
  })

  it('refuses a date the month does not have, rather than sliding it', () => {
    // `parseDateKey`'s rule: 2026-02-30 is not a date. With no usable
    // date the stored copies are shown and the year stays empty.
    expect(eventCardDate({ event_date: '2026-02-30', event_month: 'FEB', event_day: '30' }))
      .toEqual({ month: 'FEB', day: '30', year: '' })
  })

  it('tolerates a timestamp, reading the date part only', () => {
    expect(eventCardDate({ event_date: '2026-10-20T00:00:00+08:00' }))
      .toEqual({ month: 'OCT', day: '20', year: '2026' })
  })

  it('constructs no Date from a date string', () => {
    // ⚠️ The module's own rule, and the reason the day cannot shift by a
    // timezone. `new Date('2026-10-20')` is UTC midnight and reads back
    // as the 19th west of UTC.
    const source = fs.readFileSync(path.join(__dirname, 'eventCalendar.js'), 'utf8')
    const body = source.slice(source.indexOf('export const eventCardDate'))
    expect(body).not.toMatch(/new Date\(/)
    expect(body).toContain('parseDateKey')
  })
})
