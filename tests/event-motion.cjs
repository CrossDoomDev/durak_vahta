const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require('/workspace/indie-forge/node_modules/playwright')}
const E=require('../src/game/engine'),F=require('../src/game/events'),S=require('../src/game/save');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({js:'application/javascript',css:'text/css',html:'text/html',webp:'image/webp',ttf:'font/ttf',wav:'audio/wav'})[p.split('.').pop()]||'application/octet-stream');res.end(b);});}).listen(8802,'127.0.0.1');
function fixture(id,empty=false){
 const p=S.fresh();p.name='Роман';p.settings.music=p.settings.sfx=0;
 const s=E.start({count:4,seed:11,names:['Роман','Палыч','Санёк','Артём']});
 s.players.forEach((p,i)=>{p.hand=Array.from({length:i===2?1:3},(_,k)=>i*3+k);p.out=false;p.skip=0});
 if(id===6&&empty)s.players[1].hand=[3];
 if(id===29&&empty){s.players[1].hand=[];s.players[1].out=true;}
 s.deck=empty?[]:[12,13,14,15,16,17];
 s.discard=Array.from({length:36},(_,i)=>i).filter(c=>!s.players.some(p=>p.hand.includes(c))&&!s.deck.includes(c));
 s.table=[];s.effectDiscard=[];s.pending=[];s.phase='event';s.event={id,recipient:1};s.eventDeck=[];s.actor=1;s.nextCandidate=0;s.trump=3;
 E.invariant(s);p.game=s;return p;
}
(async()=>{
const b=await pw.chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],headless:true});const report=[];
try{
 for(const [id,empty] of [[2,false],[10,false],[12,false],[3,false],[6,false],[0,false],[1,true],[19,false],[5,false],[12,true],[6,true],[29,true]]){
  const ctx=await b.newContext({viewport:id===5?{width:844,height:390}:{width:390,height:844},isMobile:true,hasTouch:true});const page=await ctx.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const p=fixture(id,empty),next=structuredClone(p.game),r=F.eventAction(next,F.botEvent(next));assert.ok(r.ok);
  await page.addInitScript(p=>{if(!localStorage.getItem('durak-vahta-v1'))localStorage.setItem('durak-vahta-v1',JSON.stringify(p));},p);
  await page.goto('http://127.0.0.1:8802/index.html');await page.locator('[data-action="continue"]').click();
  await page.evaluate(()=>{window.flights=[];window.labels=[];new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches('.flight-card'))window.flights.push({back:n.classList.contains('back-card'),phase:n.dataset.flight});if(n.matches('.event-seat-label'))window.labels.push(n.textContent);}}).observe(document.body,{childList:true,subtree:true});});
  const countBefore=await page.locator('.opponent[data-seat="2"] .hand-count').textContent();
  await page.locator('[data-action="event-accept"]').click();
  await page.waitForFunction(()=>document.body.dataset.animating==='true');
  assert.equal(await page.locator('#app').evaluate(el=>el.inert),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game.sequence),next.sequence);
  await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='event-accept';document.body.append(b);b.click();b.remove();});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game.sequence),next.sequence,'input locked during playback');
  if(id===2){
   await page.locator('.flight-card').waitFor({state:'visible'});
   assert.equal(await page.locator('.opponent[data-seat="2"] .hand-count').textContent(),countBefore,'counter waits for landing');
   assert.equal(await page.locator('.flight-card.back-card').count(),1,'bot transfer must stay private');
   const x=await page.locator('.flight-card').boundingBox();await page.waitForTimeout(250);const y=await page.locator('.flight-card').boundingBox();assert.ok(Math.abs(x.x-y.x)+Math.abs(x.y-y.y)>8,'card visibly travels');
   await page.screenshot({path:path.join(__dirname,'../docs/event-transfer-mobile.png')});
  }
  if(id===12&&!empty){await page.locator('.flight-card').waitFor({state:'visible'});await page.reload();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);assert.deepEqual(saved.players.map(p=>p.hand),next.players.map(p=>p.hand),'reload preserves committed circle exactly once');report.push({id,reload:'passed'});await ctx.close();continue;}
  await page.waitForFunction(()=>document.body.dataset.animating==='false');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);
  assert.deepEqual(saved.players.map(p=>p.hand),next.players.map(p=>p.hand),'presentation never changes the accepted hands');
  assert.equal(saved.sequence,next.sequence);
  const got=await page.evaluate(()=>({flights:window.flights,labels:window.labels,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,logs:document.querySelectorAll('.motion-announcement').length}));
  assert.equal(got.flights.filter(f=>f.phase==='event').length,r.effects.filter(e=>e.type==='card').length,'one flight for every changed card');
  if(id===3||id===5)assert.ok(got.flights.some(f=>!f.back),'human receives a visible card');
  if(id===6&&empty)assert.ok(got.labels.includes('Вышел без карт'));
  if(id===29&&empty)assert.ok(got.labels.includes('Участник уже вышел'));
  assert.ok(got.labels.length);assert.equal(got.logs,0);assert.equal(got.overflow,false);assert.deepEqual(errors,[]);
  report.push({id,empty,...got});await ctx.close();
 }
 fs.writeFileSync(path.join(__dirname,'../docs/event-motion-results.json'),JSON.stringify(report,null,2));console.log('Event browser checks passed:',report.length);
}finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
