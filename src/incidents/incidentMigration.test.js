// Combined Phase 2 — source-reading guards over migration 044.
//
// ⚠️ THESE DO NOT PROVE THE SECURITY PROPERTY. A position gate is a function
// running in PostgreSQL and only SQL can prove it; the role-impersonation
// matrix lives in this phase's report. What is pinned here is the SHAPE a scan
// can see -- that the forbidden things are absent and the required things are
// present, so a later edit that reaches for one fails in Jest rather than on
// a live database.

import fs from 'fs'
import path from 'path'

const DIR = path.join(__dirname, '..', '..', 'supabase-migrations')
const FILE = '044_incident_blotter_tanod.sql'
const raw = fs.readFileSync(path.join(DIR, FILE), 'utf8')

// ⚠️ COMMENT-STRIPPED, AND THAT IS LOAD-BEARING HERE. This migration discusses
// `committee`, `full_name`, purok, GPS and the Tanod role at length precisely
// to record that NONE of them is used -- so a scan over the raw file would
// report every one of them as a hit. The same trap P3-A recorded.
const code = raw.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
const lower = code.toLowerCase()

// ⚠️ The SQL is COLUMN-ALIGNED for reading, so `alter table public.incidents`
// is followed by padding while `blotter_entry_history` -- the longest name --
// gets one space. A literal `toContain` therefore passed for one table and
// failed for five, which looked like five missing statements and was my own
// whitespace. `squish` collapses runs of spaces so an assertion is about the
// statement rather than about how it is laid out. The same reason A5 added a
// `prose()` helper when a regex met hard-wrapped SQL.
const squish = (value) => value.replace(/[ \t]+/g, ' ')
const flat = squish(code)

describe('A. the migration file', () => {
  // ⚠️ The PR #45 blocker fix added 046, so the "nothing past it" half
  // moves to 050 after Tanod editing (047), type ties (048), and public type buckets (049).
  // -- the guard's force is that a phase cannot quietly reach for a second
  // migration, and that still holds. A definition change at its own site,
  // not a loosened assertion.
  it('is still 044, still in place, with only the expected later migrations', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    // ⚠️ REDEFINED, not loosened: an exact total stopped being stable once the
    // reviewed 061-064 migrations landed on separate stacked PR branches (a branch
    // can hold 060, 063 and 064 but not yet 061-062). The guard's purpose -- no
    // phase may quietly add an unreviewed migration, and 001-060 stay in place --
    // is kept by an ALLOWLIST: 001-060 are present in order, every number is
    // unique, and anything after 060 must be one of the reviewed files below.
    const reviewedLater = ['061_person_matter_linking.sql', '062_analytics_insights.sql',
      '063_retire_legacy_module_access.sql', '064_legacy_data_cleanup.sql']
    expect(files.slice(0, 60).map((f) => f.slice(0, 3)))
      .toEqual(Array.from({ length: 60 }, (_, i) => String(i + 1).padStart(3, '0')))
    expect(files.slice(60).filter((f) => !reviewedLater.includes(f))).toEqual([])
    expect(new Set(files.map((f) => f.slice(0, 3))).size).toBe(files.length)
    expect(files[43]).toBe(FILE)
    expect(files[44]).toBe('045_public_safety_aggregates.sql')
    expect(files[45]).toBe('046_kp_conclude_case.sql')
    expect(files[46]).toBe('047_edit_tanod_member.sql')
    expect(files[47]).toBe('048_location_type_ties.sql')
    expect(files[48]).toBe('049_public_zone_type_counts.sql')
    expect(files[49]).toBe('050_case_evidence_support.sql')
    expect(files[50]).toBe('051_case_review_support.sql')
    expect(files[51]).toBe('052_tanod_accounts_and_duty.sql')
    expect(files[52]).toBe('053_tanod_incident_access.sql')
    expect(files[53]).toBe('054_barangay_resident_directory.sql')
    expect(files[54]).toBe('055_verified_resident_directory_sync.sql')
    expect(files[55]).toBe('056_resident_eligibility.sql')
    expect(files[56]).toBe('057_incident_map_location.sql')
    expect(files[57]).toBe('058_targeted_sms.sql')
    expect(files[58]).toBe('059_community_credit_foundation.sql')
    expect(files[59]).toBe('060_community_credit_enrollment.sql')
    expect(files[60]).toBe('061_person_matter_linking.sql')
  })

  it('records in its header that it was applied, and how', () => {
    const header = raw.slice(0, raw.indexOf('create table'))
    expect(header).toMatch(/STATUS: APPLIED/)
    expect(header).toMatch(/2026-10-17/)
    expect(header).toMatch(/RAISE EXCEPTION/)
  })

  it('leaves every earlier migration alone', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(files.filter((f) => f < '044')).toHaveLength(43)
    expect(files[42]).toBe('043_kp_case_hearings_summons.sql')
  })
})

