// Combined Phase 1. The summons and the hearing/mediation notice: the
// data adapter, the two sheets as rendered, and the preview.
//
// ⚠️ §5 IS WHAT THIS SUITE IS FOR. No fake seal, no fake signature, no
// invented statutory or legal wording, the template/system-development
// status marked where wording has not been officially supplied, and
// FACTUAL case/hearing data only. Each of those is asserted against the
// rendered sheet rather than read off the source.

import { render, screen } from '@testing-library/react'
import fs from 'fs'
import path from 'path'

jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}))

import { buildKpNoticeData, kpMissingMessages, KP_DOCUMENT_KINDS } from './documents/kpNoticeData'
import KpNoticeTemplate from './documents/KpNoticeTemplate'
import KpNoticePreview from './documents/KpNoticePreview'
import { DOCUMENT_TEMPLATE_MODE, SIGNATORY_PLACEHOLDER } from '../documents/documentConfig'

const SRC = path.join(__dirname, '..')
const code = (p) => fs.readFileSync(path.join(SRC, p), 'utf8')
  .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const KP_CASE = {
  id: 'k1',
  reference: 'KP-2026-7HQ2MN',
  complaint_reference: 'CMP-2026-AB12CD',
  status: 'in_process',
}

const HEARING = {
  id: 'h1',
  proceeding_type: 'mediation',
  hearing_date: '2026-10-20',
  start_time: '14:00:00',
  location: 'Barangay Hall session room',
  status: 'scheduled',
  minutes: 'Both parties heard at length.',
  admin_notes: 'Both parties notified at the counter.',
  attendance: [],
}

const PARTIES = [
  { party_id: 'p1', party_role: 'complainant', party_name: 'Ezequel Bautista' },
  { party_id: 'p2', party_role: 'respondent', party_name: 'Named Respondent' },
  { party_id: 'p3', party_role: 'witness', party_name: 'Recorded Witness' },
]

const PANEL = [
  { id: 'm1', member_name: 'Recorded Chair', panel_role: 'chairperson' },
]

const build = (over = {}) => buildKpNoticeData({
  kpCase: { ...KP_CASE, ...(over.kpCase || {}) },
  hearing: { ...HEARING, ...(over.hearing || {}) },
  parties: over.parties === undefined ? PARTIES : over.parties,
  panel: over.panel === undefined ? PANEL : over.panel,
  now: new Date('2026-10-16T12:00:00.000Z'),
})

const sheet = (kind, over = {}) => render(
  <KpNoticeTemplate kind={kind} data={build(over)} />
).container

// ── A. Factual data only ────────────────────────────────────────────

