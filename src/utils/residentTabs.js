// Which tab the resident portal opens on.
//
// ⚠️ This exists as a pure module for the reason the rest of `utils/`
// does: `ResidentDashboard.jsx` imports the Supabase client, which
// throws at import time without the env vars, so anything tested there
// needs a `.env`. The rule it enforces is worth testing on its own.
//
// ─── A ?tab= VALUE IS A HINT, NEVER AUTHORIZATION ─────────────────────
//
// The public E-Services page deep-links a resident to Document
// Requests with `/resident?tab=documents`. That is exactly what
// `link_tab` is for notifications: it names a destination inside a
// route that ProtectedRoute already gates and that RLS still governs.
// Nothing here grants access to anything.
//
// An unrecognised value falls back to the portal's front page rather
// than rendering an empty portal -- a crafted `?tab=secrets` shows the
// dashboard, not a blank screen that looks broken.

// The resident portal's own tab ids. These must match
// `residentNavItems` in Sidebar.jsx; `residentTabs.test.js` is the only
// thing holding the two together, so do not edit one without the other.
export const RESIDENT_TABS = ['dashboard', 'documents', 'reservations', 'settings']

export const DEFAULT_RESIDENT_TAB = 'dashboard'

export const resolveResidentTab = (requested) =>
  (RESIDENT_TABS.includes(requested) ? requested : DEFAULT_RESIDENT_TAB)
