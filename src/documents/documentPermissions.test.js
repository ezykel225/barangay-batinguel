// Who can reach Generate Document, asserted against the SOURCE rather
// than by rendering a 4,900-line dashboard.
//
// ⚠️ WHY SOURCE-READING. `canGenerate` is unit-tested in both
// directions in `documentRegistry.test.js`, but a correct predicate
// wired to the wrong flag -- or a second, ungated call site added later
// -- would pass every one of those tests. This suite pins the wiring:
// which dashboards can reach the preview at all, and what `isSecretary`
// is actually derived from.
//
// The same pattern `officialAvailability.test.js` uses to read
// migration 026's SQL, and `notificationLabels.test.js` to prove a
// module defines no vocabulary of its own.

import fs from 'fs'
import path from 'path'

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

// ⚠️ Comments stripped before matching. These modules EXPLAIN in prose
// why they do not read the voter reference data, and a guard that
// flagged its own explanation would push the explanation out of the
// file -- which is the opposite of what it is for.
// The same file with its line breaks collapsed, so an assertion about
// a sentence is not defeated by where the comment happened to wrap.
const prose = (file) => read(file).replace(/\s*\/\/\s*/g, ' ').replace(/\s+/g, ' ')

const codeOnly = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const OFFICIAL = read('dashboards/OfficialDashboard.jsx')
const RESIDENT = read('dashboards/ResidentDashboard.jsx')
const NURSE = read('dashboards/NurseDashboard.jsx')

describe('only the Official Dashboard can reach the generator', () => {
  it('is imported there', () => {
    expect(OFFICIAL).toMatch(/import DocumentPreview from '\.\.\/documents\/DocumentPreview'/)
    expect(OFFICIAL).toMatch(/canGenerate.*from '\.\.\/documents\/documentRegistry'/)
  })

  // ⚠️ A resident must not generate the authoritative staff-side
  // document. They continue to see their request's status in their own
  // portal, which is unchanged.
  it('is NOT reachable from the Resident Portal', () => {
    expect(RESIDENT).not.toContain('documents/DocumentPreview')
    expect(RESIDENT).not.toContain('documentRegistry')
    expect(RESIDENT).not.toContain('DocumentPreview')
  })

  // The nurse has no role in the document-request workflow at all --
  // she cannot even read `document_requests`.
  it('is NOT reachable from the Nurse Dashboard', () => {
    expect(NURSE).not.toContain('documents/DocumentPreview')
    expect(NURSE).not.toContain('documentRegistry')
    expect(NURSE).not.toContain('DocumentPreview')
  })

  // Nothing public prints a document.
  it('is not imported by any page or public component', () => {
    const roots = ['pages', 'components']
    roots.forEach((dir) => {
      const base = path.join(__dirname, '..', dir)
      fs.readdirSync(base)
        .filter((f) => /\.jsx?$/.test(f) && !f.includes('.test.'))
        .forEach((file) => {
          const source = fs.readFileSync(path.join(base, file), 'utf8')
          expect(source).not.toContain('DocumentPreview')
          expect(source).not.toContain('documentRegistry')
        })
    })
  })
})

