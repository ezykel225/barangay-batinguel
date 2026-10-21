import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import DeviceLocation from './DeviceLocation'

const valid = (lat, lng) => lat !== null && lat !== undefined && lng !== null && lng !== undefined
  && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180

export default function IncidentLocationPicker({ latitude, longitude, busy, onSave, onCancel }) {
  const [selected, setSelected] = useState(() => valid(latitude, longitude) ? { latitude: Number(latitude), longitude: Number(longitude) } : null)
  const container = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const selectRef = useRef(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => { selectRef.current?.focus() }, [])
  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(
      valid(latitude, longitude) ? [Number(latitude), Number(longitude)] : [9.3068, 123.3054], 16)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    map.on('click', ({ latlng }) => {
      if (!busyRef.current) setSelected({ latitude: Number(latlng.lat.toFixed(6)), longitude: Number(latlng.lng.toFixed(6)) })
    })
    mapRef.current = map
    const resize = () => map.invalidateSize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(container.current)
    resize()
    return () => { observer?.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null }
    // The editor is remounted for each incident/open; initial props are a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    markerRef.current?.remove()
    if (selected && mapRef.current) {
      markerRef.current = L.circleMarker([selected.latitude, selected.longitude], {
        radius: 8, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1, interactive: false,
      }).addTo(mapRef.current)
    }
  }, [selected])
  const useDevice = (coordinates) => {
    if (busyRef.current) return
    const next = { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) }
    setSelected(next)
    mapRef.current?.setView([next.latitude, next.longitude], 17)
  }
  return <div className="inc-location-picker" role="region" aria-label="Choose incident map location" aria-busy={busy || undefined}>
    <p className="field-note" id="inc-picker-help">Click the incident location on the map. With a keyboard, focus the map, use arrow keys to move it, then choose Select map center. Nothing is saved until you confirm.</p>
    <div ref={container} className="inc-picker-map" role="application" aria-label="Incident location selection map" aria-describedby="inc-picker-help" />
    <button type="button" ref={selectRef} className="btn-cancel" disabled={busy} onClick={() => {
      const center = mapRef.current?.getCenter()
      if (center) setSelected({ latitude: Number(center.lat.toFixed(6)), longitude: Number(center.lng.toFixed(6)) })
    }}>Select map center</button>
    <fieldset className="inc-device-location" disabled={busy}><DeviceLocation onLocation={useDevice} /></fieldset>
    <p className="inc-selected-location" role="status">{selected ? `Selected location: ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : 'No location selected. The opening map center is only a starting view.'}</p>
    <div className="inc-picker-actions">
      <button type="button" className="btn-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="btn-add" disabled={busy || !selected} onClick={() => onSave(selected)}>{busy ? 'Saving map location...' : 'Save map location'}</button>
    </div>
  </div>
}
