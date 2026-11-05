// TEST ONLY. Uses the private RC3 synthetic local stack; refuses any other DB/URL.
// Run: node supabase-tests/qa_isolated_map_fixture.cjs
// No production credentials, migration application or direct table writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const {createClient}=require('@supabase/supabase-js');
const dir=path.join(process.env.LOCALAPPDATA,'Temp','barangay-rc3-local');
const cfg=JSON.parse(fs.readFileSync(path.join(dir,'config.json')));
const accounts=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json')));
assert.equal(cfg.db,'validation067_rc3_api_20261104');
const url='http://127.0.0.1:55421';
const client=createClient(url,cfg.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const manifestPath=path.join(dir,'qa-map-fixture.json');
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath)):{};
const save=()=>fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const checks=[];const pass=name=>{checks.push(name);console.log('PASS '+name)};
const rpc=async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw new Error(name+' '+r.error.code);return r.data};
(async()=>{
 const count=cp.execFileSync('docker',['exec','pg067test','psql','-X','-qAt','-U','supabase_admin','-d',cfg.db,'-c',"select count(*) from public.barangay_residents where not(last_name like 'RC3 %' or id::text like 'f067%')"],{encoding:'utf8'}).trim();assert.equal(count,'0');pass('synthetic-only resident provenance guard');
 const login=await client.auth.signInWithPassword({email:accounts.secretary.email,password:cfg.userPassword});assert.ifError(login.error);
 const credit=await rpc('community_credit_profile',{p_resident_id:accounts.residentA.residentId});
 if(!manifest.externalId){manifest.externalId=await rpc('save_external_person',{p_id:null,p_first_name:'Fictional QA',p_middle_name:null,p_last_name:'Map External TEST ONLY',p_suffix:null,p_recorded_barangay:'Synthetic',p_recorded_city_municipality:'Synthetic',p_address_snapshot:'TEST ONLY fictional identity'});save()}
 for(const key of ['mapped','unmapped']){
  if(!manifest[key]){const reference=await rpc('record_incident',{p_incident_type:'other',p_occurred_at:new Date(Date.now()-7200000).toISOString(),p_narrative:'TEST ONLY QA MAP FIXTURE: fictional '+key+' record, no real event.',p_location_text:'TEST ONLY QA map area',p_source:'official_report',p_latitude:key==='mapped'?9.31:null,p_longitude:key==='mapped'?123.29:null,p_area_note:'TEST ONLY fictional map example',p_tanod_id:null,p_tanod_role:null});const queue=await rpc('incident_queue',{p_from:null,p_to:null,p_type:null});manifest[key]={id:queue.find(r=>r.reference===reference).id,reference};save()}
  const parties=await rpc('incident_parties_for',{p_incident_id:manifest[key].id});
  for(const [kind,id,role]of [['resident',accounts.residentA.residentId,'witness'],['external',manifest.externalId,'subject']]){
   if(!parties.some(p=>p.person_kind===kind&&p.person_id===id))await rpc('save_incident_party',{p_id:null,p_incident_id:manifest[key].id,p_resident_id:kind==='resident'?id:null,p_external_person_id:kind==='external'?id:null,p_role:role,p_address_snapshot:null,p_involvement_note:'TEST ONLY fictional involvement; no responsibility finding',p_outcome_status:'not_determined'});
  }
 }
 const points=await rpc('incident_map_points',{p_from:null,p_to:null,p_type:null});const mapped=points.find(r=>r.id===manifest.mapped.id);assert(mapped);assert.equal(Number(mapped.latitude),9.31);assert.equal(Number(mapped.longitude),123.29);assert(!points.some(r=>r.id===manifest.unmapped.id));pass('coordinate marker included and unlocated incident omitted from markers');
 assert(!('narrative' in mapped)&&!('name_snapshot' in mapped));pass('map-safe projection excludes narrative/person identity');
 const queue=await rpc('incident_queue',{p_from:null,p_to:null,p_type:null});assert(queue.some(r=>r.id===manifest.unmapped.id));pass('unlocated incident retained in accessible queue data');
 for(const key of ['mapped','unmapped']){const parties=await rpc('incident_parties_for',{p_incident_id:manifest[key].id});assert(parties.some(p=>p.person_id===accounts.residentA.residentId&&p.role==='witness'&&p.outcome_status==='not_determined'));assert(parties.some(p=>p.person_id===manifest.externalId&&p.role==='subject'&&p.outcome_status==='not_determined'))}pass('resident witness and distinct external subject outcomes preserved');
 const resident=await rpc('person_analytics',{p_person_kind:'resident',p_person_id:accounts.residentA.residentId,p_from:null,p_to:null,p_window:'all'});for(const key of ['mapped','unmapped'])assert(JSON.stringify(resident).includes(manifest[key].reference));pass('resident repeated incident references appear in person analytics');
 const analytics=await rpc('barangay_safety_analytics',{p_from:null,p_to:null,p_category:null,p_area:null,p_window:'all'});const repeated=analytics.repeat_people.find(p=>p.person_id===manifest.externalId);assert(repeated);assert.equal(Number(repeated.qualifying_matters),2);assert.equal(Number(repeated.not_determined),2);assert(!analytics.repeat_people.some(p=>p.person_id===accounts.residentA.residentId));pass('external repeated involvement counted; neutral witness excluded from responsibility-role list');
 assert.deepEqual(await rpc('community_credit_profile',{p_resident_id:accounts.residentA.residentId}),credit);pass('incident and identity fixture causes no Community Credit changes');
 fs.writeFileSync(path.join(dir,'qa-map-results.json'),JSON.stringify({checks,passed:checks.length,manifest},null,2));console.log('TOTAL '+checks.length+'/'+checks.length);
})().catch(e=>{console.error('TEST ONLY fixture failed: '+e.message);process.exitCode=1});
