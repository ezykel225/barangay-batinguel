// The Official Portal's tab allowlist, and the wiring that makes it the
// only way a tab is opened.
//
// ⚠️ The load-bearing case is a STORED value: migration 022 wrote
// `link_tab = 'reservations'` on court-reservation notifications, and the
// Reservations tab was retired. Clicking one used to set activeTab to a
// value with no matching branch, which rendered an empty main area.
import fs from 'fs'
import path from 'path'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationBell from '../components/NotificationBell'
import { OFFICIAL_TABS, DEFAULT_OFFICIAL_TAB, resolveOfficialTab } from './officialTabs'

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const RETIRED_TAB_IDS = [
  'reservations', 'registry', 'kapitan', 'waste', 'waste-management',
  'health-events', 'medicines', 'clinic', 'nurse', 'programs',
]

describe('resolveOfficialTab', () => {
  it('opens every current Official Portal tab as asked', () => {
    OFFICIAL_TABS.forEach((tab) => expect(resolveOfficialTab(tab)).toBe(tab))
  })

  it('sends a retired tab id, including the stored reservation link, to the Dashboard', () => {
    RETIRED_TAB_IDS.forEach((tab) => expect(resolveOfficialTab(tab)).toBe(DEFAULT_OFFICIAL_TAB))
  })

  it('sends any unrecognised value to the Dashboard', () => {
    ;['', null, undefined, 'DOCUMENTS', ' documents', 'constructor', 'toString', '__proto__',
      '../resident', '<script>', 0, {}].forEach((value) => {
      expect(resolveOfficialTab(value)).toBe(DEFAULT_OFFICIAL_TAB)
    })
  })

  it('defaults to a tab that exists, and the list cannot be changed at run time', () => {
    expect(OFFICIAL_TABS).toContain(DEFAULT_OFFICIAL_TAB)
    expect(Object.isFrozen(OFFICIAL_TABS)).toBe(true)
  })

  it('lists no retired tab', () => {
    RETIRED_TAB_IDS.forEach((tab) => expect(OFFICIAL_TABS).not.toContain(tab))
  })
})

describe('the allowlist matches what the portal actually renders', () => {
  it('equals the ids of officialNavItems in Sidebar.jsx, in order', () => {
    const src = read('components/Sidebar.jsx')
    const block = src.slice(src.indexOf('const officialNavItems = ['), src.indexOf('const residentNavItems = ['))
    const ids = [...stripComments(block).matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1])
    expect(ids).toEqual([...OFFICIAL_TABS])
  })

  it('has exactly one rendered branch in OfficialDashboard.jsx for each tab, and none for anything else', () => {
    const code = stripComments(read('dashboards/OfficialDashboard.jsx'))
    const branches = [...code.matchAll(/\{activeTab === '([^']+)'/g)].map((m) => m[1])
    expect([...new Set(branches)].sort()).toEqual([...OFFICIAL_TABS].sort())
    expect(branches).not.toContain('reservations')
  })
})

describe('every way of opening a tab goes through the allowlist', () => {
  const code = stripComments(read('dashboards/OfficialDashboard.jsx'))

  it('defines one opener that resolves before it sets the tab', () => {
    expect(code).toMatch(/const openTab = useCallback\(\(tab\) => setActiveTab\(resolveOfficialTab\(tab\)\), \[\]\)/)
  })

  it('hands that opener to the notification bell and to the sidebar', () => {
    expect(code).toMatch(/onOpenTab=\{openTab\}/)
    expect(code).toMatch(/setActiveTab=\{openTab\}/)
    expect(code).not.toMatch(/onOpenTab=\{setActiveTab\}/)
    expect(code).not.toMatch(/setActiveTab=\{setActiveTab\}/)
  })

  it('sets the tab directly nowhere else', () => {
    const direct = [...code.matchAll(/setActiveTab\(/g)]
    expect(direct).toHaveLength(1)
  })

  // ⚠️ The allowlist decides which panel renders, never what the panel
  // lets you do. The position gates on the restricted tabs are unchanged.
  it('leaves the position gates on the restricted tabs in place', () => {
    expect(code).toMatch(/activeTab === 'community-credit' && <CreditManagement canManage=\{isSecretary \|\| isKapitan\} \/>/)
    expect(code).toMatch(/activeTab === 'people-history' && <PeopleHistory canManage=\{isSecretary \|\| isKapitan\} \/>/)
    expect(code).toMatch(/activeTab === 'reports' && <AnalyticsInsights canAdminister=\{isSecretary \|\| isKapitan\} \/>/)
    expect(stripComments(read('utils/officialTabs.js'))).not.toMatch(/isSecretary|isKapitan|isTreasurer|position|supabase/)
  })
})

describe('an obsolete court-reservation notification, clicked in the bell', () => {
  const notification = (overrides) => ({
    id: 'r1',
    audience: 'treasurer',
    category: 'reservation',
    event: 'submitted',
    entity_type: 'reservation',
    entity_id: 'e1',
    subject: '2027-01-27',
    link_tab: 'reservations',
    is_exception: false,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  })

  const openFromBell = (n) => {
    const opened = []
    render(
      <NotificationBell
        notifications={[n]}
        readIds={new Set()}
        onMarkRead={() => {}}
        onOpenTab={(tab) => opened.push(resolveOfficialTab(tab))}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Notifications,/ }))
    fireEvent.click(screen.getByRole('button', { name: /^New\./ }))
    return opened
  }

  it('opens the Dashboard rather than a blank page', () => {
    expect(openFromBell(notification())).toEqual(['dashboard'])
  })

  it('still opens a current tab directly', () => {
    expect(openFromBell(notification({
      category: 'document_request', entity_type: 'document_request',
      subject: 'Barangay Clearance', link_tab: 'documents', audience: 'secretary',
    }))).toEqual(['documents'])
  })
})
