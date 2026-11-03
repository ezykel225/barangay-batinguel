// Builds the runnable migration-065 test script from the REAL migration file (and the
// REAL rollback contingency), so the harness exercises exactly the SQL that would be
// applied rather than a copy of it. Modelled on 064_build_test_runner.mjs.
//
//   node supabase-tests/065_build_test_runner.mjs            > run.sql   (acceptance)
//   node supabase-tests/065_build_test_runner.mjs --negctrl  > run.sql   (negative control)
//   node supabase-tests/065_build_test_runner.mjs --check               (static checks only)
//
// It writes to stdout and never touches a database. Feed the output to psql against the
// DISPOSABLE local test database only; the harness ends in ROLLBACK.
//
// What it generates in place of the harness's preamble marker:
//   * pg_temp.m065_run()       -- the migration's DO body, unchanged. Negative control: a
//                                 body that does nothing, so the security tests must fail.
//   * pg_temp.m065_rollback()  -- the rollback contingency's DO body, unchanged.
//   * pg_temp.check(ok, msg)   -- raises (acceptance) or emits NOTICE (negative control,
//                                 so every failing assertion is reported, not just the first).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const negctrl = process.argv.includes('--negctrl')
const checkOnly = process.argv.includes('--check')
const fail = (message) => { process.stderr.write(`065 builder: ${message}\n`); process.exit(1) }
const read = (...parts) => readFileSync(join(here, ...parts), 'utf8').replace(/\r\n/g, '\n')

const migration = read('..', 'supabase-migrations', '065_retire_nurse_sms_permissions.sql')
const rollback = read('065_rollback_contingency.sql')
const m058 = read('..', 'supabase-migrations', '058_targeted_sms.sql')
const harness = read('065_retire_nurse_sms_behavioral.sql')

// One DO block between exactly one top-level begin; and one commit;.
const doBody = (text, tag, what) => {
  const lines = text.split('\n')
  const at = (line) => lines.flatMap((l, i) => (l === line ? [i] : []))
  const start = at(`do $${tag}$`)
  const end = at(`$${tag}$;`)
  if (start.length !== 1 || end.length !== 1 || start[0] > end[0]) fail(`${what}: expected exactly one \`do $${tag}$\` ... \`$${tag}$;\` block`)
  if (lines.filter((l) => /^\s*(begin|commit);\s*$/i.test(l)).length !== 2) fail(`${what}: expected exactly one top-level begin; and one commit;`)
  return lines.slice(start[0] + 1, end[0]).join('\n')
}
const between = (text, tag, what) => {
  const parts = text.split(`$${tag}$`)
  if (parts.length !== 3) fail(`${what}: expected exactly one $${tag}$...$${tag}$ literal`)
  return parts[1]
}
const norm = (sql) => sql.replace(/\s+/g, ' ').trim()

const mBody = doBody(migration, 'm065', '065')
const rBody = doBody(rollback, 'rollback065', 'rollback')

// The bodies the files carry must agree with each other and with 058.
const m058Fn = m058.split('create function public.sms_may_manage(')[1]
if (!m058Fn) fail('058 no longer defines sms_may_manage')
const body058 = norm(m058Fn.split('$$')[1])
const new065 = norm(between(mBody, 'b065', '065 expected body'))
if (norm(between(mBody, 'b058', '065 old body')) !== body058) fail("065's copy of the 058 body differs from 058's source")
if (norm(between(mBody, 'fn', '065 CREATE body')) !== new065) fail('the 065 CREATE body differs from the 065 expected body')
if (/nurse/i.test(new065)) fail('the 065 body still mentions nurse')
if (norm(between(rBody, 'b058', 'rollback old body')) !== body058) fail("the rollback's copy of the 058 body differs from 058's source")
if (norm(between(rBody, 'b065', 'rollback 065 body')) !== new065) fail("the rollback's copy of the 065 body differs from 065's")
if (norm(between(rBody, 'fn', 'rollback CREATE body')) !== body058) fail('the rollback CREATE body is not 058')

// Static safety: comments stripped, then single-quoted strings blanked, so message text
// and privilege-name lists are never mistaken for statements.
const code = migration.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').replace(/'(?:[^']|'')*'/g, "''")
for (const [pattern, why] of [
  [/\bcascade\b/i, 'CASCADE'], [/\btruncate\b/i, 'TRUNCATE'], [/\bdrop\b/i, 'DROP'],
  [/\b(insert\s+into|delete\s+from|update\s+[a-z_.]+\s+set)\b/i, 'a data write'],
  [/\bgrant\b/i, 'GRANT'], [/\balter\b/i, 'ALTER'], [/\bsecurity\s+invoker\b/i, 'SECURITY INVOKER'],
  [/\bauth\.users\b/i, 'an Auth table'],
]) if (pattern.test(code)) fail(`forbidden construct in 065: ${why}`)
const creates = [...code.matchAll(/create\s+(or\s+replace\s+)?(function|table|trigger|policy|index|view)\s+([a-z_.]+)/gi)].map((m) => m[3])
if (JSON.stringify(creates) !== JSON.stringify(['public.sms_may_manage'])) fail(`065 must create exactly public.sms_may_manage, found: ${creates.join(', ')}`)
const revokes = [...code.matchAll(/revoke[^;]*?on\s+function\s+([a-z_.]+)/gi)].map((m) => m[1])
if (JSON.stringify(revokes) !== JSON.stringify(['public.sms_may_manage'])) fail(`065 may only re-revoke sms_may_manage, found: ${revokes.join(', ')}`)

if (checkOnly) { process.stdout.write('065 builder: static checks passed\n'); process.exit(0) }

const preamble = [
  `-- generated by 065_build_test_runner.mjs (${negctrl ? 'NEGATIVE CONTROL' : 'acceptance'})`,
  negctrl
    ? `create function pg_temp.check(p_ok boolean,p_msg text) returns void language plpgsql as $c$ begin if not coalesce(p_ok,false) then raise notice 'NEGCTRL %',p_msg; end if; end $c$;`
    : `create function pg_temp.check(p_ok boolean,p_msg text) returns void language plpgsql as $c$ begin if not coalesce(p_ok,false) then raise exception '%',p_msg; end if; end $c$;`,
  negctrl
    ? `create function pg_temp.m065_run() returns void language plpgsql as $m065$ begin null; end $m065$;`
    : `create function pg_temp.m065_run() returns void language plpgsql as $m065$\n${mBody}\n$m065$;`,
  `create function pg_temp.m065_rollback() returns void language plpgsql as $rollback065$\n${rBody}\n$rollback065$;`,
].join('\n')

const marker = '-- @@065_TEST_PREAMBLE@@'
if (harness.split(marker).length !== 2) fail('harness preamble marker must appear exactly once')
// A function replacement: a string replacement would interpret the `$$`, `$'` and
// `` $` `` sequences that SQL dollar-quoting is full of.
process.stdout.write(harness.replace(marker, () => preamble))
