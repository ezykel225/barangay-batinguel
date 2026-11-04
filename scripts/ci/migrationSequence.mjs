// The ONE rule for which numbered files may sit in supabase-migrations/.
//
// Used by scripts/ci/check-analytics-062.mjs and by the Jest migration guards
// (officialComplaints, incidentMigration, kpCaseMigration), so the static check and
// the tests cannot disagree about what a valid migration directory is.
//
// The rule:
//   * every number is unique;
//   * 001-060 are present, with no gap;
//   * a file numbered after 060 must be one of the REVIEWED files below, by exact
//     name -- so an unreviewed 066 fails, and so does a renamed 063;
//   * there is no gap after 060 either, with ONE exception: 064 may be absent while
//     065 is present.
//
// Why that exception, and only that one: 064 (legacy data cleanup) DELETES the retired
// modules' rows and needs the Secretary's approval, records-retention authority, a
// private export and separate explicit authorization before it may merge. 065 (retire
// the nurse SMS permission) is a security fix that depends on 063 alone. Holding the
// security fix behind a data deletion would be backwards, so 065 may land first. Every
// other gap still fails.

export const REVIEWED_AFTER_060 = Object.freeze([
  '061_person_matter_linking.sql',
  '062_analytics_insights.sql',
  '063_retire_legacy_module_access.sql',
  '064_legacy_data_cleanup.sql',
  '065_retire_nurse_sms_permissions.sql',
])

// number that may be missing -> the number whose presence permits it
export const MAY_BE_ABSENT = Object.freeze({ 64: 65 })

const NUMBERED = /^\d{3}_.+\.sql$/

// Returns a list of problems; an empty list means the directory is valid.
export function migrationSequenceProblems(fileNames) {
  const files = fileNames.filter((f) => NUMBERED.test(f)).sort()
  const numbers = files.map((f) => Number(f.slice(0, 3)))
  const problems = []

  const seen = new Set()
  for (const n of numbers) {
    if (seen.has(n)) problems.push(`duplicate migration number ${String(n).padStart(3, '0')}`)
    seen.add(n)
  }
  for (const f of files) {
    if (Number(f.slice(0, 3)) > 60 && !REVIEWED_AFTER_060.includes(f)) problems.push(`unreviewed migration ${f}`)
  }
  const max = numbers.length ? Math.max(...numbers) : 0
  for (let n = 1; n <= max; n += 1) {
    if (seen.has(n)) continue
    const permittedBy = MAY_BE_ABSENT[n]
    if (permittedBy !== undefined && seen.has(permittedBy)) continue
    problems.push(`missing migration ${String(n).padStart(3, '0')}`)
  }
  if (max < 60) problems.push(`migrations stop at ${String(max).padStart(3, '0')}, before 060`)
  return problems
}
