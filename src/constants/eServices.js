// The public E-Services catalogue.
//
// ─── ONE DEFINITION, THREE SURFACES ───────────────────────────────────
//
// The desktop navbar dropdown, the mobile navigation menu and the
// /e-services landing page all render from this array. That is the
// point: a service added here appears in all three, and a route cannot
// drift between the phone and the desktop because neither owns the
// list.
//
// ⚠️ DO NOT add a service here before its route exists in App.js. The
// app's catch-all renders Home for an unknown path, so a premature
// entry does not 404 -- it silently takes somebody to the homepage and
// looks like the service is broken.
//
// ─── `access` IS A PROMISE TO THE READER, NOT A GATE ──────────────────
//
// It decides the words shown beside each service, so a resident learns
// an account is needed BEFORE clicking rather than after filling a
// form. It is NOT authorization: ProtectedRoute and RLS decide what a
// person may actually reach, exactly as before. Marking something
// 'guest' here would not give a guest any access it did not have.
export const SERVICE_ACCESS = {
  guest: {
    id: 'guest',
    // Shown on the card and in the menu.
    label: 'No account required',
    // The group heading these services sit under.
    groupLabel: 'Guest Services',
  },
  resident: {
    id: 'resident',
    label: 'Resident login required',
    groupLabel: 'Resident Services',
  },
}

// `to` is a plain path. The resident services deep-link into the
// resident portal's own tab state with ?tab=, which ResidentDashboard
// reads on mount -- no new routes, the same `activeTab` the sidebar
// uses, per the notifications rule in CLAUDE.md.
export const E_SERVICES = [
  {
    key: 'court-reservation',
    label: 'Court Reservation',
    to: '/reservation',
    access: 'guest',
    summary: 'Reserve the covered court without creating an account.',
    cta: 'Reserve Court',
  },
  {
    key: 'track-reservation',
    label: 'Track a Court Reservation',
    to: '/track-reservation',
    access: 'guest',
    summary: 'Check what has happened to a booking using its reference number'
      + ' and the contact number it was made with.',
    cta: 'Track a Booking',
  },
  {
    key: 'request-document',
    label: 'Request Barangay Document',
    to: '/resident?tab=documents',
    access: 'resident',
    summary: 'Request a barangay document. A verified resident account is required.',
    cta: 'Request Document',
  },
  {
    key: 'my-requests',
    label: 'My Document Requests',
    to: '/resident?tab=documents',
    access: 'resident',
    summary: 'View the document requests you have submitted and their status.',
    cta: 'View My Requests',
  },
]

export const guestServices = () => E_SERVICES.filter((s) => s.access === 'guest')
export const residentServices = () => E_SERVICES.filter((s) => s.access === 'resident')

// The two groups in display order, guest first: a visitor who cannot
// sign in should meet something they can actually use before meeting
// something they cannot.
export const SERVICE_GROUPS = [
  { access: 'guest', ...SERVICE_ACCESS.guest, services: guestServices() },
  { access: 'resident', ...SERVICE_ACCESS.resident, services: residentServices() },
]