// ── B. Authorization ─────────────────────────────────────────────────────────

describe('B. it never authorizes on a name or a committee', () => {
  // ⚠️ THE STANDING RULE FROM P3-A. `barangay_officials.committee` is free
  // text with no CHECK, the Edit Official form sends it for an arbitrary row,
  // and `protect_official_record()` does not guard it -- so authorizing on it
  // would reproduce migration 028's escalation on an unguarded column.
  it('reads committee nowhere in executable code', () => {
    expect(lower).not.toContain('committee')
  })

  it('reads full_name as an authorization key nowhere', () => {
    expect(lower).not.toMatch(/full_name\s*=\s*\w*\.?full_name/)
    expect(lower).not.toMatch(/where[^;]*full_name\s*=\s*p_/)
  })

  it('resolves every position through the one predicate migration 031 built', () => {
    expect(code).toContain("current_official_holds_position('Barangay Secretary')")
    expect(code).toContain("current_official_holds_position('Punong Barangay')")
  })

  // ⚠️ `is_official()` is referenced by eleven policies including three in
  // `storage`; widening or re-pointing it would hand the nurse the residents
  // registry. The new predicate is SEPARATE and strictly narrower.
  it('does not redefine is_official', () => {
    expect(lower).not.toMatch(/function\s+public\.is_official/)
  })

  it('requires an active directory row, not merely the official role', () => {
    const predicate = code.slice(
      code.indexOf('function public.current_official_is_active'),
      code.indexOf('current_official_may_administer_records')
    )
    expect(predicate).toContain('official_account_links')
    expect(predicate).toContain('archived_at IS NULL')
    expect(predicate).toContain("p.role = 'official'")
  })

  it('builds no capability table and no grant mechanism', () => {
    ;['capabilit', 'permission_grant', 'role_assignment', 'official_capabilit']
      .forEach((term) => expect(lower).not.toContain(term))
  })
})

// ── C. A Tanod is not an account ─────────────────────────────────────────────

describe('C. the Tanod model', () => {
  it('adds no tanod role and does not touch profiles_role_check', () => {
    expect(lower).not.toContain('profiles_role_check')
    expect(lower).not.toMatch(/'tanod'/)
  })

  it('gives tanod_members no profile link and no auth column', () => {
    const table = code.slice(
      code.indexOf('create table if not exists public.tanod_members'),
      code.indexOf('create table if not exists public.tanod_assignments')
    )
    ;['profile_id', 'auth.users', 'user_id', 'password', 'email']
      .forEach((term) => expect(table.toLowerCase()).not.toContain(term))
  })

  // ⚠️ NO CONTINUOUS GPS. The only latitude/longitude pair in the whole file
  // belongs to an INCIDENT -- a place something happened, recorded once.
  it('puts coordinates on the incident and nowhere else', () => {
    const tanodTables = code.slice(
      code.indexOf('create table if not exists public.tanod_members'),
      code.indexOf('create table if not exists public.incident_tanod')
    )
    expect(tanodTables.toLowerCase()).not.toContain('latitude')
    expect(tanodTables.toLowerCase()).not.toContain('longitude')
    expect((lower.match(/latitude/g) || []).length).toBeGreaterThan(0)
  })

  it('links a Tanod to an incident by id, never by a stored name', () => {
    const join = flat.slice(
      flat.indexOf('create table if not exists public.incident_tanod'),
      flat.indexOf('alter table public.incidents enable row level security')
    )
    expect(join).toContain('references public.tanod_members(id)')
    expect(join.toLowerCase()).not.toContain('tanod_name')
  })
})

