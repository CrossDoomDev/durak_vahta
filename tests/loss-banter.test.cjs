const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/content/characters'),S=require('../src/game/save');
test('all defeat lines cycle without repeats, survive reload, and respect humor settings',()=>{
 let p=S.fresh(),previous=null;
 for(let cycle=0;cycle<4;cycle++){
  const seen=new Set();
  for(let i=0;i<C.lossTaunts.length;i++){
   const game=`loss-${cycle}-${i}`,line=C.lossBanter(p,game,'Роман','full');
   assert.ok(line.includes('Роман'));assert.ok(!seen.has(line));assert.notEqual(line,previous);
   seen.add(line);previous=line;
   assert.equal(C.lossBanter(p,game,'Роман','full'),line,'rerender keeps phrase');
   const before=structuredClone(p.lossBanter);p=S.validate(JSON.parse(JSON.stringify(p)));
   assert.deepEqual(p.lossBanter,before,'save/export/import preserves shuffle bag');
   assert.equal(C.lossBanter(p,game,'Роман','full'),line,'reload keeps phrase');
   const clean=C.lossBanter(p,game,'Нина','clean');
   assert.ok(clean.includes('Нина'));assert.ok(!/блядь|сука|пиздец|нахуй|дрочи/i.test(clean));
   assert.equal(C.lossBanter(p,game,'Нина','moderate'),clean);
  }
  assert.equal(seen.size,C.lossTaunts.length);
 }
});
test('old and malformed profiles get safe defeat quote state',()=>{
 const p=S.fresh();delete p.lossBanter;assert.equal(S.validate(p).lossBanter,null);
 for(const state of [{gameId:'x',choice:-1},{gameId:5,choice:0},{gameId:'x',choice:1000}]){
  p.lossBanter=state;assert.equal(S.validate(p).lossBanter,null);
 }
 p.lossBanter={gameId:'old',choice:99,remaining:[99,-1,0,0,2,'<x>']};
 const restored=S.validate(p);assert.doesNotThrow(()=>C.lossBanter(restored,'new','Роман'));
 assert.ok(restored.lossBanter.choice<C.lossTaunts.length);
});
