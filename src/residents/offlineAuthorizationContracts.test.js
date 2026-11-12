// Offline source contracts, NOT a PostgreSQL policy evaluator or Auth verifier.
import fs from 'fs'
import path from 'path'
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8')
const strip=sql=>sql.replace(/--[^\n]*/g,'')
const guard=strip(read('supabase-migrations/068_resident_verification_security.sql'))
const insert=strip(read('supabase-migrations/069_resident_profile_insert_security.sql'))

test('both UPDATE policy paths retain explicit checks and staff authorization targets resident accounts',()=>{
 expect(guard).toContain("using (public.current_official_may_administer_records() and role='resident')")
 expect(guard).toContain("with check (public.current_official_may_administer_records() and role='resident')")
 expect(guard).toContain('using (auth.uid()=id) with check (auth.uid()=id)')
 expect(guard).toContain("v_admin := old.role='resident' and coalesce(public.current_official_may_administer_records(),false)")
 expect(guard).toContain("if not v_owner and not v_admin then raise exception 'Profile update not authorized'")
})
test('stable identity fields remain outside the ordinary UPDATE allowlist on both comparisons',()=>{
 const lists=[...guard.matchAll(/to_jsonb\((?:new|old)\)-array\[([\s\S]*?)\]/g)].map(match=>[...match[1].matchAll(/'([^']+)'/g)].map(item=>item[1]))
 expect(lists).toHaveLength(2);expect(lists[0]).toEqual(lists[1])
 for(const list of lists){for(const name of ['id','role','email','system_id','created_at'])expect(list).not.toContain(name);for(const name of ['first_name','contact_number','purok','photo_url','id_document_url'])expect(list).toContain(name)}
 expect(guard.indexOf('Protected account fields cannot be edited')).toBeLessThan(guard.indexOf('if v_admin then'))
})
test('verification metadata is compared as a group and resident resubmission cannot forge stamps',()=>{
 expect(guard).toContain('row(new.verification_status,new.verified_by,new.verified_at,new.verification_notes)')
 expect(guard).toContain("old.verification_status in ('pending','rejected','verified')")
 expect(guard).toContain('new.verified_by is not distinct from old.verified_by')
 expect(guard).toContain('new.verified_at is not distinct from old.verified_at')
 expect(guard).toContain("old.verification_status='ineligible'")
 expect(guard).toContain("new.verified_by := case when new.verification_status='pending' then null else v_actor end")
 expect(guard).toContain("new.verified_at := case when new.verification_status='pending' then null else now() end")
 expect(guard).toContain("if v_verification_changed and not coalesce(v_resubmit,false) then")
})
test('trusted maintenance is explicit, not null-JWT or SECURITY DEFINER current_user bypass',()=>{
 expect(guard).toContain("if auth.role()='service_role' then return new")
 expect(guard).toContain("auth.role() is null and session_user in ('postgres','supabase_admin')")
 expect(guard).toContain("coalesce(current_setting('role',true),'none') in ('none','postgres','supabase_admin')")
 expect(guard).not.toContain('current_user')
 expect(guard).toContain("if v_actor is null then raise exception 'Authenticated profile update required'")
 expect(guard).toContain('from public,anon,authenticated,service_role')
})
test('INSERT correction contains no alternate staff bypass and does not replace signup/UPDATE rules',()=>{
 const check=insert.slice(insert.indexOf('alter policy'))
 expect(check).toContain("auth.uid() is not null and auth.uid()=id and role='resident'")
 for(const item of ["verification_status='pending'",'verified_by is null','verified_at is null','verification_notes is null'])expect(check).toContain(item)
 expect(check).not.toMatch(/\bor\b|is_official|current_official|service_role/)
 expect(insert).not.toMatch(/create\s+(?:or\s+replace\s+)?function|grant\s+|update\s+public\./i)
})
test('signup, records helper and eligibility remain independent authorization/data boundaries',()=>{
 const signup=strip(read('supabase-migrations/011_split_resident_names.sql')).split('CREATE OR REPLACE FUNCTION public.handle_new_resident_signup()')[1]
 const fields=signup.match(/INSERT INTO public\.profiles\s*\(([\s\S]*?)\)/)[1]
 expect(fields).not.toMatch(/verification_status|verified_by|verified_at|verification_notes/)
 expect(signup).toContain('NEW.id');expect(signup).toContain("'resident'");expect(signup).toContain('ON CONFLICT (id) DO NOTHING')
 const helper=strip(read('supabase-migrations/031_official_authorization_cutover.sql'))
 for(const condition of ["p.role = 'official'",'bo.archived_at IS NULL','bo."position" = p_position','official_account_links'])expect(helper).toContain(condition)
 const eligibility=strip(read('supabase-migrations/056_resident_eligibility.sql'))
 expect(eligibility).toContain('auth.uid() is null or not coalesce(public.current_official_may_administer_records(),false)')
 expect(eligibility).toContain('for update');expect(eligibility).toContain('grant execute on function public.set_barangay_resident_eligibility(uuid,boolean) to authenticated')
 const sync=strip(read('supabase-migrations/055_verified_resident_directory_sync.sql'))
 expect(sync).not.toMatch(/update\s+public\.profiles|community_credit_events/i)
})
