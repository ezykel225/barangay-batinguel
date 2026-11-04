#!/usr/bin/env node
// Static CI checks for migration 062 (Analytics & Insights) and its behavioral harness.
//
// ⚠️ THESE ARE STATIC SOURCE CHECKS. They read SQL as text and never connect to a
// database. They do NOT prove the 89 behavioral assertions pass: that requires the
// harness to run against PostgreSQL holding the real post-061 schema, which is done
// locally and recorded in the migration header. This repository deliberately has no
// way to rebuild that schema in CI: migrations 001-061 are a record, not a runner
// (001 assumes tables created in the dashboard), and a production schema dump must
// never be committed or uploaded.
//
// Node built-ins only, so CI needs nothing beyond the pinned Node version.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const failures = []
const passes = []
const check = (ok, label) => (ok ? passes : failures).push(label)
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
// Comment-stripped SQL, so a comment that DISCUSSES a forbidden thing is not read as doing it.
const code = (sql) => sql.replace(/--[^\n]*/g, '')
const count = (text, re) => (text.match(re) || []).length

// ── 1. Migration sequence ──────────────────────────────────────────────────
const migrationDir = 'supabase-migrations'
const migrations = readdirSync(migrationDir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
const numbers = migrations.map((f) => Number(f.slice(0, 3)))
check(new Set(numbers).size === numbers.length, 'migration numbers are unique')
check(numbers.every((n, i) => n === i + 1), `migrations are contiguous from 001 (found ${numbers.length})`)
check(migrations.some((f) => f.startsWith('062_')), 'migration 062 is present')

// ── 2. Migration 062: objects and security declarations ────────────────────
const m062File = migrations.find((f) => f.startsWith('062_'))
const raw062 = read(join(migrationDir, m062File))
const sql = code(raw062)
const readers = ['person_analytics', 'barangay_safety_analytics', 'repeated_dispute_analytics']
const allFns = ['analytics_person_matters', ...readers]
const body = (name) => {
  const start = sql.indexOf(`create function public.${name}(`)
  return start < 0 ? '' : sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3)
}

check(/^-- (NOT APPLIED|APPLIED)\b/.test(raw062), '062 header records its applied status')
check(/^\s*begin;/.test(sql) && /commit;\s*$/.test(sql), '062 runs in one transaction (begin ... commit)')
check(count(sql, /\bcreate function public\./g) === 4, '062 creates exactly four functions')
check(/create index complaints_created_at_idx on public\.complaints\(created_at desc\)/.test(sql), '062 creates complaints_created_at_idx')
for (const name of allFns) {
  const b = body(name)
  check(b.length > 0, `062 defines public.${name}`)
  check(/security definer set search_path=''/.test(b), `${name} is SECURITY DEFINER with search_path=''`)
}
check(/revoke all on function public\.analytics_person_matters\(text,uuid\),public\.person_analytics\(text,uuid,date,date,text\),\s*public\.barangay_safety_analytics\(date,date,text,text,text\),public\.repeated_dispute_analytics\(date,date,text\) from public,anon,authenticated,service_role;/.test(sql),
  'all four functions revoke EXECUTE from public, anon, authenticated and service_role')
const grants = sql.match(/grant [^;]+;/g) || []
check(grants.length === 1, '062 contains exactly one GRANT')
check(grants.length === 1 && /to authenticated;$/.test(grants[0]) && readers.every((r) => grants[0].includes(`public.${r}(`)),
  'the three readers are granted to authenticated only')
