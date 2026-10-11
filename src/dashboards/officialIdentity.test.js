// How the Official Portal decides WHO THE SIGNED-IN OFFICIAL IS.
//
// ⚠️ MASTER-A A5. Until this phase the answer was a string: the
// dashboard asked `barangay_officials` for the row whose `full_name`
// equalled `profiles.full_name`. Migrations 031 and 032 had already
// taken that join out of every database permission and out of the
// self-archive guard, so the frontend was the last place in the running
// system where an official's identity depended on two tables spelling
// their name identically — and it is the whole reason the Full Name
// field had to stay read-only through A3 and A4.
//
// ⚠️ THESE ARE SOURCE-READING TESTS, and that is a limitation worth
// stating rather than hiding. `OfficialDashboard.jsx` is ~5,000 lines,
// imports the Supabase client and `AuthContext`, and renders twelve
// tabs; standing all of that up in Jest would be testing the harness.
// What these pin is the wiring — which call resolves identity, what it
// is keyed on, and that the old key is gone — in the same way
// `documentPermissions.test.js` pins `canGenerate`'s one call site.
// The behaviour itself is proven by role impersonation in SQL, recorded
// in migration 033's header.
//
// Each load-bearing assertion is run BOTH DIRECTIONS: the new key must
// be present AND the old key must be absent. A test that only checks
// the new one passes just as happily on a file that kept both.

import fs from 'fs'
import path from 'path'

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const OFFICIAL = read('dashboards/OfficialDashboard.jsx')
const SIDEBAR = read('components/Sidebar.jsx')

// `fetchUserInfo`, from its declaration to the next top-level handler.
const IDENTITY = OFFICIAL.slice(
  OFFICIAL.indexOf('const fetchUserInfo = async (userId) => {'),
  OFFICIAL.indexOf('const handleAvatarChange'),
)

