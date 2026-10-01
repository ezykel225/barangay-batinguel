import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EServicesMenu from './EServicesMenu'
import { E_SERVICES, SERVICE_GROUPS, guestServices, residentServices } from '../constants/eServices'

const open = () => {
  render(<MemoryRouter><EServicesMenu /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'E-Services' }))
}

describe('the E-Services dropdown', () => {
  it('starts closed and says so', () => {
    render(<MemoryRouter><EServicesMenu /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'E-Services' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Court Reservation/ })).not.toBeInTheDocument()
  })

  it('opens on click and points aria-controls at the panel that appears', () => {
    render(<MemoryRouter><EServicesMenu /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'E-Services' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panelId = trigger.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId)).toBeInTheDocument()
  })

  // ⚠️ The whole point of the component. A hover-only menu is
  // unreachable by keyboard and unusable on a touch screen, and this is
  // the way into half the services on the site.
  it('does NOT open on hover alone', () => {
    render(<MemoryRouter><EServicesMenu /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'E-Services' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseOver(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape and puts focus back on the trigger', () => {
    open()
    const trigger = screen.getByRole('button', { name: 'E-Services' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  // Same rule ActionMenu and NotificationBell follow: the person is
  // clicking elsewhere on purpose, so focus is not yanked back.
  it('closes on an outside click without stealing focus back', () => {
    open()
    const trigger = screen.getByRole('button', { name: 'E-Services' })
    fireEvent.mouseDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveFocus()
  })

  it('offers the landing page as well as the individual services', () => {
    open()
    expect(screen.getByRole('link', { name: 'All E-Services' }))
      .toHaveAttribute('href', '/e-services')
  })

  // The services are LINKS, not menuitems. A role="menu" would tell a
  // screen reader these are commands and suppress the link semantics
  // people navigate a site by.
  it('renders every catalogue service as a real link to its own route', () => {
    open()
    E_SERVICES.forEach((service) => {
      const link = screen.getByRole('link', { name: new RegExp(service.label) })
      expect(link).toHaveAttribute('href', service.to)
    })
  })

  it('does not use the ARIA menu role', () => {
    open()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  // ⚠️ The load-bearing one. A resident must learn an account is needed
  // BEFORE clicking, and from words rather than from a colour.
  it('states the access requirement in text on every service', () => {
    open()
    guestServices().forEach((service) => {
      const link = screen.getByRole('link', { name: new RegExp(service.label) })
      expect(link).toHaveTextContent('No account required')
    })
    residentServices().forEach((service) => {
      const link = screen.getByRole('link', { name: new RegExp(service.label) })
      expect(link).toHaveTextContent('Resident login required')
    })
  })

  it('groups guest services before resident services', () => {
    open()
    const headings = screen.getAllByText(/Guest Services|Resident Services/)
    expect(headings.map((h) => h.textContent))
      .toEqual(['Guest Services', 'Resident Services'])
  })

  it('names each group so the two lists can be told apart', () => {
    open()
    SERVICE_GROUPS.forEach((group) => {
      const list = screen.getByRole('list', { name: group.groupLabel })
      expect(within(list).getAllByRole('link')).toHaveLength(group.services.length)
    })
  })

  it('closes when a service is chosen, so the panel does not cover the new page', () => {
    open()
    fireEvent.click(screen.getByRole('link', { name: /Court Reservation/ }))
    expect(screen.getByRole('button', { name: 'E-Services' }))
      .toHaveAttribute('aria-expanded', 'false')
  })
})

describe('the catalogue itself', () => {
  // The guard that keeps the three surfaces honest.
  it('gives every service a key, a label, a route and a known access level', () => {
    E_SERVICES.forEach((service) => {
      expect(service.key).toBeTruthy()
      expect(service.label).toBeTruthy()
      expect(service.to.startsWith('/')).toBe(true)
      expect(['guest', 'resident']).toContain(service.access)
      expect(service.summary).toBeTruthy()
      expect(service.cta).toBeTruthy()
    })
  })

  it('has no duplicate keys', () => {
    const keys = E_SERVICES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('puts every service in exactly one group', () => {
    const grouped = SERVICE_GROUPS.flatMap((g) => g.services)
    expect(grouped).toHaveLength(E_SERVICES.length)
    expect(new Set(grouped.map((s) => s.key)).size).toBe(E_SERVICES.length)
  })
})