describe('A. the sheet prints facts and nothing else', () => {
  it('prints the case reference, the complaint reference and the proceeding', () => {
    const c = sheet('notice')
    expect(c.textContent).toContain('KP-2026-7HQ2MN')
    expect(c.textContent).toContain('CMP-2026-AB12CD')
    expect(c.textContent).toContain('Mediation')
  })

  it('prints the date, the time and the place as recorded', () => {
    const c = sheet('notice')
    expect(c.textContent).toContain('20 October 2026')
    expect(c.textContent).toContain('2:00 PM')
    expect(c.textContent).toContain('Barangay Hall session room')
  })

  it('prints the recorded parties under their recorded roles', () => {
    const c = sheet('notice')
    expect(c.textContent).toContain('Ezequel Bautista')
    expect(c.textContent).toContain('Named Respondent')
    expect(c.textContent).toContain('Recorded Witness')
    expect(c.textContent).toContain('Complainant')
    expect(c.textContent).toContain('Respondent')
  })

  // ⚠️ NO RAW STORED VALUE REACHES PAPER. `mediation` is printed as
  // "Mediation" and `pangkat_hearing` as "Pangkat hearing".
  it('prints no stored identifier', () => {
    ;['mediation', 'pangkat_hearing', 'other'].forEach((type) => {
      const c = sheet('notice', { hearing: { proceeding_type: type } })
      expect(c.textContent).not.toContain('_')
    })
  })

  // ⚠️ NO PARTY CONTACT NUMBER. Neither reader returns one, so there is
  // none to print -- and a sheet that may be handed to either party is
  // the last place to undo P3-A's withholding.
  it('prints no contact number, even when one is planted on the party', () => {
    const data = buildKpNoticeData({
      kpCase: KP_CASE,
      hearing: HEARING,
      parties: [{ ...PARTIES[0], contact_number_snapshot: '09171234567' }],
      panel: [],
    })
    const c = render(<KpNoticeTemplate kind="notice" data={data} />).container
    expect(c.textContent).not.toContain('09171234567')
  })

  // ⚠️ AND NO NARRATIVE, CATEGORY, MINUTES OR INTERNAL NOTE. A notice is
  // served; the minutes are an internal record and the category is the
  // accusation.
  it('prints no narrative, category, minutes or internal note', () => {
    const c = sheet('notice')
    expect(c.textContent).not.toContain('Both parties heard at length')
    expect(c.textContent).not.toContain('Both parties notified at the counter')
    expect(c.textContent).not.toContain('family_dispute')
    expect(c.textContent).not.toContain('Minutes')
  })

  it('prints a recorded panel only when one exists', () => {
    expect(sheet('notice').textContent).toContain('Recorded Chair')
    expect(sheet('notice', { panel: [] }).textContent).not.toContain('Recorded panel')
  })

  // ⚠️ MARKED AS A RECORDED ROSTER, never as a constituted panel.
  it('marks the recorded panel as requiring barangay confirmation', () => {
    expect(sheet('notice').textContent).toMatch(/requires barangay confirmation/i)
  })

  it('prints attendance only once it has been recorded', () => {
    expect(sheet('notice').textContent).not.toContain('Did not appear')
    const withAtt = sheet('notice', {
      hearing: {
        attendance: [{ party_name: 'Named Respondent', attendance: 'absent' }],
      },
    })
    expect(withAtt.textContent).toContain('Did not appear')
  })
})

// ── B. No fake seal, no fake signature ─────────────────────────────