// ── D. Purok is still unconfirmed ────────────────────────────────────────────

describe('D. no purok model', () => {
  it('creates no puroks table, no purok_id and no purok CHECK', () => {
    expect(lower).not.toContain('puroks');
    expect(lower).not.toContain('purok_id')
    expect(lower).not.toMatch(/check[^;]*purok/)
  })

  it('names the free-text column area_note rather than purok', () => {
    expect(code).toContain('area_note')
  })

  it('draws no boundary, polygon or geofence', () => {
    ;['polygon', 'geofence', 'boundary', 'postgis', 'geometry', 'st_within']
      .forEach((term) => expect(lower).not.toContain(term))
  })
})

// ── E. The privacy boundary ──────────────────────────────────────────────────

describe('E. the map and analytics readers', () => {
  const mapReader = code.slice(
    code.indexOf('function public.incident_map_points'),
    code.indexOf('revoke execute on function public.incident_queue')
  )

  // ⚠️ THE LOAD-BEARING ONE. A marker popup is read by whoever is standing at
  // the screen, so the sentence an official typed is not sent to it.
  it('returns no narrative from the map reader', () => {
    expect(mapReader).not.toContain('narrative')
  })

  it('returns no recorder, no blotter summary and no area note from the map reader', () => {
    ;['recorded_by', 'summary', 'area_note'].forEach(
      (term) => expect(mapReader).not.toContain(term)
    )
  })

  it('plots only rows that carry both coordinates', () => {
    expect(mapReader).toContain('i.latitude IS NOT NULL')
    expect(mapReader).toContain('i.longitude IS NOT NULL')
  })

  const analytics = code.slice(code.indexOf('function public.incident_counts_by_type'))

  it('returns no narrative from any analytics reader', () => {
    expect(analytics).not.toContain('narrative')
  })

  it('reads no complaint, screening or KP table anywhere', () => {
    ;['complaints', 'complaint_parties', 'complaint_screenings', 'kp_cases',
      'kp_hearings', 'complaint_status_history'].forEach(
      (table) => expect(lower).not.toContain(table)
    )
  })

  // ⚠️ COUNTS, NEVER RATES. No population figure exists in this database.
  it('computes no rate and no per-capita figure', () => {
    ;['population', 'per_capita', 'percapita', 'rate_per']
      .forEach((term) => expect(lower).not.toContain(term))
  })

  it('computes every month key in Asia/Manila rather than UTC', () => {
    expect(code).toContain("AT TIME ZONE 'Asia/Manila'")
    expect(lower).not.toContain('at time zone \'utc\'')
  })
})

// ── F. The execute surface, closed at creation ───────────────────────────────

