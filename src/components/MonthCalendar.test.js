// The shared month grid, as rendered.
//
// `monthGrid.test.js` covers the arithmetic. These cover the parts that
// only exist once it is on screen: the accessible names, navigation,
// selection, and the rule that today and the selected day are never
// communicated by colour alone.
//
// The component imports React and the pure monthGrid module only, so
// this runs without the Supabase environment variables.

import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MonthCalendar from './MonthCalendar'

// October 2026 starts on a Thursday and has 31 days.
const base = { year: 2026, month: 9 }

const Host = ({ renderDay, today = '', initial = '' } = {}) => {
  const [{ year, month }, setMonth] = useState(base)
  const [selected, setSelected] = useState(initial)
  return (
    <MonthCalendar
      year={year}
      month={month}
      onMonthChange={setMonth}
      selectedDate={selected}
      onSelectDate={setSelected}
      today={today}
      renderDay={renderDay}
    />
  )
}

const dayButton = (day, month = 'October', year = 2026) =>
  screen.getByRole('button', { name: new RegExp(`\\b${day} ${month} ${year}\\b`) })

describe('rendering a month', () => {
  it('shows the month and one button per day', () => {
    render(<Host />)
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    // 31 days plus the two navigation buttons.
    expect(screen.getAllByRole('button')).toHaveLength(33)
  })

  it('gives every day a full spoken date, not just a number', () => {
    render(<Host />)
    // 1 October 2026 is a Thursday.
    expect(screen.getByRole('button', { name: /Thursday 1 October 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Saturday 31 October 2026/ })).toBeInTheDocument()
  })

  it('hides the weekday headings from assistive technology', () => {
    // "Mo" is for looking at; the day buttons carry the full weekday.
    const { container } = render(<Host />)
    expect(container.querySelector('.mcal-weekdays')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders a short final row rather than padding it', () => {
    const { container } = render(<Host />)
    // Four leading blanks for Thursday, then 31 days. No trailing pad.
    expect(container.querySelectorAll('.mcal-blank')).toHaveLength(4)
    expect(container.querySelectorAll('.mcal-grid > *')).toHaveLength(35)
  })
})

describe('month navigation', () => {
  it('names the month each control goes to', () => {
    render(<Host />)
    expect(screen.getByRole('button', { name: 'Previous month, September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month, November 2026' })).toBeInTheDocument()
  })

  it('moves forward and back', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: /Next month/ }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Previous month/ }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })

  it('crosses a year boundary', () => {
    render(<Host />)
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next month/ }))
    }
    expect(screen.getByText('January 2027')).toBeInTheDocument()
    expect(dayButton(31, 'January', 2027)).toBeInTheDocument()
  })
})

describe('today and selection are not colour alone', () => {
  it('marks today with aria-current and the word today', () => {
    render(<Host today="2026-10-15" />)
    const todayCell = dayButton(15)
    expect(todayCell).toHaveAttribute('aria-current', 'date')
    expect(todayCell.getAttribute('aria-label')).toMatch(/today/)
    // ...and a class carrying a ring and a weight change, not just a hue.
    expect(todayCell.className).toMatch(/mcal-today/)
  })

  it('does not mark any other day as today', () => {
    render(<Host today="2026-10-15" />)
    expect(dayButton(14)).not.toHaveAttribute('aria-current')
  })

  it('reports selection through aria-pressed', () => {
    render(<Host />)
    const cell = dayButton(20)
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(cell)
    expect(dayButton(20)).toHaveAttribute('aria-pressed', 'true')
    expect(dayButton(21)).toHaveAttribute('aria-pressed', 'false')
  })

  it('moves the selection rather than accumulating it', () => {
    render(<Host initial="2026-10-05" />)
    expect(dayButton(5)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(dayButton(6))
    expect(dayButton(5)).toHaveAttribute('aria-pressed', 'false')
    expect(dayButton(6)).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('renderDay drives the day content', () => {
  it('puts the caller\'s label into the accessible name', () => {
    const renderDay = (cell) =>
      cell.day === 15 ? { count: 3, label: '3 bookings, 5 hours held' } : {}
    render(<Host renderDay={renderDay} />)
    expect(dayButton(15).getAttribute('aria-label'))
      .toMatch(/3 bookings, 5 hours held/)
  })

  it('shows a count above one as text, so a dot is never the only cue', () => {
    const renderDay = (cell) => (cell.day === 15 ? { count: 3 } : { count: 0 })
    const { container } = render(<Host renderDay={renderDay} />)
    expect(dayButton(15).textContent).toContain('3')
    // A single item gets a dot with no number, and the meaning still
    // reaches assistive technology through the label.
    expect(container.querySelectorAll('.mcal-dot')).toHaveLength(1)
  })

  it('renders no indicator for a day with nothing on it', () => {
    const { container } = render(<Host renderDay={() => ({ count: 0 })} />)
    expect(container.querySelectorAll('.mcal-dot')).toHaveLength(0)
  })

  it('applies the tone the caller asks for', () => {
    const renderDay = (cell) => (cell.day === 15 ? { tone: 'warn' } : { tone: 'default' })
    render(<Host renderDay={renderDay} />)
    expect(dayButton(15).className).toMatch(/mcal-tone-warn/)
    expect(dayButton(16).className).toMatch(/mcal-tone-default/)
  })

  it('disables a day the caller marks unselectable', () => {
    const renderDay = (cell) => ({ disabled: cell.day === 15 })
    render(<Host renderDay={renderDay} />)
    expect(dayButton(15)).toBeDisabled()
    fireEvent.click(dayButton(15))
    expect(dayButton(15)).toHaveAttribute('aria-pressed', 'false')
  })

  it('survives a renderDay that returns nothing', () => {
    render(<Host renderDay={() => undefined} />)
    expect(dayButton(1)).toBeInTheDocument()
  })

  it('works with no renderDay at all', () => {
    render(
      <MonthCalendar year={2026} month={9} />
    )
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })
})

describe('leap February', () => {
  it('renders 29 days', () => {
    render(<MonthCalendar year={2024} month={1} />)
    expect(screen.getByRole('button', { name: /29 February 2024/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /30 February/ })).not.toBeInTheDocument()
  })
})
