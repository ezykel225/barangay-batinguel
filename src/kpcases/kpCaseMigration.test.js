// Combined Phase 1. Source-reading guards over migration 043.
//
// ⚠️ WHAT THESE TESTS CANNOT PROVE, stated first because it is the most
// important thing about them. Only SQL can prove a position gate, an RLS
// predicate or a privilege. Whether the Punong Barangay alone can open a
// case, whether the Secretary can schedule but not decide, and whether
// an ordinary Kagawad reads nothing are results from impersonating each
// real account against the live database, and they live in this phase's
// report.
//
// What is pinned here is the SHAPE, which is what a later edit can
// silently break: that the tables are private at BOTH layers, that the
// eligibility gate reads a human CONFIRMATION rather than checklist
// answers, that nothing creates a case automatically, that PUBLIC
// EXECUTE is revoked on every function, that `committee` is read
// nowhere, and that none of the deferred stages was built.
//
// ⚠️ EVERY "IS NOT USED" SCAN RUNS OVER COMMENT-STRIPPED CODE. 043
// discusses `committee`, settlement, repudiation, a certificate to file
// action and `activity_log` at length precisely to record that none of
// them is read or built -- and a scan that counted those sentences would
// report the file's own documentation as the defect it documents
// avoiding. The `complaintIntakeMigration.test.js` precedent.

import fs from 'fs'
import path from 'path'

const DIR = path.join(__dirname, '..', '..', 'supabase-migrations')
const FILE = path.join(DIR, '043_kp_case_hearings_summons.sql')
const raw = fs.readFileSync(FILE, 'utf8')

// `--` comments removed.
const code = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n')

