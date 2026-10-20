import fs from 'fs'
import path from 'path'
const read = p => fs.readFileSync(path.join(process.cwd(),p),'utf8').replace(/--[^\n]*/g,'')
const seed = read('supabase-seeds/seed_demo_barangay_residents.sql')
const sync = read('supabase-migrations/055_verified_resident_directory_sync.sql')
test('demo seed resolves ALL current verified resident UUIDs, never a count or name match', () => {
 expect(seed).toMatch(/array_agg\(p.id order by p.id\)/)
 expect(seed).toMatch(/p.role = 'resident' and p.verification_status = 'verified'/)
 expect(seed).toMatch(/from public.profiles p where p.id = any\(demo_profile_ids\) for share/)
 expect(seed).toMatch(/purok,'active',id/)
 expect(seed).not.toMatch(/full_name|lower\(|ilike|limit\s+10/i)
})
test('demo seed is insert-only and preserves existing UUID/DOB/status on repeat', () => {
 expect(seed).toMatch(/on conflict \(profile_id\) do nothing/i)
 expect(seed).not.toMatch(/\b(update|delete|alter|create|drop|grant|revoke|truncate)\b/i)
 expect(seed).not.toMatch(/residents_registry|auth\.users/i)
 expect(seed).toMatch(/when 1 then date '1950-01-15'/)
 expect(seed).toMatch(/when 2 then date '1958-06-10'/)
 expect(seed).toMatch(/when 3 then date '1965-03-22'/)
})
test('seed validates source data, reports inserts and scopes verification queries to snapshot', () => {
 expect(seed).toMatch(/regexp_replace\(p.contact_number/)
 expect(seed).toMatch(/get diagnostics v_inserted = row_count/i)
 expect(seed).toMatch(/current_date - interval '60 years'/)
 expect(seed.match(/where profile_id = any\(string_to_array/g)).toHaveLength(3)
})
test('future trigger only runs after verification guards; no backfill or direct EXECUTE', () => {
 expect(sync).toMatch(/after insert or update of role,verification_status on public.profiles/i)
 expect(sync).toMatch(/new.role is distinct from 'resident' or new.verification_status is distinct from 'verified'/)
 expect(sync).toMatch(/old.role = 'resident' and old.verification_status = 'verified'/)
 expect(sync).toMatch(/security definer set search_path = ''/i)
 expect(sync).toMatch(/revoke all on function public.sync_verified_resident_directory\(\) from public,anon,authenticated/)
 expect(sync).not.toMatch(/grant execute|update public.profiles|residents_registry|auth\.users/i)
})
test('future UUID upsert creates null DOB, preserves existing DOB/status and logs atomically', () => {
 expect(sync).toMatch(/new.first_name,new.middle_name,new.last_name,new.suffix,null/)
 expect(sync).toMatch(/new.purok,'active',new.id/)
 const conflict=sync.split('on conflict (profile_id) do update set')[1].split('returning id')[0]
 expect(conflict).not.toMatch(/birth_date\s*=|resident_status\s*=/)
 expect(conflict).toMatch(/mobile_number=excluded.mobile_number/)
 expect(sync).toMatch(/insert into public.activity_log/)
 expect(sync).not.toMatch(/exception when|1950|1958|1965|age\(/i)
})
