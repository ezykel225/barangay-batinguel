// Source-reading guards for migration 066. ⚠️ They do NOT prove the privacy
// property -- only SQL run as each role can, and that is the job of
// supabase-tests/066_person_history_privacy_behavioral.sql. What these pin is
// the shape a reviewer relies on, so an edit cannot quietly undo it.
import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..', '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const sql = read('supabase-migrations/066_person_history_privacy.sql')
const code = sql.replace(/--.*$/gm, '') // executable SQL only: the header discusses what it removes
const fnBody = (name) => {
  const start = code.indexOf(`function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  return code.slice(start, code.indexOf('$$;', code.indexOf('$$', start) + 2) + 3)
}

describe('migration 066 shape', () => {
  test('is marked NOT APPLIED and names its dependencies', () => {
    expect(sql.split('\n')[0]).toMatch(/^-- NOT APPLIED\./)
    expect(sql).toMatch(/Requires migrations 001-063 and 065/)
    expect(sql).toMatch(/064 is optional/)
  })

  test('is additive: no table, column, policy, row or grant change, and no DROP', () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+table\b/i)
    expect(code).not.toMatch(/\b(create|alter|drop)\s+policy\b/i)
    expect(code).not.toMatch(/\bdrop\s+function\b/i)
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i)
    expect(code).not.toMatch(/\bgrant\b/i)
  })

  test('replaces exactly the two RPCs, with their original signatures, and adds two helpers', () => {
    expect(code).toMatch(/create or replace function public\.person_history\(p_person_kind text,p_person_id uuid\)/)
    expect(code).toMatch(/create or replace function public\.person_analytics\(p_person_kind text,p_person_id uuid,p_from date default null,p_to date default null,p_window text default 'all'\)/)
    expect((code.match(/create (or replace )?function/gi) || []).length).toBe(4)
  })

  test('every function is SECURITY DEFINER with an empty search_path', () => {
    const headers = code.match(/create (or replace )?function[\s\S]*?as \$\$/gi)
    expect(headers).toHaveLength(4)
    headers.forEach((h) => expect(h).toMatch(/security definer set search_path=''/))
  })

  test('the helpers are revoked from every client role, PUBLIC included', () => {
    expect(code).toMatch(/revoke all on function public\.person_history_identities\(text,uuid\),\s*public\.person_linked_records\(text,uuid,boolean\) from public,anon,authenticated,service_role;/)
  })

  test('complaint material is gated on the existing records-administrator predicate', () => {
    for (const name of ['person_history', 'person_analytics']) {
      const body = fnBody(name)
      expect(body).toMatch(/perform public\.person_history_require_view\(\)/)
      expect(body).toMatch(/v_admin:=coalesce\(public\.current_official_may_administer_records\(\),false\)/)
    }
    const history = fnBody('person_history')
    expect(history).toMatch(/if v_admin then[\s\S]*complaint_parties[\s\S]*else\s+v_complaints:='\[\]'::jsonb;/)
    expect(history).toMatch(/'kp_reference',case when v_admin then k\.reference end/)
    expect(history).toMatch(/'complaint_reference',case when v_admin then c\.reference end/)
    // analytics reads records only through the helper, which drops complaints unless v_admin
    expect(fnBody('person_analytics')).toMatch(/person_linked_records\(p_person_kind,p_person_id,v_admin\)/)
    expect(fnBody('person_linked_records')).toMatch(/where p_include_complaints;\s*\$\$;$/)
  })

  test('no new permission model: no position name, committee or role string is tested', () => {
    expect(code).not.toMatch(/Barangay Secretary|Punong Barangay|committee|role\s*=\s*'official'/)
  })

  test('identity expansion uses ONLY the explicit verified link table, never a name', () => {
    const ids = fnBody('person_history_identities')
    expect(ids).toMatch(/external_person_resident_links/)
    expect(ids).not.toMatch(/name|ilike|like|similar|soundex|levenshtein/i)
    expect(fnBody('person_linked_records')).not.toMatch(/first_name|last_name|full_name|ilike|soundex/i)
  })

  test('the only merge is an explicit KP link to a complaint of the same person', () => {
    const body = fnBody('person_linked_records')
    expect(body).toMatch(/incident_case_links l\s+join public\.kp_cases k on k\.id=l\.case_id\s+where l\.incident_id=i\.id and k\.complaint_id in \(select complaint_id from person_complaints\)/)
  })

  test('the 062 record counts keep their names; the 066 counts are added beside them', () => {
    const body = fnBody('person_analytics')
    for (const key of ['distinct_linked_matters', 'incident_matters', 'complaint_kp_matters', 'incident_records', 'complaint_records', 'distinct_matters']) {
      expect(body).toContain(`'${key}'`)
    }
  })

  test('incident location: both stored fields, the area-note-first value, and its source', () => {
    const body = fnBody('person_history')
    expect(body).toMatch(/'location_text',i\.location_text,'area_note',i\.area_note/)
    expect(body).toMatch(/'location',coalesce\(nullif\(btrim\(i\.area_note\),''\),nullif\(btrim\(i\.location_text\),''\)\)/)
    expect(body).toMatch(/'location_source',case when nullif\(btrim\(i\.area_note\),''\) is not null then 'area_note'/)
  })

  test('no judgment output and no Community Credit relationship', () => {
    expect(code).not.toMatch(/requires_review|threshold|historical_review|community_credit|Repeated|risk|danger|offender|recommend/i)
  })
})

describe('066 rollback contingency', () => {
  const rollback = read('supabase-tests/066_rollback_contingency.sql')
  const original = (file, name) => {
    const s = read(file)
    const start = s.indexOf(`create function public.${name}(`)
    return s.slice(start, s.indexOf('end; $$;', start) + 'end; $$;'.length).replace(/^create function /, 'create or replace function ')
  }

  test('restores 061 person_history and 062 person_analytics byte for byte', () => {
    expect(rollback).toContain(original('supabase-migrations/061_person_matter_linking.sql', 'person_history'))
    expect(rollback).toContain(original('supabase-migrations/062_analytics_insights.sql', 'person_analytics'))
  })

  test('replaces the functions before dropping the helpers, and changes no grant', () => {
    const body = rollback.replace(/--.*$/gm, '')
    expect(body.indexOf('create or replace function public.person_analytics')).toBeLessThan(body.indexOf('drop function public.person_linked_records'))
    expect(body).not.toMatch(/\b(grant|revoke)\b/i)
    expect(rollback).toMatch(/RE-OPENS the disclosure/)
  })
})

describe('066 behavioral harness and negative control', () => {
  const harness = read('supabase-tests/066_person_history_privacy_behavioral.sql')

  test('runs in one transaction that rolls back, on a disposable database only', () => {
    expect(harness.trim().startsWith('-- Migration 066')).toBe(true)
    expect(harness).toMatch(/\nbegin;\n/)
    expect(harness.trim().endsWith('rollback;')).toBe(true)
    expect(harness).not.toMatch(/\ncommit;/)
    expect(harness).toMatch(/SETUP PRECONDITION FAILED: a powered position already has an active holder/)
  })

  test('probes run as real roles, with the role switch outside the exception block', () => {
    expect(harness).toMatch(/perform pg_temp\.set_actor\(p_id,p_role\);\s*begin\s*execute p_sql into v_result;/)
  })

  test('the negative control is built from the rollback file and names its expected failures', async () => {
    const { buildRunners, EXPECTED_NEGCTRL_FAILURES } = await import('../../supabase-tests/066_build_test_runner.mjs')
    const { run, negctrl } = buildRunners()
    expect(run).toBe(harness)
    expect(negctrl).toMatch(/set local t066\.mode='negctrl';/)
    expect(negctrl).toContain('create or replace function public.person_history(p_person_kind text,p_person_id uuid)')
    expect(negctrl).not.toMatch(/drop function public\.person_linked_records/)
    // The restored bodies keep their dollar quotes ($$ in a replacement string would become $).
    const rollback = read('supabase-tests/066_rollback_contingency.sql')
    expect(negctrl).toContain(rollback.slice(rollback.indexOf('-- From 061_'), rollback.indexOf('drop function public.person_linked_records')))
    const numbered = new Set([...harness.matchAll(/pg_temp\.check\((\d+),/g)].map((m) => Number(m[1])))
    EXPECTED_NEGCTRL_FAILURES.forEach((n) => expect(numbered.has(n)).toBe(true))
    // Grants, helper privacy and table privileges must still hold under the old code.
    for (const n of [14, 15, 16, 17, 18]) expect(EXPECTED_NEGCTRL_FAILURES).not.toContain(n)
  })

  test('every superseded 062 assertion exists and maps to a 066 replacement contract', async () => {
    const { SUPERSEDED_062 } = await import('../../supabase-tests/066_build_test_runner.mjs')
    const old062 = read('supabase-tests/062_analytics_behavioral.sql')
    const numbered = new Set([...harness.matchAll(/pg_temp\.check\((\d+),/g)].map((m) => Number(m[1])))
    expect(Object.keys(SUPERSEDED_062).map(Number).sort((a, b) => a - b))
      .toEqual([9, 10, 11, 12, 20, 21, 22, 23, 24, 25, 26, 27, 35, 77, 78])
    for (const [test, replacements] of Object.entries(SUPERSEDED_062)) {
      expect(old062).toMatch(new RegExp(`TEST ${test} FAILED`))
      expect(replacements.length).toBeGreaterThan(0)
      replacements.forEach((n) => expect(numbered.has(n)).toBe(true))
    }
    // The 062 harness itself is untouched: it remains the record of the pre-066 contract.
    // (TESTS 80-85 build their message with format('TEST %s ...'), so count the closing line, not the literals.)
    expect(old062).toContain("PASS: all 89 migration-062 behavioral contracts passed")
  })
})
