import {
  DETAIL_FIELDS,
  RESERVATION_STEPS,
  TIME_FIELDS,
  firstMissingMessage,
  missingDetailMessage,
  missingTimeMessage,
} from './reservationSteps'

// Every value create_court_reservation() requires NOT NULL, taken from
// migration 025's signature. `additional_notes` and `exception_reason`
// are absent on purpose: notes are optional, and the reason is governed
// by the office-hours rule in reservationWindow.js and by the database
// trigger, not by a presence check here.
const REQUIRED_BY_THE_RPC = [
  'full_name',
  'purok',
  'contact_number',
  'email',
  'residency_status',
  'preferred_date',
  'preferred_time',
  'duration_hours',
  'purpose',
  'activity_type',
]

const complete = () => ({
  full_name: 'Ezequel Barcelona',
  purok: 'Purok 1',
  contact_number: '09171234567',
  email: 'ezequel@example.com',
  residency_status: 'resident',
  preferred_date: '2026-10-20',
  preferred_time: '5:00 PM',
  duration_hours: 2,
  purpose: 'Basketball practice',
  activity_type: 'Basketball',
  additional_notes: '',
  exception_reason: '',
})

describe('the step vocabulary', () => {
  it('is four steps, in order', () => {
    expect(RESERVATION_STEPS.map((s) => s.key))
      .toEqual(['when', 'who', 'review', 'done'])
  })

  it('gives every step a label', () => {
    RESERVATION_STEPS.forEach((step) => {
      expect(step.label).toBeTruthy()
    })
  })
})

describe('which step owns which field', () => {
  // ⚠️ THE LOAD-BEARING ONE. The whole reason the form became four
  // steps is that one long form tells somebody choosing a date that
  // their NAME is missing. If a field appeared in both lists, step 1
  // would start refusing to advance over a step 2 field again.
  it('puts no field in both steps', () => {
    const timeNames = TIME_FIELDS.map((f) => f.name)
    const detailNames = DETAIL_FIELDS.map((f) => f.name)
    const overlap = timeNames.filter((name) => detailNames.includes(name))
    expect(overlap).toEqual([])
  })

  // The other direction: a required field in NEITHER list reaches the
  // RPC blank, and the database answers with its own error rather than
  // a sentence a resident can act on.
  it('covers every value the RPC requires between the two steps', () => {
    const covered = [
      ...TIME_FIELDS.map((f) => f.name),
      ...DETAIL_FIELDS.map((f) => f.name),
    ]
    REQUIRED_BY_THE_RPC.forEach((name) => {
      expect(covered).toContain(name)
    })
  })

  it('claims nothing the RPC does not require', () => {
    const covered = [
      ...TIME_FIELDS.map((f) => f.name),
      ...DETAIL_FIELDS.map((f) => f.name),
    ]
    covered.forEach((name) => {
      expect(REQUIRED_BY_THE_RPC).toContain(name)
    })
  })

  it('keeps the when-fields in step 1 and the who-fields in step 2', () => {
    expect(TIME_FIELDS.map((f) => f.name))
      .toEqual(['preferred_date', 'preferred_time', 'duration_hours'])
    expect(DETAIL_FIELDS.map((f) => f.name)).toContain('full_name')
    expect(DETAIL_FIELDS.map((f) => f.name)).not.toContain('preferred_date')
  })

  it('gives every field its own sentence, so no two fields share a message', () => {
    const messages = [...TIME_FIELDS, ...DETAIL_FIELDS].map((f) => f.message)
    expect(new Set(messages).size).toBe(messages.length)
  })

  // X1's wording conventions: a validation message is a sentence.
  it('ends every message with a full stop', () => {
    [...TIME_FIELDS, ...DETAIL_FIELDS].forEach((field) => {
      expect(field.message.endsWith('.')).toBe(true)
    })
  })
})

describe('firstMissingMessage', () => {
  it('returns null when nothing is missing', () => {
    expect(missingTimeMessage(complete())).toBeNull()
    expect(missingDetailMessage(complete())).toBeNull()
  })

  it('names the first missing field in render order, not an arbitrary one', () => {
    const form = { ...complete(), preferred_date: '', preferred_time: '' }
    expect(missingTimeMessage(form)).toBe('Please select a date.')
  })

  it('reports the next one once the first is filled', () => {
    const form = { ...complete(), preferred_time: '' }
    expect(missingTimeMessage(form)).toBe('Please select a start time.')
  })

  // ⚠️ Step 1 must not be blocked by a step 2 field, and the other way
  // round. This is the disjointness test as behaviour rather than as
  // set arithmetic.
  it('lets step 1 pass while every step 2 field is blank', () => {
    const form = {
      preferred_date: '2026-10-20',
      preferred_time: '5:00 PM',
      duration_hours: 1,
    }
    expect(missingTimeMessage(form)).toBeNull()
    expect(missingDetailMessage(form)).toBe('Please enter your full name.')
  })

  it('lets step 2 pass while the date and time are blank', () => {
    const form = { ...complete(), preferred_date: '', preferred_time: '' }
    expect(missingDetailMessage(form)).toBeNull()
  })

  it('treats whitespace as missing', () => {
    expect(missingDetailMessage({ ...complete(), full_name: '   ' }))
      .toBe('Please enter your full name.')
  })

  // The numeric case. `duration_hours` is a number, so a falsy test
  // would have let 0 through to the table's own
  // `duration_hours BETWEEN 1 AND 8` CHECK -- a bare 23514 rather than
  // a sentence.
  it('treats a zero or negative duration as missing', () => {
    expect(missingTimeMessage({ ...complete(), duration_hours: 0 }))
      .toBe('Please choose how long you need the court.')
    expect(missingTimeMessage({ ...complete(), duration_hours: -3 }))
      .toBe('Please choose how long you need the court.')
    expect(missingTimeMessage({ ...complete(), duration_hours: NaN }))
      .toBe('Please choose how long you need the court.')
  })

  it('accepts a duration of 1', () => {
    expect(missingTimeMessage({ ...complete(), duration_hours: 1 })).toBeNull()
  })

  it('survives an absent form object rather than throwing', () => {
    expect(firstMissingMessage(undefined, TIME_FIELDS))
      .toBe('Please select a date.')
    expect(firstMissingMessage(null, DETAIL_FIELDS))
      .toBe('Please enter your full name.')
  })

  it('does not require the optional fields', () => {
    const form = { ...complete() }
    delete form.additional_notes
    delete form.exception_reason
    expect(missingTimeMessage(form)).toBeNull()
    expect(missingDetailMessage(form)).toBeNull()
  })
})
