// Final Integration — the PUBLIC Community Safety Map, as RENDERED.
//
// ⚠️ `leaflet` IS MOCKED AS A MEASUREMENT, NOT A STUB, exactly as
// `safetyMapPanel.test.js` mocks it: every `bindPopup` string is recorded, so
// the privacy guards below read what a circle would actually SAY rather than
// what the source appears to say. jsdom has no layout, so a real Leaflet map
// would draw nothing to assert against anyway.
//
// ⚠️ EVERY FIXTURE CARRIES A NARRATIVE, A WITNESS NAME, A REFERENCE AND A
// STREET NAME on properties the public RPCs do not return. If a future edit
// reached for `incident_map_points()` or widened one of the four aggregate
// functions, these strings would surface in the document or in a popup. They
// are the trap, and they must never be rendered.
//
// ⚠️ CRA 5's preset sets `resetMocks: true`, so every implementation is
// installed in `beforeEach` rather than in the factory.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

globalThis.__popups = []
// ⚠️ EVERY SHAPE THE MAP DRAWS IS RECORDED TOO, not just its popup. The
// canvas now draws grid RECTANGLES, and a rectangle carries four
// coordinates where a circle carried one -- so the "no exact coordinate"
// guard has to be able to read the corners it was handed, or it would be
// asserting about a shape it never saw.
globalThis.__shapes = []

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))

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
        remove: () => {}, setView: () => {}, fitBounds: () => {},
      }),
      tileLayer: () => { globalThis.__shapes.push({ kind: 'tileLayer' }); return layer() },
      layerGroup: () => layer(),
      circleMarker: (latlng, opts) => {
        globalThis.__shapes.push({ kind: 'circleMarker', latlng, opts })
        return layer()
      },
      rectangle: (bounds, opts) => {
        globalThis.__shapes.push({ kind: 'rectangle', bounds, opts })
        return layer()
      },
      polygon: (pts, opts) => {
        globalThis.__shapes.push({ kind: 'polygon', pts, opts })
        return layer()
      },
      marker: (latlng, opts) => {
        globalThis.__shapes.push({ kind: 'marker', latlng, opts })
        return layer()
      },
      latLngBounds: (v) => v,
    },
  }
})
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true })

// Navbar pulls in AuthContext and Footer the barangay constants; both have
// their own suites, and standing them up here would be testing the chrome.
// ⚠️ The Navbar's own Community Safety entry is asserted in `Navbar.test.js`,
// not here, for exactly that reason.
jest.mock('../components/Navbar', () => () => <nav data-testid="navbar" />)
jest.mock('../components/Footer', () => () => <footer data-testid="footer" />)

const { supabase } = require('../supabase/supabaseClient')
const CommunitySafety = require('./CommunitySafety').default
const LABELS = require('../safetymap/publicSafetyLabels')

// Strings the public surface must never show. Each is planted on a fixture.
const NARRATIVE = 'A tricycle hit the complainant near the chapel'
const WITNESS = 'Maria Dela Cruz saw everything'
const REFERENCE = 'INC-2026-AB12CD'
const STREET = 'Rizal Street'
const TANOD = 'Probe Tanod One'

const ZONES = [
  { zone_key: '9.307,123.305', center_latitude: 9.307, center_longitude: 123.305, total: 5 },
  { zone_key: '9.309,123.307', center_latitude: 9.309, center_longitude: 123.307, total: 2 },
]

// ⚠️ The forbidden properties ride along on the fixture rows. The component
// must ignore them because it never reads them -- not because a filter
// removes them.
const DIRTY_ZONES = ZONES.map((z) => ({
  ...z,
  narrative: NARRATIVE,
  area_note: WITNESS,
  reference: REFERENCE,
  location_text: STREET,
  tanod_name: TANOD,
  status: 'under_investigation',
}))

const TYPES = [
  { incident_type: 'traffic_accident', total: 4, narrative: NARRATIVE },
  { incident_type: 'physical_altercation', total: 3, location_text: STREET },
]

const MONTHLY = [
  { month_key: '2026-09', total: 3 },
  { month_key: '2026-10', total: 4 },
]

