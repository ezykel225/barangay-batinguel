import { act, fireEvent, render, screen } from '@testing-library/react'
import DeviceLocation from './DeviceLocation'

afterEach(() => { delete navigator.geolocation })
test('requests location only on click, once while pending, and fills manual coordinates', () => {
  const getCurrentPosition = jest.fn()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
  const onLocation = jest.fn()
  render(<DeviceLocation onLocation={onLocation} />)
  expect(getCurrentPosition).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
  fireEvent.click(screen.getByRole('button'))
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 9.31, longitude: 123.28 } }))
  expect(onLocation).toHaveBeenCalledWith({ latitude: '9.310000', longitude: '123.280000' })
  expect(screen.getByRole('status')).toHaveTextContent('manual entry remains available')
})
test('denial leaves manual entry available and never supplies coordinates', () => {
  const onLocation = jest.fn()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success, fail) => fail({ code: 1 }) } })
  render(<DeviceLocation onLocation={onLocation} />)
  fireEvent.click(screen.getByRole('button'))
  expect(onLocation).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('Enter coordinates manually')
})
test('unavailable devices give a clear manual fallback', () => {
  render(<DeviceLocation onLocation={jest.fn()} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('status')).toHaveTextContent('unavailable')
})
