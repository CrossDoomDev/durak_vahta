const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
let pw; try { pw = require('playwright'); } catch { pw = require('/workspace/indie-forge/node_modules/playwright'); }
const E = require('../src/game/engine'), S = require('../src/game/save');
const root = path.resolve(__dirname, '../dist');
const server = http.createServer((req,res) => {
  const file = path.join(root,req.url.split('?')[0]);
  fs.readFile(file,(error,bytes) => {
    if(error){ res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type',({js:'application/javascript',css:'text/css',html:'text/html',webp:'image/webp',ttf:'font/ttf',wav:'audio/wav'})[file.split('.').pop()] || 'application/octet-stream');
    res.end(bytes);
  });
}).listen(8803,'127.0.0.1');
function fixture(kind) {
  const p = S.fresh(); p.name = 'Роман'; p.settings.music = p.settings.sfx = 0;
  const s = E.start({seed:11,count:3,names:['Роман','Палыч','Санёк']});
  const defending = kind === 'defend', adding = kind === 'add';
  const hands = defending ? [[1,3,18],[5,6,7],[14,15,16]] : adding ? [[9,10,11],[3,5,6],[14,15,16]] : [[0,1,9],[3,5,6],[14,15,16]];
  s.players.forEach((p,i) => {p.hand=hands[i];p.out=false;p.skip=0;});
  s.table = defending ? [{attack:0,defense:null},{attack:2,defense:null}] : adding ? [{attack:0,defense:1}] : [];
  s.deck = [27,28,29,30,31,32,33,34,35]; s.trump=3;s.trumpCard=35;
  s.discard = Array.from({length:36},(_,i)=>i).filter(c=>!hands.flat().includes(c)&&!s.deck.includes(c)&&!s.table.some(t=>t.attack===c||t.defense===c));
  s.effectDiscard=[];s.phase=defending?'defending':adding?'adding':'attacking';s.actor=0;
  s.attacker=s.origin=defending?1:0;s.defender=defending?0:1;s.limit=3;s.taking=false;s.passed=[];s.pending=[];
  E.invariant(s);p.game=s;return p;
}
const card = (p,id) => p.locator(`.hand [data-card="${id}"]`);
async function tapCard(page,id,touch) {
  const r = await card(page,id).boundingBox(), point={x:r.x+10,y:r.y+24};
  if(touch) await page.touchscreen.tap(point.x,point.y);
  else await page.mouse.click(point.x,point.y);
}
async function dragCard(page,id,target,touch,{cancel=false,mid=false}={}) {
  const r=await card(page,id).boundingBox(),start={x:r.x+10,y:r.y+24};
  if(touch){
    const session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(target.x-start.x)*i/8,y:start.y+(target.y-start.y)*i/8}]});
    if(mid) await page.screenshot({path:path.resolve(__dirname,'../docs/screenshots/drag-defense-mobile.png')});
    await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await session.detach();
  }else{
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});
    if(cancel) await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
    await page.mouse.up();
  }
}
(async()=>{
 const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],headless:true});const report=[];
 try{
  for(const [touch, width, height] of [[true,390,844],[true,844,390],[false,1100,800]]) for(const kind of ['attack','add','defend']){
   const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
   const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const p=fixture(kind);await page.addInitScript(p=>localStorage.setItem('durak-vahta-v1',JSON.stringify(p)),p);
   await page.goto('http://127.0.0.1:8803/index.html');await page.locator('[data-action="continue"]').click();
   const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);
   if(kind !== 'defend'){
    const id=kind==='add'?9:0;
    await tapCard(page,id,touch);assert.equal((await saved()).sequence,p.game.sequence,'single tap only selects');
    await page.waitForTimeout(430);await tapCard(page,id,touch);assert.equal((await saved()).sequence,p.game.sequence,'slow repeat only selects');
    await tapCard(page,id,touch);const next=await saved();
    assert.equal(next.sequence,p.game.sequence+1);assert.equal(next.table.at(-1).attack,id);assert.ok(!next.players[0].hand.includes(id));
    await page.locator('.flight-card[data-flight="play"]').waitFor({state:'visible'});
   }else{
    await tapCard(page,1,touch);await tapCard(page,1,touch);
    assert.equal((await saved()).sequence,p.game.sequence,'double tap never picks a defense target');
    const attack=await page.locator('.pairs [data-pair="0"]').boundingBox();
    const target={x:attack.x+attack.width/2,y:attack.y+attack.height/2};
    await dragCard(page,18,target,touch);await page.waitForFunction(()=>!document.querySelector('.drag-card'));
    assert.equal((await saved()).sequence,p.game.sequence,'wrong suit cannot cover');assert.equal(await card(page,18).evaluate(el=>getComputedStyle(el).visibility),'visible');
    await dragCard(page,1,{x:385,y:10},touch);await page.waitForFunction(()=>!document.querySelector('.drag-card'));
    assert.equal((await saved()).sequence,p.game.sequence,'drop outside table has no effect');
    await dragCard(page,1,target,touch,{cancel:true});await page.waitForFunction(()=>!document.querySelector('.drag-card'));
    assert.equal((await saved()).sequence,p.game.sequence,'cancel has no effect');
    await dragCard(page,1,target,touch,{mid:touch&&width===390});
    await page.waitForFunction(()=>document.body.dataset.animating==='false');const next=await saved();
    assert.equal(next.sequence,p.game.sequence+1);assert.equal(next.table[0].defense,1);assert.equal(next.table[1].defense,null,'exact drop target');
    assert.ok(!next.players[0].hand.includes(1));E.invariant(next);
    assert.equal(await page.locator('.drag-card,.drop-allowed,.drop-hover,.drop-rejected').count(),0,'gesture cleans up');
    await dragCard(page,3,target,touch);await page.waitForFunction(()=>!document.querySelector('.drag-card'));
    assert.equal((await saved()).sequence,next.sequence,'covered pair cannot receive another defense');
   }
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
   report.push({input:touch?'Android touch':'mouse',viewport:`${width}x${height}`,kind,result:'passed'});await context.close();
  }
  fs.writeFileSync(path.resolve(__dirname,'../docs/gesture-results.json'),JSON.stringify(report,null,2));console.log('PASS touch + mouse: double tap attack/add, drag defense, invalid/outside/cancelled/covered drop');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