const OVERVIEW = { total_incidents: 9, mapped_incidents: 7, zone_count: 2 }

const respond = ({
  overview = OVERVIEW, zones = DIRTY_ZONES, types = TYPES, monthly = MONTHLY,
} = {}) => {
  supabase.rpc.mockImplementation((fn) => {
    const table = {
      public_safety_overview: [overview],
      public_safety_zones: zones,
      public_safety_type_counts: types,
      public_safety_monthly: monthly,
    }
    if (!(fn in table)) {
      throw new Error(`the public page called a non-public RPC: ${fn}`)
    }
    return Promise.resolve({ data: table[fn], error: null })
  })
}

// The page renders `<Link>`s of its own (Back to Home, and the closing
// notice's complaint link), so it needs a Router exactly as
// `Announcements.test.js` gives one to its page component.
const show = () => render(
  <MemoryRouter><CommunitySafety /></MemoryRouter>
)

const ready = async () => {
  await waitFor(() => expect(
    screen.queryByText(/Loading the community safety map/i)
  ).not.toBeInTheDocument())
}

beforeEach(() => {
  globalThis.__popups = []
  globalThis.__shapes = []
  respond()
})

// ─── What it renders at all ─────────────────────────────────────────────────

describe('the page itself', () => {
  it('renders one h1, and it is the page title', async () => {
    show()
    await ready()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(LABELS.PAGE_TITLE)
  })

  it('offers a Back to Home link, so a resident needs no account to leave', async () => {
    show()
    await ready()
    const back = screen.getByRole('link', { name: /Back to Home/i })
    expect(back).toHaveAttribute('href', '/')
  })

  it('reads the four public RPCs and nothing else', async () => {
    show()
    await ready()
    const called = supabase.rpc.mock.calls.map((c) => c[0]).sort()
    expect(called).toEqual([
      'public_safety_monthly',
      'public_safety_overview',
      'public_safety_type_counts',
      'public_safety_zones',
    ])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shows the three counts from the overview', async () => {
    show()
    await ready()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Incidents recorded')).toBeInTheDocument()
    expect(screen.getByText('Areas shown on the map')).toBeInTheDocument()
    expect(screen.getByText('Incidents inside those areas')).toBeInTheDocument()
  })

  it('heads the map with concentration, never with a rate', async () => {
    show()
    await ready()
    expect(screen.getByRole('heading', { name: LABELS.CONCENTRATION_LABEL }))
      .toBeInTheDocument()
    // ⚠️ SCOPED AROUND THE DISCLAIMER, which is the one string on the page
    // that must contain "crime rate" in order to say the numbers are not
    // one. `prototypeCoverage.test.js` set that precedent when Business
    // Clearance's own prose denies having a permit number; P4-A followed it
    // for the KP vocabulary. The disclaimer's own presence, and that it
    // reads as a denial, are asserted separately.
    const withoutDisclaimer = document.body.textContent
      .split(LABELS.PUBLIC_DISCLAIMER).join(' ')
    expect(withoutDisclaimer).not.toMatch(/crime|rate|per capita|per 1,?000|risk/i)
  })

  it('skips no heading level', async () => {
    show()
    await ready()
    const levels = screen.getAllByRole('heading')
      .map((h) => Number(h.tagName.slice(1)))
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((level, i) => {
      expect(level - levels[i]).toBeLessThanOrEqual(1)
    })
  })
})

// ─── ⚠️ The privacy guards. These are the suite. ────────────────────────────

