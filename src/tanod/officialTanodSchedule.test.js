import { fireEvent, render, screen, within } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import OfficialTanodSchedule, { assignmentPresentation } from './OfficialTanodSchedule'

const assignments = [
  { id: 'a', tanod_name: 'Carlo', assignment_date: '2026-10-20', start_time: '06:00:00', end_time: '14:00:00', area_label: 'General patrol area', patrol_type: 'roving', active: true },
  { id: 'b', tanod_name: 'Joel', assignment_date: '2026-10-20', start_time: '06:00:00', end_time: '14:00:00', area_label: 'Hall area', patrol_type: 'static', active: true },
  { id: 'c', tanod_name: 'Allan', assignment_date: '2026-10-20', start_time: '14:00:00', end_time: '22:00:00', area_label: 'General patrol area', patrol_type: 'roving', active: false },
  { id: 'd', tanod_name: 'Victor', assignment_date: '2026-10-21', start_time: '22:00:00', end_time: '06:00:00', area_label: 'General patrol area', patrol_type: 'roving', active: true },
]
const show = (props = {}) => render(<OfficialTanodSchedule assignments={assignments} today="2026-10-19" canAdminister={true} busy="" onToggle={jest.fn()} {...props} />)

test('shared calendar selects only a date and groups its members by stored windows', () => {
  show()
  expect(screen.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Nothing scheduled on this date.')).toBeInTheDocument()
  const day = screen.getByRole('button', { name: /Tuesday 20 October 2026, 3 assignments/ })
  expect(day.querySelector('.mcal-dot')).toHaveTextContent('3')
  fireEvent.click(day)
  expect(day).toHaveAttribute('aria-pressed', 'true')
  const firstShift = screen.getByRole('region', { name: /Shift 1/ })
  expect(within(firstShift).getByText('Carlo')).toBeInTheDocument()
  expect(within(firstShift).getByText('Joel')).toBeInTheDocument()
  expect(within(firstShift).getByText('Static post')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: /Shift 2/ })).toHaveTextContent('Allan')
  expect(screen.queryByText('Victor')).toBeNull()
  expect(screen.getByText('Stood down')).toBeInTheDocument()
})

test('navigation uses loaded markers only; overnight details retain both dates', () => {
  const { container } = show()
  fireEvent.click(screen.getByRole('button', { name: /Wednesday 21 October 2026, 1 assignments/ }))
  expect(screen.getByRole('region', { name: /Shift 3/ })).toHaveTextContent('Oct 21, 2026')
  expect(screen.getByRole('region', { name: /Shift 3/ })).toHaveTextContent('Oct 22, 2026')
  fireEvent.click(screen.getByRole('button', { name: 'Next month, November 2026' }))
  expect(container.querySelectorAll('.mcal-dot')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: /Sunday 1 November 2026/ }))
  expect(screen.getByText('Nothing scheduled on this date.')).toBeInTheDocument()
})

test('list filters by month and changes date order without new queries', () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
  expect(screen.getAllByRole('region')[0]).toHaveAccessibleName('20 October 2026')
  expect(screen.getByText('Victor')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'newest' } })
  expect(screen.getAllByRole('region')[0]).toHaveAccessibleName('21 October 2026')
  fireEvent.change(screen.getByLabelText('Schedule month'), { target: { value: '2026-11' } })
  expect(screen.getByText('No patrol assignments in this month.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Calendar', exact: true }))
  expect(screen.getByRole('heading', { name: '19 October 2026' })).toBeInTheDocument()
})

test('individual assignment actions retain exact records and busy/authorization guards', () => {
  const onToggle = jest.fn()
  const { rerender } = show({ onToggle })
  fireEvent.click(screen.getByRole('button', { name: /Tuesday 20 October 2026, 3 assignments/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Stand down assignment for Carlo on 20 Oct 2026' }))
  expect(onToggle).toHaveBeenCalledWith(assignments[0])
  rerender(<OfficialTanodSchedule assignments={assignments} today="2026-10-19" canAdminister busy="write" onToggle={onToggle} />)
  expect(screen.getByRole('button', { name: /Reactivate assignment for Allan/ })).toBeDisabled()
  rerender(<OfficialTanodSchedule assignments={assignments} today="2026-10-19" canAdminister={false} busy="" onToggle={onToggle} />)
  expect(screen.queryByRole('button', { name: /assignment for/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Check In|Check Out/ })).toBeNull()
})

test('window display adapter does not invent a label for missing/custom times', () => {
  expect(assignmentPresentation({ ...assignments[0], start_time: null }).window).toBe('No time recorded')
  expect(assignmentPresentation({ ...assignments[0], start_time: '07:00:00', end_time: '15:00:00' }).label).toBe('Scheduled shift')
  expect(assignments[3].assignment_date).toBe('2026-10-21')
})

test('operations CSS stacks panels/forms and contains roster overflow at narrow widths', () => {
  const css = fs.readFileSync(path.join(__dirname, 'Tanod.css'), 'utf8').replace(/\r\n/g, '\n')
  expect(css).toMatch(/@media\(max-width: 900px\).*?\.tnd-calendar-layout \{ grid-template-columns: minmax\(0,1fr\)/s)
  expect(css).toMatch(/@media\(max-width: 600px\).*?\.tnd-operations \.tnd-grid \{ grid-template-columns: minmax\(0,1fr\)/s)
  expect(css).toMatch(/\.tnd-operations \.table-wrapper \{ max-width: 100%; overflow-x: auto/)
})
