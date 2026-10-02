// Creating a resident account: which step asks for what, and what the
// page says about a password.
//
// Pure, for the reason the rest of `utils/` is: ResidentSignup.jsx
// imports the Supabase client, which throws at import time without the
// env vars.
//
// ─── ⚠️ NONE OF THIS IS A SECURITY CONTROL ────────────────────────────
//
// Supabase Auth enforces the password rule the project is configured
// with, server-side, and it is the only thing that does. What is here
// is ADVICE and ORDERING: it keeps somebody from being told their
// password is too short while they are still typing their surname, and
// it says plainly what makes a password hard to guess.
//
// ⚠️ The advisory checks are NOT requirements and must never become
// them silently. A rule that rejects a long passphrase for having no
// digit makes passwords worse, not better. Only two things block:
// length, and the two entries matching.
//
// ⚠️ `COMMON_PASSWORDS` is a courtesy, not leaked-password protection.
// Real leaked-password checking is a Supabase Pro feature this project
// cannot enable -- CLAUDE.md records that the dashboard toggle appears
// to turn on and the save is rejected. A dozen strings checked in the
// browser stops a careless choice and nothing else, and anything built
// on top of it would be building on nothing.

import { PUROKS } from '../constants/barangay'

export const SIGNUP_STEPS = [
  { key: 'you', label: 'About You' },
  { key: 'account', label: 'Your Login' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'done', label: 'Done' },
]

// ⚠️ Eight, where Supabase's own default minimum is six. The client
// being STRICTER than the server is deliberate and is safe in that
// direction: an account this form refuses to create is simply not
// created. It would be unsafe the other way round -- a form that
// promised less than the server enforces produces an error nobody can
// act on.
export const MIN_PASSWORD_LENGTH = 8

// Step 1. Middle name and suffix are absent on purpose: plenty of
// people have neither, and a required field for an optional fact
// produces invented data.
export const IDENTITY_FIELDS = [
  { name: 'first_name', message: 'Please enter your first name.' },
  { name: 'last_name', message: 'Please enter your last name.' },
  { name: 'purok', message: 'Please select the purok where you live.' },
  { name: 'contact_number', message: 'Please enter a contact number the barangay can reach you on.' },
]

const isBlank = (value) => String(value ?? '').trim() === ''

export const firstMissing = (formData, fields) => {
  const found = fields.find((field) => isBlank(formData?.[field.name]))
  return found ? found.message : null
}

export const missingIdentityMessage = (formData) => {
  const missing = firstMissing(formData, IDENTITY_FIELDS)
  if (missing) return missing
  // ⚠️ Checked, but never rewritten. A stored value that is not on the
  // list keeps it -- the rule CLAUDE.md states for every purok field.
  // This is a NEW account, so there is nothing stored yet and the list
  // is all there is.
  if (!PUROKS.includes(String(formData.purok).trim())) {
    return 'Please choose a purok from the list.'
  }
  return null
}

// A very loose shape check. ⚠️ Deliberately loose: the only authority
// on whether an address works is whether the confirmation email
// arrives, and a clever regexp here rejects real addresses while
// accepting fake ones.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())

export const missingAccountMessage = (formData) => {
  if (isBlank(formData?.email)) return 'Please enter your email address.'
  if (!looksLikeEmail(formData.email)) {
    return 'That does not look like an email address. Please check it — the confirmation link is sent there.'
  }
  if (isBlank(formData?.password)) return 'Please choose a password.'
  if (String(formData.password).length < MIN_PASSWORD_LENGTH) {
    return `Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (formData.password !== formData.confirm_password) {
    return 'The two passwords do not match.'
  }
  return null
}

// The dozen choices that would be guessed first. Lowercased, and
// compared against the whole password rather than a substring: a
// passphrase containing the word "password" is not the password
// "password".
const COMMON_PASSWORDS = [
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwertyuiop', 'iloveyou', 'batinguel', 'barangay',
  'dumaguete', 'letmein', 'welcome1', 'abc12345',
]

export const isCommonPassword = (password) =>
  COMMON_PASSWORDS.includes(String(password ?? '').trim().toLowerCase())

// What the page shows beneath the password field. `required` marks the
// one check that actually blocks; everything else is advice and is
// labelled as such on screen.
export const passwordChecks = (password) => {
  const value = String(password ?? '')
  return [
    {
      id: 'length',
      required: true,
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: value.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: 'mixed',
      required: false,
      label: 'A mix of letters and numbers makes it harder to guess',
      met: /[a-z]/i.test(value) && /[0-9]/.test(value),
    },
    {
      id: 'uncommon',
      required: false,
      label: 'Not one of the passwords guessed first',
      met: value.length > 0 && !isCommonPassword(value),
    },
  ]
}
