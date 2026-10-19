import { fireEvent, render, screen, within } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import TanodDutySchedule from './TanodDutySchedule'

const now = new Date('2026-10-19T03:00:00Z')
const row = { assignment_id: 'a', assignment_date: '2026-10-20', shift_start: '2026-10-20T22:00:00+08:00', shift_end: '2026-10-21T06:00:00+08:00', area_label: 'General patrol area', active: true }
const show = (duties = [row]) => render(<TanodDutySchedule duties={duties} today="2026-10-19" now={now} />)
test('uses the shared calendar with upcoming default selection, markers and accessible month controls', () => {
  const { container } = show()
  const day = screen.getByRole('button', { name: /Tuesday 20 October 2026, 1 assignment.*Scheduled/ })
  expect(day).toHaveAttribute('aria-pressed', 'true')
  expect(day.querySelector('.mcal-dot')).toHaveTextContent('S')
  expect(container.querySelector('.mcal')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '20 October 2026' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Monday 19 October 2026, today/ })).toHaveAttribute('aria-current', 'date')
  expect(screen.getByRole('button', { name: 'Previous month, September 2026' })).toBeInTheDocument()
})
test('selects today when it has a duty and supports no-duty dates without actions', () => {
  show([{ ...row, assignment_date: '2026-10-19' }])
  expect(screen.getByRole('heading', { name: '19 October 2026' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Tuesday 27 October 2026/ }))
  expect(screen.getByText('No duty scheduled on this date.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Check In|Check Out/ })).toBeNull()
})
test('empty data defaults to today, and month navigation does not invent assignments', () => {
  const { container } = show([])
  expect(screen.getByRole('heading', { name: '19 October 2026' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next month, November 2026' }))
  expect(screen.getByRole('group', { name: 'November 2026' })).toBeInTheDocument()
  expect(container.querySelectorAll('.mcal-dot')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: /Sunday 1 November 2026/ }))
  expect(screen.getByRole('heading', { name: '1 November 2026' })).toBeInTheDocument()
  expect(screen.getByText('No duty scheduled on this date.')).toBeInTheDocument()
})
test('overnight marker stays on assignment_date and details disclose both dates', () => {
  show()
  const panel = screen.getByRole('heading', { name: '20 October 2026' }).closest('section')
  expect(panel).toHaveTextContent('Oct 20, 2026')
  expect(panel).toHaveTextContent('Oct 21, 2026')
  expect(panel).toHaveTextContent('10:00 PM')
  expect(panel).toHaveTextContent('6:00 AM')
  expect(screen.getByRole('button', { name: /Wednesday 21 October 2026, No duty scheduled/ }).querySelector('.mcal-dot')).toBeNull()
})
test.each([
  ['Completed', { checked_in_at: '2026-10-18T22:00:00Z', checked_out_at: '2026-10-19T02:00:00Z' }, 'C'],
  ['Check-out needed', { checked_in_at: '2026-10-18T22:00:00Z' }, '!'],
])('shows %s in markers and read-only details', (status, attendance, marker) => {
  show([{ ...row, assignment_date: '2026-10-19', shift_start: '2026-10-18T22:00:00Z', shift_end: '2026-10-19T02:00:00Z', ...attendance }])
  const day = screen.getByRole('button', { name: new RegExp('Monday 19 October 2026, today, 1 assignment.*' + status) })
  expect(day.querySelector('.mcal-dot')).toHaveTextContent(marker)
  expect(screen.getByText(status)).toBeInTheDocument()
  expect(screen.getByText('Checked in:')).toBeInTheDocument()
  if (status === 'Completed') expect(screen.getByText('Checked out:')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Check In|Check Out/ })).toBeNull()
})
test('Calendar/List toggle retains selection and shows a chronological compact schedule rows', () => {
  show([row, { ...row, assignment_id: 'b', assignment_date: '2026-10-19', area_label: 'Earlier patrol area' }])
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  const rows = within(screen.getByRole('list', { name: 'Loaded duty assignments in date order' })).getAllByRole('listitem')
  expect(within(rows[0]).getByLabelText('19 October 2026')).toBeInTheDocument()
  expect(within(rows[1]).getByLabelText('20 October 2026')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Calendar', exact: true }))
  expect(screen.getByRole('heading', { name: '19 October 2026' })).toBeInTheDocument()
})
test('adapts the actual All Events equal-panel layout and mobile stacking breakpoint', () => {
  const css = fs.readFileSync(path.join(__dirname, 'TanodPortal.css'), 'utf8').replace(/\r\n/g, '\n')
  expect(css).toMatch(/\.td-duty-calendar-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)/)
  expect(css).toMatch(/@media\(max-width: 900px\)\s*\{\s*\.td-duty-calendar-layout\s*\{\s*grid-template-columns: minmax\(0,1fr\)/)
})

test('list groups completed attendance with semantic success status and no operational buttons', () => {
  show([{ ...row, checked_in_at: '2026-10-20T14:00:00Z', checked_out_at: '2026-10-20T22:00:00Z' }])
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  expect(screen.getByText('Completed')).toHaveClass('td-state-completed')
  expect(screen.getByText('Check in')).toBeInTheDocument()
  expect(screen.getByText('Check out')).toBeInTheDocument()
  expect(screen.getByText('Check out').nextElementSibling).toHaveTextContent('Oct 21, 2026')
  expect(screen.queryByRole('button', { name: /Check In|Check Out/ })).toBeNull()
})

test.each([
  ['06:00', '14:00', '2026-10-20', 'Shift 1'],
  ['14:00', '22:00', '2026-10-20', 'Shift 2'],
  ['22:00', '06:00', '2026-10-21', 'Shift 3'],
])('calendar details and list use stored %s window label', (start, end, endDate, label) => {
  show([{ ...row, shift_start: '2026-10-20T' + start + ':00+08:00', shift_end: endDate + 'T' + end + ':00+08:00' }])
  expect(screen.getByText(label)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  expect(screen.getByText(label)).toBeInTheDocument()
})
