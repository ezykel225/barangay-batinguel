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
const MIGRATION = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase-migrations', '028_protect_official_position.sql'),
  'utf8',
)

// The Add/Edit modal, sliced from its heading to its buttons.
const MODAL = OFFICIAL.slice(
  OFFICIAL.indexOf('{showOfficialModal && ('),
  OFFICIAL.indexOf('</div>', OFFICIAL.indexOf('{submitting ? \'Saving...\' : editingOfficial')),
)

// The EDIT branch of the Position group: between the ternary's `?` and
// its `) : (`. Sliced on the ternary itself rather than on indentation,
// so reformatting the JSX cannot silently empty it.
const TERNARY_AT = MODAL.indexOf('{editingOfficial ? (')
const POSITION_BLOCK = MODAL.slice(TERNARY_AT, MODAL.indexOf(') : (', TERNARY_AT))

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

  // An unexplained read-only field reads as something broken.
  it('says where the value is maintained instead', () => {
    expect(POSITION_BLOCK).toContain('modal-form-hint')
    expect(POSITION_BLOCK.toLowerCase()).toContain('database')
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

describe('the payloads', () => {
  it('does not send position on an edit', () => {
    expect(editPayload()).not.toContain('position:')
  })

  // Everything else the form legitimately edits still goes.
  it('still sends every other editable field on an edit', () => {
    const p = editPayload()
    ;['full_name:', 'committee:', 'contact_number:', 'display_order:', 'updated_by:']
      .forEach((field) => expect(p).toContain(field))
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
