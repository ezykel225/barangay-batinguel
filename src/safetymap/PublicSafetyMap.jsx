import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { removeLeafletMap } from './removeLeafletMap'
import 'leaflet/dist/leaflet.css'

import {
  CONCENTRATION_BANDS,
  ZONE_CELL_DEGREES,
  concentrationBand,
  incidentTypeLabel,
} from './publicSafetyLabels'
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
// This component accepts zones and SQL-suppressed aggregate type counts.
// It receives no individual incident records or identifying fields.
//
// ─── ⚠️ GRID CELLS, NOT CIRCLES, AND THE SHAPE IS THE POINT ─────────────────
//
// Migration 045 floors every coordinate onto a 0.002° grid and publishes the
// CELL CENTRE. The first version drew a circle there, which reads as "an
// incident happened about here" -- a point estimate the data does not
// support. A rectangle drawn on the grid the SQL actually used says the true
// thing instead: this cell holds this many records, and nothing finer is
// known about any of them.
//
// ⚠️ IT PUBLISHES NO NEW PRECISION. Each corner is the published centre
// ± half a cell, so every coordinate drawn is already implied by the one the
// RPC returned. Nothing here reads a latitude the function did not give, and
// there is still no `points` prop to read one from.
//
// No barangay outline is drawn; the map shows published aggregate cells.

const HALF_CELL = ZONE_CELL_DEGREES / 2

// Popup numbers are coerced; aggregate category labels are escaped below.
const safeInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.trunc(n)) : '0'
}

const usableZones = (zones) => zones.filter((zone) => (
  Number.isFinite(Number(zone?.center_latitude))
  && Number.isFinite(Number(zone?.center_longitude))
))

const bucketLabel = (type) => type === null ? 'Other recorded incidents' : incidentTypeLabel(type)
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const PublicSafetyMap = ({ zones = [], zoneTypes = [], height = 420 }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  // ⚠️ THE BASEMAP IS BUILT ONCE AND DOES NOT DEPEND ON `zones`, which is
  // what makes it render with none. A map that only appeared once there was
  // something to draw would leave a reader unable to tell "nothing recorded
  // here" from "the map failed to load" -- the same objection the Archived
  // Officials panel answered by rendering even when it finds nothing.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, { scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    map.setView([9.3068, 123.3054], 14)
    mapRef.current = map
    return () => { removeLeafletMap(map); mapRef.current = null; layerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) { layerRef.current.remove() }
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer

    const usable = usableZones(zones)

    usable.forEach((zone, index) => {
      const total = Number(zone.total) || 0
      // ⚠️ DETERMINISTIC. `concentrationBand` is a fixed-threshold lookup,
      // not the official panel's peak-relative `bandFor`: the same count
      // must carry the same shade in every period and on every visit, or a
      // reader comparing two dates is comparing two scales.
      const band = concentrationBand(total)
      const lat = Number(zone.center_latitude)
      const lng = Number(zone.center_longitude)

      const rectangle = L.rectangle(
        [[lat - HALF_CELL, lng - HALF_CELL], [lat + HALF_CELL, lng + HALF_CELL]],
        {
          color: band.tone,
          weight: 1,
          opacity: 0.85,
          fillColor: band.tone,
          fillOpacity: 0.45,
          interactive: true,
        }
      ).bindPopup(
        `<strong>${safeInt(total)} incidents recorded</strong><br/>`
        + zoneTypes.filter((row) => row.zone_key === zone.zone_key)
          .map((row) => `${escapeHtml(bucketLabel(row.incident_type))} &mdash; ${safeInt(row.total)}<br/>`).join('')
        + 'in this area, for the selected period.<br/>'
        + 'This square covers an area about 220 m across,<br/>'
        + 'not the location of any incident.'
      )
      rectangle.on('add', () => {
        const element = rectangle.getElement()
        if (!element) return
        element.setAttribute('tabindex', '0')
        element.setAttribute('role', 'button')
        element.setAttribute('aria-label', `Area ${index + 1}: ${safeInt(total)} recorded incidents. Show type breakdown.`)
        element.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            rectangle.openPopup()
          }
        }
      })
      rectangle.addTo(layer)
    })

    if (usable.length > 0) {
      map.fitBounds(
        L.latLngBounds(usable.flatMap((zone) => {
          const lat = Number(zone.center_latitude)
          const lng = Number(zone.center_longitude)
          return [
            [lat - HALF_CELL, lng - HALF_CELL],
            [lat + HALF_CELL, lng + HALF_CELL],
          ]
        })),
        { padding: [48, 48], maxZoom: 16 }
      )
    }
  }, [zones, zoneTypes])

  return (
    <div className="psm-wrap">
      <div
        ref={containerRef}
        className="psm-canvas"
        style={{ height: `${height}px` }}
        role="application"
        aria-label="Map of areas where incidents have been recorded"
      />

      {/* ⚠️ THE LEGEND IS WORDS, NOT ONLY COLOUR. Four shades of one blue
          carry no meaning to a reader who cannot tell them apart, and the
          counts are the actual information -- the swatch is the decoration.
          Each entry says HOW MANY WERE RECORDED and nothing about danger:
          there is no "high risk" row here, and a test scans for one. */}
      <ul className="psm-legend" aria-label="What the shading means">
        {CONCENTRATION_BANDS.map((band) => (
          <li key={band.key} className="psm-legend-item">
            <span
              className="psm-swatch"
              style={{ backgroundColor: band.tone }}
              aria-hidden="true"
            />
            {band.label}
          </li>
        ))}
      </ul>

      {/* ⚠️ The map is not the only way to read this. A screen-reader user,
          and anybody whose tiles do not load, gets the same counts as a
          list. A canvas of coloured squares is not an accessible record --
          the same reason `IncidentMap` carries its own list. The list shows
          aggregate counts and the same safe type buckets as the popup. */}
      <details className="psm-alt">
        <summary>Recorded areas as a list</summary>
        {zones.length === 0 ? (
          <p className="psm-empty">No areas to show for this period.</p>
        ) : (
          <ol className="psm-alt-list">
            {zones.map((zone, index) => (
              <li key={zone.zone_key || index} className="psm-area">
                <h3 className="psm-area-heading">Area {index + 1} &mdash; {Number(zone.total) || 0} incidents recorded</h3>
                <ul className="psm-area-types">
                  {zoneTypes.filter((row) => row.zone_key === zone.zone_key).map((row) => (
                    <li key={row.incident_type ?? 'suppressed'}>
                      {bucketLabel(row.incident_type)} &mdash; {Number(row.total) || 0}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  )
}

export default PublicSafetyMap
