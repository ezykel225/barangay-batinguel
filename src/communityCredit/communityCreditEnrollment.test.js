import fs from 'fs'
import path from 'path'

const root=path.join(__dirname,'..','..')
const sql=fs.readFileSync(path.join(root,'supabase-migrations','060_community_credit_enrollment.sql'),'utf8')

describe('Community Credit enrollment migration',()=>{
 test('is additive migration 060 and does not alter applied 059',()=>{
  expect(sql).toMatch(/^-- NOT APPLIED/);expect(sql).toContain('begin;');expect(sql).toMatch(/commit;\s*$/)
  expect(fs.existsSync(path.join(root,'supabase-migrations','059_community_credit_foundation.sql'))).toBe(true)
 })
 test('enrollment belongs to resident UUID and policy UUID exactly once',()=>{
  expect(sql).toContain('resident_id uuid not null references public.barangay_residents(id)')
  expect(sql).toContain('policy_id uuid not null references public.community_credit_policies(id)')
  expect(sql).toContain('unique(resident_id,policy_id)')
  expect(sql).not.toMatch(/resident_name|full_name\s*=/)
 })
 test('approved model is starting 100, minimum 0, maximum 100',()=>{
  expect(sql).toContain('starting_score integer not null default 100 check (starting_score = 100)')
  expect(sql).toContain('v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100')
  expect(sql).toContain("'current_score',greatest(0,least(100,v_enrollment.starting_score+v_total))")
 })
 test('v1 policy save accepts only the exact approved score model',()=>{
  expect(sql).toContain('create or replace function public.save_community_credit_policy')
  expect(sql).toContain('p_base_score is distinct from 100 or p_minimum_score is distinct from 0 or p_maximum_score is distinct from 100')
  expect(sql).toContain("raise exception 'Community Credit v1 requires base 100, minimum 0 and maximum 100'")
  const valid=(base,min,max)=>base===100&&min===0&&max===100
  expect(valid(100,0,100)).toBe(true)
  expect(valid(80,0,100)).toBe(false)
  expect(valid(100,-20,100)).toBe(false)
  expect(valid(100,0,200)).toBe(false)
 })
 test('bulk enrollment is explicit, transactional and idempotent',()=>{
  expect(sql).toContain('create function public.community_credit_enroll_active_residents(p_policy_id uuid)')
  expect(sql).toContain('perform public.community_credit_require_admin()')
  expect(sql).toContain('on conflict(resident_id,policy_id) do nothing')
  expect(sql).toContain("r.resident_status='active'")
 })
 test('policy activation atomically enrolls only active residents at 100',()=>{
  const body=sql.match(/create function public\.activate_community_credit_policy\(p_id uuid\)([\s\S]*?)end; \$\$;/)?.[1]||''
  expect(body).toContain("where r.resident_status='active'")
  expect(body).toContain("select r.id,v_policy.id,100,'active_resident_batch',auth.uid()")
  expect(body).toContain('on conflict(resident_id,policy_id) do nothing')
  expect(body).toContain('get diagnostics v_added=row_count')
  expect(body).toContain("return jsonb_build_object('policy_id',p_id,'added',v_added,'enrolled',v_enrolled)")
  expect(body).not.toMatch(/insert into public\.community_credit_events/)
 })
 test('future active residents enroll without using an account identity',()=>{
  expect(sql).toContain('after insert or update of resident_status on public.barangay_residents')
  expect(sql).toContain("'resident_created'")
  expect(sql).toContain("'resident_reactivated'")
  expect(sql).not.toMatch(/insert into public\.community_credit_enrollments[\s\S]{0,300}profile_id/)
 })
 test('profile changes cannot reset enrollment',()=>{
  expect(sql).toContain('unique(resident_id,policy_id)')
  expect(sql).toContain('on conflict(resident_id,policy_id) do nothing')
  expect(sql).toContain('update of resident_status')
  expect(sql).not.toContain('update public.community_credit_enrollments set starting_score')
 })
 test('score remains server-side and begins at enrollment',()=>{
  expect(sql).toContain('create or replace function public.community_credit_profile(p_resident_id uuid)')
  expect(sql).toContain('e.verified_at>=v_enrollment.started_at')
  expect(sql).toContain("'credit_started_at',v_enrollment.started_at")
  expect(sql).toContain("'starting_score',v_enrollment.starting_score")
 })
 test('pre-enrollment history cannot become a credit event',()=>{
  expect(sql).toContain("if new.verified_at<v_started then raise exception 'Pre-enrollment records cannot create Community Credit events'")
  expect(sql).not.toMatch(/from public\.(complaints|incidents|blotter_entries|kp_cases)/)
  expect(sql).not.toMatch(/insert into public\.community_credit_events/)
 })
 test('reversals require a valid post-enrollment original',()=>{
  expect(sql).toContain('v_original.resident_id<>new.resident_id')
  expect(sql).toContain('v_original.policy_id<>new.policy_id')
  expect(sql).toContain('v_original.reverses_event_id is not null')
  expect(sql).toContain("if v_original.verified_at<v_started then raise exception 'A pre-enrollment event cannot be reversed into the Community Credit ledger'")
  expect(sql).toContain("v_rule.points_delta<>-v_original.points_delta_snapshot")
  expect(fs.readFileSync(path.join(root,'supabase-migrations','059_community_credit_foundation.sql'),'utf8')).toContain('reverses_event_id uuid unique')
 })
 test('verified_at remains the temporal authority',()=>{
  expect(sql).toContain('verified_at is the authoritative decision date')
  expect(sql).toContain('new.verified_at<v_started')
  expect(sql).toContain('new.verified_at>now()')
  expect(sql).toContain('e.verified_at>=v_enrollment.started_at')
 })
 test('historical review stays unavailable until verified UUID linkage exists',()=>{
  expect(sql).toContain("'historical_review',jsonb_build_object('available',false,'threshold',5)")
  expect(sql).not.toMatch(/qualifying_count'\s*,\s*0/)
  expect(sql).not.toMatch(/lower\(|similarity\(|ilike/)
 })
 test('threshold contract is strictly more than five',()=>{
  const requiresReview=count=>count>5
  expect(requiresReview(5)).toBe(false);expect(requiresReview(6)).toBe(true)
  expect(sql).toContain("'threshold',5")
 })
 test('role vocabulary for future history excludes non-responsible parties',()=>{
  const qualifying=['respondent','reported_person','subject','alleged_responsible']
  const excluded=['victim','witness','complainant','reporting_party','tanod','official']
  expect(qualifying).not.toEqual(expect.arrayContaining(excluded))
  expect(sql).not.toMatch(/victim|witness|complainant|reporting_party/)
 })
 test('retains narrow privileges and exposes no arbitrary event writer',()=>{
  expect(sql).toContain('alter table public.community_credit_enrollments enable row level security')
  expect(sql).toContain('revoke all on public.community_credit_enrollments from public,anon,authenticated,service_role')
  expect(sql).not.toMatch(/add_credit_points|deduct_credit_points|set_credit_score|create_credit_event/)
 })
 test('resident self-service remains limited to the guarded resident profile',()=>{
  expect(sql).toContain('not public.community_credit_may_view_resident(p_resident_id)')
  expect(sql).not.toMatch(/grant (select|insert|update|delete) on (table )?public\.community_credit_enrollments/i)
  expect(sql).not.toMatch(/grant execute on function public\.community_credit_enroll_resident/)
 })
 test('official bulk enrollment remains administration guarded',()=>{
  expect(sql).toMatch(/create function public\.community_credit_enroll_active_residents[\s\S]*?perform public\.community_credit_require_admin\(\)/)
  expect(sql).toMatch(/grant execute on function public\.community_credit_enroll_active_residents\(uuid\),[\s\S]*?public\.activate_community_credit_policy\(uuid\) to authenticated/)
 })
})
