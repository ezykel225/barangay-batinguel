// Parses and executes the actual Edge handler with injected Supabase/provider mocks only.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict')
const root=path.join(__dirname,'..'),req=require('module').createRequire(path.join(root,'package.json')),babel=req('@babel/core')
const providerSource=fs.readFileSync(path.join(root,'supabase/functions/_shared/smsProvider.js'),'utf8')
const provider={};new Function('exports',babel.transformSync(providerSource,{configFile:false,babelrc:false,plugins:[req.resolve('@babel/plugin-transform-modules-commonjs')]}).code)(provider)
const source=fs.readFileSync(path.join(root,'supabase/functions/send-sms-broadcast/index.ts'),'utf8').replace(/^import[^\n]*\n/gm,'')
const code=babel.transformSync(source,{filename:'index.ts',configFile:false,babelrc:false,plugins:[req.resolve('@babel/plugin-transform-typescript')]}).code
;(async()=>{let passed=0
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)}
function setup({signed=true,allowed=true,live=false,token=true,batch=[]}={}){
 let handler,providerCalls=0,claimed=0,finished=0
 const caller={auth:{getUser:async()=>({data:{user:signed?{id:'actor-id'}:null},error:null})},rpc:async name=>name==='sms_send_context'?{error:allowed?null:{message:'denied'}}:{data:{counts:{pending:0,accepted:finished,unknown:0}},error:null}}
 const worker={rpc:async name=>{if(name==='sms_claim_batch'){claimed++;return{data:batch,error:null}}finished++;return{error:null}}}
 const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon-mock',SUPABASE_SERVICE_ROLE_KEY:'service-mock',IPROG_SMS_API_TOKEN:token?'token-mock':'',SMS_BROADCASTS_LIVE_ENABLED:String(live)}
 const Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn}}
 new Function('Deno','createClient','processBatch',code)(Deno,(_,key)=>key==='service-mock'?worker:caller,args=>provider.processBatch({...args,fetchImpl:async(url,opts)=>{providerCalls++;assert.equal(url,'https://iprogsms.com/api/v1/sms_messages');assert.ok(!url.includes('token-mock'));assert.equal(JSON.parse(opts.body).api_token,'token-mock');return new Response(JSON.stringify({status:200,message_id:'test-accepted'}),{status:200})}}))
 return {call:async(body={broadcast_id:'00000000-0000-4000-8000-000000000001'},auth='Bearer mock',method='POST')=>handler(new Request('https://example.invalid/function',{method,headers:auth?{Authorization:auth,'Content-Type':'application/json'}:{},...(method==='POST'?{body:JSON.stringify(body)}:{})})),counts:()=>({providerCalls,claimed,finished})}
}
await test('CORS preflight and method validation never reach provider',async()=>{const s=setup();assert.equal((await s.call({},null,'OPTIONS')).status,200);assert.equal((await s.call({},null,'GET')).status,405);assert.equal(s.counts().providerCalls,0)})
await test('missing JWT and publishable-key-only callers rejected',async()=>{const s=setup({signed:false});assert.equal((await s.call({},null)).status,401);assert.equal((await s.call()).status,401);assert.equal(s.counts().claimed,0)})
await test('resident or wrong-source permission rejected before worker',async()=>{const s=setup({allowed:false,live:true});assert.equal((await s.call()).status,403);assert.equal(s.counts().claimed,0)})
await test('client cannot supply phone/message/actor overrides',async()=>{const s=setup({live:true});assert.equal((await s.call({broadcast_id:'00000000-0000-4000-8000-000000000001',phone:'639171234567'})).status,400);assert.equal(s.counts().claimed,0)})
await test('live mode defaults disabled; no credits or claims',async()=>{const s=setup();assert.equal((await s.call()).status,409);assert.equal(s.counts().claimed,0)})
await test('missing server token fails before durable claim',async()=>{const s=setup({live:true,token:false});assert.equal((await s.call()).status,503);assert.equal(s.counts().claimed,0)})
await test('authorized request uses database-snapshotted recipient and reports accepted, not delivered',async()=>{const s=setup({live:true,batch:[{recipient_id:'r',phone:'639171234567',message:'Public fixture only'}]});const res=await s.call();assert.equal(res.status,200);const body=await res.json();assert.equal(body.counts.accepted,1);assert.ok(!JSON.stringify(body).includes('token-mock'));assert.ok(!JSON.stringify(body).includes('delivered'));assert.deepEqual(s.counts(),{providerCalls:1,claimed:1,finished:1})})
console.log(`${passed} mocked Edge-handler checks passed. No live API calls.`)
})().catch(e=>{console.error(e);process.exitCode=1})
