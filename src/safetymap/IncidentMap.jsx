import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { removeLeafletMap } from './removeLeafletMap'
import 'leaflet/dist/leaflet.css'

import { incidentTypeLabel, incidentStatusLabel, incidentDateTime } from '../incidents/incidentLabels'
import { bandFor, markerRadiusFor, plottablePoints } from './safetyAnalytics'
import './SafetyMap.css'

// Combined Phase 2 — the internal incident map.
//
// ─── ⚠️ VANILLA LEAFLET, DELIBERATELY, AND NOTHING ELSE ─────────────────────
//
// `leaflet` is the ONE dependency this phase adds. `react-leaflet` was
// considered and rejected: it is ESM-only, and CRA 5's webpack has a known
// quarrel with ESM-only packages in `node_modules` that is not worth
// discovering the night before a demo. Leaflet itself ships UMD and imports
// cleanly, so the binding is this one small file.
//
// ⚠️ AND NO `leaflet.heat`. The hotspot layer is drawn with Leaflet's own
// `circleMarker`, sized and coloured from `safetyAnalytics.js` -- a pure
// module with unit tests. §8 asks for "heat/hotspot layer OR intensity
// visualization"; graduated circles are the second, and they cost no second
// unmaintained plugin and are deterministic enough to test.
//
// ⚠️ `circleMarker` ALSO AVOIDS LEAFLET'S MARKER-ICON TRAP. The default
// `L.marker` loads three PNGs by relative URL, which webpack rewrites and
// Leaflet then cannot find -- the single most common Leaflet-in-CRA defect.
// A vector circle has no image to lose.
//
// ─── ⚠️ WHAT A POPUP MAY SAY ────────────────────────────────────────────────
//
// Reference, type, when, location and status. NO NARRATIVE -- and it could not
// show one anyway, because `incident_map_points()` does not return it. A
// marker popup is read by whoever is standing at the screen.
//
// ─── ⚠️ NO BOUNDARY POLYGON ─────────────────────────────────────────────────
//
// Nothing here draws a barangay or purok outline. P2 established that the
// official purok names and boundaries are unconfirmed, so a polygon would be
// a shape this project invented and then showed an official as if it were a
// border.

const TYPE_TONE = {
  traffic_accident: '#b45309',
  disturbance: '#7c3aed',
  physical_altercation: '#b91c1c',
  theft_property: '#0f766e',
  threat: '#be123c',
  public_safety_hazard: '#1d4ed8',
  other: '#5f6775',
}

const toneFor = (type) => (
  Object.prototype.hasOwnProperty.call(TYPE_TONE, type) ? TYPE_TONE[type] : TYPE_TONE.other
)

const BAND_TONE = { low: '#1d4ed8', medium: '#b45309', high: '#b91c1c' }

// Escaped, because a popup is built as an HTML string and a location label is
// text an official typed.
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const IncidentMap = ({ points = [], hotspots = [], coveredKeys = [], height = 420 }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, { scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    // Barangay Batinguel, Dumaguete, as an opening view only -- it is a map
    // centre, not an asserted boundary.
    map.setView([9.3068, 123.3054], 15)
    mapRef.current = map
    return () => { removeLeafletMap(map); mapRef.current = null; layerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) { layerRef.current.remove() }
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer

    const usable = plottablePoints(points)
    const peak = hotspots.reduce((max, h) => Math.max(max, Number(h.total) || 0), 0)
    const covered = new Set(coveredKeys)

    // The hotspot layer first, so individual markers sit on top of it.
    hotspots.forEach((spot) => {
      const lat = Number(spot.centroid_latitude)
      const lng = Number(spot.centroid_longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const band = bandFor(spot.total, peak)
      const isCovered = covered.has(spot.key || spot.location_key)
      L.circleMarker([lat, lng], {
        radius: markerRadiusFor(spot.total, peak),
        color: BAND_TONE[band.key],
        weight: isCovered ? 3 : 1,
        opacity: 0.9,
        fillColor: BAND_TONE[band.key],
        fillOpacity: 0.18,
        dashArray: isCovered ? null : '4 3',
      }).bindPopup(
        `<strong>${escapeHtml(spot.location_label)}</strong><br/>`
        + `${Number(spot.total) || 0} incidents recorded &middot; ${escapeHtml(band.label)}<br/>`
        + `${isCovered ? 'A patrol area matches this wording.' : 'No patrol area matches this wording.'}`
      ).addTo(layer)
    })

    usable.forEach((point) => {
      L.circleMarker([Number(point.latitude), Number(point.longitude)], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: toneFor(point.incident_type),
        fillOpacity: 1,
      }).bindPopup(
        `<strong>${escapeHtml(point.reference)}</strong><br/>`
        + `${escapeHtml(incidentTypeLabel(point.incident_type))}<br/>`
        + `${escapeHtml(incidentDateTime(point.occurred_at))}<br/>`
        + `${escapeHtml(point.location_text)}<br/>`
        + `Status: ${escapeHtml(incidentStatusLabel(point.status))}`
      ).addTo(layer)
    })

    if (usable.length > 0) {
      map.fitBounds(
        L.latLngBounds(usable.map((p) => [Number(p.latitude), Number(p.longitude)])),
        { padding: [40, 40], maxZoom: 17 }
      )
    }
  }, [points, hotspots, coveredKeys])

  return (
    <div className="smap-wrap">
      <div
        ref={containerRef}
        className="smap-canvas"
        style={{ height: `${height}px` }}
        role="application"
        aria-label="Map of recorded incident locations"
      />
      {/* ⚠️ The map is not the only way to read this. A screen-reader user
          and anybody whose tiles do not load get the same facts as a list,
          because a canvas of coloured circles is not an accessible record. */}
      <details className="smap-alt">
        <summary>Incident locations as a list</summary>
        <ul>
          {plottablePoints(points).map((p) => (
            <li key={p.id}>
              <strong>{p.reference}</strong> &middot; {incidentTypeLabel(p.incident_type)}
              {' '}&middot; {p.location_text} &middot; {incidentStatusLabel(p.status)}
            </li>
          ))}
        </ul>
        {plottablePoints(points).length === 0 && (
          <p className="complaint-empty">No incidents with coordinates in this range.</p>
        )}
      </details>
    </div>
  )
}

export default IncidentMap