// ⚠️ AND `COMMENT ON ... IS '...'` STRINGS REMOVED TOO, for every "is not
// used" scan. That is my own stripper corrected rather than a weakened
// assertion: three scans failed on the file's own `comment on` text --
// "No statutory deadline is encoded" and "does not touch reservations or
// official_availability" -- which are the database's record that those
// things are ABSENT. A scan that flags them reports the documentation as
// the defect it documents avoiding, which is exactly the trap
// `prototypeCoverage.test.js` set the precedent for (Business Clearance's
// own prose denies having a permit number, and a whole-sheet scan flagged
// the disclaimer for containing the words it exists to disclaim).
//
// The property is about EXECUTABLE code, so `exec` is what the absence
// scans run over, and the comments are asserted separately where they
// matter.
const exec = code.replace(/comment on [\s\S]*?';/g, '')
const lower = exec.toLowerCase()

const fnBody = (name) => {
  const m = code.match(
    new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$function\\$;`),
  )
  expect(m).not.toBeNull()
  return m[0]
}

// ⚠️ LOWER-CASED FOR EVERY BODY SCAN, and that is measured rather than
// stylistic. SQL keywords are case-insensitive, so a test asserting
// lowercase asserts a FORMATTING CHOICE rather than a property -- and
// four of this suite's first-run failures were exactly that: regexes
// written in lowercase against bodies whose statements are uppercase
// (`ORDER BY`, `INSERT INTO`, `IS NOT NULL`). P4-A made the same mistake
// once, on an `update` scan. The project rule: always ask which step
// produced the result.
const fnLower = (name) => fnBody(name).toLowerCase()

// ── A. One file, and it is the newest ───────────────────────────────
//
// ⚠️ THE NEWEST-FILE GUARD LIVES HERE NOW. `screeningMigration.test.js`
// used to hold it as "there is no 043"; it moved to the phase that owns
// the newest file, so a later phase that adds one without a test still
// fails somewhere.

describe('A. the migration', () => {
  // ⚠️ REDEFINED AGAIN BY THE PR #45 BLOCKER FIX, which added 046 -- a
  // definition change at its own site, not a loosened assertion. What this
  // guard is FOR is that 043 stays 043 and stays untouched by a later
  // phase, and that holds: 046 adds ONE function and alters nothing in
  // this file. After Tanod editing (047), type ties (048), and public type buckets (049), case support continues in 050-051.
  it('is still 043, still in place, with only the expected later migrations', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toHaveLength(60)
    expect(files[42]).toBe('043_kp_case_hearings_summons.sql')
    expect(files[43]).toBe('044_incident_blotter_tanod.sql')
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
  })

  it('leaves 001-042 alone', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(files.filter((f) => f < '043')).toHaveLength(42)
    expect(files[41]).toBe('042_kp_screening_foundation.sql')
  })

  it('records in its header that it was applied, and how', () => {
    const header = raw.slice(0, raw.indexOf('create table'))
    expect(header).toMatch(/STATUS: APPLIED/)
    expect(header).toMatch(/2026-10-16/)
    expect(header).toMatch(/VERIFIED/)
  })

  // ⚠️ FOUR TABLES, and they are the four the brief named. §1 says not
  // to create unnecessary future tables, so the list is asserted
  // exactly rather than as a minimum.
  it('creates exactly the four tables this phase needs', () => {
    const tables = [...code.matchAll(/create table (?:if not exists )?public\.(\w+)/g)]
      .map((m) => m[1])
    expect(tables).toEqual([
      'kp_cases', 'kp_case_panel', 'kp_hearings', 'kp_hearing_attendance',
    ])
  })

  // ⚠️ §1 and §10, named individually so a failure says which appeared.
  it('creates none of the tables this phase is forbidden', () => {
    ;['kp_case_parties', 'kp_jurisdiction_rules', 'kp_settlements',
      'kp_settlement_terms', 'kp_repudiations', 'kp_compliance',
      'kp_certificates', 'certificate_to_file_action', 'complaint_capabilities',
      'official_capabilities', 'kp_capabilities', 'tanod', 'tanod_account_links',
      'incidents', 'blotter', 'incident_reports', 'puroks']
      .forEach((name) => {
        expect(code).not.toMatch(
          new RegExp(`create table (?:if not exists )?public\\.${name}\\b`),
        )
      })
  })

  // ⚠️ §1: CASE PARTIES ONLY IF `complaint_parties` CANNOT SERVE, and it
  // can -- so attendance keys straight to it. A second party table would
  // be a drift-prone copy of names the complaint already holds.
  it('keys attendance to the existing complaint parties', () => {
    expect(code).toMatch(/party_id uuid not null\s+references public\.complaint_parties\(id\)/)
  })

  // ⚠️ MEASURED, NOT STYLISTIC. P4-A established that the connector's
  // destructive-statement scan gates `DROP TRIGGER IF EXISTS`, timing
  // the whole call out at 60 seconds while executing nothing. The
  // keyword is not fragmented to get past the guard; the statement is
  // simply not needed on a first apply or on a replay.
  it('issues no gated destructive statement', () => {
    expect(lower).not.toContain('drop trigger')
    expect(lower).not.toContain('drop function')
    expect(lower).not.toContain('drop table')
    expect(lower).not.toContain('truncate')
    expect(lower).not.toMatch(/\bdelete from\b/)
  })
})

// ── B. The eligibility gate reads a human CONFIRMATION ──────────────
//
// ⚠️ THE LOAD-BEARING SECTION OF THIS SUITE. §1: a case may be created
// ONLY from a complaint whose LATEST screening was human-confirmed with
// `proceed_to_kp_process`, and eligibility is NEVER derived from
// checklist answers.

describe('B. only a confirmed proceed_to_kp_process screening opens a case', () => {
  const body = () => fnBody('open_kp_case')

  // ⚠️ `IS DISTINCT FROM` RATHER THAN `<>`, which is STRONGER than the
  // comparison my first version expected: `<>` against a NULL outcome
  // yields NULL and the `IF` would not fire, so a screening with no
  // recorded outcome would walk past. The assertion follows the safer
  // form the migration actually uses.
  it('requires the confirmed outcome to say to proceed', () => {
    expect(body()).toMatch(/IS DISTINCT FROM 'proceed_to_kp_process'/i)
    expect(body()).toContain('proceed_to_kp_process')
    // and the other three confirmed outcomes are not permitted
    ;['refer_for_further_action', 'close_without_kp_process',
      'needs_more_information']
      .forEach((other) => expect(body()).not.toContain(other))
  })

  // ⚠️ CONFIRMED, not merely prepared. A draft screening carrying that
  // recommendation must not open a case: the recommendation is the
  // Secretary's suggestion and the confirmation is the Punong
  // Barangay's decision, which is the whole of 042's two-column split.
  it('requires the screening to have been confirmed by a human', () => {
    expect(fnLower('open_kp_case')).toMatch(/v_confirmed_at is null/)
    expect(body()).toMatch(/has not been confirmed/)
    // It reads `confirmed_at`, not the Secretary's `recommendation` --
    // 042's two columns, and the recommendation is a suggestion.
    expect(body()).toContain('confirmed_at')
    expect(body()).not.toContain('recommendation')
  })

  // ⚠️ THE LATEST ONE, so a superseded confirmation cannot be used. 042
  // inserts a NEW row when a case is re-screened after a confirmation,
  // and the older row stays as history.
  it('reads the latest screening rather than any screening', () => {
    expect(fnLower('open_kp_case')).toMatch(/order by[\s\S]*?desc[\s\S]*?limit 1/)
  })

  // ⚠️ IT READS NO CHECKLIST ANSWER, which is the line §1 draws. A
  // function that opened a case because five answers were `no` would be
  // deriving eligibility, and that is forbidden at both layers.
  it('reads no checklist answer', () => {
    expect(body()).not.toContain('answers')
    expect(body()).not.toContain('checklist')
    expect(body()).not.toMatch(/->>|jsonb_/)
  })

  // ⚠️ AND THE CLIENT CANNOT NOMINATE A SCREENING. The RPC takes a
  // COMPLAINT id and derives the screening itself, so a crafted call
  // cannot point at a different complaint's confirmation.
  it('takes no screening id, status or eligibility parameter', () => {
    const sig = code.match(/create or replace function public\.open_kp_case\(([\s\S]*?)\)\s*\nreturns/)
    expect(sig).not.toBeNull()
    const params = sig[1]
    expect(params).toMatch(/p_complaint_id uuid/)
    ;['p_screening_id', 'p_status', 'p_eligible', 'p_outcome', 'p_reference',
      'p_opened_by', 'p_opened_at', 'p_actor']
      .forEach((name) => expect(params).not.toContain(name))
  })

  it('refuses a complaint with no screening at all', () => {
    expect(body()).toMatch(/no screening yet/)
  })
})

// ── C. No automatic case creation ──────────────────────────────────
//
// ⚠️ §1: confirming a screening creates nothing. A human must open the
// case explicitly.

describe('C. nothing creates a case automatically', () => {
  // ⚠️ 042's confirming RPC is NOT REDEFINED here, so it cannot have
  // gained a branch that inserts a case. The same guard 042 made of
  // `track_complaint` and `complaint_queue`.
  it('does not redefine any screening function', () => {
    ;['confirm_complaint_screening', 'prepare_complaint_screening',
      'complaint_screenings_for', 'complaint_screening_is_visible_to_caller',
      'complaint_screening_checklist_keys']
      .forEach((name) => {
        expect(code).not.toMatch(
          new RegExp(`create or replace function public\\.${name}\\b`),
        )
      })
  })

  // ⚠️ NO TRIGGER ON A SCREENING OR A COMPLAINT, which is the other way
  // an automatic creation could arrive.
  it('puts no trigger on complaint_screenings or complaints', () => {
    const triggers = [...code.matchAll(/create trigger\s+(\w+)[\s\S]*?on public\.(\w+)/g)]
      .map((m) => ({ name: m[1], table: m[2] }))
    triggers.forEach((t) => {
      expect(['kp_cases', 'kp_hearings']).toContain(t.table)
    })
    expect(triggers).toHaveLength(3)
  })

  // ⚠️ THE ONLY INSERT TARGETS ARE THIS PHASE'S OWN FOUR TABLES. An
  // insert into `complaint_status_history` would hand the FILING
  // RESIDENT the barangay's internal case administration, because that
  // table's own reader admits them -- the exact defect 042 avoided.
  it('inserts only into its own four tables', () => {
    const targets = [...code.matchAll(/insert into public\.(\w+)/gi)].map((m) => m[1])
    expect(new Set(targets)).toEqual(new Set([
      'kp_cases', 'kp_case_panel', 'kp_hearings', 'kp_hearing_attendance',
    ]))
  })

  it('writes no complaint status history and no activity log', () => {
    expect(code).not.toContain('complaint_status_history')
    expect(code).not.toContain('activity_log')
    expect(code).not.toContain('notifications')
  })

  // ⚠️ AND `complaints.status` IS NOT WIDENED AGAIN. A complaint that
  // became a case still reads `screened`, because that is the stage the
  // COMPLAINT reached -- Complaint != Screening != KP Case, and two
  // columns meaning one fact is what §1 forbids.
  it('does not widen or write the complaint status', () => {
    expect(code).not.toMatch(/complaints_status_check/)
    expect(code).not.toMatch(/update public\.complaints\b/)
  })
})

// ── D. Duplicate case creation is prevented ────────────────────────

describe('D. one case per complaint', () => {
  // ⚠️ THE DATABASE HOLDS IT, with a UNIQUE on `complaint_id` -- so a
  // concurrent second call is refused even if the readable check below
  // raced past.
  it('makes complaint_id unique on kp_cases', () => {
    expect(code).toMatch(/complaint_id uuid not null[\s\S]{0,200}?unique/)
  })

  // ⚠️ AND A READABLE REFUSAL COMES FIRST, so the ordinary case gets a
  // sentence rather than a raw `23505`. Both, not either: the check is
  // the message and the constraint is the guarantee.
  it('refuses a second case with a sentence before the constraint', () => {
    expect(fnBody('open_kp_case')).toMatch(/already been opened/)
  })

  it('restricts rather than cascades on the complaint it came from', () => {
    expect(code).toMatch(/references public\.complaints\(id\) on delete restrict/)
  })
})

// ── E. Every privileged write is gated in the database ─────────────
//
// ⚠️ §2 and §8. The gate is `current_official_holds_position()`, which
// resolves through the private `official_account_links` mapping -- never
// a name, never `committee`.

describe('E. position gates', () => {
  it('gates opening a case and recording an outcome on the Punong Barangay', () => {
    ;['open_kp_case', 'record_kp_hearing_outcome'].forEach((name) => {
      const body = fnBody(name)
      expect(body).toMatch(/current_official_holds_position\('Punong Barangay'\)/)
      expect(body).not.toMatch(/current_official_holds_position\('Barangay Secretary'\)/)
    })
  })

  it('gates the three administrative writers on either position', () => {
    ;['assign_kp_panel_member', 'schedule_kp_hearing',
      'update_kp_hearing_record', 'record_kp_attendance'].forEach((name) => {
      const body = fnBody(name)
      expect(body).toMatch(/current_official_holds_position\('Barangay Secretary'\)/)
      expect(body).toMatch(/current_official_holds_position\('Punong Barangay'\)/)
    })
  })

  // ⚠️ `barangay_officials.committee` IS DESCRIPTIVE DATA, NOT
  // AUTHORIZATION DATA, and this is the standing rule P3-A established.
  // A real `Peace and Order and Appropriation` value exists on one
  // Kagawad; the column is free text with no CHECK that ANY official may
  // write on ANY row, and `protect_official_record()` does not guard it
  // -- so authorizing on it would reproduce migration 028's escalation
  // on an unguarded column.
  it('reads committee nowhere', () => {
    expect(code).not.toContain('committee')
  })

  it('reads full_name as an identity key nowhere', () => {
    expect(code).not.toMatch(/\.full_name\s*=\s*\w+\.full_name/)
    expect(code).not.toMatch(/where\s+full_name\s*=/)
  })

  // ⚠️ §8: do not broaden `is_official()`. It is not called at all here,
  // so it could not have been.
  it('does not call or redefine is_official', () => {
    expect(code).not.toContain('is_official')
  })

  // ⚠️ AND NOTHING SELECTS THE MAPPING DIRECTLY. `official_account_links`
  // is private and every authorization path reaches it only through the
  // one predicate that answers a boolean about the caller.
  it('selects official_account_links nowhere', () => {
    expect(code).not.toContain('official_account_links')
  })

  // ⚠️ THE ACTOR IS NEVER A PARAMETER. Every `*_by` column is stamped
  // from `auth.uid()`, so there is nothing a crafted call could forge.
  it('stamps every actor from auth.uid() rather than taking one', () => {
    ;['open_kp_case', 'assign_kp_panel_member', 'schedule_kp_hearing',
      'update_kp_hearing_record', 'record_kp_attendance',
      'record_kp_hearing_outcome'].forEach((name) => {
      expect(fnBody(name)).toContain('auth.uid()')
    })
    expect(code).not.toMatch(/p_(opened_by|scheduled_by|recorded_by|actor|assigned_by)/)
  })
})

// ── F. The four tables are private at BOTH layers ──────────────────
//
// ⚠️ RLS FILTERS ROWS; IT CANNOT RESTRICT COLUMNS, and a case file needs
// a column rule -- an ordinary official must read nothing while the
// Secretary reads the minutes. So the tables carry no policy at all and
// are reached only through the gated readers. 019A's two-barrier
// pattern, and `get_advisors` reports `rls_enabled_no_policy` on all
// four, which is exactly what a private table looks like.

describe('F. private tables', () => {
  const TABLES = ['kp_cases', 'kp_case_panel', 'kp_hearings', 'kp_hearing_attendance']

  it('enables RLS on every one', () => {
    TABLES.forEach((t) => {
      expect(code).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
    })
  })

  it('creates no policy on any of them', () => {
    expect(code).not.toMatch(/create policy/i)
  })

  it('revokes every client privilege on every one', () => {
    TABLES.forEach((t) => {
      expect(code).toMatch(
        new RegExp(`revoke all on table public\\.${t} from anon, authenticated, public`),
      )
    })
  })
})

// ── G. The execute surface, closed at creation ─────────────────────
//
// ⚠️ `REVOKE ... FROM PUBLIC` IS THE LOAD-BEARING HALF, and MASTER-B's
// lesson is applied at creation rather than in a later phase.
// `pg_default_acl` for `postgres` creating FUNCTIONs in `public` grants
// `anon`, `authenticated` and `service_role` BY NAME, and PostgreSQL's
// own function default adds a bare PUBLIC entry on top -- so revoking
// the named roles alone would leave `has_function_privilege('anon', ...)`
// TRUE through PUBLIC. That was migration 038's whole finding.

describe('G. the execute surface', () => {
  const ALL = [
    'generate_kp_case_reference(int)',
    'stamp_kp_case_reference()',
    'protect_kp_record()',
    'kp_case_is_visible_to_caller(uuid)',
    'open_kp_case(uuid, text)',
    'assign_kp_panel_member(uuid, text, text)',
    'schedule_kp_hearing(uuid, text, date, time, text, text, text)',
    'update_kp_hearing_record(uuid, text, text, text)',
    'record_kp_attendance(uuid, uuid, text, text)',
    'record_kp_hearing_outcome(uuid, text, text, boolean)',
    'kp_case_for_complaint(uuid)',
    'kp_hearings_for(uuid)',
    'kp_hearing_attendance_for(uuid)',
    'kp_case_parties_for(uuid)',
    'kp_case_panel_for(uuid)',
  ]

  const esc = (s) => s.replace(/[().,[\]*+?^${}|\\]/g, '\\$&').replace(/\s+/g, '\\s*')

  it('revokes PUBLIC EXECUTE on all fifteen', () => {
    ALL.forEach((sig) => {
      expect(code).toMatch(
        new RegExp(`revoke execute on function public\\.${esc(sig)} from public`),
      )
    })
  })

  it('revokes anon EXECUTE on all fifteen', () => {
    ALL.forEach((sig) => {
      expect(code).toMatch(
        new RegExp(`revoke execute on function public\\.${esc(sig)} from public,\\s*anon`),
      )
    })
  })

  // ⚠️ `anon` GETS NOTHING AT ALL, and is never granted back. There is
  // no public KP tracking page and §7 forbids one.
  it('grants nothing to anon', () => {
    expect(code).not.toMatch(/grant execute on function public\.(kp_|open_kp|assign_kp|schedule_kp|update_kp|record_kp)[\s\S]*?to [^;]*anon/)
  })

  // ⚠️ THE FOUR INTERNAL FUNCTIONS GET NO GRANT EITHER. Two are reached
  // only through triggers and the predicate only from inside these
  // SECURITY DEFINER readers, where the nested EXECUTE check is made as
  // the DEFINER -- migration 034 measured that a trigger fires for a
  // caller holding no EXECUTE on its function.
  it('grants authenticated EXECUTE on exactly the eleven client functions', () => {
    const granted = [...code.matchAll(
      /grant execute on function public\.([\w]+)\([^)]*\) to authenticated/g,
    )].map((m) => m[1]).sort()
    expect(granted).toEqual([
      'assign_kp_panel_member',
      'kp_case_for_complaint',
      'kp_case_panel_for',
      'kp_case_parties_for',
      'kp_hearing_attendance_for',
      'kp_hearings_for',
      'open_kp_case',
      'record_kp_attendance',
      'record_kp_hearing_outcome',
      'schedule_kp_hearing',
      'update_kp_hearing_record',
    ])
    ;['generate_kp_case_reference', 'stamp_kp_case_reference',
      'protect_kp_record', 'kp_case_is_visible_to_caller']
      .forEach((name) => expect(granted).not.toContain(name))
  })

  it('pins search_path on every function it creates', () => {
    const created = [...code.matchAll(
      /create or replace function public\.(\w+)\(/g,
    )].map((m) => m[1])
    expect(created).toHaveLength(15)
    created.forEach((name) => {
      expect(fnBody(name)).toMatch(/set search_path = ''/)
    })
  })

  it('makes every function it creates SECURITY DEFINER', () => {
    const created = [...code.matchAll(
      /create or replace function public\.(\w+)\(/g,
    )].map((m) => m[1])
    created.forEach((name) => {
      expect(fnBody(name)).toMatch(/security definer/)
    })
  })
})

// ── H. One visibility predicate, every reader ──────────────────────
//
// ⚠️ ONE PREDICATE, SIX CALLERS, so the case, the hearings, the
// attendance and the panel cannot drift apart on who may read them --
// the objection migration 031 made to four copies of one join.

describe('H. the readers', () => {
  const READERS = ['kp_case_for_complaint', 'kp_hearings_for',
    'kp_hearing_attendance_for', 'kp_case_parties_for', 'kp_case_panel_for']

  it('gates every reader on the same predicate', () => {
    READERS.forEach((name) => {
      expect(fnBody(name)).toMatch(/public\.kp_case_is_visible_to_caller\(/)
    })
  })

  // ⚠️ ACTORS COME BACK AS DISPLAY NAMES, never as auth identifiers. A
  // reader needs to know who opened and who recorded; a uuid is not
  // that, and publishing one would put an auth identifier on a screen.
  it('returns display names rather than profile ids', () => {
    READERS.forEach((name) => {
      const body = fnBody(name)
      const returns = body.match(/returns table \(([\s\S]*?)\)\s*\nlanguage/)
      expect(returns).not.toBeNull()
      ;['opened_by uuid', 'concluded_by uuid', 'scheduled_by uuid',
        'recorded_by uuid', 'outcome_recorded_by uuid', 'assigned_by uuid',
        'profile_id']
        .forEach((col) => expect(returns[1]).not.toContain(col))
    })
  })

  // ⚠️ NO PARTY CONTACT NUMBER IS RETURNED BY EITHER PARTY READER. P3-A
  // withholds a respondent's contact from the complainant, and nothing
  // in a hearing record needs it -- so it is simply not selected, and a
  // sheet that may be handed to either party cannot print it.
  it('returns no party contact number', () => {
    ;['kp_hearing_attendance_for', 'kp_case_parties_for'].forEach((name) => {
      expect(fnBody(name)).not.toContain('contact_number_snapshot')
    })
  })

  // ⚠️ AND NO NARRATIVE, CATEGORY OR EVIDENCE PATH. A case reader is not
  // a second way to read the complaint: the category is the accusation
  // and `complaint_queue()` withholds it deliberately.
  it('returns no complaint narrative, category or evidence path', () => {
    READERS.forEach((name) => {
      const body = fnBody(name)
      expect(body).not.toContain('narrative')
      expect(body).not.toContain('category')
      expect(body).not.toContain('object_path')
    })
  })
})

// ── I. The reference ───────────────────────────────────────────────

describe('I. the KP case reference', () => {
  it('is KP-YYYY-XXXXXX and random, never sequential', () => {
    const body = fnBody('generate_kp_case_reference')
    expect(body).toMatch(/'KP-'/)
    expect(body).toMatch(/0123456789ABCDEFGHJKMNPQRSTVWXYZ/)
    expect(body).toMatch(/gen_random_bytes/)
  })

  // ⚠️ A SEQUENTIAL PUBLIC NUMBER TELLS ANYBODY HOLDING ONE THAT THE
  // NEIGHBOURING NUMBERS EXIST, which is the reasoning migration 024
  // recorded for `BCR-` and 040 for `CMP-`.
  it('uses no counter, sequence or padded serial', () => {
    expect(lower).not.toContain('nextval')
    expect(lower).not.toContain('create sequence')
    expect(lower).not.toContain('lpad')
    expect(lower).not.toMatch(/\bserial\b/)
  })

  // ⚠️ `KP-`, NOT A `BC`-ANYTHING. `BCR-` is the court reservation and
  // `CMP-` the complaint; two references sharing a prefix is a hazard
  // when somebody reads one out over the phone.
  it('carries its own prefix, distinct from BCR- and CMP-', () => {
    const body = fnBody('generate_kp_case_reference')
    expect(body).not.toContain("'BCR-'")
    expect(body).not.toContain("'CMP-'")
  })

  // ⚠️ THE CROCKFORD LOOK-ALIKES ARE REMOVED -- I, L, O and U -- so an
  // `O` read for a zero cannot be stored in the first place.
  it('excludes the Crockford look-alikes', () => {
    const alphabet = code.match(/'(0123456789[A-Z]+)'/)
    expect(alphabet).not.toBeNull()
    ;['I', 'L', 'O', 'U'].forEach((ch) => {
      expect(alphabet[1]).not.toContain(ch)
    })
  })

  // ⚠️ SERVER-STAMPED, and whatever the row carried is discarded -- 015's
  // pattern, and the reason the RPC takes no reference parameter.
  it('is stamped by a trigger that discards what the client sent', () => {
    expect(code).toMatch(/create trigger trg_stamp_kp_case_reference/)
    expect(fnBody('stamp_kp_case_reference')).toMatch(/NEW\.reference\s*:=/)
  })
})

// ── J. Immutability, and the human conclusion ──────────────────────

describe('J. a recorded outcome and a concluded case are history', () => {
  it('refuses a change to a concluded case or a settled hearing', () => {
    const body = fnLower('protect_kp_record')
    expect(body).toMatch(/tg_table_name = 'kp_cases'[\s\S]*?concluded/)
    expect(body).toMatch(/tg_table_name = 'kp_hearings'[\s\S]*?outcome is not null/)
  })

  // ⚠️ THE BRANCHES ARE NESTED, AND THIS GUARD EXISTS BECAUSE THE FLAT
  // FORM WAS A REAL DEFECT THAT SHIPPED AND WAS CAUGHT BY PROBING.
  //
  // The first version read, for each table:
  //
  //   IF TG_TABLE_NAME = 'kp_hearings' AND OLD.outcome IS NOT NULL THEN
  //
  // PL/pgSQL hands that whole boolean to the SQL executor, which
  // resolves `OLD.outcome` whether or not the left side is true -- and
  // on a `kp_cases` row there is no such column. So EVERY API update to
  // a case raised `42703 record "old" has no field "outcome"`, which
  // broke `schedule_kp_hearing()` (it moves the case `open` ->
  // `in_process`) and concluding a case.
  //
  // ⚠️ NO JEST TEST COULD HAVE CAUGHT THE BEHAVIOUR -- it is runtime
  // PL/pgSQL on a live table and this suite runs no SQL. What a source
  // guard CAN hold is the SHAPE that caused it, so this asserts the
  // field is only ever named inside a branch for the table that has it.
  // Run both directions: flattening either branch back to an `AND`
  // fails here.
  it('names each table-specific column only inside that table branch', () => {
    const body = fnLower('protect_kp_record')

    // No flat `AND` reaching across a table test into a column.
    expect(body).not.toMatch(/tg_table_name = '\w+'\s+and\s+old\./)

    // `OLD.outcome` appears only after the kp_hearings branch opens.
    const hearingsAt = body.indexOf("tg_table_name = 'kp_hearings'")
    expect(hearingsAt).toBeGreaterThan(-1)
    expect(body.indexOf('old.outcome')).toBeGreaterThan(hearingsAt)

    // and `OLD.status` only after the kp_cases branch opens.
    const casesAt = body.indexOf("tg_table_name = 'kp_cases'")
    expect(casesAt).toBeGreaterThan(-1)
    expect(body.indexOf('old.status')).toBeGreaterThan(casesAt)
    expect(body.indexOf('old.status')).toBeLessThan(hearingsAt)
  })

  // ⚠️ ONE FUNCTION, TWO TRIGGERS, branching on `TG_TABLE_NAME` -- the
  // shape migration 029 used. Two functions doing one job would be two
  // places for the rule to drift.
  it('uses one function for both tables', () => {
    expect(code).toMatch(/create trigger trg_protect_kp_case[\s\S]*?protect_kp_record\(\)/)
    expect(code).toMatch(/create trigger trg_protect_kp_hearing[\s\S]*?protect_kp_record\(\)/)
  })

  // ⚠️ THE TRUSTED-CALLER TEST IS THE ONE EVERY `protect_*` TRIGGER IN
  // THIS PROJECT USES. Without it the SQL Editor locks itself out of its
  // own tables, which is what the first version of 008's triggers did.
  it('lets a direct connection and the service role through', () => {
    expect(fnBody('protect_kp_record')).toMatch(
      /auth\.role\(\) IS NULL OR auth\.role\(\) = 'service_role'/,
    )
  })

  // ⚠️ WHETHER A CASE IS CONCLUDED IS AN EXPLICIT HUMAN PARAMETER, never
  // derived from the outcome value. A function that concluded the case
  // because the outcome said "resolved" would be deciding that the
  // matter is over.
  it('takes the conclusion as its own parameter', () => {
    const body = fnBody('record_kp_hearing_outcome')
    expect(body).toMatch(/p_concludes_case boolean/)
    expect(body).toMatch(/COALESCE\(p_concludes_case, false\)/)
    // and it is not read off the outcome
    expect(body).not.toMatch(/p_outcome\s*=\s*'resolved_agreement_recorded'[\s\S]{0,200}concluded/)
  })

  // ⚠️ A CONSTRAINT KEEPS THE RECORD HONEST: there is no state in which
  // the database holds a decision nobody made, or a moment nobody acted
  // at. 042's own `confirmation_complete` shape.
  it('cannot hold an outcome without who recorded it and when', () => {
    expect(code).toMatch(/constraint kp_hearings_outcome_complete check/)
    expect(code).toMatch(/constraint kp_cases_conclusion_complete check/)
  })
})

// ── K. No statutory content, and nothing deferred was built ────────

describe('K. no statutory content', () => {
  // ⚠️ WORD BOUNDARIES, measured rather than stylistic: P4-A's first
  // version of this scan reported `tan` inside `circumstance` and `fine`
  // inside `definer`, so every `security definer` matched.
  it('names no penalty, period, deadline or legal instrument', () => {
    ;['penalty', 'fine', 'imprisonment', 'repudiation', 'prescriptive',
      'statutory', 'contempt', 'subpoena', 'sanction']
      .forEach((term) => {
        expect(lower).not.toMatch(new RegExp(`\\b${term}\\b`))
      })
  })

  // ⚠️ NO NUMERIC COMPARISON IN ANY CHECK, because a threshold is a
  // number. The one numeric guard in the file is the panel size, which
  // is a panel size rather than a period -- asserted by name.
  it('puts no numeric comparison in any CHECK', () => {
    const checks = [...code.matchAll(/constraint \w+ check \(([\s\S]*?)\n  \)/g)]
      .map((m) => m[1])
    expect(checks.length).toBeGreaterThan(5)
    checks.forEach((body) => {
      expect(body).not.toMatch(/[<>]=?\s*\d|\d\s*[<>]=?/)
    })
  })

  // ⚠️ SCOPED PAST THE REFERENCE GENERATOR, AND THAT IS MY OWN SCAN
  // CORRECTED. The first version ran over the whole file and reported
  // 6, 5, 32 and 10 -- six random bytes, a 0..5 loop, the Crockford
  // alphabet's own length, and a retry ceiling. Those are the
  // reference's mechanics, not a period or a threshold, and a blunt
  // numeric scan over a whole file reports the file's own arithmetic.
  // The labels module's test needed the same correction for regex
  // quantifiers and 12-hour clock arithmetic.
  //
  // The property is that no number functions as a PERIOD, a DEADLINE or
  // a THRESHOLD, so the scan covers everything except the one function
  // whose whole job is arithmetic -- and the numeric-comparison guard
  // above already covers every CHECK.
  it('counts a panel, and no other number outside the reference generator', () => {
    const generator = fnBody('generate_kp_case_reference')
    const rest = exec.replace(generator, '')
    const numbers = [...rest.matchAll(/\b(\d+)\b/g)].map((m) => m[1])
    expect(new Set(numbers.filter((n) => n !== '1' && n !== '0')))
      .toEqual(new Set(['3']))
    expect(rest).toMatch(/>= 3/)   // the panel limit, and nothing else
  })

  // ⚠️ §10, named individually so a failure says which stage appeared.
  it('builds none of the deferred stages', () => {
    ;['settlement', 'certificate to file', 'certificate_to_file',
      'jurisdiction', 'blotter', 'tanod', 'heatmap', 'gps', 'latitude',
      'longitude', 'sms', 'email']
      .forEach((term) => expect(lower).not.toContain(term))
  })

  // ⚠️ AND IT TOUCHES NOTHING IT WAS TOLD NOT TO. Named rather than
  // assumed, because each one is a surface a resident or the public can
  // reach.
  it('does not touch the resident or public complaint surfaces', () => {
    ;['track_complaint', 'complaint_queue', 'complaint_parties_for',
      'complaint_history_for', 'file_complaint_as_resident',
      'encode_walk_in_complaint', 'record_complaint_attachment']
      .forEach((name) => {
        expect(code).not.toMatch(
          new RegExp(`create or replace function public\\.${name}\\b`),
        )
      })
  })

  // ⚠️ AND NOTHING ABOUT THE COURT OR THE PUROKS. §4 says to reuse
  // existing calendar patterns WITHOUT breaking court reservations, and
  // the safest form of that is not to touch them at all.
  it('touches no reservation, availability or purok object', () => {
    ;['reservations', 'official_availability', 'kapitan_availability',
      'get_reservation_slots', 'purok', 'puroks']
      .forEach((name) => expect(exec).not.toContain(name))

    // ⚠️ And the migration's own `comment on` text SAYS it does not touch
    // them -- which is why the scan above runs over `exec`. Asserted
    // rather than merely excused, so scoping the scan did not remove the
    // record it was tripping on.
    expect(code).toMatch(/does not touch reservations or official_availability/i)
  })
})
