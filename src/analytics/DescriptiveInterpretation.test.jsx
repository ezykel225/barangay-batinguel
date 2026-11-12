import { render, screen } from '@testing-library/react'
import DescriptiveInterpretation from './DescriptiveInterpretation'

test('accessible named region presents description, statistics and evidence-limited conclusion', () => {
  render(<DescriptiveInterpretation title="Categories" rows={[{ label: 'A', total: 3 }, { label: 'B', total: 1 }]} />)
  const region = screen.getByRole('region', { name: 'Categories: descriptive interpretation' })
  expect(screen.getByRole('heading', { name: 'Categories: descriptive interpretation', level: 4 })).toBeInTheDocument()
  expect(region).toHaveTextContent('Description:')
  expect(region).toHaveTextContent('4 records across 2 displayed groups')
  expect(region).toHaveTextContent('75%')
  expect(region).toHaveTextContent('Highest displayed count: A')
  expect(region).toHaveTextContent('do not establish causes')
})
test('all ties acknowledged, including long sets; labels render as text', () => {
  render(<DescriptiveInterpretation title="Ties" rows={['<script>', 'B', 'C', 'D'].map(label => ({ label, total: 1 }))} />)
  expect(screen.getByText(/Tied highest:/)).toHaveTextContent('<script>; B; C; and 1 other group')
  expect(document.querySelector('script')).toBeNull()
})
test('time summary uses zero buckets, gives no percentage-growth or sustained trend claim', () => {
  render(<DescriptiveInterpretation title="Months" mode="time" rows={[{ label: 'First', total: 0 }, { label: 'Last', total: 4 }]} note="Current bucket is partial." />)
  const region = screen.getByRole('region')
  expect(region).toHaveTextContent('Mean per displayed bucket: 2; median: 2; range: 0 to 4')
  expect(region).toHaveTextContent('First displayed bucket: 0; last: 4')
  expect(region).toHaveTextContent('does not establish a sustained trend')
  expect(region).toHaveTextContent('Current bucket is partial')
  expect(region).not.toHaveTextContent('Infinity')
})
test('loading, incomplete and malformed input never produce stale conclusions', () => {
  const props = { title: 'Data', rows: [{ label: 'A', total: 9 }] }
  const { rerender } = render(<DescriptiveInterpretation {...props} state="loading" />)
  expect(screen.getByRole('status')).toHaveTextContent('loading')
  expect(screen.queryByText(/Highest displayed/)).not.toBeInTheDocument()
  rerender(<DescriptiveInterpretation {...props} state="incomplete" />)
  expect(screen.getByRole('region')).toHaveTextContent('Interpretation unavailable')
  rerender(<DescriptiveInterpretation {...props} rows={[{ label: 'A', total: null }]} />)
  expect(screen.getByRole('region')).toHaveTextContent('Missing values are not treated as zero')
})
test('no denominators or causal conclusions invented for zero datasets', () => {
  render(<DescriptiveInterpretation title="Empty" rows={[{ total: 0 }]} />)
  expect(screen.getByRole('region')).toHaveTextContent('No positive counts are displayed')
  expect(screen.getByRole('region')).not.toHaveTextContent('NaN')
  expect(screen.getByRole('region')).not.toHaveTextContent('%')
})
test('new filtered rows replace old statistics and conclusion', () => {
  const { rerender } = render(<DescriptiveInterpretation title="Filtered" rows={[{ label: 'A', total: 5 }, { label: 'B', total: 2 }]} />)
  rerender(<DescriptiveInterpretation title="Filtered" rows={[{ label: 'B', total: 2 }]} />)
  expect(screen.getByRole('region')).toHaveTextContent('2 records across 1 displayed group')
  expect(screen.getByRole('region')).toHaveTextContent('Highest displayed count: B')
  expect(screen.getByRole('region')).not.toHaveTextContent('Highest displayed count: A')
})
