// Combined Phase 2 — the internal safety map and the analytics card, as
// RENDERED.
//
// ⚠️ `leaflet` IS MOCKED, AND THE MOCK IS A MEASUREMENT RATHER THAN A STUB.
// It records every `bindPopup` string, so the popup-content guards below read
// what a marker would actually show rather than what the source appears to
// say. jsdom has no layout, so a real Leaflet map would draw nothing to
// assert against anyway.
//
// ⚠️ CRA 5's preset sets `resetMocks: true`, so every implementation is
// installed in `beforeEach` rather than in the factory.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))

let popups = []

jest.mock('leaflet', () => {
  const layer = () => {
    const self = {
      addTo: () => self,
      remove: () => self,
      bindPopup: (html) => { globalThis.__popups.push(html); return self },
    }
    return self
  }
  return {
    __esModule: true,
    default: {
      map: () => ({
        remove: () => {},
        setView: () => {},
        fitBounds: () => {},
      }),
      tileLayer: () => layer(),
      layerGroup: () => layer(),
      circleMarker: () => layer(),
      latLngBounds: (v) => v,
    },
  }
})

jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true })

const { supabase } = require('../supabase/supabaseClient')
const SafetyMapPanel = require('./SafetyMapPanel').default

// ⚠️ A NARRATIVE IS PLANTED ON EVERY FIXTURE THAT COULD CARRY ONE, and the
// readers do not return it. If a future edit widened `incident_map_points()`
// or reached for `incident_detail()` here, these strings would appear.
const SECRET = 'A tricycle hit the complainant near the chapel'
const WITNESS = 'Maria Dela Cruz saw everything'

const POINTS = [
  {
    id: 'i1', reference: 'INC-2026-AB12CD', incident_type: 'traffic_accident',
    occurred_at: '2026-10-15T02:00:00.000Z', latitude: 9.3068, longitude: 123.3054,
    location_text: 'Rizal Street', status: 'recorded',
    narrative: SECRET, area_note: WITNESS,
  },
  {
    id: 'i2', reference: 'INC-2026-QQ77RR', incident_type: 'threat',
    occurred_at: '2026-10-14T09:00:00.000Z', latitude: 9.3072, longitude: 123.306,
    location_text: 'Colon Street', status: 'resolved',
    narrative: SECRET, area_note: WITNESS,
  },
  // ⚠️ No coordinates. Recorded and counted; must NOT be plotted.
  {
    id: 'i3', reference: 'INC-2026-NOCOORD', incident_type: 'theft_property',
    occurred_at: '2026-10-13T01:00:00.000Z', latitude: null, longitude: null,
    location_text: 'Somewhere unspecified', status: 'recorded',
  },
]

const BY_TYPE = [
  { incident_type: 'traffic_accident', total: 5 },
  { incident_type: 'threat', total: 2 },
]
const BY_STATUS = [
  { status: 'recorded', total: 4 },
  { status: 'resolved', total: 3 },
]
const MONTHLY = [
  { month_key: '2026-09', total: 2 },
  { month_key: '2026-10', total: 5 },
]
const LOCATIONS = [
  {
    key: 'rizal street', location_key: 'rizal street', location_label: 'Rizal Street',
    total: 5, with_coordinates: 4, top_type: 'traffic_accident',
    centroid_latitude: 9.3068, centroid_longitude: 123.3054,
  },
  {
    key: 'colon street', location_key: 'colon street', location_label: 'Colon Street',
    total: 2, with_coordinates: 2, top_type: 'threat',
    centroid_latitude: 9.3072, centroid_longitude: 123.306,
  },
  // Single occurrence — below the repeat threshold, so not a hotspot.
  {
    key: 'perdices street', location_key: 'perdices street', location_label: 'Perdices Street',
    total: 1, with_coordinates: 1, top_type: 'other',
    centroid_latitude: 9.307, centroid_longitude: 123.305,
  },
]
// Only Rizal Street is patrolled, so Colon Street is the one gap.
const COVERAGE = [
  { area_key: 'rizal street', area_label: 'Rizal Street', assignment_count: 3, tanod_count: 2 },
]

