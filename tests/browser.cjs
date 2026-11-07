const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright');}catch{pw=require(process.env.PLAYWRIGHT_MODULE||'/workspace/indie-forge/node_modules/playwright');}
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:8788/index.html',out=path.join(root,'docs/screenshots');fs.mkdirSync(out,{recursive:true});
const http=require('node:http');const server=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]),p=path.join(root,'dist',rel==='/'?'index.html':rel);if(!p.startsWith(path.join(root,'dist')+'/')){res.writeHead(403);return res.end();}fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'html':'text/html','js':'application/javascript','css':'text/css','webp':'image/webp','wav':'audio/wav','ttf':'font/ttf'})[p.split('.').pop()]||'application/octet-stream');res.end(b);});}).listen(8788,'127.0.0.1');
(async()=>{const browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const report={externalRequests:[],errors:[],scenarios:[],viewports:[]};
try{
 const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:8788/'))report.externalRequests.push(r.url());});
 await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await context.setOffline(true);await page.reload();await page.locator('#name-form').waitFor();await page.locator('#player-name').fill('<script>');assert.equal(await page.locator('#name-submit').isDisabled(),true);await page.locator('#player-name').fill('Анна-Мария');await page.locator('#name-submit').click();await page.locator('.menu').waitFor();assert.ok((await page.locator('#menu-quote').textContent()).includes('Анна-Мария'));await page.screenshot({path:path.join(out,'01-menu-1366.png')});report.scenarios.push('onboarding/name validation and personalized dialogue');
 await page.locator('[data-action="settings"]').click();await page.locator('[data-setting="fast"]').check();await page.locator('[data-setting="music"]').fill('0');await page.locator('[data-setting="sfx"]').fill('0');await page.locator('[data-action="back"]').first().click();await page.locator('[data-action="setup"]').click();await page.locator('#variant').selectOption('transfer');await page.locator('#frequency').selectOption('mad');await page.screenshot({path:path.join(out,'02-opponents-1366.png')});await page.locator('[data-action="start"]').click();await page.locator('.game-scene').waitFor();
 // Freeze via settings, reload the file completely offline, then compare the complete serialized game.
 await page.locator('.game-toolbar [data-action="settings"]').click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);await page.reload();await page.locator('.menu').waitFor();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);assert.deepEqual(restored,saved);await page.locator('[data-action="continue"]').click();report.scenarios.push('offline service-worker reload preserves full game/RNG/events');
 // Responsive screenshots while paused by opening settings then returning; gameplay remains real.
 for(const [w,h,label]of [[1366,768,'03-table-1366'],[1920,1080,'04-table-1920'],[844,390,'05-table-mobile-landscape'],[390,844,'06-table-mobile-portrait']]){
  await page.setViewportSize({width:w,height:h});await page.waitForTimeout(150);await page.screenshot({path:path.join(out,label+'.png')});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,`viewport ${w} overflow`);report.viewports.push(`${w}x${h}`);
 }
 await page.setViewportSize({width:1366,height:768});let sawEvent=false,won=false,finished=0;
 for(let attempt=0;attempt<4&&!won;attempt++){
 let guard=0;
 while(guard++<1500){
  const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);
  if(s.finished){finished++;if(!s.result.draw&&s.result.loser!==0){won=true;await page.screenshot({path:path.join(out,'08-victory.png')});}else await page.screenshot({path:path.join(out,'08-results.png')});break;}
  if(s.phase==='event'){
   if(!sawEvent){await page.screenshot({path:path.join(out,'07-event.png')});sawEvent=true;}
   const choice=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('durak-vahta-v1')).game;return VahtaEvents.botEvent(s);});
   const radio=page.locator(`input[name="event-choice"][value="${choice.choice}"]`);if(await radio.count())await radio.check();
   const target=page.locator(`[data-action="event-target"][data-id="${choice.target}"]`);if(await target.count())await target.click();
   const card=page.locator(`[data-action="event-card"][data-card="${choice.card}"]`);if(await card.count())await card.click();
   await page.locator('[data-action="event-accept"]').click();continue;
  }
  if(s.actor!==0){await page.waitForTimeout(110);continue;}
  const a=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('durak-vahta-v1')).game;return VahtaEngine.bot(VahtaEngine.observation(s));});assert.ok(a,'player must have a legal action');
  if(['attack','transfer','defend'].includes(a.type))await page.locator(`.hand [data-action="select-card"][data-card="${a.card}"]`).click();
  if(a.type==='defend')await page.locator(`[data-action="cover"][data-pair="${a.pair}"]`).click();
  else if(a.type==='attack'||a.type==='transfer')await page.locator(`[data-action="play-selected"][data-type="${a.type}"]`).click();
  else await page.locator(`[data-action="${a.type}"]`).click();
 }
 assert.ok(guard<1500,'gameplay exceeded diagnostic guard');
 if(!won){await page.locator('[data-action="rematch"]').click();await page.locator('[data-action="start"]').click();}
 }
 assert.ok(sawEvent,'must actually encounter a queued event');assert.ok(won,'must capture a real human victory');report.scenarios.push(`${finished} complete offline UI games; actual event choices and real victory`);
 await page.locator('.results [data-action="menu"]').click();await page.locator('[data-action="profile"]').click();const dl=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const d=await dl;const exported=await d.path();const raw=JSON.parse(fs.readFileSync(exported,'utf8'));assert.equal(raw.name,'Анна-Мария');await page.locator('#profile-name').fill('Иван Петров');await page.locator('[data-action="save-name"]').click();await page.locator('#import-file').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.locator('[data-action="confirm-modal"]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).name),'Анна-Мария');report.scenarios.push('export/import with confirmation; profile rename');
 await page.locator('[data-action="gallery"]').click();await page.locator('[data-action="gallery-events"]').click();assert.equal(await page.locator('.event-tile').count(),30);await page.locator('.event-tile').first().click();await page.locator('[data-action="close-modal"]').click();await page.locator('[data-action="gallery-cards"]').click();assert.equal(await page.locator('.gallery-cards .playing-card').count(),36);report.scenarios.push('36-card gallery and 30 functioning event previews');
 const missing=await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).length);assert.equal(missing,0);assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);await context.close();
}finally{await browser.close();server.close();fs.writeFileSync(path.join(root,'docs/browser-results.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
