// Builds the two SQL files the migration 066 validation runs, from the files
// under review, so the negative control can never drift from the harness.
//
//   node supabase-tests/066_build_test_runner.mjs <output-dir>
//
//   066-run.sql      the behavioral harness as written. Run AFTER 066; must
//                    report "PASS: all ... migration-066 contracts passed".
//   066-negctrl.sql  the same harness, but it first restores the 061/062
//                    function bodies from the rollback contingency (inside the
//                    harness transaction, which rolls back), and reports
//                    failing tests instead of raising. It must fail EXACTLY
//                    EXPECTED_NEGCTRL_FAILURES -- proof that the disclosure and
//                    identity assertions detect the old behavior.
//
// Both run in one transaction that rolls back. Use only a disposable database.
// Run it from the repository root: paths resolve from there, with no
// import.meta, so the Jest guards can import it too.
import fs from 'fs'
import path from 'path'

const here = path.join(process.cwd(), 'supabase-tests')
const read = (name) => fs.readFileSync(path.join(here, name), 'utf8').replace(/\r\n/g, '\n')

// Under the 061/062 bodies these contracts must fail; the rest (grants, helper
// privacy, table privileges, the unchanged correction RPC, no name matching,
// administrator KP references) must still pass.
export const EXPECTED_NEGCTRL_FAILURES = Object.freeze([
  1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 21, 22, 23, 24, 26, 28, 29, 30, 31, 32, 33, 34,
])

// 062 assertions that 066 SUPERSEDES BY DESIGN, each mapped to the 066
// contract(s) that replace it. They keep passing on a 001-065 database (the
// pre-066 state, run 062_analytics_behavioral.sql there); on a 066 database
// they are expected to fail and these contracts assert the intended behavior.
export const SUPERSEDED_062 = Object.freeze({
  9: [34], 10: [34], 11: [34], 12: [34],            // review qualification by role -> comparison by role
  20: [30], 21: [30],                                // requires_review threshold -> no threshold flag
  22: [34], 23: [34], 24: [34], 25: [34],            // non-qualifying roles excluded -> same rule on the comparison
  26: [30, 32],                                      // credit-enrollment split -> removed; Community Credit not read
  27: [34],                                          // contributing list = count -> same for indicators[0]
  35: [30],                                          // enrollment boundary -> enrollment no longer consulted
  77: [7, 9, 11, 12],                                // masked complaint location -> complaint not returned at all
  78: [10, 12],                                      // counts unchanged by masking -> counts cover incidents only
})

export function buildRunners() {
  const harness = read('066_person_history_privacy_behavioral.sql')
  const rollback = read('066_rollback_contingency.sql')
  // The function bodies only: no transaction control, and the helpers are NOT
  // dropped, so the harness precondition (066 applied) still holds.
  const bodies = rollback.slice(rollback.indexOf('-- From 061_'), rollback.indexOf('drop function public.person_linked_records'))
  if (!bodies.includes('create or replace function public.person_history(') ||
      !bodies.includes('create or replace function public.person_analytics(')) {
    throw new Error('rollback contingency does not contain both function bodies')
  }
  const marker = "set local timezone='UTC';\n"
  if (!harness.includes(marker)) throw new Error('harness start marker not found')
  // A FUNCTION replacer, not a string: in a replacement string `$$` means a
  // literal `$`, which would strip every dollar-quote from the restored bodies.
  const negctrl = harness.replace(marker, () => `${marker}set local t066.mode='negctrl';\n-- NEGATIVE CONTROL: restore the 061/062 bodies inside this transaction.\n${bodies}\n`)
  if (!negctrl.includes(bodies)) throw new Error('negative control does not carry the restored bodies verbatim')
  return { run: harness, negctrl }
}

if (process.argv[1] && path.basename(process.argv[1]) === '066_build_test_runner.mjs') {
  const out = process.argv[2]
  if (!out) { console.error('usage: node 066_build_test_runner.mjs <output-dir>'); process.exit(2) }
  const { run, negctrl } = buildRunners()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, '066-run.sql'), run)
  fs.writeFileSync(path.join(out, '066-negctrl.sql'), negctrl)
  console.log(`wrote 066-run.sql and 066-negctrl.sql; the negative control must fail exactly: ${EXPECTED_NEGCTRL_FAILURES.join(',')}`)
}