let rpcCalls = []

const install = (overrides = {}) => {
  rpcCalls = []
  const table = {
    incident_map_points: POINTS,
    incident_counts_by_type: BY_TYPE,
    incident_counts_by_status: BY_STATUS,
    incident_monthly_trend: MONTHLY,
    incident_location_frequency: LOCATIONS,
    tanod_coverage_summary: COVERAGE,
    ...overrides,
  }
  supabase.rpc.mockImplementation((fn, args) => {
    rpcCalls.push([fn, args])
    return Promise.resolve({ data: table[fn] ?? [], error: null })
  })
}

beforeEach(() => {
  popups = []
  globalThis.__popups = popups
  supabase.from.mockReturnValue({})
  install()
})

const fnNames = () => rpcCalls.map(([fn]) => fn)
const mount = () => render(<SafetyMapPanel />)
// ⚠️ SINGULAR TOO. One fixture below renders "1 incident plotted.", and a
// regex that only matched the plural made the escaping test fail for a reason
// that had nothing to do with escaping.
const ready = () => screen.findByText(/incidents? plotted/)
const caption = () => screen.getByText(/incidents? plotted/).textContent

// ── A. What reaches the screen ───────────────────────────────────────────────

describe('A. the map and analytics reads', () => {
  it('builds everything from the six RPCs and never reads a table', async () => {
    mount()
    await ready()
    ;['incident_map_points', 'incident_counts_by_type', 'incident_counts_by_status',
      'incident_monthly_trend', 'incident_location_frequency', 'tanod_coverage_summary']
      .forEach((fn) => expect(fnNames()).toContain(fn))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('never calls a complaint, screening, KP or incident-detail reader', async () => {
    mount()
    await ready()
    ;['incident_detail', 'blotter_history_for', 'complaint_queue', 'complaint_parties_for',
      'complaint_screenings_for', 'complaint_history_for', 'track_complaint']
      .forEach((fn) => expect(fnNames()).not.toContain(fn))
  })
})

// ── B. The privacy boundary ──────────────────────────────────────────────────

describe('B. no narrative and no person reaches the map', () => {
  // ⚠️ THE LOAD-BEARING ONE. Every fixture carries a narrative and a witness
  // name; the whole rendered document must contain neither.
  it('renders no narrative and no witness name anywhere in the document', async () => {
    const { container } = mount()
    await ready()
    expect(container.textContent).not.toContain(SECRET)
    expect(container.textContent).not.toContain(WITNESS)
    expect(container.textContent).not.toMatch(/tricycle/i)
    expect(container.textContent).not.toMatch(/Dela Cruz/i)
  })

  it('puts no narrative and no witness name in a marker popup', async () => {
    mount()
    await ready()
    expect(popups.length).toBeGreaterThan(0)
    popups.forEach((html) => {
      expect(html).not.toContain(SECRET)
      expect(html).not.toContain(WITNESS)
      expect(html).not.toMatch(/tricycle/i)
      expect(html).not.toMatch(/Dela Cruz/i)
    })
  })

  it('shows only the reference, type, time, location and status in a point popup', async () => {
    mount()
    await ready()
    const point = popups.find((html) => html.includes('INC-2026-AB12CD'))
    expect(point).toBeTruthy()
    expect(point).toContain('Rizal Street')
    expect(point).toContain('Status:')
    ;['narrative', 'recorded_by', 'blotter', 'summary', 'area_note']
      .forEach((term) => expect(point.toLowerCase()).not.toContain(term))
  })

  it('escapes a location label rather than pasting it into the popup HTML', async () => {
    install({
      incident_map_points: [{
        ...POINTS[0], location_text: '<img src=x onerror="alert(1)">Rizal',
      }],
    })
    mount()
    await ready()
    const point = popups.find((html) => html.includes('INC-2026-AB12CD'))
    expect(point).not.toContain('<img')
    expect(point).toContain('&lt;img')
  })
})

// ── C. A point with no coordinates is counted, never plotted ─────────────────

describe('C. incidents with no coordinates', () => {
  // ⚠️ `Number(null)` is `0` and `Number.isFinite(0)` is `true`, so a
  // coercing filter would plot this row at (0, 0) -- the Gulf of Guinea,
  // about 10,000 km from Dumaguete. `safetyAnalytics.isPlottable` rejects a
  // blank BEFORE coercing, and this is that guard as rendered.
  //
  // ⚠️ THIS TEST FOUND A REAL DEFECT and is the regression guard for it. The
  // caption read `points.length` -- the rows the reader returned -- while the
  // canvas drew `plottablePoints(points)`. Two definitions of "plotted" in
  // one card, agreeing only because `incident_map_points()` happens to filter
  // in SQL. It now reads the same function the map does, and this fixture
  // (three rows, one with no coordinates) is what tells the two apart.
  it('leaves an incident with no coordinates off the map and off the list', async () => {
    const { container } = mount()
    await ready()
    expect(caption()).toMatch(/^2 incidents plotted\./)
    expect(container.textContent).not.toContain('INC-2026-NOCOORD')
    popups.forEach((html) => expect(html).not.toContain('INC-2026-NOCOORD'))
  })

  it('says so in words rather than letting the count read as the whole record', async () => {
    mount()
    expect(await screen.findByText(/still recorded and counted; it is not on the map/))
      .toBeInTheDocument()
  })

  it('offers the plotted points as a list for a reader who cannot use the map', async () => {
    mount()
    await ready()
    const list = screen.getByText('Incident locations as a list').closest('details')
    expect(within(list).getByText('INC-2026-AB12CD')).toBeInTheDocument()
    expect(within(list).queryByText('INC-2026-NOCOORD')).not.toBeInTheDocument()
  })
})

// ── D. Counts, never rates ───────────────────────────────────────────────────

describe('D. the numbers are counts', () => {
  it('states no rate, percentage of population, score or prediction', async () => {
    const { container } = mount()
    await ready()
    const text = container.textContent.toLowerCase()
    ;['per capita', 'per-capita', 'per 1,000', 'per 1000', 'rate of', 'crime rate',
      'risk score', 'safety score', 'predicted', 'prediction', 'forecast', 'likelihood',
      'probability', 'machine learning']
      .forEach((term) => expect(text).not.toContain(term))
  })

  it('totals the incidents from the by-type counts', async () => {
    mount()
    await ready()
    const tile = screen.getByText('Incidents recorded').closest('.smap-stat')
    expect(within(tile).getByText('7')).toBeInTheDocument()
  })

  it('counts only the locations with more than one incident as repeated', async () => {
    mount()
    await ready()
    const tile = screen.getByText('Locations with more than one').closest('.smap-stat')
    expect(within(tile).getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('Perdices Street')).not.toBeInTheDocument()
  })
})

// ── E. An observation prompts a review and never prescribes ──────────────────

describe('E. the observations', () => {
  it('reports what was recorded and asks for a review', async () => {
    mount()
    await ready()
    const observations = screen.getByRole('heading', { name: 'Observations' })
      .nextElementSibling
    expect(observations.textContent).toMatch(/5 traffic .*incidents recorded at Rizal Street/i)
    expect(observations.textContent).toMatch(/review for possible local safety intervention/i)
  })

  it('tells nobody to do anything', async () => {
    mount()
    await ready()
    const observations = screen.getByRole('heading', { name: 'Observations' })
      .nextElementSibling.textContent.toLowerCase()
    ;['must ', 'should ', 'install', 'build a', 'deploy', 'assign more', 'arrest',
      'penalt', 'fine ', 'violation of', 'required to', 'is unsafe', 'dangerous']
      .forEach((term) => expect(observations).not.toContain(term))
  })

  // ⚠️ ASSERTED AGAINST THE SHIPPED SENTENCE, not against a paraphrase of
  // it. The first version of this test guessed at wording the module does not
  // use and failed for that reason alone.
  it('carries the disclaimer that these are counts and not a finding', async () => {
    mount()
    await ready()
    const note = screen.getByText(/counts of what officials recorded/i)
    expect(note).toBeInTheDocument()
    expect(note.textContent).toMatch(/not a finding, a ranking of risk, or a recommended action/i)
  })
})

// ── F. The coverage caveat is never separated from the gap list ──────────────

describe('F. the coverage gaps', () => {
  // ⚠️ A "gap" can mean the patrol area was WRITTEN differently, not that
  // nobody was assigned -- two free-text labels typed on two screens. The
  // caveat and the list are asserted together in both directions, because a
  // list without it would read as a staffing failure.
  it('renders the caveat beside the list when there is a gap', async () => {
    mount()
    await ready()
    expect(screen.getByText(/Matched by exact area wording only/)).toBeInTheDocument()
    const gaps = screen.getByRole('heading', { name: /no matching patrol area/i })
    expect(gaps).toBeInTheDocument()
    expect(screen.getByText(/no patrol area written this way/)).toBeInTheDocument()
  })

  it('renders the caveat even when there is NO gap', async () => {
    install({
      tanod_coverage_summary: [
        { area_key: 'rizal street', area_label: 'Rizal Street', assignment_count: 3, tanod_count: 2 },
        { area_key: 'colon street', area_label: 'Colon Street', assignment_count: 1, tanod_count: 1 },
      ],
    })
    mount()
    await ready()
    expect(screen.getByText(/Matched by exact area wording only/)).toBeInTheDocument()
    expect(screen.getByText(/Every repeated location has a patrol area/)).toBeInTheDocument()
  })

  it('names the uncovered repeated location and not the covered one', async () => {
    mount()
    await ready()
    const list = screen.getByText(/no patrol area written this way/).closest('ul')
    expect(within(list).getByText('Colon Street')).toBeInTheDocument()
    expect(within(list).queryByText('Rizal Street')).not.toBeInTheDocument()
  })
})

// ── G. Filters ───────────────────────────────────────────────────────────────

describe('G. filtering', () => {
  it('sends the type to the map reader rather than filtering in the browser', async () => {
    mount()
    await ready()
    rpcCalls = []
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'), 'threat')
    await waitFor(() => expect(fnNames()).toContain('incident_map_points'))
    const [, args] = rpcCalls.find(([fn]) => fn === 'incident_map_points')
    expect(args.p_type).toBe('threat')
  })

  it('sends a null rather than an empty string when no filter is applied', async () => {
    mount()
    await ready()
    const [, args] = rpcCalls.find(([fn]) => fn === 'incident_map_points')
    expect(args.p_type).toBeNull()
    expect(args.p_from).toBeNull()
    expect(args.p_to).toBeNull()
  })

  it('offers two different empty states rather than claiming the record is empty', async () => {
    install({
      incident_map_points: [], incident_counts_by_type: [], incident_counts_by_status: [],
      incident_monthly_trend: [], incident_location_frequency: [], tanod_coverage_summary: [],
    })
    mount()
    await ready()
    expect(caption()).toMatch(/^0 incidents plotted\./)
    expect(screen.getAllByText('No incidents in this range.').length).toBeGreaterThan(0)
    expect(screen.getByText(/No location has more than one recorded incident/))
      .toBeInTheDocument()
  })
})

// ── H. Failure ───────────────────────────────────────────────────────────────

describe('H. when a reader fails', () => {
  it('says so neutrally, with no SQLSTATE, policy or function name', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.rpc.mockImplementation(() => Promise.resolve({
      data: null,
      error: { code: '42501', message: 'permission denied for function incident_map_points' },
    }))
    const { container } = mount()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be loaded/i)
    ;['42501', 'permission denied', 'incident_map_points', 'policy', 'RLS']
      .forEach((term) => expect(container.textContent).not.toContain(term))
    warn.mockRestore()
  })
})

