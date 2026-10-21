// Leaflet 1.9.4 queues a zoom fallback timeout that remove() does not cancel.
// Its completion callback exits when this flag is false. Cancel only the
// departing map's zoom state before remove() deletes _mapPane; pan/fly and
// event cleanup remain Leaflet's responsibility. Mounted maps still animate.
export function removeLeafletMap(map) {
  map._animatingZoom = false
  map.remove()
}
