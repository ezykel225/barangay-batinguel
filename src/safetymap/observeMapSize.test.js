import { observeMapSize } from './observeMapSize'

const original = global.ResizeObserver
afterEach(() => { global.ResizeObserver = original; document.body.innerHTML = '' })
function container() {
  const el = document.createElement('div'); document.body.append(el)
  Object.defineProperties(el, { clientWidth: { configurable: true, value: 320 }, clientHeight: { configurable: true, value: 260 } })
  return el
}
test('container resize redraws a mounted map without pan/zoom and queued callbacks stop before teardown', () => {
  let callback
  const disconnect = jest.fn(), observe = jest.fn()
  global.ResizeObserver = jest.fn(fn => { callback = fn; return { observe, disconnect } })
  const el = container(), map = { invalidateSize: jest.fn() }
  const stop = observeMapSize(map, el)
  expect(observe).toHaveBeenCalledWith(el)
  callback()
  expect(map.invalidateSize).toHaveBeenCalledWith({ pan: false, animate: false, debounceMoveend: true })
  stop(); callback()
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(map.invalidateSize).toHaveBeenCalledTimes(1)
})
test('hidden and detached containers are skipped; revealing a container redraws it', () => {
  let callback
  global.ResizeObserver = jest.fn(fn => { callback = fn; return { observe() {}, disconnect() {} } })
  const el = container(), map = { invalidateSize: jest.fn() }
  const stop = observeMapSize(map, el)
  Object.defineProperty(el, 'clientWidth', { value: 0, configurable: true }); callback()
  expect(map.invalidateSize).not.toHaveBeenCalled()
  Object.defineProperty(el, 'clientWidth', { value: 768, configurable: true }); callback()
  expect(map.invalidateSize).toHaveBeenCalledTimes(1)
  el.remove(); callback(); expect(map.invalidateSize).toHaveBeenCalledTimes(1); stop()
})
test('window fallback listener is removed on cleanup', () => {
  global.ResizeObserver = undefined
  const el = container(), map = { invalidateSize: jest.fn() }
  const stop = observeMapSize(map, el)
  window.dispatchEvent(new Event('resize')); expect(map.invalidateSize).toHaveBeenCalledTimes(1)
  stop(); window.dispatchEvent(new Event('resize')); expect(map.invalidateSize).toHaveBeenCalledTimes(1)
})
