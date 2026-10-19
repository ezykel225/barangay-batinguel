import { portalDutyDate, portalShiftWindow, portalShiftLabel } from './tanodPresentation'

const first = { assignment_date: '2026-10-19', shift_start: '2026-10-18T22:00:00Z', shift_end: '2026-10-19T06:00:00Z' }
test('portal dates use a full Manila calendar date and same-day windows use times only', () => {
  expect(portalDutyDate('2026-10-19')).toBe('19 October 2026')
  expect(portalShiftWindow(first)).toBe('6:00 AM – 2:00 PM')
})
test('overnight windows include both dates, including year crossover', () => {
  const label = portalShiftWindow({ shift_start: '2026-12-31T14:00:00Z', shift_end: '2026-12-31T22:00:00Z' })
  expect(label).toContain('Dec 31, 2026')
  expect(label).toContain('Jan 1, 2027')
  expect(label).toContain('10:00 PM')
  expect(label).toContain('6:00 AM')
})
test('missing or invalid window times do not invent a shift', () => {
  expect(portalShiftWindow({})).toBe('Start/end times not yet recorded')
  expect(portalShiftWindow({ shift_start: 'invalid', shift_end: first.shift_end })).toBe('Start/end times not yet recorded')
  expect(portalShiftLabel({}, [first])).toBeNull()
})
test.each([
  ['06:00', '14:00', '2026-10-19', 'Shift 1'],
  ['14:00', '22:00', '2026-10-19', 'Shift 2'],
  ['22:00', '06:00', '2026-10-20', 'Shift 3'],
])('stored %s to %s window determines the label independently of assignment order', (start, end, endDate, expected) => {
  const entry = { assignment_date: '2026-10-19', shift_start: '2026-10-19T' + start + ':00+08:00', shift_end: endDate + 'T' + end + ':00+08:00' }
  expect(portalShiftLabel(entry, [])).toBe(expected)
  expect(portalShiftLabel(entry, [first, entry])).toBe(expected)
  expect(portalShiftLabel(entry, [entry, first])).toBe(expected)
})

test('unrecognized and multi-day windows use neutral labels', () => {
  expect(portalShiftLabel({ ...first, shift_start: '2026-10-19T07:00:00+08:00', shift_end: '2026-10-19T15:00:00+08:00' })).toBe('Scheduled shift')
  expect(portalShiftLabel({ ...first, shift_end: '2026-10-20T06:00:00Z' })).toBe('Scheduled shift')
})

// Attendance labels may omit only an unambiguous repeated date.
test('attendance presentation keeps overnight and off-date timestamps explicit', () => {
  const { portalAttendanceTime } = require('./tanodPresentation')
  const shift = { assignment_date: '2026-10-19', shift_start: '2026-10-19T06:00:00+08:00', shift_end: '2026-10-19T14:00:00+08:00' }
  expect(portalAttendanceTime('2026-10-19T10:21:00+08:00', shift)).toBe('10:21 AM')
  expect(portalAttendanceTime('2026-10-20T10:21:00+08:00', shift)).toContain('Oct 20, 2026')
  expect(portalAttendanceTime('2026-10-20T06:00:00+08:00', { ...shift, shift_end: '2026-10-20T06:00:00+08:00' })).toContain('Oct 20, 2026')
})
