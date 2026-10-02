import fs from 'fs'
import path from 'path'
import { RESERVATION_STATUS_LABELS } from './displayLabels'
import {
  EXPLAINED_STATUSES,
  describeTrackedStatus,
  digitsOnly,
  normalizeReference,
  trackingInputProblem,
} from './reservationTracking'

describe('normalizeReference', () => {
  // The four cases migration 024's header names, mirrored here. The
  // DATABASE normalises both sides itself, so this copy is for showing
  // the person what is about to be looked up -- but the two must agree
  // or the page would display something other than what it sends.
  it('folds case, punctuation and spacing to one canonical form', () => {
    expect(normalizeReference('BCR-2026-AB12CD')).toBe('BCR2026AB12CD')
    expect(normalizeReference('bcr 2026 ab12cd')).toBe('BCR2026AB12CD')
    expect(normalizeReference('  BCR_2026/AB12CD  ')).toBe('BCR2026AB12CD')
  })

  // Generation never emits O, I, L or U; lookup forgives them. That
  // asymmetry is deliberate -- a person reading a reference off a slip
  // writes an O for a zero.
  it('maps the Crockford look-alikes back', () => {
    expect(normalizeReference('bcr 2026 abl2cd')).toBe('BCR2026AB12CD')
    expect(normalizeReference('BCR-2O26-ABI2CD')).toBe('BCR2026AB12CD')
  })

  it('returns an empty string for nothing at all', () => {
    expect(normalizeReference('')).toBe('')
    expect(normalizeReference('   ')).toBe('')
    expect(normalizeReference(null)).toBe('')
    expect(normalizeReference(undefined)).toBe('')
    expect(normalizeReference('---')).toBe('')
  })
})

describe('digitsOnly', () => {
  it('reduces every way a person writes one phone number to the same digits', () => {
    expect(digitsOnly('0917 123 4567')).toBe('09171234567')
    expect(digitsOnly('0917-123-4567')).toBe('09171234567')
    expect(digitsOnly('(0917) 123 4567')).toBe('09171234567')
  })

  it('is empty for nothing', () => {
    expect(digitsOnly('')).toBe('')
    expect(digitsOnly(null)).toBe('')
    expect(digitsOnly('abc')).toBe('')
  })
})

describe('trackingInputProblem', () => {
  it('accepts a complete pair', () => {
    expect(trackingInputProblem('BCR-2026-AB12CD', '09171234567')).toBeNull()
  })

  it('asks for the reference first when both are blank', () => {
    expect(trackingInputProblem('', ''))
      .toBe('Please enter the reference number from your booking.')
  })

  it('asks for the contact number when only that is blank', () => {
    expect(trackingInputProblem('BCR-2026-AB12CD', '  '))
      .toBe('Please enter the contact number you gave when you booked.')
  })

  it('treats punctuation-only input as blank', () => {
    expect(trackingInputProblem('---', '09171234567'))
      .toBe('Please enter the reference number from your booking.')
    expect(trackingInputProblem('BCR-2026-AB12CD', '()- '))
      .toBe('Please enter the contact number you gave when you booked.')
  })

  // ⚠️ THE LOAD-BEARING ONE. A message that distinguished "no such
  // reference" from "wrong number" would be an oracle: it would confirm
  // that a guessed reference exists. Nothing this function returns can
  // depend on what is in the database, because it never looks.
  it('says nothing about whether a reference exists', () => {
    const messages = [
      trackingInputProblem('', ''),
      trackingInputProblem('BCR-2026-AB12CD', ''),
      trackingInputProblem('', '09171234567'),
    ].filter(Boolean)
    messages.forEach((m) => {
      expect(m).not.toMatch(/not found|no such|does not exist|invalid reference|wrong/i)
    })
  })
})

describe('describeTrackedStatus', () => {
  // The guard that keeps one vocabulary. Every word this page shows for
  // a status is the word the official's own badge shows.
  it('takes its word from RESERVATION_STATUS_LABELS, not from itself', () => {
    Object.entries(RESERVATION_STATUS_LABELS).forEach(([status, entry]) => {
      expect(describeTrackedStatus(status).label).toBe(entry.label)
      expect(describeTrackedStatus(status).className).toBe(entry.className)
    })
  })

  it('explains every status the label map defines', () => {
    Object.keys(RESERVATION_STATUS_LABELS).forEach((status) => {
      expect(EXPLAINED_STATUSES).toContain(status)
      expect(describeTrackedStatus(status).explanation).not.toBe('')
    })
  })

  it('explains nothing the label map does not define', () => {
    EXPLAINED_STATUSES.forEach((status) => {
      expect(Object.keys(RESERVATION_STATUS_LABELS)).toContain(status)
    })
  })

  // No underscore reaches the screen: every explained status produces a
  // readable word. The same assertion notificationLabels.test.js makes.
  it('never shows a raw stored value with an underscore in it', () => {
    EXPLAINED_STATUSES.forEach((status) => {
      const d = describeTrackedStatus(status)
      expect(d.label).not.toContain('_')
      expect(d.explanation).not.toContain('_')
    })
  })

  // An unanticipated status must stay VISIBLE rather than be blanked or
  // guessed at -- the same decision reservationStatusLabel() makes.
  it('keeps an unrecognised status as its own word, with no explanation', () => {
    const d = describeTrackedStatus('under_appeal')
    expect(d.label).toBe('under_appeal')
    expect(d.isKnown).toBe(false)
    expect(d.explanation).toBe('')
  })

  it('survives a missing status without throwing', () => {
    expect(describeTrackedStatus(undefined).label).toBe('')
    expect(describeTrackedStatus(null).label).toBe('')
  })

  it('adds the office-hours note only for an exception', () => {
    expect(describeTrackedStatus('pending', true).exceptionNote).toMatch(/office-hours/)
    expect(describeTrackedStatus('pending', false).exceptionNote).toBe('')
    expect(describeTrackedStatus('pending').exceptionNote).toBe('')
  })
})

// The same shape of guard displayLabels.test.js uses to stop a second
// vocabulary growing back. A status word written here as a literal
// would be a second answer for a value another module already owns.
describe('the module itself', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'reservationTracking.js'), 'utf8'
  )

  it('defines no status label of its own', () => {
    const body = source.replace(/\/\/.*$/gm, '')
    Object.values(RESERVATION_STATUS_LABELS).forEach((entry) => {
      expect(body).not.toContain(`'${entry.label}'`)
      expect(body).not.toContain(`"${entry.label}"`)
    })
  })

  it('reads the label map rather than re-declaring one', () => {
    expect(source).toContain("import { RESERVATION_STATUS_LABELS } from './displayLabels'")
    expect(source).not.toMatch(/const\s+\w*STATUS_LABELS\s*=/)
  })
})
