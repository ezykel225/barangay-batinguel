// Builds the SQL files the migration 067 validation runs, from the files under
// review, so the negative control and the install check can never drift from
// the harness or the migration.
//
//   node supabase-tests/067_build_test_runner.mjs <output-dir>
//
//   067-run.sql      the behavioral harness as written. Run AFTER 067; must
//                    report "PASS: all ... migration-067 contracts passed".
//   067-negctrl.sql  the same harness, but it first restores the 059/060
//                    function bodies 067 replaced (copied from the rollback
//                    contingency) inside the harness transaction, and reports
//                    failing tests instead of raising. It must fail EXACTLY
//                    EXPECTED_NEGCTRL_FAILURES.
//   067-install.sql  067_install_safety.sql with 067's body (without its
//                    begin/commit) in place of the @@APPLY_067@@ marker. Run
//                    BEFORE 067; must report "INSTALL PASS".
//
// Each runs in one transaction that rolls back. Use only a disposable database.
// Run it from the repository root (no import.meta, so Jest can import it).
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n')

// Under the restored 059/060 bodies (V1 visibility, V1-only enrollment, the
// V1-only ledger guard and the V1 profile) these contracts must fail; the
// rest (new tables, new functions, triggers, catalog) must still pass.
export const EXPECTED_NEGCTRL_FAILURES = Object.freeze([3, 7, 11, 14, 15, 16, 17, 18, 19, 20, 22, 23, 26, 28])

export const RESTORED_BODY_MARKERS = Object.freeze({ start: '-- From 059_community_credit_foundation.sql', end: '-- End of restored bodies' })

export function restoredBodies() {
  const rollback = read('supabase-tests', '067_rollback_contingency.sql')
  const a = rollback.indexOf(RESTORED_BODY_MARKERS.start)
  const b = rollback.indexOf(RESTORED_BODY_MARKERS.end)
  if (a < 0 || b <= a) throw new Error('rollback contingency restored-body markers not found')
  return rollback.slice(a, b)
}

export function migrationBody() {
  const lines = read('supabase-migrations', '067_community_credit_v2.sql').split('\n')
  const b = lines.indexOf('begin;')
  const c = lines.lastIndexOf('commit;')
  if (b < 0 || c <= b) throw new Error('067 transaction markers not found')
  return lines.slice(b + 1, c).join('\n')
}

export function buildRunners() {
  const harness = read('supabase-tests', '067_community_credit_v2_behavioral.sql')
  const install = read('supabase-tests', '067_install_safety.sql')
  const bodies = restoredBodies()
  for (const fn of ['community_credit_may_view_resident(', 'community_credit_enroll_resident(', 'community_credit_enroll_active_residents(',
    'community_credit_guard_event()', 'community_credit_profile(']) {
    if (!bodies.includes(`create or replace function public.${fn}`)) throw new Error(`restored bodies lack ${fn}`)
  }
  const marker = "set local timezone='UTC';\n"
  if (!harness.includes(marker)) throw new Error('harness start marker not found')
  // FUNCTION replacers: in a replacement string `$$` means a literal `$`.
  const negctrl = harness.replace(marker, () => `${marker}set local t067.mode='negctrl';\n-- NEGATIVE CONTROL: restore the 059/060 bodies inside this transaction.\n${bodies}\n`)
  if (!negctrl.includes(bodies)) throw new Error('negative control does not carry the restored bodies verbatim')
  const applyMarker = '-- @@APPLY_067@@'
  if (install.split(applyMarker).length !== 2) throw new Error('install marker must appear exactly once')
  const body = migrationBody()
  const installRun = install.replace(applyMarker, () => `-- 067 body, verbatim, inside this transaction:\n${body}`)
  if (!installRun.includes(body)) throw new Error('install check does not carry the 067 body verbatim')
  return { run: harness, negctrl, install: installRun }
}

if (process.argv[1] && path.basename(process.argv[1]) === '067_build_test_runner.mjs') {
  const out = process.argv[2]
  if (!out) { console.error('usage: node 067_build_test_runner.mjs <output-dir>'); process.exit(2) }
  const { run, negctrl, install } = buildRunners()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, '067-run.sql'), run)
  fs.writeFileSync(path.join(out, '067-negctrl.sql'), negctrl)
  fs.writeFileSync(path.join(out, '067-install.sql'), install)
  console.log(`wrote 067-run.sql, 067-negctrl.sql and 067-install.sql; the negative control must fail exactly: ${EXPECTED_NEGCTRL_FAILURES.join(',')}`)
}
