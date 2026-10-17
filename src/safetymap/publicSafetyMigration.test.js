// Final Integration — SOURCE-READING guards over migration 045 and the three
// public modules it feeds.
//
// ⚠️ THE RETURN TYPES ARE THE SECURITY BOUNDARY, so this suite reads them out
// of the SQL rather than trusting a component not to render a column. A test
// that only checked the React could pass while the function handed the
// browser a narrative.
//
// ⚠️ EVERY "is not used" SCAN RUNS OVER COMMENT-STRIPPED SQL AND JS. Both the
// migration and the modules discuss `incident_map_points`, `narrative` and
// `location_text` at length precisely to record that none is published --
// so a literal `toContain` over the raw text reports the documentation as the
// defect. That is migration 040/041's own lesson, and it has now bitten in
// four phases (`tan` in `circumstance`, `fine` in `definer`,
// `complaint-reference` in a CSS class name).

import fs from 'fs'
import path from 'path'

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase-migrations', '045_public_safety_aggregates.sql'
)
const RAW_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8')

// `--` line comments out, whitespace squished. ⚠️ The squish matters as much
// as the comment strip: Combined Phase 2 had a literal `toContain` pass for
// one table and fail for five purely because the SQL was column-aligned.
const stripSql = (sql) => sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase()

const SQL = stripSql(RAW_SQL)