// ── I. Source guards ─────────────────────────────────────────────────────────

describe('I. the wiring', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
  const code = (p) => read(p).split('\n')
    .map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const MODULES = [
    'safetymap/safetyApi.js', 'safetymap/SafetyMapPanel.jsx',
    'safetymap/IncidentMap.jsx', 'safetymap/safetyAnalytics.js',
  ]

  it('keeps all safety-map state out of OfficialDashboard', () => {
    const dash = code('dashboards/OfficialDashboard.jsx')
    ;['incident_map_points', 'incident_location_frequency', 'tanod_coverage_summary']
      .forEach((fn) => expect(dash).not.toContain(fn))
    expect(dash).toContain('<SafetyMapPanel')
  })

  it('reads no table from any safety-map module', () => {
    MODULES.forEach((p) => expect(code(p)).not.toContain('supabase.from'))
  })

  // ⚠️ Scoped to READS, for the reason the incident suite records: the panel
  // legitimately reuses `complaint-empty` as a CSS class, which is §10's
  // "reuse current design language" doing what it was asked to.
  it('reads no complaint, screening or KP surface', () => {
    const SURFACES = [
      'complaint_queue', 'complaint_detail', 'complaint_parties_for',
      'complaint_history_for', 'complaint_attachments_for', 'track_complaint',
      'complaint_screenings_for', 'prepare_complaint_screening',
      'confirm_complaint_screening', 'open_kp_case', 'kp_case_detail',
      'kp_hearings_for', 'incident_detail', 'blotter_history_for',
      'vawc', 'witness',
    ]
    MODULES.forEach((p) => {
      const lower = code(p).toLowerCase()
      SURFACES.forEach((term) => expect(lower).not.toContain(term))
    })
  })

  it('draws no barangay or purok boundary polygon', () => {
    const map = code('safetymap/IncidentMap.jsx')
    ;['L.polygon', 'L.geoJSON', 'L.geoJson', 'L.rectangle', '.geojson', 'purok', 'boundary']
      .forEach((term) => expect(map.toLowerCase()).not.toContain(term.toLowerCase()))
  })

  it('adds leaflet and no second mapping dependency', () => {
    const pkg = JSON.parse(read('../package.json'))
    const deps = Object.keys(pkg.dependencies || {})
    expect(deps).toContain('leaflet')
    ;['react-leaflet', 'leaflet.heat', 'leaflet.markercluster', 'mapbox-gl',
      'maplibre-gl', 'google-maps-react', '@react-google-maps/api']
      .forEach((name) => expect(deps).not.toContain(name))
  })
})

// ── J. The filter controls are real targets ────────────────────────────────

describe('J. the filter bar controls', () => {
  // ⚠️ A REAL DEFECT THIS GUARD EXISTS FOR. `.filter-select-wrap` is a padded
  // wrapper and `.filter-select` is what carries `align-self: stretch` and
  // `min-height: 24px`. These panels reused the wrapper and omitted the
  // control class, so every filter rendered **19px tall** -- under WCAG 2.2
  // SC 2.5.8's 24px minimum. Measured in Chromium at five widths, not read
  // off the stylesheet; "a padded wrapper is not a target" is the project's
  // own phrase for it, from PR #24.
  it('gives every filter control the class that carries the 24px target', () => {
    const { container } = mount()
    const wraps = [...container.querySelectorAll('.filter-select-wrap')]
    expect(wraps.length).toBeGreaterThan(0)
    wraps.forEach((wrap) => {
      const control = wrap.querySelector('input, select, textarea')
      expect(control).not.toBeNull()
      expect(control.className.split(/\s+/)).toContain('filter-select')
    })
  })
})
