import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(path.join(__dirname, '../../supabase-migrations/047_edit_tanod_member.sql'), 'utf8')
  .replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase()

test('edit RPC uses existing records authorization and hardened execute privileges', () => {
  expect(sql).toContain('public.update_tanod_member( p_tanod_id uuid, p_full_name text, p_area_note text default null, p_display_order integer default 0)')
  expect(sql).toContain("security definer set search_path to ''")
  expect(sql).toContain('if v_uid is null then raise exception')
  expect(sql).toContain('if not public.current_official_may_administer_records() then raise exception')
  expect(sql).toContain('revoke execute on function public.update_tanod_member(uuid, text, text, integer) from public, anon;')
  expect(sql).toContain('grant execute on function public.update_tanod_member(uuid, text, text, integer) to authenticated;')
})

test('edit validates the trimmed name and reports a missing ID', () => {
  expect(sql).toContain("v_name text := btrim(coalesce(p_full_name, ''))")
  expect(sql).toContain("if v_name = '' then raise exception 'a tanod needs a name.'")
  expect(sql).toContain("if not found then raise exception 'that tanod is not on the roster.'")
  expect(sql.indexOf("if v_name = ''")).toBeLessThan(sql.indexOf('update public.tanod_members'))
})

test('updates the existing ID in place without changing state, assignments or history', () => {
  const update = sql.match(/update public\.tanod_members set (.*?) where id = p_tanod_id;/)[1]
  expect(update.split(/, (?=\w+ =)/).map((s) => s.split(' =')[0])).toEqual([
    'full_name', 'area_note', 'display_order', 'updated_at',
  ])
  expect(sql).not.toMatch(/\b(insert|delete|alter|drop)\b/)
  expect(sql).not.toMatch(/tanod_assignments|incident_tanod|p_active/)
})
