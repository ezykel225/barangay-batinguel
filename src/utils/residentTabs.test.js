import { RESIDENT_TABS, DEFAULT_RESIDENT_TAB, resolveResidentTab } from './residentTabs'

describe('the ?tab= deep link into the resident portal', () => {
  it('honours every real tab', () => {
    RESIDENT_TABS.forEach((tab) => {
      expect(resolveResidentTab(tab)).toBe(tab)
    })
  })

  it('sends the E-Services document link to Document Requests', () => {
    expect(resolveResidentTab('documents')).toBe('documents')
  })

  // ⚠️ The load-bearing one. A crafted or stale value must land on the
  // portal's front page, not render an empty portal that looks broken.
  it('falls back to the dashboard for anything it does not recognise', () => {
    ;['secrets', 'official', '', '../admin', 'DOCUMENTS', '<script>', null, undefined]
      .forEach((value) => {
        expect(resolveResidentTab(value)).toBe(DEFAULT_RESIDENT_TAB)
      })
  })

  it('defaults to a tab that actually exists', () => {
    expect(RESIDENT_TABS).toContain(DEFAULT_RESIDENT_TAB)
  })

  // The two lists that must not drift: these ids are matched against
  // `activeTab` in ResidentDashboard and rendered by Sidebar.
  it('lists exactly the resident portal tabs', () => {
    expect(RESIDENT_TABS).toEqual([
      // ⚠️ 'complaints' was added by P3-B1 together with the fifth
      // entry in Sidebar's residentNavItems. This assertion failing is
      // the guard working: the two arrays must not drift.
      'dashboard', 'documents', 'reservations', 'complaints', 'settings',
    ])
  })
})
