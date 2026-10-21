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

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      markers: [], removed: false,
      addTo: (parent) => { if (parent?.markers) parent.markers.push(self); return self },
      remove: () => { self.removed = true; return self },
      bindPopup: (html) => { globalThis.__popups.push(html); self.popup = html; return self },
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
      layerGroup: () => { const group = layer(); globalThis.__groups.push(group); return group },
      circleMarker: (coordinates, options) => { const marker = layer(); marker.options = options; marker.coordinates = coordinates; return marker },
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

const COVERAGE = [{ area_key: 'rizal street', area_label: 'Rizal Street', assignment_count: 3, tanod_count: 2 }]
POINTS.push(...Array.from({length:4},(_,i)=>({...POINTS[0],id:`traffic-${i}`,reference:`INC-TRAFFIC-${i}`})), {...POINTS[1],id:'threat-2',reference:'INC-THREAT-2'})
const repeatRows = (area, counts) => Object.entries(counts).flatMap(([type,count]) => Array.from({length:count},(_,i)=>({...POINTS[0],id:`${area}-${type}-${i}`,reference:`INC-${area}-${type}-${i}`,location_text:area,incident_type:type})))

let rpcCalls = []

const install = (overrides = {}) => {
  rpcCalls = []
  const mapRows = overrides.incident_map_points ?? POINTS
  const table = { incident_map_points: mapRows, incident_queue: mapRows, tanod_coverage_summary: COVERAGE, ...overrides }
  supabase.rpc.mockImplementation((fn, args) => {
    rpcCalls.push([fn, args])
    return Promise.resolve({ data: table[fn] ?? [], error: null })
  })
}

