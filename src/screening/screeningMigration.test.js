// P4-A. Source-reading guards over migration 042 — the security SHAPE of
// the screening, which is the half of this phase Jest can see.
//
// ─── ⚠️ WHAT THESE TESTS PROVE, AND WHAT THEY DO NOT ─────────────────
//
// They do NOT prove the authorization. Who may prepare and who may
// confirm is a SECURITY DEFINER position gate resolved through a private
// table, and only SQL can prove a position gate — the role-impersonation
// matrix for all eight callers lives in this phase's report, measured
// against the live database inside blocks that always abort.
//
// What is pinned here is what a scan can prove and a later edit could
// quietly break: that the gate is the position helper and never a name
// or a committee, that the actor and the timestamps are server-derived,
// that no function turns answers into a decision, that no KP case is
// created, that no legal threshold is encoded, that history stays
// append-only, and that PUBLIC EXECUTE is revoked on every new function.
//
// ⚠️ EVERY "IS NOT USED" SCAN RUNS OVER COMMENT-STRIPPED CODE, because
// this migration discusses `committee`, `full_name`, `kp_cases`,
// `eligible` and every statutory term at length precisely to record that
// none of them is read or encoded. A scan that trusts its own hit count
// reports a rule where there is a paragraph explaining its absence —
// the trap that produced false findings in MASTER-A A5 and A6.

import fs from 'fs'
import path from 'path'
import {
  ANSWER_VALUES, CHECKLIST_VERSION, SCREENING_OUTCOME_VALUES,
} from './screeningChecklist'

const DIR = path.join(__dirname, '..', '..', 'supabase-migrations')
const FILE = path.join(DIR, '042_kp_screening_foundation.sql')

const raw = fs.readFileSync(FILE, 'utf8')
const code = raw.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const lower = code.toLowerCase()

