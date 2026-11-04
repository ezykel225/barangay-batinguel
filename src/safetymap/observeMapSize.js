// Redraw tiles after container changes (including sidebar collapse and tab reveal).
// Disconnect before teardown so a queued observer cannot touch a removed map pane.
export function observeMapSize(map, container) {
  let active = true
  const resize = () => {
    if (active && container.isConnected && container.clientWidth > 0 && container.clientHeight > 0) {
      map.invalidateSize({ pan: false, animate: false, debounceMoveend: true })
    }
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  if (observer) observer.observe(container)
  else window.addEventListener('resize', resize)
  return () => {
    active = false
    observer?.disconnect()
    if (!observer) window.removeEventListener('resize', resize)
  }
}