describe('the gate the dashboard actually applies', () => {
  // ⚠️ THE LOAD-BEARING ONE. `isSecretary` is the same flag that gates
  // Approve, Decline, Mark Ready and Mark Claimed, and it is the same
  // position the RLS UPDATE policy requires. Generation widens
  // authorization by nobody.
  it('derives isSecretary from the Barangay Secretary position, unchanged', () => {
    expect(OFFICIAL).toMatch(
      /const isSecretary = officialInfo\?\.position === 'Barangay Secretary'/,
    )
  })

  it('passes isSecretary into canGenerate at the call site', () => {
    const call = OFFICIAL.slice(
      OFFICIAL.indexOf('canGenerate({'),
      OFFICIAL.indexOf('})', OFFICIAL.indexOf('canGenerate({')),
    )
    expect(call).toContain('status: req.status')
    expect(call).toContain('documentType: req.document_type')
    expect(call).toContain('isSecretary')
  })

  // ⚠️ SINCE PR #24 THE BUTTON IS A ⋮ MENU ITEM, and `canGenerate` is
  // called to decide whether that item exists at all. So the answer has
  // to reach the item builder and nothing else may decide it:
  // `rowActions.documentRequestActions` is TOLD the answer and never
  // re-derives it from the status.
  it('feeds the answer straight into the item builder', () => {
    expect(OFFICIAL).toMatch(/canGenerateDocument: canGenerate\(\{/)
    // Comments stripped: the module EXPLAINS in prose that
    // `documentRegistry.canGenerate` stays the only authority, and a
    // guard that flagged its own explanation would push it out of the
    // file. The same reason the voter-reference guard below does it.
    const builder = codeOnly(read('utils/rowActions.js'))
    expect(builder).not.toContain('documentRegistry')
    expect(builder).not.toContain('canGenerate(')
    expect(builder).toContain('canGenerateDocument')
    // And the prose is still there to be read.
    expect(prose('utils/rowActions.js')).toContain('documentRegistry.canGenerate')
  })

  // One call site, so a second ungated button cannot appear beside it.
  it('calls canGenerate exactly once', () => {
    expect(OFFICIAL.match(/canGenerate\(/g)).toHaveLength(1)
  })

  it('renders the preview exactly once', () => {
    expect(OFFICIAL.match(/<DocumentPreview/g)).toHaveLength(1)
  })

  // ⚠️ The preview opens from state the queue already holds. A second
  // Supabase read here would be a data path RLS has not been checked
  // against on this surface.
  it('opens the preview from the already-fetched row, with no new query', () => {
    expect(OFFICIAL).toMatch(/setDocumentRequestToPrint\(req\)/)
    const preview = read('documents/DocumentPreview.jsx')
    expect(preview).not.toContain('supabase')
    expect(preview).not.toContain('from(')
  })
})

describe('no template touches the database', () => {
  // The whole reason the adapter exists: replacing a prototype with the
  // real form must not mean rewriting data access.
  const files = fs.readdirSync(path.join(__dirname, 'templates'))

  it('has a template file for each configured type', () => {
    expect(files.filter((f) => f.endsWith('.jsx'))).toHaveLength(6)
  })

  it('imports no client, and issues no query, in any template', () => {
    files.forEach((file) => {
      const source = fs.readFileSync(path.join(__dirname, 'templates', file), 'utf8')
      expect(source).not.toContain('supabase')
      expect(source).not.toContain('useEffect')
      expect(source).not.toContain('fetch(')
    })
  })

  it('imports no client in the shell or the data adapter either', () => {
    expect(read('documents/DocumentShell.jsx')).not.toContain('supabase')
    expect(read('documents/documentData.js')).not.toContain('supabase')
    expect(read('documents/documentRegistry.js')).not.toContain('supabase')
  })

  // ⚠️ `residents_registry` is the Voter Reference List, not a resident
  // roll. Reading residency off it is the exact wrong inference, and
  // the one surface where it would be printed and handed over.
  it('reads nothing from the voter reference data', () => {
    const all = ['documents/documentData.js', 'documents/DocumentPreview.jsx',
      'documents/DocumentShell.jsx', 'documents/documentRegistry.js']
    all.forEach((file) => {
      expect(codeOnly(read(file)))
        .not.toMatch(/residents_registry|registryEntries|findRegistryMatch/)
    })
  })

  // And the prose saying so is still in the file, so the next reader
  // learns the rule rather than rediscovering it.
  it('still explains in documentData.js why it does not', () => {
    expect(read('documents/documentData.js')).toContain('residents_registry')
    expect(prose('documents/documentData.js')).toContain('Voter Reference List')
  })
})

describe('generation changes no status', () => {
  // ⚠️ Printing a sheet is not the same fact as "the resident may
  // collect this" (Mark Ready) or "the resident has it" (Mark Claimed).
  // Both stay the deliberate actions they already were.
  it('writes no status from the preview', () => {
    const preview = read('documents/DocumentPreview.jsx')
    expect(preview).not.toContain('ready_for_pickup')
    expect(preview).not.toContain('claimed')
    expect(preview).not.toContain('update(')
  })

  // ⚠️ REWRITTEN FOR PR #24, NOT DELETED. This used to slice 600
  // characters forward from the `canGenerate({` call, which worked
  // while Generate was a lone button in the action cell and would have
  // read as a pass for the wrong reason once the four stage-advancing
  // handlers moved into the same object. It now pins the `generate`
  // entry of `docActionHandlers` itself -- one key, one line.
  it('routes the Generate item to the preview and to no status write', () => {
    const map = OFFICIAL.slice(
      OFFICIAL.indexOf('const docActionHandlers = {'),
      OFFICIAL.indexOf('\n  }', OFFICIAL.indexOf('const docActionHandlers = {')),
    )
    const generate = map.slice(map.indexOf('generate: '))
    expect(generate).toContain('setDocumentRequestToPrint(req)')
    expect(generate).not.toContain('handleUpdateDocRequestStatus')
    expect(generate).not.toContain('handleMarkDocRequestClaimed')
    // And the two that DO advance the status are still their own
    // separate items, so the preview did not absorb either of them.
    expect(map).toContain("ready: (req) => handleUpdateDocRequestStatus(req, 'ready_for_pickup')")
    expect(map).toContain('claimed: (req) => handleMarkDocRequestClaimed(req)')
  })

  // ⚠️ `GENERATABLE_STATUSES` is still what opens and closes the
  // window, and the menu cannot have widened it: the item exists only
  // when `canGenerate` says so, and `documentRequestActions` has no
  // status branch of its own for it.
  it('still offers no Generate item at claimed or declined', () => {
    const { documentRequestActions } = require('../utils/rowActions')
    ;['claimed', 'declined', 'pending'].forEach((status) => {
      const keys = documentRequestActions({
        status,
        isSecretary: true,
        // What canGenerate actually returns for these three.
        canGenerateDocument: false,
      }).map((item) => item.key)
      expect(keys).not.toContain('generate')
    })
  })

  // ⚠️ NO ACTIVITY-LOG ENTRY, and this is a decision with a reason.
  // `activity_log.action` is CHECK-constrained to a fixed vocabulary
  // (migration 016) that has no 'generated', 'previewed' or 'printed'
  // value, and `stamp_activity_actor` gates who may write each one.
  // Adding one means a migration plus a trigger change -- out of scope
  // for a prototype whose templates are not the barangay's own. Opening
  // a print dialog is also not a business event: ten previews of one
  // request are not ten things that happened.
  it('files no activity-log entry for a preview or a print', () => {
    const preview = read('documents/DocumentPreview.jsx')
    expect(preview).not.toContain('logActivity')
  })
})