describe('what the public page can never show', () => {
  it('renders no narrative, witness name, reference or street name', async () => {
    show()
    await ready()
    const text = document.body.textContent
    ;[NARRATIVE, WITNESS, REFERENCE, STREET, TANOD].forEach((secret) => {
      expect(text).not.toContain(secret)
    })
    // and not in any attribute either -- a popup, a title or an aria-label
    expect(document.body.innerHTML).not.toContain(NARRATIVE)
    expect(document.body.innerHTML).not.toContain(WITNESS)
    expect(document.body.innerHTML).not.toContain(REFERENCE)
    expect(document.body.innerHTML).not.toContain(STREET)
  })

  // ⚠️ THE LOAD-BEARING ONE. A marker popup is what a reader sees when they
  // click; the mock records the real string.
  it('every map popup carries a count and no location or identity', async () => {
    show()
    await ready()
    expect(globalThis.__popups.length).toBe(DIRTY_ZONES.length)
    globalThis.__popups.forEach((html) => {
      expect(html).toMatch(/incidents recorded/)
      ;[NARRATIVE, WITNESS, REFERENCE, STREET, TANOD].forEach((secret) => {
        expect(html).not.toContain(secret)
      })
      // nothing that reads as a precise place
      expect(html).not.toMatch(/street|purok|house|barangay hall|corner of/i)
      // and it says the circle is a centre, not a location
      expect(html).toMatch(/not the location of any incident/i)
    })
  })

  it('shows no exact incident coordinate anywhere in the document', async () => {
    show()
    await ready()
    // the cell centres are passed to leaflet, never printed
    expect(document.body.textContent).not.toContain('9.307')
    expect(document.body.textContent).not.toContain('123.305')
  })

  it('names no status, and offers no action on an incident', async () => {
    show()
    await ready()
    expect(document.body.textContent).not.toMatch(/under investigation|under_investigation/i)
    screen.queryAllByRole('button').forEach((button) => {
      expect(button.textContent).not.toMatch(
        /approve|decline|assign|record|resolve|close|refer|edit|delete/i
      )
    })
  })

  it('says nothing about a Tanod or a patrol', async () => {
    show()
    await ready()
    expect(document.body.textContent).not.toMatch(/tanod|patrol|roving|static post/i)
  })

  it('mentions no complaint, screening or KP case data', async () => {
    show()
    await ready()
    const text = document.body.textContent
    expect(text).not.toMatch(/screening|katarungang|kp case|hearing|summons|blotter/i)
    // ⚠️ the one allowed mention is the closing notice's LINK, which tells a
    // resident where to report rather than showing them complaint data
    const link = screen.getByRole('link', { name: /file a complaint/i })
    expect(link).toHaveAttribute('href', '/resident?tab=complaints')
  })
})

// ─── ⚠️ The grid canvas itself ─────────────────────────────────────────────
//
// These read `globalThis.__shapes`, which the leaflet mock records, so they
// assert what the map would actually DRAW rather than what the source looks
// like. A component that stopped calling `L.rectangle` and started calling
// `L.circleMarker` again would read almost identically and would fail here.

