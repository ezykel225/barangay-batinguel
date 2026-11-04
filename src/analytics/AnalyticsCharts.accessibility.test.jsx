import { fireEvent, render, screen } from '@testing-library/react'
import { DataTable } from './AnalyticsCharts'

test('chart data has a named keyboard-focusable scroll region and preserves exact values', () => {
  render(<DataTable caption="Synthetic incident types" rows={[{ key: 'other', label: 'Synthetic long label', total: 7 }]} />)
  fireEvent.click(screen.getByText('Show data table'))
  const region = screen.getByRole('region', { name: 'Synthetic incident types data table' })
  expect(region).toHaveAttribute('tabindex', '0')
  region.focus(); expect(region).toHaveFocus()
  expect(screen.getByRole('rowheader', { name: 'Synthetic long label' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '7' })).toBeInTheDocument()
})
