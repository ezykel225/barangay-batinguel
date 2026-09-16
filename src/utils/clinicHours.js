// Clinic times are stored as display strings ("8:00 AM"), not `time`
// values, so anything that needs to reason about them has to parse
// them back. Kept here so the public page and the nurse's dashboard
// use one implementation.

// Minutes since midnight, or null if the string is not a time we
// recognise. Accepts both the stored "8:00 AM" form and a plain
// 24-hour "08:00", because the nurse types these by hand.
export const toMinutes = (value) => {
  if (!value) return null
  const text = String(value).trim().toUpperCase()

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NN|MN)?$/)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = match[2] ? parseInt(match[2], 10) : 0
  const suffix = match[3]

  if (Number.isNaN(hour) || hour > 23 || minute > 59) return null

  if (suffix === 'PM' && hour < 12) hour += 12
  if (suffix === 'AM' && hour === 12) hour = 0
  if (suffix === 'NN') hour = 12
  if (suffix === 'MN') hour = 0

  return hour * 60 + minute
}

// Display form. The bug this replaces: the old formatTime() assumed
// 24-hour input, so it split "8:00 AM" on the colon, read "00 AM" as
// the minutes and appended its own suffix -- producing "8:00 AM AM"
// on the live page. Parsing first means the input format no longer
// matters.
export const formatTime = (value) => {
  const minutes = toMinutes(value)
  if (minutes === null) return value || ''

  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60

  // 12:00 and 00:00 read as NN and MN locally, which is clearer than
  // "12:00 PM" for the boundary the lunch break sits on.
  if (minutes === 12 * 60) return '12:00 NN'
  if (minutes === 0) return '12:00 MN'

  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

// Minutes since midnight right now in Manila. Manila specifically,
// not the browser's clock: a resident whose phone is set to another
// timezone must still be told whether the clinic is open here.
export const manilaMinutesNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

export const manilaWeekday = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' })
    .format(new Date())

// Is the clinic on its scheduled lunch break right now? Null when the
// day has no break recorded, so the caller can tell "no break today"
// from "not on break at the moment".
export const isOnScheduledBreak = (day) => {
  if (!day) return null
  const start = toMinutes(day.break_start)
  const end = toMinutes(day.break_end)
  if (start === null || end === null) return null

  const now = manilaMinutesNow()
  if (now === null) return null

  return now >= start && now < end
}
