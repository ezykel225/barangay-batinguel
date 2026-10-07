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

// The Add/Edit modal, sliced from its heading to its buttons.
const MODAL = OFFICIAL.slice(
  OFFICIAL.indexOf('{showOfficialModal && ('),
  OFFICIAL.indexOf('</div>', OFFICIAL.indexOf('{submitting ? \'Saving...\' : editingOfficial')),
)

// The EDIT branch of a read-only field group: between that group's
// `{editingOfficial ? (` and its `) : (`. Anchored on the group's own
// label id rather than on order or indentation, because there are now
// two such groups and reformatting the JSX must not silently empty one.
const editBranchFor = (labelId) => {
  const at = MODAL.lastIndexOf('{editingOfficial ? (', MODAL.indexOf(`id="${labelId}"`))
  expect(at).toBeGreaterThan(-1)
  return MODAL.slice(at, MODAL.indexOf(') : (', at))
}
const POSITION_BLOCK = editBranchFor('off-position-label')
const NAME_BLOCK = editBranchFor('off-full-name-label')

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

// ─── A1b: Full Name is read-only too, TEMPORARILY ────────────────────
//
// ⚠️ Not because names should be un-editable, but because a name is
// still an authorization key. Measured before migration 029: a Kagawad
// could rename their own row, archive the real Secretary, insert a new
// row under their own profile name as Secretary, and then approve a
// document request. Three steps, all through this form.
describe('Edit Official no longer offers an editable Full Name', () => {
  it('renders the name input only when ADDING', () => {
    const input = MODAL.indexOf('<input id="off-full-name"')
    expect(input).toBeGreaterThan(-1)
    // It sits after the name ternary's `) : (`, i.e. in the add branch.
    expect(input).toBeGreaterThan(MODAL.indexOf(') : (', MODAL.indexOf('off-full-name-label')))
  })

  it('has exactly one name input in the whole dashboard', () => {
    expect(OFFICIAL.match(/<input id="off-full-name"/g)).toHaveLength(1)
  })

  it('does not ship a disabled name control instead', () => {
    expect(NAME_BLOCK).not.toMatch(/<input/)
    expect(NAME_BLOCK).not.toMatch(/disabled/)
    expect(NAME_BLOCK).not.toMatch(/readOnly/)
  })

  it('still SHOWS the name when editing, and says where it is maintained', () => {
    expect(NAME_BLOCK).toContain('newOfficial.full_name')
    expect(NAME_BLOCK).toContain('modal-form-static')
    expect(NAME_BLOCK).toContain('modal-form-hint')
    expect(NAME_BLOCK.toLowerCase()).toContain('database')
  })

  it('associates the shown name with its label', () => {
    expect(NAME_BLOCK).toContain('id="off-full-name-label"')
    expect(NAME_BLOCK).toContain('aria-labelledby="off-full-name-label"')
  })

  // ⚠️ The reason has to stay written down, or A3 will not know to
  // undo it and the field will be read-only forever.
  it('records that this is TEMPORARY and names what restores it', () => {
    const prose = MODAL.slice(MODAL.indexOf('FULL NAME IS READ-ONLY'), MODAL.indexOf('off-full-name-label'))
    expect(prose).toMatch(/TEMPORARY/i)
    expect(prose).toContain('A3')
    expect(prose).toContain('official_account_links')
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

  // ⚠️ `full_name` is gone from the edit payload too (029), and the
  // comment has to say it comes back at A3.
  it('does not send full_name on an edit', () => {
    expect(editPayload()).not.toContain('full_name:')
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

  // ⚠️ A1 is a hotfix, not the end of MASTER-A. The header has to keep
  // saying so, or the next reader assumes the identity work is done.
  it('records that full_name is STILL the authorization key', () => {
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
