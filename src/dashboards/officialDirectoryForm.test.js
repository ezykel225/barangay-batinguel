// The Officials Directory form, and the database rule behind it.
//
// ⚠️ THESE DO NOT PROVE THE SECURITY PROPERTY. Migration 028's guard is
// a database trigger, and the only thing that can prove a trigger is
// SQL. The escalation was reproduced, and its closure verified, by
// impersonating a real Kagawad with `SET LOCAL ROLE authenticated` in
// transactions that were always rolled back; those results are in
// `supabase-migrations/028_protect_official_position.sql`'s header.
//
// What these DO pin is the half Jest can see: that the form stopped
// offering a control the database now refuses, that it still shows the
// value, that ordinary edits were not collateral damage, and that the
// three positions the migration's unique index names are the same three
// the dashboard treats as powered -- the same kind of cross-check
// `officialAvailability.test.js` runs against migration 026.

import fs from 'fs'
import path from 'path'

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const OFFICIAL = read('dashboards/OfficialDashboard.jsx')
const migration = (file) => fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase-migrations', file), 'utf8')
const MIGRATION = migration('028_protect_official_position.sql')
const MIGRATION_029 = migration('029_protect_official_identity_fields.sql')
const MIGRATION_033 = migration('033_restore_official_name_editing.sql')

// The Add/Edit modal, sliced from its heading to its buttons.
const MODAL = OFFICIAL.slice(
  OFFICIAL.indexOf('{showOfficialModal && ('),
  OFFICIAL.indexOf('</div>', OFFICIAL.indexOf('{submitting ? \'Saving...\' : editingOfficial')),
)

// The EDIT branch of a read-only field group: between that group's
// `{editingOfficial ? (` and its `) : (`. Anchored on the group's own
// label id rather than on order or indentation.
//
// ⚠️ THERE IS ONLY ONE SUCH GROUP SINCE A5. Full Name had one too while
// migration 029 held; migration 033 handed that field back, so Position
// is the only field this form shows and refuses to edit.
const editBranchFor = (labelId) => {
  const at = MODAL.lastIndexOf('{editingOfficial ? (', MODAL.indexOf(`id="${labelId}"`))
  expect(at).toBeGreaterThan(-1)
  return MODAL.slice(at, MODAL.indexOf(') : (', at))
}
const POSITION_BLOCK = editBranchFor('off-position-label')

const editPayload = () => {
  const at = OFFICIAL.indexOf('.update({', OFFICIAL.indexOf("if (editingOfficial) {"))
  return OFFICIAL.slice(at, OFFICIAL.indexOf('})', at))
}

const insertPayload = () => {
  // Scoped to the directory's own insert -- the dashboard inserts into
  // several tables and the first `.insert([{` in the file is not this one.
  const from = OFFICIAL.indexOf("from('barangay_officials')",
    OFFICIAL.indexOf('} else {', OFFICIAL.indexOf('if (editingOfficial) {')))
  const at = OFFICIAL.indexOf('.insert([{', from)
  return OFFICIAL.slice(at, OFFICIAL.indexOf('}]', at))
}