describe('the grid canvas', () => {
  const HALF = LABELS.ZONE_CELL_DEGREES / 2
  const kinds = () => globalThis.__shapes.map((shape) => shape.kind)
  const rects = () => globalThis.__shapes.filter((shape) => shape.kind === 'rectangle')

  it('draws one square per published area, on the grid the SQL used', async () => {
    show()
    await ready()
    expect(rects()).toHaveLength(ZONES.length)
    rects().forEach((rect, index) => {
      const [[south, west], [north, east]] = rect.bounds
      const zone = ZONES[index]
      expect(north - south).toBeCloseTo(LABELS.ZONE_CELL_DEGREES, 10)
      expect(east - west).toBeCloseTo(LABELS.ZONE_CELL_DEGREES, 10)
      // ⚠️ EVERY CORNER IS THE PUBLISHED CENTRE ± HALF A CELL, so the square
      // publishes no coordinate the RPC did not already imply. A rectangle
      // whose corners came from anywhere else would be new precision.
      expect(south).toBeCloseTo(zone.center_latitude - HALF, 10)
      expect(north).toBeCloseTo(zone.center_latitude + HALF, 10)
      expect(west).toBeCloseTo(zone.center_longitude - HALF, 10)
      expect(east).toBeCloseTo(zone.center_longitude + HALF, 10)
    })
  })

  // ⚠️ THE DEFECT THIS EXISTS FOR. A point marker says "an incident happened
  // about here", which is precisely the claim migration 045 coarsens away.
  // The component has no `points` prop to draw one from -- this asserts the
  // consequence rather than trusting the prop list.
  it('draws no point marker of any kind, in any state', async () => {
    show()
    await ready()
    expect(kinds()).not.toContain('circleMarker')
    expect(kinds()).not.toContain('marker')
    expect(kinds()).not.toContain('polygon')
  })

  it('shades each square by the fixed band for its own count', async () => {
    show()
    await ready()
    rects().forEach((rect, index) => {
      const band = LABELS.concentrationBand(ZONES[index].total)
      expect(rect.opts.color).toBe(band.tone)
      expect(rect.opts.fillColor).toBe(band.tone)
    })
    // the 5-incident area and the 2-incident area must not look alike
    expect(rects()[0].opts.fillColor).not.toBe(rects()[1].opts.fillColor)
  })

  // ⚠️ THE MAP IS THE CONTEXT THAT MAKES AN EMPTY ANSWER LEGIBLE. It used to
  // live inside the `zones.length > 0` branch, so a quiet period showed a
  // sentence where the map had been -- and a reader could not tell "nothing
  // to show" from "it failed to load". Run for all three empty states.
  it.each([
    ['nothing recorded at all', { total_incidents: 0, mapped_incidents: 0, zone_count: 0 }],
    ['recorded but nothing mappable', { total_incidents: 4, mapped_incidents: 0, zone_count: 0 }],
  ])('keeps the basemap on screen when %s', async (_name, overview) => {
    respond({ overview, zones: [], types: [], monthly: [] })
    show()
    await ready()
    expect(screen.getByRole('application', { name: /Map of areas/i })).toBeInTheDocument()
    expect(kinds()).toContain('tileLayer')
    expect(rects()).toHaveLength(0)
  })

  it('says so in words when nothing is publishable for the period', async () => {
    respond({ overview: { total_incidents: 4, mapped_incidents: 0, zone_count: 0 }, zones: [] })
    show()
    await ready()
    expect(screen.getByText(LABELS.EMPTY_NO_ZONES)).toBeInTheDocument()
    expect(LABELS.EMPTY_NO_ZONES).toMatch(/no public incident concentrations/i)
  })

  // The key is part of the map, so it travels with it rather than being
  // rendered by one page that happens to use it.
  it('carries its key even with nothing drawn', async () => {
    respond({ overview: { total_incidents: 0, mapped_incidents: 0, zone_count: 0 },
      zones: [], types: [], monthly: [] })
    show()
    await ready()
    const key = screen.getByRole('list', { name: /What the shading means/i })
    expect(within(key).getAllByRole('listitem'))
      .toHaveLength(LABELS.CONCENTRATION_BANDS.length)
  })

  it('draws a real OpenStreetMap basemap, not a blank canvas', async () => {
    show()
    await ready()
    expect(kinds().filter((k) => k === 'tileLayer')).toHaveLength(1)
  })
})

// ─── ⚠️ The aggregation rule is ON THE PAGE ─────────────────────────────────

describe('the aggregation rule is stated to the reader', () => {
  it('renders all three privacy notes and the disclaimer', async () => {
    show()
    await ready()
    expect(screen.getByText(LABELS.AGGREGATION_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.THRESHOLD_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.NO_LOCATION_NAMES_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.PUBLIC_DISCLAIMER)).toBeInTheDocument()
  })

  // Both directions: the notes must be there when there is nothing to show
  // too. A caveat that appears only beside data reads as a footnote about
  // that data rather than as the rule the page is built on -- the same thing
  // the official coverage-gap caveat is asserted for.
  it('renders them with no data at all', async () => {
    respond({ overview: { total_incidents: 0, mapped_incidents: 0, zone_count: 0 },
      zones: [], types: [], monthly: [] })
    show()
    await ready()
    expect(screen.getByText(LABELS.AGGREGATION_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.THRESHOLD_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.NO_LOCATION_NAMES_NOTE)).toBeInTheDocument()
    expect(screen.getByText(LABELS.PUBLIC_DISCLAIMER)).toBeInTheDocument()
  })

  it('states the 220 m grouping and the two-incident threshold in words', async () => {
    show()
    await ready()
    expect(screen.getByText(LABELS.AGGREGATION_NOTE).textContent).toMatch(/220 met/i)
    expect(screen.getByText(LABELS.THRESHOLD_NOTE).textContent)
      .toMatch(/two or more/i)
  })

  it('explains the gap between recorded and mapped rather than hiding it', async () => {
    show()
    await ready()
    // 7 of 9 mapped, so 2 are not shown
    expect(screen.getByText(LABELS.coverageSentence(7, 9))).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/7 of 9 recorded incidents/)
  })
})