// ⚠️ THE WHOLE FUNCTION, HEADER AND BODY. My first version of this suite
// sliced up to the OPENING `$function$`, so six guards were reading a
// signature and asserting things about a body they had never seen -- and
// `.toContain("'YYYY-MM'")` failed on a function that does contain it. The
// project's own rule: always ask which step produced the result.
const functionSource = (name) => {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}`
    + '[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$',
    'i'
  )
  const match = re.exec(RAW_SQL)
  if (!match) throw new Error(`045 does not define public.${name}`)
  return match[0]
}

// ⚠️ SPLIT ON COMMAS, NOT ON LINES. A `returns table (...)` clause is
// hard-wrapped, so a per-line scan silently saw two of the zone reader's
// four columns -- which would have let a fifth column through unnoticed as
// long as it shared a line with another.
const returnColumns = (name) => {
  const clause = /returns table \(([\s\S]*?)\)\s*language/i.exec(functionSource(name))[1]
  return clause.split(',').map((part) => part.trim().split(/\s+/)[0].toLowerCase()).sort()
}

const stripJs = (src) => src
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const API = read('publicSafetyApi.js')
const LABELS = read('publicSafetyLabels.js')
const MAP = read('PublicSafetyMap.jsx')
const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'pages', 'CommunitySafety.jsx'), 'utf8'
)

const API_CODE = stripJs(API)
const LABELS_CODE = stripJs(LABELS)
const MAP_CODE = stripJs(MAP)
const PAGE_CODE = stripJs(PAGE)
const PUBLIC_CODE = [API_CODE, LABELS_CODE, MAP_CODE, PAGE_CODE].join('\n')

// The four readers migration 045 publishes, and the function they share.
const PUBLIC_FUNCTIONS = [
  'public_safety_overview',
  'public_safety_zones',
  'public_safety_type_counts',
  'public_safety_monthly',
]

// Every incident/Tanod reader that is gated on `current_official_is_active()`
// or `current_official_may_administer_records()`. ⚠️ Anon is refused 42501 by
// all of them, measured — this list is what keeps the PUBLIC code from
// quietly reaching for one.
const OFFICIAL_READERS = [
  'incident_map_points',
  'incident_queue',
  'incident_detail',
  'incident_location_frequency',
  'incident_type_counts',
  'incident_monthly_counts',
  'incident_status_counts',
  'tanod_roster',
  'tanod_assignments_for',
  'tanod_coverage_summary',
  'blotter_entry_detail',
  'blotter_history_for',
]

describe('migration 045 — the public aggregate surface', () => {
  it('creates exactly the four public readers plus the coarsening helper', () => {
    const created = [...RAW_SQL.matchAll(
      /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)/gi
    )].map((m) => m[1])
    expect(created.sort()).toEqual([
      'public_safety_coarsen',
      'public_safety_monthly',
      'public_safety_overview',
      'public_safety_type_counts',
      'public_safety_zones',
    ])
  })

  it('creates no table, no policy, no trigger and no view', () => {
    expect(SQL).not.toContain('create table')
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('create trigger')
    expect(SQL).not.toContain('create view')
    expect(SQL).not.toContain('create materialized view')
  })

  it('writes nothing at all — no insert, update, delete or truncate', () => {
    expect(SQL).not.toContain('insert into')
    expect(SQL).not.toContain('update public.')
    expect(SQL).not.toContain('delete from')
    expect(SQL).not.toContain('truncate')
  })

  it('does not redefine any existing reader', () => {
    OFFICIAL_READERS.forEach((fn) => {
      expect(SQL).not.toContain(`function public.${fn}`)
    })
    expect(SQL).not.toContain('function public.track_complaint')
    expect(SQL).not.toContain('function public.complaint_queue')
    expect(SQL).not.toContain('function public.is_official')
    expect(SQL).not.toContain('function public.current_official_is_active')
  })

  it('sets search_path on all five functions', () => {
    const guards = SQL.match(/set search_path to ''/g) || []
    expect(guards.length).toBe(5)
  })

  // ─── ⚠️ The return types ARE the boundary ─────────────────────────────────

  it('publishes no narrative, name, contact, reference or evidence column', () => {
    const FORBIDDEN = [
      'narrative', 'location_text', 'area_note', 'recorded_by', 'reference',
      'contact_number', 'full_name', 'complainant', 'respondent', 'witness',
      'evidence', 'attachment', 'entry_reference', 'summary', 'blotter',
      'minor', 'vawc', 'screening', 'kp_', 'tanod', 'patrol',
    ]
    FORBIDDEN.forEach((column) => {
      expect(SQL).not.toContain(column)
    })
  })

  it('the zone reader returns only a cell key, a centre and a count', () => {
    expect(returnColumns('public_safety_zones')).toEqual([
      'center_latitude', 'center_longitude', 'total', 'zone_key',
    ])
  })

  it('the overview returns three integers and nothing else', () => {
    expect(returnColumns('public_safety_overview')).toEqual([
      'mapped_incidents', 'total_incidents', 'zone_count',
    ])
    const clause = /returns table \(([\s\S]*?)\)\s*language/i
      .exec(functionSource('public_safety_overview'))[1]
    expect(clause).not.toMatch(/text|uuid|timestamp|numeric/i)
  })

  it('the type counts carry no location and no date', () => {
    expect(returnColumns('public_safety_type_counts')).toEqual(['incident_type', 'total'])
  })

  it('the monthly counts are a month string, never a day', () => {
    expect(returnColumns('public_safety_monthly')).toEqual(['month_key', 'total'])
    const fn = functionSource('public_safety_monthly')
    expect(fn).toContain("'YYYY-MM'")
    expect(fn).not.toContain("'YYYY-MM-DD'")
  })

  // ─── ⚠️ The aggregation rule ──────────────────────────────────────────────

  it('the suppression threshold exists and lives in ONE place', () => {
    const having = SQL.match(/having count\(\*\) >= 2/g) || []
    expect(having.length).toBe(1)
    expect(functionSource('public_safety_zones').toLowerCase())
      .toContain('having count(*) >= 2')
  })

  // ⚠️ THE LOAD-BEARING ONE. The overview's two map-derived numbers are
  // counted FROM `public_safety_zones`, not re-derived with a second copy of
  // the threshold. A second copy is how the page comes to print a count the
  // map cannot draw.
  it('the overview counts the ZONE FUNCTION rather than re-deriving the rule', () => {
    const fn = functionSource('public_safety_overview').toLowerCase()
    // the two MAP-derived numbers each come from the zone function
    const viaZones = fn.match(/public\.public_safety_zones\(p_from, p_to\)/g) || []
    expect(viaZones.length).toBe(2)
    // and the threshold is not restated here
    expect(fn).not.toContain('having')
    expect(fn).not.toContain('>= 2')
    // ⚠️ `total_incidents` DOES read `incidents` directly, and must: it
    // counts every recorded incident for the period, including the ones with
    // no coordinates and the ones sitting alone in a cell. That difference is
    // what `coverageSentence` explains to the reader. Reading the table once,
    // for the total only, is the shape -- not a second copy of the rule.
    const viaTable = fn.match(/from public\.incidents/g) || []
    expect(viaTable.length).toBe(1)
  })

  it('publishes the CELL CENTRE, never the mean of the points', () => {
    const zones = functionSource('public_safety_zones').toLowerCase()
    expect(zones).toContain('public.public_safety_coarsen(i.latitude)')
    expect(zones).toContain('public.public_safety_coarsen(i.longitude)')
    expect(zones).not.toMatch(/avg\s*\(/)
    expect(zones).not.toMatch(/min\s*\(\s*i\.latitude/)
    expect(zones).not.toMatch(/max\s*\(\s*i\.latitude/)
  })

  it('coarsens by flooring onto a fixed grid', () => {
    const fn = functionSource('public_safety_coarsen').toLowerCase()
    expect(fn).toContain('floor(')
    expect(fn).toContain('0.002')
    // the cell CENTRE: the floored corner plus half a cell
    expect(fn).toContain('0.001')
  })

  it('draws no purok polygon and invents no boundary', () => {
    ;['polygon', 'geojson', 'geometry', 'postgis', 'st_', 'purok', 'boundary']
      .forEach((term) => expect(SQL).not.toContain(term))
  })

  // ─── ⚠️ The execute surface, closed at creation ───────────────────────────

  it('revokes PUBLIC on every one of the five', () => {
    expect(SQL).toContain('revoke execute on function public.public_safety_coarsen(numeric) from public, anon, authenticated')
    PUBLIC_FUNCTIONS.forEach((fn) => {
      expect(SQL).toContain(`revoke execute on function public.${fn}(date, date) from public`)
    })
  })

  it('grants the four readers to anon and authenticated, and the helper to neither', () => {
    PUBLIC_FUNCTIONS.forEach((fn) => {
      expect(SQL).toContain(
        `grant execute on function public.${fn}(date, date) to anon, authenticated`
      )
    })
    // ⚠️ The helper is reached as a NESTED call inside a SECURITY DEFINER
    // function, where the EXECUTE check is made as the DEFINER — migration
    // 034's measured fact. So it needs no client grant, and granting one
    // would publish the grid size as a callable probe.
    expect(SQL).not.toMatch(/grant execute on function public\.public_safety_coarsen/)
  })

  it('grants nothing to PUBLIC or service_role explicitly', () => {
    expect(SQL).not.toMatch(/grant execute on function public\.public_safety_\w+\([^)]*\) to [^;]*\bpublic\b/)
  })
})

describe('the public frontend modules', () => {
  it('name no official reader anywhere in their code', () => {
    OFFICIAL_READERS.forEach((fn) => {
      expect(PUBLIC_CODE).not.toContain(fn)
    })
  })

  // Both directions: the four public names must be PRESENT in the api module,
  // so this cannot pass by the api module having no RPC calls at all.
  it('calls exactly the four public RPCs', () => {
    PUBLIC_FUNCTIONS.forEach((fn) => {
      expect(API_CODE).toContain(fn)
    })
    const called = [...API_CODE.matchAll(/supabase\.rpc\(\s*'([a-z0-9_]+)'/g)]
      .map((m) => m[1])
    const literal = [...API_CODE.matchAll(/'(public_safety_[a-z_]+)'/g)].map((m) => m[1])
    expect(literal.sort()).toEqual([...PUBLIC_FUNCTIONS].sort())
    // the single `call` helper takes the name as an argument
    expect(called.length).toBeLessThanOrEqual(1)
  })

  it('reads no table directly', () => {
    expect(API_CODE).not.toContain('supabase.from')
    expect(PAGE_CODE).not.toContain('supabase.from')
    expect(MAP_CODE).not.toContain('supabase')
    expect(LABELS_CODE).not.toContain('supabase')
  })

  // ⚠️ SCOPED TO READER AND TABLE NAMES, NOT THE BARE WORD, and the reason is
  // on the page: the closing notice carries a `<Link>` to the resident
  // complaint tab and the visible words "file a complaint", which is this
  // page telling somebody where to report rather than reading complaint
  // data. A bare `toContain('complaint')` reports that sentence as the
  // defect -- the trap that has now cost four phases a false finding
  // (`tan` in `circumstance`, `fine` in `definer`, `complaint-reference` as
  // a CSS class). The property is that no complaint/KP DATA surface is
  // reached, so the scan names the surfaces.
  it('reaches no complaint, screening or KP data surface', () => {
    const SURFACES = [
      'complaint_queue', 'complaint_detail', 'complaint_parties_for',
      'complaint_history_for', 'complaint_attachments_for', 'track_complaint',
      'complaint_screenings_for', 'prepare_complaint_screening',
      'confirm_complaint_screening', 'complaint_screening_checklist_keys',
      'kp_case_detail', 'kp_cases_for', 'kp_hearings_for', 'open_kp_case',
      'blotter_entry_detail', 'blotter_history_for',
      'complaint_parties', 'complaint_status_history', 'complaint_screenings',
      'kp_cases', 'kp_hearings', 'kp_case_panel', 'blotter_entries',
    ]
    SURFACES.forEach((surface) => {
      expect(PUBLIC_CODE).not.toContain(surface)
    })
    // and nothing is imported from those feature folders either
    ;['../complaints/', '../screening/', '../kpcases/', './complaints']
      .forEach((dir) => expect(PUBLIC_CODE).not.toContain(dir))
  })

  it('the map component accepts zones and has no points prop', () => {
    expect(MAP_CODE).toMatch(/\(\s*\{\s*zones\s*=/)
    expect(MAP_CODE).not.toContain('points')
    expect(MAP_CODE).not.toContain('isPlottable')
  })

  it('the map draws no polygon layer', () => {
    ;['L.polygon', 'L.geoJSON', 'L.rectangle', '.geojson', 'L.marker(']
      .forEach((term) => expect(MAP_CODE).not.toContain(term))
    expect(MAP_CODE).toContain('L.circleMarker')
  })

  // ⚠️ SCOPED AROUND THE DISCLAIMER, which is the one string that must
  // contain these words in order to deny them -- `prototypeCoverage.test.js`
  // set that precedent when Business Clearance's own prose denies having a
  // permit number, and P4-A followed it for the KP vocabulary. So the scan
  // runs over everything EXCEPT the disclaimer, and the next test asserts
  // the disclaimer is a denial rather than a claim.
  it('publishes no rate, per-capita figure or risk score', () => {
    const { PUBLIC_DISCLAIMER } = require('./publicSafetyLabels')
    const scanned = PUBLIC_CODE.split(PUBLIC_DISCLAIMER).join(' ').toLowerCase()
    ;['per capita', 'percapita', 'per 1,000', 'per 1000', 'crime rate',
      'riskscore', 'risk_score', 'severity', 'danger', 'predict', 'forecast',
      'likelihood', 'probability', 'score']
      .forEach((term) => {
        expect(scanned).not.toContain(term)
      })
  })

  it('and the disclaimer that contains those words IS a denial', () => {
    const { PUBLIC_DISCLAIMER } = require('./publicSafetyLabels')
    expect(PUBLIC_DISCLAIMER).toMatch(/\bnot a crime rate\b/i)
    expect(PUBLIC_DISCLAIMER).toMatch(/\bnot a prediction\b/i)
    expect(PUBLIC_DISCLAIMER).toMatch(/\bnot a ranking\b/i)
    // it says what the numbers ARE, not only what they are not
    expect(PUBLIC_DISCLAIMER).toMatch(/counts of what the barangay has recorded/i)
  })

  // ⚠️ An observation REPORTS; it never prescribes. The official version
  // invites the barangay to review; a resident is not the one who reviews,
  // so the public sentence states the count and stops.
  it('no public observation contains a directive verb', () => {
    const { publicObservation } = require('./publicSafetyLabels')
    const sentences = [1, 2, 3, 4, 5].map(
      (rank) => publicObservation({ total: rank + 4 }, rank)
    )
    sentences.forEach((sentence) => {
      ;['must', 'should', 'install', 'build', 'deploy', 'assign', 'patrol',
        'penalt', 'fine', 'violation', 'is unsafe', 'avoid', 'review']
        .forEach((verb) => expect(sentence.toLowerCase()).not.toContain(verb))
      expect(sentence).toMatch(/recorded/)
    })
  })

  // ⚠️ The incident TYPE words are shared with the official surface on
  // purpose — a resident and an official must not read two different words
  // for one stored value. Everything else about the vocabulary is this
  // module's own.
  it('borrows the incident type labels rather than defining a second set', () => {
    expect(LABELS_CODE).toContain("from '../incidents/incidentLabels'")
    expect(LABELS_CODE).not.toMatch(/INCIDENT_TYPES\s*=\s*(Object\.freeze\()?\[/)
  })

  it('defines no status vocabulary of its own', () => {
    ;['recorded', 'under_investigation', 'referred', 'resolved', 'closed']
      .forEach((status) => expect(LABELS_CODE).not.toContain(`'${status}'`))
  })
})
