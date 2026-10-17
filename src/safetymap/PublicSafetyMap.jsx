import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  CONCENTRATION_BANDS,
  ZONE_CELL_DEGREES,
  concentrationBand,
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
// This component accepts ZONES ONLY. It has no `points` prop, no reference
// field, no type field, no date field and no label field, so there is no
// code path here that could render one. That is the project's
// construction-over-filtering rule: the same reason `incidents` has no party
// table and the same reason the public RPCs return integers.
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
// ─── ⚠️ STILL NO BOUNDARY POLYGON ───────────────────────────────────────────
//
// P2 remains authoritative: the barangay's own purok names and boundaries are
// unconfirmed. Nothing here draws an outline, and the view centres on
// Dumaguete as an OPENING VIEW rather than an asserted border. A grid cell
// asserts nothing about the barangay's geography, which is precisely why the
// aggregation is a grid and not a made-up polygon.

const HALF_CELL = ZONE_CELL_DEGREES / 2

// A zone carries only numbers, so there is nothing here that needs escaping
// against a value a person typed -- but the popup is still built as an HTML
// string, so the numbers are coerced and bounded rather than interpolated raw.
const safeInt = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.trunc(n)) : '0'
}

const usableZones = (zones) => zones.filter((zone) => (
  Number.isFinite(Number(zone?.center_latitude))
  && Number.isFinite(Number(zone?.center_longitude))
))

const PublicSafetyMap = ({ zones = [], height = 420 }) => {
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
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) { layerRef.current.remove() }
    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer

    const usable = usableZones(zones)

    usable.forEach((zone) => {
      const total = Number(zone.total) || 0
      // ⚠️ DETERMINISTIC. `concentrationBand` is a fixed-threshold lookup,
      // not the official panel's peak-relative `bandFor`: the same count
      // must carry the same shade in every period and on every visit, or a
      // reader comparing two dates is comparing two scales.
      const band = concentrationBand(total)
      const lat = Number(zone.center_latitude)
      const lng = Number(zone.center_longitude)

      L.rectangle(
        [[lat - HALF_CELL, lng - HALF_CELL], [lat + HALF_CELL, lng + HALF_CELL]],
        {
          color: band.tone,
          weight: 1,
          opacity: 0.85,
          fillColor: band.tone,
          fillOpacity: 0.45,
        }
      ).bindPopup(
        `<strong>${safeInt(total)} incidents recorded</strong><br/>`
        + 'in this area, for the selected period.<br/>'
        + 'This square covers an area about 220 m across,<br/>'
        + 'not the location of any incident.'
      ).addTo(layer)
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