// Executable lines only — the comments above this function explain the
// name join at length, and a scan that counted those would report the
// very thing the change removed.
const codeOnly = (block) => block
  .split('\n')
  .filter((line) => {
    const t = line.trim()
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .join('\n')

const IDENTITY_CODE = codeOnly(IDENTITY)

describe('the current official is resolved through the stable mapping', () => {
  it('slices a real function rather than an empty string', () => {
    expect(IDENTITY.length).toBeGreaterThan(200)
    expect(IDENTITY_CODE).toContain('const fetchUserInfo')
  })

  // ⚠️ THE LOAD-BEARING ONE.
  it('asks the database who the caller is, by RPC', () => {
    expect(IDENTITY_CODE).toContain("supabase\n      .rpc('official_id_for_current_user')")
  })

  it('fetches the directory row by PRIMARY KEY', () => {
    expect(IDENTITY_CODE).toContain(".eq('id', officialId)")
  })

  // The other direction: the old key must be gone, not merely joined.
  //
  // ⚠️ TWO SCOPING CORRECTIONS, both made because the first versions of
  // this test failed for the wrong reason — the project's own rule about
  // asking which step produced a result.
  //
  // 1. It scanned the whole file and tripped over the COMMENT above
  //    `fetchUserInfo`, which quotes the expression it is explaining the
  //    removal of. Same trap `prototypeCoverage.test.js` records: a
  //    whole-file scan flags the disclaimer for containing the words it
  //    exists to disclaim. So the file scan is over executable lines.
  // 2. It banned `full_name` from the identity block outright, and the
  //    block legitimately SELECTS it — the greeting and the avatar need
  //    the official's name. The thing that must be gone is the name as a
  //    KEY or a COMPARISON, not the name as display data.
  it('uses no name as a lookup key or a comparison', () => {
    // The only occurrence is the profile select, which is display data.
    expect(IDENTITY_CODE.match(/full_name/g)).toHaveLength(1)
    expect(IDENTITY_CODE).toContain("select('full_name, role')")
    // And it is never a key or a comparison.
    expect(IDENTITY_CODE).not.toMatch(/\.eq\(\s*'full_name'/)
    expect(IDENTITY_CODE).not.toMatch(/full_name\s*===/)
    expect(IDENTITY_CODE).not.toMatch(/===\s*[\w.?]*full_name/)

    const CODE = codeOnly(OFFICIAL)
    expect(CODE).not.toContain(".eq('full_name', profile.full_name)")
    expect(CODE).not.toContain(".eq('full_name', userProfile.full_name)")
  })

  // ⚠️ A fallback is how the old behaviour comes back while the code
  // still LOOKS id-based. There must not be one.
  it('has no name fallback when the helper returns nothing', () => {
    expect(IDENTITY_CODE).not.toMatch(/\|\|.*full_name/)
    expect(IDENTITY_CODE).not.toMatch(/full_name.*\?\?/)
  })

  it('still reads the profile, but only for display', () => {
    // The greeting and the avatar need the name; nothing compares it.
    expect(IDENTITY_CODE).toContain("select('full_name, role')")
    expect(IDENTITY_CODE).toContain('setUserProfile(profile)')
  })

  // ⚠️ The client must never read the mapping itself. It holds no
  // privilege on that table (030) and adding one would publish which
  // auth account belongs to which named person.
  it('never queries official_account_links from the client', () => {
    const src = ['dashboards/OfficialDashboard.jsx', 'dashboards/NurseDashboard.jsx',
      'dashboards/ResidentDashboard.jsx', 'components/Sidebar.jsx',
      'pages/Officials.jsx', 'context/AuthContext.jsx']
    src.forEach((file) => {
      expect(read(file)).not.toContain("from('official_account_links')")
    })
  })
})

describe('it fails closed', () => {
  it('clears officialInfo when the helper returns NULL', () => {
    expect(IDENTITY_CODE).toContain('if (!officialId)')
    expect(IDENTITY_CODE).toContain("setIdentityProblem('unlinked')")
  })

  it('clears officialInfo when the RPC itself errors', () => {
    expect(IDENTITY_CODE).toContain('if (identityError)')
    expect(IDENTITY_CODE).toContain("setIdentityProblem('error')")
  })

  // Both refusal paths must null the row, not leave a stale one.
  it('sets officialInfo to null on every refusal path, and never to a guess', () => {
    const nulls = IDENTITY_CODE.match(/setOfficialInfo\(null\)/g) || []
    expect(nulls.length).toBeGreaterThanOrEqual(3)
    expect(IDENTITY_CODE).toContain('setOfficialInfo(official)')
    // exactly one assignment of a real row, and it is the resolved one
    expect(IDENTITY_CODE.match(/setOfficialInfo\((?!null)/g)).toHaveLength(1)
  })

  it('returns early rather than falling through to the row fetch', () => {
    const beforeFetch = IDENTITY_CODE.slice(0, IDENTITY_CODE.indexOf(".eq('id', officialId)"))
    expect((beforeFetch.match(/\breturn\b/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('isOwnOfficialRecord uses the stable id', () => {
  const OWN = OFFICIAL.slice(
    OFFICIAL.indexOf('const isOwnOfficialRecord'),
    OFFICIAL.indexOf('const handleArchiveOfficial'),
  )

  it('compares ids', () => {
    expect(OWN).toContain('official?.id === officialInfo.id')
  })

  // The other direction.
  it('compares no names at all', () => {
    expect(codeOnly(OWN)).not.toContain('full_name')
  })

  // ⚠️ An unlinked official has no identity, so no row is "their own" —
  // and migration 032 refuses them the archive outright anyway.
  it('requires a resolved official id', () => {
    expect(OWN).toContain('Boolean(officialInfo?.id)')
  })
})

describe('the position flags still derive from the ID-resolved row', () => {
  // ⚠️ These are PRESENTATION. The database decides; migration 031's
  // `current_official_holds_position()` is what actually refuses a
  // write. What matters here is that the row they read was obtained by
  // id, which the tests above establish.
  it('reads officialInfo.position and nothing else', () => {
    expect(OFFICIAL).toContain("const isKapitan = officialInfo?.position === 'Punong Barangay'")
    expect(OFFICIAL).toContain("const isTreasurer = officialInfo?.position === 'Barangay Treasurer'")
    expect(OFFICIAL).toContain("const isSecretary = officialInfo?.position === 'Barangay Secretary'")
  })

  it('does not derive any of them from a name', () => {
    ;['isKapitan', 'isTreasurer', 'isSecretary'].forEach((flag) => {
      const at = OFFICIAL.indexOf(`const ${flag} = `)
      expect(at).toBeGreaterThan(-1)
      const line = OFFICIAL.slice(at, OFFICIAL.indexOf('\n', at))
      expect(line).not.toContain('full_name')
    })
  })
})

describe('the sidebar resolves the official the same way', () => {
  const DRAWER = SIDEBAR.slice(
    SIDEBAR.indexOf("if (role === 'official') {"),
    SIDEBAR.indexOf("} else if (role === 'nurse')"),
  )

  it('uses the RPC and the primary key', () => {
    expect(codeOnly(DRAWER)).toContain("rpc('official_id_for_current_user')")
    expect(codeOnly(DRAWER)).toContain(".eq('id', officialId)")
  })

  // The other direction, scoped to code for the reason above — this
  // file's own comment quotes the expression it removed.
  it('no longer looks the row up by name', () => {
    expect(codeOnly(DRAWER)).not.toContain('full_name')
    expect(codeOnly(SIDEBAR)).not.toContain(".eq('full_name', profile.full_name)")
  })

  it('still falls back to the generic label rather than erroring', () => {
    expect(DRAWER).toContain("setProfilePosition('Barangay Official')")
  })
})

describe("the unlinked account is explained, not reported as a generic failure", () => {
  const ARCHIVE = OFFICIAL.slice(
    OFFICIAL.indexOf('const handleArchiveOfficial'),
    OFFICIAL.indexOf('const handleRestoreOfficial'),
  )

  // ⚠️ Migration 032 refuses an unlinked official the archive. A4
  // recorded this message falling through to `Failed to archive
  // official!` and left it for A5, which is editing this handler anyway.
  it('has its own branch for migration 032 fail-closed refusal', () => {
    expect(ARCHIVE).toContain('/not linked to a directory record/i')
    expect(ARCHIVE).toContain('not linked to an active directory identity')
  })

  it('keeps the existing self-archive message handling', () => {
    expect(ARCHIVE).toContain('/archive their own/i')
    expect(ARCHIVE).toContain('You cannot archive your own record')
  })

  it('still has a generic fallback rather than swallowing other errors', () => {
    expect(ARCHIVE).toContain("toast.error('Failed to archive official!')")
  })

  // ⚠️ The database's own sentence names a table. A user-facing message
  // must not.
  it('names no table or column to the user', () => {
    const shown = ARCHIVE.match(/toast\.error\('[^']*'\)/g).join(' ')
    ;['official_account_links', 'barangay_officials', 'profiles',
      'full_name', 'official_id', 'profile_id'].forEach((internal) => {
      expect(shown).not.toContain(internal)
    })
  })

  // The consultation-hours card is the other surface that genuinely
  // needs a directory row, and it used to blame mismatched spellings.
  it('no longer tells an official to go and compare two names', () => {
    const CARD = OFFICIAL.slice(
      OFFICIAL.indexOf('My Consultation Hours'),
      OFFICIAL.indexOf('My Consultation Hours') + 4000,
    )
    expect(CARD).toContain('not linked to an active directory')
    expect(CARD).not.toContain('are not identical')
    expect(CARD).not.toContain('check both')
  })
})