// ─── Three empty states, which are three different facts ────────────────────

describe('the empty states', () => {
  it('says nothing was recorded when the period holds nothing', async () => {
    respond({ overview: { total_incidents: 0, mapped_incidents: 0, zone_count: 0 },
      zones: [], types: [], monthly: [] })
    show()
    await ready()
    expect(screen.getAllByText(LABELS.EMPTY_NOTHING_RECORDED).length)
      .toBeGreaterThan(0)
    expect(screen.queryByText(LABELS.EMPTY_NOTHING_MAPPED)).not.toBeInTheDocument()
  })

  // ⚠️ THE DIFFERENT FACT. Four incidents exist and no area reaches two, so
  // the map is empty while the count is not. Showing "no incidents recorded"
  // here would misinform a reader about what the barangay holds.
  it('distinguishes "recorded but not mappable" from "nothing recorded"', async () => {
    respond({ overview: { total_incidents: 4, mapped_incidents: 0, zone_count: 0 },
      zones: [] })
    show()
    await ready()
    expect(screen.getByText(LABELS.EMPTY_NOTHING_MAPPED)).toBeInTheDocument()
    expect(globalThis.__popups.length).toBe(0)
  })

  it('reports a failure without naming an error code or a function', async () => {
    supabase.rpc.mockImplementation(() => Promise.resolve({
      data: null, error: { code: '42501', message: 'permission denied for function public_safety_zones' },
    }))
    show()
    await ready()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(LABELS.SAFETY_ERRORS.loadFailed)
    expect(document.body.textContent).not.toMatch(/42501|permission denied|public_safety_zones/)
  })
})

// ─── The period filter ─────────────────────────────────────────────────────

describe('the period filter', () => {
  it('is a labelled control carrying the shared filter class', async () => {
    show()
    await ready()
    const select = screen.getByLabelText('Period')
    expect(select.tagName).toBe('SELECT')
    // ⚠️ `.filter-select` is what carries `align-self: stretch` and
    // `min-height: 24px`. Combined Phase 2 shipped six controls at 19px --
    // under WCAG 2.2 SC 2.5.8 -- by reusing the padded WRAPPER class and
    // omitting this one. A padded wrapper is not a target.
    expect(select).toHaveClass('filter-select')
  })

  it('re-reads all four RPCs with a date bound when a period is chosen', async () => {
    show()
    await ready()
    supabase.rpc.mockClear()
    await userEvent.selectOptions(screen.getByLabelText('Period'), '3m')
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(4))
    supabase.rpc.mock.calls.forEach(([, args]) => {
      expect(args.p_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(args.p_to).toBeNull()
    })
  })

  it('sends no date bound for All recorded', async () => {
    show()
    await ready()
    supabase.rpc.mock.calls.forEach(([, args]) => {
      expect(args.p_from).toBeNull()
      expect(args.p_to).toBeNull()
    })
  })
})

// ─── Counts, bands and observations ────────────────────────────────────────

