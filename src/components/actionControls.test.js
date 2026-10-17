// PR #45 — the Back / Close / section-heading contract across the modules
// the Complaint, Screening, KP, Incident, Tanod and Safety work added.
//
// ⚠️ WHY SOURCE-READING, AND WHAT IT IS NOT DOING. The *geometry* -- that
// an icon and its label sit on one line, that a control clears 24px -- is
// measured in Chromium against the shipped CSS bundle, because jsdom has
// no layout and a test here could not see a wrapped button at all. What
// these guards pin is the half a measurement cannot: WHICH icon a control
// carries, whether it can submit a form by accident, and whether the icon
// and the label are one control or two stacked elements. A rendered
// measurement passes just as happily when an ✕ is used for navigation.

import fs from 'fs'
import path from 'path'

const SRC = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

// ⚠️ Comment-stripped, the way every scan in this project runs: these
// files discuss `FaTimes` and `Back` at length precisely to record which
// control gets which, and a literal scan reports the prose.
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

// The modules this pass covers. Older accepted pages are deliberately out
// of scope -- §6 -- so they are not listed and are not scanned.
const MODULES = [
  'complaints/OfficialComplaints.jsx',
  'complaints/MyComplaints.jsx',
  'complaints/FileComplaintForm.jsx',
  'complaints/WalkInComplaintForm.jsx',
  'screening/ScreeningPanel.jsx',
  'kpcases/KpCasePanel.jsx',
  'incidents/IncidentsPanel.jsx',
  'tanod/TanodPanel.jsx',
  'safetymap/SafetyMapPanel.jsx',
  'safetymap/PublicSafetyMap.jsx',
  'pages/CommunitySafety.jsx',
]

// One <button ...>...</button>, with its own markup.
const buttons = (src) => src.match(/<button\b[\s\S]*?<\/button>/g) || []

describe('Back and Close carry the right semantics', () => {
  // ⚠️ THE DEFECT THIS EXISTS FOR. The walk-in intake's "Back to the
  // queue" was an ✕. An ✕ means "dismiss this overlay"; a left arrow
  // means "go back one step", and the walk-in form is a step in a flow
  // with a queue behind it, not an overlay on top of one.
  it('uses a back arrow for navigation, never a close cross', () => {
    const src = code('complaints/OfficialComplaints.jsx')
    const back = buttons(src).find((b) => /Back to the queue/.test(b))
    expect(back).toBeDefined()
    expect(back).toMatch(/FaArrowLeft/)
    expect(back).not.toMatch(/FaTimes/)
  })

  it('uses a close cross for dismissal, never a back arrow', () => {
    const src = code('complaints/OfficialComplaints.jsx')
    const close = buttons(src).filter((b) => />\s*Close\s*</.test(b) || /\sClose\s/.test(b))
    expect(close.length).toBeGreaterThan(0)
    close.forEach((b) => {
      expect(b).toMatch(/FaTimes/)
      expect(b).not.toMatch(/FaArrowLeft/)
    })
  })

  // The same control one tab away must not be a different control.
  it('closes the incident detail with the same icon and the same class', () => {
    const src = code('incidents/IncidentsPanel.jsx')
    const close = buttons(src).find((b) => /onClick=\{\(\) => setDetail\(null\)\}/.test(b))
    expect(close).toBeDefined()
    expect(close).toMatch(/FaTimes/)
    // ⚠️ NOT `btn-deny`: dismissing a read-only panel destroys nothing,
    // and red is what Stand down and Remove use.
    expect(close).toMatch(/btn-cancel/)
    expect(close).not.toMatch(/btn-deny/)
  })

  it('closes the resident success panel the same way', () => {
    const close = buttons(code('complaints/MyComplaints.jsx'))
      .find((b) => /setFiled\(null\)/.test(b))
    expect(close).toBeDefined()
    expect(close).toMatch(/FaTimes/)
  })

  // ⚠️ An icon that contradicts its own label is the same fault as an ✕
  // used for navigation. The record form's toggle showed a PLUS beside
  // the word "Close".
  it('does not offer a plus sign beside the word Close', () => {
    const src = code('incidents/IncidentsPanel.jsx')
    buttons(src).forEach((b) => {
      if (/FaPlus/.test(b) && /Close/.test(b)) {
        // allowed only when the two sit in different branches
        expect(b).toMatch(/\?[\s\S]*FaTimes[\s\S]*Close/)
      }
    })
    const toggle = buttons(src).find((b) => /setShowForm\(\(open\) => !open\)/.test(b))
    expect(toggle).toMatch(/FaTimes[\s\S]*Close form/)
    expect(toggle).toMatch(/FaPlus[\s\S]*Record Incident/)
  })
})

describe('no control can submit a form by accident', () => {
  // ⚠️ A <button> DEFAULTS TO `submit`. Inside a form that fires the
  // submit handler; outside one it does nothing today and does something
  // the moment the markup is wrapped. Every button in these modules
  // states its type, and the ONE that did not was found by this guard.
  it('every button in the new modules declares its type', () => {
    const missing = []
    MODULES.forEach((rel) => {
      buttons(code(rel)).forEach((b) => {
        if (!/\stype=/.test(b)) {
          missing.push(`${rel}: ${b.replace(/\s+/g, ' ').slice(0, 70)}`)
        }
      })
    })
    expect(missing).toEqual([])
  })

  it('declares Back and Close as type="button", never submit', () => {
    const all = MODULES.flatMap((rel) => buttons(code(rel)))
    const navOrClose = all.filter((b) => /Back to |>\s*Close|\sClose\s/.test(b))
    expect(navOrClose.length).toBeGreaterThan(2)
    navOrClose.forEach((b) => expect(b).toMatch(/type="button"/))
  })
})

