// Which tab the Official Portal opens.
//
// ⚠️ A TAB ID IS A HINT, NEVER AUTHORIZATION -- the same rule
// `residentTabs.js` states for the resident portal. A tab id reaches the
// dashboard from the sidebar and from a notification's `link_tab`, and
// the second one is stored data: migration 022 wrote
// `link_tab = 'reservations'` on court-reservation notifications, and
// that tab was retired with Court Reservations. Handed straight to
// `setActiveTab`, such a value matched no `activeTab === ...` branch and
// the portal rendered an empty main area that read as broken.
//
// So every requested tab goes through here first. An id that is not a
// current Official Portal tab falls back to the Dashboard. Nothing here
// grants anything: every tab is still governed by its own position
// flags inside the dashboard and by RLS in the database.
//
// These ids must match `officialNavItems` in Sidebar.jsx and the
// `activeTab === '...'` branches in OfficialDashboard.jsx;
// `officialTabs.test.js` reads both files and fails if they drift.

export const OFFICIAL_TABS = Object.freeze([
  'dashboard',
  'announcements',
  'events',
  'documents',
  'complaints',
  'incidents',
  'tanod',
  'safety-map',
  'residents',
  'people-history',
  'community-credit',
  'officials',
  'reports',
  'activity',
  'settings',
])

export const DEFAULT_OFFICIAL_TAB = 'dashboard'

export const resolveOfficialTab = (requested) =>
  (OFFICIAL_TABS.includes(requested) ? requested : DEFAULT_OFFICIAL_TAB)
