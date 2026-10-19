export const dutyDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (key) => parts.find((part) => part.type === key).value
  return `${value('year')}-${value('month')}-${value('day')}`
}
export const dutyTime = (value) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Time not recorded'
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
export const shiftWindow = (shift) => shift.shift_start && shift.shift_end ? `${dutyTime(shift.shift_start)} – ${dutyTime(shift.shift_end)}` : 'Start/end times not yet recorded'
export const shiftIsCurrent = (shift, now = new Date()) => !!shift.shift_start && !!shift.shift_end && new Date(shift.shift_start) <= now && now < new Date(shift.shift_end)
export const attendanceOpen = (shift) => !!shift.checked_in_at && !shift.checked_out_at
export const dutyState = (shift, now = new Date()) => shift.checked_out_at ? 'Completed'
  : attendanceOpen(shift) ? shift.active && shiftIsCurrent(shift, now) ? 'Currently on duty' : 'Check-out needed'
    : shift.active ? 'Scheduled' : 'Assignment inactive'
export const manilaInputNow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  return `${dutyDate(now)}T${parts.find((p) => p.type === 'hour').value}:${parts.find((p) => p.type === 'minute').value}`
}
