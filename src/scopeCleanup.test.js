import fs from 'fs'
import path from 'path'
import { E_SERVICES } from './constants/eServices'
import { RESIDENT_TABS } from './utils/residentTabs'

const source = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8')

describe('retired module scope cleanup', () => {
  test('public routes no longer expose reservations, health center, or nurse portal', () => {
    const app = source('App.js')
    expect(app).not.toMatch(/path=["']\/(?:reservation|track-reservation|health-center|nurse)/)
    expect(app).not.toMatch(/(?:Reservation|TrackReservation|HealthCenter|NurseDashboard)/)
  })

  test('public navigation and e-services retain only supported services', () => {
    const navbar = source('components/Navbar.jsx')
    const serviceText = E_SERVICES.map(({ label, to }) => `${label} ${to}`).join(' ')
    expect(navbar).not.toMatch(/to=["']\/(?:health-center|reservation|track-reservation)/)
    expect(serviceText).not.toMatch(/reservation|health/i)
    expect(serviceText).toMatch(/Document Request/)
    expect(serviceText).toMatch(/Complaint/)
  })

  test('official and resident sidebars contain only retained destinations', () => {
    const sidebar = source('components/Sidebar.jsx')

    ;[
      'Dashboard', 'Announcements', 'Events', 'Document Requests', 'Complaints',
      'Incidents & Blotter', 'Tanod Operations', 'Safety Map & Analytics',
      'Officials Directory', 'Residents', 'Community Credit', 'Analytics & Insights',
      'Activity Log', 'Settings',
    ].forEach((label) => expect(sidebar).toContain(`label: '${label}'`))
    expect(sidebar).not.toMatch(/label: '(?:Reservations|My Reservations|Waste Management)'/)
    expect(sidebar).not.toMatch(/const nurseNavItems\s*=/)
    expect(RESIDENT_TABS).not.toContain('reservations')
  })

  test('public home and officials directory omit retired health and waste sections', () => {
    expect(source('pages/Home.jsx')).not.toMatch(/<h2>Waste Collection Schedule<\/h2>|to=["']\/health-center/)
    expect(source('pages/Officials.jsx')).not.toMatch(/<h2[^>]*>Health Department<\/h2>|nurse_availability/)
  })

  test('Residents workspace no longer renders the Voter Reference List', () => {
    expect(source('residents/ResidentsWorkspace.jsx')).not.toMatch(/Voter Reference List|voterReference/)
  })

  test('Official Dashboard contains no reservation or waste implementation', () => {
    const dashboard = source('dashboards/OfficialDashboard.jsx')
    expect(dashboard).not.toMatch(/reservation|court|booking/i)
    expect(dashboard).not.toMatch(/waste(?:_schedule| management)?/i)
    // Remediation C: the old Reports implementation was unreachable ({false && ...})
    // and was removed; the 'reports' tab now renders AnalyticsInsights.
    ;['Announcements', 'Events', 'Document Requests', 'Complaints', 'CreditManagement', 'AnalyticsInsights', 'Activity Log', 'Settings']
      .forEach((label) => expect(dashboard).toContain(label))
  })

  test('Official Dashboard fills its overview with retained, loaded data only', () => {
    const dashboard = source('dashboards/OfficialDashboard.jsx')
    ;['Announcements', 'Upcoming Events', 'Pending Document Requests', 'Active Residents']
      .forEach((label) => expect(dashboard).toContain(`>${label}<`))
    expect(dashboard).toContain("documentRequests.filter(request => request.status === 'pending').length")
    expect(dashboard).toContain("residentsList.filter(resident => resident.resident_status === 'active').length")
    expect(dashboard).not.toMatch(/stat-card-label[^\n]*(?:Reservation|Waste|Health)/i)
  })

  test('Resident Dashboard contains no reservation implementation and retains supported tabs', () => {
    const dashboard = source('dashboards/ResidentDashboard.jsx')
    expect(dashboard).not.toMatch(/reservation|court|booking/i)
    ;['Document Requests', 'Complaints', 'Community Credit', 'Settings']
      .forEach((label) => expect(dashboard).toContain(label))
  })

  test('retired service URLs are absent from the return allowlist', () => {
    const returnTo = source('utils/returnTo.js')
    expect(returnTo).not.toMatch(/['"]\/(?:reservation|track-reservation|health-center)['"]/)
    expect(returnTo).toContain("'/e-services'")
    expect(returnTo).toContain("'/officials'")
  })

  test('public copy and metadata do not promote retired modules', () => {
    const publicCopy = [
      source('pages/EServices.jsx'),
      source('pages/Home.jsx'),
      source('../public/index.html'),
    ].join('\n')
    expect(publicCopy).not.toMatch(/court reservation|track reservation|health center schedule|medicine stock|waste schedule/i)
  })

  // Sign-in and sign-up are read by every new resident and every staff member,
  // so a retired service promised there is promised to everyone. Comments are
  // stripped first: they legitimately record the retired features' history.
  test('sign-in and sign-up copy promises no retired service or role', () => {
    const code = (relativePath) => source(relativePath)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const login = code('pages/Login.jsx')
    const signup = code('pages/ResidentSignup.jsx')
    const retired = /court|reservation|booking|nurse|health cent(?:er|re)|clinic|medicine|waste|voter reference/i
    expect(login).not.toMatch(retired)
    expect(signup).not.toMatch(retired)
    // The retained services are still described.
    expect(login).toContain('Official and Tanod accounts are provisioned by authorized administration.')
    expect(signup).toMatch(/requesting a barangay document needs a\s+verified account/)
  })
})