describe('F. the execute surface', () => {
  const FUNCTIONS = [
    'generate_incident_reference', 'stamp_incident_reference', 'stamp_blotter_reference',
    'current_official_is_active', 'current_official_may_administer_records',
    'record_incident', 'set_incident_status', 'amend_blotter_entry',
    'attribute_incident_tanod', 'add_tanod_member', 'set_tanod_member_active',
    'schedule_tanod_assignment', 'set_tanod_assignment_active', 'incident_queue',
    'incident_detail', 'blotter_history_for', 'incident_tanod_for', 'tanod_roster',
    'tanod_assignments_for', 'incident_map_points', 'incident_counts_by_type',
    'incident_counts_by_status', 'incident_monthly_trend',
    'incident_location_frequency', 'tanod_coverage_summary',
  ]

  it.each(FUNCTIONS)('revokes PUBLIC execute on %s', (name) => {
    const revokes = code.split('\n').filter(
      (line) => line.includes('revoke execute') && line.includes(`public.${name}(`)
    )
    expect(revokes.length).toBeGreaterThan(0)
    expect(revokes.join(' ')).toContain('from public')
  })

  // ⚠️ MASTER-B's lesson applied AT CREATION rather than in a later phase.
  // `pg_default_acl` grants `anon` by name and PostgreSQL's own function
  // default adds a bare PUBLIC entry on top, so revoking the named role alone
  // would leave `has_function_privilege('anon', ...)` true through PUBLIC.
  // That was migration 038's whole finding.
  it.each(FUNCTIONS)('revokes anon execute on %s', (name) => {
    const revokes = code.split('\n').filter(
      (line) => line.includes('revoke execute') && line.includes(`public.${name}(`)
    )
    expect(revokes.join(' ')).toContain('anon')
  })

  it('grants anon execute on nothing at all', () => {
    expect(code).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/)
  })

  it('sets an empty search_path on every function it creates', () => {
    const created = code.match(/create or replace function/g) || []
    const scoped = code.match(/set search_path to ''/g) || []
    expect(created.length).toBe(FUNCTIONS.length)
    expect(scoped.length).toBe(FUNCTIONS.length)
  })

  // The three internal helpers are reached by a trigger, which does not
  // consult the caller's EXECUTE privilege -- migration 034's measured fact.
  it.each(['generate_incident_reference', 'stamp_incident_reference', 'stamp_blotter_reference'])(
    'grants %s to no client role', (name) => {
      expect(code).not.toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`)
      )
    }
  )
})

// ── G. Private tables, two barriers ──────────────────────────────────────────

describe('G. the tables are private', () => {
  const TABLES = ['incidents', 'blotter_entries', 'blotter_entry_history',
    'tanod_members', 'tanod_assignments', 'incident_tanod']

  it.each(TABLES)('enables RLS on %s', (table) => {
    expect(flat).toContain(`alter table public.${table} enable row level security`)
  })

  it.each(TABLES)('revokes every client privilege on %s', (table) => {
    expect(flat).toContain(`revoke all on public.${table} from anon, authenticated, public`)
  })

  // ⚠️ ZERO POLICIES, AND NONE IS TO BE ADDED. RLS filters ROWS and cannot
  // restrict COLUMNS; the map must return a coordinate and not a narrative,
  // which no row policy can express.
  it('creates no policy on anything', () => {
    expect(lower).not.toContain('create policy')
    expect(lower).not.toContain('alter policy')
  })
})

// ── H. What it deliberately does not do ──────────────────────────────────────

describe('H. the absences', () => {
  it('writes no activity_log entry and no notification', () => {
    expect(lower).not.toContain('insert into public.activity_log')
    expect(lower).not.toContain('insert into public.notifications')
  })

  it('redefines none of the complaint, screening or KP functions', () => {
    ;['track_complaint', 'complaint_queue', 'open_kp_case', 'confirm_complaint_screening']
      .forEach((fn) => expect(lower).not.toContain(`function public.${fn}`))
  })

  it('inserts only into its own six tables', () => {
    const targets = [...code.matchAll(/INSERT INTO public\.(\w+)/g)].map((m) => m[1])
    expect([...new Set(targets)].sort()).toEqual([
      'blotter_entries', 'blotter_entry_history', 'incident_tanod',
      'incidents', 'tanod_assignments', 'tanod_members',
    ])
  })

  it('creates no sequence and no counter for a reference', () => {
    ;['nextval', 'create sequence', 'lpad', 'serial']
      .forEach((term) => expect(lower).not.toContain(term))
  })

  // ⚠️ DISTINCT PREFIXES. `BCR-` is the reservation, `CMP-` the complaint and
  // `KP-` the case; two references sharing a prefix is a hazard when somebody
  // reads one out over the phone.
  it('stamps distinct reference prefixes', () => {
    expect(code).toContain("generate_incident_reference('INC'")
    expect(code).toContain("generate_incident_reference('BLT'")
  })

  it('reuses the Crockford alphabet with the look-alikes removed', () => {
    expect(code).toContain("'0123456789ABCDEFGHJKMNPQRSTVWXYZ'")
    ;['I', 'L', 'O', 'U'].forEach((letter) => {
      expect("0123456789ABCDEFGHJKMNPQRSTVWXYZ").not.toContain(letter)
    })
  })

  it('takes no identity, status, reference or timestamp as a write parameter', () => {
    const writer = code.slice(
      code.indexOf('function public.record_incident'),
      code.indexOf('function public.set_incident_status')
    )
    const signature = writer.slice(0, writer.indexOf('returns text'))
    ;['p_reference', 'p_status', 'p_recorded_by', 'p_created_at', 'p_blotter']
      .forEach((param) => expect(signature).not.toContain(param))
  })
})
