const {test}=require('node:test'), assert=require('node:assert/strict');
const E=require('../src/game/engine'),F=require('../src/game/events');
for(let id=0;id<30;id++) for(const empty of [false,true]) {
  const variants = id===23?['draw','skip']:id===24?['swap','none']:id===25||id===26?['draw2','give']:[undefined];
  for(const choice of variants) test(`event ${id} ${choice||''} stock ${!empty}: trace preserves every card`,()=>{
    const s=E.start({seed:11,count:4,names:['Роман','Палыч','Санёк','Артём']});
    s.players.forEach((p,i)=>{p.hand=[i*3,i*3+1,i*3+2];p.out=false;p.skip=0;});
    s.deck=empty?[]:[12,13,14,15,16,17];
    s.discard=Array.from({length:36},(_,i)=>i).filter(c=>!s.players.some(p=>p.hand.includes(c))&&!s.deck.includes(c));
    s.effectDiscard=[];s.table=[];s.pending=[];s.event={id,recipient:1};s.phase='event';s.actor=1;s.nextCandidate=0;s.trump=3;
    const before=structuredClone(s), trace=structuredClone(s);
    const r=F.eventAction(s,{choice,target:2,card:3});assert.ok(r.ok);assert.ok(r.effects.length);
    for(const e of r.effects) if(e.type==='card'){
      const from=e.from==='stock'?trace.deck:trace.players[e.from].hand;
      assert.ok(from.includes(e.card),'trace cannot invent a card');
      from.splice(from.indexOf(e.card),1);
      (e.to==='effectDiscard'?trace.effectDiscard:trace.players[e.to].hand).push(e.card);
    }
    const sorted=a=>a.slice().sort((a,b)=>a-b);
    assert.deepEqual(trace.players.map(p=>sorted(p.hand)),s.players.map(p=>sorted(p.hand)));
    assert.deepEqual(trace.deck,s.deck);assert.deepEqual(sorted(trace.effectDiscard),sorted(s.effectDiscard));
    E.invariant(s);assert.equal(before.sequence+1,s.sequence);
    if(id===10&&!empty)assert.equal(r.effects.filter(e=>e.type==='card').length,2,'exchange has two directions');
    if(id===12)assert.equal(r.effects.filter(e=>e.type==='card').length,4,'circle visits all players');
  });
}
test('cancelled event reports a visible reason without moving cards',()=>{
 const s=E.start({count:3,seed:11});s.phase='event';s.event={id:2,recipient:1};
 s.discard.push(...s.players[1].hand);s.players[1].hand=[];s.players[1].out=true;s.pending=[];s.nextCandidate=0;
 const hands=s.players.map(p=>p.hand.slice()),rng=s.rng;
 const r=F.eventAction(s,{});assert.ok(r.ok);assert.deepEqual(r.effects,[{type:'noop',seat:1,reason:'cancelled'}]);
 assert.deepEqual(s.players.map(p=>p.hand),hands);assert.equal(s.rng,rng);E.invariant(s);
});
