const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const base='https://barangay-batinguel-e-processing.vercel.app';
(async()=>{
 const home=await fetch(base+'/');const html=await home.text();assert.equal(home.status,200);
 const asset=html.match(/src="([^"]*\/static\/js\/main\.[^"]+\.js)"/);assert(asset,'main bundle');
 const js=await (await fetch(new URL(asset[1],base))).text();
 assert(js.includes('Could not load Kapitan status:'));assert(js.includes('Status not published'));
 console.log('PASS canonical HTTPS homepage and new approved bundle');
 const {chromium}=require(path.join(process.env.LOCALAPPDATA,'Temp','barangay-browser-qa-tools','node_modules','playwright-core'));
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1024,height:900}});const errors=[],blockedWrites=[],rows=[];
 await context.route('**/*',r=>{if(!['GET','HEAD'].includes(r.request().method())){blockedWrites.push({method:r.request().method(),host:new URL(r.request().url()).hostname});return r.abort()}return r.continue()});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const dir=path.join(process.env.LOCALAPPDATA,'Temp','barangay-browser-qa-evidence-20261105','production-safe-patch');fs.mkdirSync(dir,{recursive:true});
 try{
 for(const route of ['/','/about','/officials','/e-services','/announcements','/events','/community-safety','/login','/reservation','/track-reservation','/health-center']){
  const r=await p.goto(base+route);assert.equal(r.status(),200);await p.locator('main').waitFor();await p.waitForLoadState('networkidle');
  rows.push({route,status:r.status(),width:1024});console.log('PASS public '+route);
 }
 await p.goto(base+'/');await p.locator('a[href="/about"]').first().click();await p.waitForURL('**/about');console.log('PASS actual About navigation link');
 await p.setViewportSize({width:375,height:900});await p.goto(base+'/');await p.locator('main').waitFor();await p.screenshot({path:path.join(dir,'home-375.png')});
 const controls=await p.getByRole('button').evaluateAll(es=>es.filter(e=>e.getAttribute('aria-expanded')!==null).map(e=>({label:e.getAttribute('aria-label'),expanded:e.getAttribute('aria-expanded')})));
 console.log('Mobile navigation controls '+JSON.stringify(controls));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({base,rows,errors,blockedWrites,controls,asset:asset[1]},null,2));
 console.log('PASS '+rows.length+' public routes; no page JavaScript errors; no production form submitted');
 }finally{await browser.close()}
})().catch(e=>{console.log('SMOKE FAILED: '+e.message.slice(0,500));process.exitCode=1});