describe('Edit Official no longer offers an editable Position', () => {
  // ⚠️ THE LOAD-BEARING ONE. Until migration 028 this select was
  // rendered for an edit too, and saving it rewrote `position` -- the
  // column both the Secretary and Treasurer RLS policies read.
  it('renders the position select only when ADDING', () => {
    const select = MODAL.indexOf('<select id="off-position"')
    const addBranch = MODAL.indexOf(') : (')
    expect(select).toBeGreaterThan(-1)
    expect(addBranch).toBeGreaterThan(-1)
    // The select sits AFTER the `) : (`, i.e. in the add branch.
    expect(select).toBeGreaterThan(addBranch)
  })

  it('has exactly one position select in the whole dashboard', () => {
    expect(OFFICIAL.match(/<select id="off-position"/g)).toHaveLength(1)
  })

  // ⚠️ Not `disabled`. A disabled control still announces a control,
  // and still implies the restriction belongs to the form.
  it('does not ship a disabled position control instead', () => {
    expect(POSITION_BLOCK).not.toMatch(/<select/)
    expect(POSITION_BLOCK).not.toMatch(/<input/)
    expect(POSITION_BLOCK).not.toMatch(/disabled/)
    expect(POSITION_BLOCK).not.toMatch(/readOnly/)
  })

  it('still SHOWS the position when editing', () => {
    expect(POSITION_BLOCK).toContain('newOfficial.position')
    expect(POSITION_BLOCK).toContain('Position')
    expect(POSITION_BLOCK).toContain('modal-form-static')
  })

  // The label is a <span> with an id, not a <label htmlFor>, because
  // there is no form control for it to point at. It still names the
  // value through aria-labelledby.
  it('associates the shown value with its label', () => {
    expect(POSITION_BLOCK).toContain('id="off-position-label"')
    expect(POSITION_BLOCK).toContain('aria-labelledby="off-position-label"')
    expect(POSITION_BLOCK).not.toContain('htmlFor="off-position"')
  })
})

// ─── A5: Full Name is editable again — migration 033 ────────────────
//
// ⚠️ THIS DESCRIBE BLOCK IS THE INVERSE OF THE ONE IT REPLACES, and the
// reversal is the point of the phase rather than a change of mind. Its
// predecessor asserted that the Edit branch shipped NO name control,
// because a name was an authorization key: measured before migration
// 029, a Kagawad could rename their own row, archive the real
// Secretary, insert a new row under their own profile name as
// Secretary, and then approve a document request.
//
// Three migrations and one frontend cutover later a name decides
// nothing: 031 moved every database permission onto the private
// `official_account_links` mapping, 032 moved the self-archive guard,
// and A5 moved this dashboard's own `officialInfo` and
// `isOwnOfficialRecord` — proven with 029's guard still active, and
// only then did 033 remove it. `officialIdentity.test.js` holds that
// half.
describe('Edit Official offers an editable Full Name again', () => {
  it('renders one name input, for Add and for Edit alike', () => {
    expect(MODAL).toContain('<input id="off-full-name"')
    // ⚠️ NOT inside an `editingOfficial` ternary any more. The old
    // version asserted the input sat after a `) : (` — i.e. in the add
    // branch only — and that is exactly what must no longer be true.
    const nameAt = MODAL.indexOf('<input id="off-full-name"')
    const nameGroupAt = MODAL.lastIndexOf('<div className="modal-form-group">', nameAt)
    expect(MODAL.slice(nameGroupAt, nameAt)).not.toContain('editingOfficial')
  })

  it('has exactly one name input in the whole dashboard', () => {
    expect(OFFICIAL.match(/<input id="off-full-name"/g)).toHaveLength(1)
  })

  it('is a real control, bound to the form state', () => {
    const at = MODAL.indexOf('<input id="off-full-name"')
    const input = MODAL.slice(at, MODAL.indexOf('/>', at))
    expect(input).toContain('value={newOfficial.full_name}')
    expect(input).toContain('full_name: e.target.value')
    expect(input).not.toContain('disabled')
    expect(input).not.toContain('readOnly')
  })

  it('is labelled by a real <label htmlFor>, not an aria-labelledby span', () => {
    expect(MODAL).toContain('<label htmlFor="off-full-name" className="modal-form-label">Full Name</label>')
    expect(MODAL).not.toContain('id="off-full-name-label"')
  })

  // The value an Edit starts from is still the stored directory name.
  it('opens an edit with the existing directory name', () => {
    const openEdit = OFFICIAL.slice(OFFICIAL.indexOf('const handleEditOfficial'),
      OFFICIAL.indexOf('const handleEditOfficial') + 600)
    expect(openEdit).toContain('full_name: official.full_name')
  })

  it('still requires a name before saving', () => {
    expect(OFFICIAL).toContain('if (!newOfficial.full_name || !newOfficial.position)')
  })

  // ⚠️ THE PORTRAIT GUARD IS REACHABLE AGAIN, which is the one real
  // consequence of handing the field back. It was kept across 029, 031
  // and 032 for exactly this moment.
  it('warns before a rename that would lose a bundled portrait', () => {
    const SAVE = OFFICIAL.slice(OFFICIAL.indexOf('const handleAddOfficial'),
      OFFICIAL.indexOf('const handleEditOfficial'))
    expect(SAVE).toContain('portraitWillBeLost(')
    expect(SAVE).toContain('editingOfficial.full_name')
    expect(SAVE).toContain('newOfficial.full_name')
    expect(SAVE).toContain('editingOfficial.photo_url')
    // It WARNS: a confirm the official can decline, not a refusal.
    expect(SAVE).toContain("confirmLabel: 'Rename anyway'")
    expect(SAVE).toContain("cancelLabel: 'Keep the name'")
    expect(SAVE).toContain('if (!proceedWithRename) return')
  })

  // The other direction: the comment that said it could never fire is
  // gone, so a reader cannot conclude the guard is still dead code.
  it('no longer claims the portrait guard is unreachable', () => {
    expect(OFFICIAL).not.toContain('UNREACHABLE WHILE MIGRATION 029 HOLDS')
  })

  // ⚠️ Position lost its only explanation when the shared hint went
  // with the name block. A read-only field with no reason beside it
  // reads as something broken.
  it('still says why Position cannot be edited', () => {
    expect(POSITION_BLOCK).toContain('modal-form-hint')
    expect(POSITION_BLOCK.toLowerCase()).toContain('database')
  })
})

