// Safety Map & Analytics as ONE module with three tabs: Incident Map, Analytics &
// Insights and Patrol Coverage. These pin that nothing was lost in the merge,
// that a hidden tab fetches nothing, that only the incident category is shared
// (the one filter whose meaning is identical on every tab), and that the old
// Analytics & Insights sidebar entry and its stored id land in the right place.
import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MOVED_OFFICIAL_TABS, OFFICIAL_TABS, movedOfficialSection, resolveOfficialTab } from '../utils/officialTabs'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } } }))
jest.mock('leaflet', () => {
  const layer = () => { const self = { markers: [], addTo: (p) => { if (p?.markers) p.markers.push(self); return self }, remove: () => self, bindPopup: () => self }; return self }
  return { __esModule: true, default: { map: () => ({ remove: () => {}, setView: () => {}, fitBounds: () => {} }), tileLayer: () => layer(), layerGroup: () => layer(), circleMarker: () => layer(), latLngBounds: (v) => v } }
})
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true })
jest.mock('../people/peopleApi')

const { supabase } = require('../supabase/supabaseClient')
const SafetyMapPanel = require('./SafetyMapPanel').default
const { FILTER_SCOPE_NOTE, LOCATION_RULE_NOTE, SAFETY_SECTIONS } = require('./SafetyMapPanel')

const inc = (id, type, location, extra = {}) => ({ id, reference: `INC-${id}`, incident_type: type, occurred_at: '2026-10-15T02:00:00.000Z', latitude: 9.3068, longitude: 123.3054, location_text: location, area_note: '', status: 'recorded', blotter_reference: null, ...extra })
const ROWS = [inc('1', 'traffic_accident', 'Rizal Street'), inc('2', 'traffic_accident', 'rizal  street'), inc('3', 'threat', 'Colon Street', { area_note: 'Purok 2' })]
const SUMMARY = { overview: { distinct_incident_matters: 3, linked_people: 2, respondent_subject_matters: 1, victim_matters: 0, substantiated_outcomes: 0, not_substantiated_outcomes: 0 }, roles: [], outcomes: [], repeat_people: null, repeat_people_restricted: true, community_credit: { configured: false, message: 'Community Credit policy is not configured.' } }
let calls = []
const install = (over = {}) => {
  calls = []
  const table = { incident_map_points: ROWS, incident_queue: ROWS, tanod_coverage_summary: [{ area_key: 'rizal street', area_label: 'Rizal Street', assignment_count: 2, tanod_count: 1 }], incident_counts_by_type: [{ incident_type: 'traffic_accident', total: 2 }, { incident_type: 'threat', total: 1 }], barangay_safety_analytics: SUMMARY, repeated_dispute_analytics: [], ...over }
  supabase.rpc.mockImplementation((fn, args) => {
    calls.push([fn, args])
    const value = table[fn]
    if (value instanceof Error) return Promise.resolve({ data: null, error: { code: value.code, message: 'x' } })
    const rows = fn === 'incident_queue' && args?.p_type ? value.filter((r) => r.incident_type === args.p_type) : value
    return Promise.resolve({ data: rows ?? [], error: null })
  })
}
beforeEach(() => { supabase.from.mockReturnValue({}); install() })
const called = (fn) => calls.filter(([name]) => name === fn)
const tab = (name) => screen.getByRole('tab', { name })
const mapReady = () => screen.findByText(/incidents? plotted/)

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('navigation', () => {
  test('one sidebar entry: Safety Map & Analytics; no separate Analytics & Insights', () => {
    const sidebar = code('components/Sidebar.jsx')
    const official = sidebar.slice(sidebar.indexOf('const officialNavItems = ['), sidebar.indexOf('const residentNavItems = ['))
    expect(official).toContain("{ id: 'safety-map', label: 'Safety Map & Analytics'")
    expect(official).not.toMatch(/Analytics & Insights|id: 'reports'/)
    expect(OFFICIAL_TABS).toContain('safety-map')
    expect(OFFICIAL_TABS).not.toContain('reports')
  })

  test('a stored Analytics & Insights id opens the module on its Analytics tab', () => {
    expect(resolveOfficialTab('reports')).toBe('safety-map')
    expect(movedOfficialSection('reports')).toBe('analytics')
    expect(movedOfficialSection('people-history')).toBeNull()
    expect(movedOfficialSection('safety-map')).toBeNull()
    ;['constructor', '__proto__', 'toString', null, 3].forEach((v) => expect(movedOfficialSection(v)).toBeNull())
    expect(MOVED_OFFICIAL_TABS['people-history']).toBe('incidents') // the earlier move is unchanged
  })

  test('no retired module returns, and the analytics code, sources and tests are kept', () => {
    ;['reservations', 'registry', 'waste', 'health-events', 'nurse', 'kapitan'].forEach((t) => expect(OFFICIAL_TABS).not.toContain(t))
    for (const f of ['analytics/AnalyticsInsights.jsx', 'analytics/AnalyticsCharts.jsx', 'analytics/incidentAnalytics.js', 'analytics/analyticsPeriods.js', 'analytics/AnalyticsInsights.test.jsx']) expect(fs.existsSync(path.join(__dirname, '..', f))).toBe(true)
    expect(code('dashboards/OfficialDashboard.jsx')).not.toMatch(/AnalyticsInsights/)
  })
})