describe('B. the seal and the signatory', () => {
  // ⚠️ THE MARK IN THE HEADER IS THE PROJECT'S OWN `logo.png`, the same
  // asset the public navbar renders. No government seal is generated,
  // altered or redrawn -- and it is `alt=""` + `aria-hidden`, so it is
  // decoration rather than a claim.
  it('uses the project logo as decoration, and generates no seal', () => {
    const c = sheet('notice')
    const seal = c.querySelector('.doc-seal')
    expect(seal).not.toBeNull()
    expect(seal).toHaveAttribute('alt', '')
    expect(seal).toHaveAttribute('aria-hidden', 'true')
    expect(seal.getAttribute('src')).toMatch(/logo/)
  })

  // ⚠️ A RULE AND TWO BRACKETED PLACEHOLDERS, and NO SIGNATURE IMAGE.
  // This repository establishes no signing authority for either
  // document, so printing a real official's name would assert something
  // nobody has checked.
  it('prints a placeholder signatory and no signature image', () => {
    const c = sheet('notice')
    expect(c.textContent).toContain(SIGNATORY_PLACEHOLDER.name)
    expect(c.textContent).toContain(SIGNATORY_PLACEHOLDER.position)
    expect(c.querySelector('.doc-sign-rule')).not.toBeNull()
    const images = [...c.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(images).toHaveLength(1)   // the logo, and nothing else
    expect(images[0]).toMatch(/logo/)
  })

  // ⚠️ NO REAL OFFICIAL IS NAMED AS A SIGNATORY, and the data adapter
  // carries no name to put there -- it reads the placeholder from
  // `documentConfig`, which is X6's own decision.
  it('names no real official anywhere on the sheet', () => {
    const c = sheet('notice')
    ;['Credo', 'Tan', 'Remata', 'Baroy', 'Katada', 'Duran']
      .forEach((surname) => {
        expect(c.textContent).not.toMatch(new RegExp(`\\b${surname}\\b`))
      })
  })

  it('takes the signatory from the shared placeholder, not from a case field', () => {
    expect(build().signatory).toBe(SIGNATORY_PLACEHOLDER)
    expect(code('kpcases/documents/kpNoticeData.js')).not.toMatch(/opened_by_name|signatory_name/)
  })
})

// ── C. No invented statutory or legal wording ──────────────────────

describe('C. no invented legal wording', () => {
  const LEGAL = [
    'you are hereby', 'hereby required', 'hereby summoned', 'hereby ordered',
    'hereby directed', 'under penalty', 'penalty of', 'failure to appear',
    'shall be', 'by authority of', 'pursuant to', 'republic act',
    'presidential decree', 'local government code', 'section ',
    'contempt', 'subpoena', 'sworn', 'under oath', 'this is to certify',
    'hereby certif', 'warrant', 'arrest', 'fined', 'imprison',
  ]

  it('states no requirement, authority or consequence on either sheet', () => {
    ;['summons', 'notice'].forEach((kind) => {
      const text = sheet(kind).textContent.toLowerCase()
      LEGAL.forEach((phrase) => expect(text).not.toContain(phrase))
    })
  })

  // ⚠️ NO BARE NUMBER OUTSIDE THE FACTUAL FIELDS. A period, a deadline
  // or a penalty is a number, so the only digits on the sheet are the
  // date, the time, the year and the reference -- each of them a value
  // the barangay recorded.
  // ⚠️ SCOPED TO THE TITLE AND THE BODY, AND THAT IS MY OWN SCAN
  // CORRECTED. The first version ran over the whole sheet and the one
  // remaining digit was `(035) 226-2931` -- the barangay's real landline
  // in the footer, which `DocumentShell` prints on all six X6 sheets
  // too. A phone number in a contact line is a recorded fact, not a
  // statutory period, and the shared shell is X6's to assert.
  //
  // The property is about THIS phase's wording, which lives in the title
  // and the body, so that is what the scan covers.
  it('prints no number in its own wording that is not a recorded fact', () => {
    ;['summons', 'notice'].forEach((kind) => {
      const c = sheet(kind)
      let text = c.querySelector('.doc-title').textContent
        + c.querySelector('.doc-body').textContent
      ;['KP-2026-7HQ2MN', 'CMP-2026-AB12CD', '20 October 2026', '2:00 PM']
        .forEach((fact) => { text = text.split(fact).join(' ') })
      expect(text).not.toMatch(/\d/)
    })
  })

  // ⚠️ AND NO DEFERRED STAGE IS NAMED -- §10.
  it('names none of the deferred stages', () => {
    ;['summons', 'notice'].forEach((kind) => {
      const text = sheet(kind).textContent.toLowerCase()
      ;['settlement', 'repudiat', 'certificate to file', 'jurisdiction',
        'blotter', 'tanod', 'amicable']
        .forEach((term) => expect(text).not.toContain(term))
    })
  })
})

// ── D. Marked as a system template ─────────────────────────────────
//
// ⚠️ §5: clearly mark template/system-development status where wording
// has not been officially supplied. Barangay Batinguel has supplied the
// wording of neither document, so BOTH are marked, FOUR ways.

describe('D. the template marking', () => {
  it('is in prototype mode, with the watermark, the banner and the footer', () => {
    expect(DOCUMENT_TEMPLATE_MODE).toBe('prototype')
    ;['summons', 'notice'].forEach((kind) => {
      const c = sheet(kind)
      expect(c.querySelector('.doc-watermark')).not.toBeNull()
      expect(c.querySelector('.doc-sample-banner')).not.toBeNull()
      expect(c.querySelector('.doc-footer-sample')).not.toBeNull()
    })
  })

  // ⚠️ THE TITLE ITSELF SAYS SYSTEM TEMPLATE, which survives a premature
  // flip of `DOCUMENT_TEMPLATE_MODE` -- the same safety property X6's
  // `PROTOTYPE WORDING` label has, and the same replacement order:
  // replace the body first, flip the constant second.
  it('says SYSTEM TEMPLATE in the title of both', () => {
    expect(KP_DOCUMENT_KINDS.summons.title).toMatch(/SYSTEM TEMPLATE/)
    expect(KP_DOCUMENT_KINDS.notice.title).toMatch(/SYSTEM TEMPLATE/)
    ;['summons', 'notice'].forEach((kind) => {
      expect(sheet(kind).querySelector('.doc-title').textContent)
        .toMatch(/SYSTEM TEMPLATE/)
    })
  })

  it('carries the PROTOTYPE WORDING label on both', () => {
    ;['summons', 'notice'].forEach((kind) => {
      expect(sheet(kind).querySelector('.doc-prose-label').textContent)
        .toBe('PROTOTYPE WORDING')
    })
  })

  // ⚠️ AND IT DOES NOT CLAIM TO BE AN OFFICIAL FORM. It says in prose
  // that the barangay has not supplied the wording and that the
  // barangay issues its own.
  it('says the barangay has not supplied the wording', () => {
    ;['summons', 'notice'].forEach((kind) => {
      const text = sheet(kind).textContent
      expect(text).toMatch(/has not supplied the wording/i)
      expect(text).toMatch(/system development/i)
    })
  })

  it('distinguishes the two sheets by title and prose', () => {
    const s = sheet('summons').textContent
    const n = sheet('notice').textContent
    expect(s).toMatch(/^.*SUMMONS/)
    expect(n).toMatch(/HEARING \/ MEDIATION NOTICE/)
    expect(s).toMatch(/its own summons/i)
    expect(n).toMatch(/its own hearing or mediation notice/i)
  })

  // ⚠️ AN UNKNOWN KIND FALLS BACK TO THE NOTICE rather than rendering a
  // sheet with no title -- a blank title on a printed page reads as a
  // document that failed to generate.
  it('falls back to the notice for an unrecognised kind', () => {
    const c = render(<KpNoticeTemplate kind="constructor" data={build()} />).container
    expect(c.querySelector('.doc-title').textContent).toMatch(/SYSTEM TEMPLATE/)
  })
})

// ── E. A missing value is reported, never filled ───────────────────

describe('E. missing values', () => {
  it('reports a missing date rather than printing a dash', () => {
    const data = build({ hearing: { hearing_date: null } })
    expect(data.missing).toHaveLength(1)
    expect(kpMissingMessages(data)[0]).toMatch(/proceeding date is missing/)
    expect(kpMissingMessages(data)[0]).toMatch(/Correct the case record/)
  })

  it('reports each missing factual field', () => {
    ;[
      [{ kpCase: { reference: '' } }, /case reference is missing/],
      [{ hearing: { start_time: null } }, /start time is missing/],
      [{ hearing: { location: '   ' } }, /location is missing/],
      [{ parties: [] }, /no party is recorded/],
    ].forEach(([over, pattern]) => {
      const data = build(over)
      expect(data.missing.length).toBeGreaterThan(0)
      expect(kpMissingMessages(data).join(' ')).toMatch(pattern)
    })
  })

  // ⚠️ NO `N/A`, `UNKNOWN`, `TBD` OR EM DASH REACHES A FIELD. All four
  // read as statements inside a field that looks official -- X6's rule.
  it('fills nothing in, for any absent value', () => {
    const data = buildKpNoticeData({
      kpCase: { reference: '', complaint_reference: '' },
      hearing: {},
      parties: [],
      panel: [],
    })
    const values = [
      data.caseReference, data.complaintReference, data.proceeding,
      data.hearingDate, data.startTime, data.location,
    ]
    values.forEach((v) => {
      expect(v).not.toMatch(/N\/A|UNKNOWN|TBD|—|n\/a/i)
    })
  })

  it('prints nothing for an optional role with nobody in it', () => {
    const c = sheet('notice', { parties: [PARTIES[0], PARTIES[1]] })
    expect(c.textContent).not.toContain('Witness')
  })
})

// ── F. The preview ────────────────────────────────────────────────

describe('F. the preview', () => {
  const show = (props = {}) => render(
    <KpNoticePreview
      kind="notice"
      kpCase={KP_CASE}
      hearing={HEARING}
      parties={PARTIES}
      panel={PANEL}
      open
      onClose={() => {}}
      {...props}
    />
  )

  it('is a labelled modal dialog', () => {
    show()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'kp-notice-preview-title')
    // ⚠️ SCOPED TO THE TOOLBAR, because the SHEET's own `<h1>` says
    // "HEARING / MEDIATION NOTICE — SYSTEM TEMPLATE" and matched the
    // same case-insensitive name. An ambiguous query is a test that
    // cannot say which element it meant -- the same correction P4-A
    // needed when an outcome label appeared in both a paragraph and an
    // `<option>`.
    expect(document.querySelector('#kp-notice-preview-title').textContent)
      .toMatch(/Hearing \/ mediation notice/i)
  })

  it('renders nothing when closed, and nothing without a hearing', () => {
    const { container: a } = show({ open: false })
    expect(a).toBeEmptyDOMElement()
    const { container: b } = show({ hearing: null })
    expect(b).toBeEmptyDOMElement()
  })

  it('prints through the browser and offers no download', () => {
    window.print = jest.fn()
    show()
    screen.getByRole('button', { name: /Print/i }).click()
    expect(window.print).toHaveBeenCalled()
  })

  // ⚠️ PRINTING IS REFUSED WHILE A FACT IS MISSING, and the warning
  // lives OUTSIDE the sheet -- X6's rule, because a value filled in
  // inside a field that looks official is the defect.
  it('refuses to print while a fact is missing, and says so outside the sheet', () => {
    show({ hearing: { ...HEARING, hearing_date: null } })
    expect(screen.getByRole('button', { name: /Print/i })).toBeDisabled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/proceeding date is missing/)
    expect(alert.closest('.doc-page')).toBeNull()
    expect(document.querySelector('.doc-page')).toBeNull()
  })

  // ⚠️ THE SCROLLING STAGE IS KEYBOARD-REACHABLE. An A4 sheet is 1123px
  // tall and the stage rarely is -- axe's `scrollable-region-focusable`,
  // which X6 found by measuring rather than by reading.
  it('makes the scrolling stage focusable and named', () => {
    show()
    const stage = document.querySelector('.doc-preview-stage')
    expect(stage).toHaveAttribute('tabindex', '0')
    expect(stage).toHaveAttribute('aria-label', 'Document preview')
  })

  // ⚠️ THE SHEET KEEPS ITS A4 GEOMETRY INSIDE THE SCALED WRAPPER. X6
  // measured a 72%-scaled printed page because the reset named the
  // wrapper rather than the sheet, so the wrapper's presence is pinned.
  it('wraps the sheet in the scale wrapper the print reset expects', () => {
    show()
    const scale = document.querySelector('.doc-preview-scale')
    expect(scale).not.toBeNull()
    expect(scale.querySelector('.doc-page')).not.toBeNull()
  })

  // ⚠️ IT READS NOTHING AND WRITES NOTHING. Generating and printing move
  // no status, mark no hearing, record no outcome and file no audit
  // entry.
  it('reads nothing and changes no record', () => {
    const src = code('kpcases/documents/KpNoticePreview.jsx')
      + code('kpcases/documents/KpNoticeTemplate.jsx')
      + code('kpcases/documents/kpNoticeData.js')
    ;['supabase', 'useEffect', 'fetch(', '.update(', '.insert(',
      'logActivity', 'rpc(']
      .forEach((term) => expect(src).not.toContain(term))
  })

  it('names no KP table and no residents registry', () => {
    const src = code('kpcases/documents/KpNoticePreview.jsx')
      + code('kpcases/documents/KpNoticeTemplate.jsx')
      + code('kpcases/documents/kpNoticeData.js')
    ;['kp_cases', 'kp_hearings', 'residents_registry', 'complaint_parties']
      .forEach((term) => expect(src).not.toContain(term))
  })
})
