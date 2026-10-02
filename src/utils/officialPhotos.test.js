import { render, screen } from '@testing-library/react'
import {
  PersonAvatar,
  hasBundledPhoto,
  officialPhotos,
  photoFor,
  portraitWillBeLost,
} from './officialPhotos'

// A name the map holds, taken from the map itself rather than typed
// again -- a test that hard-codes a key passes when the key is wrong.
const KEYED = Object.keys(officialPhotos)[0]

describe('hasBundledPhoto', () => {
  it('is true for every key the map actually holds', () => {
    Object.keys(officialPhotos).forEach((name) => {
      expect(hasBundledPhoto(name)).toBe(true)
    })
  })

  it('is false for a name the map does not hold', () => {
    expect(hasBundledPhoto('Jeffrey Cataylo Lastimoso')).toBe(false)
    expect(hasBundledPhoto('Somebody Else')).toBe(false)
  })

  // ⚠️ The map is an ordinary object, so `toString`, `constructor` and
  // friends are on its prototype. A bare `officialPhotos[name]` test
  // would report a portrait for an official named "constructor" -- which
  // is absurd as a name and exactly the shape of bug that reaches
  // production through a directory somebody can type into.
  it('is not fooled by an inherited property', () => {
    expect(hasBundledPhoto('toString')).toBe(false)
    expect(hasBundledPhoto('constructor')).toBe(false)
    expect(hasBundledPhoto('__proto__')).toBe(false)
  })

  it('is false for nothing at all', () => {
    expect(hasBundledPhoto('')).toBe(false)
    expect(hasBundledPhoto(null)).toBe(false)
    expect(hasBundledPhoto(undefined)).toBe(false)
  })

  // The exact-string fragility, asserted rather than described. CLAUDE.md
  // records this costing two portraits once already, with the map saying
  // "Alexis Tan" while the directory said "Alexis Theress P. Tan".
  it('matches on the EXACT directory name, not loosely', () => {
    expect(hasBundledPhoto(KEYED.toLowerCase())).toBe(false)
    expect(hasBundledPhoto(` ${KEYED}`)).toBe(false)
    expect(hasBundledPhoto(KEYED.split(' ')[0])).toBe(false)
  })
})

describe('photoFor', () => {
  it('prefers an uploaded photo_url over the bundled map', () => {
    expect(photoFor(KEYED, 'https://example.com/portrait.jpg'))
      .toBe('https://example.com/portrait.jpg')
  })

  it('falls back to the bundled map when there is no upload', () => {
    expect(photoFor(KEYED, null)).toBe(officialPhotos[KEYED])
    expect(photoFor(KEYED, '')).toBe(officialPhotos[KEYED])
  })

  it('is null when there is neither', () => {
    expect(photoFor('Jeffrey Cataylo Lastimoso', null)).toBeNull()
    expect(photoFor(undefined, undefined)).toBeNull()
  })
})

// ⚠️ THE LOAD-BEARING GROUP. The audit trail shows a portrait lost at
// 2026-10-01 04:58 by an `edited`, four minutes before the first of two
// archive/restore cycles that got the blame. Nothing warned. This is
// the warning.
describe('portraitWillBeLost', () => {
  it('is true when a rename leaves a keyed name for an unkeyed one', () => {
    expect(portraitWillBeLost(KEYED, 'Jeffrey Cataylo Lastimoso', null)).toBe(true)
  })

  it('is false when the official has an uploaded photo to fall back on', () => {
    expect(portraitWillBeLost(KEYED, 'Somebody Else', 'https://example.com/p.jpg'))
      .toBe(false)
  })

  it('is false when the old name had no bundled photo either', () => {
    expect(portraitWillBeLost('Nobody In The Map', 'Still Nobody', null)).toBe(false)
  })

  it('is false when the new name is also in the map', () => {
    const [a, b] = Object.keys(officialPhotos)
    expect(portraitWillBeLost(a, b, null)).toBe(false)
  })

  it('is false when the name is not actually changing', () => {
    expect(portraitWillBeLost(KEYED, KEYED, null)).toBe(false)
    expect(portraitWillBeLost(KEYED, ` ${KEYED} `, null)).toBe(false)
  })

  it('is false when either name is missing', () => {
    expect(portraitWillBeLost('', 'Somebody', null)).toBe(false)
    expect(portraitWillBeLost(KEYED, '', null)).toBe(false)
    expect(portraitWillBeLost(null, undefined, null)).toBe(false)
  })

  // It must never block a legitimate correction. This test is here so
  // that intent is recorded as behaviour: the function answers a
  // question, it does not refuse anything.
  it('returns a boolean and nothing else — it cannot refuse an edit', () => {
    expect(typeof portraitWillBeLost(KEYED, 'New Name', null)).toBe('boolean')
  })
})

describe('PersonAvatar', () => {
  it('renders the portrait with the official name as its alt text', () => {
    render(<PersonAvatar name={KEYED} fallbackIcon={<span>icon</span>} />)
    expect(screen.getByRole('img', { name: KEYED })).toBeInTheDocument()
  })

  // ⚠️ The fallback used to be a bare icon with no text anywhere, which
  // is indistinguishable from an official who simply has no picture
  // yet. That is precisely how a lost portrait sat on the public page
  // unnoticed.
  it('names the fallback, so a missing photo is not silent', () => {
    render(<PersonAvatar name="Jeffrey Cataylo Lastimoso" fallbackIcon={<span>icon</span>} />)
    expect(screen.getByRole('img', { name: 'No photo on file for Jeffrey Cataylo Lastimoso' }))
      .toBeInTheDocument()
  })

  it('still renders the caller fallback icon inside the named wrapper', () => {
    render(<PersonAvatar name="Nobody" fallbackIcon={<span>fallback-icon</span>} />)
    expect(screen.getByText('fallback-icon')).toBeInTheDocument()
  })

  it('copes with no name at all', () => {
    render(<PersonAvatar fallbackIcon={<span>icon</span>} />)
    expect(screen.getByRole('img', { name: 'No photo on file' })).toBeInTheDocument()
  })

  // ⚠️ The caller's class belongs to the PHOTO branch only. Those
  // classes are sized `<img>` rules with `object-fit: cover`, which do
  // nothing on an inline `<span>`, and the fallback never carried them:
  // before the named wrapper it was the bare icon with no element of
  // its own. Passing them on would be a silent layout change dressed up
  // as an accessibility fix.
  it('puts the caller class on the photo and not on the fallback', () => {
    const { container, rerender } = render(
      <PersonAvatar name={KEYED} fallbackIcon={<span>i</span>} className="official-row-photo" />
    )
    expect(container.querySelector('img.official-row-photo')).toBeInTheDocument()
    rerender(
      <PersonAvatar name="Nobody" fallbackIcon={<span>i</span>} className="official-row-photo" />
    )
    expect(container.querySelector('.official-row-photo')).not.toBeInTheDocument()
    expect(container.querySelector('.person-avatar-fallback')).toBeInTheDocument()
  })
})
