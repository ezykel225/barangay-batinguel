// Runs actual incident schema, identity helpers, map reader and 057 in isolated PostgreSQL/WASM.
// No Supabase connection, .env, network, or live data. PGLITE_TEST_MODULE uses the local test runtime.
const {PGlite}=require(process.env.PGLITE_TEST_MODULE||'@electric-sql/pglite')
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict')
const sql=n=>fs.readFileSync(path.join(__dirname,'../supabase-migrations',n),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const body=(text,name)=>{const start=text.toLowerCase().indexOf('create or replace function public.'+name+'(');assert.ok(start>=0,name);return text.slice(start,text.indexOf('$function$;',start)+12)}
let db;(async()=>{
 db=new PGlite();let passed=0
 const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++}
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create table public.profiles(id uuid primary key,role text,full_name text);
 create table public.barangay_officials(id uuid primary key,position text,archived_at timestamptz);
 create table public.official_account_links(profile_id uuid,official_id uuid);
 insert into public.profiles values('${id(1)}','official','Secretary'),('${id(2)}','official','Punong'),('${id(3)}','official','Kagawad'),('${id(4)}','resident','Resident'),('${id(5)}','official','Archived'),('${id(6)}','official','Unlinked');
 insert into public.barangay_officials values('${id(11)}','Barangay Secretary',null),('${id(12)}','Punong Barangay',null),('${id(13)}','Kagawad',null),('${id(15)}','Barangay Secretary',now());
 insert into public.official_account_links values('${id(1)}','${id(11)}'),('${id(2)}','${id(12)}'),('${id(3)}','${id(13)}'),('${id(5)}','${id(15)}');`)
 const foundation=sql('044_incident_blotter_tanod.sql')
 await db.exec(foundation.slice(foundation.indexOf('create table if not exists public.incidents'),foundation.indexOf('create or replace function public.generate_incident_reference')))
 await db.exec(body(sql('031_official_authorization_cutover.sql'),'current_official_holds_position'))
 await db.exec(body(foundation,'current_official_is_active'))
 await db.exec(body(foundation,'current_official_may_administer_records'))
 await db.exec(body(foundation,'incident_map_points'))
 await db.exec(sql('057_incident_map_location.sql'))
 await db.exec(`insert into public.incidents(id,reference,incident_type,occurred_at,narrative,location_text,area_note,source,status,recorded_by) values('${id(100)}','INC-ORIGINAL','other',now(),'Original narrative','Original location','Original landmark','official_report','recorded','${id(1)}'),('${id(101)}','INC-SECOND','other',now(),'Second','Second',null,'official_report','recorded','${id(1)}');
 insert into public.blotter_entries(id,entry_reference,incident_id,summary,recorded_by) values('${id(200)}','BLT-ORIGINAL','${id(100)}','Original snapshot','${id(1)}'),('${id(201)}','BLT-SECOND','${id(101)}','Second snapshot','${id(1)}');`)
 const actor=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.user_id',$1,false)",[n?id(n):'']);await db.exec('set role '+role)}
 const inspect=async(query)=>{await db.exec('reset role');return (await db.query(query)).rows}
 const row=async()=> (await inspect(`select * from public.incidents where id='${id(100)}'`))[0]
 const history=async()=>await inspect('select * from public.blotter_entry_history order by created_at,id')
 const call=(lat,lng,n=100)=>db.query('select * from public.set_incident_map_location($1,$2,$3)',[id(n),lat,lng])
 const stable=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['latitude','longitude','updated_at'].includes(k)))
 const original=await row()
 await test('anonymous has no RPC EXECUTE',async()=>{await actor(null,'anon');await assert.rejects(call(9,123),e=>e.code==='42501')})
 for(const [n,label] of [[3,'other official'],[4,'resident'],[5,'archived official'],[6,'unlinked official']])await test(label+' cannot change coordinates',async()=>{await actor(n);await assert.rejects(call(9,123),e=>e.code==='42501')})
 await test('Secretary adds coordinates and one amended event',async()=>{await actor(1);const r=await call(9.3,123.3);assert.equal(Number(r.rows[0].latitude),9.3);const h=await history();assert.equal(h.length,1);assert.equal(h[0].note,'Incident map location added.');assert.equal(h[0].actor_profile_id,id(1))})
 await test('identities/narrative/status/location/snapshot remain unchanged',async()=>{assert.deepEqual(stable(await row()),stable(original));const b=(await inspect(`select * from public.blotter_entries where id='${id(200)}'`))[0];assert.equal(b.entry_reference,'BLT-ORIGINAL');assert.equal(b.summary,'Original snapshot');assert.equal(b.incident_id,id(100))})
 await test('identical and rounded retries preserve timestamp/history',async()=>{const before=await row();await actor(1);await call(9.30000001,123.30000001);assert.deepEqual(await row(),before);assert.equal((await history()).length,1)})
 await test('Punong may add coordinates to another existing incident',async()=>{await actor(2);await call(9.4,123.4,101);assert.equal((await history()).length,2)})
 await test('existing map position can be corrected with one event',async()=>{await actor(2);await call(9.31,123.31);assert.equal(Number((await row()).latitude),9.31);const h=await history();assert.equal(h.length,3);assert.equal(h.filter(r=>r.note==='Incident map location updated.').length,1)})
 for(const [lat,lng,label] of [[91,123,'latitude'],[9,181,'longitude'],[null,123,'missing latitude'],[9,null,'missing longitude'],[null,null,'clearing'],['NaN',123,'NaN'],['Infinity',123,'Infinity']])await test('rejects '+label,async()=>{await actor(1);await assert.rejects(call(lat,lng),e=>e.code==='22023')})
 await test('unknown incident returns controlled not-found',async()=>{await actor(1);await assert.rejects(call(9,123,999),e=>e.code==='P0002')})
 await test('direct client table update remains denied',async()=>{for(const n of [1,4]){await actor(n);await assert.rejects(db.query(`update public.incidents set latitude=1,longitude=1 where id='${id(100)}'`),e=>e.code==='42501')}})
 await test('history failure rolls back coordinate update atomically',async()=>{const before=await row(),h=await history();await db.exec(`create function local_fail_history() returns trigger language plpgsql as $$ begin raise exception 'Injected history failure';end;$$;create trigger local_fail_history before insert on public.blotter_entry_history for each row execute function local_fail_history();`);await actor(1);await assert.rejects(call(10,124),/Injected history failure/);assert.deepEqual(await row(),before);assert.deepEqual(await history(),h);await db.exec('drop trigger local_fail_history on public.blotter_entry_history')})
 await test('existing map query returns same incident with corrected coordinates',async()=>{await actor(1);const points=(await db.query('select * from public.incident_map_points(null,null,null)')).rows;const point=points.find(p=>p.id===id(100));assert.equal(point.reference,'INC-ORIGINAL');assert.equal(Number(point.latitude),9.31);assert.equal(points.length,2)})
 console.log(`${passed} isolated PostgreSQL tests passed. No live database used.`);await db.close()
})().catch(async e=>{console.error(e);await db?.close();process.exitCode=1})
