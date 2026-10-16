// P3-B1. The resident complaint experience's own rules.
//
// ⚠️ Pure module, no Supabase import, so this runs without `.env` --
// the reason `utils/` exists at all in this project.

import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALUES,
  COMPLAINT_STATUS_LABELS,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_TYPES,
  EVIDENCE_TYPES_LABEL,
  COMPLAINT_ERRORS,
  TRACKING_MISS_MESSAGE,
  TRACKING_MISS_TITLE,
  TRACKING_UNREACHABLE,
  complaintCategoryLabel,
  complaintDate,
  complaintStatusLabel,
  describeComplaintStatus,
  evidenceProblem,
  formatBytes,
  mediaKindFor,
} from './complaintLabels'

const fakeFile = (name, type, size) => ({ name, type, size })

describe('category labels', () => {
  it('covers the eight stored values migration 040 permits, in form order', () => {
    expect(COMPLAINT_CATEGORY_VALUES).toEqual([
      'noise', 'unpaid_debt', 'boundary_dispute', 'physical_altercation',
      'theft', 'threats', 'family_dispute', 'other',
    ])
  })

  it('maps each to the agreed human label', () => {
    expect(COMPLAINT_CATEGORIES).toEqual([
      { value: 'noise', label: 'Noise Complaint' },
      { value: 'unpaid_debt', label: 'Debt / Unpaid Obligation' },
      { value: 'boundary_dispute', label: 'Boundary Dispute' },
      { value: 'physical_altercation', label: 'Physical Altercation' },
      { value: 'theft', label: 'Theft' },
      { value: 'threats', label: 'Threats' },
      { value: 'family_dispute', label: 'Family Dispute' },
      { value: 'other', label: 'Other' },
    ])
  })

  it('shows NO raw underscore value to a user', () => {
    // ⚠️ The rule *Who owns a status label* enforces: the Activity Log
    // printed `ready_for_pickup` on screen until a map covered it.
    COMPLAINT_CATEGORIES.forEach(({ label }) => expect(label).not.toContain('_'))
  })

  it('returns an unrecognised value EXACTLY as stored, not blank', () => {
    // A value nobody anticipated must stay visible -- the alternative
    // is a screen that silently loses a complaint.
    expect(complaintCategoryLabel('something_new')).toBe('something_new')
    expect(complaintCategoryLabel('')).toBe('')
    expect(complaintCategoryLabel(undefined)).toBe('')
  })

  it('does not resolve an inherited property name', () => {
    // ⚠️ A bare object lookup answers for `constructor` with a
    // function -- the trap officialPhotos.test.js already pins.
    expect(complaintCategoryLabel('constructor')).toBe('constructor')
    expect(complaintCategoryLabel('toString')).toBe('toString')
  })
})

describe('status labels', () => {
  it('knows ONLY `received`, because the database permits only that', () => {
    expect(Object.keys(COMPLAINT_STATUS_LABELS)).toEqual(['received'])
    expect(complaintStatusLabel('received')).toBe('Received')
  })

  it('fabricates no future status', () => {
    // ⚠️ Screening, referral and KP stages are P4 and will widen the
    // CHECK and this map together. A vocabulary written ahead of its
    // consumers is the displayLabels mistake.
    ;['screening', 'referred', 'mediation', 'conciliation', 'settled',
      'dismissed', 'kp_case', 'repudiated', 'withdrawn']
      .forEach((v) => expect(COMPLAINT_STATUS_LABELS[v]).toBeUndefined())
  })

  it('keeps an unknown status visible with no explanation invented', () => {
    const d = describeComplaintStatus('mystery')
    expect(d.label).toBe('mystery')
    expect(d.isKnown).toBe(false)
    expect(d.explanation).toBe('')
  })

  it('promises nothing legal in the explanation it does have', () => {
    const text = describeComplaintStatus('received').explanation.toLowerCase()
    ;['mediation', 'conciliation', 'hearing', 'summons', 'settlement',
      'lupon', 'pangkat', 'katarungan', 'arrest', 'police', 'court',
      'eligible', 'jurisdiction', 'within days', 'will be resolved']
      .forEach((promise) => expect(text).not.toContain(promise))
    expect(text).toContain('received for barangay review')
  })
})

