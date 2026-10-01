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
