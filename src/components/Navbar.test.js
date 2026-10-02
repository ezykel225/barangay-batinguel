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
