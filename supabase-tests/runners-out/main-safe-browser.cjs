const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {init,login}=require('./browser-common.cjs');
process.on('unhandledRejection',()=>console.log('QA request canceled during context shutdown; request headers suppressed.'));
(async()=>{const s=await init(),p=s.page,calls=[],results=[];const dir=path.join(s.evidence,'main-safe-patch');fs.mkdirSync(dir,{recursive:true});
const text=fs.readFileSync(path.join(__dirname,'compat-browser.cjs'),'utf8');
await eval('(async()=>{'+text.slice(text.indexOf("await s.context.route('http://127.0.0.1:55421/rest/v1/**'"),text.indexOf("p.on('console'"))+'})()');
const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS '+name)}catch(e){results.push({name,pass:false,error:e.message.slice(0,800)});console.log('FAIL '+name+' '+e.message.slice(0,150));await p.screenshot({path:path.join(dir,'failure-'+results.length+'.png')})}};
try{
for(const width of [375,1024])await test('Existing public routes '+width,async()=>{await p.setViewportSize({width,height:900});for(const route of ['/','/reservation','/track-reservation','/health-center','/e-services','/login']){await p.goto('http://127.0.0.1:3001'+route);await p.waitForLoadState('networkidle');assert.equal(await p.locator('main').count()>0,true)}await p.screenshot({path:path.join(dir,'public-'+width+'.png')})});
await test('Resident login and Settings touch/keyboard controls',async()=>{
 await login(s,'residentA');
 await p.setViewportSize({width:375,height:900});
 await p.getByRole('button',{name:'New Request'}).click();
 await p.getByRole('dialog').getByRole('button',{name:'Submit Request'}).click();
 await p.getByText('Please select a document type and enter a purpose.',{exact:true}).waitFor();
 await p.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 const menu=p.getByRole('button',{name:'Open navigation menu'});await menu.click();await p.keyboard.press('Escape');
 assert.equal(await menu.getAttribute('aria-expanded'),'false');
 assert.equal(await p.locator('[data-rht-toaster]').evaluate(e=>getComputedStyle(e).top),'80px');
 for(const width of [375,1024]){
  await p.setViewportSize({width,height:900});const settings=p.getByRole('button',{name:'Settings',exact:true});
  if(!await settings.isVisible())await p.getByRole('button',{name:'Open navigation menu'}).click();await settings.click();
  const b=p.getByRole('button',{name:'Show the new password'});assert((await b.boundingBox()).width>=44);
  await b.focus();await p.keyboard.press('Enter');assert.equal(await p.getByRole('button',{name:'Hide the new password'}).getAttribute('aria-pressed'),'true');
  assert.equal(await p.getByLabel('New Password',{exact:true}).getAttribute('type'),'text');await p.keyboard.press('Space');
  assert.equal(await p.getByLabel('New Password',{exact:true}).getAttribute('type'),'password');
  await p.screenshot({path:path.join(dir,'settings-'+width+'.png')});
 }
});
await s.context.clearCookies();await p.evaluate(()=>localStorage.clear());
await test('Secretary login and absent optional status',async()=>{await s.context.route('http://127.0.0.1:55421/rest/v1/kapitan_status?**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));await login(s,'secretary');await p.getByText('Status not published',{exact:true}).waitFor();assert.equal(s.responses.filter(r=>r.path.includes('kapitan_status')&&r.status===406).length,0);await p.screenshot({path:path.join(dir,'official-absent-status.png')})});
assert.deepEqual(s.errors,[]);
}finally{fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({results,calls,errors:s.errors,responses:s.responses},null,2));await s.browser.close();console.log('TOTAL '+results.filter(x=>x.pass).length+'/'+results.length);if(results.some(x=>!x.pass))process.exitCode=1}})().catch(e=>{console.log('STOP '+e.message.slice(0,400));process.exitCode=1});