describe('the three tabs', () => {
  test('are a keyboard-operable tablist in the requested order, with the map first', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(SAFETY_SECTIONS.map(([, label]) => label))
    expect(tabs.map((t) => t.textContent)).toEqual(['Incident Map', 'Analytics & Insights', 'Patrol Coverage'])
    expect(tab('Incident Map')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Incident Map')).toHaveAttribute('tabIndex', '0')
    expect(tab('Patrol Coverage')).toHaveAttribute('tabIndex', '-1')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'smap-tab-map')
    tab('Incident Map').focus()
    fireEvent.keyDown(tab('Incident Map'), { key: 'ArrowLeft' })
    expect(tab('Patrol Coverage')).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tab('Patrol Coverage'))
    fireEvent.keyDown(tab('Patrol Coverage'), { key: 'Home' })
    expect(document.activeElement).toBe(tab('Incident Map'))
    fireEvent.keyDown(tab('Incident Map'), { key: 'End' })
    expect(tab('Patrol Coverage')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  test('the map tab keeps its map, filters, caption, legend, list and totals', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    expect(screen.getByRole('heading', { name: /Incident map/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter the map by incident type')).toBeInTheDocument()
    expect(screen.getByLabelText('Map from date')).toBeInTheDocument()
    expect(screen.getByText('Incident locations as a list')).toBeInTheDocument()
    expect(screen.getByText('Solid ring: a patrol area matches')).toBeInTheDocument()
    expect(screen.getByText('Incidents recorded').closest('.smap-stat')).toHaveTextContent('3')
    expect(screen.getByText(FILTER_SCOPE_NOTE)).toBeInTheDocument()
  })

  test('patrol coverage keeps its totals, repeated locations, observations, gaps and caveat', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    fireEvent.click(tab('Patrol Coverage'))
    expect(await screen.findByText('Active patrol assignments')).toBeInTheDocument()
    expect(screen.getByText('Active patrol assignments').closest('.smap-stat')).toHaveTextContent('2')
    expect(screen.getByRole('heading', { name: 'Repeated locations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Observations' })).toBeInTheDocument()
    expect(screen.getByText(/Matched by exact area wording only/)).toBeInTheDocument()
    // The map rule folds case and spacing, so "Rizal Street" and "rizal  street" are one place here.
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText(LOCATION_RULE_NOTE)).toBeInTheDocument()
  })

  test('the analytics tab is the existing Analytics & Insights, embedded under one h1', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    fireEvent.click(tab('Analytics & Insights'))
    expect(await screen.findByRole('heading', { level: 2, name: 'Analytics & Insights' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Safety Map & Analytics'])
    expect(await screen.findByText('Incident records')).toBeInTheDocument()
    for (const label of ['This week', 'This month', 'This year', 'Custom range', 'All available records']) expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Incidents over time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Day of week' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Time of day' })).toBeInTheDocument()
    // The map filter bar is not shown on the analytics tab: that tab has its own filters.
    expect(screen.queryByLabelText('Filter the map by incident type')).not.toBeInTheDocument()
  })
})

