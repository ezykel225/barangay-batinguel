// The migration-directory rule shared by the static CI check and the Jest guards.
// See scripts/ci/migrationSequence.mjs for why 064 alone may be absent.
import fs from 'fs'
import path from 'path'
import { migrationSequenceProblems, REVIEWED_AFTER_060, MAY_BE_ABSENT } from '../scripts/ci/migrationSequence.mjs'

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${String(from + i).padStart(3, '0')}_m.sql`)
const base = range(1, 60)
const reviewed = (...numbers) => numbers.map((n) => REVIEWED_AFTER_060.find((f) => f.startsWith(String(n).padStart(3, '0'))))

describe('the migration directory rule', () => {
  it('accepts this repository as it is', () => {
    const files = fs.readdirSync(path.join(__dirname, '..', 'supabase-migrations'))
    expect(migrationSequenceProblems(files)).toEqual([])
  })

  it('accepts 063 + 065, the layout before 064 is authorized', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 65)])).toEqual([])
  })

  it('accepts 063 + 064 + 065, the layout once 064 merges', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 64, 65)])).toEqual([])
  })

  it('accepts 063 + 064 without 065, the layout on the 064 branch', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 64)])).toEqual([])
  })

  it('refuses an unreviewed 066, alone or after 065', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 64, 65), '066_new.sql']))
      .toEqual(['unreviewed migration 066_new.sql'])
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 65), '066_new.sql']))
      .toEqual(['unreviewed migration 066_new.sql'])
  })

  it('refuses a reviewed number under a different name', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62), '063_renamed.sql', ...reviewed(65)]))
      .toEqual(['unreviewed migration 063_renamed.sql'])
  })

  it('refuses every other gap, before and after 060', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 63, 64, 65)])).toEqual(['missing migration 062'])
    expect(migrationSequenceProblems([...base.filter((f) => !f.startsWith('045')), ...reviewed(61, 62, 63)]))
      .toEqual(['missing migration 045'])
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 64, 65)])).toEqual(['missing migration 063'])
  })

  it('refuses a missing 064 when 065 is not there to permit it', () => {
    // 063 then a 065 that is not the reviewed file: both the gap and the name fail.
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63), '065_other.sql']))
      .toEqual(['unreviewed migration 065_other.sql'])
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63, 64, 65)].filter((f) => !f.startsWith('065'))
      .filter((f) => !f.startsWith('064')).concat(['066_x.sql'])))
      .toEqual(['unreviewed migration 066_x.sql', 'missing migration 064', 'missing migration 065'])
  })

  it('refuses a duplicate number', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63), '063_retire_legacy_module_access_copy.sql']))
      .toEqual(['duplicate migration number 063', 'unreviewed migration 063_retire_legacy_module_access_copy.sql'])
  })

  it('ignores files that are not numbered migrations', () => {
    expect(migrationSequenceProblems([...base, ...reviewed(61, 62, 63), 'README.md', 'notes.sql'])).toEqual([])
  })

  it('allows exactly one absence, 064, and only behind 065', () => {
    expect(MAY_BE_ABSENT).toEqual({ 64: 65 })
    expect(Object.isFrozen(MAY_BE_ABSENT) && Object.isFrozen(REVIEWED_AFTER_060)).toBe(true)
  })
})