// ─── A1b: the Add form cannot assign a powered position ──────────────
describe('Add Official cannot create a powered position', () => {
  const POWERED = ['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer']

  it('offers only the non-powered positions', () => {
    expect(OFFICIAL).toContain(
      "const CLIENT_ASSIGNABLE_POSITIONS = ['Kagawad', 'SK Chairperson']")
    expect(OFFICIAL).toContain('CLIENT_ASSIGNABLE_POSITIONS.map(')
  })

  // ⚠️ Omitted, not disabled: migration 029 refuses an API INSERT
  // naming any of them, so a disabled option would advertise a control
  // the database turns down.
  it('does not render the powered positions as options at all', () => {
    const select = MODAL.slice(MODAL.indexOf('<select id="off-position"'),
      MODAL.indexOf('</select>'))
    POWERED.forEach((p) => expect(select).not.toContain(p))
  })

  it('still says where they are assigned', () => {
    const after = MODAL.slice(MODAL.indexOf('</select>'))
    expect(after).toContain('POWERED_POSITIONS.join')
    expect(after.toLowerCase()).toContain('database')
  })

  // The frontend list and the database's list must be the same three.
  it('names the same three the migration and the gates do', () => {
    expect(OFFICIAL).toContain(
      "const POWERED_POSITIONS = ['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer']")
    POWERED.forEach((p) => expect(MIGRATION_029).toContain(`'${p}'`))
  })
})

