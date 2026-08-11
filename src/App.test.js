import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the home page navbar without crashing', async () => {
  render(<App />)
  const brandName = await screen.findAllByText(/Barangay Batinguel/i)
  expect(brandName.length).toBeGreaterThan(0)
})
