import {
  PERIOD_KEYS, addDays, bucketKeys, bucketLabel, granularityFor, isoWeekday, minusMonths, mondayOf, periodRange,
} from './analyticsPeriods'
import { manilaToday } from '../utils/displayLabels'

describe('Manila periods', () => {
  test('offers every required period, plus the existing previous-12-months view', () => {
    expect(PERIOD_KEYS).toEqual(['this_week', 'this_month', 'this_year', 'last_30_days', 'last_90_days', 'last_12_months', 'previous_12_months', 'custom', 'all'])
  })

  test('weeks start on Monday; Sunday belongs to the week that began six days earlier', () => {
    expect(isoWeekday('2026-11-02')).toBe(1) // Monday
    expect(isoWeekday('2026-11-08')).toBe(7) // Sunday
    expect(periodRange('this_week', '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(periodRange('this_week', '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-02' })
    // A week that starts in the previous month and year.
    expect(mondayOf('2026-01-01')).toBe('2025-12-29')
  })

  test('this month and this year run from their first day to today', () => {
    expect(periodRange('this_month', '2026-11-03')).toEqual({ from: '2026-11-01', to: '2026-11-03' })
    expect(periodRange('this_year', '2026-11-03')).toEqual({ from: '2026-01-01', to: '2026-11-03' })
  })

  test('last 30 and 90 days are that many calendar days including today', () => {
    expect(periodRange('last_30_days', '2026-03-01')).toEqual({ from: '2026-01-31', to: '2026-03-01' })
    expect(periodRange('last_90_days', '2026-11-03')).toEqual({ from: '2026-08-06', to: '2026-11-03' })
  })

  test('month ends and leap years clamp the way PostgreSQL does', () => {
    expect(minusMonths('2024-02-29', 12)).toBe('2023-02-28')
    expect(minusMonths('2026-03-31', 1)).toBe('2026-02-28')
    expect(minusMonths('2024-03-31', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(periodRange('last_12_months', '2024-02-29')).toEqual({ from: '2023-02-28', to: '2024-02-29' })
    expect(periodRange('previous_12_months', '2026-11-03')).toEqual({ from: '2024-11-03', to: '2025-11-02' })
  })

  test('custom passes the chosen dates through; all records has no bounds', () => {
    expect(periodRange('custom', '2026-11-03', { from: '2026-01-05', to: '' })).toEqual({ from: '2026-01-05', to: '' })
    expect(periodRange('all', '2026-11-03')).toEqual({ from: '', to: '' })
  })

  test('today is the Manila date, not the browser date, around midnight UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T17:30:00Z')) // 01:30 on 1 Oct in Manila
    try {
      expect(manilaToday()).toBe('2026-10-01')
      expect(periodRange('this_month', manilaToday())).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    } finally { jest.useRealTimers() }
  })
})

describe('time-series granularity', () => {
  test('daily up to 31 days, weekly up to 92, monthly beyond and for unbounded ranges', () => {
    expect(granularityFor('2026-11-02', '2026-11-08')).toBe('day')
    expect(granularityFor('2026-10-01', '2026-10-31')).toBe('day')
    expect(granularityFor('2026-10-01', '2026-11-01')).toBe('week')
    expect(granularityFor('2026-08-06', '2026-11-03')).toBe('week')
    expect(granularityFor('2026-01-01', '2026-11-03')).toBe('month')
    expect(granularityFor('', '2026-11-03')).toBe('month')
  })

  test('buckets cover the whole range with no gaps, Monday weeks, and leap February', () => {
    expect(bucketKeys('2024-02-27', '2024-03-01', 'day')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01'])
    expect(bucketKeys('2026-11-04', '2026-11-17', 'week')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(bucketKeys('2025-11-15', '2026-02-02', 'month')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(bucketKeys('2026-02-02', '2026-01-01', 'day')).toEqual([])
  })

  test('a partial last week is labelled to the end of the range, not past it', () => {
    expect(bucketLabel('2026-11-02', 'week', '2026-11-04')).toBe('Nov 2–Nov 4')
    expect(bucketLabel('2026-11-02', 'week', '2026-11-30')).toBe('Nov 2–Nov 8')
    expect(bucketLabel('2026-02', 'month')).toBe('Feb 2026')
  })
})
