// Isolated PostgreSQL/WASM tests. Never connects to Supabase or reads .env.
// Run with PGLITE_TEST_MODULE pointing to an installed @electric-sql/pglite.
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite')
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict')
const sql=name=>fs.readFileSync(path.join(__dirname,'../supabase-migrations',name),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
;let database; (async()=>{
 const db=database=new PGlite();let passed=0
 const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)}
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create table public.profiles(id uuid primary key,role text,position text,verification_status text,first_name text,middle_name text,last_name text,suffix text,contact_number text,purok text,verified_by uuid,verified_at timestamptz,verification_notes text);
 create function public.current_official_may_administer_records() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='official' and position in ('Barangay Secretary','Punong Barangay')) $$;
 create table public.activity_log(id uuid default gen_random_uuid(),action text,entity_type text,entity_id uuid,subject text,constraint activity_log_entity_type_check check(entity_type in ('resident_account')));
 insert into public.profiles(id,role,position) values ('${id(1)}','official','Barangay Secretary'),('${id(2)}','official','Punong Barangay'),('${id(3)}','official','Kagawad'),('${id(4)}','resident',null),('${id(5)}','nurse',null),('${id(6)}','tanod',null);
 insert into public.profiles(id,role,verification_status,first_name,last_name,contact_number,purok) values('${id(100)}','resident','verified','Profile','Name','09171234567','Purok 1');`)
 await db.exec(sql('054_barangay_resident_directory.sql'))
 await db.exec(sql('055_verified_resident_directory_sync.sql'))
 await db.exec(sql('056_resident_eligibility.sql'))
 await db.exec(`insert into public.barangay_residents(id,first_name,last_name,birth_date,mobile_number,purok,profile_id) values('${id(201)}','Reviewed','Identity','1960-02-29','09179876543','Reviewed area','${id(100)}'),('${id(202)}','Unlinked','Resident','1980-01-01',null,null,null);
 create table local_history(resident_id uuid references public.barangay_residents(id),profile_id uuid references public.profiles(id),note text);
 insert into local_history values('${id(201)}','${id(100)}','Preserve this history');`)
 const inspect=async text=>{const role=(await db.query('select current_user as name')).rows[0].name;await db.exec('reset role');try{return await db.query(text)}finally{await db.exec('set role '+role)}}
 const row=async()=> (await inspect(`select * from public.barangay_residents where id='${id(201)}'`)).rows[0]
 const profile=async()=> (await inspect(`select * from public.profiles where id='${id(100)}'`)).rows[0]
 const count=async()=>Number((await inspect('select count(*) as n from public.activity_log')).rows[0].n)
 const actor=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.user_id',$1,false)",[n?id(n):'']);await db.exec(`set role ${role}`)}
 const call=(resident,active)=>db.query('select public.set_barangay_resident_eligibility($1,$2)',[id(resident),active])
 const stable=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['resident_status','updated_at'].includes(k)))
 const original=await row()
 await test('anon has neither RPC EXECUTE nor direct directory access',async()=>{await actor(null,'anon');await assert.rejects(call(201,false),e=>e.code==='42501');await assert.rejects(db.query('select * from public.barangay_residents'),e=>e.code==='42501')})
 await test('resident/nurse/Tanod/other Official denied by server; no changes',async()=>{for(const n of [3,4,5,6]){await actor(n);await assert.rejects(call(201,false),e=>e.code==='42501')}await actor(1);assert.equal((await row()).resident_status,'active');assert.equal(await count(),0)})
 await test('Secretary atomically deactivates linked directory/account',async()=>{await call(201,false);assert.equal((await row()).resident_status,'inactive');assert.equal((await profile()).verification_status,'ineligible');assert.deepEqual(stable(await row()),stable(original));assert.equal(await count(),1)})
 await test('identical retry does not write timestamps or duplicate audit',async()=>{const before=await row(),n=await count();await call(201,false);assert.deepEqual(await row(),before);assert.equal(await count(),n)})
 await test('Punong reactivates verified/active; 055 cannot replace authoritative details',async()=>{await actor(2);await call(201,true);assert.equal((await profile()).verification_status,'verified');assert.equal((await row()).resident_status,'active');assert.deepEqual(stable(await row()),stable(original));assert.equal((await row()).mobile_number,'09179876543');const before=await row(),n=await count();await call(201,true);assert.deepEqual(await row(),before);assert.equal(await count(),n)})
 await test('unlinked resident supports both statuses without creating/changing accounts',async()=>{const before=(await inspect('select * from public.profiles order by id')).rows;await call(202,false);await call(202,true);assert.deepEqual((await inspect('select * from public.profiles order by id')).rows,before);assert.equal((await inspect(`select resident_status from public.barangay_residents where id='${id(202)}'`)).rows[0].resident_status,'active')})
 await test('audit failure rolls back profile and directory together',async()=>{await db.exec(`reset role;create function fail_local_audit() returns trigger language plpgsql as $$ begin if new.subject='Barangay resident marked inactive' then raise exception 'injected audit failure';end if;return new;end;$$;create trigger local_fail_audit before insert on public.activity_log for each row execute function fail_local_audit();`);await actor(1);const before=await row(),p=await profile(),n=await count();await assert.rejects(call(201,false),/injected audit failure/);assert.deepEqual(await row(),before);assert.deepEqual(await profile(),p);assert.equal(await count(),n);await db.exec('reset role;drop trigger local_fail_audit on public.activity_log')})
 await test('profile failure prevents partial directory update',async()=>{await db.exec(`create function fail_local_profile() returns trigger language plpgsql as $$ begin raise exception 'injected profile failure';end;$$;create trigger local_fail_profile before update on public.profiles for each row execute function fail_local_profile();`);await actor(1);const before=await row();await assert.rejects(call(201,false),/injected profile failure/);assert.deepEqual(await row(),before);assert.equal((await profile()).verification_status,'verified');await db.exec('reset role;drop trigger local_fail_profile on public.profiles')})
 await test('metadata save cannot bypass eligibility or replay a stale status',async()=>{await actor(1);await call(201,false);await assert.rejects(db.query('select public.save_barangay_resident($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(201),'Reviewed',null,'Identity',null,'1960-02-29','09179876543','Reviewed area','active']),/eligibility action/);assert.equal((await row()).resident_status,'inactive');assert.equal((await profile()).verification_status,'ineligible');await call(201,true)})
 await test('missing/invalid targets rejected; no history deletion or identity change',async()=>{await actor(1);await assert.rejects(call(999,false),/Resident unavailable/);await assert.rejects(call(201,null),/required/);await db.exec('reset role');assert.equal(Number((await db.query('select count(*) n from local_history')).rows[0].n),1);assert.deepEqual(stable(await row()),stable(original));assert.equal(Number((await db.query('select count(*) n from public.barangay_residents')).rows[0].n),2)})
 console.log(`${passed} local PostgreSQL tests passed. No live database used.`);await db.close()
})().catch(async err=>{console.error(err);await database?.close();process.exitCode=1})
