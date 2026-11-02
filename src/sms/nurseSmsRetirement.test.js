// Migration 065 (retire the nurse SMS permission), as far as Jest can see it.
//
// ⚠️ These are SOURCE checks. Only SQL can prove the permission is gone: that is
// supabase-tests/065_retire_nurse_sms_behavioral.sql, run against a disposable
// PostgreSQL. What these pin is that the files stay consistent with one another, so a
// later edit cannot quietly reintroduce the nurse branch or drift from 058.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const root = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const code = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const m065 = read('supabase-migrations/065_retire_nurse_sms_permissions.sql')

describe('migration 065', () => {
  it('passes the builder\'s static checks: one function, no data write, bodies agree with 058 and the rollback', () => {
    const out = execFileSync(process.execPath, [path.join(root, 'supabase-tests/065_build_test_runner.mjs'), '--check'], { encoding: 'utf8' })
    expect(out).toContain('static checks passed')
  })

  it('creates a function body that grants nothing to the nurse role or a health source', () => {
    const createBody = m065.split('$fn$')[1]
    expect(createBody).toBeDefined()
    expect(createBody).not.toMatch(/nurse|health_event|medical_program/i)
    expect(createBody).toMatch(/p_type in \('announcement','event'\) and p\.role='official'/)
    expect(createBody).toMatch(/bo\.archived_at is null/)
  })

  it('keeps 058\'s signature and security attributes', () => {
    expect(m065).toMatch(/create or replace function public\.sms_may_manage\(p_type text,p_actor uuid\)\nreturns boolean language sql stable security definer set search_path='' as \$fn\$/)
  })

  it('requires 063 and does not depend on 064', () => {
    expect(code(m065)).toMatch(/063 is not applied/)
    expect(code(m065)).not.toMatch(/064|legacy_data_cleanup|notification_reads/)
  })

  it('is recorded as not applied, and the rollback says it reopens the nurse permission', () => {
    expect(m065.split('\n')[2]).toMatch(/^-- NOT APPLIED\./)
    const rollback = read('supabase-tests/065_rollback_contingency.sql')
    expect(rollback).toMatch(/REOPENS THE NURSE SMS PERMISSION/)
    expect(code(rollback)).toMatch(/barangay\.m065_rollback_ack/)
  })

  it('leaves 058 itself untouched, nurse branch and all, as the historical record', () => {
    expect(read('supabase-migrations/058_targeted_sms.sql'))
      .toContain("(p_type in ('health_event','medical_program') and p.role='nurse')));")
  })
})