describe('an icon and its label are ONE control', () => {
  // ⚠️ The screenshots showed the icon on one line and the label on the
  // next. That is one control whose inline run wrapped -- not two
  // elements -- and the fix is the flex pattern the other button classes
  // already had. This guard holds the shape: the svg is a direct child
  // of the button, beside the text, never in a sibling element of its
  // own that could be positioned independently.
  it('puts the icon inside the button, not beside it', () => {
    MODULES.forEach((rel) => {
      const src = code(rel)
      // a <span>/<div> holding only an icon, immediately before a button
      expect(src).not.toMatch(/<(span|div)[^>]*>\s*<Fa\w+[^>]*\/>\s*<\/\1>\s*<button/)
    })
  })

  // The five button classes these modules use must all carry the flex
  // pattern, or the icon drops below the label when the row is tight.
  // Read from the stylesheet, because that is where the property lives.
  it('gives every button class the inline-flex, nowrap pattern', () => {
    const css = read('components/Sidebar.css')
    const own = (sel) => {
      const m = css.match(new RegExp(`\\${sel}\\s*\\{[^}]*\\}`))
      return m ? m[0] : ''
    }
    // ⚠️ `white-space` is searched across the WHOLE stylesheet, not inside
    // each class's own block: `.btn-approve`, `.btn-deny` and `.btn-add`
    // take it from one shared multi-selector rule 900 lines further down.
    // My first version of this guard read each block alone and reported
    // three accepted classes as broken -- the scan was wrong, not the CSS.
    const nowrapApplies = (sel) => new RegExp(
      `(^|,)\\s*\\${sel}\\s*(,[^{]*)?\\{[^}]*white-space:\\s*nowrap`, 'm'
    ).test(css) || new RegExp(
      `\\${sel}\\s*,[\\s\\S]{0,120}?\\{[^}]*white-space:\\s*nowrap`
    ).test(css)

    ;['.btn-add', '.btn-approve', '.btn-deny', '.btn-cancel', '.btn-save'].forEach((sel) => {
      const body = own(sel)
      expect(body).toMatch(/display:\s*inline-flex/)
      expect(body).toMatch(/align-items:\s*center/)
      expect(nowrapApplies(sel)).toBe(true)
    })

    // ⚠️ THE ACTUAL MECHANISM, and why only two classes needed the fix.
    // `.dashboard-card-header` is `flex-wrap: wrap`, and a flex item's
    // default `flex-shrink: 1` lets a button be squeezed under its own
    // content width beside a long heading. `nowrap` then keeps the run
    // on one line -- which is why the three classes that already had it
    // never stacked, and the two that did not, did. `.btn-cancel` and
    // `.btn-save` now carry BOTH: the shrink guard stops the squeeze and
    // `nowrap` stops the break if anything ever defeats it.
    ;['.btn-cancel', '.btn-save'].forEach((sel) => {
      expect(own(sel)).toMatch(/flex-shrink:\s*0/)
      expect(own(sel)).toMatch(/white-space:\s*nowrap/)
    })
  })
})

describe('section headings are one reusable pattern', () => {
  // ⚠️ ONE CLASS, DEFINED ONCE, in `index.css` -- the `@keyframes pulse`
  // rule. A pattern several modules share, owned by one module's
  // stylesheet, is a pattern only whichever file the bundler emits last
  // actually controls.
  it('defines .section-heading globally and exactly once', () => {
    const global = read('index.css')
    expect(global).toMatch(/\.section-heading\s*\{/)
    expect(global).toMatch(/\.section-heading\s*\{[^}]*display:\s*flex/)
    expect(global).toMatch(/\.section-heading svg\s*\{[^}]*flex-shrink:\s*0/)

    const elsewhere = ['complaints/Complaints.css', 'screening/Screening.css',
      'kpcases/KpCase.css', 'incidents/Incidents.css', 'tanod/Tanod.css',
      'safetymap/SafetyMap.css', 'components/Sidebar.css']
      .filter((f) => fs.existsSync(path.join(SRC, f)))
      .filter((f) => /\.section-heading\s*\{/.test(read(f)))
    expect(elsewhere).toEqual([])
  })

  // ⚠️ IT SETS NO TYPE. A heading that took its size or colour from this
  // class would be a second heading style competing with the stylesheets
  // that already own those headings.
  it('sets no font size, weight or colour', () => {
    const block = read('index.css').match(/\.section-heading\s*\{[^}]*\}/)[0]
    expect(block).not.toMatch(/font-size|font-weight|color\s*:/)
  })

  // Every heading in these modules that carries an icon uses it.
  it('is carried by every icon-bearing section heading in the new modules', () => {
    const bad = []
    MODULES.forEach((rel) => {
      const src = code(rel)
      const headings = src.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g) || []
      headings.forEach((h) => {
        if (!/<Fa\w+/.test(h)) return
        if (!/className="[^"]*section-heading/.test(h)) {
          bad.push(`${rel}: ${h.replace(/\s+/g, ' ').slice(0, 60)}`)
        }
      })
    })
    expect(bad).toEqual([])
  })
})
