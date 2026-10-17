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
      tileLayer: () => layer(),
      layerGroup: () => layer(),
      circleMarker: () => layer(),
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
  it('labels the intensity bands by how many were recorded, not by danger', async () => {
    show()
    await ready()
    expect(screen.getByText('Fewer recorded')).toBeInTheDocument()
    expect(screen.getByText('More recorded')).toBeInTheDocument()
    expect(screen.getByText('Most recorded')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/high risk|low risk|unsafe|safe zone/i)
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
