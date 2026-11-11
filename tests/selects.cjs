const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright')}catch{pw=require('/workspace/indie-forge/node_modules/playwright')}
const S=require('../src/game/save'),root=path.resolve(__dirname,'../dist'),report=[];
const server=http.createServer((req,res)=>{const p=path.join(root,req.url.split('?')[0]);fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({js:'application/javascript',css:'text/css',html:'text/html',webp:'image/webp',ttf:'font/ttf',wav:'audio/wav'})[p.split('.').pop()]||'application/octet-stream');res.end(b);});}).listen(8805,'127.0.0.1');
const trigger=(page,id)=>page.locator(`.select-trigger[data-select-for="${id}"]`);
async function popupFits(page){
 const values=await page.locator('.setup-field .select-value').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1));
 assert.ok(values,'selected setup values must fit without wrapping or clipping');
 const m=await page.locator('.select-popup').evaluate(el=>{
  const r=el.getBoundingClientRect();return {fits:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
   rounded:parseFloat(getComputedStyle(el).borderRadius)>0,
   options:[...el.querySelectorAll('[role=option]')].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),
   scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
 });assert.ok(m.fits&&m.rounded&&m.options&&!m.scroll,JSON.stringify(m));
}
(async()=>{
 const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [w,h] of [[320,568],[390,844],[568,320],[740,360],[1366,768]]){
   const touch=w<1000,ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch}),page=await ctx.newPage();
   page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const p=S.fresh();p.name='Роман';p.settings.music=p.settings.sfx=0;
   await page.addInitScript(p=>{if(!localStorage.getItem('durak-vahta-v1'))localStorage.setItem('durak-vahta-v1',JSON.stringify(p));},p);
   await page.goto('http://127.0.0.1:8805/index.html');await page.locator('[data-action=setup]').click();
   const press=async locator=>touch?locator.tap():locator.click();
   await press(trigger(page,'difficulty'));await popupFits(page);
   assert.equal(await page.locator('.select-popup [aria-selected=true]').textContent(),'Бывалый');
   assert.equal(await trigger(page,'difficulty').getAttribute('aria-expanded'),'true');
   if(w===390||w===568)await page.screenshot({path:path.resolve(__dirname,`../docs/screenshots/select-bots-${w}.png`)});
   await press(page.locator('.select-popup [role=option]').filter({hasText:'Палыч'}));
   assert.equal(await page.locator('#difficulty').inputValue(),'hard');assert.equal(await page.locator('.select-popup').count(),0);
   assert.equal(await trigger(page,'difficulty').evaluate(el=>el===document.activeElement),true,'focus returns to replaced trigger');
   await press(trigger(page,'difficulty'));await page.keyboard.press('Home');await page.keyboard.press('Escape');
   assert.equal(await page.locator('#difficulty').inputValue(),'hard','Escape does not select pending item');
   await press(trigger(page,'difficulty'));await press(page.locator('h1'));assert.equal(await page.locator('.select-popup').count(),0);
   await trigger(page,'difficulty').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Enter');
   assert.equal(await page.locator('#difficulty').inputValue(),'easy','keyboard selection');
   await trigger(page,'difficulty').focus();await page.keyboard.press('ArrowDown');const ruKeys=await ctx.newCDPSession(page);
   await ruKeys.send('Input.dispatchKeyEvent',{type:'keyDown',key:'п',code:'KeyG',windowsVirtualKeyCode:71,nativeVirtualKeyCode:71});
   await ruKeys.send('Input.dispatchKeyEvent',{type:'keyUp',key:'п',code:'KeyG',windowsVirtualKeyCode:71,nativeVirtualKeyCode:71});await ruKeys.detach();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#difficulty').inputValue(),'hard','Cyrillic typeahead');
   await press(trigger(page,'difficulty'));await page.keyboard.press('Tab');assert.equal(await page.locator('.select-popup').count(),0);
   await page.locator('#chaos').uncheck();assert.equal(await trigger(page,'frequency').isDisabled(),true);
   await trigger(page,'frequency').evaluate(el=>el.click());assert.equal(await page.locator('.select-popup').count(),0);
   await page.locator('#chaos').check();
   for(const [id,text,value] of [['variant','Переводной','transfer'],['count','3 участника','3'],['frequency','Редко','rare']]){
    await press(trigger(page,id));await popupFits(page);await press(page.locator('.select-popup [role=option]').filter({hasText:text}));
    assert.equal(await page.locator('#'+id).inputValue(),value);
   }
   if(w===390){
    await press(trigger(page,'difficulty'));await page.setViewportSize({width:h,height:w});
    await page.waitForFunction(()=>!document.querySelector('.select-popup'));
    assert.equal(await page.locator('#difficulty').inputValue(),'hard','rotation never commits pending selection');
    await page.setViewportSize({width:w,height:h});
   }
   await page.locator('[data-action=start]').click();await page.locator('.game-scene').waitFor();
   const game=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).game);
   assert.equal(game.options.variant,'transfer');assert.equal(game.options.difficulty,'hard');assert.equal(game.options.frequency,'rare');assert.equal(game.players.length,3);
   await page.locator('[data-action=settings]').click();
   await press(trigger(page,'setting-humor'));await popupFits(page);
   if(w===390)await page.screenshot({path:path.resolve(__dirname,'../docs/screenshots/select-humor-mobile.png')});
   await press(page.locator('.select-popup [role=option]').filter({hasText:'Без мата'}));
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).settings.humor),'clean');
   await press(trigger(page,'setting-dialogs'));await popupFits(page);
   await press(page.locator('.select-popup [role=option]').filter({hasText:'Редко'}));
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')).settings.dialogs),'rare');
   assert.deepEqual(errors,[]);report.push({viewport:`${w}x${h}`,input:touch?'touch':'mouse',selectionKeyboardCancelDisabledRotationAndSavedOptions:'passed'});
   await ctx.close();
  }
  fs.writeFileSync(path.resolve(__dirname,'../docs/select-results.json'),JSON.stringify(report,null,2));console.log('PASS custom dropdowns on five viewports: touch, mouse, keyboard, saved settings and real match options');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
