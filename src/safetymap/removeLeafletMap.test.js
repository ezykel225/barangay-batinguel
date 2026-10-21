import L from 'leaflet'
import { removeLeafletMap } from './removeLeafletMap'

let container
let map
beforeEach(() => {
  jest.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  map = L.map(container).setView([9.3068, 123.3054], 14)
})
afterEach(() => {
  if (map?._mapPane) removeLeafletMap(map)
  jest.clearAllTimers()
  jest.useRealTimers()
  container.remove()
})
test('real Leaflet zoom timeout safely completes after its pane is removed', () => {
  map._animateZoom(L.latLng(9.3068, 123.3054), 15, true)
  expect(map._animatingZoom).toBe(true)
  removeLeafletMap(map)
  expect(map._mapPane).toBeUndefined()
  expect(() => jest.advanceTimersByTime(300)).not.toThrow()
})
test('remount on the same container does not initialize twice or revive the old zoom', () => {
  map._animateZoom(L.latLng(9.3068, 123.3054), 15, true)
  removeLeafletMap(map)
  map = L.map(container).setView([9.3068, 123.3054], 14)
  expect(() => jest.advanceTimersByTime(300)).not.toThrow()
  expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(1)
  expect(map.getZoom()).toBe(14)
})
test('mounted map zoom still completes normally and pan teardown remains safe', () => {
  map._animateZoom(L.latLng(9.3068, 123.3054), 15, true)
  jest.advanceTimersByTime(300)
  expect(map.getZoom()).toBe(15)
  map.panBy([20, 10], { animate: true, duration: 0.25 })
  removeLeafletMap(map)
  expect(() => jest.advanceTimersByTime(500)).not.toThrow()
})
