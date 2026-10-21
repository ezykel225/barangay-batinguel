// Isolated PostgreSQL/WASM execution only; never connects to Supabase or reads .env.
const {PGlite}=require(process.env.PGLITE_TEST_MODULE||'@electric-sql/pglite')
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict')
const sql=n=>fs.readFileSync(path.join(__dirname,'../supabase-migrations',n),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
let db;(async()=>{
 db=new PGlite();let count=0
 const test=async(name,fn)=>{await fn();console.log('PASS '+name);count++}
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)$$;
 create table public.profiles(id uuid primary key,role text,full_name text);
 create function public.is_official(p_id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where id=p_id and role='official')$$;
 create table public.barangay_officials(id uuid primary key,position text,archived_at timestamptz);
 create table public.official_account_links(official_id uuid primary key references public.barangay_officials(id),profile_id uuid unique references public.profiles(id));
 create table public.activity_log(id uuid default gen_random_uuid(),action text,entity_type text,entity_id uuid,subject text,actor_id uuid,actor_name text);
 create table public.announcements(id uuid primary key,title text,description text);
 create table public.events(id bigint primary key,title text,event_date date,location text);
 create table public.health_events(id uuid primary key,title text,event_date date,location text);
 create table public.medical_programs(id uuid primary key,title text,schedule_label text,time_label text);
 insert into public.profiles values('${id(1)}','official','Official'),('${id(2)}','nurse','Nurse'),('${id(3)}','resident','Resident'),('${id(4)}','tanod','Tanod');
 insert into public.profiles values('${id(5)}','official','Unlinked'),('${id(6)}','official','Archived');
 insert into public.barangay_officials values('${id(20)}','Kagawad',null),('${id(21)}','Barangay Secretary',now());
 insert into public.official_account_links values('${id(20)}','${id(1)}'),('${id(21)}','${id(6)}');
 insert into public.announcements values('${id(10)}','Water advisory','Public notice');
 insert into public.events values(11,'Public event','2026-11-01','Hall');
 insert into public.health_events values('${id(12)}','Health event','2026-11-02','Health Center');
 insert into public.medical_programs values('${id(13)}','Wellness','Every Tuesday','8 AM');`)
 const foundation=sql('054_barangay_resident_directory.sql');await db.exec(foundation.slice(foundation.indexOf('create table public.barangay_residents'),foundation.indexOf('-- Extend only')))
 // Actual actor trigger preserves the existing Nurse/Official logging rules.
 const audit=sql('017_nurse_activity_logging.sql');const start=audit.indexOf('CREATE OR REPLACE FUNCTION public.stamp_activity_actor()');await db.exec(audit.slice(start,audit.indexOf('$$;',start)+3));await db.exec('create trigger stamp_activity before insert on public.activity_log for each row execute function public.stamp_activity_actor()')
 await db.exec(sql('058_targeted_sms.sql'))
 await db.exec(`insert into public.barangay_residents(id,first_name,last_name,birth_date,mobile_number,purok,resident_status) values
 ('${id(100)}','A','One',((now() at time zone 'Asia/Manila')::date-interval '60 years')::date,'09171234567','Purok 1','active'),
 ('${id(101)}','B','Two',((now() at time zone 'Asia/Manila')::date-interval '60 years'+interval '1 day')::date,'+639171234567','Purok 1','active'),
 ('${id(102)}','C','Three',null,null,'Purok 2','active'),
 ('${id(103)}','D','Four','1950-01-01','09179876543','Purok 2','inactive'),
 ('${id(104)}','E','Five','1955-01-01','09179876543','Purok 2','active');`)
 const actor=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.role',$2,false)",[n?id(n):'',role]);await db.exec('set role '+role)}
 const owner=async q=>{await db.exec('reset role');return db.query(q)}
 const preview=(type='announcement',source=id(10),audience={type:'all_residents'})=>db.query('select public.sms_preview($1,$2,null,$3) value',[type,source,audience]).then(r=>r.rows[0].value)
 const prepare=(snap,key=500,dry=true,type='announcement',source=id(10),kind='initial')=>db.query('select public.sms_prepare_broadcast($1,$2,$3,$4,$5,$6,$7) id',[type,source,kind,snap.audience,snap.preview_token,id(key),dry]).then(r=>r.rows[0].id)
 await test('anon/resident/Tanod cannot preview; directory and deliveries remain private',async()=>{for(const [n,role]of[[null,'anon'],[3,'authenticated'],[4,'authenticated']]){await actor(n,role);await assert.rejects(preview());await assert.rejects(db.query('select * from public.sms_broadcast_recipients'),e=>e.code==='42501')}})
 await test('Official SMS requires a stable linked active identity, not role or position alone',async()=>{
  for(const n of [5,6]){await actor(n);await assert.rejects(preview(),e=>e.code==='42501');await assert.rejects(preview('event','11'),e=>e.code==='42501')}
  await actor(1);assert.equal((await preview()).eligible,4);assert.equal((await preview('event','11')).eligible,4);
  await owner(`delete from public.official_account_links where profile_id='${id(1)}'`);await actor(1);await assert.rejects(preview(),e=>e.code==='42501');
  await owner(`insert into public.official_account_links values('${id(20)}','${id(1)}')`);
  await actor(2);assert.equal((await preview('health_event',id(12))).eligible,4);assert.equal((await preview('medical_program',id(13))).eligible,4);
 })
 await test('Official content and Nurse health authorization stay separate',async()=>{await actor(1);await assert.rejects(preview('health_event',id(12)));await actor(2);await assert.rejects(preview());assert.equal((await preview('medical_program',id(13))).eligible,4)})
 await test('all active directory residents counted; missing phones and normalized duplicates skipped',async()=>{await actor(1);const s=await preview();assert.equal(s.eligible,4);assert.equal(s.recipients,2);assert.equal(s.skipped,2);assert.ok(!JSON.stringify(s).includes('639171234567'));assert.ok(!('_recipients'in s))})
 await test('Senior 60+ includes birthday today, excludes tomorrow and missing DOB',async()=>{await actor(1);const s=await preview('announcement',id(10),{type:'senior_citizens'});assert.equal(s.eligible,2);assert.equal(s.missing_dob,1)})
 await test('generic age range is inclusive and purok matching exact',async()=>{const a=await preview('announcement',id(10),{type:'age_range',min_age:60,max_age:60});assert.equal(a.eligible,1);const p=await preview('announcement',id(10),{type:'purok',value:'Purok 1'});assert.equal(p.eligible,2);assert.equal(p.recipients,1);await assert.rejects(preview('announcement',id(10),{type:'pregnant'}))})
 await test('provider normalization accepts only supported Philippine forms',async()=>{await owner('select 1');for(const raw of ['09171234567','+63 (917) 123-4567','639171234567'])assert.equal((await db.query('select public.sms_normalize_phone($1) n',[raw])).rows[0].n,'639171234567');for(const raw of ['bad09171234567','123',null,'+1 9171234567'])assert.equal((await db.query('select public.sms_normalize_phone($1) n',[raw])).rows[0].n,null)})
 await test('dry run snapshots residents without pending attempts or provider access',async()=>{await actor(1);const s=await preview();const b=await prepare(s);const state=(await db.query('select public.sms_broadcast_state($1) s',[b])).rows[0].s;assert.equal(state.counts.pending,0);assert.equal(state.counts.dry_run,2);await assert.rejects(db.query('select * from public.sms_claim_batch($1,$2)',[b,id(1)]),e=>e.code==='42501')})
 await test('same request key is retry safe and payload reuse is rejected',async()=>{await actor(1);const s=await preview();const a=await prepare(s,501);assert.equal(a,await prepare(s,501));await assert.rejects(prepare({...s,audience:{type:'senior_citizens'}},501))})
 await test('changed audience after preview requires fresh confirmation',async()=>{await actor(1);const s=await preview();await owner(`update public.barangay_residents set mobile_number='09179999999' where id='${id(104)}'`);await actor(1);await assert.rejects(prepare(s,502),/changed/);})
 let live
 await test('one live initial per source prevents repeated publishing with another request key',async()=>{await actor(1);const s=await preview();live=await prepare(s,503,false);await assert.rejects(prepare(s,504,false),e=>e.code==='23505')})
 await test('worker rejects an initiating official archived or unlinked after preparation',async()=>{
  await owner(`update public.barangay_officials set archived_at=now() where id='${id(20)}'`);await actor(null,'service_role');await assert.rejects(db.query('select * from public.sms_claim_batch($1,$2)',[live,id(1)]),e=>e.code==='42501');
  await owner(`update public.barangay_officials set archived_at=null where id='${id(20)}'`);await owner(`delete from public.official_account_links where profile_id='${id(1)}'`);await actor(null,'service_role');await assert.rejects(db.query('select * from public.sms_claim_batch($1,$2)',[live,id(1)]),e=>e.code==='42501');
  await owner(`insert into public.official_account_links values('${id(20)}','${id(1)}')`);
 })
 await test('worker claim is service-only and rechecks initiating actor',async()=>{await actor(1);await assert.rejects(db.query('select * from public.sms_claim_batch($1,$2)',[live,id(1)]),e=>e.code==='42501');await actor(null,'service_role');await assert.rejects(db.query('select * from public.sms_claim_batch($1,$2)',[live,id(2)]),e=>e.code==='42501')})
 let batch
 await test('durable claims never reclaim attempting recipients',async()=>{await actor(null,'service_role');batch=(await db.query('select * from public.sms_claim_batch($1,$2)',[live,id(1)])).rows;assert.equal(batch.length,2);assert.equal((await db.query('select * from public.sms_claim_batch($1,$2)',[live,id(1)])).rows.length,0)})
 await test('accepted and unknown outcomes stay distinct; completion retry adds no audit',async()=>{await actor(null,'service_role');await db.query('select public.sms_finish_attempt($1,$2,$3,$4,$5)',[batch[0].recipient_id,id(1),'accepted',null,'iSms-test']);await db.query('select public.sms_finish_attempt($1,$2,$3,$4,$5)',[batch[1].recipient_id,id(1),'unknown','transport_unknown',null]);const before=(await owner('select count(*) n from public.activity_log')).rows[0].n;await actor(null,'service_role');await db.query('select public.sms_finish_attempt($1,$2,$3,$4,$5)',[batch[1].recipient_id,id(1),'unknown','transport_unknown',null]);assert.equal((await owner('select count(*) n from public.activity_log')).rows[0].n,before);await actor(1);const state=(await db.query('select public.sms_broadcast_state($1) s',[live])).rows[0].s;assert.equal(state.counts.accepted,1);assert.equal(state.counts.unknown,1)})
 await test('manual reminder is a new snapshot; Nurse logging matches existing activity vocabulary',async()=>{await actor(2);const s=await preview('health_event',id(12),{type:'senior_citizens'});const b=await prepare(s,505,true,'health_event',id(12),'reminder');assert.ok(b);const log=(await owner("select * from public.activity_log where entity_type='health_event'")).rows;assert.equal(log[0].actor_id,id(2))})
 await test('later ineligible resident is skipped before a resumed batch, never replaced with new recipients',async()=>{await actor(1);const s=await preview('event','11');const b=await prepare(s,506,false,'event','11','reminder');await owner(`update public.barangay_residents set resident_status='inactive' where id='${id(104)}'`);await actor(null,'service_role');const claimed=(await db.query('select * from public.sms_claim_batch($1,$2)',[b,id(1)])).rows;assert.equal(claimed.length,1);await actor(1);const state=(await db.query('select public.sms_broadcast_state($1) s',[b])).rows[0].s;assert.equal(state.counts.skipped,3)})
 await test('broadcast/recipient creation rolls back if high-level audit fails',async()=>{await db.exec('reset role');await db.exec(`create function fail_sms_audit() returns trigger language plpgsql as $$begin raise exception 'Injected audit failure';end;$$;create trigger fail_sms_audit before insert on public.activity_log for each row execute function fail_sms_audit();`);const before=(await db.query('select count(*) n from public.sms_broadcasts')).rows[0].n;await actor(1);const s=await preview();await assert.rejects(prepare(s,507),/Injected/);assert.equal((await owner('select count(*) n from public.sms_broadcasts')).rows[0].n,before)})
 console.log(`${count} isolated SMS PostgreSQL tests passed. No live SQL/provider calls.`);await db.close()
})().catch(async e=>{console.error(e);await db?.close();process.exitCode=1})