describe('the payloads', () => {
  it('does not send position on an edit', () => {
    expect(editPayload()).not.toContain('position:')
  })

  // ⚠️ INVERTED AT A5. 029 took `full_name` out of this payload; 033
  // put it back, and the asymmetry with `position` directly above is
  // the whole of MASTER-A in one object: a name is description, so the
  // form owns it; a position is what the powered permissions read, so
  // the database owns it.
  it('sends full_name on an edit again', () => {
    expect(editPayload()).toContain('full_name: newOfficial.full_name')
  })

  // ⚠️ And it does NOT write the account's own name. Identity is the
  // private mapping, so the two names are separate facts and this form
  // is not in the business of keeping them in step.
  it('does not write profiles.full_name when the directory name changes', () => {
    const SAVE = OFFICIAL.slice(OFFICIAL.indexOf('const handleAddOfficial'),
      OFFICIAL.indexOf('const handleEditOfficial'))
    expect(SAVE).not.toContain("from('profiles')")
  })

  // Everything the form legitimately edits still goes.
  it('still sends every other editable field on an edit', () => {
    const p = editPayload()
    ;['committee:', 'contact_number:', 'display_order:', 'updated_by:']
      .forEach((field) => expect(p).toContain(field))
  })

  // ⚠️ ADD still sends a name, and must — a new row has to have one.
  it('still sends full_name on an ADD', () => {
    expect(insertPayload()).toContain('full_name: newOfficial.full_name')
  })

  // ⚠️ ADD still sets a position, and must. A new directory row has to
  // say what the person does. Migration 028's trigger is BEFORE UPDATE
  // only, so an insert is untouched -- and the two partial unique
  // indexes are what stop an insert being an escalation instead: a
  // second active row with the caller's own name is refused by
  // `one_active_per_name`, and a second active Secretary by
  // `one_active_per_powered_position`.
  it('still sends position on an ADD', () => {
    expect(insertPayload()).toContain('position: newOfficial.position')
  })

  it('leaves archive and restore exactly as they were', () => {
    expect(OFFICIAL).toContain(".update({ archived_at: new Date().toISOString() })")
    expect(OFFICIAL).toContain(".update({ archived_at: null, display_order: chosenOrder })")
    // The self-archive guard and its explanatory note are untouched.
    expect(OFFICIAL).toContain('isOwnOfficialRecord(official)')
    expect(OFFICIAL).toContain('Your own record — another official must archive it')
  })

  it('does not write created_at or created_by on an edit', () => {
    const p = editPayload()
    expect(p).not.toContain('created_at')
    expect(p).not.toContain('created_by')
  })
})

