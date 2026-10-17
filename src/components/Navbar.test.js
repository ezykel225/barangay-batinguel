// The public mobile menu button.
//
// ⚠️ This button had NO accessible name at all: its only content is an
// <svg>, so a screen reader announced "button" and nothing else -- on
// the one control that opens navigation on a phone, on every public
// page. axe reported it as a `button-name` violation on 13 surfaces.
//
// The dashboard's own menu button has carried aria-label, aria-expanded
// and aria-controls since it was written. These tests hold the public
// twin to the same contract.

import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { E_SERVICES, SERVICE_GROUPS } from '../constants/eServices'

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null, role: null, logout: async () => {} }),
}))
jest.mock('../supabase/supabaseClient', () => ({
  supabase: { auth: { signOut: async () => ({}) } },
}))

const renderNavbar = () =>
  render(<MemoryRouter><Navbar /></MemoryRouter>)

const toggle = () => screen.getByRole('button', { name: /navigation menu/i })

describe('the mobile menu button', () => {
  it('has an accessible name', () => {
    renderNavbar()
    expect(toggle()).toBeInTheDocument()
  })

  it('names what it will do, and changes when it is open', () => {
    renderNavbar()
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toBeInTheDocument()
  })

  it('reports its state through aria-expanded', () => {
    renderNavbar()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('points aria-controls at a menu that actually exists', () => {
    // An aria-controls naming a missing id is worse than none: it
    // promises a relationship the page does not have.
    const { container } = renderNavbar()
    const id = toggle().getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(container.querySelector(`#${id}`)).not.toBeNull()
  })

  it('is a real button, not a clickable div', () => {
    renderNavbar()
    expect(toggle().tagName).toBe('BUTTON')
    expect(toggle()).toHaveAttribute('type', 'button')
  })

  it('hides its icon from assistive technology', () => {
    // The name comes from aria-label; the glyph would otherwise be
    // announced twice or as meaningless text.
    renderNavbar()
    const svg = toggle().querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})

// ── The mobile drawer exposes the SAME services as the desktop ───────
//
// ⚠️ The requirement is not "mobile has a menu too" -- it is that
// neither surface owns the list. Both render from
// src/constants/eServices.js, so a service cannot exist on a desktop
// and be missing on a phone. These tests compare the drawer against
// the catalogue itself, not against a hard-coded copy of it, so they
// keep holding when the catalogue grows.
describe('the mobile drawer and the E-Services catalogue', () => {
  const openDrawer = () => {
    renderNavbar()
    fireEvent.click(toggle())
  }

  it('offers every catalogue service, each linking to its own route', () => {
    openDrawer()
    E_SERVICES.forEach((service) => {
      const links = screen.getAllByRole('link', { name: new RegExp(service.label) })
      expect(links.some((l) => l.getAttribute('href') === service.to)).toBe(true)
    })
  })

  it('offers the landing page too', () => {
    openDrawer()
    expect(screen.getAllByRole('link', { name: 'E-Services' })[0])
      .toHaveAttribute('href', '/e-services')
  })

  it('states the access requirement in words, exactly as the desktop does', () => {
    openDrawer()
    SERVICE_GROUPS.forEach((group) => {
      group.services.forEach((service) => {
        const link = screen.getAllByRole('link', { name: new RegExp(service.label) })
          .find((l) => l.getAttribute('href') === service.to)
        expect(link).toHaveTextContent(group.label)
      })
    })
  })

  it('no longer gives Court Reservation its own top-level entry', () => {
    openDrawer()
    // It is still reachable -- as a service inside E-Services, which is
    // the point of the change.
    const courtLinks = screen.getAllByRole('link', { name: /Court Reservation/ })
    expect(courtLinks.length).toBeGreaterThan(0)
    courtLinks.forEach((link) => {
      expect(link.closest('.navbar-mobile-sublist')).not.toBeNull()
    })
  })
})

// ─── Final Integration: the PUBLIC Community Safety entry ───────────────────
//
// ⚠️ THE ROUTE AND EVERY LINK TO IT LANDED IN ONE COMMIT, and these tests are
// why that is not merely tidy. `path="*"` renders `Home`, so a navigation
// entry whose route does not exist does NOT 404 -- it silently shows the
// homepage and reads as a service that is broken. P3-B1 recorded the same
// rule for `/track-complaint`.
describe('the Community Safety entry', () => {
  // `openDrawer` is scoped to the catalogue describe above, so this one has
  // its own.
  const openDrawer = () => {
    renderNavbar()
    fireEvent.click(toggle())
  }

  it('is in the desktop navigation, pointing at the public route', () => {
    renderNavbar()
    const link = screen.getAllByRole('link', { name: 'Community Safety' })
      .find((l) => l.closest('.navbar-menu'))
    expect(link).toBeDefined()
    expect(link).toHaveAttribute('href', '/community-safety')
  })

  it('is in the mobile drawer too, so a phone is not a second surface', () => {
    openDrawer()
    const link = screen.getAllByRole('link', { name: 'Community Safety' })
      .find((l) => l.closest('.navbar-mobile'))
    expect(link).toBeDefined()
    expect(link).toHaveAttribute('href', '/community-safety')
  })

  // ⚠️ DELIBERATELY NOT AN E-SERVICES ITEM. That catalogue is transactions a
  // visitor asks the barangay to perform, and every entry in it states an
  // access requirement in words. The Community Safety Map is published
  // information read with no account and nothing to submit, so it takes a
  // navigation slot of its own rather than widening what the catalogue means.
  it('is NOT an E-Services catalogue entry', () => {
    expect(E_SERVICES.some((s) => s.to.startsWith('/community-safety'))).toBe(false)
    openDrawer()
    const link = screen.getAllByRole('link', { name: 'Community Safety' })
      .find((l) => l.closest('.navbar-mobile'))
    expect(link.closest('.navbar-mobile-sublist')).toBeNull()
  })

  // ⚠️ Not buried in resident-only navigation either: it is rendered by the
  // PUBLIC Navbar with no session mocked at all -- `useAuth` returns a null
  // user and a null role above, so this is what an anonymous visitor sees.
  it('is reachable with no account', () => {
    renderNavbar()
    expect(screen.getAllByRole('link', { name: 'Community Safety' }).length)
      .toBeGreaterThan(0)
  })
})
