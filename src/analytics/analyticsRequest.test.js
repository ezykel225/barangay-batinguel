import { ACCESS_DENIED, customRangeProblem, isAccessDenied, nextFilters } from './analyticsRequest'
import { settlePersonRecord } from '../people/personRecord'

describe('custom range rules (Remediation C)', () => {
  test('a preset window never needs dates', () => {
    for (const window of ['all', 'last_30_days', 'last_90_days', 'last_12_months', 'previous_12_months']) {
      expect(customRangeProblem({ window, from: '', to: '' })).toBe('')
    }
  })
  test('a custom range with no dates is incomplete and says what is missing', () => {
    expect(customRangeProblem({ window: 'custom', from: '', to: '' })).toMatch(/start date, an end date, or both/)
  })
  test('a custom range with one date is valid, as the database allows', () => {
    expect(customRangeProblem({ window: 'custom', from: '2026-01-01', to: '' })).toBe('')
    expect(customRangeProblem({ window: 'custom', from: '', to: '2026-01-31' })).toBe('')
  })
  test('an end before the start is refused; a one-day range is not', () => {
    expect(customRangeProblem({ window: 'custom', from: '2026-02-10', to: '2026-02-01' })).toMatch(/on or before the end date/)
    expect(customRangeProblem({ window: 'custom', from: '2026-02-01', to: '2026-02-01' })).toBe('')
  })
  test('leaving the custom range clears its dates; other keys keep them', () => {
    const custom = { window: 'custom', from: '2026-01-01', to: '2026-01-31', category: 'other', area: '' }
    expect(nextFilters(custom, 'window', 'all')).toEqual({ ...custom, window: 'all', from: '', to: '' })
    expect(nextFilters(custom, 'category', 'theft')).toEqual({ ...custom, category: 'theft' })
    expect(nextFilters(custom, 'window', 'custom')).toEqual(custom)
  })
  test('only SQLSTATE 42501 reads as a restriction', () => {
    expect(ACCESS_DENIED).toBe('42501')
    expect(isAccessDenied({ code: '42501' })).toBe(true)
    expect(isAccessDenied({ code: 'P0001' })).toBe(false)
    expect(isAccessDenied(new Error('x'))).toBe(false)
    expect(isAccessDenied(undefined)).toBe(false)
  })
})

describe('settlePersonRecord: analytics never hide the history', () => {
  const history = { identity: { kind: 'resident', id: 'r1' }, incidents: [] }
  test('both succeed', async () => {
    await expect(settlePersonRecord(async () => history, async () => ({ summary: {} })))
      .resolves.toEqual({ ...history, analytics: { summary: {} }, analyticsUnavailable: false })
  })
  test('failed analytics still return the history, marked unavailable', async () => {
    await expect(settlePersonRecord(async () => history, async () => { throw new Error('down') }))
      .resolves.toEqual({ ...history, analytics: null, analyticsUnavailable: true })
  })
  test('a failed history rejects with its own error, even when analytics succeed', async () => {
    const refused = Object.assign(new Error('refused'), { code: '42501' })
    await expect(settlePersonRecord(async () => { throw refused }, async () => ({}))).rejects.toBe(refused)
  })
  test('both requests start together rather than one after the other', async () => {
    const started = []
    await settlePersonRecord(async () => { started.push('history'); return history }, async () => { started.push('analytics'); return {} })
    expect(started).toEqual(['history', 'analytics'])
  })
})
