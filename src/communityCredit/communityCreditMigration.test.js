import fs from 'fs'
import path from 'path'

const root=path.join(__dirname,'..','..')
const sql=fs.readFileSync(path.join(root,'supabase-migrations','059_community_credit_foundation.sql'),'utf8')

describe('community credit foundation migration',()=>{
  test('is the additive migration after targeted SMS',()=>{
    expect(fs.existsSync(path.join(root,'supabase-migrations','058_targeted_sms.sql'))).toBe(true)
    // Verified present in production on 2026-10-30 by read-only catalog inspection.
    expect(sql).toContain('-- APPLIED. Verified present in production on 2026-10-30')
    expect(sql).toMatch(/^-- APPLIED\. Verified present in production on 2026-10-30 by read-only catalog inspection;[\s\S]*begin;/)
    expect(sql).not.toContain('NOT APPLIED')
  })
  test.each(['community_credit_policies','community_credit_rules','community_credit_events'])('%s has RLS and no client table grant',table=>{
    expect(sql).toContain(`alter table public.${table} enable row level security`)
    expect(sql).toMatch(new RegExp(`revoke all on[\\s\\S]*public\\.${table}[\\s\\S]*from public,anon,authenticated,service_role`))
  })
  test('uses UUID resident identity and explicit account linkage without name matching',()=>{
    expect(sql).toContain('resident_id uuid not null references public.barangay_residents(id)')
    expect(sql).toContain('where r.id=p_resident_id and p.id=auth.uid()')
    expect(sql).not.toMatch(/full_name\s*=/)
  })
  test('uses established official authorization helpers',()=>{
    expect(sql).toContain('public.current_official_is_active()')
    expect(sql).toContain('public.current_official_may_administer_records()')
  })
  test('has explicit no-policy state and server-side bounded score',()=>{
    expect(sql).toContain("'configured',false")
    expect(sql).toContain('Community credit policy is not configured.')
    expect(sql).toContain('greatest(v_policy.minimum_score,least(v_policy.maximum_score,v_policy.base_score+v_total))')
  })
  test('allows one active policy and validates score ranges',()=>{
    expect(sql).toContain('community_credit_one_active_policy')
    expect(sql).toContain("where status = 'active'")
    expect(sql).toContain('minimum_score <= base_score and base_score <= maximum_score')
    expect(sql).toContain("where id=p_id and status='draft'")
  })
  test('validates signed non-zero rule values and known outcome domains',()=>{
    expect(sql).toContain('points_delta <> 0')
    expect(sql).toContain("category = 'negative' and points_delta < 0")
    expect(sql).toContain("category in ('positive','repair') and points_delta > 0")
    expect(sql).not.toContain('complaint_filed')
    expect(sql).not.toContain('incident_reported')
    expect(sql).not.toContain('blotter_exists')
  })
  test('snapshots rules and blocks ledger update/delete',()=>{
    expect(sql).toContain('new.rule_code_snapshot:=v_rule.rule_code')
    expect(sql).toContain('new.points_delta_snapshot:=v_rule.points_delta')
    expect(sql).toContain('before update or delete on public.community_credit_events')
    expect(sql).toContain('Community credit events are immutable')
  })
  test('guards reversal shape and prevents reversal chains',()=>{
    expect(sql).toContain('reverses_event_id uuid unique')
    expect(sql).toContain('v_original.reverses_event_id is not null')
    expect(sql).toContain("v_rule.category<>'correction'")
    expect(sql).toContain('v_rule.points_delta<>-v_original.points_delta_snapshot')
  })
  test('exposes no production credit event writer',()=>{
    expect(sql).not.toMatch(/create function public\.(create|save|record)_community_credit_event/)
    expect(sql).not.toMatch(/grant (insert|update|delete)/i)
  })
  test('grants only narrow RPC execution to authenticated users',()=>{
    expect(sql).toContain('grant execute on function public.community_credit_profile(uuid)')
    expect(sql).not.toMatch(/grant select on (table )?public\.community_credit/i)
  })
  test('restricted official directory exposes a boolean link state, never the profile UUID',()=>{
    const body=sql.match(/create function public\.community_credit_resident_directory\(\)([\s\S]*?)end; \$\$;/)?.[1] || ''
    expect(body).toContain('account_linked boolean')
    expect(body).toContain('r.profile_id is not null')
    expect(body).not.toContain('profile_id uuid')
    expect(body).not.toContain('mobile_number')
    expect(body).not.toContain('birth_date')
  })
})

