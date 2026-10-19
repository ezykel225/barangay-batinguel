// Portal-only labels. Public duty formatting and eligibility calculations stay unchanged.
const validWindow = (shift) => shift.shift_start && shift.shift_end
  && Number.isFinite(Date.parse(shift.shift_start)) && Number.isFinite(Date.parse(shift.shift_end))
const dateKey = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value))
export const portalDutyDate = (value) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(value + 'T12:00:00+08:00'))
export const portalShiftWindow = (shift) => {
  if (!validWindow(shift)) return 'Start/end times not yet recorded'
  const sameDay = dateKey(shift.shift_start) === dateKey(shift.shift_end)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
    ...(sameDay ? {} : { day: 'numeric', month: 'short', year: 'numeric' }),
  })
  return formatter.format(new Date(shift.shift_start)) + ' – ' + formatter.format(new Date(shift.shift_end))
}
// Demonstration labels describe recognized stored Manila windows, never roster order.
// Actual stored times remain authoritative; other windows get a neutral label.
export const portalShiftLabel = (shift) => {
  if (!validWindow(shift)) return null
  const time = (value) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
  if (Date.parse(shift.shift_end) - Date.parse(shift.shift_start) !== 8 * 60 * 60 * 1000) return 'Scheduled shift'
  return ({ '06:00:00/14:00:00': 'Shift 1', '14:00:00/22:00:00': 'Shift 2',
    '22:00:00/06:00:00': 'Shift 3' })[time(shift.shift_start) + '/' + time(shift.shift_end)] || 'Scheduled shift'
}

// Hide a repeated date only when both the stored window and attendance share it.
export const portalAttendanceTime = (value, shift) => {
  const compact = validWindow(shift) && dateKey(shift.shift_start) === dateKey(shift.shift_end)
    && dateKey(value) === shift.assignment_date
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
    ...(compact ? {} : { day: 'numeric', month: 'short', year: 'numeric' }),
  }).format(new Date(value))
}