beforeEach(() => {
  popups = []
  globalThis.__popups = popups
  globalThis.__groups = []
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

describe('most common type ties', () => {
  it('displays both demo ties and avoids attributing all incidents to a winner', async () => {
    install({ incident_map_points: [
      ...repeatRows('Demo eight',{disturbance:3,traffic_accident:3,other:2}),
      ...repeatRows('Demo five',{disturbance:2,traffic_accident:2,other:1}),
      ...repeatRows('Clear winner',{disturbance:1,traffic_accident:3}),
    ] })
    mount()
    await ready()
    for (const name of ['Demo eight', 'Demo five']) {
      const row = screen.getAllByText(name).find((el) => el.closest('tr')).closest('tr')
      expect(within(row).getByText('Disturbance / Traffic accident (tie)')).toBeInTheDocument()
    }
    const winner = screen.getAllByText('Clear winner').find((el) => el.closest('tr')).closest('tr')
    expect(within(winner).getByText('Traffic accident')).toBeInTheDocument()
    expect(screen.getByText(/8 incidents recorded at Demo eight/)).toBeInTheDocument()
    expect(screen.getByText(/5 incidents recorded at Demo five/)).toBeInTheDocument()
  })

  it('displays three tied types without choosing a single winner', async () => {
    install({ incident_map_points: repeatRows('Three-way tie',{disturbance:2,public_safety_hazard:2,traffic_accident:2}) })
    mount()
    await ready()
    expect(screen.getByText('Multiple types (tie)')).toBeInTheDocument()
  })
})

// ── A. What reaches the screen ───────────────────────────────────────────────

describe('A. the map and analytics reads', () => {
  it('builds the filtered record collection and coverage from authorized RPCs and never reads a table', async () => {
    mount()
    await ready()
    ;['incident_map_points', 'incident_queue', 'tanod_coverage_summary']
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
    expect(caption()).toMatch(/^7 incidents plotted\./)
    expect(container.textContent).not.toContain('INC-2026-NOCOORD')
    popups.forEach((html) => expect(html).not.toContain('INC-2026-NOCOORD'))
  })

  it('says so in words rather than letting the count read as the whole record', async () => {
    mount()
    expect(await screen.findByText(/still recorded and counted/))
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
    expect(within(tile).getByText('8')).toBeInTheDocument()
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
  it('filters the one loaded incident collection without refetching a different map subset', async () => {
    mount(); await ready(); rpcCalls = []
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'), 'threat')
    expect(caption()).toMatch(/^2 incidents plotted/)
    expect(fnNames()).not.toContain('incident_map_points')
    const list = screen.getByText('Incident locations as a list').closest('details')
    expect(within(list).queryByText('INC-2026-AB12CD')).toBeNull()
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
  const code = (p) => read(p).split(/\r?\n/)
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


// Regression: the live Leaflet group, not popup strings retained from older renders.
const activeFeatures = () => globalThis.__groups.filter(g => !g.removed).flatMap(g => g.markers)
const dots = () => activeFeatures().filter(m => m.options.radius === 6)
const areas = () => activeFeatures().filter(m => m.options.radius !== 6)
const FILTER_ROWS = [
  ...Array.from({length:6},(_,i)=>({...POINTS[0],id:`ta${i}`,reference:`TA-${i}`,location_text:'Area A',occurred_at:i===0?'2026-10-19T16:00:00Z':i===1?'2026-10-20T15:59:59.999Z':'2026-10-20T16:00:00Z'})),
  ...Array.from({length:2},(_,i)=>({...POINTS[0],id:`d${i}`,reference:`D-${i}`,incident_type:'disturbance',location_text:'Area A',occurred_at:'2026-10-19T03:00:00Z'})),
  ...Array.from({length:2},(_,i)=>({...POINTS[0],id:`t${i}`,reference:`T-${i}`,incident_type:'theft_property',location_text:'Area B',occurred_at:'2026-10-20T03:00:00Z'})),
  ...Array.from({length:2},(_,i)=>({...POINTS[0],id:`h${i}`,reference:`H-${i}`,incident_type:'public_safety_hazard',location_text:'Area B',occurred_at:'2026-10-21T03:00:00Z'})),
  {...POINTS[0],id:'no-coordinates',reference:'NO-COORDS',location_text:'Area A',latitude:null,longitude:null,occurred_at:'2026-10-20T03:00:00Z'},
]
const filteredFixture = () => install({ incident_map_points:FILTER_ROWS.filter(r=>r.latitude!==null),incident_queue:FILTER_ROWS,tanod_coverage_summary:[{area_key:'area a',area_label:'Area A',assignment_count:1,tanod_count:1}] })

describe('authoritative filter pipeline regression', () => {
  beforeEach(filteredFixture)
  it('all records drive summaries, while only mapped records drive circles and their bands', async () => {
    mount(); await ready()
    expect(dots()).toHaveLength(12); expect(areas()).toHaveLength(2)
    expect(areas().find(a=>a.popup.includes('Area A')).popup).toMatch('8 incidents recorded')
    expect(areas().find(a=>a.popup.includes('Area B')).popup).toMatch('4 incidents recorded &middot; More recorded')
    expect(areas().find(a=>a.popup.includes('Area A')).options.weight).toBe(3)
    expect(screen.getByText('Incidents recorded').closest('.smap-stat')).toHaveTextContent('13')
    expect(caption()).toContain('1 matching incident has no usable coordinates')
  })
  it.each([['traffic_accident',6],['disturbance',2],['theft_property',2],['public_safety_hazard',2]])('%s changes markers, circles, tooltips and accessible list together', async (type,count) => {
    mount(); await ready()
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'),type)
    await waitFor(()=>expect(dots()).toHaveLength(count))
    expect(areas()).toHaveLength(1)
    expect(areas()[0].popup).toContain(`${count} incidents recorded &middot; Most recorded`)
    const list = screen.getByText('Incident locations as a list').closest('details')
    expect(within(list).getAllByRole('listitem')).toHaveLength(count)
    if(type!=='traffic_accident') expect(caption()).not.toContain('no usable coordinates')
  })
  it('All -> Traffic -> Threat -> reset removes stale Leaflet layers and restores full analytics', async () => {
    mount(); await ready()
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'),'traffic_accident')
    await waitFor(()=>expect(dots()).toHaveLength(6))
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'),'threat')
    await waitFor(()=>expect(activeFeatures()).toHaveLength(0))
    expect(caption()).toContain('No recorded incidents match these filters.')
    expect(caption()).not.toContain('no usable coordinates')
    expect(areas()).toHaveLength(0)
    expect(screen.getByText('Incident locations as a list').closest('details').querySelectorAll('li')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button',{name:'Reset filters'}))
    await waitFor(()=>expect(dots()).toHaveLength(12))
    expect(areas()).toHaveLength(2)
  })
  it.each([['2026-10-21','',6],['','2026-10-20',6],['2026-10-20','2026-10-20',4]])('date range %s to %s uses inclusive Manila calendar days', async (from,to,count) => {
    mount(); await ready()
    fireEvent.change(screen.getByLabelText('Map from date'),{target:{value:from}})
    fireEvent.change(screen.getByLabelText('Map up to date'),{target:{value:to}})
    await waitFor(()=>expect(dots()).toHaveLength(count))
    expect(caption()).toMatch(new RegExp(`^${count} incidents plotted`))
    await userEvent.click(screen.getByRole('button',{name:'Reset filters'}))
    await waitFor(()=>expect(dots()).toHaveLength(12))
    expect(screen.getByLabelText('Map from date')).toHaveValue('')
    expect(screen.getByLabelText('Map up to date')).toHaveValue('')
  })
  it('combines type and dates and counts unmapped rows without adding them to map circles', async () => {
    mount(); await ready()
    await userEvent.selectOptions(screen.getByLabelText('Filter the map by incident type'),'traffic_accident')
    fireEvent.change(screen.getByLabelText('Map from date'),{target:{value:'2026-10-20'}})
    fireEvent.change(screen.getByLabelText('Map up to date'),{target:{value:'2026-10-20'}})
    await waitFor(()=>expect(dots()).toHaveLength(2))
    expect(areas()).toHaveLength(1)
    expect(areas()[0].popup).toContain('2 incidents recorded')
    expect(screen.getByText('Incidents recorded').closest('.smap-stat')).toHaveTextContent('3')
    expect(caption()).toContain('1 matching incident has no usable coordinates')
  })
  it('all-unmapped matches have accurate counts but no concentration circles, including patrol matches', async () => {
    install({incident_map_points:[],incident_queue:FILTER_ROWS.filter(r=>r.latitude===null),tanod_coverage_summary:COVERAGE})
    mount(); await ready()
    expect(activeFeatures()).toHaveLength(0)
    expect(caption()).toMatch(/^0 incidents plotted/)
    expect(caption()).toContain('1 matching incident has no usable coordinates')
    expect(caption()).not.toContain('No recorded incidents match')
  })
  it('late coverage responses cannot replace the latest date selection', async () => {
    const initial = supabase.rpc.getMockImplementation()
    let resolveOld,resolveNew
    supabase.rpc.mockImplementation((fn,args)=>{
      if(fn==='tanod_coverage_summary' && args.p_from==='2026-10-20') return new Promise(resolve=>{resolveOld=resolve})
      if(fn==='tanod_coverage_summary' && args.p_from==='2026-10-21') return new Promise(resolve=>{resolveNew=resolve})
      return initial(fn,args)
    })
    mount(); await ready()
    fireEvent.change(screen.getByLabelText('Map from date'),{target:{value:'2026-10-20'}})
    fireEvent.change(screen.getByLabelText('Map from date'),{target:{value:'2026-10-21'}})
    await act(async()=>{resolveNew({data:[{area_key:'area b'}],error:null})})
    await act(async()=>{resolveOld({data:[{area_key:'area a'}],error:null})})
    expect(areas().find(a=>a.popup.includes('Area B')).options.weight).toBe(3)
    expect(areas().find(a=>a.popup.includes('Area A')).options.weight).toBe(1)
  })
})
