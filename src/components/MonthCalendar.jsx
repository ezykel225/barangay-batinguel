import { useMemo } from 'react'
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  buildMonthGrid,
  shiftMonth,
} from '../utils/monthGrid'
import './MonthCalendar.css'

// One month grid, drawn for four different things.
//
// ─── WHAT THIS OWNS, AND WHAT IT MUST NOT ─────────────────────────────
//
// It owns: the grid, the weekday headings, previous/next navigation,
// today, selection, the responsive behaviour, and the accessible names
// for all of it.
//
// It owns NO business logic. It does not know what a reservation is,
// which statuses hold a slot, what an office-hours exception is, or
// where an event's detail page lives. Callers pass `renderDay`, which
// is handed a plain grid cell and returns how that day should look:
//
//   renderDay(cell) -> {
//     tone,      // 'default' | 'has' | 'warn' | 'muted'
//     count,     // a number to show as an indicator, or 0
//     disabled,  // not selectable
//     label,     // what assistive technology hears IN ADDITION to the
//                // date, e.g. "3 slots available"
//   }
//
// That keeps occupancy, covered hours, pending/approved slot holding and
// exception handling in the reservation utilities, and event placement
// and labelling in the event utilities, which is where they belong and
// where they are tested.
//
// ─── ACCESSIBILITY ────────────────────────────────────────────────────
//
// - Navigation buttons name the month they go to, not just "‹".
// - **Today is not colour alone.** It gets a visible ring, a bolder
//   weight, and the word "today" in its accessible name.
// - **Selection is not colour alone.** Each day is a real toggle:
//   `aria-pressed`, plus a ring and a weight change.
// - Day indicators carry their meaning in the accessible name, so a
//   coloured dot is never the only thing saying "this date has
//   something on it".
// - Days are ordinary `<button>`s in a CSS grid rather than a
//   `role="grid"` with a roving tabindex. A deliberate trade-off: Tab
//   reaches every day, which is more tab stops but correct, whereas a
//   half-built roving-tabindex grid is worse than none. The full
//   accessibility sweep (X3) can revisit it.
const MonthCalendar = ({
  year,
  month,
  onMonthChange,
  selectedDate = '',
  onSelectDate,
  today = '',
  renderDay,
  caption,
  idPrefix = 'mcal',
}) => {
  const cells = useMemo(
    () => buildMonthGrid(year, month, { today }),
    [year, month, today]
  )

  const previous = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const monthLabel = `${MONTH_NAMES[month]} ${year}`
  const headingId = `${idPrefix}-month-label`

  return (
    <div className="mcal" role="group" aria-labelledby={headingId}>
      <div className="mcal-header">
        <button
          type="button"
          className="mcal-nav"
          onClick={() => onMonthChange?.(previous)}
          aria-label={`Previous month, ${MONTH_NAMES[previous.month]} ${previous.year}`}
        >
          <span aria-hidden="true">‹</span>
        </button>

        {/* The month names the group, so it is announced before any day
            inside it. */}
        <span className="mcal-month" id={headingId}>{monthLabel}</span>

        <button
          type="button"
          className="mcal-nav"
          onClick={() => onMonthChange?.(next)}
          aria-label={`Next month, ${MONTH_NAMES[next.month]} ${next.year}`}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="mcal-weekdays" aria-hidden="true">
        {WEEKDAY_SHORT.map((label) => (
          <div key={label} className="mcal-weekday">{label}</div>
        ))}
      </div>

      <div className="mcal-grid">
        {cells.map((cell, index) => {
          if (!cell) {
            return (
              <div
                key={`blank-${index}`}
                className="mcal-cell mcal-blank"
                aria-hidden="true"
              />
            )
          }

          const day = (renderDay ? renderDay(cell) : null) || {}
          const { tone = 'default', count = 0, disabled = false, label = '' } = day
          const isSelected = selectedDate === cell.key

          // Built here so every consumer gives the same shape of name:
          // the date, then today, then the day's own meaning. A caller
          // that forgets `label` still produces a usable name.
          const spoken = `${WEEKDAY_NAMES[cell.weekday]} ${cell.day} ${MONTH_NAMES[month]} ${year}`
          const parts = [spoken]
          if (cell.isToday) parts.push('today')
          if (label) parts.push(label)

          return (
            <button
              key={cell.key}
              type="button"
              className={[
                'mcal-cell',
                `mcal-tone-${tone}`,
                cell.isToday ? 'mcal-today' : '',
                isSelected ? 'mcal-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate?.(cell.key)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={parts.join(', ')}
            >
              <span className="mcal-daynum">{cell.day}</span>
              {/* A bare dot would be colour-only, so a count above one
                  is rendered as text and the accessible name carries the
                  meaning in either case. */}
              {count > 0 && (
                <span className="mcal-dot" aria-hidden="true">
                  {count > 1 ? count : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {caption && <p className="mcal-caption">{caption}</p>}
    </div>
  )
}

export default MonthCalendar
