import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { bandFor, markerRadiusFor } from './safetyAnalytics'
import './PublicSafetyMap.css'

// Final Integration — the PUBLIC Community Safety Map's canvas.
//
// ─── ⚠️ A SEPARATE COMPONENT FROM `IncidentMap`, DELIBERATELY ────────────────
//
// `IncidentMap` draws individual incidents: it takes a `points` array and
// builds a popup out of a reference, a type, a timestamp and a location
// label. Parameterising it with a "public mode" flag would leave one
// component that CAN render all of that and one boolean standing between a
// resident and an officer's note -- and a later edit to the official map
// would silently be an edit to the public one.
//
// This component accepts ZONES ONLY. It has no `points` prop, no reference
// field, no type field, no date field and no label field, so there is no
// code path here that could render one. That is the project's
// construction-over-filtering rule: the same reason `incidents` has no party
// table and the same reason the public RPCs return integers.
//
// ⚠️ What IS shared is `bandFor` and `markerRadiusFor` -- pure count-to-size
// and count-to-colour functions from `safetyAnalytics.js` that hold no
// incident data at all. Sharing them is what keeps the two maps from
// describing the same count with two different words.
//
// ─── ⚠️ STILL NO BOUNDARY POLYGON ───────────────────────────────────────────
//
// P2 remains authoritative: the barangay's own purok names and boundaries are
// unconfirmed. Nothing here draws an outline, and the view centres on
// Dumaguete as an OPENING VIEW rather than an asserted border. A grid cell
// asserts nothing about the barangay's geography, which is precisely why the
// aggregation is a grid and not a made-up polygon.

const BAND_TONE = { low: '#1d4ed8', medium: '#b45309', high: '#b91c1c' }

// A zone carries only numbers, so there is nothing here that needs escaping
// against a value a person typed -- but the popup is still built as an HTML
// string, so the numbers are coerced and bounded rather than interpolated raw.
const safeInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.trunc(n)) : '0'
}

const PublicSafetyMap = ({ zones = [], height = 420 }) => {
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
    map.setView([9.3068, 123.3054], 14)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) { layerRef.current.remove() }
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer

    const peak = zones.reduce((max, z) => Math.max(max, Number(z.total) || 0), 0)
    const usable = zones.filter((z) => (
      Number.isFinite(Number(z?.center_latitude))
      && Number.isFinite(Number(z?.center_longitude))
    ))

    usable.forEach((zone) => {
      const total = Number(zone.total) || 0
      const band = bandFor(total, peak)
      L.circleMarker([Number(zone.center_latitude), Number(zone.center_longitude)], {
        radius: markerRadiusFor(total, peak),
        color: BAND_TONE[band.key],
        weight: 2,
        opacity: 0.9,
        fillColor: BAND_TONE[band.key],
        fillOpacity: 0.22,
      }).bindPopup(
        `<strong>${safeInt(total)} incidents recorded</strong><br/>`
        + 'in this area, for the selected period.<br/>'
        + 'This circle marks the centre of an area about 220 m across,<br/>'
        + 'not the location of any incident.'
      ).addTo(layer)
    })

    if (usable.length > 0) {
      map.fitBounds(
        L.latLngBounds(usable.map((z) => [
          Number(z.center_latitude), Number(z.center_longitude),
        ])),
        { padding: [48, 48], maxZoom: 16 }
      )
    }
  }, [zones])

  return (
    <div className="psm-wrap">
      <div
        ref={containerRef}
        className="psm-canvas"
        style={{ height: `${height}px` }}
        role="application"
        aria-label="Map of areas where incidents have been recorded"
      />
      {/* ⚠️ The map is not the only way to read this. A screen-reader user,
          and anybody whose tiles do not load, gets the same counts as a
          list. A canvas of coloured circles is not an accessible record --
          the same reason `IncidentMap` carries its own list. The list shows
          COUNTS AND NOTHING ELSE, because that is all a zone holds. */}
      <details className="psm-alt">
        <summary>Recorded areas as a list</summary>
        {zones.length === 0 ? (
          <p className="psm-empty">No areas to show for this period.</p>
        ) : (
          <ol className="psm-alt-list">
            {zones.map((zone, index) => (
              <li key={zone.zone_key || index}>
                Area {index + 1} &mdash; <strong>{Number(zone.total) || 0}</strong>
                {' '}incidents recorded
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  )
}

export default PublicSafetyMap
