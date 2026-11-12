import { render, screen } from '@testing-library/react'
import CreditGauge from './CreditGauge'

test.each([0, 82, 100])('presents the supplied score %s without changing it', value => {
  const { container } = render(<CreditGauge value={value} maximum={100} />)
  expect(screen.getByRole('img', { name: new RegExp(`Current community credit score ${value} out of 100`) })).toBeInTheDocument()
  expect(container.querySelector('.credit-gauge-fill')).toHaveAttribute('stroke-dasharray', `${value} 100`)
})

test.each([undefined, null, NaN, Infinity, -1, 101, '100'])('does not invent or clamp an invalid score %s', value => {
  const { container } = render(<CreditGauge value={value} maximum={100} />)
  expect(screen.getByRole('img', { name: /Community credit score unavailable/ })).toBeInTheDocument()
  expect(container.querySelector('.credit-gauge-fill')).toBeNull()
})

test.each([undefined, null, 0, -1, NaN, Infinity, '100'])('requires a valid server maximum %s', maximum => {
  render(<CreditGauge value={50} maximum={maximum} />)
  expect(screen.getByRole('img', { name: /Community credit score unavailable/ })).toBeInTheDocument()
})

test('gives multiple gauges independent accessible labels', () => {
  const { container } = render(<><CreditGauge value={30} maximum={100} /><CreditGauge value={60} maximum={100} /></>)
  const ids = [...container.querySelectorAll('title, desc')].map(element => element.id)
  expect(new Set(ids).size).toBe(4)
})