const fn = (name) => {
  const m = code.match(
    new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$function\\$;`),
  )
  expect(m).not.toBeNull()
  return m[0]
}

// ── A. The migration is one file, and it is the next number ──────────

describe('A. the migration', () => {
  // ⚠️ REDEFINED BY COMBINED PHASE 1, AND IT IS A DEFINITION CHANGE
  // RATHER THAN A LOOSENED ASSERTION. This read "is 042 and there is no
  // 043", which asserted two different things: that P4-A added exactly
  // ONE file at the next number — still true, still asserted below — and
  // that nothing came after it, which was a statement about the
  // repository's present and stopped being true when 043 landed.
  //
  // ⚠️ The newest-file guard did not disappear; it MOVED to the phase
  // that owns the newest file. `kpCaseMigration.test.js` asserts 043 is
  // last and there is no 044, so a later phase that adds one without a
  // test still fails — which is the property this clause was for.
  it('is 042, and P4-A added exactly one file at the next number', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(files[41]).toBe('042_kp_screening_foundation.sql')
    expect(files.filter((f) => f.startsWith('042'))).toHaveLength(1)
  })

  it('records in its header that it was applied, and how', () => {
    const header = raw.slice(0, raw.indexOf('alter table'))
    expect(header).toMatch(/APPLIED/)
    expect(header).toMatch(/2026-10-16/)
  })

  // ⚠️ ONE NEW TABLE, and it is the one the brief named. A phase that
  // reached for a second would fail here.
  it('creates exactly one table, complaint_screenings', () => {
    const tables = [...code.matchAll(/create table (?:if not exists )?public\.(\w+)/g)]
      .map((m) => m[1])
    expect(tables).toEqual(['complaint_screenings'])
  })

  // ⚠️ §7: `kp_jurisdiction_rules` is NOT created in P4-A, and §15: no
  // `kp_cases` row. §21: no capability table. Named individually so a
  // failure says which one appeared.
  it('creates none of the tables this phase is forbidden', () => {
    ;['kp_jurisdiction_rules', 'kp_cases', 'kp_case', 'complaint_capabilities',
      'official_capabilities', 'capability_assignments', 'incidents',
      'blotter', 'tanod', 'hearings', 'summons', 'settlements', 'puroks']
      .forEach((t) => {
        expect(lower).not.toContain(`create table public.${t}`)
        expect(lower).not.toContain(`create table if not exists public.${t}`)
      })
  })

  // ⚠️ SCOPED TO THE 41 THAT PRECEDE IT, not to "everything that is not
  // 042". The original filter said `!startsWith('042')` and so counted
  // every LATER file too, which made it an assertion about the future
  // rather than about what P4-A left alone.
  it('leaves 001-041 alone', () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    // The 41 that existed before this phase, by name, unchanged.
    expect(files.filter((f) => f < '042')).toHaveLength(41)
    expect(files[0]).toMatch(/^001_/)
    expect(files[40]).toMatch(/^041_/)
  })
})

// ── B. Three CHECKs widened together ─────────────────────────────────
//
// ⚠️ THREE, NOT ONE, and finding that out took reading the live catalog
// rather than this project's own reports: `complaint_status_history` has
// its OWN from_status and to_status CHECKs, each of which also permitted
// only `received`. Widening `complaints_status_check` alone would have
// moved the complaint and then failed on the history INSERT in the same
// statement — migration 016's two-gates lesson, where the vocabulary was
// widened without the trigger that gates who may say the words.

describe('B. the status vocabulary', () => {
  it('widens all three CHECKs to the same three values', () => {
    const triple = /array\['received', 'under_review', 'screened'\]/g
    expect((code.match(triple) || []).length).toBeGreaterThanOrEqual(3)
    ;['complaints_status_check',
      'complaint_status_history_from_status_check',
      'complaint_status_history_to_status_check']
      .forEach((c) => {
        expect(code).toContain(`drop constraint ${c}`)
        expect(code).toContain(`add constraint ${c}`)
      })
  })

  // ⚠️ WIDENED, NEVER NARROWED. A CHECK is revalidated on every UPDATE,
  // so dropping a value a stored row carries would make that row
  // un-editable — the reason migration 021 is a trigger branch rather
  // than a constraint.
  it('keeps received, so every stored row stays editable', () => {
    const adds = [...code.matchAll(/add constraint (\w+)\s+check \(([\s\S]*?)\);/g)]
    const statusChecks = adds.filter(([, name]) => name.includes('status_check'))
    expect(statusChecks).toHaveLength(3)
    statusChecks.forEach(([, , expr]) => expect(expr).toContain("'received'"))
  })

  // ⚠️ THE STATUS IS THE STAGE, NOT THE DECISION. §14: the complaint
  // status must not duplicate the screening outcome. So no status value
  // is an outcome value, in either direction.
  it('names no screening outcome as a status', () => {
    const adds = code.match(/add constraint complaints_status_check[\s\S]*?\);/)[0]
    SCREENING_OUTCOME_VALUES.forEach((v) => expect(adds).not.toContain(v))
    ;['eligible', 'ineligible', 'referred', 'closed', 'settled', 'dismissed',
      'proceed', 'mediation', 'conciliation']
      .forEach((t) => expect(adds.toLowerCase()).not.toContain(t))
  })

  // ⚠️ And no speculative legal rule went into a CHECK — §9 forbids it
  // explicitly, and a CHECK is the worst place to put a guess because
  // revalidation makes it retroactive.
  it('puts no legal rule in any CHECK constraint', () => {
    const checks = [...code.matchAll(/constraint \w+ check \(([\s\S]*?)\)[,;]/g)]
      .map((m) => m[1]).join(' ').toLowerCase()
    ;['imprison', 'penalty', 'fine', 'peso', 'republic act', 'article',
      'section ', 'repudiat', 'certificate_to_file', 'jurisdiction',
      'eligible', 'lupon', 'pangkat', 'days', 'months', 'years']
      .forEach((t) => expect(checks).not.toContain(t))
    // No bare number in a CHECK either: a threshold is a number.
    expect(checks).not.toMatch(/[<>]=?\s*\d/)
  })
})

// ── C. The table is private, both barriers ───────────────────────────

describe('C. complaint_screenings is private', () => {
  it('enables RLS and declares zero policies', () => {
    expect(code).toContain(
      'alter table public.complaint_screenings enable row level security',
    )
    expect(lower).not.toContain('create policy')
  })

  // ⚠️ 019A's two-barrier pattern. The privilege layer answers first with
  // `42501`; RLS alone would return an empty set, which cannot be told
  // apart from "there are no rows".
  it('revokes every table privilege from anon, authenticated and PUBLIC', () => {
    expect(code).toMatch(
      /revoke all on table public\.complaint_screenings from anon, authenticated, public;/,
    )
  })

  it('grants no table privilege back to any client role', () => {
    const grants = [...code.matchAll(/grant [^;]*on table[^;]*;/g)].map((m) => m[0])
    expect(grants).toHaveLength(0)
  })
})

// ── D. The row records a version, an actor and a time ────────────────

describe('D. what a screening row carries', () => {
  const table = code.match(
    /create table if not exists public\.complaint_screenings \(([\s\S]*?)\n\);/,
  )[1]

  // ⚠️ §7: a checklist version on EVERY row. Without it, answers keyed to
  // a question that was later reworded become unreadable rather than
  // historical, and a key that no longer exists cannot be told from one
  // nobody answered.
  it('records the checklist version, not null, and constrains it', () => {
    expect(table).toMatch(/checklist_version text not null/)
    expect(table).toMatch(
      /constraint complaint_screenings_version_check check \(\s*checklist_version = any \(array\['v1'\]\)/,
    )
    expect(CHECKLIST_VERSION).toBe('v1')
  })

  // ⚠️ §11: server-derived, with no client-supplied official id anywhere.
  it('stamps prepared_by and prepared_at server-side', () => {
    expect(table).toMatch(/prepared_by uuid not null\s*\n\s*references public\.profiles\(id\)/)
    expect(table).toMatch(/prepared_at timestamptz not null default now\(\)/)
    // And the writing RPC takes neither as a parameter.
    const sig = fn('prepare_complaint_screening').split('as $function$')[0]
    ;['prepared_by', 'prepared_at', 'p_prepared', 'p_official',
      'p_actor', 'p_profile', 'p_status', 'p_outcome', 'p_confirmed']
      .forEach((p) => expect(sig).not.toContain(p))
  })

  it('stamps confirmed_by and confirmed_at server-side', () => {
    const body = fn('confirm_complaint_screening')
    expect(body).toMatch(/confirmed_by = v_uid/)
    expect(body).toMatch(/confirmed_at = now\(\)/)
    const sig = body.split('as $function$')[0]
    ;['p_confirmed_by', 'p_confirmed_at', 'p_actor', 'p_official',
      'p_profile', 'p_prepared_by']
      .forEach((p) => expect(sig).not.toContain(p))
  })

  // ⚠️ §6's required distinction, held by a constraint rather than by
  // convention: there is no state in which the database holds a decision
  // nobody made or a moment nobody acted at.
  it('cannot hold an outcome without the person and the moment', () => {
    expect(table).toMatch(/constraint complaint_screenings_confirmation_complete check/)
    const c = table.match(
      /constraint complaint_screenings_confirmation_complete check \(([\s\S]*?)\n  \),/,
    )[1]
    expect(c).toContain('confirmed_outcome is null and confirmed_by is null and confirmed_at is null')
    expect(c).toContain('confirmed_outcome is not null and confirmed_by is not null and confirmed_at is not null')
  })

  // ⚠️ SYSTEM FLAG vs HUMAN CONFIRMED OUTCOME, §6. They are separate
  // columns: `recommendation` is what the Secretary suggested,
  // `confirmed_outcome` is what the Punong Barangay decided, and the
  // second is never written by the function that writes the first.
  it('keeps the recommendation and the confirmed outcome in separate columns', () => {
    expect(table).toMatch(/\n  recommendation text,/)
    expect(table).toMatch(/\n  confirmed_outcome text,/)
    // Preparing writes the recommendation and never the outcome.
    const prepare = fn('prepare_complaint_screening')
    expect(prepare).toContain('recommendation')
    expect(prepare).not.toMatch(/confirmed_outcome\s*=/)
    expect(prepare).not.toMatch(/confirmed_by\s*=/)
    expect(prepare).not.toMatch(/confirmed_at\s*=/)
  })

  // ⚠️ §11: a redone screening preserves history. The partial unique
  // index permits one OPEN row per complaint, so a revision edits the
  // draft and a re-screen inserts a new row — a confirmed one is never
  // rewritten.
  it('permits one open screening per complaint and keeps confirmed ones', () => {
    expect(code).toMatch(
      /create unique index if not exists complaint_screenings_one_open_per_complaint\s*\n\s*on public\.complaint_screenings \(complaint_id\)\s*\n\s*where confirmed_at is null;/,
    )
  })

  it('restricts rather than cascades on both foreign keys', () => {
    expect((table.match(/on delete restrict/g) || []).length).toBeGreaterThanOrEqual(3)
    expect(table).not.toContain('on delete cascade')
  })
})

// ── E. The gate is the position helper, and nothing else ─────────────

describe('E. authorization', () => {
  // ⚠️ §12 and §19: the existing proven helper, resolved through
  // `official_account_links`. Not a committee, not a name, not a
  // frontend flag.
  it('gates preparing on the Barangay Secretary position', () => {
    const body = fn('prepare_complaint_screening')
    expect(body).toContain(
      "public.current_official_holds_position('Barangay Secretary')",
    )
  })

  it('gates confirming on the Punong Barangay position, in the database', () => {
    const body = fn('confirm_complaint_screening')
    expect(body).toContain(
      "public.current_official_holds_position('Punong Barangay')",
    )
  })

  // ⚠️ §12: THE SECRETARY MUST NOT CONFIRM THEIR OWN PREPARATION, and
  // this is in SQL rather than only in the UI.
  it('refuses a confirmation by the official who prepared it', () => {
    const body = fn('confirm_complaint_screening')
    expect(body).toContain('v_prepared_by = v_uid')
    expect(body).toMatch(/cannot be confirmed by the official who prepared it/i)
  })

  it('refuses re-confirming an already confirmed screening', () => {
    const body = fn('confirm_complaint_screening')
    expect(body).toContain('v_confirmed_at IS NOT NULL')
    expect(body).toMatch(/already been confirmed/i)
  })

  it('refuses an unsigned caller before anything else', () => {
    ;['prepare_complaint_screening', 'confirm_complaint_screening'].forEach((name) => {
      const body = fn(name)
      expect(body).toContain('v_uid uuid := auth.uid()')
      expect(body).toMatch(/IF v_uid IS NULL THEN/)
    })
  })

  // ⚠️ §2 AND §18: the real `Peace and Order and Appropriation` value on
  // one Kagawad grants nothing. `committee` is free text with no CHECK,
  // the Edit Official form sends it for any row, and
  // `protect_official_record()` does not guard it — so authorizing on it
  // would reproduce migration 028's escalation on an unguarded column.
  it('reads no committee and no name for any decision, and hardcodes no person', () => {
    expect(lower).not.toContain('committee')
    expect(lower).not.toContain('full_name =')
    expect(lower).not.toContain("= p.full_name")
    expect(lower).not.toContain("profiles.full_name =")
    // ⚠️ NO OFFICIAL'S NAME ANYWHERE, from the live directory -- and
    // matched on WORD BOUNDARIES rather than as substrings, which is my
    // own scan corrected rather than a weakened one. The first version
    // used `toContain` and reported a hit on `tan`, which is inside
    // `circumstance` -- a checklist key. That is the `Badminton`/`admin`
    // trap migration 036 recorded verbatim: a scan that trusts its own
    // hit count reports a person where there is a word.
    ;['harold', 'baroy', 'frankie', 'credo', 'alexis', 'theress', 'tan',
      'adelina', 'fabillar', 'remata', 'jeffrey', 'duran', 'katada']
      .forEach((n) => expect(lower).not.toMatch(new RegExp(`\\b${n}\\b`)))
    expect(lower).not.toContain('peace and order')
  })

  // ⚠️ `full_name` IS read, once, and it is DISPLAY data: the reader
  // function returns who prepared and who confirmed as names rather than
  // as auth identifiers. That is a projection, not an identity join, and
  // the scan above is what tells the two apart.
  it('reads full_name only as a display projection in the reader', () => {
    const hits = code.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /full_name/.test(l))
    expect(hits.length).toBeGreaterThan(0)
    hits.forEach(([, l]) => expect(l).toMatch(/AS (prepared|confirmed)_by_name/))
    const reader = fn('complaint_screenings_for')
    expect(reader).toContain('pp.full_name AS prepared_by_name')
    expect(reader).toContain('pc.full_name AS confirmed_by_name')
  })

  // ⚠️ NARROWER THAN THE COMPLAINT PREDICATE, and reusing that one would
  // have been a privacy defect: `complaint_is_visible_to_caller()` admits
  // the FILING RESIDENT, and a complainant must not read the barangay's
  // internal review of their own complaint — which records whether a
  // matter possibly involves a minor or is a possible VAWC matter.
  it('uses its own visibility predicate, narrower than the complaint one', () => {
    const pred = fn('complaint_screening_is_visible_to_caller')
    expect(pred).toContain("current_official_holds_position('Barangay Secretary')")
    expect(pred).toContain("current_official_holds_position('Punong Barangay')")
    expect(pred).not.toContain('filed_by_profile_id')
    expect(pred).not.toContain('complaint_is_visible_to_caller')
    // And the reader is gated on the narrow one, not the complaint one.
    const reader = fn('complaint_screenings_for')
    expect(reader).toContain('public.complaint_screening_is_visible_to_caller(p_complaint_id)')
    expect(reader).not.toContain('public.complaint_is_visible_to_caller')
  })

  // ⚠️ §19: a secure search_path on every function, and SECURITY DEFINER
  // only where reading the private mapping requires it.
  it('sets an explicit empty search_path on every new function', () => {
    const defs = [...code.matchAll(/create or replace function public\.(\w+)/g)]
      .map((m) => m[1])
    expect(defs).toHaveLength(6)
    defs.forEach((name) => expect(fn(name)).toContain("set search_path = ''"))
  })

  it('declares the key-set function SECURITY INVOKER, since it reads nothing', () => {
    expect(fn('complaint_screening_checklist_keys')).toContain('security invoker')
  })
})

// ── F. PUBLIC EXECUTE is zero, and anon gets nothing ─────────────────
//
// ⚠️ MASTER-B's LESSON, APPLIED AT CREATION RATHER THAN IN A LATER PHASE.
// `pg_default_acl` for `postgres` creating FUNCTIONs in `public` grants
// `anon`, `authenticated` and `service_role` by name, and PostgreSQL's
// own function default adds a bare PUBLIC entry on top — so revoking the
// named roles alone leaves `has_function_privilege('anon', …)` TRUE
// through PUBLIC. That was migration 038's whole finding, and 042 does
// not repeat it.

describe('F. the execute surface', () => {
  const NEW_FUNCTIONS = [
    'complaint_screening_checklist_keys(text)',
    'complaint_screening_is_visible_to_caller(uuid)',
    'prepare_complaint_screening(uuid, text, jsonb, text, text)',
    'confirm_complaint_screening(uuid, text, text)',
    'complaint_screenings_for(uuid)',
    'protect_confirmed_screening()',
  ]

  it('revokes PUBLIC EXECUTE on every function it creates', () => {
    NEW_FUNCTIONS.forEach((sig) => {
      const line = code.split('\n').find(
        (l) => l.includes(`revoke execute on function public.${sig}`),
      )
      expect(line).toBeDefined()
      expect(line).toMatch(/from public[,;]/)
    })
  })

  // ⚠️ `anon` IS REVOKED ON ALL SIX. No anonymous caller has any business
  // with a screening: the public tracking page does not read one, and
  // §16 is that it must not.
  it('revokes anon EXECUTE on every function it creates', () => {
    NEW_FUNCTIONS.forEach((sig) => {
      const line = code.split('\n').find(
        (l) => l.includes(`revoke execute on function public.${sig}`),
      )
      expect(line).toContain('anon')
    })
  })

  // ⚠️ NAMED-ROLE GRANTS ONLY, and the trigger function gets none —
  // nothing calls it over PostgREST, and migration 034 measured that a
  // trigger fires for a caller holding no EXECUTE on its function.
  it('grants authenticated only, and never to the trigger function', () => {
    const grants = [...code.matchAll(/grant execute on function public\.([^;]*?) to ([^;]*);/g)]
      .map((m) => [m[1].trim(), m[2].trim()])
    expect(grants).toHaveLength(5)
    grants.forEach(([, role]) => expect(role).toBe('authenticated'))
    expect(grants.map(([sig]) => sig)).not.toContain('protect_confirmed_screening()')
    expect(code).toMatch(
      /revoke execute on function public\.protect_confirmed_screening\(\) from public, anon, authenticated;/,
    )
  })

  it('grants nothing to anon, PUBLIC or service_role explicitly', () => {
    const grants = [...code.matchAll(/grant execute on function[^;]*;/g)].map((m) => m[0])
    grants.forEach((g) => {
      expect(g).not.toMatch(/\banon\b/)
      expect(g).not.toMatch(/\bpublic;|\bpublic,/)
      expect(g).not.toMatch(/service_role/)
    })
  })
})

// ── G. Nothing decides, and nothing is created downstream ────────────

describe('G. the system decides nothing', () => {
  // ⚠️ THE CORE RULE, §5, asserted as an absence of any function that
  // could do it. No name here, and no body that reads `answers` to
  // produce a recommendation or an outcome.
  it('creates no function that derives jurisdiction or an outcome', () => {
    const defs = [...code.matchAll(/create or replace function public\.(\w+)/g)]
      .map((m) => m[1])
    defs.forEach((n) => {
      expect(n).not.toMatch(
        /jurisdiction|eligib|evaluate|assess|decide|classif|score|conclude|determine|auto/i,
      )
    })
    ;['determine_kp_jurisdiction', 'evaluate_complaint_screening',
      'is_kp_eligible', 'auto_screen_complaint', 'screen_complaint',
      'derive_screening_outcome', 'compute_recommendation']
      .forEach((n) => expect(lower).not.toContain(n))
  })

  // ⚠️ THE OUTCOME IS A PARAMETER A HUMAN CHOSE, and the recommendation
  // too. Neither is read out of `answers` anywhere: the only place
  // `answers` is read at all is the validation loop that checks the keys
  // and the three permitted values.
  it('reads the answers only to validate them, never to conclude', () => {
    const prepare = fn('prepare_complaint_screening')
    // Every read of p_answers is a validation or the stored value.
    const reads = prepare.split('\n').filter((l) => l.includes('p_answers'))
    expect(reads.length).toBeGreaterThan(0)
    reads.forEach((l) => {
      expect(l).toMatch(
        /jsonb_typeof|jsonb_object_keys|p_answers ->>|answers = p_answers|p_answers jsonb|p_answers,|IS NULL/,
      )
    })
    // The confirming function never looks at the answers at all.
    expect(fn('confirm_complaint_screening')).not.toContain('answers')
  })

  // ⚠️ §15: NO `kp_cases` ROW IS CREATED, even when the confirmed outcome
  // is `proceed_to_kp_process`. Complaint, Screening and KP Case stay
  // three distinct lifecycle objects.
  it('creates no KP case, referral, hearing or settlement anywhere', () => {
    const inserts = [...code.matchAll(/insert into public\.(\w+)/gi)].map((m) => m[1])
    expect([...new Set(inserts)].sort())
      .toEqual(['complaint_screenings', 'complaint_status_history'])
  })

  // ⚠️ §5: nothing automatically closes a complaint, issues a referral or
  // converts it into a case. The only UPDATEs are the screening row and
  // the complaint's STAGE.
  it('updates only the screening row and the complaint stage', () => {
    const updates = [...code.matchAll(/update public\.(\w+)/gi)].map((m) => m[1])
    expect([...new Set(updates)].sort())
      .toEqual(['complaint_screenings', 'complaints'])
    // And on `complaints` it writes status and updated_at, nothing else.
    // ⚠️ Case-insensitive: the DDL is lower case and the function bodies
    // are upper case, and my first version matched neither, so it found
    // zero SET blocks and passed its own `toBe(2)` only by failing. A
    // scan that finds nothing proves nothing.
    const sets = [...code.matchAll(/update public\.complaints c\s*\n\s*set ([\s\S]*?)\n\s*where/gi)]
      .map((m) => m[1])
    expect(sets.length).toBe(2)
    sets.forEach((s) => {
      expect(s).toMatch(/status = '(under_review|screened)'/)
      expect(s).toContain('updated_at = now()')
      ;['category', 'narrative', 'reference', 'filed_by', 'encoded_by',
        'location_note', 'intake_channel']
        .forEach((col) => expect(s).not.toContain(col))
    })
  })

  // ⚠️ §9: NO LEGAL THRESHOLD IS HARDCODED anywhere in the file's code.
  // ⚠️ MATCHED ON WORD BOUNDARIES for the same reason as the name scan,
  // and for a worse near miss: `fine` as a substring hits `definer`, so
  // every `security definer` in the file reported as a hardcoded fine.
  // Asking which step produced that -- rather than believing it -- is
  // what kept a correct migration from being "fixed".
  it('hardcodes no penalty threshold, statutory period or legal rule', () => {
    ;['imprisonment', 'penalty', 'penalties', 'fine', 'fines', 'peso',
      'pesos', 'php', 'repudiation', 'repudiated', 'cfa', 'arrest',
      'prosecution', 'court']
      .forEach((t) => expect(lower).not.toMatch(new RegExp(`\\b${t}\\b`)))
    ;['republic act', 'r.a. 7160', 'certificate to file',
      'certificate_to_file', '15 days', '60 days',
      'barangay captain shall']
      .forEach((t) => expect(lower).not.toContain(t))
    // A threshold is a comparison against a number, and there is none
    // anywhere in the file's code.
    expect(code).not.toMatch(/[<>]=?\s*\d/)
  })

  // ⚠️ §13: `settled`, `conciliation` and `certificate_to_file_action` are
  // not created, and nor is a legal conclusion. The four values the
  // database does accept are this system's own vocabulary.
  it('accepts exactly the four outcomes and none of the forbidden ones', () => {
    const c = code.match(
      /constraint complaint_screenings_outcome_check check \(([\s\S]*?)\n  \),/,
    )[1]
    SCREENING_OUTCOME_VALUES.forEach((v) => expect(c).toContain(`'${v}'`))
    expect((c.match(/'[a-z_]+'/g) || [])).toHaveLength(4)
    ;['settled', 'conciliation', 'certificate_to_file_action', 'eligible',
      'ineligible', 'dismissed']
      .forEach((v) => expect(c).not.toContain(v))
  })

  it('accepts the same four for the recommendation, and no fifth', () => {
    const c = code.match(
      /constraint complaint_screenings_recommendation_check check \(([\s\S]*?)\n  \),/,
    )[1]
    expect((c.match(/'[a-z_]+'/g) || [])).toHaveLength(4)
    SCREENING_OUTCOME_VALUES.forEach((v) => expect(c).toContain(`'${v}'`))
  })

  it('permits exactly the three answers a human can give', () => {
    const prepare = fn('prepare_complaint_screening')
    expect(prepare).toContain("NOT IN ('yes', 'no', 'unknown')")
    expect(ANSWER_VALUES).toEqual(['yes', 'no', 'unknown'])
  })
})

// ── H. History stays append-only, and carries no outcome ─────────────

describe('H. complaint_status_history', () => {
  // ⚠️ APPEND-ONLY AT BOTH LAYERS, and 042 keeps it that way: it adds no
  // policy and no privilege, and it only ever INSERTs.
  it('is only ever inserted into, never updated or deleted', () => {
    expect(code).toContain('INSERT INTO public.complaint_status_history')
    expect(lower).not.toMatch(/update public\.complaint_status_history/)
    expect(lower).not.toMatch(/delete from public\.complaint_status_history/)
    expect(lower).not.toMatch(/grant [^;]*complaint_status_history/)
  })

  // ⚠️ THE LOAD-BEARING ONE. `complaint_history_for()`'s own predicate
  // admits the FILING RESIDENT, so a note carrying the outcome would hand
  // the complainant the barangay's internal conclusion by a side door.
  // The notes say that a thing happened and nothing about what was
  // decided.
  it('writes a note that carries no outcome and no reasoning', () => {
    const notes = [...code.matchAll(
      /VALUES \([^)]*?'(?:under_review|screened)', v_uid,\s*\n?\s*'([^']*)'\)/g,
    )].map((m) => m[1])
    expect(notes).toHaveLength(2)
    notes.forEach((note) => {
      const n = note.toLowerCase()
      SCREENING_OUTCOME_VALUES.forEach((v) => expect(n).not.toContain(v))
      ;['proceed', 'refer', 'close', 'eligible', 'ineligible', 'dismiss',
        'minor', 'vawc', 'violence', 'family', 'serious', 'offense',
        'jurisdiction', 'recommend']
        .forEach((t) => expect(n).not.toContain(t))
    })
    expect(notes[0]).toMatch(/Screening prepared/i)
    expect(notes[1]).toMatch(/Screening confirmed/i)
  })

  // ⚠️ The actor on a history row is server-derived, exactly as 040's own
  // creation RPCs do it, and the no-op guard means revising a draft twice
  // does not file two identical audit rows — migration 022's lesson.
  it('stamps the actor from auth.uid() and appends only on a real transition', () => {
    const prepare = fn('prepare_complaint_screening')
    expect(prepare).toContain("IF v_old_status = 'received' THEN")
    expect(prepare).toMatch(/actor_profile_id, note\)\s*\n\s*VALUES \(p_complaint_id, v_old_status, 'under_review', v_uid,/)
    const confirm = fn('confirm_complaint_screening')
    expect(confirm).toContain("IF v_old_status IS DISTINCT FROM 'screened' THEN")
  })
})

// ── I. A confirmed screening is not directly editable ────────────────

describe('I. the confirmed row is immutable', () => {
  it('has a BEFORE UPDATE trigger refusing any change to a confirmed row', () => {
    expect(code).toMatch(
      /create trigger trg_protect_confirmed_screening\s*\n\s*before update on public\.complaint_screenings/,
    )
    const body = fn('protect_confirmed_screening')
    expect(body).toMatch(/OLD\.confirmed_at IS NOT NULL/)
    expect(body).toMatch(/RAISE EXCEPTION/)
  })

  // ⚠️ The trusted-caller test every `protect_*` trigger in this project
  // uses, measured rather than copied: `auth.role()` is NULL on a direct
  // connection and `service_role` for the service key, and PostgREST
  // always sets a role claim. Without it the SQL Editor locks itself out.
  it('lets a direct connection and service_role through', () => {
    const body = fn('protect_confirmed_screening')
    expect(body).toContain("auth.role() IS NULL OR auth.role() = 'service_role'")
  })

  // ⚠️ And the only writer that could reach a confirmed row refuses it
  // first, so immutability does not rest on the trigger alone.
  it('is refused by the confirming function as well', () => {
    expect(fn('confirm_complaint_screening')).toContain('v_confirmed_at IS NOT NULL')
  })
})

// ── J. Nothing leaks to the resident or the public ───────────────────

describe('J. the screening does not leak', () => {
  // ⚠️ §16: `track_complaint()` MUST STAY NARROW, and 042 does not touch
  // it at all — no CREATE OR REPLACE, no signature change, no new column.
  it('does not change the public tracking RPC', () => {
    expect(lower).not.toContain('create or replace function public.track_complaint')
    expect(lower).not.toContain('drop function public.track_complaint')
  })

  // ⚠️ §17: the safe queue stays safe. 042 does not redefine it, so it
  // still returns its six columns and no category, narrative or party.
  it('does not change the safe queue', () => {
    expect(lower).not.toContain('create or replace function public.complaint_queue')
    expect(lower).not.toContain('create or replace function public.complaint_parties_for')
    expect(lower).not.toContain('create or replace function public.complaint_attachments_for')
    expect(lower).not.toContain('create or replace function public.complaint_history_for')
  })

  // ⚠️ §10: the sensitive answers increase privacy rather than reducing
  // it. They live in `answers` on the private table, and the only reader
  // is gated on the narrow predicate — so there is no path from a
  // sensitive answer to the queue, to tracking, to a notification or to
  // `activity_log`.
  // ⚠️ SCOPED TO WHAT A FUNCTION RETURNS, not to what it mentions. The
  // first version also caught `prepare_complaint_screening`, because its
  // signature declares `p_answers jsonb` -- which is the WRITER taking
  // answers in, the opposite of a reader handing them out. Asking which
  // step produced that hit is what distinguished the two.
  it('surfaces a sensitive answer through the narrow reader and nowhere else', () => {
    const returners = [...code.matchAll(/create or replace function public\.(\w+)/g)]
      .map((m) => m[1])
      .filter((n) => /returns table \([\s\S]*?\banswers jsonb\b/.test(fn(n)))
    expect(returners).toEqual(['complaint_screenings_for'])
    expect(fn('complaint_screenings_for'))
      .toContain('public.complaint_screening_is_visible_to_caller(p_complaint_id)')

    // The writer takes answers IN and returns a uuid, so it cannot hand
    // one back to a caller who may not read them.
    const prepare = fn('prepare_complaint_screening')
    expect(prepare).toContain('p_answers jsonb')
    expect(prepare).toMatch(/\)\s*\nreturns uuid/)
    expect(prepare).not.toMatch(/returns table/)
  })

  // ⚠️ §18: activity_log is DEFERRED AGAIN, deliberately. The domain
  // history is append-only at both layers and records the actor, while
  // `activity_log` is readable by EVERY official — so the only
  // non-identifying thing to log there is already conveyed by the safe
  // queue and the status. Widening it is a two-gate change (the CHECK and
  // `stamp_activity_actor`) and would have to happen in one migration.
  it('writes no activity_log entry and widens neither of its gates', () => {
    expect(lower).not.toContain('activity_log')
    expect(lower).not.toContain('stamp_activity_actor')
  })

  // And no notification, SMS or email: §18's vocabularies are closed
  // CHECKs with no complaint value, and the wording must come from a
  // module that owns it.
  it('writes no notification', () => {
    expect(lower).not.toContain('insert into public.notifications')
    expect(lower).not.toContain('notification')
  })

  it('creates no public VAWC category and no sensitivity column', () => {
    const table = code.match(
      /create table if not exists public\.complaint_screenings \(([\s\S]*?)\n\);/,
    )[1].toLowerCase()
    ;['vawc', 'sensitive', 'sensitivity', 'is_minor', 'band', 'severity']
      .forEach((t) => expect(table).not.toContain(t))
    // The closed complaint category vocabulary is untouched.
    expect(lower).not.toContain('complaints_category_check')
  })
})

// ── K. What this phase deliberately did not build ────────────────────

describe('K. the deferred items stay deferred', () => {
  it('adds no RLS policy anywhere', () => {
    expect(lower).not.toContain('create policy')
    expect(lower).not.toContain('alter policy')
  })

  it('touches no purok anything', () => {
    expect(lower).not.toContain('purok')
    expect(lower).not.toContain('location_note')
  })

  it('touches no bucket and no storage policy', () => {
    expect(lower).not.toContain('storage.')
    expect(lower).not.toContain('complaint-evidence')
  })

  it('touches no MASTER-A or MASTER-B object', () => {
    ;['official_account_links', 'barangay_officials', 'btree_gist',
      'profiles_role_check', 'truncate']
      .forEach((t) => {
        expect(lower).not.toContain(`alter table public.${t}`)
        expect(lower).not.toContain(`create policy`)
      })
    // It CALLS the position helper and never redefines it.
    expect(lower).not.toContain('create or replace function public.current_official_holds_position')
    expect(lower).not.toContain('create or replace function public.is_official')
  })
})
