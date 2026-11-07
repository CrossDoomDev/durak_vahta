/* Pure deterministic rules. No DOM, I/O or hidden-information bot access. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.VahtaEngine=api;})(globalThis,function(){
'use strict';
const SUITS=['♠','♥','♦','♣'],RANKS=['6','7','8','9','10','В','Д','К','Т'];
const card=id=>({id,suit:Math.floor(id/9),rank:id%9+6});
const ordinary=x=>Number.isInteger(x)&&x>=0&&x<36;
function random(s){let t=s.rng+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);s.rng=s.rng>>>0;return ((t^t>>>14)>>>0)/4294967296;}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){let j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function beats(a,b,trump){a=card(a);b=card(b);return a.suit===b.suit?a.rank>b.rank:a.suit===trump&&b.suit!==trump;}
const active=s=>s.players.map((p,i)=>!p.out?i:-1).filter(i=>i>=0);
function next(s,i){for(let k=1;k<=s.players.length;k++){let n=(i+k)%s.players.length;if(!s.players[n].out)return n;}return i;}
function order(s,start){const a=[];for(let k=0;k<s.players.length;k++){let i=(start+k)%s.players.length;if(!s.players[i].out)a.push(i);}return a;}
const stockCount=s=>s.deck.filter(ordinary).length;
function log(s,text){s.log.push(text);if(s.log.length>120)s.log.shift();}
function draw(s,i,count){let got=0;while(got<count&&s.deck.length){let c=s.deck.shift();if(ordinary(c)){s.players[i].hand.push(c);got++;}else{s.pending.push(i);log(s,'Производственная необходимость: жетон для '+s.players[i].name);}}return got;}
function start(options={}){
 const n=options.count||4;if(![2,3,4].includes(n))throw Error('Участников должно быть 2–4');
 const names=options.names||['Вахтовик','Палыч','Санёк','Артём'];
 const s={version:1,rng:(Number(options.seed)||Date.now())>>>0,options:{variant:options.variant==='transfer'?'transfer':'standard',chaos:!!options.chaos,frequency:options.frequency||'normal',difficulty:options.difficulty||'medium'},players:Array.from({length:n},(_,i)=>({name:names[i]||'Вахтовик',npc:options.npcs?.[i]??i-1,hand:[],out:false,skip:0})),deck:[],discard:[],effectDiscard:[],table:[],phase:'dealing',actor:0,attacker:0,defender:1,origin:0,limit:6,passed:[],taking:false,pending:[],eventDeck:[],eventDiscard:[],event:null,round:0,log:[],sequence:0,finished:false,result:null,metrics:{events:[],successfulDefenses:[],skips:0,actions:0},transition:['setup','dealing']};
 s.deck=shuffle(s,Array.from({length:36},(_,i)=>i));
 for(let r=0;r<6;r++)for(let i=0;i<n;i++)draw(s,i,1);
 s.trumpCard=s.deck.at(-1);s.trump=card(s.trumpCard).suit;
 let low=15,first=0;s.players.forEach((p,i)=>p.hand.forEach(c=>{if(card(c).suit===s.trump&&card(c).rank<low){first=i;low=card(c).rank;}}));
 if(s.options.chaos){let count={rare:2,normal:4,mad:6}[s.options.frequency]||4;for(let i=0;i<count;i++){let at=Math.floor(random(s)*Math.max(1,s.deck.length-1));s.deck.splice(at,0,'@'+i);}s.eventDeck=Array.from({length:30},(_,i)=>({i,key:-Math.log(Math.max(1e-10,random(s)))/([5,14,29].includes(i)?.18:1)})).sort((a,b)=>a.key-b.key).map(x=>x.i);}
 s.startedSeed=options.seed??null;s.gameId='vahta-'+s.rng+'-'+s.players.map(p=>p.npc).join('-');newRound(s,first);invariant(s);return s;
}
function newRound(s,candidate){
 s.transition=['next_round','attacking'];s.round++;s.table=[];s.passed=[];s.taking=false;
 if(s.players[candidate].out)candidate=next(s,candidate);
 // Every skip consumes one attack opportunity. Bound by the finite flags, not a forced game end.
 let remaining=s.players.reduce((a,p)=>a+p.skip,0)+s.players.length;
 while(s.players[candidate].skip>0&&remaining-->0){s.players[candidate].skip--;s.metrics.skips++;log(s,s.players[candidate].name+' пропускает атаку, но продолжает защищаться');candidate=next(s,candidate);}
 s.attacker=s.origin=s.actor=candidate;s.defender=next(s,candidate);s.limit=Math.min(6,s.players[s.defender].hand.length);s.phase='attacking';
 log(s,'Раунд '+s.round+': '+s.players[candidate].name+' → '+s.players[s.defender].name);
}
function adders(s){return order(s,s.attacker).filter(i=>i!==s.defender);}
function canAdd(s,c){return s.table.length<s.limit&&(s.table.length===0||s.table.some(p=>card(p.attack).rank===card(c).rank||p.defense!=null&&card(p.defense).rank===card(c).rank));}
function legal(s,who=s.actor){
 if(s.finished||who!==s.actor||s.phase==='event')return [];
 const hand=s.players[who]?.hand||[],a=[];
 if(['attacking','adding','taking'].includes(s.phase)){
  for(const c of hand)if(canAdd(s,c))a.push({type:'attack',card:c});
  if(s.phase!=='attacking')a.push({type:'pass'});
 }
 if(s.phase==='defending'){
  for(let pair=0;pair<s.table.length;pair++)if(s.table[pair].defense==null)for(const c of hand)if(beats(c,s.table[pair].attack,s.trump))a.push({type:'defend',card:c,pair});
  a.push({type:'take'});
  if(s.options.variant==='transfer'&&s.table.every(p=>p.defense==null)){
   const to=next(s,who),n=s.table.length+1;
   if(to!==who&&n<=6&&n<=s.players[to].hand.length&&s.table.every(p=>card(p.attack).rank===card(s.table[0].attack).rank))for(const c of hand)if(card(c).rank===card(s.table[0].attack).rank)a.push({type:'transfer',card:c});
  }
 }
 return a;
}
function validation(s,who,a){if(!a||typeof a.type!=='string')return 'Неизвестное действие';if(who!==s.actor)return 'Сейчас ход другого участника';if(!legal(s,who).some(b=>b.type===a.type&&b.card===a.card&&b.pair===a.pair))return 'Ход невозможен: проверьте масть, достоинство, лимит и текущую роль';return null;}
function remove(s,i,c){const at=s.players[i].hand.indexOf(c);if(at<0)throw Error('Карты нет в руке');return s.players[i].hand.splice(at,1)[0];}
function retire(s){if(stockCount(s)===0)for(const p of s.players)if(!p.hand.length)p.out=true;}
function endIf(s){const live=active(s);if(live.length>1)return false;s.finished=true;s.phase='game_over';s.actor=-1;s.result={loser:live[0]??null,draw:live.length===0,escaped:s.players.map((p,i)=>p.out?i:-1).filter(i=>i>=0),rounds:s.round};log(s,live.length?'Дурак партии — '+s.players[live[0]].name:'Ничья: никто не остался с картами');return true;}
function beginEvent(s){
 if(!s.pending.length)return false;
 const recipient=s.pending.shift();if(!s.eventDeck.length){s.eventDeck=shuffle(s,s.eventDiscard.splice(0));if(s.eventDeck[0]===s.lastEvent&&s.eventDeck.length>1)[s.eventDeck[0],s.eventDeck[1]]=[s.eventDeck[1],s.eventDeck[0]];}
 const id=s.eventDeck.shift();s.event={id,recipient};s.phase='event';s.actor=recipient;s.transition.push('event_resolution');return true;
}
function resolve(s){
 const defender=s.defender;s.transition=['round_resolution'];
 const all=s.table.flatMap(p=>p.defense==null?[p.attack]:[p.attack,p.defense]);
 if(s.taking){s.players[defender].hand.push(...all);log(s,s.players[defender].name+' берёт '+all.length+' карт');}
 else{s.discard.push(...all);s.metrics.successfulDefenses.push(defender);log(s,'Бито: '+s.players[defender].name+' отбился');}
 s.table=[];s.transition.push('replenishment');
 const q=order(s,s.origin).filter(i=>i!==defender);q.push(defender);for(const i of q)if(!s.players[i].out)draw(s,i,Math.max(0,6-s.players[i].hand.length));
 s.nextCandidate=s.taking?next(s,defender):defender;retire(s);
 if(beginEvent(s))return;
 if(endIf(s))return;newRound(s,s.nextCandidate);
}
function chooseAdder(s){
 const candidates=adders(s).filter(i=>!s.passed.includes(i)&&s.players[i].hand.length>0);
 if(s.table.length>=s.limit||!candidates.length){resolve(s);return;}
 s.actor=candidates[0];s.phase=s.taking?'taking':'adding';
}
function apply(s,who,a){
 const error=validation(s,who,a);if(error)return {ok:false,error};
 s.sequence++;s.metrics.actions++;const name=s.players[who].name;
 switch(a.type){
 case 'attack':remove(s,who,a.card);s.table.push({attack:a.card,defense:null,from:who});s.passed=[];log(s,name+' '+(s.table.length>1?'подкидывает ':'атакует ')+label(a.card));if(s.taking){s.actor=who;chooseAdder(s);}else{s.actor=s.defender;s.phase='defending';}break;
 case 'defend':remove(s,who,a.card);s.table[a.pair].defense=a.card;log(s,name+' покрывает '+label(a.card));if(s.table.every(p=>p.defense!=null))chooseAdder(s);break;
 case 'transfer':remove(s,who,a.card);s.table.push({attack:a.card,defense:null,from:who});s.attacker=who;s.defender=next(s,who);s.limit=Math.min(6,s.players[s.defender].hand.length);s.actor=s.defender;s.passed=[];log(s,name+' переводит на '+s.players[s.defender].name);break;
 case 'take':s.taking=true;s.passed=[];log(s,name+' решил взять. Подкидывание ещё открыто');chooseAdder(s);break;
 case 'pass':s.passed.push(who);chooseAdder(s);break;
 }
 invariant(s);return {ok:true};
}
function label(c){const x=card(c);return RANKS[x.rank-6]+SUITS[x.suit];}
// Safe knowledge object: future stock and other hands are absent, not merely ignored.
function observation(s,who=s.actor){return {sequence:s.sequence,round:s.round,who,defender:s.defender,attacker:s.attacker,hand:s.players[who].hand.slice(),trump:s.trump,table:structuredClone(s.table),counts:s.players.map(p=>p.hand.length),out:s.players.map(p=>p.out),publicDiscard:s.discard.slice(),stock:stockCount(s),phase:s.phase,legal:legal(s,who),difficulty:s.options.difficulty,temperament:s.players[who].npc};}
function bot(v){
 if(!v.legal.length)return null;
 const cost=c=>card(c).rank+(card(c).suit===v.trump?20:0);
 const score=a=>{
  if(a.type==='pass')return 1000;
  if(a.type==='take')return 900;
  if(a.type==='transfer')return -10+cost(a.card)/10;
  let value=cost(a.card);
  let h=Math.imul(a.card+1,2654435761)^Math.imul(v.sequence+1,1597334677);h=Math.imul(h^(h>>>16),2246822507);const variation=((h^(h>>>13))>>>0)/4294967296;
  if(v.difficulty==='easy'||v.round>100)value=variation*40;else value+=variation*2;
  if(v.difficulty==='hard'){
   const matching=v.hand.filter(c=>card(c).rank===card(a.card).rank).length;value-=matching*2;
   if(v.stock===0)value-=card(a.card).rank*.7;
   const seen=v.publicDiscard.filter(c=>card(c).suit===card(a.card).suit&&card(c).rank>card(a.card).rank).length;value-=seen*.4;
  }
  if(a.type==='attack'&&v.phase!=='attacking'&&card(a.card).suit===v.trump&&v.hand.length>2){value+=60;if(v.difficulty!=='easy'&&v.stock>0)return 1100;}
  if(v.temperament===0&&card(a.card).suit===v.trump)value+=6;
  if(v.temperament===1&&a.type==='attack')value-=v.counts[v.defender]<=3?8:3;
  if(v.temperament===2&&v.stock<6)value-=card(a.card).rank*.35;
  if(v.temperament===3&&a.type==='attack')value-=card(a.card).rank*.6;
  if(v.temperament===4)value-=v.hand.filter(c=>card(c).rank===card(a.card).rank).length*1.5;
  return value;
 };
 return v.legal.slice().sort((a,b)=>score(a)-score(b))[0];
}
function invariant(s){
 const cards=[...s.deck.filter(ordinary),...s.players.flatMap(p=>p.hand),...s.discard,...s.effectDiscard,...s.table.flatMap(p=>p.defense==null?[p.attack]:[p.attack,p.defense])];
 if(cards.length!==36||new Set(cards).size!==36||!cards.every(ordinary))throw Error('Нарушен инвариант 36 карт');
 if(s.players.some(p=>p.out&&p.hand.length))throw Error('Вышедшему вернули карты');
 if(s.table.length>s.limit)throw Error('Нарушен лимит подкидывания');
 return true;
}
function restore(raw){const s=JSON.parse(typeof raw==='string'?raw:JSON.stringify(raw));if(s.version!==1||!Array.isArray(s.players)||![2,3,4].includes(s.players.length)||!Number.isInteger(s.rng)||!['attacking','defending','adding','taking','event','game_over'].includes(s.phase))throw Error('Неверный формат партии');if(s.players.some(p=>typeof p.name!=='string'||!validName(p.name)))throw Error('Неверное имя в партии');invariant(s);if(!s.finished&&(s.actor<0||s.actor>=s.players.length))throw Error('Неверный ход');return s;}
function validName(name){return typeof name==='string'&&/^[\p{L}]+(?:[\p{L} -]*[\p{L}])?$/u.test(name.trim())&&name.trim().length>=2&&name.trim().length<=24;}
return {SUITS,RANKS,card,label,ordinary,random,shuffle,beats,active,next,order,stockCount,start,legal,validation,apply,draw,retire,endIf,beginEvent,newRound,remove,log,invariant,observation,bot,restore,validName};
});
