import { emptyResident, filterResidents, residentPayload, validMobile } from './directoryData'
import fs from 'fs'
import path from 'path'
const sql = fs.readFileSync(path.join(process.cwd(),'supabase-migrations/054_barangay_resident_directory.sql'),'utf8')
test.each(['09171234567','+639171234567','639171234567','0917 123 4567',''])('valid optional mobile %s', v => expect(validMobile(v)).toBe(true))
test.each(['123','+631234567890','091712345678','hello','+1 9171234567'])('invalid mobile %s', v => expect(validMobile(v)).toBe(false))
test('calendar date and nullable identity; writer cannot link by name or UUID', () => {
  const result=residentPayload({...emptyResident(),birth_date:'2000-02-29'})
  expect(result.p_birth_date).toBe('2000-02-29');expect(result.p_id).toBeNull();expect(result).not.toHaveProperty('p_profile_id')
})
test('search and filters compose', () => {
 const rows=[{first_name:'Ana',last_name:'Cruz',purok:'A',resident_status:'active'},{first_name:'Ben',last_name:'Cruz',purok:'B',resident_status:'inactive'}]
 expect(filterResidents(rows,'cruz','active','A')).toEqual([rows[0]])
 expect(filterResidents(rows,'','active','B')).toEqual([])
})
test('migration denies direct access for ALL client roles; only records officials pass both RPC guards', () => {
 expect(sql).toMatch(/enable row level security/i)
 expect(sql).toMatch(/revoke all on public.barangay_residents from public, anon, authenticated/i)
 expect(sql).not.toMatch(/create policy|grant (select|insert|update|delete)/i)
 expect(sql.match(/auth.uid\(\) is null or not public.current_official_may_administer_records\(\)/g)).toHaveLength(2)
 expect(sql).toMatch(/grant execute on function public.barangay_resident_directory\(\),public.save_barangay_resident.*to authenticated/i)
})
test('optional unique profile UUID checks resident role; no voter import or fake demographics', () => {
 expect(sql).toMatch(/profile_id uuid unique references public.profiles\(id\)/)
 expect(sql).toMatch(/id = new.profile_id and role = 'resident'/)
 expect(sql).not.toMatch(/(?:insert into|update|delete from) public.residents_registry/i)
 expect(sql).not.toMatch(/insert into public.barangay_residents[^;]*select/i)
 expect(sql).toMatch(/birth_date date/)
 expect(sql).toMatch(/Birth date cannot be in the future/)
})
test('targeting query stays private and uses optional inclusive DOB bounds and exact purok', () => {
 expect(sql).toMatch(/r.resident_status='active'/)
 expect(sql).toMatch(/p_born_from is null or r.birth_date >= p_born_from/)
 expect(sql).toMatch(/p_born_through is null or r.birth_date <= p_born_through/)
 expect(sql).toMatch(/p_purok is null or r.purok=p_purok/)
 expect(sql).not.toMatch(/grant execute[^;]*barangay_resident_candidates/)
})
