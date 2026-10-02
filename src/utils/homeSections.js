// The two Home sections that were showing everything they had.
//
// Pure, for the reason the rest of `utils/` is: `Home.jsx` imports the
// Supabase client, so nothing here can be unit-tested from inside it.

import { DAY_ORDER } from './clinicSchedule'
import { manilaWeekday } from './clinicHours'

// ─── Announcement excerpts ────────────────────────────────────────────
//
// ⚠️ THE FULL TEXT IS NEVER TOUCHED. This shortens what the CARD shows.
// `/announcements/:id` reads the same `description` column straight out
// of the row, so the detail page is unaffected -- and that is the whole
// point: the card is a doorway, and a card that prints an entire notice
// has nothing left to click through to.
//
// Three lines is what the card has room for, which is roughly this many
// characters at the card's width. The CSS clamps to exactly three lines
// as well, and both are deliberate: the clamp makes every card the same
// height whatever the text does, and this keeps a 4,000-character notice
// out of the DOM of a page that is already fetching five sections.
export const EXCERPT_MAX_CHARS = 180

export const announcementExcerpt = (text, maxChars = EXCERPT_MAX_CHARS) => {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!value) return ''
  if (value.length <= maxChars) return value

  // Cut on a word boundary where there is one, so the excerpt does not
  // end mid-word. A single unbroken token longer than the limit -- a
  // URL, a run of hyphens -- has no boundary to find, and is cut where
  // the limit falls rather than returned whole.
  const window = value.slice(0, maxChars)
  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? window.slice(0, lastSpace) : window

  // Three dots, not a single-character ellipsis -- the X1 convention
  // the loading labels already follow.
  return `${cut.replace(/[.,;:!?-]+$/, '')}...`
}

// ─── The next waste collection ────────────────────────────────────────
//
// ⚠️ THIS IS DERIVED, NOT INVENTED, and if it cannot be derived it is
// not shown. `waste_schedule.day_of_week` holds a weekday NAME and the
// schedule recurs weekly, so "the next collection" is a question the
// stored data can actually answer: the fewest days from today to that
// weekday. What the table does NOT hold is a date, a fortnightly or
// monthly pattern, or an exception for a holiday -- so a row whose
// `day_of_week` is not a weekday name is left out of this entirely
// rather than guessed at, and when nothing is left the caller renders
// no summary at all.
//
// ⚠️ Manila's weekday, never the browser's. A resident whose phone is
// set to another timezone must be told when the truck comes HERE. Same
// rule as `manilaToday()` for events and reservations.
//
// ⚠️ Today counts as the next collection, not as missed. `time_label`
// is free text ("7:00 AM - 4:00 PM", and one live row reads
// "7:00 AM - 10:00"), so deciding whether today's window has already
// passed would mean parsing a range this column does not guarantee --
// and telling somebody their collection is six days away on the morning
// it happens is the worse error. The same reasoning as `upcomingEvents`:
// an event this afternoon has not happened yet.
export const daysUntilWeekday = (weekday, today) => {
  const from = DAY_ORDER.indexOf(today)
  const to = DAY_ORDER.indexOf(weekday)
  if (from === -1 || to === -1) return null
  return (to - from + 7) % 7
}

export const relativeDayLabel = (days, weekday) => {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return weekday
}

export const nextCollection = (rows = [], today = manilaWeekday()) => {
  const dated = (rows || [])
    .map((row) => ({ row, days: daysUntilWeekday(row?.day_of_week, today) }))
    .filter((entry) => entry.days !== null)

  if (dated.length === 0) return null

  const soonest = Math.min(...dated.map((entry) => entry.days))
  const picked = dated.filter((entry) => entry.days === soonest)
  const weekday = picked[0].row.day_of_week

  return {
    weekday,
    days: soonest,
    label: relativeDayLabel(soonest, weekday),
    rows: picked.map((entry) => entry.row),
    // How many rows were left out because their day is not a weekday
    // name. Surfaced so the caller can say the summary covers part of
    // the schedule rather than quietly implying it covers all of it.
    skipped: (rows || []).length - dated.length,
  }
}
