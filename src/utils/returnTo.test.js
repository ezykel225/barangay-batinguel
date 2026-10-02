import { E_SERVICES } from '../constants/eServices'
import { RETURN_TO_PATHS, loginHrefFor, safeReturnTo } from './returnTo'

describe('the list itself', () => {
  it('covers every service the catalogue defines', () => {
    E_SERVICES.forEach((service) => {
      expect(RETURN_TO_PATHS).toContain(service.to)
    })
  })

  // ⚠️ The dashboards are deliberately absent. No public page links to
  // one, ProtectedRoute would bounce a signed-out visitor anyway, and a
  // crafted `?next=/official` should not even get as far as the bounce.
  it('contains no dashboard route', () => {
    expect(RETURN_TO_PATHS).not.toContain('/official')
    expect(RETURN_TO_PATHS).not.toContain('/nurse')
    expect(RETURN_TO_PATHS.filter((p) => p === '/resident')).toHaveLength(0)
  })

  it('contains only paths, never a URL', () => {
    RETURN_TO_PATHS.forEach((path) => {
      expect(path.startsWith('/')).toBe(true)
      expect(path.startsWith('//')).toBe(false)
      expect(path).not.toMatch(/^[a-z]+:/i)
    })
  })
})

describe('safeReturnTo', () => {
  it('returns a path that is on the list', () => {
    expect(safeReturnTo('/e-services')).toBe('/e-services')
    expect(safeReturnTo('/reservation')).toBe('/reservation')
    expect(safeReturnTo('/resident?tab=documents')).toBe('/resident?tab=documents')
  })

  it('accepts a percent-encoded form of a listed path', () => {
    expect(safeReturnTo(encodeURIComponent('/resident?tab=documents')))
      .toBe('/resident?tab=documents')
    expect(safeReturnTo('%2Ftrack-reservation')).toBe('/track-reservation')
  })

  it('falls back when there is nothing to go back to', () => {
    expect(safeReturnTo(undefined)).toBe('/')
    expect(safeReturnTo(null)).toBe('/')
    expect(safeReturnTo('')).toBe('/')
    expect(safeReturnTo(123)).toBe('/')
    expect(safeReturnTo({})).toBe('/')
  })

  it('honours a caller-supplied fallback', () => {
    expect(safeReturnTo('https://evil.example', '/e-services')).toBe('/e-services')
  })

  // ⚠️ THE LOAD-BEARING ONE. Every entry below has defeated a redirect
  // sanitiser that tried to spot bad values by inspection. None of them
  // can pass a list-membership test, because nothing is being parsed.
  describe('refuses every shape of off-site redirect', () => {
    const attacks = [
      'https://evil.example',
      'http://evil.example/login',
      '//evil.example',
      '///evil.example',
      '\\\\evil.example',
      '/\\evil.example',
      'https:/evil.example',
      'https:evil.example',
      '//evil.example/e-services',
      'javascript:alert(1)',
      // eslint-disable-next-line no-script-url
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/login/../../evil.example',
      '/e-services/../../evil.example',
      'https://user:pass@evil.example',
      '/@evil.example',
      'https://batinguel.example.evil.example/',
      '/e-services.evil.example',
      '/E-Services',
      '/e-services/',
      '/e-services#',
      '/e-services?x=1',
      ' /e-services ok',
      '/track-reservation?ref=BCR-2026-AB12CD',
    ]

    attacks.forEach((attack) => {
      it(`refuses ${JSON.stringify(attack)}`, () => {
        expect(safeReturnTo(attack)).toBe('/')
      })
    })
  })

  // A value that only looks safe after being decoded twice is not safe.
  // Decoding in a loop is how a double-encoded payload gets past a
  // check that ran before the last decode.
  it('decodes exactly once, so a double-encoded value cannot sneak through', () => {
    const once = encodeURIComponent('//evil.example')
    const twice = encodeURIComponent(once)
    expect(safeReturnTo(once)).toBe('/')
    expect(safeReturnTo(twice)).toBe('/')
  })

  it('survives a malformed percent sequence rather than throwing', () => {
    expect(() => safeReturnTo('%E0%A4%A')).not.toThrow()
    expect(safeReturnTo('%E0%A4%A')).toBe('/')
    expect(safeReturnTo('%')).toBe('/')
  })

  it('trims surrounding whitespace on an otherwise listed path', () => {
    expect(safeReturnTo('  /e-services  ')).toBe('/e-services')
    expect(safeReturnTo('\n/reservation\t')).toBe('/reservation')
  })
})

describe('loginHrefFor', () => {
  it('builds a login link that carries a listed destination', () => {
    expect(loginHrefFor('/resident?tab=documents'))
      .toBe(`/login?next=${encodeURIComponent('/resident?tab=documents')}`)
  })

  // A destination that could not be returned to must not be put in the
  // URL at all -- a `next` nobody will honour is a link that lies.
  it('omits next entirely for a destination that is not on the list', () => {
    expect(loginHrefFor('https://evil.example')).toBe('/login')
    expect(loginHrefFor('/official')).toBe('/login')
    expect(loginHrefFor('')).toBe('/login')
    expect(loginHrefFor(undefined)).toBe('/login')
  })

  // Round trip: whatever loginHrefFor puts in a URL, safeReturnTo must
  // accept. The two drifting apart would silently send everybody home.
  it('round-trips every listed path', () => {
    RETURN_TO_PATHS.forEach((path) => {
      const href = loginHrefFor(path)
      const next = new URLSearchParams(href.split('?')[1]).get('next')
      expect(safeReturnTo(next)).toBe(path)
    })
  })
})