describe('the evidence contract mirrors the backend', () => {
  it('lists exactly the four MIME types the bucket accepts', () => {
    expect(EVIDENCE_MIME_TYPES).toEqual([
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    ])
  })

  it('uses the same 5 MB ceiling as the bucket and the CHECK', () => {
    expect(EVIDENCE_MAX_BYTES).toBe(5242880)
  })

  it('offers NO video, anywhere', () => {
    // ⚠️ P3-A does not accept it. Offering an option the backend
    // refuses produces a failure the resident cannot explain.
    expect(EVIDENCE_MIME_TYPES.join(' ')).not.toContain('video')
    expect(EVIDENCE_ACCEPT).not.toContain('video')
    expect(EVIDENCE_ACCEPT).not.toContain('.mp4')
    expect(EVIDENCE_ACCEPT).not.toContain('.mov')
    expect(EVIDENCE_TYPES_LABEL.toLowerCase()).not.toContain('video')
  })

  it('never uses an unrestricted picker', () => {
    expect(EVIDENCE_ACCEPT).not.toBe('*/*')
    expect(EVIDENCE_ACCEPT).not.toContain('*')
    // Every entry is one of the four types or its extension.
    EVIDENCE_ACCEPT.split(',').forEach((token) => {
      expect(
        EVIDENCE_MIME_TYPES.includes(token)
        || ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(token)
      ).toBe(true)
    })
  })

  it('refuses a video file with a message naming what IS accepted', () => {
    const problem = evidenceProblem(fakeFile('clip.mp4', 'video/mp4', 1000))
    expect(problem).toMatch(/not a supported type/i)
    expect(problem).toMatch(/JPG, PNG, WebP or PDF/)
    expect(problem).toMatch(/Video is not supported yet/)
  })

  it('refuses a file over 5 MB and says its actual size', () => {
    const problem = evidenceProblem(fakeFile('big.png', 'image/png', 6000000))
    expect(problem).toMatch(/over the 5 MB limit/)
    expect(problem).toMatch(/5\.7 MB/)
  })

  it('accepts each of the four at the boundary', () => {
    EVIDENCE_MIME_TYPES.forEach((type) => {
      expect(evidenceProblem(fakeFile('f', type, EVIDENCE_MAX_BYTES))).toBeNull()
    })
  })

  it('refuses an empty file', () => {
    expect(evidenceProblem(fakeFile('e.png', 'image/png', 0))).toMatch(/empty/)
  })

  it('names the media kind the way the backend derives it', () => {
    expect(mediaKindFor('image/jpeg')).toBe('Photo')
    expect(mediaKindFor('image/webp')).toBe('Photo')
    expect(mediaKindFor('application/pdf')).toBe('Document')
    expect(mediaKindFor('video/mp4')).toBe('')
    expect(mediaKindFor(undefined)).toBe('')
  })

  it('formats sizes without inventing one', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5242880)).toBe('5.0 MB')
    expect(formatBytes('nonsense')).toBe('')
  })
})