describe('migration 028 and the dashboard agree on which positions carry power', () => {
  // The unique index names three positions. Those must be exactly the
  // three the dashboard gates on -- if a fourth powered position is ever
  // added to one and not the other, this fails in Jest rather than
  // leaving a seat nobody is holding uniquely.
  const POWERED = ['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer']

  it('the index covers the three powered positions and no others', () => {
    const idx = MIGRATION.slice(MIGRATION.indexOf('one_active_per_powered_position'))
    POWERED.forEach((p) => expect(idx).toContain(`'${p}'`))
    expect(idx).not.toContain("'Kagawad'")
    expect(idx).not.toContain("'SK Chairperson'")
  })

  it('and only ACTIVE rows participate', () => {
    const idx = MIGRATION.slice(MIGRATION.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS barangay_officials_one_active'))
    expect(idx).toContain('WHERE archived_at IS NULL')
  })

  it('the dashboard gates on those same three strings', () => {
    expect(OFFICIAL).toContain("officialInfo?.position === 'Punong Barangay'")
    expect(OFFICIAL).toContain("officialInfo?.position === 'Barangay Treasurer'")
    expect(OFFICIAL).toContain("officialInfo?.position === 'Barangay Secretary'")
  })
})

describe('the migration says what it does and does not fix', () => {
  it('rejects a position change for an API caller', () => {
    expect(MIGRATION).toContain('NEW.position IS DISTINCT FROM OLD.position')
    expect(MIGRATION).toContain('BEFORE UPDATE ON public.barangay_officials')
  })

  // ⚠️ `IS DISTINCT FROM`, not a blanket refusal: a form that re-submits
  // the same value must still save.
  it('does not reject an unchanged position', () => {
    expect(MIGRATION).not.toMatch(/NEW\.position IS NOT NULL\s+THEN\s+RAISE/)
    expect(MIGRATION).toContain('IS DISTINCT FROM')
  })

  // The trusted-caller test was measured, not copied -- and it is the
  // same one `protect_document_request_status` already uses.
  it('trusts only direct SQL and service_role', () => {
    expect(MIGRATION).toContain("auth.role() IS NULL OR auth.role() = 'service_role'")
  })

  it('also pins the creation columns', () => {
    expect(MIGRATION).toContain('NEW.created_at IS DISTINCT FROM OLD.created_at')
    expect(MIGRATION).toContain('NEW.created_by IS DISTINCT FROM OLD.created_by')
  })

  // ⚠️ A1 was a hotfix, not the end of MASTER-A, and 028's header had
  // to say so. It still says so, in the present tense of ITS OWN DAY —
  // which is now historical: 031 moved authorization onto the mapping.
  // The sentence is deliberately NOT edited. A migration header is a
  // record of what was true when it ran, the same reason the five
  // `activity_log` rows from 2026-10-01 still carry a name that was
  // later corrected. This test pins the record, not the present.
  it("028's header still records what was true on ITS day", () => {
    expect(MIGRATION).toContain('official_account_links')
    expect(MIGRATION).toMatch(/still resolves through the `full_name` string join/i)
  })

  it('does not touch the identity helpers or the kapitan policies', () => {
    ;['official_id_for_current_user', 'can_see_audience', 'kapitan_status']
      .forEach((name) => {
        // named only in the prose that says they are NOT changed
        expect(MIGRATION.indexOf(name)).toBeGreaterThan(-1)
      })
    expect(MIGRATION).not.toContain('CREATE POLICY')
    expect(MIGRATION).not.toContain('DROP POLICY')
    expect(MIGRATION).not.toContain('CREATE TABLE')
  })
})

// ─── migration 033 removed ONE branch, and only that one ─────────────
describe('migration 033 narrows protect_official_record and nothing else', () => {
  it('still refuses a position change for an API caller', () => {
    expect(MIGRATION_033).toContain('NEW.position IS DISTINCT FROM OLD.position')
  })

  it('still refuses an API INSERT naming a powered position', () => {
    expect(MIGRATION_033).toContain("IF TG_OP = 'INSERT' THEN")
    expect(MIGRATION_033).toContain('NEW.position = ANY (powered)')
    ;['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer']
      .forEach((p) => expect(MIGRATION_033).toContain(`'${p}'`))
  })

  it('still pins the creation columns', () => {
    expect(MIGRATION_033).toContain('NEW.created_at IS DISTINCT FROM OLD.created_at')
    expect(MIGRATION_033).toContain('NEW.created_by IS DISTINCT FROM OLD.created_by')
  })

  it('keeps the same trusted-caller test', () => {
    expect(MIGRATION_033).toContain("auth.role() IS NULL OR auth.role() = 'service_role'")
  })

  // ⚠️ THE LOAD-BEARING ONE, and it is scoped to the function body.
  // The header above it explains the removal at length and necessarily
  // quotes `full_name` while doing so — the same trap
  // `prototypeCoverage.test.js` records, where a whole-file scan flags
  // the disclaimer for containing the words it exists to disclaim.
  it('no longer refuses a full_name change', () => {
    const body = MIGRATION_033.slice(
      MIGRATION_033.indexOf('AS $function$'),
      MIGRATION_033.indexOf('$function$;'),
    )
    expect(body.length).toBeGreaterThan(400)
    expect(body).not.toContain('NEW.full_name IS DISTINCT FROM OLD.full_name')
  })

  // ⚠️ Matched against the UNWRAPPED prose. A migration header is hard
  // wrapped at ~70 columns with a `-- ` on every line, so a phrase that
  // reads as one sentence can carry a newline and a comment marker in
  // the middle of it. The first version of this test looked for
  // "no longer authorization data" against the raw file and failed on
  // text that says exactly that — which step produced the result,
  // again.
  const prose = (sql) => sql
    .split('\n')
    .map((line) => line.replace(/^\s*--\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')

  it('and says a name is description now, not authorization data', () => {
    expect(prose(MIGRATION_033)).toMatch(/no longer authorization data/i)
  })

  // ⚠️ It must not quietly start writing the account's own name.
  it('does not synchronise profiles.full_name', () => {
    const body = MIGRATION_033.slice(
      MIGRATION_033.indexOf('AS $function$'),
      MIGRATION_033.indexOf('$function$;'),
    )
    expect(body).not.toContain('public.profiles')
    expect(prose(MIGRATION_033)).toMatch(/DOES NOT SYNCHRONISE THE TWO NAMES/i)
  })
})
