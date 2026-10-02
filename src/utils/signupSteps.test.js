import { PUROKS } from '../constants/barangay'
import {
  IDENTITY_FIELDS,
  MIN_PASSWORD_LENGTH,
  SIGNUP_STEPS,
  isCommonPassword,
  missingAccountMessage,
  missingIdentityMessage,
  passwordChecks,
} from './signupSteps'

const identity = () => ({
  first_name: 'Ezequel',
  middle_name: '',
  last_name: 'Barcelona',
  suffix: '',
  purok: PUROKS[0],
  contact_number: '09171234567',
})

const account = () => ({
  email: 'ezequel@example.com',
  password: 'batinguel2026',
  confirm_password: 'batinguel2026',
})

describe('the step vocabulary', () => {
  it('is four steps, in order', () => {
    expect(SIGNUP_STEPS.map((s) => s.key)).toEqual(['you', 'account', 'confirm', 'done'])
  })
})

describe('step 1 — about you', () => {
  it('accepts a complete identity', () => {
    expect(missingIdentityMessage(identity())).toBeNull()
  })

  it('names the first missing field in render order', () => {
    expect(missingIdentityMessage({ ...identity(), first_name: '', last_name: '' }))
      .toBe('Please enter your first name.')
  })

  // ⚠️ Plenty of people have no middle name and no suffix. A required
  // field for an optional fact produces invented data, which then goes
  // into the barangay's own records.
  it('never requires a middle name or a suffix', () => {
    const names = IDENTITY_FIELDS.map((f) => f.name)
    expect(names).not.toContain('middle_name')
    expect(names).not.toContain('suffix')
    expect(missingIdentityMessage({ ...identity(), middle_name: '', suffix: '' })).toBeNull()
  })

  it('treats whitespace as missing', () => {
    expect(missingIdentityMessage({ ...identity(), last_name: '   ' }))
      .toBe('Please enter your last name.')
  })

  // The purok dropdown replaced a free-text box precisely so a new
  // spelling cannot reach the database. This is the last resident-facing
  // place a brand-new account is created, so the check belongs here too.
  it('refuses a purok that is not on the barangay list', () => {
    expect(missingIdentityMessage({ ...identity(), purok: 'Purok 99' }))
      .toBe('Please choose a purok from the list.')
    expect(missingIdentityMessage({ ...identity(), purok: 'purol 5' }))
      .toBe('Please choose a purok from the list.')
  })

  it('accepts every purok the barangay list holds', () => {
    PUROKS.forEach((purok) => {
      expect(missingIdentityMessage({ ...identity(), purok })).toBeNull()
    })
  })

  // ⚠️ Not a step 2 field. Somebody entering their name must never be
  // told their PASSWORD is wrong -- the whole reason this is in steps.
  it('says nothing about the email or the password', () => {
    expect(missingIdentityMessage(identity())).toBeNull()
    const noAccount = { ...identity(), email: '', password: '' }
    expect(missingIdentityMessage(noAccount)).toBeNull()
  })
})

describe('step 2 — your login', () => {
  it('accepts a complete account', () => {
    expect(missingAccountMessage(account())).toBeNull()
  })

  it('asks for an email before a password', () => {
    expect(missingAccountMessage({ ...account(), email: '', password: '' }))
      .toBe('Please enter your email address.')
  })

  it('rejects something that is plainly not an address', () => {
    expect(missingAccountMessage({ ...account(), email: 'ezequel' }))
      .toMatch(/does not look like an email address/)
    expect(missingAccountMessage({ ...account(), email: 'ezequel@example' }))
      .toMatch(/does not look like an email address/)
  })

  // ⚠️ Deliberately loose. The only authority on whether an address
  // works is whether the confirmation email arrives, and a clever
  // regexp rejects real addresses while accepting fake ones.
  it('accepts the ordinary awkward shapes a real address takes', () => {
    [
      'ezequel.barcelona+barangay@students.example.edu.ph',
      "o'brien@example.com",
      'a@b.co',
      'UPPER.CASE@Example.COM',
    ].forEach((email) => {
      expect(missingAccountMessage({ ...account(), email })).toBeNull()
    })
  })

  it('requires the minimum length and says the number', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(missingAccountMessage({ ...account(), password: short, confirm_password: short }))
      .toBe(`Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
  })

  it('accepts exactly the minimum length', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH)
    expect(missingAccountMessage({ ...account(), password: exact, confirm_password: exact }))
      .toBeNull()
  })

  it('refuses a mismatch, and says that is what it is', () => {
    expect(missingAccountMessage({ ...account(), confirm_password: 'something else' }))
      .toBe('The two passwords do not match.')
  })

  // ⚠️ The direction that matters. The client may be STRICTER than the
  // server -- an account this form refuses is simply not created. A
  // form promising LESS than the server enforces produces an error
  // nobody can act on, so this must never drop below Supabase's own
  // default minimum of six.
  it('is at least as strict as Supabase default minimum of six', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(6)
  })
})

describe('password guidance', () => {
  it('blocks on length and on nothing else', () => {
    const required = passwordChecks('short').filter((c) => c.required)
    expect(required.map((c) => c.id)).toEqual(['length'])
  })

  // ⚠️ A rule that rejects a long passphrase for having no digit makes
  // passwords worse, not better. These are advice and must stay advice.
  it('keeps the mix and uncommon checks advisory', () => {
    const advisory = passwordChecks('x').filter((c) => !c.required).map((c) => c.id)
    expect(advisory).toEqual(['mixed', 'uncommon'])
    // a long all-letters passphrase fails both advisory checks and is
    // still accepted
    expect(missingAccountMessage({
      email: 'a@b.co',
      password: 'correct horse battery staple',
      confirm_password: 'correct horse battery staple',
    })).toBeNull()
  })

  it('reports length against the real value', () => {
    const at = (p) => passwordChecks(p).find((c) => c.id === 'length').met
    expect(at('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false)
    expect(at('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true)
  })

  it('reports the letters-and-numbers mix', () => {
    const at = (p) => passwordChecks(p).find((c) => c.id === 'mixed').met
    expect(at('abcdefgh')).toBe(false)
    expect(at('12345678')).toBe(false)
    expect(at('abcd1234')).toBe(true)
    expect(at('ABCD1234')).toBe(true)
  })

  it('marks nothing met for an empty password', () => {
    passwordChecks('').forEach((check) => expect(check.met).toBe(false))
    passwordChecks(undefined).forEach((check) => expect(check.met).toBe(false))
  })

  it('flags the obvious choices, ignoring case and spacing', () => {
    expect(isCommonPassword('password')).toBe(true)
    expect(isCommonPassword('PASSWORD')).toBe(true)
    expect(isCommonPassword('  Batinguel  ')).toBe(true)
    expect(isCommonPassword('12345678')).toBe(true)
  })

  // Whole-value, not substring: a passphrase containing the word
  // "password" is not the password "password".
  it('does not flag a passphrase that merely contains a common word', () => {
    expect(isCommonPassword('my password is long')).toBe(false)
    expect(isCommonPassword('batinguel is my barangay')).toBe(false)
    expect(passwordChecks('batinguel is my barangay').find((c) => c.id === 'uncommon').met)
      .toBe(true)
  })
})
