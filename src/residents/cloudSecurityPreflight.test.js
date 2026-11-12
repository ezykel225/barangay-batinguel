// Static preparation checks only; no SQL parser/server, Auth or cloud requests.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8')
const sql=read('supabase-tests/068_069_cloud_preflight_readonly.sql')
const noComments=sql.replace(/--[^\n]*/g,'')
const tokens=noComments.replace(/'(?:''|[^'])*'/g,"''")
test('preflight permits only read-only catalog SELECTs and local transaction settings',()=>{
 expect(noComments.trim()).toMatch(/^begin read only;/)
 expect(noComments.trim()).toMatch(/rollback;$/)
 expect(noComments).toContain('set local search_path = pg_catalog;')
 expect(tokens).not.toMatch(/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|call|do|copy|execute|commit)\b/i)
 expect(tokens).not.toMatch(/\bset\s+(?:local\s+)?role\b|set_config|dblink|http_post|pg_sleep/i)
 const statements=noComments.split(';').map(s=>s.trim()).filter(Boolean)
 expect(statements.every(s=>/^(?:begin read only|set local (?:statement_timeout|lock_timeout|search_path)|select|rollback)\b/i.test(s))).toBe(true)
})
test('preflight returns no application rows, bodies, defaults, automation commands or config literals',()=>{
 expect(noComments).not.toMatch(/\b(?:from|join)\s+(?:public\.|auth\.|cron\.|net\.)/i)
 expect(noComments).toContain('md5(pg_get_functiondef(p.oid))')
 expect(noComments).toContain("md5(coalesce(array_to_string(p.proconfig,E'\\n'),''))")
 expect(noComments).not.toMatch(/select\s+(?:\w+\.)?\*\s+from/i)
 expect(noComments).not.toMatch(/select\s+pg_get_functiondef|select\s+p\.proconfig/i)
})
test('all policy paths, effective column/table/function permissions and trigger metadata are included',()=>{
 for(const name of ['pg_policies','has_column_privilege','has_table_privilege','has_function_privilege','pg_trigger','pg_auth_members','relforcerowsecurity','attidentity','attgenerated','convalidated','prosecdef','tgenabled','tgattr'])expect(noComments).toContain(name)
 for(const name of ['auth.users','public.profiles','public.prevent_role_self_change()','public.handle_new_resident_signup()','public.set_barangay_resident_eligibility(uuid,boolean)'])expect(noComments).toContain(name)
 expect(noComments).not.toMatch(/cmd\s*=\s*'UPDATE'/)
})
test('trigger mapping checks use object identity rather than search-path-dependent names',()=>{
 for(const [trigger,signature]of [
  ['trg_handle_new_resident_signup','public.handle_new_resident_signup()'],
  ['trg_compose_full_name','public.compose_full_name()'],
  ['trg_prevent_role_self_change','public.prevent_role_self_change()'],
  ['trg_notify_verification','public.notify_verification()'],
  ['trg_sync_verified_resident_directory','public.sync_verified_resident_directory()'],
 ]){
  expect(noComments).toContain(`t.tgname='${trigger}'`)
  expect(noComments).toContain(`t.tgfoid=to_regprocedure('${signature}')`)
 }
 expect(noComments).toContain('end as expected_function_matches')
 expect(noComments).not.toMatch(/tgfoid::regprocedure::text\s*=|function_signature\s*=/i)
})
test('068 and 069 remain unchanged during hosted preflight preparation',()=>{
 const expected={
  '068_resident_verification_security.sql':'9D5BC0FACA7774FE8B441DCA629FC48BE481FF5AC0F0600D62E4776B729AEE44',
  '069_resident_profile_insert_security.sql':'F3A6D830901E73C0FB34954B34300A7F5CC931E315B562D10DDC99F5DE2A6B8F',
 }
 for(const [file,hash]of Object.entries(expected))expect(crypto.createHash('sha256').update(read('supabase-migrations/'+file)).digest('hex').toUpperCase()).toBe(hash)
 const insert=read('supabase-migrations/069_resident_profile_insert_security.sql')
 expect(insert).toContain("and verification_status='pending'")
 expect(insert).toContain('verified_by is null and verified_at is null and verification_notes is null')
})
test('hosted plan separates approvals and requires real signed JWT and non-production controls',()=>{
 const doc=read('docs/stage7w-supabase-cloud-security-preflight-20261107.md')
 for(const text of ['Gate A','Gate B','Gate C','Gate D','profile-less','signed JWT','068 → 069','ON CONFLICT','No hosted SQL','NO-GO'])expect(doc).toContain(text)
})