describe('dates are read from the characters, never from a Date', () => {
  it('renders a date-only value', () => {
    expect(complaintDate('2026-10-16')).toBe('16 October 2026')
  })

  it('renders a timestamptz by its date part', () => {
    expect(complaintDate('2026-01-05T23:40:00.000Z')).toBe('5 January 2026')
  })

  it('refuses a date the month does not have rather than sliding it', () => {
    // 2026-02-30 is not a date, and sliding it to March 2nd is how bad
    // data hides -- the rule monthGrid.js already enforces.
    expect(complaintDate('2026-02-30')).toBe('')
  })

  it('returns empty for anything that is not a date', () => {
    ;['', null, undefined, 'tomorrow', 42].forEach((v) => expect(complaintDate(v)).toBe(''))
  })

  it('constructs no Date from a date string in the module source', () => {
    const fs = require('fs')
    const src = fs.readFileSync(require.resolve('./complaintLabels'), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    // ⚠️ `new Date('2026-10-16')` parses as UTC midnight and reads back
    // in the browser's zone, so west of UTC it describes the previous
    // day -- the event_month / event_day defect.
    expect(src).not.toMatch(/new Date\(/)
    expect(src).not.toMatch(/toLocaleDateString|toLocaleString/)
  })
})

describe('the tracking miss message gives nothing away', () => {
  const all = `${TRACKING_MISS_TITLE} ${TRACKING_MISS_MESSAGE}`.toLowerCase()

  it('is ONE message for every kind of miss', () => {
    // ⚠️ The security property: a wrong reference and a wrong contact
    // must be indistinguishable. `track_complaint()` cannot tell them
    // apart either -- both conditions are ANDed in one WHERE with no
    // branch -- so this is the UI half of a database guarantee.
    expect(typeof TRACKING_MISS_MESSAGE).toBe('string')
    expect(TRACKING_MISS_MESSAGE.length).toBeGreaterThan(40)
  })

  it('says nothing about not-found, existence or which field was wrong', () => {
    ;['not found', 'no such', 'does not exist', "doesn't exist",
      'invalid reference', 'invalid contact', 'wrong reference',
      'wrong number', 'wrong phone', 'incorrect', 'unknown reference',
      'no complaint with', 'reference exists', 'that reference',
      'no record', 'unrecognised reference', 'unrecognized reference']
      .forEach((oracle) => expect(all).not.toContain(oracle))
  })

  it('never names only one of the two fields as the problem', () => {
    // Both are named together, as a pair to re-check, which is what
    // makes the message useful without being an oracle.
    expect(all).toContain('reference number')
    expect(all).toContain('contact number')
  })

  it('is still useful: it says what to re-check and where to go', () => {
    expect(all).toContain('check')
    expect(all).toContain('barangay hall')
  })

  it('keeps an unreachable system as a DIFFERENT message', () => {
    // ⚠️ Showing the miss message when the request never reached the
    // database tells somebody their complaint does not exist, which is
    // the one wrong thing this page can say.
    expect(TRACKING_UNREACHABLE).not.toBe(TRACKING_MISS_MESSAGE)
    expect(TRACKING_UNREACHABLE.toLowerCase()).toContain('could not reach')
  })
})

describe('user-facing failures leak no database detail', () => {
  const messages = Object.values(COMPLAINT_ERRORS)

  it('mentions no SQLSTATE, policy, RPC, table, bucket or path', () => {
    messages.forEach((m) => {
      const lower = m.toLowerCase()
      ;['42501', '23514', 'p0001', '22p02', 'policy', 'rls', 'rpc',
        'supabase', 'postgres', 'complaint-evidence', 'storage',
        'complaint_parties', 'complaints.', 'select', 'insert',
        'function', 'constraint', 'violates', 'permission denied']
        .forEach((leak) => expect(lower).not.toContain(leak))
    })
  })

  it('tells a resident what to do instead of what went wrong internally', () => {
    expect(COMPLAINT_ERRORS.submitFailed).toMatch(/try again/i)
    expect(COMPLAINT_ERRORS.notResident).toMatch(/resident account/i)
  })

  it('never says a complaint was lost when only an attachment failed', () => {
    // ⚠️ Evidence can only be uploaded AFTER the complaint row exists,
    // because the storage path is the complaint's own id. So a failed
    // attachment always sits beside a valid reference.
    const m = COMPLAINT_ERRORS.evidencePartial
    expect(m).toMatch(/complaint was submitted/i)
    expect(m).toMatch(/reference number below is valid/i)
    expect(m.toLowerCase()).not.toContain('failed to submit')
  })
})

describe('no screening or KP language exists in this phase', () => {
  it('appears in no label, status, explanation or error message', () => {
    const everything = [
      ...COMPLAINT_CATEGORIES.map((c) => c.label),
      ...Object.values(COMPLAINT_STATUS_LABELS).map((s) => s.label),
      describeComplaintStatus('received').explanation,
      TRACKING_MISS_TITLE, TRACKING_MISS_MESSAGE, TRACKING_UNREACHABLE,
      ...Object.values(COMPLAINT_ERRORS),
    ].join(' ').toLowerCase()

    ;['katarungang', 'katarungan', 'lupon', 'pangkat', 'mediation',
      'conciliation', 'summons', 'hearing', 'settlement', 'referral',
      'certificate to file', 'kp eligible', 'jurisdiction', 'barangay case']
      .forEach((term) => expect(everything).not.toContain(term))
  })
})