describe('what the numbers say', () => {
  // ⚠️ REDEFINED, NOT LOOSENED. This used to assert the page's own key --
  // `Fewer recorded` / `More recorded` / `Most recorded` -- which was drawn
  // from `INTENSITY_BANDS`, the OFFICIAL panel's peak-relative scale. The
  // public map now carries its own fixed-threshold bands beside the squares
  // they colour, so the key is asserted where it now lives and against the
  // vocabulary it now uses. The property the test exists for is unchanged
  // and is checked harder: every band is named by a COUNT, and none of them
  // names danger.
  it('labels the concentration bands by how many were recorded, not by danger', async () => {
    show()
    await ready()
    const key = screen.getByRole('list', { name: /What the shading means/i })
    LABELS.CONCENTRATION_BANDS.forEach((band) => {
      expect(within(key).getByText(band.label)).toBeInTheDocument()
      expect(band.label).toMatch(/recorded/i)
    })
    // ⚠️ SCOPED AROUND THE PAGE'S OWN DENIALS, the way
    // `prototypeCoverage.test.js` scoped its title scan: `SHADING_NOTE`
    // has to say "not a danger level" and `PUBLIC_DISCLAIMER` has to say
    // "not a crime rate" IN ORDER TO DENY THEM, so a whole-document scan
    // for those phrases flags the two sentences that exist to rule them
    // out. They are removed first; that each one IS a denial is asserted
    // separately, in `publicSafetyMigration.test.js`.
    const prose = document.body.textContent
      .replace(LABELS.SHADING_NOTE, '')
      .replace(LABELS.PUBLIC_DISCLAIMER, '')
    expect(prose)
      .not.toMatch(/high risk|low risk|unsafe|safe zone|danger level|crime rate/i)
  })

  // ⚠️ THE SAME COUNT MUST CARRY THE SAME SHADE IN EVERY PERIOD. The
  // official panel scales its bands against the busiest cell in the current
  // filter, which is right for an operational view and wrong here: a
  // resident comparing last quarter with this one would be comparing two
  // scales without being told. These are the thresholds the brief fixed.
  it('maps a count to a band deterministically, never against the busiest cell', () => {
    const { concentrationBand } = LABELS
    expect(concentrationBand(2).key).toBe('lowest')
    expect(concentrationBand(3).key).toBe('moderate')
    expect(concentrationBand(4).key).toBe('moderate')
    expect(concentrationBand(5).key).toBe('high')
    expect(concentrationBand(7).key).toBe('high')
    expect(concentrationBand(8).key).toBe('highest')
    expect(concentrationBand(400).key).toBe('highest')
    // Takes ONE argument. A scale that needed the peak would need a second,
    // so the arity is the proof, the same way `needsFurtherReview`'s is.
    expect(concentrationBand.length).toBe(1)
  })

  it('shows the incident types in the same words an official reads', async () => {
    show()
    await ready()
    const { incidentTypeLabel } = LABELS
    expect(screen.getByText(incidentTypeLabel('traffic_accident'))).toBeInTheDocument()
    expect(screen.getByText(incidentTypeLabel('physical_altercation'))).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/traffic_accident|physical_altercation/)
  })

  it('says the types are not criminal charges where the reader meets them', async () => {
    show()
    await ready()
    expect(document.body.textContent).toMatch(/not criminal charges/i)
  })

  it('renders an observation per area that reports and does not prescribe', async () => {
    show()
    await ready()
    const list = screen.getByRole('heading', { name: /What the areas show/i })
      .nextElementSibling
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(ZONES.length)
    items.forEach((item) => {
      expect(item.textContent).toMatch(/recorded/)
      expect(item.textContent).not.toMatch(
        /must|should|install|deploy|review|avoid|penalt/i
      )
    })
  })

  it('shows a month trend with no day-level date', async () => {
    show()
    await ready()
    expect(screen.getByText('Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('Oct 2026')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/2026-09-|2026-10-/)
  })

  it('gives the map an accessible list fallback of counts only', async () => {
    show()
    await ready()
    const summary = screen.getByText(/Recorded areas as a list/i)
    const list = summary.parentElement
    expect(within(list).getAllByRole('listitem')).toHaveLength(ZONES.length)
    expect(list.textContent).not.toContain(STREET)
    expect(list.textContent).toMatch(/Area 1/)
  })
})

// ─── ⚠️ No emergency number is invented ────────────────────────────────────

describe('the closing notice', () => {
  it('says the page is not an emergency service and carries no phone number', async () => {
    show()
    await ready()
    const notice = screen.getByRole('heading', { name: /If you need to report something/i })
      .parentElement
    expect(notice.textContent).toMatch(/not an emergency service/i)
    // ⚠️ NO NUMBER. The only numbers this repository holds are the Barangay
    // Hall's own office lines, which keep office hours with a lunch closure;
    // presenting those as emergency response would be untrue, and inventing
    // a police or hotline number would be worse. The complaint form's
    // emergency notice is asserted the same way.
    expect(notice.textContent).not.toMatch(/\d{3}/)
  })
})