describe('fetching', () => {
  test('a hidden analytics tab fetches nothing, and the map no longer calls 062 itself', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    expect(called('barangay_safety_analytics')).toHaveLength(0)
    expect(called('incident_counts_by_type')).toHaveLength(0)
    expect(called('repeated_dispute_analytics')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Map from date'), { target: { value: '2026-10-01' } })
    await waitFor(() => expect(called('tanod_coverage_summary').length).toBeGreaterThan(1))
    expect(called('barangay_safety_analytics')).toHaveLength(0)
  })

  test('opening straight on analytics loads no map or patrol data until those tabs are shown', async () => {
    render(<SafetyMapPanel section="analytics" onSectionChange={() => {}} />)
    await screen.findByText('Incident records')
    expect(called('incident_map_points')).toHaveLength(0)
    expect(called('tanod_coverage_summary')).toHaveLength(0)
  })

  test('switching tabs does not refetch the map data', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    const before = called('incident_map_points').length
    fireEvent.click(tab('Patrol Coverage'))
    fireEvent.click(tab('Incident Map'))
    await mapReady()
    expect(called('incident_map_points')).toHaveLength(before)
  })
})

describe('filters', () => {
  test('the incident category is shared both ways, because it means the same thing everywhere', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    fireEvent.change(screen.getByLabelText('Filter the map by incident type'), { target: { value: 'threat' } })
    fireEvent.click(tab('Analytics & Insights'))
    await waitFor(() => expect(screen.getByLabelText('Incident category')).toHaveValue('threat'))
    await waitFor(() => expect(called('incident_queue').some(([, a]) => a.p_type === 'threat')).toBe(true))
    fireEvent.change(screen.getByLabelText('Incident category'), { target: { value: 'traffic_accident' } })
    fireEvent.click(tab('Incident Map'))
    expect(screen.getByLabelText('Filter the map by incident type')).toHaveValue('traffic_accident')
  })

  test('dates and area are not shared, and analytics filters survive leaving the tab', async () => {
    render(<SafetyMapPanel />)
    await mapReady()
    fireEvent.change(screen.getByLabelText('Map from date'), { target: { value: '2026-10-01' } })
    fireEvent.click(tab('Analytics & Insights'))
    await screen.findByText('Incident records')
    expect(screen.getByLabelText('Time window')).toHaveValue('all')
    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: 'last_90_days' } })
    fireEvent.change(await screen.findByLabelText('Recorded area'), { target: { value: 'Purok 2' } })
    fireEvent.click(tab('Incident Map'))
    expect(screen.getByLabelText('Map from date')).toHaveValue('2026-10-01')
    fireEvent.click(tab('Analytics & Insights'))
    expect(screen.getByLabelText('Time window')).toHaveValue('last_90_days')
    await waitFor(() => expect(screen.getByLabelText('Recorded area')).toHaveValue('Purok 2'))
  })
})

describe('roles and unavailable states are unchanged', () => {
  test('only a records administrator requests the complaint-pair list; others see the restriction', async () => {
    const { unmount } = render(<SafetyMapPanel section="analytics" onSectionChange={() => {}} />)
    expect(await screen.findByText(/list of complaint pairs is restricted/)).toBeInTheDocument()
    expect(screen.getByText(/list of people is restricted/)).toBeInTheDocument()
    expect(called('repeated_dispute_analytics')).toHaveLength(0)
    unmount(); calls = []
    render(<SafetyMapPanel canAdminister section="analytics" onSectionChange={() => {}} />)
    await waitFor(() => expect(called('repeated_dispute_analytics').length).toBeGreaterThan(0))
  })

  test('062 not installed: the analytics tab says so and the incident charts still work', async () => {
    install({ barangay_safety_analytics: Object.assign(new Error('x'), { code: 'PGRST202' }) })
    render(<SafetyMapPanel section="analytics" onSectionChange={() => {}} />)
    expect(await screen.findByText('Incident records')).toBeInTheDocument()
    expect((await screen.findAllByText(/migration 062/)).length).toBeGreaterThan(0)
    expect(screen.queryByText('Linked person records')).not.toBeInTheDocument()
  })

  test('the module reads no complaint, person-history or KP surface of its own', () => {
    const panel = code('safetymap/SafetyMapPanel.jsx')
    expect(panel).not.toMatch(/person_history|complaint_queue|complaint_parties|kp_case|supabase\.from|loadBarangayAnalytics/)
  })
})
