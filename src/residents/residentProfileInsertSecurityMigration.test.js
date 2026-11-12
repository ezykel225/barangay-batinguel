// Static SQL contracts only: no PostgreSQL or hosted authorization is executed.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
const sql=fs.readFileSync(path.join(process.cwd(),'supabase-migrations/069_resident_profile_insert_security.sql'),'utf8')
const body=sql.replace(/--[^\n]*/g,'')
test('069 is an atomic prepared policy-only correction without data or grants changes',()=>{
 expect(body.trim()).toMatch(/^begin;/);expect(body.trim()).toMatch(/commit;$/)
 expect(body).toContain("set local lock_timeout = '3s'");expect(body).toContain("set local statement_timeout = '30s'")
 expect(body).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s+|grant\s+|revoke\s+|create\s+(?:or\s+replace\s+)?function|alter\s+table)\b/i)
})
test('self inserts require own resident identity and cannot pre-approve an account',()=>{
 const policy=body.slice(body.indexOf('alter policy'))
 expect(policy).toContain('"Users can insert their own resident profile" on public.profiles')
 for(const condition of ['auth.uid() is not null','auth.uid()=id',"role='resident'","verification_status='pending'",'verified_by is null','verified_at is null','verification_notes is null'])expect(policy).toContain(condition)
 expect(policy).not.toMatch(/\bor\b|is_official|service_role|current_official_may_administer_records/)
})
test('unknown insert/all policy paths and missing reviewed UPDATE guard fail closed',()=>{
 expect(body).toContain("cmd in ('INSERT','ALL')")
 expect(body).toContain("raise exception '069 unexpected profile INSERT/ALL policies; stop and review'")
 expect(body).toContain("cmd='INSERT' and policyname='Users can insert their own resident profile'")
 expect(body).toContain("raise exception '069 requires reviewed migration 068 first'")
 expect(body).toContain('relrowsecurity');expect(body).toContain("('id','role','verification_status','verified_by','verified_at','verification_notes')")
})
test('trusted signup implementation and 068 are preserved, not replaced',()=>{
 const old=fs.readFileSync(path.join(process.cwd(),'supabase-migrations/068_resident_verification_security.sql'))
 expect(crypto.createHash('sha256').update(old).digest('hex').toUpperCase()).toBe('9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44')
 expect(body).not.toMatch(/handle_new_resident_signup|auth\.users|community_credit|prevent_role_self_change\(\)\s*returns/i)
 expect(sql).toContain('Trusted signup/service SQL can bypass RLS by design')
})
test('hosted-only instructions retain SQL testing with explicit resource and write approval',()=>{
 const doc=fs.readFileSync(path.join(process.cwd(),'docs/supabase-only-development.md'),'utf8')
 expect(doc).toContain('Docker, a local PostgreSQL server, Supabase CLI and database restoration are not startup requirements')
 expect(doc).toContain('prepared, not approved for execution');expect(doc).toContain('only after explicit authorization');expect(doc).toContain('064 remains excluded')
})