check(!grants.some((g) => /analytics_person_matters|\banon\b|\bpublic\s*;|service_role/.test(g)), 'nothing is granted to anon, PUBLIC or service_role, and the internal helper is granted to nobody')
check(!/\bexecute\b(?!\s+on\s+function)/.test(sql), '062 contains no dynamic SQL (EXECUTE)')
check(!/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i.test(sql), '062 writes no table data (read-only analytics)')
check(!/\bcommittee\b/i.test(sql), '062 reads no committee data (not authorization data)')
check(!/community_credit_events\s*\(|insert into public\.community_credit/i.test(sql), '062 creates no Community Credit events')
// Authorization (Remediation B).
check(body('person_analytics').includes('perform public.person_history_require_view();'), 'person_analytics requires an active linked official')
check(body('barangay_safety_analytics').includes('perform public.person_history_require_view();'), 'barangay_safety_analytics requires an active linked official')
check(body('repeated_dispute_analytics').includes('perform public.person_history_require_admin();') && !body('repeated_dispute_analytics').includes('person_history_require_view'),
  'repeated_dispute_analytics requires records administration')
check(body('barangay_safety_analytics').includes("'repeat_people',case when v_admin then") && body('barangay_safety_analytics').includes("'repeat_people_restricted',not v_admin"),
  'repeat_people is withheld from non-administrators with an explicit flag')
check(body('person_analytics').includes("case when m.matter_kind='complaint' and not v_admin then 'Restricted' else m.area_label end"),
  'complaint locations are masked for non-administrators')
for (const name of ['person_analytics', 'barangay_safety_analytics']) {
  check(body(name).includes('v_admin:=coalesce(public.current_official_may_administer_records(),false);'), `${name} derives v_admin from the existing records-administration helper`)
}
// Input validation and display names (Remediation A).
check(body('person_analytics').includes('if p_person_kind is null or p_window is null'), 'person_analytics rejects a NULL kind or window')
check(['barangay_safety_analytics', 'repeated_dispute_analytics'].every((n) => body(n).includes('if p_window is null or p_window not in')), 'the barangay readers reject a NULL window')
check(!/coalesce\(concat_ws\(/.test(sql), 'no name expression lets an empty resident name hide an external name')

// ── 3. Behavioral harness structure and coverage ───────────────────────────
const harnessRaw = read('supabase-tests/062_analytics_behavioral.sql')
const harness = code(harnessRaw)
check(/^\s*begin;/.test(harness), 'harness opens one transaction')
check(/rollback;\s*$/.test(harness), 'harness ends with ROLLBACK')
check(!/\bcommit\b/i.test(harness), 'harness never commits')
check(!/\b(create|alter|drop)\s+(or\s+replace\s+)?(function|table|policy|trigger|index|view)\s+public\./i.test(harness) && !/\b(grant|revoke)\b/i.test(harness),
  'harness changes no schema object or privilege (temporary helpers only)')
check(!/storage\.|\\connect|session_replication_role|disable trigger/i.test(harness), 'harness touches no storage and bypasses no trigger')
const literalIds = [...harnessRaw.matchAll(/TEST (\d+) FAILED/g)].map((m) => Number(m[1]))
// TESTS 80-85 share one formatted message: format('TEST %s FAILED ...', case k when ... then 80 ... else 85 end).
const formatted = harnessRaw.match(/'TEST %s FAILED[\s\S]*?case k([\s\S]*?)end,k\)\);/)
const formattedIds = formatted ? [...formatted[1].matchAll(/\b(8\d)\b/g)].map((m) => Number(m[1])) : []
const ids = [...literalIds, ...formattedIds]
const max = Math.max(...ids)
check(new Set(literalIds).size === literalIds.length, 'no TEST number is used twice')
check(ids.length === max && ids.every((_, i) => ids.slice().sort((a, b) => a - b)[i] === i + 1), `TEST numbers run 1..${max} with no gap`)
const pass = harnessRaw.match(/PASS: all (\d+) migration-062 behavioral contracts passed/)
check(Boolean(pass) && Number(pass[1]) === max, `the PASS message counts the ${max} assertions it covers`)
check(max === 89, `the harness carries the 89 assertions verified locally (found ${max})`)
check(count(harness, /\bperform pg_temp\.assert_true\(/g) >= 80, 'assertions are made through pg_temp.assert_true')
check(/SETUP PRECONDITION FAILED/.test(harness), 'harness refuses to run where real powered officials exist')
const uuids = harnessRaw.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || []
check(uuids.length > 0 && uuids.every((u) => u.toLowerCase().startsWith('f0620000-')), 'every fixture UUID is synthetic (f0620000-...)')
check((harnessRaw.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).every((e) => e.endsWith('.invalid')), 'every fixture email uses the reserved .invalid domain')

// ── 4. Confidentiality: nothing private is tracked ─────────────────────────
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const forbidden = /(^|\/)(schema\.(raw|restore)\.sql|\.pgpass|pgpass\.conf|linked-project\.json|prod-ca-[^/]*\.crt)$|\.dump$|(^|\/)supabase\/\.(temp|branches)\//i
const leaked = tracked.filter((f) => forbidden.test(f))
check(leaked.length === 0, `no schema dump, checkpoint, credential or Supabase link metadata is tracked${leaked.length ? ': ' + leaked.join(', ') : ''}`)
// A file deleted in the working tree but not yet staged is still listed; skip it.
const withPassword = tracked.filter((f) => /\.(js|jsx|mjs|json|sql|ya?ml|md|env\w*|sh|ps1|txt)$/i.test(f) && existsSync(f))
  .filter((f) => /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i.test(read(f)))
check(withPassword.length === 0, `no tracked file contains a database URL with a password${withPassword.length ? ': ' + withPassword.join(', ') : ''}`)

// ── Report ─────────────────────────────────────────────────────────────────
for (const p of passes) console.log(`PASS  ${p}`)
for (const f of failures) console.log(`FAIL  ${f}`)
console.log(`\n${passes.length} passed, ${failures.length} failed.`)
console.log('Static checks only: they do not run the 89 behavioral assertions against PostgreSQL.')
process.exit(failures.length ? 1 : 0)
